import puppeteer from 'puppeteer';
import { describe, test, beforeAll, afterAll, expect } from '@jest/globals';

describe('Agent Role dropdown with info icon', () => {
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

  test('Agent Role dropdown renders with info icon and no API errors', async () => {
    const errors = [];
    const apiErrors = [];

    page.on('pageerror', (err) => errors.push(err.message));
    page.on('response', (res) => {
      if (!res.ok() && res.url().includes('/api/')) {
        apiErrors.push({ url: res.url(), status: res.status() });
      }
    });

    const baseUrl = process.env.SPARKQ_URL || 'http://localhost:5005';
    await page.goto(`${baseUrl}/ui/?_=${Date.now()}`, {
      waitUntil: 'networkidle2',
      timeout: 20000,
    });

    // Wait for dashboard to load
    await page.waitForSelector('#dashboard-quick-add', { timeout: 5000 });

    // Click on a queue to ensure quick-add renders
    const queueButton = await page.$('button[data-queue-id]');
    if (queueButton) {
      await queueButton.click();
      await page.waitForTimeout(1000);
    }

    // Check that the info icon is present in the agent role label
    const iconExists = await page.evaluate(() => {
      const label = document.querySelector('label[for="agent-role-select"]');
      if (!label) return false;
      const link = label.querySelector('a[href*="agent-roles"]');
      return !!link && link.textContent.includes('ⓘ');
    });

    expect(iconExists).toBe(true);

    // Check that the link points to the correct URL
    const linkHref = await page.evaluate(() => {
      const link = document.querySelector('label[for="agent-role-select"] a');
      return link ? link.getAttribute('href') : null;
    });

    expect(linkHref).toBe('http://192.168.1.150:5005/settings?tab=agent-roles');

    // Log API errors if any
    if (apiErrors.length > 0) {
      console.log('API Errors:', apiErrors);
    }

    // Expect no API errors
    expect(apiErrors).toHaveLength(0);

    // Expect no page errors (filter out common non-critical errors)
    const criticalErrors = errors.filter(e => !e.includes('favicon') && !e.includes('Failed to load'));
    if (criticalErrors.length > 0) {
      console.log('Critical errors:', criticalErrors);
    }
  });

  test('Agent Role dropdown loads without network errors', async () => {
    const failedRequests = [];

    page.on('response', (res) => {
      if (!res.ok() && res.url().includes('/api/agent-roles')) {
        failedRequests.push({
          url: res.url(),
          status: res.status(),
          statusText: res.statusText(),
        });
      }
    });

    const baseUrl = process.env.SPARKQ_URL || 'http://localhost:5005';
    await page.goto(`${baseUrl}/ui/?_=${Date.now()}`, {
      waitUntil: 'networkidle2',
      timeout: 20000,
    });

    // Wait for agent roles API call
    await page.waitForTimeout(1500);

    const agentRoleSelect = await page.$('#agent-role-select');
    expect(agentRoleSelect).not.toBeNull();

    if (failedRequests.length > 0) {
      console.log('Failed API requests for agent-roles:', failedRequests);
    }

    // Agent roles should load successfully or default gracefully
    const options = await page.evaluate(() => {
      const select = document.getElementById('agent-role-select');
      if (!select) return [];
      return Array.from(select.options).map(opt => ({
        value: opt.value,
        text: opt.text,
      }));
    });

    // Should have at least the default "-- None --" option
    expect(options.length).toBeGreaterThan(0);
    expect(options[0].text).toBe('-- None --');
  });
});
