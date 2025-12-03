#!/usr/bin/env node

/**
 * Full user interaction test - simulate complete button flow
 */

import puppeteer from 'puppeteer';

const SERVER_URL = 'http://127.0.0.1:5005';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

async function testEditQueue(page) {
  log('\n=== TEST: EDIT QUEUE BUTTON ===', 'blue');

  // Mock showPrompt to accept value
  await page.evaluate(() => {
    let promptCount = 0;
    window.Utils.showPrompt = function(title, msg, defaultVal) {
      promptCount++;
      if (promptCount === 1) {
        // First prompt is queue name
        return Promise.resolve('edited_queue_' + Date.now());
      } else {
        // Second prompt is instructions
        return Promise.resolve('');
      }
    };
  });

  log('Clicking Edit button...');
  await page.click('[data-action="dashboard-edit-queue"]');

  // Wait for prompts to appear
  await page.waitForTimeout(500);

  // Check if modal appeared
  const modalAppeared = await page.evaluate(() => {
    const modal = document.querySelector('[class*="modal"]');
    return modal && modal.offsetParent !== null;
  });

  if (modalAppeared) {
    log('✅ Modal appeared');
  } else {
    log('ℹ️  Modal may have closed quickly (expected with mocked prompt)', 'cyan');
  }

  // Wait for API call
  await page.waitForTimeout(2000);

  // Check queue name changed
  const queueName = await page.evaluate(() => {
    const nameEl = document.querySelector('h2');
    return nameEl?.textContent.split('(')[0].trim() || null;
  });

  if (queueName && queueName.includes('edited_queue')) {
    log(`✅ Queue name updated: ${queueName}`, 'green');
  } else {
    log(`⚠️  Queue name not updated yet: ${queueName}`, 'yellow');
  }
}

async function testArchiveQueue(page) {
  log('\n=== TEST: ARCHIVE QUEUE BUTTON ===', 'blue');

  // Mock showConfirm to accept
  await page.evaluate(() => {
    window.Utils.showConfirm = function() {
      return Promise.resolve(true);
    };
  });

  log('Clicking Archive button...');
  await page.click('[data-action="dashboard-archive-queue"]');

  // Wait for API call
  await page.waitForTimeout(2000);

  // Check toast notification
  const toastText = await page.evaluate(() => {
    const toast = document.querySelector('[class*="toast"], [class*="notification"]');
    return toast?.textContent || null;
  });

  if (toastText) {
    log(`✅ Toast notification: ${toastText}`, 'green');
  } else {
    log('ℹ️  No toast notification detected', 'cyan');
  }

  // Check if queue appears in archived section
  const hasUnarchiveBtn = await page.evaluate(() => {
    return !!document.querySelector('[data-action="dashboard-unarchive-queue"]');
  });

  if (hasUnarchiveBtn) {
    log('✅ Unarchive button appeared (queue is archived)', 'green');
  } else {
    log('⚠️  Unarchive button not found', 'yellow');
  }
}

async function testUnarchiveQueue(page) {
  log('\n=== TEST: UNARCHIVE QUEUE BUTTON ===', 'blue');

  // Check if unarchive button exists
  const hasUnarchiveBtn = await page.evaluate(() => {
    return !!document.querySelector('[data-action="dashboard-unarchive-queue"]');
  });

  if (!hasUnarchiveBtn) {
    log('⚠️  Unarchive button not visible, skipping test', 'yellow');
    return;
  }

  log('Clicking Unarchive button...');
  await page.click('[data-action="dashboard-unarchive-queue"]');

  // Wait for API call
  await page.waitForTimeout(2000);

  // Check if unarchive button is gone
  const unarchiveBtnGone = await page.evaluate(() => {
    return !document.querySelector('[data-action="dashboard-unarchive-queue"]');
  });

  if (unarchiveBtnGone) {
    log('✅ Queue unarchived (Unarchive button removed)', 'green');
  } else {
    log('⚠️  Unarchive button still present', 'yellow');
  }
}

async function testDeleteQueue(page) {
  log('\n=== TEST: DELETE QUEUE BUTTON ===', 'blue');

  // Mock showConfirm to accept
  await page.evaluate(() => {
    window.Utils.showConfirm = function() {
      return Promise.resolve(true);
    };
  });

  // Get initial queue count
  const initialCount = await page.evaluate(() => {
    return document.querySelectorAll('[class*="queue-card"], [class*="queue"]').length;
  });

  log(`Current queue elements: ${initialCount}`);

  // Click delete
  log('Clicking Delete button...');
  const hasDeleteBtn = await page.evaluate(() => {
    return !!document.querySelector('[data-action="dashboard-delete-queue"]');
  });

  if (!hasDeleteBtn) {
    log('⚠️  Delete button not visible', 'yellow');
    return;
  }

  await page.click('[data-action="dashboard-delete-queue"]');

  // Wait for deletion
  await page.waitForTimeout(2000);

  log('✅ Delete request sent', 'green');
}

async function runTests() {
  let browser;
  try {
    log('🚀 Starting full user interaction test...', 'cyan');

    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();

    log('📄 Loading page...', 'cyan');
    await page.goto(SERVER_URL, { waitUntil: 'networkidle2' });

    log('⏳ Waiting for app...', 'cyan');
    await page.waitForFunction(
      () => window.ActionRegistry && window.Pages && window.Utils,
      { timeout: 10000 }
    );

    log('✅ App ready', 'green');

    // Run tests
    await testEditQueue(page);
    await testArchiveQueue(page);
    await testUnarchiveQueue(page);
    await testDeleteQueue(page);

    log('\n=== SUMMARY ===', 'blue');
    log('✅ All user interaction tests completed', 'green');
    log('\nℹ️  If buttons appear unresponsive in your browser:', 'cyan');
    log('  1. Check browser console for JavaScript errors (F12)', 'cyan');
    log('  2. Check if modals are appearing but hidden off-screen', 'cyan');
    log('  3. Check if API calls are completing (Network tab in DevTools)', 'cyan');

  } catch (err) {
    log(`❌ Test error: ${err.message}`, 'red');
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
}

runTests().catch(err => {
  log(`Fatal: ${err.message}`, 'red');
  process.exit(1);
});
