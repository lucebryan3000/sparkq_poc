import puppeteer from 'puppeteer';
import { describe, test, beforeAll, afterAll, expect } from '@jest/globals';

describe('Dashboard rendering', () => {
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

  test('renders core dashboard sections without console errors', async () => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));

    const baseUrl = process.env.SPARKQ_URL || 'http://localhost:5005';
    await page.goto(`${baseUrl}/ui/?_=${Date.now()}`, {
      waitUntil: 'networkidle2',
      timeout: 20000,
    });

    // Ensure main layout renders
    const selectors = [
      'header.app-header',
      'nav#nav-menu',
      '#app',
      '#dashboard-page',
    ];
    for (const selector of selectors) {
      const exists = await page.$(selector);
      expect(exists).not.toBeNull();
    }

    expect(errors).toHaveLength(0);
  });
});
