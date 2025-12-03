#!/usr/bin/env bash
set -euo pipefail

# SparkQ Comprehensive Backup Script
# Creates backup bundles with database + configuration exports
# Retention: Last 7 versions (configurable via SPARKQ_BACKUP_KEEP)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DB_PATH="${PROJECT_ROOT}/sparkq/data/sparkq.db"
CONFIG_PATH="${PROJECT_ROOT}/sparkq.yml"
BACKUP_DIR="${PROJECT_ROOT}/sparkq/data/backups"

# Retention: default 7 versions
BACKUP_KEEP="${SPARKQ_BACKUP_KEEP:-7}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Only backup if database exists
if [[ ! -f "$DB_PATH" ]]; then
  exit 0
fi

# Generate backup bundle name with timestamp
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BUNDLE_DIR="${BACKUP_DIR}/sparkq_${TIMESTAMP}"

# Check if sqlite3 is available
if ! command -v sqlite3 &> /dev/null; then
  echo -e "${YELLOW}Warning: sqlite3 not found, falling back to simple file copy${NC}"
  cp "$DB_PATH" "${BACKUP_DIR}/sparkq_${TIMESTAMP}.db"
  exit 0
fi

# Verify database integrity before backup
INTEGRITY_CHECK=$(sqlite3 "$DB_PATH" "PRAGMA integrity_check;" 2>/dev/null || echo "failed")
if [[ "$INTEGRITY_CHECK" != "ok" ]]; then
  echo -e "${YELLOW}Warning: Database integrity check returned: ${INTEGRITY_CHECK}${NC}"
  echo -e "${YELLOW}Proceeding with backup anyway...${NC}"
fi

# Create backup bundle directory
mkdir -p "$BUNDLE_DIR"

# 1. Copy the database file
cp "$DB_PATH" "$BUNDLE_DIR/sparkq.db"

# Also copy WAL files if they exist (for consistent state)
[[ -f "${DB_PATH}-wal" ]] && cp "${DB_PATH}-wal" "$BUNDLE_DIR/sparkq.db-wal" || true
[[ -f "${DB_PATH}-shm" ]] && cp "${DB_PATH}-shm" "$BUNDLE_DIR/sparkq.db-shm" || true

# 2. Copy sparkq.yml configuration if it exists
if [[ -f "$CONFIG_PATH" ]]; then
  cp "$CONFIG_PATH" "$BUNDLE_DIR/sparkq.yml"
fi

# 3. Export configuration tables to JSON for easy inspection/recovery
# Export config table
sqlite3 "$DB_PATH" <<'SQL' > "$BUNDLE_DIR/config_export.json" 2>/dev/null || echo "[]" > "$BUNDLE_DIR/config_export.json"
.mode json
SELECT namespace, key, value, updated_at, updated_by FROM config ORDER BY namespace, key;
SQL

# Export prompts table
sqlite3 "$DB_PATH" <<'SQL' > "$BUNDLE_DIR/prompts_export.json" 2>/dev/null || echo "[]" > "$BUNDLE_DIR/prompts_export.json"
.mode json
SELECT id, command, label, template_text, description, category, active, created_at, updated_at FROM prompts ORDER BY command;
SQL

# Export agent_roles table
sqlite3 "$DB_PATH" <<'SQL' > "$BUNDLE_DIR/agent_roles_export.json" 2>/dev/null || echo "[]" > "$BUNDLE_DIR/agent_roles_export.json"
.mode json
SELECT id, key, label, description, active, created_at, updated_at FROM agent_roles ORDER BY key;
SQL

# Export tools table
sqlite3 "$DB_PATH" <<'SQL' > "$BUNDLE_DIR/tools_export.json" 2>/dev/null || echo "[]" > "$BUNDLE_DIR/tools_export.json"
.mode json
SELECT name, description, task_class, created_at, updated_at FROM tools ORDER BY name;
SQL

# Export task_classes table
sqlite3 "$DB_PATH" <<'SQL' > "$BUNDLE_DIR/task_classes_export.json" 2>/dev/null || echo "[]" > "$BUNDLE_DIR/task_classes_export.json"
.mode json
SELECT name, timeout, description, created_at, updated_at FROM task_classes ORDER BY name;
SQL

# Export projects table (for reference)
sqlite3 "$DB_PATH" <<'SQL' > "$BUNDLE_DIR/projects_export.json" 2>/dev/null || echo "[]" > "$BUNDLE_DIR/projects_export.json"
.mode json
SELECT id, name, repo_path, prd_path, created_at, updated_at FROM projects ORDER BY name;
SQL

# 4. Get counts for manifest
CONFIG_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM config;" 2>/dev/null || echo "0")
PROMPTS_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM prompts;" 2>/dev/null || echo "0")
AGENT_ROLES_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM agent_roles;" 2>/dev/null || echo "0")
TOOLS_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM tools;" 2>/dev/null || echo "0")
TASK_CLASSES_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM task_classes;" 2>/dev/null || echo "0")
SESSIONS_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM sessions;" 2>/dev/null || echo "0")
QUEUES_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM queues;" 2>/dev/null || echo "0")
TASKS_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM tasks;" 2>/dev/null || echo "0")

# 5. Create manifest.json with backup metadata
DB_SIZE=$(du -h "$DB_PATH" 2>/dev/null | cut -f1 || echo "unknown")
cat > "$BUNDLE_DIR/manifest.json" << EOF
{
  "backup_version": "2.0",
  "created_at": "$(date -Iseconds)",
  "timestamp": "${TIMESTAMP}",
  "integrity_check": "${INTEGRITY_CHECK}",
  "database": {
    "path": "${DB_PATH}",
    "size": "${DB_SIZE}"
  },
  "config_file": $([ -f "$CONFIG_PATH" ] && echo "true" || echo "false"),
  "counts": {
    "config_entries": ${CONFIG_COUNT},
    "prompts": ${PROMPTS_COUNT},
    "agent_roles": ${AGENT_ROLES_COUNT},
    "tools": ${TOOLS_COUNT},
    "task_classes": ${TASK_CLASSES_COUNT},
    "sessions": ${SESSIONS_COUNT},
    "queues": ${QUEUES_COUNT},
    "tasks": ${TASKS_COUNT}
  },
  "files": [
    "sparkq.db",
    "sparkq.yml",
    "config_export.json",
    "prompts_export.json",
    "agent_roles_export.json",
    "tools_export.json",
    "task_classes_export.json",
    "projects_export.json",
    "manifest.json"
  ]
}
EOF

# 6. Clean up old backups - keep only last N (default 7)
# Handle both old-style .db files and new-style bundle directories
cleanup_old_backups() {
  local keep_count=$1

  # Clean up old-style single .db files (legacy)
  local db_files
  db_files=$(ls -1tr "$BACKUP_DIR"/sparkq_*.db 2>/dev/null | grep -v "preRestore" || true)
  local db_count
  db_count=$(echo "$db_files" | grep -c . 2>/dev/null || echo "0")
  if [[ $db_count -gt $keep_count ]]; then
    echo "$db_files" | head -n $((db_count - keep_count)) | xargs rm -f 2>/dev/null || true
  fi

  # Clean up new-style bundle directories
  local bundle_dirs
  bundle_dirs=$(ls -1trd "$BACKUP_DIR"/sparkq_[0-9]* 2>/dev/null | grep -v "preRestore" | grep -v "\.db$" || true)
  local bundle_count
  bundle_count=$(echo "$bundle_dirs" | grep -c . 2>/dev/null || echo "0")
  if [[ $bundle_count -gt $keep_count ]]; then
    echo "$bundle_dirs" | head -n $((bundle_count - keep_count)) | xargs rm -rf 2>/dev/null || true
  fi
}

cleanup_old_backups "$BACKUP_KEEP"

# Summary output
echo -e "${GREEN}Backup created: ${BUNDLE_DIR}${NC}"
echo -e "  Database: sparkq.db (${DB_SIZE})"
echo -e "  Config exports: ${CONFIG_COUNT} entries, ${PROMPTS_COUNT} prompts, ${AGENT_ROLES_COUNT} roles"
echo -e "  Retention: keeping last ${BACKUP_KEEP} backups"
