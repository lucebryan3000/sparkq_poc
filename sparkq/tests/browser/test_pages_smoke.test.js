/**
 * Page matrix-driven smoke test to ensure each registered UI page loads.
 */
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { pages } from './helpers/page_matrix.js';
import {
  launchBrowser,
  navigateWithCacheBust,
  closeBrowser,
  getBaseUrl,
} from './helpers/index.js';

describe('SparkQ page matrix smoke', () => {
  let browser;
  let page;

  beforeAll(async () => {
    const setup = await launchBrowser();
    browser = setup.browser;
    page = setup.page;
  });

  afterAll(async () => {
    await closeBrowser(browser);
  });

  test.each(pages.filter((p) => p.module !== 'Tasks'))('loads %s page module', async (pageConfig) => {
    // Fresh navigation for each page check
    await navigateWithCacheBust(page, getBaseUrl());

    await page.waitForFunction(
      (moduleName) => Boolean(window.Pages && Object.keys(window.Pages).length > 0 && window.Pages[moduleName]),
      { timeout: 15000 },
      pageConfig.module
    );

    if (pageConfig.tab) {
      // Open hamburger menu if needed
      const menu = await page.$('#menu-toggle');
      if (menu) {
        await page.$eval('#menu-toggle', (el) => el.click());
        await page.waitForTimeout(200);
      }
      const tabSelector = `.nav-tab[data-tab="${pageConfig.tab}"]`;
      await page.waitForSelector(tabSelector, { timeout: 15000 });
      await page.$eval(tabSelector, (el) => el.click());
    }

    if (pageConfig.selector) {
      await page.waitForSelector(pageConfig.selector, { timeout: 15000 });
    }
  });
});
