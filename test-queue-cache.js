#!/usr/bin/env node

import puppeteer from 'puppeteer';

const SERVER_URL = 'http://127.0.0.1:5005';

async function runTests() {
  let browser;
  try {
    console.log('🚀 Launching browser...');
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();

    console.log('📄 Loading page...');
    await page.goto(SERVER_URL, { waitUntil: 'networkidle2' });

    console.log('⏳ Waiting for app...');
    await page.waitForFunction(
      () => window.Pages && window.Pages.Dashboard,
      { timeout: 10000 }
    );

    console.log('✅ App loaded\n');

    // Inspect the dashboard state
    const dashboardState = await page.evaluate(() => {
      const dash = window.Pages.Dashboard;
      return {
        currentQueueId: dash.currentQueueId,
        queuesCacheType: typeof dash.queuesCache,
        queuesCacheIsArray: Array.isArray(dash.queuesCache),
        queuesCacheLength: dash.queuesCache ? dash.queuesCache.length : 0,
        queuesCacheKeys: Object.keys(dash.queuesCache || {}),
        firstQueueKeys: dash.queuesCache && dash.queuesCache[0] ? Object.keys(dash.queuesCache[0]) : null,
        firstQueue: dash.queuesCache && dash.queuesCache[0] ? {
          id: dash.queuesCache[0].id,
          name: dash.queuesCache[0].name,
          status: dash.queuesCache[0].status,
        } : null,
      };
    });

    console.log('📊 Dashboard State:');
    console.log(JSON.stringify(dashboardState, null, 2));

    // Check how button gets queue ID
    const buttonInfo = await page.evaluate(() => {
      const editBtn = document.querySelector('[data-action="dashboard-edit-queue"]');
      if (!editBtn) return { buttonFound: false };

      return {
        buttonFound: true,
        dataQueueId: editBtn.dataset.queueId,
        dataQueueIdType: typeof editBtn.dataset.queueId,
        getAttribute: editBtn.getAttribute('data-queue-id'),
      };
    });

    console.log('\n🔘 Edit Button Info:');
    console.log(JSON.stringify(buttonInfo, null, 2));

    // Now test clicking the button with proper logging
    console.log('\n🔍 Testing handler call:');

    const handlerResult = await page.evaluate(() => {
      const editBtn = document.querySelector('[data-action="dashboard-edit-queue"]');
      const queueId = editBtn?.dataset?.queueId;
      const handler = window.ActionRegistry['dashboard-edit-queue'];

      console.log(`Button queue ID: ${queueId}`);
      console.log(`Handler exists: ${typeof handler === 'function'}`);

      if (handler && queueId) {
        try {
          // Call handler with button
          handler(editBtn);
          return { success: true, queueId };
        } catch (err) {
          return { success: false, error: err.message, queueId };
        }
      }

      return { success: false, reason: `No handler or queueId`, queueId };
    });

    console.log('\n📝 Handler Result:');
    console.log(JSON.stringify(handlerResult, null, 2));

  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
}

runTests().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
