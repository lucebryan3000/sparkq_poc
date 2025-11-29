#!/usr/bin/env bash

# SparkQ Watcher - monitors a stream and sends wake signals via FIFO

set -uo pipefail

STREAM_NAME="${1:-}"

if [[ -z "$STREAM_NAME" ]]; then
  echo "Usage: $0 <stream_name>" >&2
  exit 1
fi

LOCK_FILE="/tmp/sparkq-${STREAM_NAME}.lock"
PIPE_PATH="/tmp/sparkq-${STREAM_NAME}-pipe"
LOG_FILE="/tmp/sparkq-${STREAM_NAME}-watcher.log"

idle_interval=60
busy_interval=120
interval=$idle_interval
last_state="init"
cleanup_done=false
PIPE_FD=""

log() {
  local level="$1"
  shift
  local message="$*"
  printf "[%s] [%s] %s\n" "$(date +%H:%M:%S)" "$level" "$message" >> "$LOG_FILE"
}

check_lock() {
  if [[ ! -f "$LOCK_FILE" ]]; then
    return
  fi

  local existing_pid
  existing_pid="$(cat "$LOCK_FILE" 2>/dev/null || true)"

  if [[ -n "$existing_pid" ]] && ps -p "$existing_pid" > /dev/null 2>&1; then
    log "ERROR" "Watcher already running for stream '${STREAM_NAME}' (pid: ${existing_pid})"
    echo "Watcher already running for stream '${STREAM_NAME}' (pid: ${existing_pid})" >&2
    exit 1
  fi

  log "INFO" "Stale lock detected for pid '${existing_pid}', cleaning up"
  rm -f "$LOCK_FILE"
}

create_lock() {
  echo "$$" > "$LOCK_FILE"
}

remove_lock() {
  rm -f "$LOCK_FILE"
}

setup_pipe() {
  if [[ -e "$PIPE_PATH" && ! -p "$PIPE_PATH" ]]; then
    rm -f "$PIPE_PATH"
  fi

  if [[ ! -p "$PIPE_PATH" ]]; then
    mkfifo "$PIPE_PATH"
  fi

  # Open FIFO for read/write so writes do not block when no external reader exists.
  exec {PIPE_FD}<>"$PIPE_PATH" || {
    log "ERROR" "Failed to open FIFO at ${PIPE_PATH}"
    echo "Failed to open FIFO at ${PIPE_PATH}" >&2
    exit 1
  }
}

cleanup_pipe() {
  if [[ -n "${PIPE_FD:-}" ]]; then
    exec {PIPE_FD}>&- 2>/dev/null || true
    exec {PIPE_FD}<&- 2>/dev/null || true
  fi
  rm -f "$PIPE_PATH"
}

check_for_tasks() {
  local output
  if ! output=$(sparkq peek --stream="$STREAM_NAME" 2>&1); then
    log "ERROR" "sparkq peek failed: $output"
    return 1
  fi

  if grep -qi "No queued tasks" <<< "$output"; then
    return 1
  fi

  return 0
}

send_signal() {
  if [[ -z "${PIPE_FD:-}" ]]; then
    log "ERROR" "FIFO not initialized; cannot send wake signal"
    return 1
  fi

  if ! printf 'wake\n' >&"$PIPE_FD" 2>/dev/null; then
    log "ERROR" "Failed to write wake signal to ${PIPE_PATH}"
    return 1
  fi

  return 0
}

shutdown() {
  local reason="${1:-EXIT}"
  if [[ "$cleanup_done" == "true" ]]; then
    return
  fi
  cleanup_done=true

  log "INFO" "Shutting down watcher for stream '${STREAM_NAME}' (reason: ${reason})"
  cleanup_pipe
  remove_lock
}

trap 'shutdown SIGINT; exit 0' SIGINT
trap 'shutdown SIGTERM; exit 0' SIGTERM
trap 'shutdown EXIT' EXIT

main() {
  touch "$LOG_FILE"

  check_lock
  create_lock
  setup_pipe

  log "INFO" "Watcher started for stream '${STREAM_NAME}'"

  while true; do
    if check_for_tasks; then
      log "INFO" "Task found, sending wake signal"
      send_signal
      interval=$busy_interval
      last_state="busy"
    else
      interval=$idle_interval
      if [[ "$last_state" != "idle" ]]; then
        log "INFO" "No task found, checking again in ${interval} seconds"
      fi
      last_state="idle"
    fi

    sleep "$interval" &
    wait $!
  done
}

main "$@"
