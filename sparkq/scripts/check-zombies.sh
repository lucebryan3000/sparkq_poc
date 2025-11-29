#!/bin/bash

###############################################################################
# Zombie Process Checker and Killer
#
# PURPOSE: Detect and clean up zombie processes created by Codex executions
# or other background tasks that have terminated but not been reaped.
#
# USAGE:
#   ./scripts/check-zombies.sh              # Interactive - ask before killing
#   ./scripts/check-zombies.sh -y           # Auto-kill all zombies
#   ./scripts/check-zombies.sh -w           # Watch mode - monitor every 5s
#
# WHAT IS A ZOMBIE?
# A zombie (defunct) process is a child process that has terminated but its
# parent hasn't yet waited for it. Happens when parent shell is killed before
# child processes complete, Codex batch execution is interrupted, or background
# jobs aren't properly waited for.
#
# HOW IT WORKS:
# 1. Scans for processes with state 'Z' (zombie)
# 2. Displays each with PID, parent, elapsed time, and command
# 3. Kills parent process (zombies can't be directly killed)
# 4. Verifies all zombies are eliminated
#
# OUTPUT SHOWS:
# - PID and Parent PID with parent process name
# - How long they've been running
# - Full command that created them
# - Color-coded for easy scanning
#
# WHEN TO USE:
# - After interrupted Codex batches (Ctrl+C during execution)
# - Periodic maintenance to clean up stray processes
# - Before new batches to ensure clean state
# - In watch mode during development
#
# RELATED:
# - python-bootstrap/stop-env.sh - Interactive process manager for all SparkQ
# - python-bootstrap/kill-python.sh - Quick kill all SparkQueue Python processes
#
# POSIX shell, no external dependencies beyond standard Linux utilities.
###############################################################################

set -euo pipefail

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

###############################################################################
# Function: Find all zombie processes
###############################################################################
find_zombies() {
    ps -o pid,ppid,stat,etime,user,cmd --no-headers 2>/dev/null | grep -E '\s[Zz]\s' || true
}

###############################################################################
# Function: Format elapsed time human-readable
###############################################################################
format_time() {
    local etime="$1"

    # etime format can be:
    # MM:SS, HH:MM:SS, DD-HH:MM:SS, or just seconds
    # Just return as-is for readability
    echo "$etime"
}

###############################################################################
# Function: Display zombie processes
###############################################################################
display_zombies() {
    local zombies="$1"

    echo -e "${BLUE}═════════════════════════════════════════════════════════════════${NC}"
    echo -e "${RED}Zombie Processes Found:${NC}"
    echo -e "${BLUE}═════════════════════════════════════════════════════════════════${NC}"
    echo ""

    local zombie_count=0
    local pids=()

    while IFS= read -r line; do
        if [[ -z "$line" ]]; then
            continue
        fi

        zombie_count=$((zombie_count + 1))

        # Parse the line
        # Format: PID PPID STAT ETIME USER CMD
        read -r pid ppid stat etime user cmd <<< "$line"

        # Get the parent process name
        local parent_cmd=$(ps -p "$ppid" -o comm= 2>/dev/null || echo "N/A")

        pids+=("$pid")

        echo -e "${YELLOW}[${zombie_count}]${NC} PID: ${RED}${pid}${NC} (Parent: ${pid}→${ppid}:${parent_cmd})"
        echo "    Status: ${RED}ZOMBIE${NC} (${stat})"
        echo "    User: ${user}"
        echo "    Running for: ${etime}"
        echo "    Command: ${cmd:0:80}"
        echo ""
    done <<< "$zombies"

    echo -e "${BLUE}═════════════════════════════════════════════════════════════════${NC}"
    echo -e "Total zombies found: ${RED}${zombie_count}${NC}"
    echo ""

    # Return the PIDs as output
    printf '%s\n' "${pids[@]}"
}

###############################################################################
# Function: Prompt to kill zombies
###############################################################################
prompt_kill() {
    local pids=("$@")

    if [[ ${#pids[@]} -eq 0 ]]; then
        return 1
    fi

    echo -e "${YELLOW}Warning: Killing zombies will terminate their parent processes.${NC}"
    echo ""

    # Try to interactively prompt
    if [[ -t 0 ]]; then
        read -p "Kill these zombie processes? (y/n) " -n 1 -r
        echo ""

        if [[ $REPLY =~ ^[Yy]$ ]]; then
            kill_zombies "${pids[@]}"
            return 0
        else
            echo -e "${BLUE}No action taken.${NC}"
            return 1
        fi
    else
        echo -e "${YELLOW}Not running in interactive mode. Use -y flag to auto-kill.${NC}"
        return 1
    fi
}

###############################################################################
# Function: Kill zombie processes (by killing parents)
###############################################################################
kill_zombies() {
    local pids=("$@")
    local killed=0

    echo ""
    echo -e "${BLUE}Killing parent processes of zombies...${NC}"
    echo ""

    for pid in "${pids[@]}"; do
        local ppid=$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ' || echo "")

        if [[ -z "$ppid" ]]; then
            echo -e "${YELLOW}PID $pid: Parent already gone${NC}"
            continue
        fi

        echo -n "Killing parent process PID $ppid (zombie: $pid)... "

        if kill -9 "$ppid" 2>/dev/null; then
            echo -e "${GREEN}✓${NC}"
            killed=$((killed + 1))
        else
            echo -e "${RED}✗ Failed${NC}"
        fi
    done

    echo ""
    echo -e "${GREEN}Killed ${killed} parent process(es)${NC}"

    # Recheck
    echo ""
    echo -e "${BLUE}Rechecking for remaining zombies...${NC}"
    local remaining=$(find_zombies)

    if [[ -z "$remaining" ]]; then
        echo -e "${GREEN}✓ All zombies eliminated!${NC}"
    else
        echo -e "${YELLOW}⚠ Some zombies remain. Rerunning check...${NC}"
        echo ""
        main
    fi
}

###############################################################################
# Function: Show help
###############################################################################
show_help() {
    cat << EOF
${BLUE}Zombie Process Checker${NC}

Usage: ./scripts/check-zombies.sh [OPTIONS]

Options:
    -h, --help      Show this help message
    -y, --yes       Auto-kill zombies without prompting
    -w, --watch     Continuously monitor for zombies (check every 5s)

Examples:
    # Check for zombies and prompt to kill
    ./scripts/check-zombies.sh

    # Auto-kill all zombies without prompting
    ./scripts/check-zombies.sh -y

    # Watch for zombies continuously
    ./scripts/check-zombies.sh -w

EOF
}

###############################################################################
# Function: Watch mode - continuously monitor
###############################################################################
watch_mode() {
    echo -e "${BLUE}Entering watch mode (Ctrl+C to exit)...${NC}"
    echo ""

    local last_count=0

    while true; do
        clear
        echo -e "${BLUE}Zombie Process Monitor - $(date '+%Y-%m-%d %H:%M:%S')${NC}"
        echo ""

        local zombies=$(find_zombies)

        if [[ -z "$zombies" ]]; then
            echo -e "${GREEN}✓ No zombie processes detected${NC}"
        else
            local current_count=$(echo "$zombies" | wc -l)

            if [[ $current_count -gt $last_count ]]; then
                echo -e "${RED}⚠ New zombies detected!${NC}"
            fi

            last_count=$current_count
            display_zombies "$zombies" > /dev/null
        fi

        sleep 5
    done
}

###############################################################################
# Main function
###############################################################################
main() {
    # Parse arguments
    local auto_kill=false
    local watch=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            -h|--help)
                show_help
                exit 0
                ;;
            -y|--yes)
                auto_kill=true
                shift
                ;;
            -w|--watch)
                watch=true
                shift
                ;;
            *)
                echo -e "${RED}Unknown option: $1${NC}"
                show_help
                exit 1
                ;;
        esac
    done

    # Check for watch mode first
    if [[ "$watch" == true ]]; then
        watch_mode
        exit 0
    fi

    # Find zombie processes
    echo -e "${BLUE}Scanning for zombie processes...${NC}"
    echo ""

    local zombies=$(find_zombies)

    if [[ -z "$zombies" ]]; then
        echo -e "${GREEN}✓ No zombie processes found${NC}"
        exit 0
    fi

    # Display zombies
    local pids=($(display_zombies "$zombies"))

    # Prompt to kill
    if [[ "$auto_kill" == true ]]; then
        kill_zombies "${pids[@]}"
        exit 0
    else
        if ! prompt_kill "${pids[@]}"; then
            exit 1
        fi
    fi
}

# Run main function with all arguments
main "$@"
