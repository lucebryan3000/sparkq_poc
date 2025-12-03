import puppeteer from 'puppeteer';
import { describe, test, beforeAll, afterAll, expect } from '@jest/globals';

describe('Agent Roles - Debug Tab Navigation', () => {
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

  test('Check if agent-roles tab loads content', async () => {
    const consoleLogs = [];
    page.on('console', (msg) => {
      const text = msg.text();
      consoleLogs.push(text);
      console.log(`[CONSOLE] ${text}`);
    });

    const pageErrors = [];
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
      console.error(`[PAGE ERROR] ${err.message}`);
    });

    const baseUrl = process.env.SPARKQ_URL || 'http://localhost:5005';
    const url = `${baseUrl}/ui/#config/agent-roles?_=${Date.now()}`;
    console.log(`Navigating to: ${url}`);

    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 20000,
    });

    // Wait for page to settle
    await page.waitForTimeout(2000);

    // Check what's on the page
    const pageContent = await page.content();
    console.log(`Page contains "Agent Roles": ${pageContent.includes('Agent Roles')}`);
    console.log(`Page contains "role-edit-btn": ${pageContent.includes('role-edit-btn')}`);
    console.log(`Page contains "role-delete-btn": ${pageContent.includes('role-delete-btn')}`);

    // Check if settings page exists
    const settingsPage = await page.$('#settings-page');
    console.log(`Settings page exists: ${!!settingsPage}`);

    // Get all tab elements
    const tabs = await page.$$('[data-tablist] [role="tab"]');
    console.log(`Found ${tabs.length} tab buttons`);

    for (let i = 0; i < tabs.length; i++) {
      const tabText = await page.evaluate((el) => el.textContent, tabs[i]);
      const tabTarget = await page.evaluate((el) => el.getAttribute('data-tab-target'), tabs[i]);
      const isActive = await page.evaluate((el) => el.getAttribute('aria-selected'), tabs[i]);
      console.log(`  Tab ${i}: "${tabText}" target="${tabTarget}" active="${isActive}"`);
    }

    // Check tab content
    const tabContent = await page.$('#tab-content');
    console.log(`Tab content div exists: ${!!tabContent}`);

    if (tabContent) {
      const content = await page.evaluate((el) => el.textContent.substring(0, 200), tabContent);
      console.log(`Tab content (first 200 chars): ${content}`);
    }

    // Try clicking the agent-roles tab directly
    const agentRolesTab = await page.$('[data-tab-target="agent-roles"]');
    if (agentRolesTab) {
      console.log('Found agent-roles tab, clicking it...');
      await agentRolesTab.click();
      await page.waitForTimeout(2000);

      // Check again
      const updatedContent = await page.$('#tab-content');
      if (updatedContent) {
        const text = await page.evaluate((el) => el.textContent.substring(0, 200), updatedContent);
        console.log(`After clicking, tab content: ${text}`);
      }
    } else {
      console.log('Agent-roles tab not found!');
    }

    // Final check for edit buttons
    const editButtons = await page.$$('.role-edit-btn');
    console.log(`Edit buttons found: ${editButtons.length}`);

    console.log(`\nPage errors: ${pageErrors.length}`);
    pageErrors.forEach((err) => console.log(`  ${err}`));
  });
});
