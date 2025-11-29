#!/usr/bin/env bash
set -euo pipefail

# Move to the script directory so cleanup runs against the right paths.
cd "$(dirname "$0")"

if [ -f sparkq.lock ]; then
  echo "Stopping SparkQ server..."
  if [ -s sparkq.lock ]; then
    lock_content="$(cat sparkq.lock)"
    if [[ "$lock_content" =~ ^[0-9]+$ ]]; then
      kill "$lock_content" 2>/dev/null || true
    fi
  fi
  rm -f sparkq.lock
fi

rm -f sparkq.db sparkq.db-shm sparkq.db-wal
rm -rf venv
rm -f /tmp/sparkq-* 2>/dev/null || true

echo "SparkQ teardown complete."
