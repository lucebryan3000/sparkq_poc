/**
 * Cache and bundle inspection utilities
 * Validates which JS bundles are loaded and detects stale code
 */

const DEBUG = process.env.PUPPETEER_DEBUG === '1';

/**
 * Wait for a specific JS bundle to load and return metadata
 * @param {Page} page - Puppeteer page
 * @param {string} bundleName - Name of the bundle (e.g., 'app-core')
 * @param {number} timeoutMs - Maximum time to wait
 * @returns {Promise<Object>} Bundle metadata
 */
export async function waitForBundleAndLog(page, bundleName, timeoutMs = 10000) {
  const startTime = Date.now();

  // Wait for the bundle to be requested
  let bundleResponse = null;
  let bundleUrl = null;

  // Try to read URL from script tags immediately
  bundleUrl = await page.evaluate((name) => {
    const el = Array.from(document.querySelectorAll('script[src]')).find((s) =>
      s.src.includes(name)
    );
    return el ? el.src : null;
  }, bundleName);

  while (!bundleResponse && Date.now() - startTime < timeoutMs) {
    const responses = page._responseLog || [];
    bundleResponse = responses.find((r) => r.url.includes(`${bundleName}.`) && r.url.endsWith('.js'));
    if (!bundleUrl) {
      bundleUrl = await page.evaluate((name) => {
        const el = Array.from(document.querySelectorAll('script[src]')).find((s) =>
          s.src.includes(name)
        );
        return el ? el.src : null;
      }, bundleName);
    }

    if (!bundleResponse) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  if (!bundleResponse && bundleUrl) {
    // Fetch bundle manually when response log is empty (fallback)
    const fetched = await fetchBundleContentWithHeaders(page, bundleUrl);
    if (fetched) {
      const { status, headers, content } = fetched;
      const metadata = {
        url: bundleUrl,
        status,
        headers,
        contentPreview: content.substring(0, 2000),
        contentLength: content.length,
        timestamp: Date.now(),
      };
      return metadata;
    }
  }

  if (!bundleResponse && !bundleUrl) {
    throw new Error(`Bundle '${bundleName}' not loaded within ${timeoutMs}ms`);
  }

  // Fetch the bundle content
  const content = await fetchBundleContent(page, bundleResponse.url);

  const metadata = {
    url: bundleResponse.url,
    status: bundleResponse.status,
    headers: bundleResponse.headers,
    contentPreview: content.substring(0, 2000),
    contentLength: content.length,
    timestamp: bundleResponse.timestamp,
  };

  if (DEBUG) {
    console.log(`\n[BUNDLE LOADED] ${bundleName}`);
    console.log(`  URL: ${metadata.url}`);
    console.log(`  Status: ${metadata.status}`);
    console.log(`  Cache-Control: ${metadata.headers['cache-control'] || 'none'}`);
    console.log(`  ETag: ${metadata.headers['etag'] || 'none'}`);
    console.log(`  Last-Modified: ${metadata.headers['last-modified'] || 'none'}`);
    console.log(`  Content-Length: ${metadata.contentLength}`);
    console.log(`  Content Preview (first 400 chars):\n${metadata.contentPreview}\n`);
  }

  return metadata;
}

/**
 * Fetch bundle content from URL
 * @param {Page} page - Puppeteer page
 * @param {string} url - Bundle URL
 * @returns {Promise<string>} Bundle content
 */
async function fetchBundleContent(page, url) {
  try {
    const response = await page.evaluate(async (url) => {
      const res = await fetch(url);
      return await res.text();
    }, url);
    return response;
  } catch (error) {
    console.error(`Failed to fetch bundle content: ${error.message}`);
    return '';
  }
}

async function fetchBundleContentWithHeaders(page, url) {
  try {
    return await page.evaluate(async (url) => {
      const res = await fetch(url);
      const headers = Object.fromEntries(res.headers.entries());
      const text = await res.text();
      return { status: res.status, headers, content: text };
    }, url);
  } catch (error) {
    console.error(`Failed to fetch bundle content: ${error.message}`);
    return null;
  }
}

/**
 * Get source code of a specific function from window namespace
 * @param {Page} page - Puppeteer page
 * @param {string} functionPath - Path to function (e.g., 'Pages.Config.render')
 * @returns {Promise<string>} Function source code
 */
export async function getFunctionSource(page, functionPath) {
  const source = await page.evaluate((path) => {
    const parts = path.split('.');
    let obj = window;

    for (const part of parts) {
      obj = obj[part];
      if (!obj) {
        return `ERROR: ${path} not found`;
      }
    }

    if (typeof obj === 'function') {
      return obj.toString();
    }

    return `ERROR: ${path} is not a function (type: ${typeof obj})`;
  }, functionPath);

  if (DEBUG) {
    console.log(`\n[FUNCTION SOURCE] ${functionPath}`);
    console.log(source.substring(0, 500));
    console.log('...\n');
  }

  return source;
}

/**
 * Check if bundle content contains expected marker strings
 * @param {string} content - Bundle content
 * @param {Array<string>} markers - Expected marker strings
 * @returns {Object} Results for each marker
 */
export function checkBundleMarkers(content, markers) {
  const results = {};

  for (const marker of markers) {
    results[marker] = content.includes(marker);
  }

  if (DEBUG) {
    console.log('\n[BUNDLE MARKERS]');
    for (const [marker, found] of Object.entries(results)) {
      console.log(`  ${found ? '✓' : '✗'} "${marker}"`);
    }
    console.log('');
  }

  return results;
}

/**
 * Get app version from window namespace (if available)
 * @param {Page} page - Puppeteer page
 * @returns {Promise<string|null>} App version or null
 */
export async function getAppVersion(page) {
  const version = await page.evaluate(() => {
    return window.APP_CORE_VERSION || window.APP_VERSION || null;
  });

  if (DEBUG) {
    console.log(`[APP VERSION] ${version || 'Not set'}`);
  }

  return version;
}

/**
 * Validate cache headers for development mode
 * @param {Object} headers - Response headers
 * @returns {Object} Validation results
 */
export function validateDevCacheHeaders(headers) {
  const cacheControl = headers['cache-control'] || '';
  const results = {
    hasNoStore: cacheControl.includes('no-store'),
    hasNoCache: cacheControl.includes('no-cache'),
    hasMaxAge: /max-age=(\d+)/.test(cacheControl),
    maxAgeValue: null,
    isDevFriendly: false,
  };

  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  if (maxAgeMatch) {
    results.maxAgeValue = parseInt(maxAgeMatch[1], 10);
  }

  // Dev-friendly: no-store, no-cache, or short max-age (<60s)
  results.isDevFriendly =
    results.hasNoStore ||
    results.hasNoCache ||
    (results.maxAgeValue !== null && results.maxAgeValue < 60);

  if (DEBUG) {
    console.log('\n[CACHE HEADERS VALIDATION]');
    console.log(`  Cache-Control: ${cacheControl || 'none'}`);
    console.log(`  Has no-store: ${results.hasNoStore}`);
    console.log(`  Has no-cache: ${results.hasNoCache}`);
    console.log(`  Max-Age: ${results.maxAgeValue || 'none'}`);
    console.log(`  Dev-Friendly: ${results.isDevFriendly ? '✓' : '✗'}`);
    console.log('');
  }

  return results;
}

/**
 * Compare two bundle contents to detect if they're different versions
 * @param {string} content1 - First bundle content
 * @param {string} content2 - Second bundle content
 * @param {number} sampleSize - Number of characters to compare
 * @returns {boolean} True if contents differ
 */
export function bundlesAreDifferent(content1, content2, sampleSize = 500) {
  const sample1 = content1.substring(0, sampleSize);
  const sample2 = content2.substring(0, sampleSize);

  const different = sample1 !== sample2;

  if (DEBUG && different) {
    console.log('\n[BUNDLE COMPARISON]');
    console.log('Bundles are DIFFERENT');
    console.log(`Sample 1 (${sample1.length} chars): ${sample1.substring(0, 100)}...`);
    console.log(`Sample 2 (${sample2.length} chars): ${sample2.substring(0, 100)}...`);
    console.log('');
  }

  return different;
}
