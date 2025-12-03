#!/usr/bin/env bash
set -euo pipefail

# SparkQ Database Restore Utility
# Supports both new bundle format and legacy .db files

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DB_PATH="${PROJECT_ROOT}/sparkq/data/sparkq.db"
CONFIG_PATH="${PROJECT_ROOT}/sparkq.yml"
BACKUP_DIR="${PROJECT_ROOT}/sparkq/data/backups"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

show_help() {
  cat << EOF
SparkQ Database Restore Utility

Usage: $(basename "$0") [COMMAND] [OPTIONS]

Commands:
  list                  List all available backups with details
  show <N|path>         Show backup manifest/contents without restoring
  restore <N|path>      Restore database + config from backup
  restore-config <N>    Restore only sparkq.yml from backup (keeps current DB)
  restore-env <N>       Restore only .env from backup
  restore-templates <N> Restore setup template files
  export-config <N>     Export config_export.json to stdout
  export-tools <N>      Export tools_export.json to stdout
  export-prompts <N>    Export prompts from backup to stdout (for manual review)

Options:
  --db-only             Only restore database, skip config files
  --config-only         Only restore sparkq.yml + .env, skip database
  --yes, -y             Skip confirmation prompt

Examples:
  $(basename "$0") list                      # Show all backups with details
  $(basename "$0") show 1                    # Show manifest of most recent backup
  $(basename "$0") restore 1                 # Full restore (DB + config)
  $(basename "$0") restore 2 --db-only       # Restore only DB
  $(basename "$0") restore 1 --config-only   # Restore only sparkq.yml + .env
  $(basename "$0") restore-templates 1       # Restore setup example files
  $(basename "$0") export-config 1           # View config entries in backup
  $(basename "$0") export-tools 1            # View tool definitions in backup

Backup bundles include:
  CRITICAL (configuration):
  - sparkq.yml           Main configuration file
  - .env                 Environment variables (API keys, secrets)
  - config_export.json   Runtime config settings
  - tools_export.json    Tool definitions with task classes
  - task_classes_export.json Timeout configurations

  SETUP TEMPLATES:
  - setup_templates/sparkq.yml.example
  - setup_templates/.env.example
  - setup_templates/requirements.txt.example

  DATABASE:
  - sparkq.db            The SQLite database

  REFERENCE (can be rebuilt):
  - prompts_export.json  Text expanders (seeded from defaults)
  - agent_roles_export.json Role definitions

EOF
}

# Get list of backups (newest first)
get_backups() {
  local backups=()

  # New-style bundle directories (newest first)
  while IFS= read -r dir; do
    [[ -n "$dir" ]] && backups+=("$dir")
  done < <(ls -1td "$BACKUP_DIR"/sparkq_[0-9]* 2>/dev/null | grep -v "preRestore" | grep -v "\.db$" || true)

  # Old-style .db files (newest first)
  while IFS= read -r file; do
    [[ -n "$file" ]] && backups+=("$file")
  done < <(ls -1t "$BACKUP_DIR"/sparkq_*.db 2>/dev/null | grep -v "preRestore" || true)

  printf '%s\n' "${backups[@]}"
}

list_backups() {
  if [[ ! -d "$BACKUP_DIR" ]]; then
    echo "No backups found (backup directory doesn't exist)"
    return
  fi

  local backups
  mapfile -t backups < <(get_backups)

  if [[ ${#backups[@]} -eq 0 ]]; then
    echo "No backups found"
    return
  fi

  echo -e "${BLUE}Available backups (most recent first):${NC}"
  echo ""

  local count=1
  for backup in "${backups[@]}"; do
    local name
    name=$(basename "$backup")

    if [[ -d "$backup" ]]; then
      # New bundle format
      local manifest="$backup/manifest.json"
      if [[ -f "$manifest" ]]; then
        local created_at integrity config_count tools_count task_classes_count
        created_at=$(grep -o '"created_at": *"[^"]*"' "$manifest" | cut -d'"' -f4 | head -1)
        integrity=$(grep -o '"integrity_check": *"[^"]*"' "$manifest" | cut -d'"' -f4 | head -1)
        config_count=$(grep -o '"config_entries": *[0-9]*' "$manifest" | grep -o '[0-9]*' | head -1)
        tools_count=$(grep -o '"tools": *[0-9]*' "$manifest" | grep -o '[0-9]*' | head -1)
        task_classes_count=$(grep -o '"task_classes": *[0-9]*' "$manifest" | grep -o '[0-9]*' | head -1)

        local db_size="?"
        [[ -f "$backup/sparkq.db" ]] && db_size=$(du -h "$backup/sparkq.db" | cut -f1)

        local has_config="no" has_env="no" has_templates="no"
        [[ -f "$backup/sparkq.yml" ]] && has_config="yes"
        [[ -f "$backup/.env" ]] && has_env="yes"
        [[ -d "$backup/setup_templates" ]] && has_templates="yes"

        echo -e "  ${GREEN}[$count]${NC} $name (bundle)"
        echo -e "      Config: yml=${has_config} env=${has_env} templates=${has_templates}"
        echo -e "      DB: ${db_size} | config:${config_count:-0} tools:${tools_count:-0} task_classes:${task_classes_count:-0}"
        echo -e "      Created: ${created_at:-unknown} | Integrity: ${integrity:-unknown}"
      else
        local size
        size=$(du -sh "$backup" 2>/dev/null | cut -f1)
        echo -e "  ${GREEN}[$count]${NC} $name (bundle, ${size})"
      fi
    else
      # Legacy .db file
      local size timestamp
      size=$(du -h "$backup" | cut -f1)
      timestamp=$(stat -c %y "$backup" 2>/dev/null | cut -d' ' -f1,2 || stat -f "%Sm" "$backup" 2>/dev/null || echo "unknown")
      echo -e "  ${YELLOW}[$count]${NC} $name (legacy, ${size}) - $timestamp"
    fi
    echo ""
    ((count++))
  done
}

show_backup() {
  local target="$1"
  local backup_path
  backup_path=$(resolve_backup "$target")

  if [[ ! -e "$backup_path" ]]; then
    echo -e "${RED}Error: Backup not found${NC}"
    return 1
  fi

  echo -e "${BLUE}Backup: $(basename "$backup_path")${NC}"
  echo ""

  if [[ -d "$backup_path" ]]; then
    # Show manifest
    if [[ -f "$backup_path/manifest.json" ]]; then
      echo -e "${GREEN}Manifest:${NC}"
      cat "$backup_path/manifest.json"
      echo ""
    fi

    # Show files
    echo -e "${GREEN}Contents:${NC}"
    ls -la "$backup_path/"
  else
    # Legacy .db file
    echo "Legacy backup file (no manifest)"
    ls -la "$backup_path"

    # Show table counts if sqlite3 available
    if command -v sqlite3 &> /dev/null; then
      echo ""
      echo -e "${GREEN}Database contents:${NC}"
      sqlite3 "$backup_path" "SELECT 'prompts: ' || COUNT(*) FROM prompts;" 2>/dev/null || true
      sqlite3 "$backup_path" "SELECT 'config: ' || COUNT(*) FROM config;" 2>/dev/null || true
      sqlite3 "$backup_path" "SELECT 'agent_roles: ' || COUNT(*) FROM agent_roles;" 2>/dev/null || true
    fi
  fi
}

export_prompts() {
  local target="$1"
  local backup_path
  backup_path=$(resolve_backup "$target")

  if [[ -d "$backup_path" && -f "$backup_path/prompts_export.json" ]]; then
    cat "$backup_path/prompts_export.json"
  elif [[ -f "$backup_path" ]] && command -v sqlite3 &> /dev/null; then
    sqlite3 "$backup_path" <<'SQL'
.mode json
SELECT id, command, label, template_text, description, category, active FROM prompts ORDER BY command;
SQL
  else
    echo -e "${RED}Error: Cannot export prompts from this backup${NC}"
    return 1
  fi
}

resolve_backup() {
  local target="$1"

  # If it's a number, find the Nth backup from the list
  if [[ "$target" =~ ^[0-9]+$ ]]; then
    local backups
    mapfile -t backups < <(get_backups)

    if [[ ${#backups[@]} -eq 0 ]]; then
      echo ""
      return 1
    fi

    local index=$((target - 1))
    if [[ $index -lt 0 ]] || [[ $index -ge ${#backups[@]} ]]; then
      echo ""
      return 1
    fi

    echo "${backups[$index]}"
  else
    # Treat as a file/dir path
    echo "$target"
  fi
}

restore_backup() {
  local target="$1"
  shift

  local db_only=false
  local config_only=false
  local skip_confirm=false

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --db-only) db_only=true; shift ;;
      --config-only) config_only=true; shift ;;
      --yes|-y) skip_confirm=true; shift ;;
      *) shift ;;
    esac
  done

  local backup_path
  backup_path=$(resolve_backup "$target")

  if [[ -z "$backup_path" ]] || [[ ! -e "$backup_path" ]]; then
    echo -e "${RED}Error: Backup #$target not found${NC}"
    return 1
  fi

  # Determine what we're restoring
  local db_source=""
  local config_source=""
  local env_source=""

  if [[ -d "$backup_path" ]]; then
    # New bundle format
    [[ -f "$backup_path/sparkq.db" ]] && db_source="$backup_path/sparkq.db"
    [[ -f "$backup_path/sparkq.yml" ]] && config_source="$backup_path/sparkq.yml"
    [[ -f "$backup_path/.env" ]] && env_source="$backup_path/.env"
  else
    # Legacy .db file
    db_source="$backup_path"
  fi

  # Verify sources exist
  if [[ -z "$db_source" ]] && [[ "$config_only" != "true" ]]; then
    echo -e "${RED}Error: No database found in backup${NC}"
    return 1
  fi

  if [[ -z "$config_source" ]] && [[ "$config_only" == "true" ]]; then
    echo -e "${RED}Error: No sparkq.yml found in backup (legacy backup?)${NC}"
    return 1
  fi

  # Verify database integrity if restoring DB
  if [[ -n "$db_source" ]] && [[ "$config_only" != "true" ]] && command -v sqlite3 &> /dev/null; then
    if ! sqlite3 "$db_source" ".tables" > /dev/null 2>&1; then
      echo -e "${RED}Error: Invalid database file in backup${NC}"
      return 1
    fi
  fi

  # Show what will be restored
  echo -e "${BLUE}Restore from: $(basename "$backup_path")${NC}"
  echo ""

  if [[ "$config_only" == "true" ]]; then
    echo "  Will restore: configuration files only"
    [[ -n "$config_source" ]] && echo "    - sparkq.yml"
    [[ -n "$env_source" ]] && echo "    - .env"
  elif [[ "$db_only" == "true" ]]; then
    echo "  Will restore: sparkq.db only"
  else
    echo "  Will restore:"
    [[ -n "$db_source" ]] && echo "    - sparkq.db"
    [[ -n "$config_source" ]] && echo "    - sparkq.yml"
    [[ -n "$env_source" ]] && echo "    - .env"
  fi
  echo ""

  # Show what will be backed up
  echo "  Pre-restore backups will be created:"
  [[ -f "$DB_PATH" ]] && [[ "$config_only" != "true" ]] && echo "    - sparkq_preRestore_*.db"
  [[ -f "$CONFIG_PATH" ]] && [[ "$db_only" != "true" ]] && [[ -n "$config_source" ]] && echo "    - sparkq_preRestore_*.yml"
  [[ -f "$PROJECT_ROOT/.env" ]] && [[ "$db_only" != "true" ]] && [[ -n "$env_source" ]] && echo "    - sparkq_preRestore_*.env"
  echo ""

  # Confirm
  if [[ "$skip_confirm" != "true" ]]; then
    read -p "Continue? (y/N): " -r confirm
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
      echo "Cancelled"
      return 0
    fi
  fi

  local pre_restore_ts
  pre_restore_ts=$(date +%Y%m%d_%H%M%S)

  # Backup current database before restore
  if [[ -f "$DB_PATH" ]] && [[ "$config_only" != "true" ]]; then
    cp "$DB_PATH" "$BACKUP_DIR/sparkq_preRestore_${pre_restore_ts}.db"
    echo -e "${GREEN}✓${NC} Current database backed up"
  fi

  # Backup current config before restore
  if [[ -f "$CONFIG_PATH" ]] && [[ "$db_only" != "true" ]] && [[ -n "$config_source" ]]; then
    cp "$CONFIG_PATH" "$BACKUP_DIR/sparkq_preRestore_${pre_restore_ts}.yml"
    echo -e "${GREEN}✓${NC} Current sparkq.yml backed up"
  fi

  # Backup current .env before restore
  if [[ -f "$PROJECT_ROOT/.env" ]] && [[ "$db_only" != "true" ]] && [[ -n "$env_source" ]]; then
    cp "$PROJECT_ROOT/.env" "$BACKUP_DIR/sparkq_preRestore_${pre_restore_ts}.env"
    echo -e "${GREEN}✓${NC} Current .env backed up"
  fi

  # Restore database
  if [[ -n "$db_source" ]] && [[ "$config_only" != "true" ]]; then
    cp "$db_source" "$DB_PATH"
    # Also restore WAL files if they exist
    [[ -f "${db_source}-wal" ]] && cp "${db_source}-wal" "${DB_PATH}-wal"
    [[ -f "${db_source}-shm" ]] && cp "${db_source}-shm" "${DB_PATH}-shm"
    echo -e "${GREEN}✓${NC} Database restored"
  fi

  # Restore config
  if [[ -n "$config_source" ]] && [[ "$db_only" != "true" ]]; then
    cp "$config_source" "$CONFIG_PATH"
    echo -e "${GREEN}✓${NC} sparkq.yml restored"
  fi

  # Restore .env
  if [[ -n "$env_source" ]] && [[ "$db_only" != "true" ]]; then
    cp "$env_source" "$PROJECT_ROOT/.env"
    echo -e "${GREEN}✓${NC} .env restored"
  fi

  echo ""
  echo -e "${GREEN}Restore complete!${NC}"
  echo ""
  echo "If the server was running, restart it: ./sparkq.sh restart"
}

restore_config_only() {
  local target="$1"
  shift
  restore_backup "$target" --config-only "$@"
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
  show)
    if [[ -z "${2:-}" ]]; then
      echo "Error: show requires a backup number or path"
      exit 1
    fi
    show_backup "$2"
    ;;
  restore)
    if [[ -z "${2:-}" ]]; then
      echo "Error: restore requires a backup number or path"
      show_help
      exit 1
    fi
    shift
    restore_backup "$@"
    ;;
  restore-config)
    if [[ -z "${2:-}" ]]; then
      echo "Error: restore-config requires a backup number"
      exit 1
    fi
    shift
    restore_config_only "$@"
    ;;
  export-prompts)
    if [[ -z "${2:-}" ]]; then
      echo "Error: export-prompts requires a backup number"
      exit 1
    fi
    export_prompts "$2"
    ;;
  export-config)
    if [[ -z "${2:-}" ]]; then
      echo "Error: export-config requires a backup number"
      exit 1
    fi
    backup_path=$(resolve_backup "$2")
    if [[ -d "$backup_path" && -f "$backup_path/config_export.json" ]]; then
      cat "$backup_path/config_export.json"
    else
      echo -e "${RED}Error: config_export.json not found in backup${NC}"
      exit 1
    fi
    ;;
  export-tools)
    if [[ -z "${2:-}" ]]; then
      echo "Error: export-tools requires a backup number"
      exit 1
    fi
    backup_path=$(resolve_backup "$2")
    if [[ -d "$backup_path" && -f "$backup_path/tools_export.json" ]]; then
      cat "$backup_path/tools_export.json"
    else
      echo -e "${RED}Error: tools_export.json not found in backup${NC}"
      exit 1
    fi
    ;;
  restore-env)
    if [[ -z "${2:-}" ]]; then
      echo "Error: restore-env requires a backup number"
      exit 1
    fi
    backup_path=$(resolve_backup "$2")
    if [[ -d "$backup_path" && -f "$backup_path/.env" ]]; then
      if [[ -f "$PROJECT_ROOT/.env" ]]; then
        cp "$PROJECT_ROOT/.env" "$BACKUP_DIR/sparkq_preRestore_$(date +%Y%m%d_%H%M%S).env"
        echo -e "${GREEN}✓${NC} Current .env backed up"
      fi
      cp "$backup_path/.env" "$PROJECT_ROOT/.env"
      echo -e "${GREEN}✓${NC} .env restored from backup"
    else
      echo -e "${RED}Error: .env not found in backup${NC}"
      exit 1
    fi
    ;;
  restore-templates)
    if [[ -z "${2:-}" ]]; then
      echo "Error: restore-templates requires a backup number"
      exit 1
    fi
    backup_path=$(resolve_backup "$2")
    SETUP_DIR="$PROJECT_ROOT/sparkq/scripts/setup"
    if [[ -d "$backup_path/setup_templates" ]]; then
      [[ -f "$backup_path/setup_templates/sparkq.yml.example" ]] && cp "$backup_path/setup_templates/sparkq.yml.example" "$SETUP_DIR/" && echo -e "${GREEN}✓${NC} sparkq.yml.example restored"
      [[ -f "$backup_path/setup_templates/.env.example" ]] && cp "$backup_path/setup_templates/.env.example" "$SETUP_DIR/" && echo -e "${GREEN}✓${NC} .env.example restored"
      [[ -f "$backup_path/setup_templates/requirements.txt.example" ]] && cp "$backup_path/setup_templates/requirements.txt.example" "$SETUP_DIR/" && echo -e "${GREEN}✓${NC} requirements.txt.example restored"
    else
      echo -e "${RED}Error: setup_templates not found in backup${NC}"
      exit 1
    fi
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
