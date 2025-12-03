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
- **Worker Playbook**: See [sparkq/WORKER_PLAYBOOK.md](sparkq/WORKER_PLAYBOOK.md) for queue runner execution guide
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
- Purge/auto-fail background tasks use `purge.older_than_days` and `queue_runner.auto_fail_interval_seconds` from config; `sparkq purge --older-than-days N` is available for manual cleanup.
- CORS allowlist defaults to localhost; override with `SPARKQ_CORS_ALLOW_ORIGINS` (comma-separated) and only set `SPARKQ_CORS_ALLOW_CREDENTIALS=1` if your deployment requires credentials.

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

## Tests and coverage sync

- Python tests: `npm run test:python` (or `cd sparkq && pytest`).
- Browser tests: `npm run test:browser`.
- Test contract: `sparkq/tests/TEST_CONTRACT.md`; patterns at `sparkq/tests/patterns.md`.
- Indexer: `make test-index` (runs `python3 tools/test_index.py --fail-on-missing`) to ensure every public surface has mapped coverage; use `--json` for machine-readable output.
- Gap-filling workflow: follow `_build/prompts/sparkq-sync-tests.md` using the patterns when the indexer reports `MISSING`.
./sparkq.sh purge                        # Delete old succeeded/failed tasks

# Configuration & Cleanup
./sparkq.sh reload                       # Reload configuration and script index
./sparkq.sh config-export                # Export DB-backed config to YAML
./sparkq.sh scripts                      # Manage and discover scripts
./sparkq.sh teardown                     # Clean removal of all data, config, logs
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

## Dev Caching Behavior

- **Environment flag**: `SPARKQ_ENV` controls caching (`dev`/`test` default). Set `SPARKQ_ENV=prod` to keep production-style caching; leave unset for dev-friendly defaults.
- **Convenience**: `./sparkq.sh run --env dev|prod|test` sets the mode explicitly (or use `make dev` / `make prod`).
- **Headers in dev/test**: `/ui` static responses (HTML/JS/CSS) and `/ui-cache-buster.js` return `Cache-Control: no-cache, no-store, must-revalidate, max-age=0`, `Pragma: no-cache`, `Expires: 0`, and drop `ETag`.
- **Dev cache-busting**: `index.html` loads `/ui-cache-buster.js`, which seeds `window.__SPARKQ_CACHE_BUSTER__` (timestamp or `SPARKQ_CACHE_BUSTER` override). When `SPARKQ_ENV` is dev/test, the UI automatically appends `?v=<seed>` to `/ui/style.css` and `/ui/dist/*.js` so hard refreshes pick up fresh assets. To force a fresh seed, restart with `SPARKQ_CACHE_BUSTER=$(date +%s)` in the environment.
- **Prod behavior**: With `SPARKQ_ENV=prod`, asset URLs stay stable (no `?v=`) and FastAPI/StaticFiles cache headers are left untouched.
- **Quick checks**: Start the app (`SPARKQ_ENV=dev ./sparkq.sh run`), hard refresh, and in browser devtools verify `/ui/style.css` and `/ui/dist/...` show `?v=...` plus `Cache-Control: no-cache, no-store, must-revalidate, max-age=0`. Hitting `/ui-cache-buster.js` should return the active env and cache-buster token.
- **Troubleshooting**: Confirm you’re hitting the right static path (`/ui/...` serves from `sparkq/ui`), ensure `SPARKQ_ENV` is not accidentally `prod`, and retry after restarting the server to pick up a new cache-buster seed.

## Fresh Build (single dev box)

1) Create venv + install deps  
   ```bash
   ./python-bootstrap/bootstrap.sh
   # or manual:
   # python -m venv .venv && source .venv/bin/activate
   # pip install -r sparkq/requirements.txt
   ```
2) Create config + DB (default paths)  
   ```bash
   cp -n sparkq/scripts/setup/sparkq.yml.example sparkq.yml  # if you want a template
   ./sparkq.sh setup
   ```
3) Run in dev (cache-busting on)  
   ```bash
   ./sparkq.sh run --env dev   # or make dev
   ```
4) Prod-style caching (same box)  
   ```bash
   ./sparkq.sh run --env prod  # or make prod
   ```
Notes: `SPARKQ_CONFIG=/path/to/your/sparkq.yml` points to an out-of-repo config; relative paths resolve from the config file. `SPARKQ_ENV`/`--env` control caching behavior.

## Tests (quick picks)

- Dev caching regression: `make test-dev-cache` (runs `pytest sparkq/tests/unit/test_dev_caching.py`).
- Full e2e suite: `cd sparkq && pytest -m e2e`.

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
