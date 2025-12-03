import puppeteer from 'puppeteer';
import { describe, test, beforeAll, afterAll, expect } from '@jest/globals';

describe('Agent Roles - Edit, Add, Delete Operations', () => {
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

  test('Edit button opens modal dialog', async () => {
    const consoleLogs = [];
    page.on('console', (msg) => {
      consoleLogs.push({ type: msg.type(), text: msg.text() });
      if (msg.text().includes('[DEBUG]')) {
        console.log(`[CONSOLE] ${msg.text()}`);
      }
    });

    const pageErrors = [];
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
      console.error(`[PAGE ERROR] ${err.message}`);
    });

    const baseUrl = process.env.SPARKQ_URL || 'http://localhost:5005';
    const url = `${baseUrl}/ui/?_=${Date.now()}`;
    console.log(`Navigating to: ${url}`);
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 20000,
    });

    // Wait for page to load and click settings button
    await page.waitForSelector('#settings-nav-btn', { timeout: 5000 });
    console.log('Clicking settings button...');
    await page.click('#settings-nav-btn');

    // Wait for agent roles tab to appear
    await page.waitForSelector('#agent-roles-tab', { timeout: 5000 });
    console.log('Clicking Agent Roles tab...');
    await page.click('#agent-roles-tab');

    // Wait for agent roles tab content to load
    await page.waitForSelector('.role-edit-btn', { timeout: 5000 });

    // Get the first edit button
    const editButtons = await page.$$('.role-edit-btn');
    console.log(`Found ${editButtons.length} edit buttons`);
    expect(editButtons.length).toBeGreaterThan(0);

    // Click the first edit button
    console.log('Clicking first edit button...');
    await editButtons[0].click();

    // Wait for modal to appear
    await page.waitForSelector('.modal-content', { timeout: 3000 }).catch(() => {
      console.log('Modal did not appear within timeout');
    });

    // Check if modal exists
    const modalExists = await page.$('.modal-content');
    if (modalExists) {
      console.log('✅ Modal appeared');
      const modalTitle = await page.$eval('.modal-title', (el) => el.textContent);
      console.log(`Modal title: ${modalTitle}`);
    } else {
      console.log('❌ Modal did not appear');
    }

    // Check console logs for our debug messages
    const debugLogs = consoleLogs.filter((log) => log.text.includes('[DEBUG]'));
    console.log(`Debug logs: ${debugLogs.length}`);
    debugLogs.forEach((log) => console.log(`  ${log.text}`));

    // Check page errors
    console.log(`Page errors: ${pageErrors.length}`);
    pageErrors.forEach((err) => console.log(`  ${err}`));

    expect(pageErrors).toHaveLength(0);
    expect(modalExists).not.toBeNull();
  });

  test('Delete button shows confirmation dialog', async () => {
    const consoleLogs = [];
    page.on('console', (msg) => {
      consoleLogs.push({ type: msg.type(), text: msg.text() });
      if (msg.text().includes('[DEBUG]')) {
        console.log(`[CONSOLE] ${msg.text()}`);
      }
    });

    const baseUrl = process.env.SPARKQ_URL || 'http://localhost:5005';
    await page.goto(`${baseUrl}/ui/?_=${Date.now()}`, {
      waitUntil: 'networkidle2',
      timeout: 20000,
    });

    // Click settings button
    await page.click('#settings-nav-btn');
    // Click Agent Roles tab
    await page.click('#agent-roles-tab');
    // Wait for agent roles tab to load
    await page.waitForSelector('.role-delete-btn', { timeout: 5000 });

    // Get the first delete button
    const deleteButtons = await page.$$('.role-delete-btn');
    console.log(`Found ${deleteButtons.length} delete buttons`);
    expect(deleteButtons.length).toBeGreaterThan(0);

    // Click the first delete button
    console.log('Clicking first delete button...');
    await deleteButtons[0].click();

    // Wait for confirmation dialog to appear
    await page.waitForSelector('.modal-content', { timeout: 3000 }).catch(() => {
      console.log('Confirmation dialog did not appear within timeout');
    });

    // Check if modal exists
    const modalExists = await page.$('.modal-content');
    if (modalExists) {
      console.log('✅ Confirmation dialog appeared');
      const modalTitle = await page.$eval('.modal-title', (el) => el.textContent);
      console.log(`Dialog title: ${modalTitle}`);
    } else {
      console.log('❌ Confirmation dialog did not appear');
    }

    expect(modalExists).not.toBeNull();
  });

  test('Activate/Deactivate button toggles role status', async () => {
    const baseUrl = process.env.SPARKQ_URL || 'http://localhost:5005';
    await page.goto(`${baseUrl}/ui/?_=${Date.now()}`, {
      waitUntil: 'networkidle2',
      timeout: 20000,
    });

    // Click settings button
    await page.click('#settings-nav-btn');
    // Click Agent Roles tab
    await page.click('#agent-roles-tab');
    // Wait for agent roles tab to load
    await page.waitForSelector('.role-toggle-btn', { timeout: 5000 });

    // Get initial button text
    const firstToggleBtn = await page.$('.role-toggle-btn');
    const initialText = await page.evaluate((btn) => btn.textContent, firstToggleBtn);
    console.log(`Initial toggle button text: ${initialText}`);

    // Click the toggle button
    console.log('Clicking toggle button...');
    await firstToggleBtn.click();

    // Wait for page to update
    await page.waitForTimeout(1000);

    // Check the button text changed
    const updatedText = await page.evaluate((btn) => btn.textContent, firstToggleBtn);
    console.log(`Updated toggle button text: ${updatedText}`);

    // Should have changed between Active/Deactivate
    expect(initialText).not.toBe(updatedText);
    expect(['Active', 'Deactivate', 'Activate'].includes(initialText)).toBe(true);
    expect(['Active', 'Deactivate', 'Activate'].includes(updatedText)).toBe(true);
  });
});
