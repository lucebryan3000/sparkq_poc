# SparkQ Database Backup System

## Overview

A **automatic rotating backup system** has been implemented to prevent data loss from accidental operations like the `git restore` incident that cleared your queues.

## How It Works

### Automatic Backup on Startup

Every time you start the server, a backup of the database is automatically created:

```bash
./sparkq.sh start          # Creates backup automatically
./sparkq.sh run            # Creates backup automatically
./sparkq.sh restart        # Creates backup automatically
```

Backup filename: `sparkq_YYYYMMDD_HHMMSS.db`
Location: `sparkq/data/backups/`

### Rotation Policy

- **Maximum backups kept**: 3 (oldest automatically deleted)
- **Frequency**: Every server start
- **No manual action needed**: Fully automatic

## Restoring Data

### List Available Backups

```bash
./sparkq.sh backup-list
```

Output:
```
Available backups (most recent first):

  [1] sparkq_20251202_194838.db (172K) - 2025-12-02 19:48:38
  [2] sparkq_20251202_190000.db (172K) - 2025-12-02 19:00:00
  [3] sparkq_20251202_180000.db (172K) - 2025-12-02 18:00:00
```

### Restore from Backup

```bash
# Restore from most recent backup
./sparkq.sh backup-restore 1

# Restore from 2nd most recent
./sparkq.sh backup-restore 2

# Restore from specific file
./sparkq.sh backup-restore /path/to/sparkq_20251202_194838.db
```

### Restore Workflow

When you run restore:

1. **Confirmation**: You're asked to confirm the restore
2. **Safety Backup**: Current database is backed up as `sparkq_preRestore_[timestamp].db`
3. **Restore**: The chosen backup is copied to `sparkq/data/sparkq.db`
4. **Restart**: You must restart the server to use the restored database

```bash
./sparkq.sh backup-list       # See available backups
./sparkq.sh backup-restore 1  # Choose backup 1
# Confirms restoration...
./sparkq.sh restart           # Restart to apply
```

## Files & Scripts

### Created Files

- `sparkq/scripts/backup_database.sh` - Creates rotating backups (called at startup)
- `sparkq/scripts/restore_database.sh` - Lists and restores backups
- `sparkq/data/backups/README.md` - Detailed backup documentation

### Modified Files

- `sparkq.sh` - Added backup calls and new commands

## Safety Features

### Pre-Restore Backup

Before restoring, the current database is backed up as:
```
sparkq_preRestore_20251202_195000.db
```

This is stored with your other backups, so you can always restore forward if needed.

### Confirmation Prompts

```bash
$ ./sparkq.sh backup-restore 1
About to restore from: /path/to/sparkq_20251202_194838.db
Current database will be backed up as: sparkq_preRestore_20251202_195000.db

Continue? (y/N):
```

### Database Validation

The restore script validates that:
- Backup file exists
- File is a valid SQLite database
- Restore is confirmed by user

## Example: Recovery Scenario

You accidentally delete important data:

```bash
# Realize something is wrong
./sparkq.sh backup-list

# Available backups (most recent first):
#   [1] sparkq_20251202_194838.db (172K) - 2025-12-02 19:48:38
#   [2] sparkq_20251202_190000.db (172K) - 2025-12-02 19:00:00

# Restore from backup #2 (before the accident)
./sparkq.sh backup-restore 2

# Confirm restoration...
# Current database backed up as: sparkq_preRestore_20251202_195000.db
# Database restored from: sparkq_20251202_190000.db

# Restart server
./sparkq.sh restart

# Check data is restored
curl http://localhost:5005/api/queues
```

## Limitations & Considerations

### Not Real-Time

Backups are **point-in-time snapshots** taken at server startup. Data changes since the last startup are not backed up.

For example:
- Start server at 10:00am → backup created
- Work until 2:00pm → no backup created yet
- If crash at 2:00pm, last backup is from 10:00am

**Best practice**: Restart server periodically during development to create fresh backups.

### Limited History

Only **3 backups** are kept. If you need to go back further:
- Manually copy backups to external storage
- Consider adding `sparkq/data/backups/` entries to git for critical points

### Database Size

Backups are **full database copies**, not incremental. For large databases:
- Each backup takes up storage space
- Consider external backup solutions for production

## Technical Details

### Backup Script

See `sparkq/scripts/backup_database.sh` for implementation:
- Uses `cp` for simple file copying
- Manages rotation by deleting oldest files
- Outputs backup location for confirmation

### Restore Script

See `sparkq/scripts/restore_database.sh` for implementation:
- Lists backups with timestamps and sizes
- Validates files before restore
- Prompts for confirmation
- Creates pre-restore safety backup

## Integration Points

### Called From

- `./sparkq.sh start` - Creates backup before starting
- `./sparkq.sh restart` - Creates backup before restarting
- `./sparkq.sh run` (background mode) - Creates backup

### Not Called From

- `./sparkq.sh run --foreground` - Development mode (speed priority)
- Other CLI commands - Only server start/restart creates backups

## Related Commands

```bash
./sparkq.sh backup-list                    # List all backups
./sparkq.sh backup-restore 1               # Restore from backup
./sparkq.sh backup-restore /path/to/db.db  # Restore from file
./sparkq.sh start                          # Start with automatic backup
./sparkq.sh restart                        # Stop/backup/restart cycle
```

## Troubleshooting

### "No backups found"

Make sure you've started the server at least once:
```bash
./sparkq.sh start
./sparkq.sh backup-list  # Should now show backups
```

### "Invalid database file"

The backup file is corrupted. Try another backup number or restore from manual backup.

### "Backup restore hangs on confirm prompt"

In non-interactive scripts, pipe `y` to the confirm prompt:
```bash
echo "y" | ./sparkq.sh backup-restore 1
```

### Database file still not restored

You may need to restart the server:
```bash
./sparkq.sh restart
```

## Prevention Strategies

### Regular Restarts

Restart server periodically to create fresh backups:
```bash
# Create backup at specific time
./sparkq.sh restart

# Server is now backed up and running
```

### External Backups

For critical data, copy backups periodically:
```bash
cp sparkq/data/backups/sparkq_*.db /backup/location/
```

### Git Snapshots

For milestones, add backups to git:
```bash
git add sparkq/data/backups/sparkq_20251202_194838.db
git commit -m "Checkpoint: stable version with all queues"
```

## History

### Why This Was Added

During development, a `git restore` command accidentally cleared the database, losing all queue data. The backups system ensures this won't happen again.

### Design Principles

- **Automatic**: No manual steps required
- **Simple**: Easy to list and restore
- **Non-invasive**: Doesn't slow down server start
- **Safe**: Asks for confirmation before restore
- **Conservative**: Keeps limited history (3 versions) by default
