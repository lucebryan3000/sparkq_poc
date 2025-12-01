# SparkQ - Distributed Task Queue

Distributed task queue for managing work sessions and queues. Fast, simple, dev-focused.

## Quick Start

### Prerequisites

SparkQ requires a Python virtual environment. Set it up once from the project root:

```bash
cd /home/luce/apps/sparkqueue
sparkq/scripts/setup/setup.sh
```

This seeds `sparkq.yml` and initializes a fresh SQLite DB with default tools/task classes. Re-run it after a teardown to rebuild the defaults.

### Step 1: Initialize Database (One-Time)

```bash
# Activate venv (from project root)
source .venv/bin/activate

# Initialize the database
python -m sparkq.src.cli setup
```

This creates `sparkq.yml` configuration and `sparkq/data/sparkq.db` database (DB path resolved relative to the active config file).

### Step 2: Start the Server

```bash
# Using direct CLI (venv must be activated)
python -m sparkq.src.cli run

# Or using the convenience wrapper from project root
./sparkq.sh run
```

Server listens on `http://<server.host>:<server.port>` from `sparkq.yml` (defaults `0.0.0.0:5005`). Override per-run with `sparkq run --host/--port` or use an alternate config via `SPARKQ_CONFIG`/`--config`.

### Step 3: Use SparkQ

In another terminal (with venv activated):

```bash
# Create a session
python -m sparkq.src.cli session create my-session

# Create a queue
python -m sparkq.src.cli queue create my-queue --session my-session

# Enqueue a task
python -m sparkq.src.cli enqueue --queue my-queue --tool run-bash

# Check next task
python -m sparkq.src.cli peek --queue my-queue

# Claim and complete a task
python -m sparkq.src.cli claim --queue my-queue
python -m sparkq.src.cli complete --task-id [id] --summary "Done"

# List all tasks
python -m sparkq.src.cli tasks --queue my-queue
```

## Architecture

SparkQ is organized into functional layers:

### Core Components

**CLI Layer** (`src/cli.py`)
- Typer-based command interface
- Session/queue/task management
- Server control commands
- Configuration reloading

**Server Layer** (`src/server.py`)
- FastAPI/Uvicorn HTTP server (port 5005)
- Concurrent API request handling
- Background task monitoring (stale detection, auto-purge)
- Server lifecycle management

**API Layer** (`src/api.py`)
- REST endpoints for all operations
- JSON request/response format
- Full OpenAPI documentation
- Interactive Swagger UI at `/docs`

**Storage Layer** (`src/storage.py`)
- SQLite database abstraction
- WAL mode for concurrent access
- Schema initialization
- ACID transaction support
- Task lifecycle management

**Configuration System** (`sparkq.yml`)
- Server settings (port, database path)
- Tool registry with timeouts
- Task class definitions
- Script directory mappings

### Directory Structure

```
sparkq/
├── requirements.txt           # Application dependencies
├── requirements-test.txt      # Test dependencies
├── pytest.ini                 # Test configuration
├── API.md                     # API endpoint reference
├── README.md                  # This file
├── test_integration.py        # Integration test suite
├── src/
│   ├── __main__.py            # CLI entrypoint
│   ├── api.py                 # FastAPI routes
│   ├── cli.py                 # sparkq CLI commands
│   ├── server.py              # Uvicorn wrapper + background workers
│   ├── storage.py             # SQLite persistence
│   ├── tools.py               # Tool registry from sparkq.yml
│   └── index.py               # Script indexing helpers
├── ui/
│   ├── index.html
│   ├── app.js
│   └── style.css
├── data/
│   └── sparkq.db              # SQLite database (auto-created)
└── tests/
    ├── e2e/
    │   └── test_watcher.py
    └── unit/
```

## Database Schema

The SQLite database (`data/sparkq.db`) contains:

**Sessions**: Organizational units
- `id`: unique identifier
- `name`: human-readable name
- `description`: optional description
- `status`: active/ended
- `started_at`, `ended_at`: timestamps
- `created_at`, `updated_at`: timestamps

**Queues**: Task queues within sessions
- `id`: unique identifier
- `session_id`: parent session
- `name`: human-readable name (unique)
- `instructions`: optional queue-specific instructions
- `status`: active/ended/archived/idle/planned
- `created_at`, `updated_at`: timestamps

**Tasks**: Work items in queues
- `id`: unique identifier
- `queue_id`: parent queue
- `tool_name`: tool to execute
- `task_class`: task classification
- `payload`: JSON task data
- `status`: queued/running/succeeded/failed
- `timeout`: execution deadline (seconds)
- `attempts`: number of execution attempts
- `result`, `error`, `stdout`, `stderr`: execution outputs
- `created_at`, `updated_at`, `started_at`, `finished_at`: timestamps

## Configuration

SparkQ configuration lives in `sparkq.yml` (auto-created at project root during setup, resolved in order: `SPARKQ_CONFIG` env → current working directory → repo root):

```yaml
project:
  name: sparkq-local
  repo_path: .

server:
  host: 0.0.0.0
  port: 5005

database:
  path: sparkq/data/sparkq.db
  mode: wal

purge:
  older_than_days: 3

sparkq_scripts_dir: sparkq/scripts
project_script_dirs:
  - scripts

task_classes:
  FAST_SCRIPT:
    timeout: 120
  MEDIUM_SCRIPT:
    timeout: 600
  LLM_LITE:
    timeout: 480
  LLM_HEAVY:
    timeout: 1200

tools:
  run-bash:
    description: Bash script
    task_class: MEDIUM_SCRIPT
  run-python:
    description: Python script
    task_class: MEDIUM_SCRIPT
  llm-haiku:
    description: Haiku
    task_class: LLM_LITE
  llm-sonnet:
    description: Sonnet
    task_class: LLM_HEAVY
  llm-codex:
    description: Codex
    task_class: LLM_HEAVY
  quick-check:
    description: Quick validation check
    task_class: FAST_SCRIPT
  script-index:
    description: Index project scripts
    task_class: MEDIUM_SCRIPT

queue_runner:
  poll_interval: 30
  auto_fail_interval_seconds: 30
  base_url: null

features:
  flags: {}

defaults:
  queue: {}
```

Database path (`database.path`) resolves relative to the active config file; switch configs with `SPARKQ_CONFIG` or `sparkq run --config /path/to/sparkq.yml`. Edit `sparkq.yml` to customize tool metadata or timeouts, then reload:
```bash
python -m sparkq.src.cli reload
```

### Using config outside the repo

- You can keep `sparkq.yml` in any directory and point SparkQ at it with `SPARKQ_CONFIG=/path/to/sparkq.yml` or `sparkq run --config /path/to/sparkq.yml`.
- All relative paths inside the config (e.g., `database.path`, script dirs) resolve relative to the config file’s location, so keeping config + DB outside the repo cleanly separates app code from local state.
- This is useful when SparkQ runs alongside other tools/repos on the same machine—just export `SPARKQ_CONFIG` before running or bake it into your wrapper scripts/Makefile.

## Features

- **FIFO Queues**: Tasks processed in order per queue
- **Queue Management**: Archive/unarchive queues for organization
- **Auto-Fail**: Stale tasks auto-fail after 2× timeout
- **Auto-Purge**: Completed tasks auto-deleted after configurable days
- **Web UI**: Dashboard at `http://localhost:5005/` with light mode support
- **REST API**: Full API with interactive docs at `/docs`
- **CLI**: Typer-based command-line interface
- **SQLite WAL**: Efficient concurrent access with WAL mode
- **Background Workers**: Automatic stale detection and purging
- **Context Management**: Intelligent session/queue context tracking

## Running the Server

### Start Server

```bash
# Using CLI directly (venv must be activated)
python -m sparkq.src.cli run

# Or from project root using wrapper script
./sparkq.sh run

# Run in background
./sparkq.sh --start
```

### Check Server Status

```bash
python -m sparkq.src.cli status
```

### Stop Server

```bash
# Using wrapper
./sparkq.sh --stop

# Or using CLI
python -m sparkq.src.cli stop
```

### View Logs

```bash
# Server logs to sparkq/logs/sparkq.log
tail -f sparkq/logs/sparkq.log
```

### Process Management

```bash
# Find running SparkQ processes
pgrep -f "python.*sparkq"

# Graceful shutdown
kill -TERM <PID>

# Force kill if needed
kill -9 <PID>
```

## API Documentation

When the server is running, interactive API docs are available at:

- **Swagger UI**: `http://localhost:5005/docs`
- **ReDoc**: `http://localhost:5005/redoc`
- **OpenAPI JSON**: `http://localhost:5005/openapi.json`

See [API.md](API.md) for endpoint details.

### Key Endpoints

**Sessions & Queues**
- `GET /api/sessions` - List all sessions
- `POST /api/sessions` - Create new session
- `GET /api/queues` - List queues (optionally filtered by session)
- `POST /api/queues` - Create new queue
- `PUT /api/queues/{queue_id}/archive` - Archive a queue
- `PUT /api/queues/{queue_id}/unarchive` - Unarchive a queue
- `PUT /api/queues/{queue_id}/end` - End a queue
- `DELETE /api/queues/{queue_id}` - Delete a queue

**Tasks**
- `GET /api/tasks` - List tasks (filter by queue_id, status)
- `POST /api/tasks` - Create new task
- `POST /api/tasks/quick-add` - Smart task creation (LLM or script mode)
- `POST /api/tasks/{task_id}/claim` - Claim a task for execution
- `POST /api/tasks/{task_id}/complete` - Mark task as succeeded
- `POST /api/tasks/{task_id}/fail` - Mark task as failed
- `POST /api/tasks/{task_id}/requeue` - Requeue failed/completed task
- `PUT /api/tasks/{task_id}` - Update task fields
- `DELETE /api/tasks/{task_id}` - Delete a task

**Configuration**
- `GET /api/config` - Get complete configuration
- `PUT /api/config/{namespace}/{key}` - Update config entry
- `GET /api/tools` - List all tools
- `POST /api/tools` - Create new tool
- `GET /api/task-classes` - List task classes
- `POST /api/task-classes` - Create new task class

**Prompts**
- `GET /api/prompts` - List all prompts
- `POST /api/prompts` - Create new prompt template
- `GET /api/prompts/{prompt_id}` - Get specific prompt
- `PUT /api/prompts/{prompt_id}` - Update prompt
- `DELETE /api/prompts/{prompt_id}` - Delete prompt

**Scripts & Utilities**
- `GET /api/scripts/index` - Build index of available scripts
- `GET /api/build-prompts` - List prompts under _build/prompts-build
- `GET /health` - Health check endpoint
- `GET /api/version` - Get current build ID for cache-busting

## Common Tasks

### Create a Session

```bash
python -m sparkq.src.cli session create my-session
```

### List All Sessions

```bash
python -m sparkq.src.cli session list
```

### Create a Queue

```bash
python -m sparkq.src.cli queue create my-queue --session my-session
```

### Enqueue a Task

```bash
python -m sparkq.src.cli enqueue \
  --queue my-queue \
  --tool run-bash \
  --payload "echo 'Hello'"
```

### Peek at Next Task

```bash
python -m sparkq.src.cli peek --queue my-queue
```

### Claim a Task

```bash
python -m sparkq.src.cli claim --queue my-queue
```

### Complete a Task

```bash
python -m sparkq.src.cli complete \
  --task-id <task-id> \
  --summary "Task completed successfully"
```

### Fail a Task

```bash
python -m sparkq.src.cli fail \
  --task-id <task-id> \
  --reason "Task failed due to timeout"
```

### List Tasks

```bash
# All tasks in a queue
python -m sparkq.src.cli tasks --queue my-queue

# Tasks with filters
python -m sparkq.src.cli tasks --queue my-queue --status queued
python -m sparkq.src.cli tasks --queue my-queue --status running
python -m sparkq.src.cli tasks --queue my-queue --status succeeded
```

### Get Detailed Task Info

```bash
python -m sparkq.src.cli task --task-id <task-id>
```

### Requeue a Task

```bash
python -m sparkq.src.cli requeue --task-id <task-id>
```

### Purge Old Tasks

```bash
# Purge tasks older than configured days (see sparkq.yml)
python -m sparkq.src.cli purge
```

## Troubleshooting

### Port Already in Use

```bash
# Check what's using port 5005
lsof -i :5005

# Kill the process
kill <PID>
```

### Database Locked

SparkQ uses SQLite with WAL mode. If you encounter locked database errors:

```bash
rm -f sparkq/data/sparkq.db-wal sparkq/data/sparkq.db-shm
```

### Queue Not Found

Make sure the queue exists before enqueueing:

```bash
# List queues in a session
python -m sparkq.src.cli queue list --session my-session

# Create if needed
python -m sparkq.src.cli queue create my-queue --session my-session
```

### Tasks Stuck in Running State

Tasks auto-fail after 2× their timeout. You can manually fail them:

```bash
python -m sparkq.src.cli fail --task-id [id] --reason "Manual failure"
```

### Check Task Status

```bash
python -m sparkq.src.cli task --task-id <task-id>
```

## Testing

### Run Integration Tests

```bash
# From sparkq/ directory (with venv activated)
python -m pytest test_integration.py -v
```

### Run All Tests

```bash
python -m pytest -v
```

### Run E2E Tests

```bash
python -m pytest tests/e2e/ -v
```

## Development

### Install Test Dependencies

```bash
pip install -r requirements-test.txt
```

### Key Technologies

- **Language**: Python 3.10+
- **Web Framework**: FastAPI
- **ASGI Server**: Uvicorn
- **Database**: SQLite (WAL mode)
- **CLI Framework**: Typer
- **Testing**: pytest
- **Configuration**: YAML

### Deployment

After bootstrap environment setup, deploy using any of these methods:

1. **Background Service**: `./sparkq.sh --start` (recommended - runs as daemon)
2. **Foreground CLI**: `python -m sparkq.src.cli run` (venv must be activated)
3. **Wrapper Script**: `./sparkq.sh run` (from project root)

All approaches use the same standardized virtual environment and dependencies.

## Support & Documentation

- **Architecture**: See [../ARCHITECTURE.md](../ARCHITECTURE.md)
- **API Reference**: See [API.md](API.md)
- **Project Guidelines**: See [../.claude/CLAUDE.md](../.claude/CLAUDE.md)
- **Bootstrap Setup**: Run `sparkq/scripts/setup/setup.sh` from the repo root
