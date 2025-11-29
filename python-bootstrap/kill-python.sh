#!/bin/bash

# Quick Kill Script
# Instantly stops all sparkqueue background processes

set -euo pipefail

# Colors
COLOR_GREEN='\033[0;32m'
COLOR_RED='\033[0;31m'
COLOR_YELLOW='\033[1;33m'
COLOR_RESET='\033[0m'

ICON_SUCCESS='✓'
ICON_ERROR='✗'

# Find and kill sparkqueue processes
pids=$(pgrep -f "sparkqueue" || true)

if [[ -z "${pids}" ]]; then
  printf "${COLOR_GREEN}${ICON_SUCCESS}${COLOR_RESET} No running sparkqueue processes\n"
  exit 0
fi

printf "${COLOR_YELLOW}Killing sparkqueue processes:${COLOR_RESET}\n"

while read -r pid; do
  printf "  PID ${pid}: "

  # Try graceful kill
  if kill "${pid}" 2>/dev/null; then
    sleep 0.5

    # Check if process is still alive
    if ps -p "${pid}" > /dev/null 2>&1; then
      # Force kill if still running
      kill -9 "${pid}" 2>/dev/null && printf "${COLOR_GREEN}${ICON_SUCCESS}${COLOR_RESET} Force killed\n" || printf "${COLOR_RED}${ICON_ERROR}${COLOR_RESET} Failed\n"
    else
      printf "${COLOR_GREEN}${ICON_SUCCESS}${COLOR_RESET} Stopped\n"
    fi
  else
    printf "${COLOR_RED}${ICON_ERROR}${COLOR_RESET} Failed\n"
  fi
done <<< "${pids}"

printf "\n${COLOR_GREEN}${ICON_SUCCESS}${COLOR_RESET} Done\n"
