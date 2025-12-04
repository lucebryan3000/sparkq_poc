# SparkQ Architecture & Technology Reference

> **Version:** 1.0
> **Last Updated:** December 2024
> **Scope:** Single-user, local-first dev cockpit for orchestrating queues, LLMs, and scripts

---

## Table of Contents

1. [Overview](#overview)
2. [Technology Stack](#technology-stack)
3. [System Architecture](#system-architecture)
4. [Directory Structure](#directory-structure)
5. [Core Components](#core-components)
6. [Database Schema](#database-schema)
7. [API Reference](#api-reference)
8. [Data Flow & Workflows](#data-flow--workflows)
9. [Configuration System](#configuration-system)
10. [Web UI Architecture](#web-ui-architecture)
11. [Error Handling](#error-handling)
12. [Operational Characteristics](#operational-characteristics)

---

## Overview

SparkQ is a **local-first task queue management system** designed for single-user development workflows. It enables developers to:

- **Orchestrate queues** of tasks for Claude/LLM execution
- **Execute scripts** (bash, Python) in controlled sequences
- **Maintain context** across multiple related tasks
- **Track task lifecycle** from creation to completion

### Design Principles

| Principle | Description |
|-----------|-------------|
| **Single-user** | No auth, no tenancy, no multi-user features |
| **Local-first** | SQLite storage, file-based config, minimal infrastructure |
| **CLI-first** | CLI is primary interface, Web UI is secondary |
| **Simplicity bias** | Implement only what's explicitly needed |
| **Manual control** | Claude-in-chat reviews and decides; human oversight |

---

## Technology Stack

### Backend

| Technology | Version | Purpose |
|------------|---------|---------|
| **Python** | 3.11+ | Core runtime |
| **FastAPI** | Latest | REST API framework |
| **Uvicorn** | Latest | ASGI server |
| **SQLite** | 3.x | Database (WAL mode) |
| **Typer** | Latest | CLI framework |
| **Pydantic** | v2 | Data validation & models |

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| **Vanilla JS** | ES6+ | UI logic (no framework) |
| **HTML5** | - | Single-page structure |
| **CSS3** | - | Styling with CSS variables |
| **Fetch API** | - | HTTP client |

### Development & Testing

| Technology | Purpose |
|------------|---------|
| **pytest** | Python testing |
| **Jest** | JavaScript testing |
| **Puppeteer** | Browser automation |

### Infrastructure

| Component | Technology |
|-----------|------------|
| **Database** | SQLite with WAL mode |
| **Configuration** | YAML files |
| **Process Management** | PID lockfiles |
| **Logging** | Python logging module |

---

## System Architecture

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SparkQ System                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌──────────────┐     ┌──────────────┐     ┌──────────────────────────┐   │
│   │   CLI        │     │  Web UI      │     │  Queue Runner            │   │
│   │  (Typer)     │     │  (Browser)   │     │  (Python Script)         │   │
│   └──────┬───────┘     └──────┬───────┘     └───────────┬──────────────┘   │
│          │                    │                         │                   │
│          │ HTTP               │ HTTP                    │ HTTP              │
│          ▼                    ▼                         ▼                   │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                      FastAPI Server (api.py)                        │   │
│   │  ┌─────────────────────────────────────────────────────────────┐    │   │
│   │  │  REST Endpoints                                              │    │   │
│   │  │  /api/sessions  /api/queues  /api/tasks  /api/config        │    │   │
│   │  └─────────────────────────────────────────────────────────────┘    │   │
│   └───────────────────────────────┬─────────────────────────────────────┘   │
│                                   │                                         │
│                                   ▼                                         │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                      Storage Layer (storage.py)                     │   │
│   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │   │
│   │  │  Sessions   │  │   Queues    │  │   Tasks     │                 │   │
│   │  └─────────────┘  └─────────────┘  └─────────────┘                 │   │
│   └───────────────────────────────┬─────────────────────────────────────┘   │
│                                   │                                         │
│                                   ▼                                         │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                      SQLite Database (WAL Mode)                     │   │
│   │                      sparkq/data/sparkq.db                          │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  Background Threads                                                 │   │
│   │  ┌─────────────────────┐  ┌────────────────────────────────────┐   │   │
│   │  │  Auto-Purge Thread  │  │  Auto-Fail Thread (Stale Tasks)    │   │   │
│   │  │  (Delete old tasks) │  │  (Fail tasks > 2× timeout)         │   │   │
│   │  └─────────────────────┘  └────────────────────────────────────┘   │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Component Interaction Flow

```
┌────────────┐         ┌─────────────┐         ┌─────────────┐
│   User     │ ──────► │  sparkq.sh  │ ──────► │  CLI/Server │
│            │         │  (wrapper)  │         │             │
└────────────┘         └─────────────┘         └──────┬──────┘
                                                      │
                              ┌────────────────────────┤
                              │                        │
                              ▼                        ▼
                       ┌─────────────┐          ┌─────────────┐
                       │  CLI Mode   │          │ Server Mode │
                       │  (typer)    │          │  (uvicorn)  │
                       └──────┬──────┘          └──────┬──────┘
                              │                        │
                              │                        ▼
                              │                 ┌─────────────┐
                              │                 │  FastAPI    │
                              │                 │  (api.py)   │
                              │                 └──────┬──────┘
                              │                        │
                              ▼                        ▼
                       ┌──────────────────────────────────────┐
                       │           Storage Layer              │
                       │           (storage.py)               │
                       └──────────────────┬───────────────────┘
                                          │
                                          ▼
                       ┌──────────────────────────────────────┐
                       │           SQLite Database            │
                       │        sparkq/data/sparkq.db         │
                       └──────────────────────────────────────┘
```

---

## Directory Structure

```
sparkq/
├── sparkq/                          # Main application directory
│   ├── src/                         # Python backend
│   │   ├── api.py                   # FastAPI routes & endpoints
│   │   ├── cli.py                   # Typer CLI commands
│   │   ├── storage.py               # SQLite data layer
│   │   ├── server.py                # Uvicorn server wrapper
│   │   ├── models.py                # Pydantic data models
│   │   ├── config.py                # Configuration loading
│   │   ├── paths.py                 # Dynamic path resolution
│   │   ├── errors.py                # Domain exceptions
│   │   ├── constants.py             # Shared constants & timeouts
│   │   ├── agent_roles.py           # Agent role definitions
│   │   ├── prompt_engine.py         # Prompt generation
│   │   ├── prompt_templates.py      # Prompt templates
│   │   ├── index.py                 # Script indexing
│   │   ├── tools.py                 # Tool registry
│   │   └── __main__.py              # Module entry point
│   │
│   ├── ui/                          # Web dashboard
│   │   ├── index.html               # Single HTML entry point
│   │   ├── style.css                # Global styling
│   │   ├── dist/                    # Compiled JavaScript
│   │   ├── core/                    # Core JS modules
│   │   ├── pages/                   # Page modules
│   │   ├── components/              # Component modules
│   │   └── utils/                   # Utility modules
│   │
│   ├── data/                        # Database storage
│   │   ├── sparkq.db                # SQLite database
│   │   └── backups/                 # Database backups
│   │
│   ├── tests/                       # Test suites
│   │   ├── unit/                    # Unit tests
│   │   ├── integration/             # Integration tests
│   │   ├── e2e/                     # End-to-end tests
│   │   └── browser/                 # Browser automation
│   │
│   ├── scripts/                     # Utility scripts
│   │   └── tools/                   # Tool implementations
│   │
│   ├── docs/                        # Documentation
│   └── migrations/                  # Schema migrations
│
├── sparkq.sh                        # CLI wrapper script
├── sparkq.yml                       # Configuration file
├── requirements.txt                 # Python dependencies
├── package.json                     # Node.js dependencies
└── ARCHITECTURE.md                  # This file
```

---

## Core Components

### 1. Server (`server.py`)

The server component manages the FastAPI application lifecycle:

```
Server Startup Flow
───────────────────
1. Acquire lockfile (prevent multiple instances)
2. Load configuration from sparkq.yml
3. Initialize/migrate database schema
4. Start background threads:
   ├── Auto-Purge Thread (delete old tasks)
   └── Auto-Fail Thread (fail stale tasks)
5. Launch Uvicorn on configured host:port
```

**Key Features:**
- PID-based lockfile coordination
- Graceful shutdown handling
- Background thread management
- Database connection pooling

### 2. API Layer (`api.py`)

FastAPI application with RESTful endpoints:

| Category | Endpoints |
|----------|-----------|
| **Health** | `GET /health` |
| **Sessions** | `GET/POST /api/sessions`, `GET/PUT/DELETE /api/sessions/{id}` |
| **Queues** | `GET/POST /api/queues`, `GET/PUT/DELETE /api/queues/{id}` |
| **Tasks** | `GET/POST /api/tasks`, `GET/PUT/DELETE /api/tasks/{id}` |
| **Task Actions** | `POST /api/tasks/{id}/claim`, `/complete`, `/fail`, `/reset`, `/rerun` |
| **Config** | `GET/POST /api/config`, `POST /api/config/validate` |
| **Tools** | `GET/POST/PUT/DELETE /api/tools` |
| **Prompts** | `GET/POST/PUT/DELETE /api/prompts` |
| **Agent Roles** | `GET/POST/PUT/DELETE /api/agent-roles` |

### 3. CLI (`cli.py`)

Typer-based command-line interface:

```bash
# Server commands
sparkq setup                    # Initialize database & config
sparkq run [--background]       # Start server
sparkq start                    # Start in background
sparkq stop                     # Stop server
sparkq status                   # Check server status
sparkq reload                   # Reload configuration

# Session commands
sparkq session create <name>    # Create session
sparkq session list             # List sessions
sparkq session end <id>         # End session

# Task commands
sparkq enqueue <queue>          # Add task to queue
sparkq peek <queue>             # View next task
sparkq claim <queue>            # Claim task
sparkq complete <task_id>       # Complete task
sparkq fail <task_id>           # Fail task
sparkq tasks [--queue X]        # List tasks
sparkq requeue <task_id>        # Requeue task
sparkq purge                    # Purge old tasks
```

### 4. Storage Layer (`storage.py`)

SQLite data access layer with:

- **CRUD operations** for all entities
- **Transaction management** with context managers
- **Connection pooling** via thread-local storage
- **Index optimization** for common queries
- **WAL mode** for concurrent access

### 5. Queue Runner (`queue_runner.py`)

External process that:

1. Polls for queued tasks
2. Claims tasks for execution
3. Streams prompts to stdout
4. Captures execution results
5. Completes or fails tasks

---

## Database Schema

### Entity Relationship Diagram

```
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│   projects   │       │   sessions   │       │    queues    │
├──────────────┤       ├──────────────┤       ├──────────────┤
│ id (PK)      │◄──────│ project_id   │       │ id (PK)      │
│ name         │       │ id (PK)      │◄──────│ session_id   │
│ repo_path    │       │ name         │       │ name         │
│ created_at   │       │ status       │       │ instructions │
│ updated_at   │       │ started_at   │       │ status       │
└──────────────┘       │ ended_at     │       │ model_profile│
                       └──────────────┘       └──────┬───────┘
                                                     │
                                                     ▼
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│ agent_roles  │       │   prompts    │       │    tasks     │
├──────────────┤       ├──────────────┤       ├──────────────┤
│ id (PK)      │       │ id (PK)      │       │ id (PK)      │
│ key          │       │ command      │       │ queue_id (FK)│
│ label        │       │ label        │       │ tool_name    │
│ description  │       │ template_text│       │ task_class   │
│ active       │       │ category     │       │ payload      │
└──────────────┘       │ active       │       │ status       │
                       └──────────────┘       │ timeout      │
                                              │ result       │
                                              │ error        │
                                              │ claimed_at   │
                                              │ finished_at  │
                                              └──────────────┘
```

### Table Definitions

#### `tasks` Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT | Primary key (tsk_{uuid}) |
| `queue_id` | TEXT | Foreign key to queues |
| `tool_name` | TEXT | Tool identifier (e.g., 'llm-sonnet') |
| `task_class` | TEXT | Timeout class (FAST_SCRIPT, LLM_HEAVY) |
| `payload` | TEXT | JSON task arguments |
| `status` | TEXT | queued \| running \| succeeded \| failed |
| `timeout` | INTEGER | Seconds before timeout |
| `result` | TEXT | JSON result (if succeeded) |
| `error` | TEXT | Error message (if failed) |
| `claimed_at` | TEXT | ISO 8601 timestamp |
| `finished_at` | TEXT | ISO 8601 timestamp |

#### `queues` Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT | Primary key (que_{uuid}) |
| `session_id` | TEXT | Foreign key to sessions |
| `name` | TEXT | Unique queue name |
| `instructions` | TEXT | Queue-level instructions |
| `model_profile` | TEXT | Model routing profile |
| `status` | TEXT | active \| ended \| archived |

### Indexes

```sql
CREATE INDEX idx_tasks_queue_status ON tasks(queue_id, status);
CREATE INDEX idx_tasks_queue_created ON tasks(queue_id, created_at);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_queues_session ON queues(session_id);
CREATE INDEX idx_queues_status ON queues(status);
```

---

## API Reference

### Task Lifecycle Endpoints

```
POST /api/tasks
├── Creates task in 'queued' status
└── Returns: TaskResponse with id

POST /api/tasks/{id}/claim
├── Sets status='running', claimed_at=now()
└── Returns: TaskResponse with full payload

POST /api/tasks/{id}/complete
├── Body: { result: string, stdout?: string, stderr?: string }
├── Sets status='succeeded', finished_at=now()
└── Returns: TaskResponse

POST /api/tasks/{id}/fail
├── Body: { error: string, stderr?: string }
├── Sets status='failed', finished_at=now()
└── Returns: TaskResponse

POST /api/tasks/{id}/rerun
├── Creates new task with same payload
└── Returns: New TaskResponse
```

### Error Responses

| Status | Error Type | Description |
|--------|------------|-------------|
| 400 | ValidationError | Invalid input data |
| 404 | NotFoundError | Resource not found |
| 409 | ConflictError | State conflict |
| 500 | InternalError | Unhandled exception |

---

## Data Flow & Workflows

### Task Lifecycle Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        TASK LIFECYCLE                                │
└─────────────────────────────────────────────────────────────────────┘

     ┌──────────────┐
     │   ENQUEUE    │  CLI: sparkq enqueue <queue>
     │              │  API: POST /api/tasks
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │   QUEUED     │  status='queued'
     │              │  Waiting for claim
     └──────┬───────┘
            │
            │  Queue Runner polls
            │  POST /api/tasks/{id}/claim
            ▼
     ┌──────────────┐
     │   RUNNING    │  status='running'
     │              │  claimed_at=now()
     └──────┬───────┘
            │
            ├────────────────────────────────┐
            │                                │
            ▼                                ▼
     ┌──────────────┐                 ┌──────────────┐
     │  SUCCEEDED   │                 │   FAILED     │
     │              │                 │              │
     │ result=JSON  │                 │ error=string │
     └──────────────┘                 └──────────────┘
            │                                │
            │                                │
            ▼                                ▼
     ┌──────────────────────────────────────────────┐
     │                  PURGED                       │
     │  (Auto-deleted after purge.older_than_days)  │
     └──────────────────────────────────────────────┘
```

### Stale Task Detection Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                    STALE TASK DETECTION                              │
└─────────────────────────────────────────────────────────────────────┘

Every 30 seconds (auto_fail_interval_seconds):

┌─────────────────┐
│ Check Running   │
│ Tasks           │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│  For each running task:                                              │
│                                                                     │
│  elapsed = now() - claimed_at                                       │
│                                                                     │
│  if elapsed > timeout × 1.0 AND not warned:                        │
│      ├── Mark stale_warned_at = now()                              │
│      └── Log warning                                                │
│                                                                     │
│  if elapsed > timeout × 2.0:                                        │
│      ├── Set status = 'failed'                                     │
│      ├── Set error = 'Task exceeded timeout'                       │
│      └── Log auto-fail                                              │
└─────────────────────────────────────────────────────────────────────┘
```

### Queue Runner Workflow

```
┌─────────────────────────────────────────────────────────────────────┐
│                    QUEUE RUNNER WORKFLOW                             │
└─────────────────────────────────────────────────────────────────────┘

┌──────────────────┐
│  Start Runner    │  ./sparkq/queue_runner.py --queue "Backend"
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Load Config     │  Read sparkq.yml, resolve base_url
└────────┬─────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────────┐
│                         POLL LOOP                                 │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                                                             │ │
│  │  ┌─────────────────┐                                       │ │
│  │  │ GET /api/tasks  │  ?queue_id=X&status=queued            │ │
│  │  └────────┬────────┘                                       │ │
│  │           │                                                 │ │
│  │           ▼                                                 │ │
│  │  ┌─────────────────┐     No tasks?                         │ │
│  │  │ Tasks Found?    │ ───────────────► Sleep(poll_interval) │ │
│  │  └────────┬────────┘                        │              │ │
│  │           │ Yes                             │              │ │
│  │           ▼                                 │              │ │
│  │  ┌─────────────────┐                        │              │ │
│  │  │ Claim Task      │  POST /api/tasks/{id}/claim           │ │
│  │  └────────┬────────┘                        │              │ │
│  │           │                                 │              │ │
│  │           ▼                                 │              │ │
│  │  ┌─────────────────┐                        │              │ │
│  │  │ Stream Prompt   │  Print to stdout for Claude           │ │
│  │  └────────┬────────┘                        │              │ │
│  │           │                                 │              │ │
│  │           ▼                                 │              │ │
│  │  ┌─────────────────┐                        │              │ │
│  │  │ Wait Execution  │  Claude processes task │              │ │
│  │  └────────┬────────┘                        │              │ │
│  │           │                                 │              │ │
│  │           ▼                                 │              │ │
│  │  ┌─────────────────┐                        │              │ │
│  │  │ Complete/Fail   │  POST /api/tasks/{id}/complete        │ │
│  │  └────────┬────────┘                        │              │ │
│  │           │                                 │              │ │
│  │           └─────────────────────────────────┘              │ │
│  │                                                             │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

---

## Configuration System

### Configuration File: `sparkq.yml`

```yaml
# Project identification
project:
  name: sparkq-local
  repo_path: .

# Server settings
server:
  host: 0.0.0.0
  port: 5005

# Database configuration
database:
  path: sparkq/data/sparkq.db
  mode: wal

# Automatic cleanup
purge:
  older_than_days: 3

# Script discovery
sparkq_scripts_dir: sparkq/scripts
script_dirs:
  - sparkq/scripts/tools

# Task timeout classes
task_classes:
  FAST_SCRIPT:
    timeout: 120      # 2 minutes
  MEDIUM_SCRIPT:
    timeout: 600      # 10 minutes
  LLM_LITE:
    timeout: 480      # 8 minutes
  LLM_HEAVY:
    timeout: 1200     # 20 minutes

# Available tools
tools:
  run-bash:
    description: Bash script
    task_class: MEDIUM_SCRIPT
  run-python:
    description: Python script
    task_class: MEDIUM_SCRIPT
  llm-haiku:
    description: Haiku (fast, cheap)
    task_class: LLM_LITE
  llm-sonnet:
    description: Sonnet (balanced)
    task_class: LLM_HEAVY
  llm-codex:
    description: Codex ($0 code gen)
    task_class: LLM_HEAVY

# Queue runner settings
queue_runner:
  poll_interval: 30
  auto_fail_interval_seconds: 30
  base_url: http://localhost:5005

# Defaults
defaults:
  model: llm-sonnet
```

### Configuration Resolution Order

```
1. SPARKQ_CONFIG environment variable (if set)
         │
         ▼
2. sparkq.yml in current working directory
         │
         ▼
3. sparkq.yml in project root (default)
```

---

## Web UI Architecture

### Single-Page Application Structure

```
┌─────────────────────────────────────────────────────────────────────┐
│                         index.html                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │  <head>                                                       │ │
│  │    style.css (52KB)                                           │ │
│  │    Inline critical CSS                                        │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │  <body>                                                       │ │
│  │    ┌─────────────────────────────────────────────────────────┐│ │
│  │    │  Header (Navigation)                                    ││ │
│  │    └─────────────────────────────────────────────────────────┘│ │
│  │    ┌─────────────────────────────────────────────────────────┐│ │
│  │    │  #dashboard-page                                        ││ │
│  │    │  #settings-page                                         ││ │
│  │    │  (Page containers, shown/hidden by router)              ││ │
│  │    └─────────────────────────────────────────────────────────┘│ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │  <script> Loading Sequence                                   │ │
│  │    1. dist/app-core.js     (API, globals, routing)           │ │
│  │    2. dist/ui-utils.js     (Utilities, modals, toasts)       │ │
│  │    3. dist/quick-add.js    (Task entry component)            │ │
│  │    4. dist/dashboard.js    (Dashboard page)                  │ │
│  │    5. dist/queues.js       (Queue management)                │ │
│  │    6. dist/config.js       (Settings page)                   │ │
│  │    7. dist/scripts.js      (Script browser)                  │ │
│  │    8. dist/tasks.js        (Task listing)                    │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Module Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                      JavaScript Module System                        │
└─────────────────────────────────────────────────────────────────────┘

    window.API                    window.Utils
    ├── api()                     ├── showToast()
    └── callAPI()                 ├── showPrompt()
                                  ├── showConfirm()
                                  ├── showError()
                                  ├── formatTimestamp()
                                  └── formatDuration()

    window.Pages                  window.Components
    ├── Dashboard                 └── QuickAdd
    ├── Settings
    ├── Queues
    └── Tasks

    window.ActionRegistry         window.Utils (continued)
    ├── nav-dashboard             ├── navigateTo()
    ├── nav-settings              ├── buildRoute()
    └── [custom actions]          └── registerAction()
```

### Notification Systems

```
┌─────────────────────────────────────────────────────────────────────┐
│                    NOTIFICATION ARCHITECTURE                         │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────┐  ┌─────────────────────────────────┐
│  ALERTS (Top-Right)             │  │  TOASTS (Bottom-Right)          │
│  showAlert(), showError()       │  │  showToast()                    │
├─────────────────────────────────┤  ├─────────────────────────────────┤
│  • Dismissible by user          │  │  • Auto-dismiss (2-4 seconds)   │
│  • Critical errors              │  │  • Action feedback              │
│  • Validation failures          │  │  • Success/failure messages     │
│  • Important state issues       │  │  • Non-blocking                 │
└─────────────────────────────────┘  └─────────────────────────────────┘
```

---

## Error Handling

### Domain Error Hierarchy

```
SparkQError (Base)
    │
    ├── ValidationError    → HTTP 400 Bad Request
    │   • Invalid inputs
    │   • Constraint violations
    │
    ├── NotFoundError      → HTTP 404 Not Found
    │   • Missing queue, task, session
    │
    └── ConflictError      → HTTP 409 Conflict
        • State collisions
        • Duplicate operations
```

### Error Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Storage Layer  │ ──► │   API Layer     │ ──► │   CLI Layer     │
│                 │     │                 │     │                 │
│  Raises domain  │     │  Maps to HTTP   │     │  Renders human  │
│  errors         │     │  status codes   │     │  messages       │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### Global Error Handler (UI)

```javascript
// Catches uncaught errors and unhandled promise rejections
window.onerror = function(message, source, lineno, colno, error) {
    showError(`Unexpected error: ${error?.message || message}`);
};

window.addEventListener('unhandledrejection', function(event) {
    showError(`Async error: ${event.reason?.message || event.reason}`);
});
```

---

## Operational Characteristics

### Performance Metrics

| Metric | Value |
|--------|-------|
| Task list pagination limit | 1,000 |
| Database lock timeout | 5.0 seconds |
| Auto-fail check interval | 30 seconds |
| Stale warning threshold | 1.0× timeout |
| Auto-fail threshold | 2.0× timeout |
| Default purge age | 3 days |

### Timeout Classes

| Class | Timeout | Use Case |
|-------|---------|----------|
| `FAST_SCRIPT` | 120s | Quick bash/Python scripts |
| `MEDIUM_SCRIPT` | 600s | Standard scripts |
| `LLM_LITE` | 480s | Haiku, simple prompts |
| `LLM_HEAVY` | 1200s | Sonnet, Codex, complex tasks |

### Database Operations

```
┌─────────────────────────────────────────────────────────────────────┐
│  SQLite Configuration                                                │
├─────────────────────────────────────────────────────────────────────┤
│  PRAGMA journal_mode = WAL      # Write-Ahead Logging               │
│  PRAGMA busy_timeout = 5000     # 5 second lock timeout             │
│  PRAGMA foreign_keys = ON       # Enforce referential integrity     │
└─────────────────────────────────────────────────────────────────────┘
```

### Backup System

```
Automatic Backups:
├── Created before each server start
├── Stored in sparkq/data/backups/
└── Last 3 versions retained

Manual Commands:
├── ./sparkq.sh backup-list       # Show available backups
└── ./sparkq.sh backup-restore N  # Restore backup N
```

---

## Quick Reference

### Common Operations

```bash
# Setup
./sparkq.sh setup              # Interactive setup wizard

# Server
./sparkq.sh start              # Start in background
./sparkq.sh stop               # Stop server
./sparkq.sh status             # Check status
./sparkq.sh run                # Run in foreground

# Tasks
./sparkq.sh enqueue Backend    # Enqueue task
./sparkq.sh peek Backend       # View next task
./sparkq.sh claim Backend      # Claim task
./sparkq.sh complete <id>      # Complete task

# Testing
pytest sparkq/tests/           # Run all tests
npm run test:browser           # Run browser tests
```

### Key File Locations

| Purpose | Path |
|---------|------|
| Entry script | `sparkq.sh` |
| Configuration | `sparkq.yml` |
| Database | `sparkq/data/sparkq.db` |
| API routes | `sparkq/src/api.py` |
| CLI commands | `sparkq/src/cli.py` |
| Storage layer | `sparkq/src/storage.py` |
| Web UI | `sparkq/ui/index.html` |

---

*This document is auto-generated and may be updated as the system evolves.*
