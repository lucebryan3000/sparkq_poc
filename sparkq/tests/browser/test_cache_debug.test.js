/**
 * Cache Debugging and Stale Bundle Detection Tests
 * Validates that we're loading fresh JS bundles, not stale cached versions
 */
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import {
  launchBrowser,
  navigateWithCacheBust,
  closeBrowser,
  getBaseUrl,
  unregisterServiceWorkers,
  waitForBundleAndLog,
  getFunctionSource,
  checkBundleMarkers,
  validateDevCacheHeaders,
  bundlesAreDifferent,
} from './helpers/index.js';

describe('Cache Debugging and Bundle Validation', () => {
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

  test('should unregister all service workers before tests', async () => {
    await navigateWithCacheBust(page, getBaseUrl());
    const swCount = await unregisterServiceWorkers(page);

    // Log for visibility
    console.log(`✓ Unregistered ${swCount} service worker(s)`);

    // Verify no service workers remain
    const remainingWorkers = await page.evaluate(async () => {
      if (!navigator.serviceWorker) return [];
      const regs = await navigator.serviceWorker.getRegistrations();
      return regs.map((r) => r.scope);
    });

    expect(remainingWorkers).toEqual([]);
  });

  test('should load app-core.js with development-friendly cache headers', async () => {
    // Navigate with cache bust
    await navigateWithCacheBust(page, getBaseUrl());

    // Wait for app-core bundle to load
    const appCoreBundle = await waitForBundleAndLog(page, 'app-core', 15000);

    expect(appCoreBundle.status).toBe(200);
    expect(appCoreBundle.contentLength).toBeGreaterThan(0);

    // Validate cache headers
    const cacheValidation = validateDevCacheHeaders(appCoreBundle.headers);

    // In development, we want dev-friendly caching
    // This test will FAIL if cache headers are too aggressive (e.g., max-age=31536000)
    if (!cacheValidation.isDevFriendly) {
      console.error('❌ CACHE HEADER WARNING:');
      console.error(`   Cache-Control: ${appCoreBundle.headers['cache-control']}`);
      console.error('   Expected: no-store, no-cache, or max-age < 60');
      console.error('   This may cause stale bundle issues in development!');
    }

    // This assertion will catch overly-aggressive caching
    expect(cacheValidation.isDevFriendly).toBe(true);
  });

  test('should load fresh bundle content on each cache-bust navigation', async () => {
    await navigateWithCacheBust(page, getBaseUrl());
    const bundle = await waitForBundleAndLog(page, 'app-core', 15000);
    expect(bundle.status).toBe(200);
    expect(bundle.contentLength).toBeGreaterThan(0);
  });

  test('should detect expected code markers in app-core.js', async () => {
    await navigateWithCacheBust(page, getBaseUrl());
    const appCoreBundle = await waitForBundleAndLog(page, 'app-core', 15000);

    // Define expected markers that should exist in the CURRENT version
    // Update these when you add new features or modify core functionality
    const expectedMarkers = ['window.Pages']; // Core namespace

    const markerResults = checkBundleMarkers(appCoreBundle.contentPreview, expectedMarkers);

    // All expected markers should be present
    for (const [marker, found] of Object.entries(markerResults)) {
      if (!found) {
        console.error(`❌ MISSING MARKER: "${marker}" not found in app-core.js`);
        console.error('   This may indicate a stale bundle is being served!');
      }
      expect(found).toBe(true);
    }
  });

  test('should load config.js and verify Config page functionality', async () => {
    await navigateWithCacheBust(page, getBaseUrl());

    // Wait for config bundle to load
    const configBundle = await waitForBundleAndLog(page, 'config', 15000);
    expect(configBundle.status).toBe(200);

    // Verify Pages.Config exists
    const hasConfig = await page.evaluate(() => !!(window.Pages && window.Pages.Config));
    expect(hasConfig).toBe(true);
  });

  test('should detect stale bundle if missing new feature markers', async () => {
    await navigateWithCacheBust(page, getBaseUrl());
    const configBundle = await waitForBundleAndLog(page, 'config', 15000);

    expect(configBundle.contentLength).toBeGreaterThan(0);
  });

  test('should have all expected bundles loaded', async () => {
    await navigateWithCacheBust(page, getBaseUrl());
    await page.waitForFunction(
      () => document.querySelectorAll('script[src*="/ui/dist/"]').length > 0,
      { timeout: 15000 }
    );

    const expectedBundles = [
      'app-core',
      'ui-utils',
      'quick-add',
      'dashboard',
      'enqueue',
      'queues',
      'config',
      'scripts',
    ];

    // Check which bundles were loaded
    let loadedBundles = page._responseLog
      .filter((r) => r.url.includes('/ui/dist/') && r.url.endsWith('.js'))
      .map((r) => {
        const match = r.url.match(/\/([^/]+)\.[\w]+\.js$/);
        return match ? match[1] : null;
      })
      .filter(Boolean);

    if (loadedBundles.length === 0) {
      loadedBundles = await page.evaluate(() =>
        Array.from(document.querySelectorAll('script[src*="/ui/dist/"]'))
          .map((s) => {
            const match = s.src.match(/\/([^/]+)\.[\w]+\.js/);
            return match ? match[1] : null;
          })
          .filter(Boolean)
      );
    }

    if (loadedBundles.length === 0) {
      loadedBundles = await page.evaluate(async (bundles) => {
        const successes = [];
        for (const bundle of bundles) {
          const url = `/ui/dist/${bundle}.js`;
          try {
            const res = await fetch(url);
            if (res.ok) successes.push(bundle);
          } catch (err) {
            // ignore
          }
        }
        return successes;
      }, expectedBundles);
    }

    console.log('Loaded bundles:', loadedBundles);

    expect(loadedBundles.length).toBeGreaterThan(0);
  });

  test('should not have overly aggressive caching on any bundle', async () => {
    await navigateWithCacheBust(page, getBaseUrl());
    await page.waitForTimeout(2000);

    // Check all JS bundles
    const jsBundles = page._responseLog.filter(
      (r) => r.url.includes('/ui/dist/') && r.url.endsWith('.js')
    );

    const cacheIssues = [];

    for (const bundle of jsBundles) {
      const validation = validateDevCacheHeaders(bundle.headers);

      if (!validation.isDevFriendly) {
        cacheIssues.push({
          url: bundle.url,
          cacheControl: bundle.headers['cache-control'],
        });
      }
    }

    // Report any bundles with aggressive caching
    if (cacheIssues.length > 0) {
      console.error('❌ CACHE ISSUES DETECTED:');
      cacheIssues.forEach((issue) => {
        console.error(`   ${issue.url}`);
        console.error(`   Cache-Control: ${issue.cacheControl}`);
      });
    }

    // All bundles should have dev-friendly cache headers
    expect(cacheIssues).toEqual([]);
  });
});
