/**
 * Puppeteer setup and teardown utilities
 * Handles browser launch with cache disabled, request/response logging
 */
import puppeteer from 'puppeteer';

const DEBUG = process.env.PUPPETEER_DEBUG === '1';
const HEADLESS = process.env.HEADLESS !== 'false';

/**
 * Launch Puppeteer with caching disabled and debug logging
 * @param {Object} options - Additional launch options
 * @returns {Promise<{browser: Browser, page: Page}>}
 */
export async function launchBrowser(options = {}) {
  const browser = await puppeteer.launch({
    headless: HEADLESS ? 'new' : false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-web-security', // Allow cross-origin for local dev
    ],
    ...options,
  });

  const page = await browser.newPage();

  // Disable cache at protocol level
  await page.setCacheEnabled(false);

  // Set viewport for consistent rendering
  await page.setViewport({
    width: 1280,
    height: 720,
    deviceScaleFactor: 1,
  });

  // Request/Response logging
  const requestLog = [];
  const responseLog = [];

  page.on('request', (request) => {
    const entry = {
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      timestamp: Date.now(),
    };
    requestLog.push(entry);

    if (DEBUG) {
      console.log(`[REQUEST] ${entry.method} ${entry.url}`);
    }
  });

  page.on('response', (response) => {
    const entry = {
      url: response.url(),
      status: response.status(),
      headers: response.headers(),
      timestamp: Date.now(),
    };
    responseLog.push(entry);

    if (DEBUG) {
      console.log(`[RESPONSE] ${entry.status} ${entry.url}`);
      console.log(`  Cache-Control: ${entry.headers['cache-control'] || 'none'}`);
      console.log(`  ETag: ${entry.headers['etag'] || 'none'}`);
    }
  });

  // Console message logging
  page.on('console', (msg) => {
    if (DEBUG) {
      const type = msg.type();
      const text = msg.text();
      console.log(`[BROWSER ${type.toUpperCase()}] ${text}`);
    }
  });

  // Error logging
  page.on('pageerror', (error) => {
    console.error(`[PAGE ERROR] ${error.message}`);
  });

  // Attach logs to page for test access
  page._requestLog = requestLog;
  page._responseLog = responseLog;

  return { browser, page };
}

/**
 * Navigate to URL with cache-busting query param
 * @param {Page} page - Puppeteer page
 * @param {string} baseUrl - Base URL to navigate to
 * @param {Object} options - Navigation options
 * @returns {Promise<Response>}
 */
export async function navigateWithCacheBust(page, baseUrl, options = {}) {
  const cacheBustUrl = `${baseUrl}?_bust=${Date.now()}`;

  if (DEBUG) {
    console.log(`[NAVIGATE] ${cacheBustUrl}`);
  }

  return await page.goto(cacheBustUrl, {
    waitUntil: 'networkidle0', // Wait for all network requests to finish
    timeout: 30000,
    ...options,
  });
}

/**
 * Clean up browser resources
 * @param {Browser} browser - Puppeteer browser instance
 */
export async function closeBrowser(browser) {
  if (browser) {
    await browser.close();
  }
}

/**
 * Get base URL from environment or default to localhost
 * @returns {string}
 */
export function getBaseUrl() {
  return process.env.SPARKQ_URL || 'http://localhost:8420';
}
