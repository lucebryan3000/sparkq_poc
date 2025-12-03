import puppeteer from 'puppeteer';
import { describe, test, beforeAll, afterAll, expect } from '@jest/globals';

describe('QuickAdd component with Agent Role info icon', () => {
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

  test('QuickAdd renders Agent Role label with info icon', async () => {
    const baseUrl = process.env.SPARKQ_URL || 'http://127.0.0.1:5005';
    await page.goto(`${baseUrl}/ui/?_=${Date.now()}`, {
      waitUntil: 'networkidle2',
      timeout: 20000,
    });

    // Wait for app to load
    await page.waitForTimeout(2000);

    // Inject and test QuickAdd component directly
    const result = await page.evaluate(async () => {
      // Simulate creating a QuickAdd instance and rendering it
      // Create a test container
      const container = document.createElement('div');
      container.id = 'test-quick-add';
      document.body.appendChild(container);

      // Create a QuickAdd instance if available
      if (window.QuickAdd) {
        const qa = new window.QuickAdd('test-quick-add', 'test-queue-id', 'Test Queue', null);

        // Render the component
        await qa.render();

        // Check the rendered HTML
        const label = container.querySelector('label[for="agent-role-select"]');
        const icon = label ? label.querySelector('a[href*="agent-roles"]') : null;

        return {
          success: true,
          hasLabel: !!label,
          labelText: label ? label.textContent.trim() : null,
          hasIcon: !!icon,
          iconText: icon ? icon.textContent : null,
          iconHref: icon ? icon.getAttribute('href') : null,
          iconTitle: icon ? icon.getAttribute('title') : null,
        };
      } else {
        return {
          success: false,
          error: 'QuickAdd class not available',
        };
      }
    });

    console.log('QuickAdd render result:', JSON.stringify(result, null, 2));

    expect(result.success).toBe(true);
    expect(result.hasLabel).toBe(true);
    expect(result.hasIcon).toBe(true);
    expect(result.iconText).toBe('ⓘ');
    expect(result.iconHref).toBe('http://192.168.1.150:5005/settings?tab=agent-roles');
    expect(result.iconTitle).toBe('Manage agent roles');
  });

  test('Agent Role dropdown loads without errors', async () => {
    const baseUrl = process.env.SPARKQ_URL || 'http://127.0.0.1:5005';
    await page.goto(`${baseUrl}/ui/?_=${Date.now()}`, {
      waitUntil: 'networkidle2',
      timeout: 20000,
    });

    await page.waitForTimeout(2000);

    const result = await page.evaluate(async () => {
      const container = document.createElement('div');
      container.id = 'test-quick-add-2';
      document.body.appendChild(container);

      if (window.QuickAdd) {
        const qa = new window.QuickAdd('test-quick-add-2', 'test-queue-id', 'Test Queue', null);
        await qa.render();

        // Check that the select dropdown exists and is populated
        const select = container.querySelector('select#agent-role-select');
        const options = select ? Array.from(select.options).map(opt => ({ value: opt.value, text: opt.text })) : [];

        return {
          hasSelect: !!select,
          optionCount: options.length,
          firstOptionText: options[0]?.text || null,
          options: options,
        };
      }
      return { error: 'QuickAdd not available' };
    });

    console.log('Agent role select result:', JSON.stringify(result, null, 2));

    expect(result.hasSelect).toBe(true);
    expect(result.optionCount).toBeGreaterThan(0);
    // First option should be "-- None --"
    expect(result.firstOptionText).toBe('-- None --');
  });
});
