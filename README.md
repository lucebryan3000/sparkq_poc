# SparkQueue

Distributed task queue for managing work sessions and feature streams. Fast, simple, dev-focused.

## Quick Start

### Step 1: Initial Setup (One-Time)

Set up the Python virtual environment using the bootstrap tool:

```bash
# Preview what will happen
./python-bootstrap/bootstrap.sh --dry-run

# Actually set up
./python-bootstrap/bootstrap.sh

# Or with auto-approval (useful in CI)
./python-bootstrap/bootstrap.sh --yes
```

This creates `.venv/` with all SparkQ dependencies installed.

**For bootstrap details**, see [python-bootstrap/README.md](python-bootstrap/README.md).

### Step 2: Run SparkQ

Use the convenience wrapper script:

```bash
./sparkq.sh setup                # Initialize database (one-time)
./sparkq.sh start                # Start server in background (recommended)
./sparkq.sh run                  # Start server in foreground
./sparkq.sh session create       # Create session
./sparkq.sh stop                 # Stop server
./sparkq.sh status               # Check status
```

Or activate the venv directly:

```bash
source .venv/bin/activate
python -m sparkq.src.cli setup
python -m sparkq.src.cli run --background
```

## Project Structure

```
sparkqueue/
├── sparkq/                         # SparkQ distributed task queue application
│   ├── src/                        # Application source code
│   ├── ui/                         # Web dashboard
│   ├── data/                       # Application data (database)
│   ├── tests/                      # Test suites
│   ├── logs/                       # Runtime logs (sparkq.log)
│   ├── API.md                      # API reference
│   └── README.md                   # Full SparkQ documentation
│
├── .venv/                          # Python virtual environment (created by bootstrap)
├── sparkq.sh                       # CLI wrapper script
├── sparkq.yml                      # Configuration (auto-created)
│
├── python-bootstrap/               # One-time environment bootstrapper
├── .claude/                        # Claude Code configuration
└── README.md                       # This file
```

## Documentation

- **SparkQ Guide**: See [sparkq/README.md](sparkq/README.md) for complete usage guide
- **API Reference**: See [sparkq/API.md](sparkq/API.md) for endpoint details
- **Architecture**: See [ARCHITECTURE.md](ARCHITECTURE.md) for system design
- **Bootstrap Setup**: See [python-bootstrap/README.md](python-bootstrap/README.md) for environment setup
- **Project Guidelines**: See [.claude/CLAUDE.md](.claude/CLAUDE.md) for development guidelines

## Features

- **FIFO Queues**: Tasks processed in order per queue
- **Queue Management**: Archive/unarchive queues to organize completed work
- **Session & Context**: Track work sessions with context management
- **Auto-Fail**: Stale tasks auto-fail after 2× timeout
- **Auto-Purge**: Completed tasks auto-deleted after configurable days (default: 3 days)
- **Web UI**: Dashboard at `http://localhost:5005/` with light mode support
- **REST API**: Full API with interactive docs at `/docs`. Note: `/api/tasks` returns pagination/truncation metadata (`limit_applied`, `truncated`, `max_limit` when capped) alongside the `tasks` array. Use `SPARKQ_CONFIG` or the CLI `--config` flag to point to a specific `sparkq.yml` (resolution order: env override → CWD `sparkq.yml` → repo root).
- **CLI**: Typer-based command-line interface via `./sparkq.sh`
- **SQLite WAL**: Efficient concurrent access with WAL mode

**Configuration defaults**
- Host/port pulled from `sparkq.yml` (defaults 0.0.0.0:5005); `sparkq run --host/--port` overrides per run.
- Database path resolves relative to the active config file and is created if missing; set `database.path` in `sparkq.yml` or export `SPARKQ_CONFIG` to switch configs.

## Common Commands

```bash
# Server management
./sparkq.sh start                        # Start server in background (recommended)
./sparkq.sh restart                      # Stop, wait 5s, then start (clean restart)
./sparkq.sh run                          # Start server in foreground
./sparkq.sh stop                         # Stop server
./sparkq.sh status                       # Check if running

# Session & queue management
./sparkq.sh session create my-session    # Create session
./sparkq.sh session list                 # List sessions
./sparkq.sh session end <id>             # End a session
./sparkq.sh queue create my-queue        # Create queue
./sparkq.sh queue list                   # List queues
./sparkq.sh queue end <id>               # End a queue

# Task operations
./sparkq.sh enqueue                      # Enqueue a task
./sparkq.sh peek                         # Check next task in queue
./sparkq.sh claim                        # Claim a task
./sparkq.sh complete                     # Mark task as completed
./sparkq.sh fail                         # Mark task as failed
./sparkq.sh tasks                        # List tasks with filters
./sparkq.sh task                         # Show detailed task info
./sparkq.sh requeue                      # Move task back to queued status
./sparkq.sh purge                        # Delete old succeeded/failed tasks

# Configuration
./sparkq.sh reload                       # Reload configuration and script index
./sparkq.sh config-export                # Export DB-backed config to YAML
./sparkq.sh scripts                      # Manage and discover scripts
```

## Background Service Management

SparkQ server can run in the background without tying up your terminal:

```bash
# Start server in background (recommended)
./sparkq.sh start

# Access dashboard at http://localhost:5005

# Check if server is running
./sparkq.sh status

# Stop the background server
./sparkq.sh stop

# Clean restart (stop, wait 5s, start)
./sparkq.sh restart
```

The background server:
- Runs as a detached daemon process
- Persists the PID in `sparkq.lock` for tracking
- Can be stopped at any time with `./sparkq.sh stop`
- Returns immediately, allowing you to continue using the terminal
- Dashboard accessible at `http://localhost:5005`
- Logs written to `sparkq/logs/sparkq.log`

## Troubleshooting

### Port Already in Use

```bash
lsof -i :5005
kill <PID>
```

### Database Locked

```bash
rm -f sparkq/data/sparkq.db-wal sparkq/data/sparkq.db-shm
```

### Virtual Environment Not Found

```bash
./python-bootstrap/bootstrap.sh
```

## Support

- **Full Guide**: [sparkq/README.md](sparkq/README.md)
- **API Docs**: [sparkq/API.md](sparkq/API.md)
- **Bootstrap Help**: [python-bootstrap/README.md](python-bootstrap/README.md)
- **Development**: [.claude/CLAUDE.md](.claude/CLAUDE.md)
