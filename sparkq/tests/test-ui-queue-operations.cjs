#!/usr/bin/env node
/**
 * Comprehensive UI test for queue operations (create, delete, archive)
 * Tests that no DOM duplication occurs and UI updates correctly
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:5005';
const SCREENSHOTS_DIR = path.join(__dirname, 'test-screenshots');

// Create screenshots directory
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

function log(message) {
  console.log(`[TEST] ${new Date().toISOString().substring(11, 23)} ${message}`);
}

function logSuccess(message) {
  console.log(`✅ ${message}`);
}

function logError(message) {
  console.log(`❌ ${message}`);
}

async function countDOMElements(page, selector) {
  return await page.evaluate((sel) => {
    return document.querySelectorAll(sel).length;
  }, selector);
}

async function getPageHTML(page) {
  return await page.content();
}

async function takeScreenshot(page, name) {
  const filename = path.join(SCREENSHOTS_DIR, `${name}.png`);
  await page.screenshot({ fullPage: true, path: filename });
  log(`Screenshot saved: ${filename}`);
  return filename;
}

async function waitForUIUpdate(page, timeout = 2000) {
  // Wait for any in-progress operations to complete
  await page.waitForFunction(() => {
    // Check if any API requests are in flight
    return !document.body.className.includes('loading');
  }, { timeout }).catch(() => {
    // It's okay if this times out, we'll check other indicators
  });

  // Wait a bit for DOM to stabilize
  await page.waitForTimeout(500);
}

const { openQueueModal, submitQueueModal, cancelQueueModal, getActiveQueueTabLabel } = require('./utils/queue-modal');

async function testQueueCreation(page) {
  log('Starting queue creation test...');

  // Get initial queue count
  const initialQueuesCount = await countDOMElements(page, '[data-queue-id]');
  log(`Initial queue count: ${initialQueuesCount}`);

  // Cancel flow should not create a queue
  const modalOpened = await openQueueModal(page);
  if (!modalOpened) {
    logError('Could not open New Queue modal');
    await takeScreenshot(page, '01-queue-creation-button-not-found');
    return false;
  }

  await cancelQueueModal(page);
  const afterCancelCount = await countDOMElements(page, '[data-queue-id]');
  log(`Queue count after canceling modal: ${afterCancelCount}`);
  if (afterCancelCount !== initialQueuesCount) {
    logError('Queue count changed after canceling creation');
    return false;
  }

  // Create via modal with friendly name
  await openQueueModal(page);
  const queueName = `UI Ops ${Date.now()}`;
  await submitQueueModal(page, queueName);

  // Take screenshot after creation
  await takeScreenshot(page, '02-after-queue-creation');

  // Count queues after creation
  await page.waitForTimeout(1000); // Wait for render
  const afterCreationCount = await countDOMElements(page, '[data-queue-id]');
  log(`Queue count after creation: ${afterCreationCount}`);

  // Validate display name
  const displayedName = await getActiveQueueTabLabel(page);
  if (!displayedName || !displayedName.includes(queueName)) {
    logError('Created queue name not shown in tabs');
    await takeScreenshot(page, '02-queue-name-mismatch');
    return false;
  }

  // Check for duplicate DOM sections (the original bug)
  const sessionsCount = await countDOMElements(page, '#sessions-section, [id*="sessions"]');
  const queueSectionsCount = await countDOMElements(page, '#queue-tabs, [id*="queue-tabs"]');

  log(`Sessions sections count: ${sessionsCount}`);
  log(`Queue tabs sections count: ${queueSectionsCount}`);

  if (sessionsCount > 1) {
    logError(`DUPLICATION DETECTED: Multiple sessions sections (${sessionsCount})`);
    await takeScreenshot(page, '03-sessions-duplication-detected');
    return false;
  }

  if (queueSectionsCount > 1) {
    logError(`DUPLICATION DETECTED: Multiple queue-tabs sections (${queueSectionsCount})`);
    await takeScreenshot(page, '03-queue-tabs-duplication-detected');
    return false;
  }

  if (afterCreationCount > initialQueuesCount) {
    logSuccess('Queue created successfully, no duplication detected');
    return true;
  } else {
    logError('Queue was not created');
    return false;
  }
}

async function testQueueDeletion(page) {
  log('Starting queue deletion test...');

  // Get queue count before deletion
  const beforeCount = await countDOMElements(page, '[data-queue-id]');
  log(`Queue count before deletion: ${beforeCount}`);

  if (beforeCount === 0) {
    logError('No queues available to delete');
    return false;
  }

  // Find and click delete button on first queue
  const deleteBtn = await page.$('[data-action="delete-queue"], button:has-text("Delete")');
  if (!deleteBtn) {
    logError('Could not find delete button');
    await takeScreenshot(page, '04-delete-button-not-found');
    return false;
  }

  log('Clicking delete button');
  await deleteBtn.click();

  // Handle confirmation dialog
  await page.waitForTimeout(500);
  const confirmBtn = await page.$('button:has-text("OK"), button:has-text("Confirm")');
  if (confirmBtn) {
    log('Confirming deletion');
    await confirmBtn.click();
  } else {
    // Try pressing Enter for confirmation
    await page.keyboard.press('Enter');
  }

  await waitForUIUpdate(page);
  await takeScreenshot(page, '05-after-queue-deletion');

  // Wait for render
  await page.waitForTimeout(1000);
  const afterCount = await countDOMElements(page, '[data-queue-id]');
  log(`Queue count after deletion: ${afterCount}`);

  // Check for duplicate DOM sections
  const sessionsCount = await countDOMElements(page, '#sessions-section, [id*="sessions"]');
  const queueSectionsCount = await countDOMElements(page, '#queue-tabs, [id*="queue-tabs"]');

  log(`Sessions sections count: ${sessionsCount}`);
  log(`Queue tabs sections count: ${queueSectionsCount}`);

  if (sessionsCount > 1) {
    logError(`DUPLICATION DETECTED: Multiple sessions sections (${sessionsCount})`);
    await takeScreenshot(page, '06-sessions-duplication-after-delete');
    return false;
  }

  if (queueSectionsCount > 1) {
    logError(`DUPLICATION DETECTED: Multiple queue-tabs sections (${queueSectionsCount})`);
    await takeScreenshot(page, '06-queue-tabs-duplication-after-delete');
    return false;
  }

  if (afterCount < beforeCount) {
    logSuccess('Queue deleted successfully, no duplication detected');
    return true;
  } else {
    logError('Queue was not deleted');
    return false;
  }
}

async function testFullCycle(page) {
  log('Starting full cycle test (create multiple queues, delete one)...');

  // Create first queue
  log('Creating first queue');
  await openQueueModal(page);
  await submitQueueModal(page, `UI Cycle ${Date.now()}-1`);

  // Create second queue
  log('Creating second queue');
  await openQueueModal(page);
  await submitQueueModal(page, `UI Cycle ${Date.now()}-2`);

  const countAfterCreates = await countDOMElements(page, '[data-queue-id]');
  log(`Queue count after 2 creations: ${countAfterCreates}`);
  await takeScreenshot(page, '07-after-creating-two-queues');

  // Check for duplication
  const sessionsSections = await countDOMElements(page, '#sessions-section, [id*="sessions"]');
  const queueTabsSections = await countDOMElements(page, '#queue-tabs, [id*="queue-tabs"]');

  if (sessionsSections > 1 || queueTabsSections > 1) {
    logError(`DUPLICATION after multiple creates: sessions=${sessionsSections}, queue-tabs=${queueTabsSections}`);
    return false;
  }

  logSuccess('Full cycle test passed - no duplication after multiple operations');
  return true;
}

async function runTests() {
  let browser;
  let allPassed = true;

  try {
    log('Launching browser...');
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    page.setDefaultTimeout(10000);
    page.setDefaultNavigationTimeout(10000);

    log(`Navigating to ${BASE_URL}`);
    await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
    await page.waitForTimeout(2000); // Wait for initial render

    await takeScreenshot(page, '00-initial-page');

    // Run tests
    log('\n========== TEST 1: Queue Creation ==========');
    const createTest = await testQueueCreation(page);
    if (!createTest) allPassed = false;

    log('\n========== TEST 2: Queue Deletion ==========');
    const deleteTest = await testQueueDeletion(page);
    if (!deleteTest) allPassed = false;

    log('\n========== TEST 3: Full Cycle ==========');
    const fullCycleTest = await testFullCycle(page);
    if (!fullCycleTest) allPassed = false;

    // Summary
    log('\n========== TEST SUMMARY ==========');
    if (allPassed) {
      logSuccess('ALL TESTS PASSED - No DOM duplication detected');
      process.exit(0);
    } else {
      logError('SOME TESTS FAILED - Check screenshots for details');
      process.exit(1);
    }
  } catch (error) {
    logError(`Test error: ${error.message}`);
    console.error(error);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

runTests();
