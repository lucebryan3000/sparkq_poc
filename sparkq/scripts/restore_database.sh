#!/usr/bin/env bash
set -euo pipefail

# Database restore script - lists and restores from backups

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DB_PATH="${PROJECT_ROOT}/sparkq/data/sparkq.db"
BACKUP_DIR="${PROJECT_ROOT}/sparkq/data/backups"

show_help() {
  cat << EOF
Database Restore Utility

Usage: $(basename "$0") [COMMAND]

Commands:
  list              List all available backups
  restore <N>       Restore from backup number N (from list)
  restore <path>    Restore from specific backup file path

Examples:
  $(basename "$0") list                      # Show all backups
  $(basename "$0") restore 1                 # Restore from most recent backup
  $(basename "$0") restore 2                 # Restore from 2nd most recent backup
  $(basename "$0") restore /path/to/backup.db

EOF
}

list_backups() {
  if [[ ! -d "$BACKUP_DIR" ]]; then
    echo "No backups found (backup directory doesn't exist)"
    return
  fi

  local backups=($(ls -1tr "$BACKUP_DIR"/sparkq_*.db 2>/dev/null || true))

  if [[ ${#backups[@]} -eq 0 ]]; then
    echo "No backups found"
    return
  fi

  echo "Available backups (most recent first):"
  echo ""

  local count=1
  for ((i=${#backups[@]}-1; i>=0; i--)); do
    local backup="${backups[$i]}"
    local filename=$(basename "$backup")
    local size=$(du -h "$backup" | cut -f1)
    local timestamp=$(stat -c %y "$backup" 2>/dev/null | cut -d' ' -f1,2 || stat -f "%Sm" "$backup" 2>/dev/null || echo "unknown")

    echo "  [$count] $filename ($size) - $timestamp"
    ((count++))
  done
}

restore_backup() {
  local target="$1"
  local backup_file=""

  # If it's a number, find the Nth backup from the list
  if [[ "$target" =~ ^[0-9]+$ ]]; then
    local backups=($(ls -1tr "$BACKUP_DIR"/sparkq_*.db 2>/dev/null || true))

    if [[ ${#backups[@]} -eq 0 ]]; then
      echo "Error: No backups available"
      return 1
    fi

    local index=$((${#backups[@]} - target))
    if [[ $index -lt 0 ]]; then
      echo "Error: Backup #$target not found (only ${#backups[@]} backups available)"
      return 1
    fi

    backup_file="${backups[$index]}"
  else
    # Treat as a file path
    backup_file="$target"
  fi

  # Verify backup exists
  if [[ ! -f "$backup_file" ]]; then
    echo "Error: Backup not found: $backup_file"
    return 1
  fi

  # Verify it's a valid SQLite database
  if ! sqlite3 "$backup_file" ".tables" > /dev/null 2>&1; then
    echo "Error: Invalid database file: $backup_file"
    return 1
  fi

  # Confirm restore
  echo "About to restore from: $backup_file"
  echo "Current database will be backed up as: sparkq_preRestore_$(date +%Y%m%d_%H%M%S).db"
  echo ""
  read -p "Continue? (y/N): " -r confirm

  if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo "Cancelled"
    return 0
  fi

  # Backup current database before restore
  if [[ -f "$DB_PATH" ]]; then
    cp "$DB_PATH" "$BACKUP_DIR/sparkq_preRestore_$(date +%Y%m%d_%H%M%S).db"
    echo "Current database backed up"
  fi

  # Restore the backup
  cp "$backup_file" "$DB_PATH"
  echo ""
  echo "✓ Database restored from: $(basename "$backup_file")"
  echo "✓ Database path: $DB_PATH"
}

# Main
if [[ $# -eq 0 ]]; then
  show_help
  exit 0
fi

case "${1:-}" in
  list)
    list_backups
    ;;
  restore)
    if [[ -z "${2:-}" ]]; then
      echo "Error: restore requires a backup number or path"
      show_help
      exit 1
    fi
    restore_backup "$2"
    ;;
  -h|--help)
    show_help
    ;;
  *)
    echo "Error: Unknown command: $1"
    show_help
    exit 1
    ;;
esac
