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

  test.each(pages)('loads %s page module', async (pageConfig) => {
    // Fresh navigation for each page check
    await navigateWithCacheBust(page, getBaseUrl());

    const moduleExists = await page.evaluate(
      (moduleName) => Boolean(window.Pages && window.Pages[moduleName]),
      pageConfig.module
    );
    expect(moduleExists).toBe(true);

    if (pageConfig.tab) {
      const tabSelector = `.nav-tab[data-tab="${pageConfig.tab}"]`;
      await page.waitForSelector(tabSelector, { timeout: 15000 });
      await page.click(tabSelector);
    }

    if (pageConfig.selector) {
      await page.waitForSelector(pageConfig.selector, { timeout: 15000 });
    }
  });
});
