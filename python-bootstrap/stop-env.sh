#!/bin/bash

# Stop Python Environment Script
# Detects and stops background Python processes from bootstrap

set -euo pipefail

# Colors for output
COLOR_RED='\033[0;31m'
COLOR_GREEN='\033[0;32m'
COLOR_YELLOW='\033[1;33m'
COLOR_BLUE='\033[0;34m'
COLOR_RESET='\033[0m'

ICON_SUCCESS='✓'
ICON_ERROR='✗'
ICON_WARNING='⚠'
ICON_INFO='ℹ'

# Get project root (same logic as bootstrap.sh)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
VENV_DIR="${PROJECT_ROOT}/.venv"
APP_DIR="${PROJECT_ROOT}/_build/sparkqueue"
LOGS_DIR="${APP_DIR}/logs"

# ─────────────────────────────────────────────────────────────
# Helper Functions
# ─────────────────────────────────────────────────────────────

print_header() {
  printf "\n${COLOR_BLUE}%s${COLOR_RESET}\n" "$1"
  printf "${COLOR_BLUE}%s${COLOR_RESET}\n" "$(printf '─%.0s' {1..60})"
}

find_python_processes() {
  local app_name="sparkqueue"

  # Search for Python processes related to the app
  pgrep -f "${app_name}" || true
}

get_process_details() {
  local pid=$1
  ps -p "${pid}" -o pid,user,etime,command= 2>/dev/null || echo "Process ${pid} not found"
}

# ─────────────────────────────────────────────────────────────
# Main Logic
# ─────────────────────────────────────────────────────────────

main() {
  printf "\n${COLOR_BLUE}╔════════════════════════════════════════════════════════════════╗${COLOR_RESET}\n"
  printf "${COLOR_BLUE}║${COLOR_RESET}                                                                ${COLOR_BLUE}║${COLOR_RESET}\n"
  printf "${COLOR_BLUE}║${COLOR_RESET}  ${COLOR_YELLOW}Python Environment Manager – Stop Background Process${COLOR_RESET}     ${COLOR_BLUE}║${COLOR_RESET}\n"
  printf "${COLOR_BLUE}║${COLOR_RESET}                                                                ${COLOR_BLUE}║${COLOR_RESET}\n"
  printf "${COLOR_BLUE}╚════════════════════════════════════════════════════════════════╝${COLOR_RESET}\n\n"

  # Check if venv exists
  if [[ ! -d "${VENV_DIR}" ]]; then
    printf "${COLOR_YELLOW}${ICON_WARNING}${COLOR_RESET} Virtual environment not found at: ${VENV_DIR}\n"
    printf "${COLOR_YELLOW}${ICON_WARNING}${COLOR_RESET} No bootstrap environment detected.\n\n"
    return 1
  fi

  print_header "Environment Status"
  printf "  ${COLOR_GREEN}${ICON_SUCCESS}${COLOR_RESET} Project root: ${PROJECT_ROOT}\n"
  printf "  ${COLOR_GREEN}${ICON_SUCCESS}${COLOR_RESET} Virtual env: ${VENV_DIR}\n"
  printf "  ${COLOR_GREEN}${ICON_SUCCESS}${COLOR_RESET} App directory: ${APP_DIR}\n"

  # Find running processes
  print_header "Running Python Processes"

  local pids=()
  local -A pid_details

  # Search for sparkqueue-related processes
  while IFS= read -r pid; do
    if [[ -n "${pid}" ]]; then
      pids+=("${pid}")
      pid_details["${pid}"]="$(get_process_details "${pid}")"
    fi
  done < <(find_python_processes)

  if [[ ${#pids[@]} -eq 0 ]]; then
    printf "  ${COLOR_GREEN}${ICON_SUCCESS}${COLOR_RESET} No running sparkqueue processes found\n\n"

    # Check for stale log files
    if [[ -f "${LOGS_DIR}/bootstrap.log" ]]; then
      printf "${COLOR_YELLOW}${ICON_INFO}${COLOR_RESET} Recent activity in logs:\n"
      tail -3 "${LOGS_DIR}/bootstrap.log" | sed 's/^/    /'
      printf "\n"
    fi
    return 0
  fi

  # Display found processes
  printf "  ${COLOR_YELLOW}Found ${#pids[@]} process(es):${COLOR_RESET}\n\n"

  for i in "${!pids[@]}"; do
    local pid="${pids[$i]}"
    printf "  [${i}] PID: ${COLOR_YELLOW}${pid}${COLOR_RESET}\n"
    printf "      ${pid_details[${pid}]}\n\n"
  done

  # Prompt for action
  printf "${COLOR_BLUE}Select action:${COLOR_RESET}\n"
  printf "  [k] Kill process(es)\n"
  printf "  [l] View logs\n"
  printf "  [q] Quit\n"
  printf "\n"

  read -r -p "Choice [q]: " choice
  choice="${choice:-q}"

  case "${choice}" in
    k|K)
      kill_processes "${pids[@]}"
      ;;
    l|L)
      view_logs
      ;;
    q|Q)
      printf "\n${COLOR_GREEN}${ICON_SUCCESS}${COLOR_RESET} Exiting.\n\n"
      ;;
    *)
      printf "\n${COLOR_RED}${ICON_ERROR}${COLOR_RESET} Invalid choice: ${choice}\n\n"
      ;;
  esac
}

kill_processes() {
  local pids=("$@")

  if [[ ${#pids[@]} -eq 0 ]]; then
    printf "${COLOR_YELLOW}${ICON_WARNING}${COLOR_RESET} No processes to kill.\n\n"
    return
  fi

  print_header "Stopping Processes"

  for pid in "${pids[@]}"; do
    if kill "${pid}" 2>/dev/null; then
      printf "  ${COLOR_GREEN}${ICON_SUCCESS}${COLOR_RESET} Sent SIGTERM to PID ${pid}\n"

      # Wait a moment for graceful shutdown
      sleep 1

      # Check if process still exists
      if ps -p "${pid}" > /dev/null 2>&1; then
        printf "    Process still running, sending SIGKILL...\n"
        kill -9 "${pid}" 2>/dev/null && printf "    ${COLOR_GREEN}${ICON_SUCCESS}${COLOR_RESET} Force killed\n" || true
      else
        printf "    Process stopped gracefully\n"
      fi
    else
      printf "  ${COLOR_RED}${ICON_ERROR}${COLOR_RESET} Failed to kill PID ${pid} (may already be stopped)\n"
    fi
  done

  printf "\n${COLOR_GREEN}${ICON_SUCCESS}${COLOR_RESET} Process cleanup complete.\n\n"
}

view_logs() {
  if [[ ! -f "${LOGS_DIR}/bootstrap.log" ]]; then
    printf "${COLOR_YELLOW}${ICON_WARNING}${COLOR_RESET} Log file not found: ${LOGS_DIR}/bootstrap.log\n\n"
    return
  fi

  print_header "Recent Log Output (Last 50 lines)"
  tail -50 "${LOGS_DIR}/bootstrap.log" | sed 's/^/  /'
  printf "\n"
}

# ─────────────────────────────────────────────────────────────
# Execute
# ─────────────────────────────────────────────────────────────

main "$@"
