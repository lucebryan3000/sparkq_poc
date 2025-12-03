#!/bin/bash

# SparkQ Teardown - clean removal of SparkQueue artifacts.

set -uo pipefail
shopt -s nullglob # allow globs to resolve to empty when nothing matches

# Colors (only when stdout is a terminal)
if [[ -t 1 ]]; then
  GREEN='\033[0;32m'
  RED='\033[0;31m'
  YELLOW='\033[1;33m'
  BOLD='\033[1m'
  NC='\033[0m'
else
  GREEN=''
  RED=''
  YELLOW=''
  BOLD=''
  NC=''
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Go up from sparkq/scripts/teardown → sparkq/scripts → sparkq → repo root
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
SPARKQ_DIR="$PROJECT_ROOT/sparkq"

DATA_DIR="$SPARKQ_DIR/data"
LOG_DIR="$SPARKQ_DIR/logs"
CONFIG_FILE="$PROJECT_ROOT/sparkq.yml"
LOCK_FILE="$PROJECT_ROOT/sparkq.lock"
VENV_DIR="$PROJECT_ROOT/.venv"
BACKUP_ROOT="$SPARKQ_DIR/backup"
BACKUP_TS="$(date +"%Y%m%d-%H%M%S")"
BACKUP_DIR="$BACKUP_ROOT/$BACKUP_TS"
SETUP_HELPER="$SPARKQ_DIR/scripts/setup/setup.sh"

show_help() {
  cat << EOF
SparkQ Teardown
Clean removal of SparkQueue artifacts (database, config, logs)

What will be removed:
  - Database:    sparkq/data/sparkq.db (including WAL/SHM files)
  - Config:      sparkq.yml
  - Lock:        sparkq.lock
  - Logs:        sparkq/logs/

Usage:
./sparkq teardown
  ./sparkq/scripts/teardown/teardown.sh
  ./sparkq/scripts/teardown/teardown.sh --force
  ./sparkq/scripts/teardown/teardown.sh --help

Notes:
  --force skips all prompts and removes .venv/ as well.

Warning: This action cannot be undone
EOF
}

remove_entry() {
  local label="$1"
  shift
  local paths=("$@")
  local found=0
  local to_delete=()

  for path in "${paths[@]}"; do
    if [[ -e "$path" || -L "$path" ]]; then
      found=1
      to_delete+=("$path")
    fi
  done

  if ((found)); then
    if rm -rf -- "${to_delete[@]}"; then
      removed_count=$((removed_count + 1))
      echo -e "${GREEN}Removed${NC} $label"
    else
      failed_count=$((failed_count + 1))
      echo -e "${RED}Failed${NC} to remove $label (check permissions)"
    fi
  else
    echo "Already absent: $label"
  fi
}

backup_entry() {
  local label="$1"
  shift
  local paths=("$@")
  local copied=0

  for path in "${paths[@]}"; do
    if [[ ! -e "$path" && ! -L "$path" ]]; then
      continue
    fi

    # Preserve project-relative structure when possible
    local rel
    if [[ "$path" == "$PROJECT_ROOT"* ]]; then
      rel="${path#"$PROJECT_ROOT"/}"
    else
      rel="$(basename "$path")"
    fi

    local dest="$BACKUP_DIR/$rel"
    local dest_dir
    dest_dir="$(dirname "$dest")"
    mkdir -p "$dest_dir"

    if cp -a -- "$path" "$dest"; then
      copied=$((copied + 1))
    fi
  done

  if ((copied > 0)); then
    echo -e "${GREEN}Backed up${NC} $label to $BACKUP_DIR"
  else
    echo "No backup needed for $label"
  fi
}

FORCE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h)
      show_help
      exit 0
      ;;
    --force|-f)
      FORCE=true
      ;;
    *)
      echo "Unknown option: $1"
      echo
      show_help
      exit 1
      ;;
  esac
  shift
done

echo -e "${BOLD}SparkQ Teardown${NC}"
echo "Clean removal of SparkQueue artifacts (database, config, logs)"
echo
echo "This will remove:"
echo "  - Database:    sparkq/data/sparkq.db (including WAL/SHM files)"
echo "  - Config:      sparkq.yml"
echo "  - Lock:        sparkq.lock"
echo "  - Logs:        sparkq/logs/"
echo
if [[ -x "$SETUP_HELPER" ]]; then
  echo "To rebuild after teardown, run: $SETUP_HELPER"
else
  echo "To rebuild after teardown, run: sparkq/scripts/setup/setup.sh"
fi
echo
echo "Backups will be saved to: $BACKUP_DIR"
echo

mkdir -p "$BACKUP_DIR"

if [[ "$FORCE" != true ]]; then
  read -r -p "Remove SparkQ data, config, logs? This cannot be undone. [y/N] " confirm_main
  if [[ ! "$confirm_main" =~ ^[Yy]$ ]]; then
    echo "Teardown cancelled"
    exit 0
  fi
else
  echo "Proceeding without confirmation (--force, including .venv/ removal)."
fi

REMOVE_VENV=false
if [[ "$FORCE" == true ]]; then
  REMOVE_VENV=true
else
  read -r -p "Also remove virtual environment (.venv/)? [y/N] " confirm_venv
  if [[ "$confirm_venv" =~ ^[Yy]$ ]]; then
    REMOVE_VENV=true
  fi
fi
echo

removed_count=0
failed_count=0

db_targets=("$DATA_DIR"/sparkq.db*)
backup_entry "Database (sparkq/data/sparkq.db*)" "${db_targets[@]}"
remove_entry "Database (sparkq/data/sparkq.db*)" "${db_targets[@]}"
backup_entry "Config (sparkq.yml)" "$CONFIG_FILE"
remove_entry "Config (sparkq.yml)" "$CONFIG_FILE"
backup_entry "Lock file (sparkq.lock)" "$LOCK_FILE"
remove_entry "Lock file (sparkq.lock)" "$LOCK_FILE"
backup_entry "Logs directory (sparkq/logs/)" "$LOG_DIR"
remove_entry "Logs directory (sparkq/logs/)" "$LOG_DIR"

if [[ "$REMOVE_VENV" == true ]]; then
  backup_entry "Virtual environment (.venv/)" "$VENV_DIR"
  remove_entry "Virtual environment (.venv/)" "$VENV_DIR"
else
  echo "Skipped: Virtual environment (.venv/) left intact"
fi

if ((failed_count > 0)); then
  echo -e "${YELLOW}Completed with ${failed_count} issue(s).${NC}"
fi

if ((removed_count > 0)); then
  echo -e "${GREEN}Removed ${removed_count} item(s).${NC}"
else
  echo "Nothing to remove."
fi
