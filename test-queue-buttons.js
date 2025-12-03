#!/usr/bin/env node

/**
 * SparkQueue Button Functionality Test
 * Tests Edit, Archive, Delete, and Unarchive buttons using Puppeteer
 */

import puppeteer from 'puppeteer';
import assert from 'assert';

const SERVER_URL = 'http://127.0.0.1:5005';
const TEST_TIMEOUT = 30000;

// Color output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function success(message) {
  log(`✅ ${message}`, 'green');
}

function error(message) {
  log(`❌ ${message}`, 'red');
}

function info(message) {
  log(`ℹ️  ${message}`, 'cyan');
}

function warn(message) {
  log(`⚠️  ${message}`, 'yellow');
}

async function runTests() {
  let browser;
  let page;

  try {
    info('Launching Puppeteer browser...');
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    page = await browser.newPage();

    // Enable console message logging
    page.on('console', (msg) => {
      const location = msg.location();
      const prefix = location ? ` [${location.url}:${location.lineNumber}]` : '';
      console.log(`[Browser] ${msg.type().toUpperCase()}${prefix}: ${msg.text()}`);
    });

    // Log page errors
    page.on('error', (err) => {
      error(`Page error: ${err.message}`);
    });

    // Log uncaught exceptions
    page.on('pageerror', (err) => {
      error(`Uncaught exception: ${err.message}`);
    });

    info(`Navigating to ${SERVER_URL}...`);
    await page.goto(SERVER_URL, { waitUntil: 'networkidle2', timeout: TEST_TIMEOUT });
    success('Page loaded');

    // Wait for app to fully load
    info('Waiting for app initialization...');
    await page.waitForFunction(
      () => window.ActionRegistry && window.Pages && window.Utils,
      { timeout: TEST_TIMEOUT }
    );
    success('App initialized');

    // Check if action registry has queue actions
    info('Checking action registry...');
    const actions = await page.evaluate(() => {
      return {
        actionRegistry: Object.keys(window.ActionRegistry || {}),
        hasEditAction: typeof window.ActionRegistry?.['dashboard-edit-queue'] === 'function',
        hasArchiveAction: typeof window.ActionRegistry?.['dashboard-archive-queue'] === 'function',
        hasDeleteAction: typeof window.ActionRegistry?.['dashboard-delete-queue'] === 'function',
        hasUnarchiveAction: typeof window.ActionRegistry?.['dashboard-unarchive-queue'] === 'function',
      };
    });

    if (actions.hasEditAction && actions.hasArchiveAction && actions.hasDeleteAction) {
      success('All queue action handlers registered');
    } else {
      error('Missing action handlers!');
      error(`Has Edit: ${actions.hasEditAction}`);
      error(`Has Archive: ${actions.hasArchiveAction}`);
      error(`Has Delete: ${actions.hasDeleteAction}`);
      error(`Has Unarchive: ${actions.hasUnarchiveAction}`);
      error(`Available actions: ${actions.actionRegistry.join(', ')}`);
    }

    // Get queue info from page
    info('Extracting queue information from page...');
    const queueInfo = await page.evaluate(() => {
      const dash = window.Pages.Dashboard;
      return {
        currentQueueId: dash?.currentQueueId,
        queuesCache: Object.keys(dash?.queuesCache || {}),
        firstQueue: Object.entries(dash?.queuesCache || {})[0],
      };
    });

    if (!queueInfo.firstQueue) {
      error('No queues found in cache!');
      process.exit(1);
    }

    const [queueId, queueData] = queueInfo.firstQueue;
    success(`Found queue: ${queueData.name} (${queueId})`);
    info(`Queue status: ${queueData.status}`);

    // Check if buttons are visible
    info('Checking button visibility...');
    const buttonInfo = await page.evaluate(() => {
      const editBtn = document.querySelector('[data-action="dashboard-edit-queue"]');
      const archiveBtn = document.querySelector('[data-action="dashboard-archive-queue"]');
      const deleteBtn = document.querySelector('[data-action="dashboard-delete-queue"]');
      const unarchiveBtn = document.querySelector('[data-action="dashboard-unarchive-queue"]');

      return {
        editBtnExists: !!editBtn,
        editBtnVisible: editBtn ? editBtn.offsetParent !== null : false,
        editBtnDisabled: editBtn?.disabled || false,
        editBtnInDOM: !!editBtn,
        archiveBtnExists: !!archiveBtn,
        archiveBtnVisible: archiveBtn ? archiveBtn.offsetParent !== null : false,
        deleteBtnExists: !!deleteBtn,
        deleteBtnVisible: deleteBtn ? deleteBtn.offsetParent !== null : false,
        unarchiveBtnExists: !!unarchiveBtn,
        unarchiveBtnVisible: unarchiveBtn ? unarchiveBtn.offsetParent !== null : false,
      };
    });

    if (buttonInfo.editBtnExists && buttonInfo.editBtnVisible) {
      success('Edit button is visible and clickable');
    } else {
      error('Edit button issue:');
      error(`  - Exists in DOM: ${buttonInfo.editBtnInDOM}`);
      error(`  - Visible: ${buttonInfo.editBtnVisible}`);
      error(`  - Disabled: ${buttonInfo.editBtnDisabled}`);
    }

    if (buttonInfo.archiveBtnExists && buttonInfo.archiveBtnVisible) {
      success('Archive button is visible and clickable');
    } else {
      warn('Archive button not visible');
    }

    if (buttonInfo.deleteBtnExists && buttonInfo.deleteBtnVisible) {
      success('Delete button is visible and clickable');
    } else {
      warn('Delete button not visible');
    }

    // === TEST 1: CLICK EDIT BUTTON ===
    log('\n=== TEST 1: CLICK EDIT BUTTON ===', 'blue');

    info('Clicking Edit button...');

    // Set up promise to detect dialog/modal
    const modalPromise = page.evaluate(() => {
      return new Promise((resolve) => {
        const checkModal = () => {
          const modal = document.querySelector('[id*="modal"], [class*="modal"], [class*="dialog"]');
          const prompt = document.querySelector('input, textarea');
          if (modal || prompt) {
            resolve({ modal: !!modal, prompt: !!prompt });
            return;
          }
          setTimeout(checkModal, 100);
        };
        setTimeout(checkModal, 0);
      });
    });

    // Click the edit button
    await page.click('[data-action="dashboard-edit-queue"]');

    // Wait for modal/prompt
    let modalDetected = false;
    try {
      const result = await Promise.race([
        modalPromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Modal timeout')), 5000)
        ),
      ]);
      modalDetected = result.modal || result.prompt;
      success(`Modal/Dialog detected: ${modalDetected}`);
    } catch (err) {
      warn(`No modal appeared within 5 seconds: ${err.message}`);
    }

    // Check for console errors
    info('Checking for JavaScript errors...');
    const hasErrors = await page.evaluate(() => {
      return window.__pageErrors || [];
    });

    // === TEST 2: DIRECT HANDLER CALL ===
    log('\n=== TEST 2: DIRECT HANDLER CALL ===', 'blue');

    info('Calling handler directly via JavaScript...');
    try {
      const result = await page.evaluate(() => {
        return new Promise((resolve, reject) => {
          try {
            // Get handler
            const handler = window.ActionRegistry['dashboard-edit-queue'];
            if (!handler) {
              return reject(new Error('Handler not found in ActionRegistry'));
            }

            // Get queue ID from first queue
            const queueId = Object.keys(window.Pages.Dashboard.queuesCache)[0];
            if (!queueId) {
              return reject(new Error('No queue ID found'));
            }

            // Create mock element
            const mockElement = { dataset: { queueId } };

            // Call handler
            handler(mockElement, null);

            // Wait for modal to appear
            setTimeout(() => {
              const modal = document.querySelector('[id*="modal"], [class*="modal"]');
              const input = document.querySelector('input[type="text"], textarea');
              resolve({
                modalVisible: !!modal && modal.offsetParent !== null,
                inputVisible: !!input && input.offsetParent !== null,
                handler: 'Called successfully',
              });
            }, 500);
          } catch (err) {
            reject(err);
          }
        });
      });

      success(`Direct handler call result: ${JSON.stringify(result)}`);
    } catch (err) {
      error(`Direct handler call failed: ${err.message}`);
    }

    // === TEST 3: CHECK MODAL SYSTEM ===
    log('\n=== TEST 3: CHECK MODAL SYSTEM ===', 'blue');

    info('Testing Utils.showPrompt() directly...');
    try {
      const modalResult = await page.evaluate(() => {
        return new Promise((resolve) => {
          window.Utils.showPrompt('Test Prompt', 'Does this work?', 'test')
            .then((result) => {
              resolve({ success: true, result, error: null });
            })
            .catch((err) => {
              resolve({ success: false, result: null, error: err.message });
            });
        });
      });

      if (modalResult.success) {
        success('Modal system is working');
        success(`Prompt returned: ${modalResult.result}`);
      } else {
        error('Modal system failed:');
        error(`  Error: ${modalResult.error}`);
      }
    } catch (err) {
      error(`Modal system test error: ${err.message}`);
    }

    // === TEST 4: API TEST ===
    log('\n=== TEST 4: TEST API DIRECTLY ===', 'blue');

    info('Testing API.PUT directly...');
    try {
      const queueId = Object.keys(queueInfo.queuesCache)[0];
      const apiResult = await page.evaluate((id) => {
        return window.API.PUT(`/api/queues/${id}`, { name: 'test_rename' })
          .then(() => ({ success: true }))
          .catch((err) => ({ success: false, error: err.message || String(err) }));
      }, queueId);

      if (apiResult.success) {
        success('API.PUT works correctly');
      } else {
        error(`API.PUT failed: ${apiResult.error}`);
      }
    } catch (err) {
      error(`API test error: ${err.message}`);
    }

    // === TEST 5: CHECK FOR SILENT ERRORS ===
    log('\n=== TEST 5: CHECK FOR SILENT ERRORS ===', 'blue');

    info('Checking for unhandled errors...');
    const errors = await page.evaluate(() => {
      return {
        consoleErrors: window.__consoleErrors || [],
        unhandledRejections: window.__unhandledRejections || [],
        pageHasError: !!document.querySelector('[class*="error"]'),
      };
    });

    if (errors.consoleErrors.length > 0) {
      error(`Found ${errors.consoleErrors.length} console errors`);
      errors.consoleErrors.forEach((err) => error(`  - ${err}`));
    } else {
      success('No console errors detected');
    }

    if (errors.unhandledRejections.length > 0) {
      error(`Found ${errors.unhandledRejections.length} unhandled rejections`);
      errors.unhandledRejections.forEach((err) => error(`  - ${err}`));
    } else {
      success('No unhandled promise rejections');
    }

    // === SUMMARY ===
    log('\n=== TEST SUMMARY ===', 'blue');
    success('All tests completed');

    // Take screenshot
    const screenshotPath = '/tmp/sparkqueue-test-screenshot.png';
    await page.screenshot({ path: screenshotPath, fullPage: true });
    info(`Screenshot saved: ${screenshotPath}`);

  } catch (err) {
    error(`Test failed with error: ${err.message}`);
    error(err.stack);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

runTests().catch((err) => {
  error(`Test execution failed: ${err.message}`);
  process.exit(1);
});
