#!/usr/bin/env bash
set -euo pipefail

# Simple helper to sync UI source files into dist/ (no bundler here).
# Extend this if you add a build pipeline later.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Core
cp "${ROOT_DIR}/core/app-core.js" "${ROOT_DIR}/dist/app-core.js"

# Components
cp "${ROOT_DIR}/components/quick-add.js" "${ROOT_DIR}/dist/quick-add.js"

# Pages
cp "${ROOT_DIR}/pages/config.js" "${ROOT_DIR}/dist/config.js"
cp "${ROOT_DIR}/pages/dashboard.js" "${ROOT_DIR}/dist/dashboard.js"
cp "${ROOT_DIR}/pages/queues.js" "${ROOT_DIR}/dist/queues.js"
cp "${ROOT_DIR}/pages/scripts.js" "${ROOT_DIR}/dist/scripts.js"
cp "${ROOT_DIR}/pages/tasks.js" "${ROOT_DIR}/dist/tasks.js"

# Utils
cp "${ROOT_DIR}/utils/ui-utils.js" "${ROOT_DIR}/dist/ui-utils.js"

echo "Synced UI source files to dist/"
