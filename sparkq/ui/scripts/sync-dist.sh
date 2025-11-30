#!/usr/bin/env bash
set -euo pipefail

# Simple helper to sync UI source files into dist/ (no bundler here).
# Extend this if you add a build pipeline later.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cp "${ROOT_DIR}/components/quick-add.js" "${ROOT_DIR}/dist/quick-add.js"
cp "${ROOT_DIR}/pages/dashboard.js" "${ROOT_DIR}/dist/dashboard.js"
cp "${ROOT_DIR}/utils/ui-utils.js" "${ROOT_DIR}/dist/ui-utils.js"

echo "Synced UI source files to dist/"
