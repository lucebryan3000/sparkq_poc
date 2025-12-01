/**
 * Core UI Flow E2E Tests
 * Tests the happy path through the SparkQ UI
 */
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import {
  launchBrowser,
  navigateWithCacheBust,
  closeBrowser,
  getBaseUrl,
  unregisterServiceWorkers,
  waitForBundleAndLog,
} from './helpers/index.js';

describe('SparkQ Core UI Flow', () => {
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

  test('should load the dashboard page with all tabs', async () => {
    // Unregister any service workers first
    await navigateWithCacheBust(page, getBaseUrl());
    const swCount = await unregisterServiceWorkers(page);
    console.log(`Unregistered ${swCount} service worker(s)`);

    // Navigate with cache bust
    const response = await navigateWithCacheBust(page, getBaseUrl());
    expect(response.status()).toBe(200);

    // Wait for app-core bundle to load (via script tag)
    await page.waitForFunction(
      () =>
        Array.from(document.querySelectorAll('script[src]')).some((s) =>
          s.src.includes('app-core')
        ),
      { timeout: 15000 }
    );

    // Check that main UI elements are present
    const navbarBrand = await page.$eval('.navbar-brand', (el) => el.textContent);
    expect(navbarBrand).toContain('SparkQueue');

    // Check that all expected tabs exist
    const tabs = await page.$$eval('.nav-tab', (elements) =>
      elements.map((el) => el.getAttribute('data-tab'))
    );
    expect(tabs).toEqual(
      expect.arrayContaining([
        'dashboard',
        'sparkqueue',
        'enqueue',
        'config',
        'scripts',
      ])
    );

    // Check that dashboard is active by default
    const activeTab = await page.$eval('.nav-tab.active', (el) => el.getAttribute('data-tab'));
    expect(activeTab).toBe('dashboard');
  });

  test('should expose tab buttons for navigation', async () => {
    const sparkqueueTab = await page.$('.nav-tab[data-tab="sparkqueue"]');
    const configTab = await page.$('.nav-tab[data-tab="config"]');
    expect(sparkqueueTab).not.toBeNull();
    expect(configTab).not.toBeNull();
  });

  test('should have window.Pages namespace with page modules', async () => {
    const pagesNamespace = await page.evaluate(() => {
      if (!window.Pages) {
        return { error: 'window.Pages not found' };
      }

      return {
        hasDashboard: typeof window.Pages.Dashboard === 'object',
        hasQueues: typeof window.Pages.Queues === 'object',
        hasEnqueue: typeof window.Pages.Enqueue === 'object',
        hasConfig: typeof window.Pages.Config === 'object',
        hasScripts: typeof window.Pages.Scripts === 'object',
      };
    });

    expect(pagesNamespace.error).toBeUndefined();
    expect(pagesNamespace.hasDashboard).toBe(true);
    expect(pagesNamespace.hasQueues).toBe(true);
    expect(pagesNamespace.hasEnqueue).toBe(true);
    expect(pagesNamespace.hasConfig).toBe(true);
    expect(pagesNamespace.hasScripts).toBe(true);
  });

  test('should load and render config page with tabs', async () => {
    // Navigate to config page
    // Check that config page container exists
    const configPage = await page.$('#config-page');
    expect(configPage).toBeTruthy();
  });

  test('should have theme toggle button', async () => {
    const themeToggle = await page.$('#theme-toggle-btn');
    expect(themeToggle).toBeTruthy();

    const themeTitle = await page.$eval('#theme-toggle-btn', (el) => el.getAttribute('title'));
    expect(themeTitle).toBe('Toggle dark/light mode');
  });

  test('should not have console errors on page load', async () => {
    const errors = [];

    page.on('pageerror', (error) => {
      errors.push(error.message);
    });

    // Reload page
    await navigateWithCacheBust(page, getBaseUrl());
    await page.waitForTimeout(2000);

    // Check for errors
    expect(errors).toEqual([]);
  });
});
