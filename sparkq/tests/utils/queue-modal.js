/**
 * Shared helpers for interacting with the New Queue modal in Puppeteer tests.
 */

async function openQueueModal(page) {
  let button = await page.$('[id*="new-queue"]');
  if (!button) {
    const handle = await page.evaluateHandle(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => (b.textContent || '').includes('New Queue'));
      return btn || null;
    });
    button = handle.asElement();
  }
  if (!button) {
    return false;
  }
  await button.click();
  await page.waitForSelector('.modal-content input, .modal-content textarea', { timeout: 5000 });
  return true;
}

async function submitQueueModal(page, queueName) {
  const input = await page.$('.modal-content input, .modal-content textarea');
  if (input) {
    await input.click({ clickCount: 3 });
    await input.type(queueName);
  }
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200); // allow modal close animation
}

async function cancelQueueModal(page) {
  const [cancelBtn] = await page.$x("//button[contains(., 'Cancel')]");
  if (cancelBtn) {
    await cancelBtn.click();
  } else {
    await page.keyboard.press('Escape');
  }
  await page.waitForTimeout(200);
}

async function getActiveQueueTabLabel(page) {
  return page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('.queue-tab'));
    const active = tabs.find((t) => t.classList.contains('active')) || tabs[0];
    return active ? (active.textContent || '').trim() : '';
  });
}

module.exports = {
  openQueueModal,
  submitQueueModal,
  cancelQueueModal,
  getActiveQueueTabLabel,
};
