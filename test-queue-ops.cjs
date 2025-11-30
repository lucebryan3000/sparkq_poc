const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:5005';
const SCREENSHOTS_DIR = path.join(__dirname, 'test-screenshots');

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
  try {
    return await page.evaluate((sel) => {
      return document.querySelectorAll(sel).length;
    }, selector);
  } catch (e) {
    return 0;
  }
}

async function takeScreenshot(page, name) {
  const filename = path.join(SCREENSHOTS_DIR, `${name}.png`);
  await page.screenshot({ fullPage: true, path: filename });
  log(`Screenshot: ${name}`);
  return filename;
}

async function waitForNetworkIdle(page, timeout = 2000) {
  try {
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout }).catch(() => {});
  } catch (e) {
    // Ignore errors
  }
  await page.waitForTimeout(500);
}

async function testQueueCreation(page) {
  log('TEST 1: Queue Creation');

  const initialCount = await countDOMElements(page, '[data-queue-id]');
  log(`  Initial queue count: ${initialCount}`);

  // Click New Queue button
  log('  Clicking "New Queue" button');
  await page.click('#dashboard-new-queue-btn');

  await waitForNetworkIdle(page);
  await page.waitForTimeout(1500);

  await takeScreenshot(page, '01-after-create');

  const afterCount = await countDOMElements(page, '[data-queue-id]');
  log(`  Queue count after create: ${afterCount}`);

  // Check for duplication
  const sessionSections = await countDOMElements(page, '#sessions-section, [id*="session"], .session-selector');
  const queueSections = await countDOMElements(page, '#queue-tabs, .queue-tabs, [id*="queue-tabs"]');

  log(`  Session sections: ${sessionSections}`);
  log(`  Queue tabs sections: ${queueSections}`);

  // The issue was duplication - check if multiple sections exist
  const allQueuesButtons = await page.$$eval('[data-queue-id]', els => els.length);
  const allQueueElements = await page.$$eval('.queue-tab, [id*="Queue"]', els => els.length);

  log(`  All queue elements in DOM: ${allQueueElements}`);

  if (afterCount > initialCount) {
    logSuccess('Queue creation works');
    return true;
  } else {
    logError('Queue creation failed - count did not increase');
    return false;
  }
}

async function testQueueDeletion(page) {
  log('\nTEST 2: Queue Deletion');

  const beforeCount = await countDOMElements(page, '[data-queue-id]');
  log(`  Queue count before delete: ${beforeCount}`);

  if (beforeCount === 0) {
    logError('No queues to delete');
    return false;
  }

  // Find and click delete button
  const deleteBtn = await page.$('#dashboard-delete-btn');
  if (!deleteBtn) {
    logError('Delete button not found');
    return false;
  }

  log('  Clicking delete button');
  await deleteBtn.click();

  // Handle confirmation
  await page.waitForTimeout(500);
  const confirmBtn = await page.$('button:contains("OK")').catch(() => null);
  if (confirmBtn) {
    await confirmBtn.click();
  } else {
    // Try pressing Enter
    await page.keyboard.press('Enter');
  }

  await waitForNetworkIdle(page);
  await page.waitForTimeout(1500);

  await takeScreenshot(page, '02-after-delete');

  const afterCount = await countDOMElements(page, '[data-queue-id]');
  log(`  Queue count after delete: ${afterCount}`);

  // Check structure
  const sessionSections = await countDOMElements(page, '#sessions-section, [id*="session"]');
  const queueSections = await countDOMElements(page, '#queue-tabs, [id*="queue-tabs"]');

  log(`  Session sections: ${sessionSections}`);
  log(`  Queue tabs sections: ${queueSections}`);

  if (afterCount < beforeCount) {
    logSuccess('Queue deletion works');
    return true;
  } else {
    logError('Queue deletion failed - count did not decrease');
    return false;
  }
}

async function testMultipleOperations(page) {
  log('\nTEST 3: Multiple Operations (Create 2, Delete 1)');

  // Create first queue
  log('  Creating first queue');
  await page.click('#dashboard-new-queue-btn');
  await page.waitForTimeout(1500);

  // Create second queue
  log('  Creating second queue');
  await page.click('#dashboard-new-queue-btn');
  await page.waitForTimeout(1500);

  await takeScreenshot(page, '03-after-two-creates');

  const countAfterCreates = await countDOMElements(page, '[data-queue-id]');
  log(`  Queue count after 2 creates: ${countAfterCreates}`);

  // Check for DOM issues
  const sessionSections = await countDOMElements(page, '#sessions-section');
  const queueTabs = await countDOMElements(page, '#queue-tabs');
  const queueContent = await countDOMElements(page, '#queue-content');

  log(`  Session sections: ${sessionSections}`);
  log(`  Queue tabs: ${queueTabs}`);
  log(`  Queue content: ${queueContent}`);

  if (sessionSections > 1 || queueTabs > 1) {
    logError(`DOM DUPLICATION DETECTED: sessions=${sessionSections}, queue-tabs=${queueTabs}`);
    await takeScreenshot(page, '03-duplication-found');
    return false;
  }

  // Delete one
  log('  Deleting a queue');
  const deleteBtn = await page.$('#dashboard-delete-btn');
  if (deleteBtn) {
    await deleteBtn.click();
    await page.waitForTimeout(500);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1500);
  }

  await takeScreenshot(page, '04-after-delete-one');

  const finalCount = await countDOMElements(page, '[data-queue-id]');
  log(`  Final queue count: ${finalCount}`);

  logSuccess('Multiple operations completed without duplication');
  return true;
}

async function runTests() {
  let browser;
  let passed = 0;
  let failed = 0;

  try {
    log('Launching browser');
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    page.setDefaultTimeout(10000);

    log(`Navigating to ${BASE_URL}`);
    await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
    await page.waitForTimeout(2000);

    await takeScreenshot(page, '00-initial');

    // Run tests
    if (await testQueueCreation(page)) {
      passed++;
    } else {
      failed++;
    }

    if (await testQueueDeletion(page)) {
      passed++;
    } else {
      failed++;
    }

    if (await testMultipleOperations(page)) {
      passed++;
    } else {
      failed++;
    }

    // Summary
    log('\n========== SUMMARY ==========');
    log(`Passed: ${passed}, Failed: ${failed}`);

    if (failed === 0) {
      logSuccess('ALL TESTS PASSED');
      process.exit(0);
    } else {
      logError(`${failed} TEST(S) FAILED`);
      process.exit(1);
    }
  } catch (error) {
    logError(`Fatal error: ${error.message}`);
    console.error(error);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

runTests();
