const puppeteer = require('puppeteer');
const fs = require('fs');

async function test() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.goto('http://localhost:5005', { waitUntil: 'networkidle2' });
  await page.waitForTimeout(2000);

  // Get the page structure
  const html = await page.content();
  
  // Save full HTML for inspection
  fs.writeFileSync('/tmp/page-html.txt', html);
  console.log('Page HTML saved to /tmp/page-html.txt');

  // Check for New Queue button
  const buttons = await page.$$eval('button', buttons => 
    buttons.map(b => ({
      text: b.textContent.trim(),
      id: b.id,
      class: b.className,
      dataAttrs: Object.fromEntries(
        Array.from(b.attributes)
          .filter(attr => attr.name.startsWith('data-'))
          .map(attr => [attr.name, attr.value])
      )
    }))
  );

  console.log('Buttons found:');
  buttons.forEach((btn, i) => {
    console.log(`  ${i}: "${btn.text}" (id="${btn.id}", class="${btn.class}")`);
  });

  // Try to find and click New Queue button
  const newQueueBtn = await page.$('button:contains("New Queue")') ||
                      await page.$('button[id*="queue"]') ||
                      await page.evaluate(() => {
                        const buttons = Array.from(document.querySelectorAll('button'));
                        return buttons.find(b => b.textContent.includes('New Queue'));
                      });

  if (newQueueBtn) {
    console.log('Found New Queue button');
  } else {
    console.log('New Queue button not found');
  }

  await browser.close();
}

test().catch(console.error);
