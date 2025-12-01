import puppeteer from 'puppeteer';
import { describe, test, beforeAll, afterAll, expect } from '@jest/globals';

describe('Config page renders', () => {
  let browser;
  let page;

  beforeAll(async () => {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    page = await browser.newPage();
    await page.setCacheEnabled(false);
  });

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
  });

  test('loads tabs and core elements without JS errors', async () => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));

    const baseUrl = process.env.SPARKQ_URL || 'http://localhost:5005';
    await page.goto(`${baseUrl}/ui/#config?_=${Date.now()}`, {
      waitUntil: 'networkidle2',
      timeout: 20000,
    });

    await page.waitForSelector('.page-content', { timeout: 5000 });

    const configContainer = await page.$('#config-page');
    expect(configContainer).not.toBeNull();

    expect(errors).toHaveLength(0);
  });
});
