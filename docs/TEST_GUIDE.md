# SparkQueue Test Guide

Quick reference for running tests in SparkQueue.

## Python Tests

```bash
# All tests
cd sparkq && pytest

# Unit tests only
cd sparkq && pytest tests/unit/

# Integration tests only
cd sparkq && pytest tests/integration/

# E2E tests only
cd sparkq && pytest -m e2e

# NEW: Queue lifecycle tests
cd sparkq && pytest tests/e2e/test_queue_lifecycle.py

# NEW: Health endpoint tests
cd sparkq && pytest tests/e2e/test_health_endpoint.py

# NEW: Tool execution tests
cd sparkq && pytest tests/e2e/test_tool_execution.py

# Verbose output
cd sparkq && pytest -v

# With coverage
cd sparkq && pytest --cov=src --cov-report=html
```

## Browser Tests (Puppeteer)

```bash
# First time setup
npm install

# All browser tests (headless)
npm run test:browser

# With debug logging
npm run test:browser:debug

# With visible browser
npm run test:browser:headed

# Specific test
npx jest sparkq/tests/browser/test_cache_debug.test.js
npx jest sparkq/tests/browser/test_core_flow.test.js
```

## Combined Tests

```bash
# Run everything
npm run test:all
```

## Environment Variables

**Python Tests:**
- Uses isolated configs/DBs per test; fixtures set `SPARKQ_CONFIG` to a temp `sparkq.yml` and call `paths.reset_paths_cache()`. When adding new tests that rely on config resolution, set those the same way.

**Browser Tests:**
- `PUPPETEER_DEBUG=1` - Verbose logging (requests, responses, cache headers)
- `HEADLESS=false` - Show browser window during tests
- `SPARKQ_URL=http://localhost:PORT` - Override base URL (default: localhost:8420)

## Test Logs

- **Python:** `sparkq/tests/logs/latest/`
  - `pytest.log` - Full pytest output
  - `junit_report.xml` - JUnit format
  - `test_summary.txt` - Quick summary

- **Browser:** `sparkq/tests/logs/latest/`
  - `browser-test-report.html` - HTML report

## Common Tasks

### Debug Cache Issues

```bash
# Run cache debug tests with full logging
PUPPETEER_DEBUG=1 npm run test:browser:headed -- test_cache_debug

# Look for:
# - Cache-Control headers (should be no-store or no-cache in dev)
# - Bundle content preview (first 400 chars)
# - Missing feature markers
```

### Verify Queue Behavior

```bash
# Run queue lifecycle tests
cd sparkq && pytest tests/e2e/test_queue_lifecycle.py -v

# Tests:
# - Enqueue → claim → complete
# - Failure handling
# - Requeue
# - FIFO ordering
# - Queue isolation
```

### Check Server Health

```bash
# Run health endpoint tests
cd sparkq && pytest tests/e2e/test_health_endpoint.py -v

# Starts test server on port 8422
# Tests API endpoints, static files, health checks
```

### Validate Tool Execution

```bash
# Run tool execution tests
cd sparkq && pytest tests/e2e/test_tool_execution.py -v

# Tests:
# - Tool payload validation
# - Task class assignment
# - Metadata preservation
# - Error handling
```

## Troubleshooting

### Port Already in Use

```bash
# Check what's using the port
lsof -i :8420

# Kill the process
kill -9 <PID>
```

### Browser Tests Fail to Start

```bash
# Install Chromium dependencies (Ubuntu/Debian)
sudo apt-get install -y chromium-browser

# Or reinstall Puppeteer
npm install --force puppeteer
```

### Module Import Errors

```bash
# Always run pytest from sparkq directory
cd sparkq && pytest

# Or set PYTHONPATH
export PYTHONPATH=/home/luce/apps/sparkqueue/sparkq:$PYTHONPATH
```

## CI Integration

Tests are designed to run in CI:

```yaml
# Example GitHub Actions
- run: cd sparkq && pip install -r requirements.txt -r requirements-test.txt
- run: cd sparkq && pytest -v
- run: npm install
- run: npm run test:browser
```

## More Information

See [Phase 15 Documentation](_build/docs/phase15-puppeteer-e2e-cache-debug.md) for detailed information about:
- Test architecture
- Cache debugging features
- Maintenance and updates
- Red flags and troubleshooting
