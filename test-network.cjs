const puppeteer = require('puppeteer');

async function test() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  const requests = [];

  page.on('request', req => {
    if (req.url().includes('/api/queues') && req.method() === 'POST') {
      const body = req.postData();
      console.log('REQUEST: POST', req.url());
      console.log('BODY:', body);
      requests.push({ method: req.method(), url: req.url(), body: body });
    }
  });

  await page.goto('http://localhost:5005', { waitUntil: 'networkidle2' });
  await page.waitForTimeout(2000);

  console.log('\n=== Clicking New Queue button ===');
  await page.click('#dashboard-new-queue-btn');

  await page.waitForTimeout(5000);

  console.log('\n=== All POST /api/queues requests ===');
  requests.forEach((req, i) => {
    console.log(`${i+1}. ${req.method} ${req.url}`);
  });

  const queueCount = await page.evaluate(() => document.querySelectorAll('[data-queue-id]').length);
  console.log('\nQueue count:', queueCount);

  await browser.close();
}

test().catch(console.error);
