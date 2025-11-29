/**
 * Service Worker management utilities
 * Unregister service workers to prevent cache interference
 */

const DEBUG = process.env.PUPPETEER_DEBUG === '1';

/**
 * Unregister all service workers on the page
 * @param {Page} page - Puppeteer page
 * @returns {Promise<number>} Number of service workers unregistered
 */
export async function unregisterServiceWorkers(page) {
  const count = await page.evaluate(async () => {
    if (!navigator.serviceWorker) {
      return 0;
    }

    const registrations = await navigator.serviceWorker.getRegistrations();
    const promises = registrations.map((reg) => reg.unregister());
    await Promise.all(promises);

    return registrations.length;
  });

  if (DEBUG && count > 0) {
    console.log(`[SERVICE WORKER] Unregistered ${count} service worker(s)`);
  }

  return count;
}

/**
 * Check if any service workers are registered
 * @param {Page} page - Puppeteer page
 * @returns {Promise<Array>} List of registered service worker scopes
 */
export async function getServiceWorkerRegistrations(page) {
  const registrations = await page.evaluate(async () => {
    if (!navigator.serviceWorker) {
      return [];
    }

    const regs = await navigator.serviceWorker.getRegistrations();
    return regs.map((reg) => ({
      scope: reg.scope,
      active: reg.active ? reg.active.state : null,
      installing: reg.installing ? reg.installing.state : null,
      waiting: reg.waiting ? reg.waiting.state : null,
    }));
  });

  if (DEBUG && registrations.length > 0) {
    console.log(`[SERVICE WORKER] Found ${registrations.length} registration(s):`);
    registrations.forEach((reg) => {
      console.log(`  Scope: ${reg.scope}, Active: ${reg.active}`);
    });
  }

  return registrations;
}

/**
 * Wait for service workers to be fully unregistered
 * @param {Page} page - Puppeteer page
 * @param {number} timeoutMs - Maximum time to wait
 * @returns {Promise<boolean>} True if all unregistered
 */
export async function waitForServiceWorkersUnregistered(page, timeoutMs = 5000) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const registrations = await getServiceWorkerRegistrations(page);
    if (registrations.length === 0) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return false;
}
