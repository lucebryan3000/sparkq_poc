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
${BLUE}SparkQ CLI Wrapper${NC}

Usage: ./sparkq.sh [COMMAND] [OPTIONS]

${BLUE}Server Commands:${NC}
  run [--background]     Start the HTTP server (port 5005)
  --start                Start server in background (alias for 'run --background')
  stop                   Stop the HTTP server
  --stop                 Stop the HTTP server (alias for 'stop')
  status                 Check server status

${BLUE}Database & Config:${NC}
  setup                  Interactive setup (create sparkq.yml + database)
  reload                 Reload configuration and script index

${BLUE}Session & Stream Management:${NC}
  session create <name>  Create a named session
  session list           List all sessions
  session end <id>       End a session
  stream create <name>   Create a named stream

${BLUE}Task Operations:${NC}
  enqueue                Enqueue a task
  peek                   Check next task in queue
  claim                  Claim a task
  complete               Mark task as completed
  fail                   Mark task as failed
  tasks                  List tasks with filters
  task                   Show detailed task info
  requeue                Move task back to queued status
  purge                  Delete old succeeded/failed tasks

${BLUE}Options:${NC}
  -h, --help             Show this help message

${BLUE}Examples:${NC}
  ./sparkq.sh --start                          # Start server in background
  ./sparkq.sh run --background                 # Start server in background (verbose)
  ./sparkq.sh run                              # Start server in foreground
  ./sparkq.sh setup                            # Interactive setup
  ./sparkq.sh session create my-session        # Create session
  ./sparkq.sh --stop                           # Stop server
  ./sparkq.sh status                           # Check status

${BLUE}Full command help:${NC}
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
if [[ "${1:-}" == "--start" ]]; then
  set -- run --background
fi

if [[ "${1:-}" == "--stop" ]]; then
  set -- stop
fi

main "$@"
