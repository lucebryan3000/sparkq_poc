# SparkQ - Distributed Task Queue

Distributed task queue for managing work sessions and feature streams. Fast, simple, dev-focused.

## Quick Start

### Prerequisites

SparkQ requires a Python virtual environment. Set it up once from the project root using the bootstrap tool:

```bash
cd /home/luce/apps/sparkqueue
./python-bootstrap/bootstrap.sh
```

See [../python-bootstrap/README.md](../python-bootstrap/README.md) for full bootstrap details.

### Step 1: Initialize Database (One-Time)

```bash
# Activate venv (from project root)
source ../.venv/bin/activate

# Initialize the database
python -m sparkq.src.cli setup
```

This creates `sparkq.yml` configuration and `data/sparkq.db` database.

### Step 2: Start the Server

```bash
# Using direct CLI (venv must be activated)
python -m sparkq.src.cli run

# Or using the convenience wrapper from project root
../sparkq.sh run
```

Server listens on `http://localhost:8420`

### Step 3: Use SparkQ

In another terminal (with venv activated):

```bash
# Create a session
python -m sparkq.src.cli session create my-session

# Create a stream
python -m sparkq.src.cli stream create my-stream --session my-session

# Enqueue a task
python -m sparkq.src.cli enqueue --stream my-stream --tool run-bash

# Check next task
python -m sparkq.src.cli peek --stream my-stream

# Claim and complete a task
python -m sparkq.src.cli claim --stream my-stream
python -m sparkq.src.cli complete --task-id [id] --summary "Done"

# List all tasks
python -m sparkq.src.cli tasks --stream my-stream
```

## Architecture

SparkQ is organized into functional layers:

### Core Components

**CLI Layer** (`src/cli.py`)
- Typer-based command interface
- Session/stream/task management
- Server control commands
- Configuration reloading

**Server Layer** (`src/server.py`)
- FastAPI/Uvicorn HTTP server (port 8420)
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
- `session_id`: unique identifier
- `name`: human-readable name
- `created_at`: timestamp

**Streams**: Task queues within sessions
- `stream_id`: unique identifier
- `session_id`: parent session
- `name`: human-readable name
- `created_at`: timestamp

**Tasks**: Work items in streams
- `task_id`: unique identifier
- `stream_id`: parent stream
- `status`: pending/running/completed/failed
- `summary`: task description
- `created_at`, `started_at`, `completed_at`: timestamps
- `timeout`: execution deadline
- `failure_reason`: if status is failed

## Configuration

SparkQ configuration lives in `sparkq.yml` (auto-created at project root during setup):

```yaml
project:
  name: my-project
  repo_path: /path/to/repo

server:
  port: 8420

database:
  path: sparkq/data/sparkq.db
  mode: wal

purge:
  older_than_days: 3

script_dirs:
  - scripts

task_classes:
  FAST_SCRIPT:
    timeout: 30
  MEDIUM_SCRIPT:
    timeout: 300
  LLM_LITE:
    timeout: 300
  LLM_HEAVY:
    timeout: 900

tools:
  run-bash:
    description: Execute a bash script
    task_class: MEDIUM_SCRIPT
  run-python:
    description: Execute a python script
    task_class: MEDIUM_SCRIPT
  llm-haiku:
    description: Call Claude Haiku
    task_class: LLM_LITE
  llm-sonnet:
    description: Call Claude Sonnet
    task_class: LLM_HEAVY
```

Edit `sparkq.yml` to customize tool metadata or timeouts, then reload:
```bash
python -m sparkq.src.cli reload
```

## Features

- **FIFO Queues**: Tasks processed in order per stream
- **Auto-Fail**: Stale tasks auto-fail after 2× timeout
- **Auto-Purge**: Completed tasks auto-deleted after configurable days
- **Web UI**: Dashboard at `http://localhost:8420/ui/`
- **REST API**: Full API with interactive docs at `/docs`
- **CLI**: Typer-based command-line interface
- **SQLite WAL**: Efficient concurrent access with WAL mode
- **Background Workers**: Automatic stale detection and purging

## Running the Server

### Start Server

```bash
# Using CLI directly (venv must be activated)
python -m sparkq.src.cli run

# Or from project root using wrapper script
../sparkq.sh run

# Run in background
source ../.venv/bin/activate && python -m sparkq.src.cli run &
```

### Check Server Status

```bash
python -m sparkq.src.cli status
```

### Stop Server

```bash
python -m sparkq.src.cli stop
```

### View Logs

```bash
# Server logs to stdout; tail the log file when running in background
tail -f ../sparkq.log
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

- **Swagger UI**: `http://localhost:8420/docs`
- **ReDoc**: `http://localhost:8420/redoc`
- **OpenAPI JSON**: `http://localhost:8420/openapi.json`

See [API.md](API.md) for endpoint details.

## Common Tasks

### Create a Session

```bash
python -m sparkq.src.cli session create my-session
```

### List All Sessions

```bash
python -m sparkq.src.cli session list
```

### Create a Stream

```bash
python -m sparkq.src.cli stream create my-stream --session my-session
```

### Enqueue a Task

```bash
python -m sparkq.src.cli enqueue \
  --stream my-stream \
  --tool run-bash \
  --payload "echo 'Hello'"
```

### Peek at Next Task

```bash
python -m sparkq.src.cli peek --stream my-stream
```

### Claim a Task

```bash
python -m sparkq.src.cli claim --stream my-stream
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
# All tasks in a stream
python -m sparkq.src.cli tasks --stream my-stream

# Tasks with filters
python -m sparkq.src.cli tasks --stream my-stream --status pending
python -m sparkq.src.cli tasks --stream my-stream --status running
python -m sparkq.src.cli tasks --stream my-stream --status completed
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
# Check what's using port 8420
lsof -i :8420

# Kill the process
kill <PID>
```

### Database Locked

SparkQ uses SQLite with WAL mode. If you encounter locked database errors:

```bash
rm -f data/sparkq.db-wal data/sparkq.db-shm
```

### Stream Not Found

Make sure the stream exists before enqueueing:

```bash
# List streams in a session
python -m sparkq.src.cli stream list --session my-session

# Create if needed
python -m sparkq.src.cli stream create my-stream --session my-session
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

### Run E2E Tests (including Phase 7 watcher)

```bash
python -m pytest tests/e2e/ -v -m slow
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

1. **Direct CLI**: `python -m sparkq.src.cli run`
2. **Wrapper Script**: `../sparkq.sh run` (from project root)
3. **Direct Activation**: `source ../.venv/bin/activate && python -m sparkq.src.cli run`

All approaches use the same standardized virtual environment and dependencies.

## Support & Documentation

- **Architecture**: See [../ARCHITECTURE.md](../ARCHITECTURE.md)
- **API Reference**: See [API.md](API.md)
- **Project Guidelines**: See [../.claude/CLAUDE.md](../.claude/CLAUDE.md)
- **Bootstrap Setup**: See [../python-bootstrap/README.md](../python-bootstrap/README.md)
