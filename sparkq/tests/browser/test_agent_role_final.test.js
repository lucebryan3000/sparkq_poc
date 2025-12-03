import puppeteer from 'puppeteer';
import { describe, test, beforeAll, afterAll, expect } from '@jest/globals';

describe('Agent Role dropdown with info icon - Final Test', () => {
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

  test('Agent Role info icon renders in quick-add component', async () => {
    const baseUrl = process.env.SPARKQ_URL || 'http://127.0.0.1:5005';
    await page.goto(`${baseUrl}/ui/?_=${Date.now()}`, {
      waitUntil: 'networkidle2',
      timeout: 20000,
    });

    // Wait for dashboard to fully load with queue list
    await page.waitForTimeout(2000);

    // Get all available info and try to render quick-add
    const dashboardState = await page.evaluate(() => {
      const quickAddContainer = document.getElementById('dashboard-quick-add');
      const queueButtons = document.querySelectorAll('button[data-queue-id]');
      return {
        hasQuickAddContainer: !!quickAddContainer,
        quickAddContainerId: quickAddContainer ? quickAddContainer.id : null,
        queueCount: queueButtons.length,
        queueIds: Array.from(queueButtons).map(b => b.getAttribute('data-queue-id')),
        hasQuickAddClass: !!window.QuickAdd,
      };
    });

    console.log('Dashboard state:', JSON.stringify(dashboardState, null, 2));

    expect(dashboardState.hasQuickAddContainer).toBe(true);
    expect(dashboardState.queueCount).toBeGreaterThan(0);

    // Click first queue to trigger quick-add rendering
    if (dashboardState.queueIds.length > 0) {
      const firstQueueId = dashboardState.queueIds[0];
      const queueButton = await page.$(`button[data-queue-id="${firstQueueId}"]`);
      if (queueButton) {
        await queueButton.click();
        await page.waitForTimeout(1500);
      }
    }

    // Now check for the agent role label and icon
    const componentState = await page.evaluate(() => {
      const label = document.querySelector('label[for="agent-role-select"]');
      const select = document.getElementById('agent-role-select');
      const icon = label ? label.querySelector('a[href*="agent-roles"]') : null;

      return {
        hasLabel: !!label,
        labelText: label ? label.textContent : null,
        hasSelect: !!select,
        hasIcon: !!icon,
        iconText: icon ? icon.textContent : null,
        iconHref: icon ? icon.getAttribute('href') : null,
        quickAddHTML: document.getElementById('dashboard-quick-add')?.innerHTML?.substring(0, 200),
      };
    });

    console.log('Component state:', JSON.stringify(componentState, null, 2));

    // Verify the icon exists and has correct properties
    expect(componentState.hasLabel).toBe(true);
    expect(componentState.hasIcon).toBe(true);
    expect(componentState.iconText).toBe('ⓘ');
    expect(componentState.iconHref).toBe('http://192.168.1.150:5005/settings?tab=agent-roles');
  });
});
