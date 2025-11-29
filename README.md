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
./sparkq.sh --start              # Start server in background (recommended)
./sparkq.sh run                  # Start server in foreground
./sparkq.sh session create       # Create session
./sparkq.sh --stop               # Stop server
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
│   ├── API.md                      # API reference
│   └── README.md                   # Full SparkQ documentation
│
├── .venv/                          # Python virtual environment (created by bootstrap)
├── sparkq.sh                       # CLI wrapper script
├── sparkq.yml                      # Configuration (auto-created)
├── sparkq.log                      # Runtime logs
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

- **FIFO Queues**: Tasks processed in order per stream
- **Auto-Fail**: Stale tasks auto-fail after 2× timeout
- **Auto-Purge**: Completed tasks auto-deleted after configurable days
- **Web UI**: Dashboard at `http://localhost:5005/` (redirects from `/ui/`)
- **REST API**: Full API with interactive docs at `/docs`
- **CLI**: Typer-based command-line interface
- **SQLite WAL**: Efficient concurrent access with WAL mode

## Common Commands

```bash
# Server management
./sparkq.sh --start                      # Start server in background (recommended)
./sparkq.sh run --background             # Start in background (verbose)
./sparkq.sh run                          # Start server in foreground
./sparkq.sh --stop                       # Stop server
./sparkq.sh status                       # Check if running

# Session & stream management
./sparkq.sh session create my-session    # Create session
./sparkq.sh session list                 # List sessions
./sparkq.sh stream create my-stream      # Create stream

# Task operations (with venv activated)
python -m sparkq.src.cli enqueue --stream my-stream --tool run-bash
python -m sparkq.src.cli peek --stream my-stream
python -m sparkq.src.cli claim --stream my-stream
python -m sparkq.src.cli complete --task-id [id] --summary "Done"
python -m sparkq.src.cli tasks --stream my-stream
```

## Background Service Management

SparkQ server can run in the background without tying up your terminal:

```bash
# Start server in background (recommended - doesn't block terminal)
./sparkq.sh --start

# Access dashboard at:
# http://localhost:5005

# Check if server is running
./sparkq.sh status

# Stop the background server
./sparkq.sh --stop

# Alternatively, use verbose form
./sparkq.sh run --background    # Start with explicit flag
```

The background server:
- Runs as a detached daemon process
- Persists the PID in `sparkq.lock` for tracking
- Can be stopped at any time with `./sparkq.sh --stop`
- Returns immediately, allowing you to continue using the terminal
- Dashboard accessible at root URL: `http://localhost:5005/`

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
