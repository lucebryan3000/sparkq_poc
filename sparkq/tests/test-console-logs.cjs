const puppeteer = require('puppeteer');

async function test() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  const logs = [];
  
  page.on('console', msg => {
    const text = msg.text();
    logs.push(text);
    console.log('LOG:', text);
  });

  await page.goto('http://localhost:5005', { waitUntil: 'networkidle2' });
  await page.waitForTimeout(2000);

  console.log('\n=== Clicking New Queue button ===');
  await page.click('#dashboard-new-queue-btn');
  await page.waitForSelector('.modal-content input, .modal-content textarea', { timeout: 5000 });
  // Accept default queue name
  await page.keyboard.press('Enter');
  
  await page.waitForTimeout(4000);

  const { getActiveQueueTabLabel } = require('./utils/queue-modal');
  const label = await getActiveQueueTabLabel(page);
  console.log('Created queue tab label:', label);
  
  console.log('\n=== All logs captured ===');
  logs.filter(l => l.includes('Creating queue') || l.includes('attaching')).forEach(l => console.log('  ' + l));

  const queueCount = await page.evaluate(() => document.querySelectorAll('[data-queue-id]').length);
  console.log('Queue count:', queueCount);

  await browser.close();
}

test().catch(console.error);
