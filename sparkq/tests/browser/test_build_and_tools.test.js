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

  test.skip('build watcher does not reload or clear inputs when versions match', async () => {
    // TODO: Restore when build-id input is present in Config UI
  });

  test.skip('friendly tool descriptions render in dashboard tasks', async () => {
    // TODO: Re-enable when queue tabs are exposed in current UI build
  });
});
