#!/bin/bash
# Phase 15 Verification Script
# Verifies that all Phase 15 components are installed correctly

set -e

echo "========================================="
echo "Phase 15 Verification"
echo "========================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✓${NC} $1"
        return 0
    else
        echo -e "${RED}✗${NC} $1 (MISSING)"
        return 1
    fi
}

check_dir() {
    if [ -d "$1" ]; then
        echo -e "${GREEN}✓${NC} $1/"
        return 0
    else
        echo -e "${RED}✗${NC} $1/ (MISSING)"
        return 1
    fi
}

echo "1. Checking Node.js Configuration..."
check_file "package.json"
check_file "sparkq/tests/jest.config.js"
echo ""

echo "2. Checking Browser Test Infrastructure..."
check_dir "sparkq/tests/browser"
check_dir "sparkq/tests/browser/helpers"
check_file "sparkq/tests/browser/helpers/puppeteer_setup.js"
check_file "sparkq/tests/browser/helpers/service_worker.js"
check_file "sparkq/tests/browser/helpers/cache_inspector.js"
check_file "sparkq/tests/browser/helpers/index.js"
echo ""

echo "3. Checking Browser Test Files..."
check_file "sparkq/tests/browser/test_core_flow.test.js"
check_file "sparkq/tests/browser/test_cache_debug.test.js"
check_file "sparkq/tests/browser/README.md"
echo ""

echo "4. Checking Python E2E Test Files..."
check_file "sparkq/tests/e2e/test_queue_lifecycle.py"
check_file "sparkq/tests/e2e/test_health_endpoint.py"
check_file "sparkq/tests/e2e/test_tool_execution.py"
echo ""

echo "5. Checking Documentation..."
check_file "_build/docs/phase15-puppeteer-e2e-cache-debug.md"
check_file "TEST_GUIDE.md"
check_file "_build/docs/PHASE15_IMPLEMENTATION_SUMMARY.md"
echo ""

echo "6. Checking Node.js Dependencies..."
if [ -d "node_modules" ]; then
    echo -e "${GREEN}✓${NC} node_modules/ exists"

    if [ -d "node_modules/puppeteer" ]; then
        echo -e "${GREEN}✓${NC} Puppeteer installed"
    else
        echo -e "${RED}✗${NC} Puppeteer NOT installed (run: npm install)"
    fi

    if [ -d "node_modules/jest" ]; then
        echo -e "${GREEN}✓${NC} Jest installed"
    else
        echo -e "${RED}✗${NC} Jest NOT installed (run: npm install)"
    fi
else
    echo -e "${RED}✗${NC} node_modules/ missing (run: npm install)"
fi
echo ""

echo "7. Test Command Availability..."
echo "Available npm scripts:"
npm run 2>&1 | grep "test:" || echo "  (none found)"
echo ""

echo "========================================="
echo "Verification Complete"
echo "========================================="
echo ""
echo "To run tests:"
echo "  npm install                    # Install Node.js dependencies"
echo "  npm run test:browser           # Run browser tests"
echo "  cd sparkq && pytest            # Run Python tests"
echo "  npm run test:all               # Run all tests"
echo ""
echo "For debugging:"
echo "  npm run test:browser:debug     # Browser tests with logging"
echo "  npm run test:browser:headed    # Browser tests with visible browser"
echo ""
