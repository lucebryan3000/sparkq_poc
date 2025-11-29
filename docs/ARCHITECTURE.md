# SparkQueue Architecture

This document describes the architecture of SparkQueue and its core components.

## Project Structure

```
sparkqueue/
├── sparkq/                    # SparkQ application (the actual system)
│   ├── src/
│   │   ├── cli.py            # CLI command interface (typer-based)
│   │   ├── server.py         # FastAPI/Uvicorn HTTP server
│   │   ├── api.py            # REST API endpoints
│   │   ├── storage.py        # SQLite database layer
│   │   ├── tools.py          # Tool registry and management
│   │   └── index.py          # Script indexing
│   ├── ui/                   # Web dashboard (frontend assets)
│   ├── data/                 # Application data directory
│   │   └── sparkq.db         # SQLite database (created at runtime)
│   ├── requirements.txt       # Python dependencies
│   └── README.md             # SparkQ documentation
│
├── .venv/                    # Python virtual environment (created by bootstrap)
├── sparkq.yml                # Configuration file (created at runtime)
├── sparkq.sh                 # Convenience wrapper script for CLI
│
├── python-bootstrap/         # One-time environment bootstrapper (see README)
├── _build/                   # Legacy: old SparkQueue (for reference only)
├── docs/                     # Documentation
├── .claude/                  # Claude Code configuration
└── README.md                 # Project documentation
```

## Core Components

### 1. SparkQ Application (`sparkq/`)

**Purpose**: Distributed task queue system for managing work sessions

**Key Features**:
- FIFO task management per stream
- Multiple sessions and streams for organization
- SQLite database with WAL mode for concurrent access
- REST API with interactive documentation
- CLI commands for management
- Web UI dashboard
- Auto-failure of stale tasks
- Auto-purge of completed tasks

**Architecture Layers**:

#### CLI Layer (`src/cli.py`)
- Typer-based command interface
- Commands for session/stream/task management
- Commands for server control and configuration
- Interactive and programmatic usage

#### Server Layer (`src/server.py`)
- FastAPI/Uvicorn HTTP server (port 8420)
- Handles concurrent API requests
- Background task monitoring
- Server lifecycle management

#### API Layer (`src/api.py`)
- REST endpoints for all operations
- JSON request/response format
- Full OpenAPI documentation
- Interactive Swagger UI at `/docs`

#### Storage Layer (`src/storage.py`)
- SQLite database abstraction
- WAL mode for concurrent access
- Schema initialization and migrations
- ACID transaction support
- Task lifecycle management

#### Configuration (`sparkq.yml`)
- Server settings (port, paths)
- Database configuration
- Tool registry with timeouts
- Task class definitions
- Script directory mappings

### 2. Database Schema

The SQLite database (`sparkq.db`) contains:

**Sessions**: Organizational units
- session_id: unique identifier
- name: human-readable name
- created_at: timestamp

**Streams**: Task queues within sessions
- stream_id: unique identifier
- session_id: parent session
- name: human-readable name
- created_at: timestamp

**Tasks**: Work items in streams
- task_id: unique identifier
- stream_id: parent stream
- status: pending/running/completed/failed
- summary: task description
- created_at, started_at, completed_at: timestamps
- timeout: execution deadline
- failure_reason: if status is failed

### 3. Dependency Management

**Python Dependencies** (`sparkq/requirements.txt`):
- `typer` — CLI framework
- `pydantic` — Data validation
- `uvicorn` — ASGI server
- `fastapi` — Web framework
- `pyyaml` — Configuration parsing
- `sqlalchemy` (implicit via storage layer) — Database ORM

### 4. Configuration System

**sparkq.yml structure**:

```yaml
project:
  name: project-name
  repo_path: /path/to/repo

server:
  port: 8420

database:
  path: sparkq.db
  mode: wal

script_dirs:
  - scripts

task_classes:
  FAST_SCRIPT:
    timeout: 30
  MEDIUM_SCRIPT:
    timeout: 300
  LLM_HEAVY:
    timeout: 900

tools:
  run-bash:
    description: Execute bash script
    task_class: MEDIUM_SCRIPT
  llm-sonnet:
    description: Call Claude Sonnet
    task_class: LLM_HEAVY
```

## Runtime Flow

1. **Startup** (`python -m sparkq.src.cli run`):
   - Loads `sparkq.yml` configuration
   - Initializes database if needed
   - Starts FastAPI server on configured port
   - Opens HTTP listener for API requests

2. **Task Enqueueing**:
   - CLI or API request adds task to stream
   - Status set to "pending"
   - Task stored in database

3. **Task Processing**:
   - Worker claims task via `/claim` endpoint
   - Status changes to "running"
   - Worker executes task
   - Worker reports result or failure
   - Status changes to "completed" or "failed"

4. **Task Lifecycle**:
   - Stale detection: Tasks running > 2× timeout auto-fail
   - Purging: Completed tasks auto-deleted after configured days
   - Log rotation: Keeps recent logs, rotates old ones

## Technology Stack

- **Language**: Python 3.10+
- **Web Framework**: FastAPI
- **ASGI Server**: Uvicorn
- **Database**: SQLite (WAL mode)
- **CLI Framework**: Typer
- **Configuration**: YAML

## Deployment

After initial environment setup (via Python Bootstrap):

1. **Direct CLI**: `python -m sparkq.src.cli run`
2. **Wrapper Script**: `./sparkq.sh run`
3. **Direct Activation**: `source .venv/bin/activate && python -m sparkq.src.cli run`

All three approaches use the same standardized virtual environment and dependencies.

## API Documentation

When running, interactive API docs available at:
- **Swagger UI**: `http://localhost:8420/docs`
- **ReDoc**: `http://localhost:8420/redoc`
- **OpenAPI JSON**: `http://localhost:8420/openapi.json`

## Legacy Components

### Old SparkQueue (`_build/sparkqueue/`)
Previous version of the queue system, kept for reference. Not actively maintained or used.
