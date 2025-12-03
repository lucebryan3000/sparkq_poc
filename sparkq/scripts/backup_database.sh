#!/usr/bin/env bash
set -euo pipefail

# Database backup script - keeps last 3 versions
# Run this at startup to create rotating backups

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DB_PATH="${PROJECT_ROOT}/sparkq/data/sparkq.db"
BACKUP_DIR="${PROJECT_ROOT}/sparkq/data/backups"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Only backup if database exists
if [[ ! -f "$DB_PATH" ]]; then
  exit 0
fi

# Generate backup filename with timestamp
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/sparkq_${TIMESTAMP}.db"

# Copy database to backup
cp "$DB_PATH" "$BACKUP_FILE"

# Clean up old backups - keep only last 3
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/sparkq_*.db 2>/dev/null | wc -l)
if [[ $BACKUP_COUNT -gt 3 ]]; then
  # Delete oldest backups, keeping the 3 most recent
  ls -1tr "$BACKUP_DIR"/sparkq_*.db | head -n $((BACKUP_COUNT - 3)) | xargs rm -f
fi

echo "Database backed up to: $BACKUP_FILE"
