/**
 * E2E coverage for build watcher stability and friendly tool labels.
 */
import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';
import {
  launchBrowser,
  navigateWithCacheBust,
  closeBrowser,
  getBaseUrl,
} from './helpers/index.js';

jest.setTimeout(60000);

async function createSessionQueueAndTask(page, baseUrl, toolDescription) {
  return await page.evaluate(
    async (baseUrlInner, desc) => {
      const headers = { 'Content-Type': 'application/json' };
      const sessionName = `qa-session-${Date.now()}`;
      const queueName = `qa-queue-${Date.now()}`;
      const friendlyLabel = desc || `Friendly-${Date.now()}`;

      const sessionRes = await fetch(`${baseUrlInner}/api/sessions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: sessionName }),
      });
      const session = (await sessionRes.json()).session;

      await fetch(`${baseUrlInner}/api/tools/llm-haiku`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          name: 'llm-haiku',
          description: friendlyLabel,
          task_class: 'LLM_LITE',
        }),
      });

      const queueRes = await fetch(`${baseUrlInner}/api/queues`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ session_id: session.id, name: queueName }),
      });
      const queue = (await queueRes.json()).queue;

      const taskRes = await fetch(`${baseUrlInner}/api/tasks`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          queue_id: queue.id,
          tool_name: 'llm-haiku',
          task_class: 'LLM_LITE',
          timeout: 300,
        }),
      });
      const task = (await taskRes.json()).task;

      return {
        sessionId: session.id,
        queueId: queue.id,
        queueName: queue.name,
        taskId: task.id,
        friendlyLabel,
      };
    },
    baseUrl,
    toolDescription
  );
}

describe('Build watcher and friendly tool names', () => {
  let browser;
  let page;
  const baseUrl = getBaseUrl();

  beforeAll(async () => {
    const setup = await launchBrowser();
    browser = setup.browser;
    page = setup.page;
  });

  afterAll(async () => {
    await closeBrowser(browser);
  });

  test('build watcher does not reload or clear inputs when versions match', async () => {
    await navigateWithCacheBust(page, baseUrl);
    await page.click('.nav-tab[data-tab="config"]');
    await page.waitForSelector('#build-id-input', { timeout: 10000 });

    const testValue = `qa-build-${Date.now()}`;
    await page.$eval('#build-id-input', (el, val) => {
      el.value = '';
      el.value = val;
    }, testValue);

    // Wait a bit longer than the 15s build watcher interval
    await page.waitForTimeout(17000);

    const activeTab = await page.$eval('.nav-tab.active', (el) => el.getAttribute('data-tab'));
    const persistedValue = await page.$eval('#build-id-input', (el) => el.value);

    expect(activeTab).toBe('config');
    expect(persistedValue).toBe(testValue);
  });

  test('friendly tool descriptions render in dashboard tasks', async () => {
    const { queueId, queueName, taskId, friendlyLabel } = await createSessionQueueAndTask(
      page,
      baseUrl,
      'Friendly Haiku QA'
    );

    await navigateWithCacheBust(page, baseUrl);
    await page.waitForSelector('#queue-tabs', { timeout: 15000 });

    await page.waitForSelector(`.queue-tab[data-queue-id="${queueId}"]`, { timeout: 10000 });
    await page.click(`.queue-tab[data-queue-id="${queueId}"]`);

    await page.waitForSelector('#queue-content', { timeout: 10000 });

    const toolText = await page.waitForFunction(
      (id, label) => {
        const row = document.querySelector(`.task-row[data-task-id="${id}"]`);
        if (!row) return null;
        const cell = row.querySelector('.task-cell.tool');
        return cell ? cell.textContent.trim() : null;
      },
      { timeout: 15000 },
      taskId,
      friendlyLabel
    );

    expect(await toolText.jsonValue()).toBe(friendlyLabel);

    const tabName = await page.$eval(
      `.queue-tab[data-queue-id="${queueId}"] .tab-header span:nth-child(2)`,
      (el) => el.textContent.trim()
    );
    expect(tabName).toBe(queueName);
  });
});
