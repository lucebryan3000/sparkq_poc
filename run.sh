#!/bin/bash
# SparkQueue Runner - Simple wrapper to start the application

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"
VENV_DIR="$PROJECT_ROOT/.venv"
APP_SCRIPT="$PROJECT_ROOT/_build/sparkqueue/sparkqueue.py"

# Help message
show_help() {
  cat << EOF
SparkQueue Runner

Usage: ./run.sh [COMMAND] [OPTIONS]

Commands:
  start|run       Start the application (default)
  setup           Set up virtual environment only
  stop            Stop all running SparkQueue processes
  status          Show running processes
  logs            Tail application logs
  help            Show this help message

Options for 'start':
  --foreground    Run in foreground (default: background)
  --background    Run in background
  --verbose       Show detailed output

Examples:
  ./run.sh                          # Start in background
  ./run.sh start --foreground       # Start in foreground
  ./run.sh setup                    # Just set up venv
  ./run.sh stop                     # Stop processes
  ./run.sh logs                     # Show logs
EOF
}

# Ensure venv exists
ensure_venv() {
  if [[ ! -d "$VENV_DIR" ]]; then
    echo -e "${YELLOW}Virtual environment not found. Creating...${NC}"
    python3 -m venv "$VENV_DIR"
    "$VENV_DIR/bin/pip" install --upgrade pip > /dev/null 2>&1
  fi
}

# Install dependencies
install_deps() {
  ensure_venv
  echo -e "${GREEN}Installing dependencies...${NC}"

  # Install base requirements
  if [[ -f "$PROJECT_ROOT/python-bootstrap/requirements.txt" ]]; then
    "$VENV_DIR/bin/pip" install -q -r "$PROJECT_ROOT/python-bootstrap/requirements.txt"
  fi

  # Install project requirements if they exist
  if [[ -f "$PROJECT_ROOT/requirements.txt" ]]; then
    "$VENV_DIR/bin/pip" install -q -r "$PROJECT_ROOT/requirements.txt"
  fi

  echo -e "${GREEN}✓ Dependencies installed${NC}"
}

# Start application
start_app() {
  local foreground=false

  # Parse options
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --foreground) foreground=true; shift ;;
      --background) foreground=false; shift ;;
      --verbose) VERBOSE=true; shift ;;
      *) shift ;;
    esac
  done

  install_deps

  echo -e "${GREEN}Starting SparkQueue...${NC}"

  if [[ "$foreground" == "true" ]]; then
    # Run in foreground
    source "$VENV_DIR/bin/activate"
    exec python "$APP_SCRIPT"
  else
    # Run in background
    source "$VENV_DIR/bin/activate"
    nohup python "$APP_SCRIPT" > "$PROJECT_ROOT/logs/sparkqueue.log" 2>&1 &
    PID=$!
    echo -e "${GREEN}✓ SparkQueue started (PID: $PID)${NC}"
    echo "  Logs: $PROJECT_ROOT/logs/sparkqueue.log"
    echo "  Stop with: ./run.sh stop"
  fi
}

# Setup only
setup() {
  install_deps
  echo -e "${GREEN}✓ Setup complete${NC}"
  echo "Run './run.sh start' to start the application"
}

# Stop application
stop_app() {
  if command -v "$PROJECT_ROOT/python-bootstrap/kill-python.sh" &> /dev/null; then
    "$PROJECT_ROOT/python-bootstrap/kill-python.sh"
  else
    # Fallback to manual kill
    PIDS=$(pgrep -f "python.*sparkqueue" 2>/dev/null || true)
    if [[ -z "$PIDS" ]]; then
      echo -e "${YELLOW}No SparkQueue processes running${NC}"
    else
      echo "Killing SparkQueue processes..."
      kill -TERM $PIDS 2>/dev/null || true
      sleep 1
      kill -9 $PIDS 2>/dev/null || true
      echo -e "${GREEN}✓ Stopped${NC}"
    fi
  fi
}

# Show status
status() {
  PIDS=$(pgrep -f "python.*sparkqueue" 2>/dev/null || true)
  if [[ -z "$PIDS" ]]; then
    echo -e "${YELLOW}No SparkQueue processes running${NC}"
  else
    echo -e "${GREEN}Running SparkQueue processes:${NC}"
    ps aux | grep "[s]parkqueue"
  fi
}

# Show logs
show_logs() {
  LOG_FILE="$PROJECT_ROOT/logs/sparkqueue.log"
  if [[ -f "$LOG_FILE" ]]; then
    echo "Following logs from: $LOG_FILE"
    echo "Press Ctrl+C to stop"
    tail -f "$LOG_FILE"
  else
    echo -e "${YELLOW}Log file not found: $LOG_FILE${NC}"
  fi
}

# Main
main() {
  mkdir -p "$PROJECT_ROOT/logs"

  case "${1:-start}" in
    start|run)
      shift || true
      start_app "$@"
      ;;
    setup)
      setup
      ;;
    stop)
      stop_app
      ;;
    status)
      status
      ;;
    logs)
      show_logs
      ;;
    help|--help|-h)
      show_help
      ;;
    *)
      echo -e "${RED}Unknown command: $1${NC}"
      show_help
      exit 1
      ;;
  esac
}

main "$@"
