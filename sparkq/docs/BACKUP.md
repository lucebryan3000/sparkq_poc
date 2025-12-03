# SparkQ Backup & Recovery Guide

SparkQ automatically creates comprehensive backups of your database and configuration on every server start. This ensures you never lose critical settings like prompts, agent roles, or runtime configuration.

## Quick Reference

```bash
# List all backups
./sparkq.sh backup-list

# View backup contents
./sparkq.sh backup-show 1

# Full restore (database + config)
./sparkq.sh backup-restore 1

# Restore only database
./sparkq.sh backup-restore 1 --db-only

# Restore only sparkq.yml
./sparkq.sh backup-restore 1 --config-only
```

---

## What Gets Backed Up

Each backup is a **bundle** (directory) containing:

| File | Description | Recovery Use |
|------|-------------|--------------|
| `sparkq.db` | SQLite database (+ WAL files) | Full data restore |
| `sparkq.yml` | Main configuration file | Server/tool settings |
| `config_export.json` | Runtime config key/value pairs | Manual inspection |
| `prompts_export.json` | Text expander templates | Recover prompts if DB corrupt |
| `agent_roles_export.json` | Agent role definitions | Recover roles if DB corrupt |
| `tools_export.json` | Tool definitions | Recover tool config |
| `task_classes_export.json` | Timeout configurations | Recover timeouts |
| `projects_export.json` | Project metadata | Reference |
| `manifest.json` | Backup metadata & integrity | Verify backup health |

### Why JSON Exports?

The JSON files serve as a **human-readable safety net**. If the database becomes corrupted:
- You can open `prompts_export.json` and manually recreate your prompts
- You can inspect `config_export.json` to see your settings
- No special tools needed - just a text editor

---

## When Backups Happen

Backups are automatically triggered on:

| Command | Backup Created |
|---------|----------------|
| `./sparkq.sh start` | Yes |
| `./sparkq.sh run` | Yes |
| `./sparkq.sh restart` | Yes (before restart) |
| `./sparkq.sh stop` | No |
| `./sparkq.sh setup` | No |

This means every time you start the server, your current state is preserved first.

---

## Retention Policy

- **Default retention**: 7 backups
- **Configurable**: Set `SPARKQ_BACKUP_KEEP` environment variable
- **Pre-restore backups**: Always kept separately (named `sparkq_preRestore_*`)

```bash
# Keep 14 backups instead of 7
SPARKQ_BACKUP_KEEP=14 ./sparkq.sh start
```

With default settings and once-daily restarts, you have ~1 week of backup history.

---

## Backup Location

All backups are stored in:
```
sparkq/data/backups/
├── sparkq_20251203_143022/    # Bundle (new format)
│   ├── sparkq.db
│   ├── sparkq.yml
│   ├── config_export.json
│   ├── prompts_export.json
│   ├── agent_roles_export.json
│   ├── tools_export.json
│   ├── task_classes_export.json
│   ├── projects_export.json
│   └── manifest.json
├── sparkq_20251202_091544/    # Another bundle
└── sparkq_20251201_083012.db  # Legacy format (single file)
```

---

## Commands

### List Backups

```bash
./sparkq.sh backup-list
```

Output shows:
- Backup number (1 = most recent)
- Bundle or legacy format
- Database size
- Whether sparkq.yml is included
- Prompts and config entry counts
- Creation time
- Integrity check status

### Show Backup Details

```bash
./sparkq.sh backup-show 1
```

Displays the full manifest.json and lists all files in the backup bundle.

### Full Restore

```bash
./sparkq.sh backup-restore 1
```

Restores both:
- `sparkq.db` → `sparkq/data/sparkq.db`
- `sparkq.yml` → `sparkq.yml` (project root)

Before restoring, your current files are backed up as `sparkq_preRestore_*`.

### Restore Database Only

```bash
./sparkq.sh backup-restore 1 --db-only
```

Useful when:
- You've customized sparkq.yml and don't want to overwrite it
- Only the database is corrupted

### Restore Config Only

```bash
./sparkq.sh backup-restore 1 --config-only
```

Useful when:
- You accidentally deleted or corrupted sparkq.yml
- Database is fine

### Export Prompts for Review

```bash
./sparkq.sh backup-restore 1 export-prompts
```

Outputs the prompts JSON to stdout for inspection without restoring anything.

### Skip Confirmation

```bash
./sparkq.sh backup-restore 1 --yes
```

For scripted/automated restores.

---

## Recovery Scenarios

### Scenario 1: Accidentally Deleted sparkq.yml

```bash
# List backups to see what's available
./sparkq.sh backup-list

# Restore only the config file
./sparkq.sh backup-restore 1 --config-only
```

### Scenario 2: Database Corruption

```bash
# Stop server if running
./sparkq.sh stop

# Restore full backup
./sparkq.sh backup-restore 1

# Restart server
./sparkq.sh start
```

### Scenario 3: Lost Custom Prompts

If the database is completely unrecoverable but you have a backup bundle:

```bash
# View prompts from backup
cat sparkq/data/backups/sparkq_YYYYMMDD_HHMMSS/prompts_export.json | jq .

# Or use the export command
./sparkq/scripts/restore_database.sh export-prompts 1
```

Then manually recreate prompts via the UI or API.

### Scenario 4: Rollback After Bad Config Change

```bash
# See what backups exist
./sparkq.sh backup-list

# Show the backup before your change
./sparkq.sh backup-show 2

# Restore that backup
./sparkq.sh backup-restore 2

# Restart to apply
./sparkq.sh restart
```

### Scenario 5: Recover Settings from Old Backup

```bash
# View the config entries in an old backup
cat sparkq/data/backups/sparkq_YYYYMMDD_HHMMSS/config_export.json

# View agent roles
cat sparkq/data/backups/sparkq_YYYYMMDD_HHMMSS/agent_roles_export.json
```

---

## Manifest Format

Each backup includes a `manifest.json` with metadata:

```json
{
  "backup_version": "2.0",
  "created_at": "2025-12-03T14:30:22+00:00",
  "timestamp": "20251203_143022",
  "integrity_check": "ok",
  "database": {
    "path": "/home/user/sparkq/sparkq/data/sparkq.db",
    "size": "184K"
  },
  "config_file": true,
  "counts": {
    "config_entries": 5,
    "prompts": 33,
    "agent_roles": 8,
    "tools": 7,
    "task_classes": 4,
    "sessions": 12,
    "queues": 45,
    "tasks": 230
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
```

Key fields:
- `integrity_check`: SQLite `PRAGMA integrity_check` result ("ok" = healthy)
- `counts`: Quick reference for what's in the backup
- `config_file`: Whether sparkq.yml was included

---

## Configuration Tables Backed Up

### Config Table (`config_export.json`)
Runtime key/value settings stored in the database:
```json
[
  {"namespace": "server", "key": "auto_purge", "value": "true"},
  {"namespace": "ui", "key": "theme", "value": "dark"}
]
```

### Prompts Table (`prompts_export.json`)
Text expander templates (33 defaults + your customizations):
```json
[
  {
    "id": "prm_abc123",
    "command": "code-review",
    "label": "Code Review",
    "template_text": "Review the following code...",
    "description": "Review code for best practices",
    "category": "Core Dev & Code",
    "active": 1
  }
]
```

### Agent Roles (`agent_roles_export.json`)
Agent role definitions for task assignment:
```json
[
  {
    "key": "developer",
    "label": "Developer",
    "description": "Handles code generation and debugging",
    "active": true
  }
]
```

### Tools (`tools_export.json`)
Tool definitions with task class assignments:
```json
[
  {
    "name": "llm-sonnet",
    "description": "Sonnet",
    "task_class": "LLM_HEAVY"
  }
]
```

### Task Classes (`task_classes_export.json`)
Timeout configurations:
```json
[
  {"name": "FAST_SCRIPT", "timeout": 120},
  {"name": "LLM_HEAVY", "timeout": 1200}
]
```

---

## Troubleshooting

### "sqlite3 not found" Warning

If sqlite3 CLI isn't installed, the backup script falls back to a simple file copy:
- Database is still backed up
- JSON exports are skipped
- sparkq.yml is still copied

To get full functionality, install sqlite3:
```bash
# Ubuntu/Debian
sudo apt install sqlite3

# macOS
brew install sqlite3
```

### Backup Failed

Check:
1. Disk space: `df -h sparkq/data/`
2. Permissions: `ls -la sparkq/data/`
3. Database lock: Stop the server first if needed

### Restore Failed

Common issues:
- Server still running (stop it first)
- Backup file corrupted (try an older backup)
- Permission denied (check file ownership)

---

## Best Practices

1. **Don't disable backups** - They're lightweight and run on startup
2. **Keep at least 7 versions** - Gives you a week of rollback options
3. **Check backup-list periodically** - Verify backups are being created
4. **After major config changes** - Consider manually triggering a backup with `./sparkq.sh start && ./sparkq.sh stop`
5. **Before upgrades** - The automatic backup on start handles this, but verify with `backup-list`

---

## Legacy Backup Compatibility

The system supports both:
- **New format** (v2.0): Bundle directories with JSON exports
- **Legacy format**: Single `.db` files

The restore script auto-detects the format and handles both transparently.
