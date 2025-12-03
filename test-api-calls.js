#!/usr/bin/env node

/**
 * Debug API calls made by buttons
 */

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

    // Intercept ALL network requests
    const requests = [];
    page.on('request', (req) => {
      requests.push({
        method: req.method(),
        url: req.url(),
        postData: req.postData(),
      });
    });

    const responses = [];
    page.on('response', (res) => {
      responses.push({
        url: res.url(),
        status: res.status(),
        statusText: res.statusText(),
      });
    });

    console.log('📄 Loading page...');
    await page.goto(SERVER_URL, { waitUntil: 'networkidle2', timeout: 30000 });

    console.log('⏳ Waiting for app...');
    await page.waitForFunction(
      () => window.ActionRegistry && window.Pages && window.Utils,
      { timeout: 10000 }
    );

    console.log('✅ App loaded\n');

    // Get queue ID
    const queueId = await page.evaluate(() => {
      return Object.keys(window.Pages.Dashboard.queuesCache)[0];
    });

    console.log(`📋 Test Queue ID: ${queueId}\n`);

    // === TEST: INTERCEPT EDIT API CALL ===
    console.log('=== TEST: EDIT QUEUE ===');
    console.log('Clicking Edit button and monitoring API calls...\n');

    // Clear request list
    requests.length = 0;
    responses.length = 0;

    // Mock showPrompt to return value
    await page.evaluate(() => {
      window.Utils.showPrompt = function(...args) {
        if (args[0] === 'Edit Queue') {
          return Promise.resolve('renamed_' + Date.now());
        }
        return Promise.resolve('');
      };
    });

    // Click edit button
    await page.click('[data-action="dashboard-edit-queue"]');

    // Wait for API call
    await new Promise((r) => setTimeout(r, 2000));

    console.log('📤 API REQUESTS:');
    requests
      .filter((r) => r.url.includes('/api/'))
      .forEach((r) => {
        console.log(`  ${r.method} ${r.url}`);
        if (r.postData) {
          console.log(`    Body: ${r.postData}`);
        }
      });

    console.log('\n📥 API RESPONSES:');
    responses
      .filter((r) => r.url.includes('/api/'))
      .forEach((r) => {
        console.log(`  ${r.status} ${r.url}`);
      });

    // === TEST: GET QUEUE DATA ===
    console.log('\n=== TEST: CHECK API ENDPOINT ===');

    const testUrl = `/api/queues/${queueId}`;
    console.log(`Testing GET ${testUrl}...`);

    try {
      const response = await page.evaluate(async (url) => {
        const res = await fetch(url);
        return {
          status: res.status,
          statusText: res.statusText,
          body: await res.json(),
        };
      }, testUrl);

      if (response.status === 200) {
        console.log(`✅ API working: ${response.status}`);
        console.log(`   Queue: ${response.body.queue.name}`);
      } else {
        console.log(`❌ API error: ${response.status} ${response.statusText}`);
      }
    } catch (err) {
      console.log(`❌ Error: ${err.message}`);
    }

    // === TEST: DIRECT API CALL ===
    console.log('\n=== TEST: DIRECT PUT CALL ===');

    const updateUrl = `/api/queues/${queueId}`;
    console.log(`Testing PUT ${updateUrl}...`);

    try {
      const response = await page.evaluate(async (url, id) => {
        const res = await fetch(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'test_direct_call_' + Date.now() }),
        });

        const body = await res.json();
        return {
          status: res.status,
          statusText: res.statusText,
          bodyKeys: Object.keys(body),
          error: body.error,
        };
      }, updateUrl, queueId);

      console.log(`PUT Response: ${response.status} ${response.statusText}`);
      if (response.error) {
        console.log(`Error: ${response.error}`);
      } else {
        console.log(`✅ Success: Queue updated`);
      }
    } catch (err) {
      console.log(`❌ Error: ${err.message}`);
    }

  } catch (err) {
    console.error(`❌ Test error: ${err.message}`);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
}

runTests().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
