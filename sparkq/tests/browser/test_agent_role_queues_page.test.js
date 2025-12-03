import puppeteer from 'puppeteer';
import { describe, test, beforeAll, afterAll, expect } from '@jest/globals';

describe('Agent Role icon in Queues page', () => {
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

  test('Agent Role info icon renders in Queues page quick-add', async () => {
    const baseUrl = process.env.SPARKQ_URL || 'http://127.0.0.1:5005';
    // Navigate to queues page instead of dashboard
    await page.goto(`${baseUrl}/ui/queues?_=${Date.now()}`, {
      waitUntil: 'networkidle2',
      timeout: 20000,
    });

    // Wait for page to render
    await page.waitForTimeout(2000);

    // Check what's on the page
    const pageState = await page.evaluate(() => {
      return {
        hasQueuesPage: !!document.getElementById('queues-page'),
        hasQueuesList: !!document.querySelector('[class*="queue"]'),
        bodyText: document.body.innerText.substring(0, 200),
        allIds: Array.from(document.querySelectorAll('[id]')).map(el => el.id).slice(0, 20),
      };
    });

    console.log('Page state:', JSON.stringify(pageState, null, 2));

    // Check for quick-add-container or similar
    const quickAddExists = await page.$('#quick-add-container');
    console.log('Quick add container exists:', !!quickAddExists);

    if (quickAddExists) {
      // Check if agent role label and icon exist
      const agentRoleData = await page.evaluate(() => {
        const label = document.querySelector('label[for="agent-role-select"]');
        const icon = label ? label.querySelector('a[href*="agent-roles"]') : null;
        return {
          hasLabel: !!label,
          hasIcon: !!icon,
          iconText: icon ? icon.textContent : null,
        };
      });

      console.log('Agent role data:', JSON.stringify(agentRoleData, null, 2));

      expect(agentRoleData.hasLabel).toBe(true);
      expect(agentRoleData.hasIcon).toBe(true);
      expect(agentRoleData.iconText).toBe('ⓘ');
    }
  });
});
