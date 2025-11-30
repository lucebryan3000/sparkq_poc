# Browser E2E Tests

Puppeteer-based end-to-end tests for the SparkQueue UI.

## Overview

These tests validate:
- UI functionality and navigation
- JavaScript bundle loading and caching
- Stale bundle detection
- Service worker behavior

## Running Tests

```bash
# From project root
npm run test:browser

# With debug logging
PUPPETEER_DEBUG=1 npm run test:browser

# With visible browser (headed mode)
HEADLESS=false npm run test:browser

# Specific test file
npx jest sparkq/tests/browser/test_cache_debug.test.js
```

## Test Files

- **test_core_flow.test.js** - Core UI navigation and functionality
- **test_cache_debug.test.js** - Cache behavior and stale bundle detection
- **test_config_page.test.js** - Config page tab rendering, switching, and functionality
- **test_rendering_debug.test.js** - Component rendering validation and script loading verification

## Helpers

- **helpers/puppeteer_setup.js** - Browser launch and navigation utilities
- **helpers/cache_inspector.js** - Bundle inspection and cache validation
- **helpers/service_worker.js** - Service worker management

## Environment Variables

- `PUPPETEER_DEBUG=1` - Enable verbose debug logging
- `HEADLESS=false` - Run browser in headed mode (visible)
- `SPARKQ_URL=http://localhost:8420` - Override base URL

## Requirements

- Node.js >= 18.0.0
- Puppeteer (auto-installs Chromium)
- SparkQueue server running on port 8420

## See Also

- [Phase 15 Documentation](../../../_build/docs/phase15-puppeteer-e2e-cache-debug.md)
