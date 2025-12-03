#!/bin/bash
# SparkQ Runner - Python CLI wrapper
# Note: python-bootstrap (./python-bootstrap/bootstrap.sh) is the recommended setup method
# This script provides convenient direct access to SparkQ CLI after venv is set up

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"
VENV_DIR="$PROJECT_ROOT/.venv"

# Help message
show_help() {
  cat << EOF
SparkQ CLI Wrapper

Usage: ./sparkq.sh [COMMAND] [OPTIONS]

Server Commands:
  start                  Start server in background (uses sparkq.yml host/port unless overridden)
  restart                Stop, wait 5 seconds, then start (clean restart)
  run [--foreground|--e2e|--env dev|prod|test]     Start server (--foreground for interactive, --e2e to run full pytest suite)
  stop                   Stop the server
  status                 Check server status
  --service-on           Enable service monitoring (polls every 15 minutes, auto-restarts if down)
  --service-off          Disable service monitoring

Database & Config:
  setup                  Interactive setup (create sparkq.yml + database)
  teardown               Clean removal of all SparkQueue artifacts (database, config, logs)
  reload                 Reload configuration and script index
  backup-list            List all backups with details (last 7 versions kept)
  backup-show <N>        Show backup manifest/contents (N=1 is most recent)
  backup-restore <N>     Restore database + config from backup
  backup-restore <N> --db-only     Restore only database (skip sparkq.yml)
  backup-restore <N> --config-only Restore only sparkq.yml (skip database)

UI:
  sync-ui                Sync UI source files from components/pages/core/utils to dist/

Session & Queue:
  session create <name>  Create a named session
  session list           List all sessions
  session end <id>       End a session
  queue create <name>   Create a named queue

Task Operations:
  enqueue                Enqueue a task
  peek                   Check next task in queue
  claim                  Claim a task
  complete               Mark task as completed
  fail                   Mark task as failed
  tasks                  List tasks with filters
  task                   Show detailed task info
  requeue                Move task back to queued status
  purge                  Delete old succeeded/failed tasks

Options:
  -h, --help             Show this help message

Test Suite:
  e2e                    Run full test suite: test-index + pytest (SPARKQ_ENV=test) + browser tests

Examples:
  ./sparkq.sh start                  # Start server in background (reads host/port/db from sparkq.yml)
  ./sparkq.sh run --env dev          # Explicit dev mode (default)
  ./sparkq.sh run --env prod         # Basic prod caching mode
  ./sparkq.sh run --config /path/to/sparkq.yml  # Use a specific config file
  ./sparkq.sh restart                # Stop, wait 5s, then start
  ./sparkq.sh run                    # Start server in foreground
  ./sparkq.sh setup                  # Interactive setup
  ./sparkq.sh session create test    # Create session
  ./sparkq.sh stop                   # Stop server
  ./sparkq.sh status                 # Check status

Full command help:
  ./sparkq.sh help <command>
EOF
}

# Ensure venv exists and is properly configured
ensure_venv() {
  if [[ ! -d "$VENV_DIR" ]]; then
    echo -e "${RED}Error: Virtual environment not found at $VENV_DIR${NC}"
    echo -e "${YELLOW}Setup required. Run bootstrap first:${NC}"
    echo "  ./python-bootstrap/bootstrap.sh"
    echo -e "${YELLOW}For details, see: python-bootstrap/README.md${NC}"
    exit 1
  fi
}

# Service monitoring functions
SERVICE_MONITOR_FILE="$PROJECT_ROOT/.sparkq_service_monitor"
SERVICE_PID_FILE="$PROJECT_ROOT/.sparkq_monitor.pid"

start_service_monitor() {
  if [[ -f "$SERVICE_MONITOR_FILE" ]]; then
    echo -e "${YELLOW}Service monitoring already enabled${NC}"
    return
  fi

  touch "$SERVICE_MONITOR_FILE"

  # Start monitoring in background
  (
    while [[ -f "$SERVICE_MONITOR_FILE" ]]; do
      sleep 900  # 15 minutes

      if ! ./sparkq.sh status &>/dev/null; then
        echo "[$(date +'%Y-%m-%d %H:%M:%S')] SparkQ server down, restarting..." >> "$PROJECT_ROOT/sparkq.log"
        ./sparkq.sh start
      fi
    done
  ) &

  echo $! > "$SERVICE_PID_FILE"
  echo -e "${GREEN}Service monitoring enabled (PID $(cat $SERVICE_PID_FILE))${NC}"
  echo -e "${BLUE}Monitor will check server health every 15 minutes and auto-restart if needed${NC}"
}

stop_service_monitor() {
  if [[ ! -f "$SERVICE_MONITOR_FILE" ]]; then
    echo -e "${YELLOW}Service monitoring not enabled${NC}"
    return
  fi

  if [[ -f "$SERVICE_PID_FILE" ]]; then
    MONITOR_PID=$(cat "$SERVICE_PID_FILE")
    if kill "$MONITOR_PID" 2>/dev/null; then
      echo -e "${GREEN}Service monitor stopped (PID $MONITOR_PID)${NC}"
    fi
    rm -f "$SERVICE_PID_FILE"
  fi

  rm -f "$SERVICE_MONITOR_FILE"
  echo -e "${GREEN}Service monitoring disabled${NC}"
}

# Database backup function
backup_database() {
  "$SCRIPT_DIR/sparkq/scripts/backup_database.sh"
}

# Main dispatcher
main() {
  ensure_venv

  # Backup database before running (but not for all commands)
  # Only backup for server commands that might modify the database
  if [[ "${1:-}" == "run" ]] || [[ "${1:-}" == "start" ]]; then
    backup_database
  fi

  # Source venv
  source "$VENV_DIR/bin/activate"

  # Run sparkq CLI
  python -m sparkq.src.cli "$@"
}

# Show help if requested
if [[ "${1:-}" == "-h" ]] || [[ "${1:-}" == "--help" ]] || [[ $# -eq 0 ]]; then
  show_help
  exit 0
fi

# Handle convenience aliases
if [[ "${1:-}" == "start" ]]; then
  backup_database
  shift
  set -- run --background "$@"
fi

if [[ "${1:-}" == "restart" ]]; then
  echo "Stopping server..."
  shift
  set -- stop
  main "$@"
  echo "Waiting 5 seconds before restart..."
  sleep 5
  echo "Starting server..."
  backup_database
  set -- run --background
  main "$@"
  exit $?
fi

# Handle service monitoring
if [[ "${1:-}" == "--service-on" ]]; then
  start_service_monitor
  exit 0
fi

if [[ "${1:-}" == "--service-off" ]]; then
  stop_service_monitor
  exit 0
fi

# Handle teardown separately (doesn't need venv)
if [[ "${1:-}" == "teardown" ]]; then
  shift
  exec "$SCRIPT_DIR/sparkq/scripts/teardown/teardown.sh" "$@"
fi

# Handle UI sync separately (doesn't need venv)
if [[ "${1:-}" == "sync-ui" ]]; then
  shift
  exec "$SCRIPT_DIR/sparkq/ui/scripts/sync-dist.sh" "$@"
fi

# Handle database backup commands (doesn't need venv)
if [[ "${1:-}" == "backup-list" ]]; then
  shift
  exec "$SCRIPT_DIR/sparkq/scripts/restore_database.sh" list "$@"
fi

if [[ "${1:-}" == "backup-show" ]]; then
  shift
  exec "$SCRIPT_DIR/sparkq/scripts/restore_database.sh" show "$@"
fi

if [[ "${1:-}" == "backup-restore" ]]; then
  shift
  exec "$SCRIPT_DIR/sparkq/scripts/restore_database.sh" restore "$@"
fi

# Full test suite helper
if [[ "${1:-}" == "e2e" ]]; then
  ensure_venv
  source "$VENV_DIR/bin/activate"

  echo "Running test index..."
  python "$PROJECT_ROOT/tools/test_index.py" --fail-on-missing

  echo "Running pytest (SPARKQ_ENV=test)..."
  (cd "$PROJECT_ROOT/sparkq" && SPARKQ_ENV=test pytest)

  echo "Running browser tests..."
  (cd "$PROJECT_ROOT" && npm run test:browser)

  exit $?
fi

main "$@"
