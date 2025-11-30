/**
 * Headless browser test for Config Page
 * Tests tab rendering, switching, and basic functionality
 *
 * Part of the browser E2E test suite
 */

const puppeteer = require('puppeteer');

/**
 * Test Config page UI functionality
 * - Tab rendering and switching
 * - Tab styling and state
 * - Content loading
 * - Modal element presence
 * - JavaScript error detection
 */
async function testConfigPage() {
  console.log('🧪 Starting headless browser test for Config page...\n');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // Capture console messages and errors
  const consoleMessages = [];
  const errors = [];

  page.on('console', msg => {
    consoleMessages.push({
      type: msg.type(),
      text: msg.text()
    });
  });

  page.on('pageerror', error => {
    errors.push(error.message);
  });

  try {
    // Set cache to bypass
    await page.setCacheEnabled(false);

    // Navigate to config page
    const cacheBuster = Date.now();
    const baseUrl = process.env.SPARKQ_URL || 'http://localhost:5005';
    console.log(`📍 Navigating to ${baseUrl}/ui/#config`);
    await page.goto(`${baseUrl}/ui/#config?_=${cacheBuster}`, {
      waitUntil: 'networkidle2',
      timeout: 10000
    });

    // Wait for page to load
    await page.waitForSelector('.page-content', { timeout: 5000 });

    console.log('✅ Config page loaded\n');

    // Test 1: Check if tabs exist
    console.log('🔍 Test 1: Checking for tab buttons...');
    const generalTab = await page.$('#general-tab');
    const promptsTab = await page.$('#prompts-tab');

    if (generalTab && promptsTab) {
      console.log('✅ Both tabs found (General, Quick Prompts)');
    } else {
      console.log('❌ FAIL: Tabs not found');
      console.log(`   General tab: ${generalTab ? 'found' : 'NOT FOUND'}`);
      console.log(`   Prompts tab: ${promptsTab ? 'found' : 'NOT FOUND'}`);
    }

    // Test 2: Check tab content container
    console.log('\n🔍 Test 2: Checking tab content container...');
    const tabContent = await page.$('#tab-content');

    if (tabContent) {
      console.log('✅ Tab content container found');
    } else {
      console.log('❌ FAIL: Tab content container not found');
    }

    // Test 3: Check if General tab is active by default
    console.log('\n🔍 Test 3: Checking General tab active state...');
    const generalTabActive = await page.evaluate(() => {
      const tab = document.getElementById('general-tab');
      return tab ? tab.getAttribute('data-active') === 'true' : false;
    });

    if (generalTabActive) {
      console.log('✅ General tab is active by default');
    } else {
      console.log('❌ FAIL: General tab is not active');
    }

    // Test 4: Check General tab styling
    console.log('\n🔍 Test 4: Checking General tab styling...');
    const generalTabStyle = await page.evaluate(() => {
      const tab = document.getElementById('general-tab');
      if (!tab) return null;
      const computed = window.getComputedStyle(tab);
      return {
        color: computed.color,
        borderBottomColor: computed.borderBottomColor
      };
    });

    console.log(`   Color: ${generalTabStyle?.color || 'N/A'}`);
    console.log(`   Border bottom: ${generalTabStyle?.borderBottomColor || 'N/A'}`);

    // Test 5: Check if General tab content loaded
    console.log('\n🔍 Test 5: Checking General tab content...');
    const hasServerCard = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.card h2'));
      return cards.some(h2 => h2.textContent.includes('Server'));
    });

    if (hasServerCard) {
      console.log('✅ General tab content loaded (Server card found)');
    } else {
      console.log('⚠️  General tab content may not be loaded');
    }

    // Test 6: Click Prompts tab
    console.log('\n🔍 Test 6: Clicking Quick Prompts tab...');
    await page.click('#prompts-tab');
    await page.waitForTimeout(1000); // Wait for content to load

    const promptsTabActive = await page.evaluate(() => {
      const tab = document.getElementById('prompts-tab');
      return tab ? tab.getAttribute('data-active') === 'true' : false;
    });

    if (promptsTabActive) {
      console.log('✅ Prompts tab is now active');
    } else {
      console.log('❌ FAIL: Prompts tab did not become active');
    }

    // Test 7: Check for Prompts content
    console.log('\n🔍 Test 7: Checking Prompts tab content...');
    const hasPromptsHeader = await page.evaluate(() => {
      const h2s = Array.from(document.querySelectorAll('h2'));
      return h2s.some(h2 => h2.textContent.includes('Quick Prompts'));
    });

    const hasNewPromptButton = await page.$('#new-prompt-btn');

    if (hasPromptsHeader && hasNewPromptButton) {
      console.log('✅ Prompts tab content loaded');
      console.log('   - "Quick Prompts" header found');
      console.log('   - "New Prompt" button found');
    } else {
      console.log('⚠️  Prompts tab content incomplete');
      console.log(`   Header: ${hasPromptsHeader ? 'found' : 'NOT FOUND'}`);
      console.log(`   Button: ${hasNewPromptButton ? 'found' : 'NOT FOUND'}`);
    }

    // Test 8: Check for modal element
    console.log('\n🔍 Test 8: Checking for prompt modal...');
    const modal = await page.$('#prompt-modal');

    if (modal) {
      console.log('✅ Prompt modal element found');

      const modalDisplay = await page.evaluate(() => {
        const modal = document.getElementById('prompt-modal');
        return modal ? window.getComputedStyle(modal).display : null;
      });

      if (modalDisplay === 'none') {
        console.log('✅ Modal is hidden by default');
      } else {
        console.log(`⚠️  Modal display: ${modalDisplay} (expected: none)`);
      }
    } else {
      console.log('❌ FAIL: Prompt modal not found');
    }

    // Test 9: Check for JavaScript errors
    console.log('\n🔍 Test 9: Checking for JavaScript errors...');
    if (errors.length === 0) {
      console.log('✅ No JavaScript errors detected');
    } else {
      console.log(`❌ FAIL: ${errors.length} JavaScript error(s) detected:`);
      errors.forEach((err, i) => {
        console.log(`   ${i + 1}. ${err}`);
      });
    }

    // Test 10: Check console for issues
    console.log('\n🔍 Test 10: Checking console messages...');
    const errorMessages = consoleMessages.filter(m => m.type === 'error');
    const warningMessages = consoleMessages.filter(m => m.type === 'warning');

    if (errorMessages.length === 0) {
      console.log('✅ No console errors');
    } else {
      console.log(`⚠️  ${errorMessages.length} console error(s):`);
      errorMessages.slice(0, 5).forEach((msg, i) => {
        console.log(`   ${i + 1}. ${msg.text}`);
      });
    }

    if (warningMessages.length > 0) {
      console.log(`ℹ️  ${warningMessages.length} console warning(s) (not shown)`);
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(60));

    const testResults = {
      'Tabs exist': generalTab && promptsTab,
      'Tab content container': !!tabContent,
      'General tab active by default': generalTabActive,
      'Tab switching works': promptsTabActive,
      'Prompts content loaded': hasPromptsHeader && hasNewPromptButton,
      'Modal element exists': !!modal,
      'No JavaScript errors': errors.length === 0
    };

    const passed = Object.values(testResults).filter(v => v).length;
    const total = Object.keys(testResults).length;

    Object.entries(testResults).forEach(([test, result]) => {
      console.log(`${result ? '✅' : '❌'} ${test}`);
    });

    console.log('='.repeat(60));
    console.log(`RESULT: ${passed}/${total} tests passed`);
    console.log('='.repeat(60));

    if (passed === total) {
      console.log('\n🎉 All tests passed! Config page is working correctly.');
    } else {
      console.log('\n⚠️  Some tests failed. Review the output above.');
    }

  } catch (error) {
    console.error('\n❌ Test failed with error:');
    console.error(error.message);
    console.error(error.stack);
  } finally {
    await browser.close();
  }
}

// Export for use in test frameworks
module.exports = { testConfigPage };

// Run the test if executed directly
if (require.main === module) {
  testConfigPage().catch(console.error);
}
