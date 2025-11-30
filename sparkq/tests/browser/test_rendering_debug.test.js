/**
 * Debug test for direct rendering and component loading
 *
 * Validates that components are being rendered correctly
 * and all necessary scripts are loaded in the page
 *
 * Part of the browser E2E test suite
 */

const puppeteer = require('puppeteer');

/**
 * Test direct rendering of components
 * - Component element existence
 * - Script loading
 * - DOM structure validation
 * - Cache behavior
 */
async function testDirectRendering() {
  console.log('🔍 Debugging rendering and component loading...\n');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
  });

  const page = await browser.newPage();
  await page.setCacheEnabled(false);

  // Clear all caches
  const client = await page.target().createCDPSession();
  await client.send('Network.clearBrowserCache');
  await client.send('Network.clearBrowserCookies');

  try {
    const baseUrl = process.env.SPARKQ_URL || 'http://localhost:5005';

    // Navigate to index
    console.log(`📍 Navigating to ${baseUrl}/ui/`);
    await page.goto(`${baseUrl}/ui/`, {
      waitUntil: 'networkidle2',
      timeout: 10000
    });

    // Wait for app to load
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Check current page
    const currentPage = await page.evaluate(() => window.currentPage || 'unknown');
    console.log(`   Current page: ${currentPage}\n`);

    // Force navigate to config using hash
    console.log('🔄 Changing URL hash to #config...');
    await page.evaluate(() => {
      window.location.hash = 'config';
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check if router was called
    const pageCheck = await page.evaluate(() => {
      const configPage = document.getElementById('page-config');
      return {
        exists: configPage !== null,
        display: configPage ? window.getComputedStyle(configPage).display : 'N/A',
        innerHTML: configPage ? configPage.innerHTML.substring(0, 500) : 'N/A'
      };
    });

    console.log('\n📌 #page-config element:');
    console.log(`   Exists: ${pageCheck.exists}`);
    console.log(`   Display: ${pageCheck.display}`);
    if (pageCheck.innerHTML !== 'N/A') {
      console.log(`\n   HTML (first 500 chars):`);
      console.log(pageCheck.innerHTML);
    }

    // Check for tabs
    console.log('\n🔍 Tab elements check:');
    const tabCheck = await page.evaluate(() => {
      return {
        generalTab: !!document.getElementById('general-tab'),
        promptsTab: !!document.getElementById('prompts-tab'),
        tabContent: !!document.getElementById('tab-content')
      };
    });

    console.log(`   #general-tab: ${tabCheck.generalTab ? '✅ FOUND' : '❌ NOT FOUND'}`);
    console.log(`   #prompts-tab: ${tabCheck.promptsTab ? '✅ FOUND' : '❌ NOT FOUND'}`);
    console.log(`   #tab-content: ${tabCheck.tabContent ? '✅ FOUND' : '❌ NOT FOUND'}`);

    // Check the renderConfigPage function source
    const funcSource = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll('script'));
      for (const script of scripts) {
        if (script.src && script.src.includes('config.js')) {
          return { found: true, src: script.src };
        }
      }
      return { found: false };
    });

    console.log('\n📦 config.js script tag:');
    console.log(`   Found: ${funcSource.found ? '✅' : '❌'}`);
    if (funcSource.found) {
      console.log(`   Src: ${funcSource.src}`);
    }

    // Directly read the served file and check for tab structure
    const response = await page.evaluate(async () => {
      try {
        const resp = await fetch('/ui/pages/config.js?' + Date.now());
        const text = await resp.text();
        return {
          hasGeneralTab: text.includes('#general-tab'),
          hasPromptsTab: text.includes('#prompts-tab'),
          hasQuickPrompts: text.includes('Quick Prompts'),
          length: text.length,
          preview: text.substring(0, 1000)
        };
      } catch (e) {
        return { error: e.message };
      }
    });

    console.log('\n📝 /ui/pages/config.js content check:');
    if (response.error) {
      console.log(`   ❌ Error: ${response.error}`);
    } else {
      console.log(`   Size: ${response.length} bytes`);
      console.log(`   Contains '#general-tab': ${response.hasGeneralTab ? '✅' : '❌'}`);
      console.log(`   Contains '#prompts-tab': ${response.hasPromptsTab ? '✅' : '❌'}`);
      console.log(`   Contains 'Quick Prompts': ${response.hasQuickPrompts ? '✅' : '❌'}`);
    }

    // Final summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 RENDERING TEST SUMMARY');
    console.log('='.repeat(60));

    const allChecks = {
      'page-config element exists': pageCheck.exists,
      'page-config is visible': pageCheck.display === 'block',
      'general-tab element found': tabCheck.generalTab,
      'prompts-tab element found': tabCheck.promptsTab,
      'tab-content element found': tabCheck.tabContent,
      'config.js script loaded': funcSource.found,
      'config.js has tab structure': response.hasGeneralTab && response.hasPromptsTab
    };

    const passed = Object.values(allChecks).filter(v => v).length;
    const total = Object.keys(allChecks).length;

    Object.entries(allChecks).forEach(([test, result]) => {
      console.log(`${result ? '✅' : '❌'} ${test}`);
    });

    console.log('='.repeat(60));
    console.log(`RESULT: ${passed}/${total} checks passed`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    await browser.close();
  }
}

// Export for use in test frameworks
module.exports = { testDirectRendering };

// Run the test if executed directly
if (require.main === module) {
  testDirectRendering().catch(console.error);
}
