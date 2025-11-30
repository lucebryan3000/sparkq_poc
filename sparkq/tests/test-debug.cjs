const puppeteer = require('puppeteer');

async function test() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  
  // Capture console messages
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  page.on('error', err => console.log('PAGE ERROR:', err));

  await page.goto('http://localhost:5005', { waitUntil: 'networkidle2' });
  await page.waitForTimeout(2000);

  console.log('=== Attempting to create queue ===');
  await page.click('#dashboard-new-queue-btn');
  
  await page.waitForTimeout(3000);
  
  // Get error messages
  const errorMessages = await page.evaluate(() => {
    const toasts = document.querySelectorAll('[role="alert"], .toast, .error');
    return Array.from(toasts).map(t => t.textContent.trim());
  });

  console.log('Error messages:', errorMessages);

  // Check queue count
  const queueCount = await page.evaluate(() => {
    return document.querySelectorAll('[data-queue-id]').length;
  });

  console.log('Queue count:', queueCount);

  // Get page structure
  const structure = await page.evaluate(() => {
    return {
      sessionSections: document.querySelectorAll('#sessions-section, [id*="session"]').length,
      queueTabs: document.querySelectorAll('#queue-tabs').length,
      queueContent: document.querySelectorAll('#queue-content').length,
    };
  });

  console.log('Page structure:', structure);

  await browser.close();
}

test().catch(console.error);
