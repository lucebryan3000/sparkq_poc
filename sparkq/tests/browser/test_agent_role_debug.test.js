import puppeteer from 'puppeteer';
import { describe, test, beforeAll, afterAll, expect } from '@jest/globals';

describe('Agent Role Debug - Check page loading and DOM', () => {
  let browser;
  let page;

  beforeAll(async () => {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
    });
    page = await browser.newPage();
    await page.setCacheEnabled(false);
  });

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
  });

  test('Debug page load and check for quick-add component', async () => {
    const errors = [];
    const consoleMessages = [];

    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => consoleMessages.push(msg.text()));

    const baseUrl = process.env.SPARKQ_URL || 'http://127.0.0.1:5005';
    const response = await page.goto(`${baseUrl}/ui/?_=${Date.now()}`, {
      waitUntil: 'networkidle2',
      timeout: 20000,
    });

    console.log('Page loaded with status:', response?.status());

    // Wait for content to render
    await page.waitForTimeout(2000);

    // Check what elements are present
    const debugInfo = await page.evaluate(() => {
      return {
        hasHeader: !!document.querySelector('header.app-header'),
        hasApp: !!document.querySelector('#app'),
        hasDashboard: !!document.querySelector('#dashboard-page'),
        hasQuickAdd: !!document.getElementById('quick-add-bar'),
        agentRoleLabel: document.querySelector('label[for="agent-role-select"]')?.textContent,
        allLabels: Array.from(document.querySelectorAll('label')).map(l => l.textContent.trim()),
        windowQuickAdd: typeof window.QuickAdd,
        windowGlobals: Object.keys(window).filter(k => k.startsWith('__SPARKQ')),
      };
    });

    console.log('Debug info:', JSON.stringify(debugInfo, null, 2));
    console.log('Page errors:', errors);
    console.log('Console messages (sample):', consoleMessages.slice(0, 10));

    // Check basic structure
    expect(debugInfo.hasApp).toBe(true);
    expect(debugInfo.hasHeader).toBe(true);
  });

  test('Check if API errors occur during load', async () => {
    const apiCalls = [];
    const apiErrors = [];

    page.on('response', (res) => {
      if (res.url().includes('/api/')) {
        apiCalls.push({
          url: res.url(),
          status: res.status(),
          ok: res.ok(),
        });
        if (!res.ok()) {
          apiErrors.push({
            url: res.url(),
            status: res.status(),
          });
        }
      }
    });

    const baseUrl = process.env.SPARKQ_URL || 'http://127.0.0.1:5005';
    await page.goto(`${baseUrl}/ui/?_=${Date.now()}`, {
      waitUntil: 'networkidle2',
      timeout: 20000,
    });

    // Wait for all async API calls to complete
    await page.waitForTimeout(2000);

    console.log('API calls made:');
    apiCalls.forEach(call => {
      console.log(`  ${call.status} ${call.url}`);
    });

    if (apiErrors.length > 0) {
      console.log('\nAPI errors:');
      apiErrors.forEach(err => {
        console.log(`  ${err.status} ${err.url}`);
      });
    }

    expect(apiErrors).toHaveLength(0);
  });
});
