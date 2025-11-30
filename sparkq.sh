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
  start                  Start server in background
  restart                Stop, wait 5 seconds, then start (clean restart)
  run [--foreground|--e2e]     Start server (--foreground for interactive, --e2e to run e2e tests)
  stop                   Stop the server
  status                 Check server status

Database & Config:
  setup                  Interactive setup (create sparkq.yml + database)
  reload                 Reload configuration and script index

Session & Stream:
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

Examples:
  ./sparkq.sh start                  # Start server in background
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

# Main dispatcher
main() {
  ensure_venv

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
  set -- run --background
fi

if [[ "${1:-}" == "restart" ]]; then
  echo "Stopping server..."
  set -- stop
  main "$@"
  echo "Waiting 5 seconds before restart..."
  sleep 5
  echo "Starting server..."
  set -- run --background
  main "$@"
  exit $?
fi

main "$@"
