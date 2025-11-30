#!/bin/bash
# SparkQ Watcher Script - Monitor queues for new tasks
# Usage: ./sparkq-watcher.sh <queue_name>

set -e

# Validate arguments
if [[ -z "$1" ]]; then
    echo "Error: queue name is required"
    echo "Usage: $0 <queue_name>"
    exit 1
fi

STREAM_NAME="$1"
LOCK_PATH="/tmp/sparkq-${STREAM_NAME}.lock"
PID=$$

# Check if another instance is already running (before trap setup)
if [[ -f "$LOCK_PATH" ]]; then
    EXISTING_PID=$(<"$LOCK_PATH")
    # Check if process still exists
    if kill -0 "$EXISTING_PID" 2>/dev/null; then
        echo "Error: Watcher already running for queue '$STREAM_NAME' (PID: $EXISTING_PID)" >&2
        exit 1
    fi
fi

# Signal handlers for cleanup
cleanup() {
    rm -f "$LOCK_PATH"
}

trap cleanup SIGTERM SIGINT EXIT

# Create lock file atomically with our PID
echo "$PID" > "$LOCK_PATH"

# Main monitoring loop
# In production, this would:
# 1. Query the queue for new tasks via API
# 2. Claim and execute tasks
# 3. Report results back
# For Phase 7, we keep it simple - just maintain the lock and sleep
while true; do
    sleep 1
done
