# SparkQueue Architecture

This document describes the current architecture of SparkQueue and its core components.

## Project Structure

```
sparkqueue/
├── sparkq/                          # SparkQ application (the actual system)
│   ├── src/
│   │   ├── cli.py                  # CLI command interface (typer-based)
│   │   ├── server.py               # FastAPI/Uvicorn HTTP server
│   │   ├── api.py                  # REST API endpoints
│   │   ├── storage.py              # SQLite database layer
│   │   ├── tools.py                # Tool registry and management
│   │   └── index.py                # Script indexing
│   ├── ui/                         # Web dashboard (frontend assets)
│   │   ├── core/                   # Core UI components
│   │   ├── components/             # Reusable UI components
│   │   ├── pages/                  # Page layouts
│   │   ├── utils/                  # Utility functions
│   │   └── dist/                   # Built assets
│   ├── data/                       # Application data directory
│   │   └── sparkq.db               # SQLite database (created at runtime)
│   ├── logs/
│   │   └── sparkq.log              # Application logs
│   ├── tests/                      # Test suites
│   │   ├── unit/                   # Unit tests
│   │   ├── integration/            # Integration tests
│   │   ├── e2e/                    # End-to-end tests
│   │   └── browser/                # Browser-based tests
│   ├── scripts/                    # SparkQ internal scripts
│   ├── requirements.txt            # Python dependencies
│   └── README.md                   # SparkQ documentation
│
├── __omni-dev/
│   └── python-bootstrap/           # Environment bootstrapper
│       ├── bootstrap.sh            # Main bootstrap script
│       ├── stop-env.sh             # Interactive process manager
│       └── kill-python.sh          # Quick kill script
│
├── .venv/                          # Python virtual environment
├── sparkq.yml                      # Configuration file
├── sparkq.sh                       # Convenience wrapper script for CLI
├── scripts/                        # Project-specific scripts
├── docs/                           # Documentation
├── .claude/                        # Claude Code configuration
└── README.md                       # Project documentation
```

## Core Components

### 1. SparkQ Application (`sparkq/`)

**Purpose**: Distributed task queue system for managing work sessions

**Key Features**:
- FIFO task management per queue
- Multiple sessions and queues for organization
- Queue archiving and unarchiving
- SQLite database with WAL mode for concurrent access
- REST API with interactive documentation
- CLI commands for management
- Web UI dashboard with light/dark mode
- Database-backed configuration management
- Auto-failure of stale tasks
- Auto-purge of completed tasks
- Prompt template system
- Context management for queue instructions

**Architecture Layers**:

#### CLI Layer (`src/cli.py`)
- Typer-based command interface
- Commands for session/queue/task management
- Commands for server control and configuration
- Interactive and programmatic usage

#### Server Layer (`src/server.py`)
- FastAPI/Uvicorn HTTP server (port 5005)
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
- Config table for runtime configuration
- Audit logging for config changes
- Granular task class and tool management
- Prompt template storage

#### Configuration (`sparkq.yml`)
- Server settings (port, paths)
- Database configuration
- Tool registry with timeouts
- Task class definitions
- Script directory mappings

### 2. Database Schema

The SQLite database (`sparkq.db`) contains:

**Projects**: Top-level container (single project mode)
- id: unique identifier
- name: project name
- repo_path: repository path
- prd_path: PRD file path (optional)
- created_at, updated_at: timestamps

**Sessions**: Organizational units for work
- id: unique identifier
- project_id: parent project
- name: human-readable name
- description: optional session description
- status: active/ended
- started_at, ended_at: timestamps
- created_at, updated_at: timestamps

**Queues**: Task queues within sessions
- id: unique identifier
- session_id: parent session
- name: human-readable name (unique)
- instructions: optional queue-specific instructions
- status: active/ended/archived/idle/planned
- created_at, updated_at: timestamps

**Tasks**: Work items in queues
- id: unique identifier
- queue_id: parent queue
- tool_name: tool to execute
- task_class: task classification (FAST_SCRIPT, MEDIUM_SCRIPT, etc.)
- payload: JSON task data
- status: queued/running/succeeded/failed
- timeout: execution deadline (seconds)
- attempts: number of execution attempts
- result, error, stdout, stderr: execution outputs
- created_at, updated_at, started_at, finished_at: timestamps

**Config**: Runtime configuration
- namespace: config category
- key: config key
- value: JSON-serialized config value
- updated_at: timestamp
- updated_by: actor who updated (system/api/seed)

**Task Classes**: Task timeout definitions
- name: task class name (primary key)
- timeout: default timeout in seconds
- description: optional description
- created_at, updated_at: timestamps

**Tools**: Tool registry
- name: tool name (primary key)
- description: optional description
- task_class: reference to task_classes.name
- created_at, updated_at: timestamps

**Prompts**: Reusable prompt templates
- id: unique identifier
- command: slash command (unique)
- label: display label
- template_text: prompt template
- description: optional description
- created_at, updated_at: timestamps

**Audit Log**: Configuration change history
- id: unique identifier
- actor: who made the change
- action: what was changed
- details: JSON details
- created_at: timestamp

### 3. Technology Stack

**Backend**:
- Python 3.11+
- FastAPI — Web framework
- Uvicorn — ASGI server
- SQLite — Database (WAL mode)
- Typer — CLI framework
- PyYAML — Configuration parsing
- Pydantic — Data validation

**Frontend**:
- Vanilla JavaScript
- Bootstrap 5 — UI framework
- CSS custom properties — Theming (light/dark mode)

**Development**:
- pytest — Testing framework
- Browser-based E2E tests

### 4. Configuration System

**sparkq.yml structure**:

```yaml
project:
  name: project-name
  repo_path: /path/to/repo
  prd_path: null  # Optional PRD file path

server:
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

queue_runner:
  poll_interval: 30  # Polling interval in seconds
```

**Configuration Management**:
- Initial config loaded from `sparkq.yml` on first run
- Runtime config stored in database `config` table
- Config can be modified via API endpoints
- Database values take precedence over YAML defaults
- Tools and task classes managed through dedicated database tables

## Runtime Flow

1. **Startup** (`python -m sparkq.src.cli run`):
   - Loads `sparkq.yml` configuration
   - Initializes database if needed (seeds default config if empty)
   - Starts FastAPI server on port 5005 (configurable)
   - Opens HTTP listener for API requests
   - Serves Web UI dashboard

2. **Task Enqueueing**:
   - CLI or API request adds task to queue
   - Status set to "queued"
   - Task stored in database with:
     - Tool name and task class
     - Payload (JSON)
     - Timeout (from task class or explicit)
   - Friendly ID generated (QUEUE-XXXX format)

3. **Task Processing**:
   - Worker claims task via `/api/tasks/{task_id}/claim` endpoint
   - Status changes to "running"
   - Worker executes task using specified tool
   - Worker reports result via `/api/tasks/{task_id}/complete` or `/api/tasks/{task_id}/fail`
   - Status changes to "succeeded" or "failed"

4. **Task Lifecycle**:
   - Stale detection: Tasks running > 2× timeout auto-fail
   - Purging: Succeeded/failed tasks auto-deleted after configured days
   - Requeue: Failed/succeeded tasks can be requeued (creates new task)

5. **Queue Management**:
   - Queues can be ended (no new tasks accepted)
   - Queues can be archived (hidden from main view)
   - Queues can be unarchived (restored to active view)
   - Queue status auto-calculated based on task states:
     - archived: explicitly archived
     - ended: explicitly ended
     - active: has running tasks
     - planned: has queued tasks
     - idle: no tasks or all tasks completed

## API Endpoints

**Server**:
- `GET /health` — Health check with build ID
- `GET /api/version` — Current build version
- `GET /stats` — Dashboard statistics

**Sessions**:
- `GET /api/sessions` — List sessions
- `POST /api/sessions` — Create session
- `GET /api/sessions/{id}` — Get session details
- `PUT /api/sessions/{id}` — Update session
- `PUT /api/sessions/{id}/end` — End session
- `DELETE /api/sessions/{id}` — Delete session (cascade)

**Queues**:
- `GET /api/queues` — List queues
- `POST /api/queues` — Create queue
- `GET /api/queues/{id}` — Get queue details
- `PUT /api/queues/{id}` — Update queue
- `PUT /api/queues/{id}/end` — End queue
- `PUT /api/queues/{id}/archive` — Archive queue
- `PUT /api/queues/{id}/unarchive` — Unarchive queue
- `DELETE /api/queues/{id}` — Delete queue (cascade)

**Tasks**:
- `GET /api/tasks` — List tasks (with filters)
- `POST /api/tasks` — Create task
- `POST /api/tasks/quick-add` — Quick task creation
- `GET /api/tasks/{id}` — Get task details
- `PUT /api/tasks/{id}` — Update task
- `POST /api/tasks/{id}/claim` — Claim task
- `POST /api/tasks/{id}/complete` — Mark task complete
- `POST /api/tasks/{id}/fail` — Mark task failed
- `POST /api/tasks/{id}/requeue` — Requeue task
- `DELETE /api/tasks/{id}` — Delete task

**Configuration**:
- `GET /api/config` — Get complete config
- `PUT /api/config/{namespace}/{key}` — Update config entry
- `DELETE /api/config/{namespace}/{key}` — Delete config entry
- `POST /api/config/validate` — Validate config payload

**Task Classes & Tools**:
- `GET /api/task-classes` — List task classes
- `POST /api/task-classes` — Create task class
- `PUT /api/task-classes/{name}` — Update task class
- `DELETE /api/task-classes/{name}` — Delete task class
- `GET /api/tools` — List tools
- `POST /api/tools` — Create tool
- `PUT /api/tools/{name}` — Update tool
- `DELETE /api/tools/{name}` — Delete tool

**Prompts**:
- `GET /api/prompts` — List prompts
- `POST /api/prompts` — Create prompt
- `GET /api/prompts/{id}` — Get prompt details
- `PUT /api/prompts/{id}` — Update prompt
- `DELETE /api/prompts/{id}` — Delete prompt

**Scripts**:
- `GET /api/scripts/index` — Build and return script index
- `GET /api/build-prompts` — List build prompts

## Deployment

**Environment Setup** (via Python Bootstrap):
```bash
./__omni-dev/python-bootstrap/bootstrap.sh
```

**Running the Server**:
1. **Direct CLI**: `python -m sparkq.src.cli run`
2. **Wrapper Script**: `./sparkq.sh run`
3. **Direct Activation**: `source .venv/bin/activate && python -m sparkq.src.cli run`
4. **Background Mode**: `python -m sparkq.src.cli run --background`

Runtime settings:
- Host/port come from `sparkq.yml` (`server.host`/`server.port`, defaults `0.0.0.0:5005`); CLI `--host/--port` overrides per invocation.
- Database path resolves relative to the active `sparkq.yml` and is created if missing; set `SPARKQ_CONFIG` to point at an alternate config (resolution order: env override → CWD `sparkq.yml` → repo root).
- Purge retention (`purge.older_than_days`) and auto-fail interval (`queue_runner.auto_fail_interval_seconds`) feed the background maintenance threads.

**Server Management**:
- **Status**: `sparkq status`
- **Stop**: `sparkq stop`
- **Quick Kill**: `./__omni-dev/python-bootstrap/kill-python.sh`
- **Interactive Manager**: `./__omni-dev/python-bootstrap/stop-env.sh`

## Web Interface

When running, access the following:
- **Dashboard**: `http://localhost:5005/` (redirects to `/ui/`)
- **Web UI**: `http://localhost:5005/ui/`
- **Swagger API Docs**: `http://localhost:5005/docs`
- **ReDoc**: `http://localhost:5005/redoc`
- **OpenAPI JSON**: `http://localhost:5005/openapi.json`

**UI Features**:
- Session and queue management
- Task creation and monitoring
- Quick-add task interface (LLM prompts and scripts)
- Light/dark mode toggle
- Real-time task status updates
- Queue archiving/unarchiving
- Config table management
- Prompt template library

## CLI Commands

**Setup**:
- `sparkq setup` — Initialize SparkQ environment

**Server**:
- `sparkq run [--background|--foreground]` — Start server
- `sparkq stop` — Stop server
- `sparkq status` — Check server status
- `sparkq reload` — Reload configuration

**Sessions**:
- `sparkq session create <name>` — Create session
- `sparkq session list` — List sessions
- `sparkq session end <name>` — End session

**Queues**:
- `sparkq queue create <name> --session <session>` — Create queue
- `sparkq queue list` — List queues
- `sparkq queue end <queue_id>` — End queue

**Tasks**:
- `sparkq enqueue --queue <name> --tool <tool> [--task-class CLASS]` — Enqueue task
- `sparkq tasks [--status STATUS] [--queue QUEUE]` — List tasks
- `sparkq peek --queue <name>` — View next task
- `sparkq claim --queue <name>` — Claim task
- `sparkq complete <task_id> --result "..."` — Mark complete
- `sparkq fail <task_id> --error "..."` — Mark failed
- `sparkq requeue <task_id>` — Requeue task

**Scripts**:
- `sparkq scripts list` — List available scripts
- `sparkq scripts search <query>` — Search scripts

**Config**:
- `sparkq config-export [--output FILE]` — Export DB config to YAML
