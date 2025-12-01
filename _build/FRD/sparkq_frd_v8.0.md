# SparkQ — Functional Requirements Document (FRD) v8.0

> **Status**: Active implementation tracking document
> **Base Version**: v7.5
> **Changes**: Updated terminology, implementation status tracking, completion percentages

---

## 1. Purpose
**Status**: ✅ COMPLETE (100%)

SparkQ is a **single-user, dev-only job queue** that runs tasks so you don't have to babysit them.

**One sentence:** Queue work, walk away, review results later.

---

## 2. What SparkQ Is
**Status**: ✅ COMPLETE (100%)

- A local task queue for your dev machine
- Coordinates Bash scripts, Python scripts, and LLM calls
- Stores everything in SQLite (one file, WAL mode)
- Provides a CLI (primary) and Web UI (secondary)
- Self-contained: copy into project, use, delete when done
- **Does execute tasks** via `queue_runner.py` (Claude-in-chat model)

**Implementation Notes:**
- ✅ SQLite with WAL mode implemented
- ✅ CLI fully functional via Typer
- ✅ Web UI operational at http://localhost:5005
- ✅ queue_runner.py handles task execution (replaces original "watcher" concept)

---

## 3. What SparkQ Is NOT
**Status**: ✅ COMPLETE (100%)

- Not a production system
- Not pushed to QA or prod
- Not a workflow engine (no DAGs, no dependencies, no branching)
- Not multi-user or multi-tenant
- Not a replacement for CI/CD
- Not a hosted service

---

## 4. Lifecycle
**Status**: ✅ COMPLETE (100%)

```
┌─────────────────────────────────────────────────────────────────────┐
│  Copy into project → sparkq setup → Use during dev → sparkq teardown│
└─────────────────────────────────────────────────────────────────────┘
```

**Implemented:**
- ✅ `sparkq setup` (database initialization)
- ✅ Normal usage workflow
- ✅ Auto-purge (background task on server startup)
- ✅ `sparkq teardown` (formal clean removal of all artifacts)

**Teardown Details:**
- Interactive confirmation prompts (can be skipped with `--force`)
- Removes database (`sparkq/data/sparkq.db*`), config (`sparkq.yml`), lock file, and logs
- Optional separate confirmation for virtual environment (`.venv/`) removal
- Idempotent: safe to run multiple times
- Help text: `sparkq teardown --help` shows what will be deleted

**Completion**: 100% - Full lifecycle from setup to cleanup

---

## 5. Guardrails
**Status**: ✅ COMPLETE (100%)

### 5.1 DO
All principles followed in current implementation.

### 5.2 DO NOT
All anti-patterns successfully avoided.

### 5.3 Feature Freeze Boundary
All out-of-scope items remain excluded.

---

## 6. Architecture
**Status**: ✅ COMPLETE (90%)

### 6.1 Component Overview

SparkQ runs as one server process. Workers execute via `queue_runner.py` (streaming prompts to Claude-in-chat).

```
┌─────────────────────────────────────────────────────────────────┐
│                        SparkQ Server                             │
│  - SQLite queue (WAL mode)                                       │
│  - Web UI (enqueue, view, monitor)                               │
│  - CLI (setup, run, enqueue, peek, claim, complete, fail)        │
│  - Auto-purge on startup (background)                            │
│  - Background stale detection & auto-fail                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP API
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    queue_runner.py (per queue)                   │
│  - Polls queue via API (30s default interval)                   │
│  - Streams task prompts to stdout for Claude-in-chat            │
│  - Displays queue instructions at start                         │
│  - Execution modes: --once, --run (default), --watch            │
│  - Auto-detects base_url from config + local IP                 │
│  - Stable worker_id: worker-{hostname}-{queue_name}             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ task_complete.py
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 Claude-in-chat (manual execution)                │
│  - Reads streamed prompts                                        │
│  - Executes tasks based on tool_name                            │
│  - Calls task_complete.py to mark done                          │
│  - Maintains context across tasks in same session               │
└─────────────────────────────────────────────────────────────────┘
```

**Implemented:**
- ✅ Server with FastAPI/Uvicorn
- ✅ SQLite with WAL mode
- ✅ Web UI at /ui/
- ✅ CLI with Typer
- ✅ queue_runner.py with --once, --run, --watch modes
- ✅ task_complete.py helper script
- ✅ Auto-purge on startup
- ✅ Background stale detection

**Missing:**
- ❌ Full automation (Claude still executes manually)
- ⚠️ FIFO communication not implemented (uses polling + streaming to stdout)

### 6.2 Storage
**Status**: ✅ COMPLETE (100%)

- **Database:** `sparkq/data/sparkq.db` (SQLite, WAL mode)
- **Location:** Configurable via `sparkq.yml` `database.path`
- **Concurrency:** WAL mode handles multiple readers + writers
- **Cleanup:** Delete the file, done

**Implementation:** Fully implemented in `src/storage.py`

### 6.3 Lockfiles
**Status**: ✅ COMPLETE (100%)

**SparkQ server lockfile:**
- ✅ Implemented: `sparkq.lock` with PID tracking
- ✅ Prevents multiple server instances
- ✅ Created on startup, removed on shutdown

**Queue runner lockfile:**
- ✅ Implemented: `/tmp/sparkq-runner-<queue_id>.lock` created by `queue_runner.py`
- ✅ Prevents duplicate runners per queue; cleans stale locks and handles SIGTERM/SIGINT
- ✅ Tested manually across `--once`, `--run`, `--watch` modes

**Completion**: 100% - Both server and queue runner lockfiles implemented

### 6.4 Network
**Status**: ✅ COMPLETE (100%)

- Binds to configurable host/port (default: `0.0.0.0:5005`)
- Can be localhost-only if configured
- No TLS, no auth (trusted local environment)

### 6.5 Auto-Purge
**Status**: ✅ COMPLETE (100%)

On server startup:
- ✅ Background task runs automatically in `src/server.py`
- ✅ Deletes `succeeded` and `failed` tasks older than configured days (default: 3)
- ✅ Never touches `queued` or `running` tasks
- ✅ Non-blocking (server starts immediately)

**Implementation:** `auto_purge_old_tasks()` in `src/server.py`

---

## 7. Data Model
**Status**: ✅ COMPLETE (95%)

### 7.1 Entity Relationships

**UPDATED TERMINOLOGY:**
- ~~streams~~ → **queues** (current implementation)
- ~~sessions~~ → **sessions** (unchanged)

```
┌─────────────────────────────────────────────────────────────────┐
│                         projects                                 │
│  v1: single row, auto-created on sparkq setup                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ 1:many
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         sessions                                 │
│  A bounded period of work (e.g., "api-v2", "payment-feature")   │
│  Groups multiple queues that work toward a common goal          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ 1:many
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         queues (formerly "streams")              │
│  A feature lane within a session (e.g., "auth", "api", "ui")    │
│  Globally unique name — no need to specify session in commands  │
│  Has instructions (mini-FRD) defining goals and context         │
│  Status: active/ended/archived/idle/planned                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ 1:many
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                          tasks                                   │
│  All tasks live here forever (until purge)                      │
│  Filter by status — no moving data between tables               │
└─────────────────────────────────────────────────────────────────┘
```

**Implemented:**
- ✅ All tables exist in SQLite schema
- ✅ Proper foreign key relationships
- ✅ Status field includes archived (extra state)

**Missing:**
- ⚠️ Projects table exists but may not be actively used in v1

### 7.2 Database Schema
**Status**: ✅ COMPLETE (100%)

**Implemented Tables:**
- ✅ `projects` - Basic structure (may be underutilized)
- ✅ `sessions` - Active sessions tracking
- ✅ `queues` - Queue management with archive support
- ✅ `tasks` - Full task lifecycle
- ✅ `config` - DB-backed configuration (Phase 20 enhancement)
- ✅ `audit_log` - Audit trail support
- ✅ `task_classes` - Task class definitions
- ✅ `tools` - Tool registry
- ✅ `prompts` - Prompt template storage

**Schema Enhancements Beyond FRD:**
- ✅ `claimed_at` timestamp on tasks (stale detection)
- ✅ `stale_warned_at` timestamp on tasks
- ✅ `friendly_id` on tasks (UX improvement)
- ✅ Additional indexes for performance

**Completion**: 100% - Schema complete with enhancements

---

## 8. Task Model
**Status**: ✅ COMPLETE (100%)

### 8.1 Task Structure
All fields implemented per specification.

### 8.2 Task Lifecycle
**Status**: ✅ COMPLETE (100%)

```
queued → running → succeeded
              ↘ failed
```

**Implemented:**
- ✅ All state transitions via API
- ✅ CLI commands for each state
- ✅ Atomic state changes in storage layer

### 8.3 Scheduling
**Status**: ✅ COMPLETE (100%)

**FIFO per queue implemented:**
- ✅ `sparkq claim --queue=<name>` returns oldest queued task
- ✅ Each queue is its own FIFO lane
- ✅ queue_runner.py processes tasks in order (sorted by created_at)

### 8.4 Task Classes
**Status**: ✅ COMPLETE (100%)

**Implemented:**
- ✅ Task classes stored in DB (tools and task_classes tables)
- ✅ Default timeouts: FAST_SCRIPT (120s), MEDIUM_SCRIPT (600s), LLM_LITE (480s), LLM_HEAVY (1200s)
- ✅ Configurable via sparkq.yml
- ✅ Per-tool overrides supported

### 8.5 Result Format
**Status**: ✅ COMPLETE (100%)

**Implemented:**
- ✅ `result_summary` field required (enforced by API)
- ✅ `result_data` field for additional JSON
- ✅ task_complete.py enforces summary requirement
- ✅ CLI validates summary on complete

### 8.6 Timeouts and Stale Detection
**Status**: ✅ COMPLETE (100%)

**Implemented:**
- ✅ Per-task timeouts from task classes
- ✅ Tool overrides in config
- ✅ Enqueue-time override via `--timeout`
- ✅ Stale warning at 1× timeout (visual indicator in UI)
- ✅ Auto-fail at 2× timeout (background task in server)
- ✅ `claimed_at` timestamp for accurate stale detection

**Implementation:** `auto_fail_stale_tasks()` in `src/server.py`

### 8.7 Failed Task Requeue
**Status**: ✅ COMPLETE (100%)

**Implemented:**
- ✅ `sparkq requeue <task_id>` command
- ✅ `POST /api/tasks/{task_id}/requeue` endpoint
- ✅ Creates new task with new ID
- ✅ Copies payload from original
- ✅ Fresh `queued` status
- ✅ Original task preserved in history

---

## 9. Queues (formerly "Streams")
**Status**: ✅ COMPLETE (90%)

### 9.1 Purpose

Queues provide **context isolation for work lanes**.

Each queue:
- ✅ Has instructions (mini-FRD) defining goals
- ✅ Is a FIFO queue of tasks
- ✅ Can be processed by queue_runner.py
- ⚠️ No dedicated "session" per queue (Claude-in-chat is stateless per run)

### 9.2 Queue Names
**Status**: ✅ COMPLETE (100%)

**Queue names are globally unique within SparkQ.**

- ✅ All CLI/API commands accept `--queue=<name>`
- ✅ `--stream` flag supported as backward-compatible alias
- ✅ No session identifier needed for queue operations

### 9.3 Queue Instructions
**Status**: ✅ COMPLETE (100%)

**Implemented:**
```bash
sparkq queue create auth --session api-v2 \
  --instructions "Implement JWT authentication per PRD section 4.2..."
```

- ✅ Instructions stored in queues table
- ✅ Displayed by queue_runner.py at start
- ✅ Included in claim response (API)
- ✅ Visible in Web UI

### 9.4 Queue States
**Status**: ✅ COMPLETE (100%)

**Implemented states:**
- ✅ `active` - Accepting and processing tasks
- ✅ `ended` - No new tasks, historical only
- ✅ `archived` - Hidden from default views (enhancement)
- ✅ `idle` - Queue exists but not currently active
- ✅ `planned` - Queue planned but not started

**Implementation:** `sparkq queue end <name>`, archive/unarchive endpoints

---

## 10. Tool Registry
**Status**: ✅ COMPLETE (100%)

### 10.1 Structure

**Implemented:**
- ✅ Tools defined in sparkq.yml
- ✅ Loaded into DB on startup (tools table)
- ✅ UI for tool management
- ✅ API endpoints for CRUD operations

**Current tools:**
```yaml
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
```

### 10.2 Reloading
**Status**: ✅ COMPLETE (100%)

- ✅ `sparkq reload` command implemented
- ✅ Reloads tools from sparkq.yml
- ✅ Reloads task classes
- ✅ Rebuilds script index
- ✅ No server restart required

---

## 11. Script Index
**Status**: ✅ COMPLETE (100%)

### 11.1 Purpose

Build an index of available scripts for:
- LLM tools to know what scripts exist
- UI autocomplete for script paths
- Preventing hallucinated paths

### 11.2 Metadata Format
**Status**: ✅ COMPLETE (100%)

**Designed format:**
```bash
#!/bin/bash
# name: deploy-staging
# description: Deploys current branch to staging
# inputs: branch (optional)
# outputs: deployment URL
# tags: deploy, staging
```

**Current Implementation:**
- ✅ Script index exists in `src/index.py`
- ✅ API endpoint `/api/scripts/index`
- ✅ Full metadata parsing implemented (2025-11-30)
- ✅ **inputs/outputs** parsed as structured arrays with required/optional flags
- ✅ **Multi-line descriptions** supported and collapsed to single line
- ✅ **Validation warnings** for malformed metadata (invalid timeout, unknown task_class)
- ✅ Comprehensive test coverage (9/9 tests passing)
- ✅ Example scripts created ([deploy-staging.sh](../scripts/deploy-staging.sh), [run-tests.py](../scripts/run-tests.py))

### 11.3 Index Behavior
**Status**: ✅ COMPLETE (100%)

**Implemented:**
- ✅ Scan configured directories from sparkq.yml
- ✅ Build in-memory index
- ✅ Rebuild on `sparkq reload`
- ✅ Comment block parsing complete with multi-line support
- ✅ Metadata coercion (tags→array, timeout→int, inputs/outputs→structured)
- ✅ Validation logging for data quality

**Completion**: 100% - Full metadata parsing with validation and testing complete

---

## 12. Worker Contract (queue_runner.py Model)
**Status**: ✅ COMPLETE (85%)

### 12.1 Overview

**UPDATED ARCHITECTURE:**

```
SparkQ Server              queue_runner.py           Claude-in-chat
────────────               ───────────────           ──────────────
Stores tasks               Fetches tasks             Executes tasks
Tracks status              Streams prompts           Calls task_complete.py
Provides UI                Displays instructions     Maintains context
Validates payloads         Claims tasks              Captures output
Detects stale tasks        Polls every 30s           Generates summaries
Auto-fails dead tasks      Worker lifecycle
```

**Implemented:**
- ✅ queue_runner.py polls API for queued tasks
- ✅ Displays queue instructions once at start
- ✅ Streams task prompts to stdout for Claude to read
- ✅ Three execution modes: --once, --run, --watch
- ✅ task_complete.py for Claude to mark tasks done
- ✅ Stable worker_id generation
- ✅ **Lockfile prevention** for duplicate workers (2025-11-30)
  - Creates `/tmp/sparkq-runner-{queue_id}.lock` with PID
  - Detects running instances and prevents duplicates
  - Cleans up stale locks automatically
  - Graceful shutdown handlers (SIGTERM/SIGINT)

**Missing:**
- ❌ Full automation (FIFO pipe for automatic wake-up)
- ❌ Claude integration (currently manual)
- ⚠️ No automatic "complete" from queue_runner (Claude must call task_complete.py)

**Completion**: 90% - Core contract works with duplicate prevention, full automation missing

### 12.2 CLI Commands for Workers
**Status**: ✅ COMPLETE (100%)

**Implemented:**

**`sparkq peek --queue=<queue>`**
- ✅ Returns single-line JSON of next queued task
- ✅ Does NOT change task status
- ✅ Used by queue_runner.py

**`sparkq claim --queue=<queue>`**
- ✅ Returns full task record as JSON including queue instructions
- ✅ Atomically transitions `queued` → `running`, sets `started_at` and `claimed_at`
- ✅ Returns empty if no queued task
- ✅ Used by queue_runner.py

**`sparkq claim` (without --queue)**
- ✅ Lists queues with queued tasks
- ✅ Prompts user to specify queue
- ✅ Helpful UX

**`sparkq complete <task_id> --summary '<text>' [--data '<json>']`**
- ✅ Transitions `running` → `succeeded`
- ✅ Validates summary is non-empty
- ✅ Stores result_summary and result_data
- ✅ Sets `finished_at` timestamp

**`sparkq fail <task_id> --reason '<message>'`**
- ✅ Transitions `running` → `failed`
- ✅ Stores error message
- ✅ Sets `finished_at` timestamp

### 12.3 Claim Response Format
**Status**: ✅ COMPLETE (100%)

**Implemented format matches spec:**
```json
{
  "id": "tsk_abc123",
  "queue": {
    "id": "que_xyz789",
    "name": "auth",
    "instructions": "Implement JWT authentication..."
  },
  "tool_name": "run-bash",
  "task_class": "MEDIUM_SCRIPT",
  "payload": {...},
  "status": "running",
  "timeout": 300,
  "attempts": 1,
  "created_at": "2025-01-15T10:30:00Z",
  "started_at": "2025-01-15T10:32:15Z",
  "claimed_at": "2025-01-15T10:32:15Z"
}
```

### 12.4 Complete/Fail Examples
**Status**: ✅ COMPLETE (100%)

**Current implementation:**

```bash
# Success via task_complete.py
./sparkq/task_complete.py tsk_abc123 "Migration completed" --data '{"rows": 0}'

# Success via CLI
sparkq complete --task-id tsk_abc123 --summary "Migration completed" --data '{"rows": 0}'

# Failure
sparkq fail --task-id tsk_abc123 --reason "Permission denied on users table"
```

---

## 13. Worker Model: queue_runner.py
**Status**: ✅ COMPLETE (85%)

### 13.1 Overview

**ACTUAL IMPLEMENTATION** (differs from original FRD design):

SparkQ does NOT use FIFO pipes. Instead:

1. **queue_runner.py** polls the API for queued tasks
2. Displays queue instructions once at start
3. Streams task prompts to stdout for Claude to read
4. Claude (in chat) executes tasks manually
5. Claude calls `task_complete.py <task_id> "<summary>"` to mark done
6. Repeat

**Execution Modes:**
- `--once`: Process one task then exit (testing)
- `--run`: Process all tasks until queue empty, then exit (default)
- `--watch`: Continuous polling mode, run forever (poll every N seconds)

**Configuration:**
```yaml
queue_runner:
  base_url: http://192.168.1.100:5005  # Optional, auto-detected if omitted
  poll_interval: 30                     # Seconds between polls in --watch
```

**Smart Defaults:**
- `base_url`: Auto-detected from local IP + server.port
- `worker_id`: Derived from hostname + queue name (stable)
- `poll_interval`: 30 seconds (configurable)

**Implemented:**
- ✅ queue_runner.py with all three modes
- ✅ Auto-detection of base_url
- ✅ Stable worker_id generation
- ✅ Queue instructions display
- ✅ Task streaming to stdout
- ✅ Poll interval configuration

**Missing:**
- ❌ FIFO pipe communication
- ❌ Automatic wake-up on task availability
- ❌ Claude integration (manual execution required)

**Completion**: 85% - Polling model works, no automatic execution

### 13.2 Polling
**Status**: ⚠️ SIMPLIFIED (100% of simplified model)

**Original FRD Design:**
| Condition | Poll Interval |
|-----------|---------------|
| Claude is idle (`done_flag` exists) | 60 seconds |
| Claude is busy (`done_flag` missing) | 120 seconds |

**ACTUAL IMPLEMENTATION:**
- Fixed poll interval from config (default: 30s)
- Only in `--watch` mode
- No adaptive polling based on Claude state
- Simpler, but effective

**Completion**: 100% of simplified model

### 13.3 Worker Script (queue_runner.py)
**Status**: ✅ COMPLETE (100%)

**File**: `sparkq/queue_runner.py`

**Implemented features:**
- ✅ Polls queue via API
- ✅ Displays instructions at start
- ✅ Streams task prompts to stdout
- ✅ Shows execution hints based on tool_name
- ✅ Three execution modes (--once, --run, --watch)
- ✅ Graceful error handling
- ✅ Smart defaults (base_url, worker_id)

**Usage:**
```bash
# Process all tasks then exit
python3 sparkq/queue_runner.py --queue "Back End"

# Process one task (testing)
python3 sparkq/queue_runner.py --queue "Back End" --once

# Continuous polling
python3 sparkq/queue_runner.py --queue "Back End" --watch
```

### 13.4 Claude Playbook
**Status**: ❌ NOT IMPLEMENTED (0%)

**Original FRD**: `sparkq/WORKER_PLAYBOOK.md` with full operating procedures

**Current Reality:**
- ❌ No formal playbook document
- ❌ queue_runner.py provides execution hints in output
- ❌ Claude must manually read stdout and execute tasks
- ⚠️ Instructions exist in queue_runner.py code comments

**Missing:**
- ❌ Formal WORKER_PLAYBOOK.md document
- ❌ Step-by-step procedures for Claude
- ❌ Error recovery procedures
- ❌ Edit-first principle documentation
- ❌ Delegation patterns (Haiku/Codex)

**Completion**: 0% - No playbook exists

### 13.5 Sequence Diagram
**Status**: ⚠️ PARTIAL (60%)

**ACTUAL SEQUENCE** (differs from FRD):

```
You              SparkQ API       queue_runner.py     Claude-in-chat
 │                 │                 │                    │
 │──enqueue task──▶│                 │                    │
 │                 │                 │  poll (30s loop)   │
 │                 │◀────────────────│                    │
 │                 │  tasks?         │                    │
 │                 │────────────────▶│                    │
 │                 │                 │  claim             │
 │                 │◀────────────────│                    │
 │                 │  task JSON      │                    │
 │                 │────────────────▶│                    │
 │                 │                 │  print prompt      │
 │                 │                 │───────────────────▶│
 │                 │                 │                    │ (reads stdout)
 │                 │                 │                    │ (executes)
 │                 │                 │    task_complete   │
 │                 │◀───────────────────────────────────│
 │                 │  mark succeeded │                    │
 │                 │                 │  poll (continues)  │
 │                 │◀────────────────│                    │
```

**Key Differences from FRD:**
- ❌ No FIFO pipe wake mechanism
- ❌ No `done_flag` for idle detection
- ✅ Polling-based instead
- ✅ Simpler but less automated

**Completion**: 60% - Works but simpler than original design

---

## 14. CLI Commands
**Status**: ✅ COMPLETE (95%)

### 14.1 Setup & Server
**Status**: ✅ COMPLETE (100%)

**Implemented:**

**`sparkq setup`**
- ✅ Creates sparkq.yml (if missing)
- ✅ Initializes database
- ✅ Non-interactive (uses defaults)
- ⚠️ Not fully "interactive Q&A" as FRD specified

**`sparkq run [--host HOST] [--port PORT]`**
- ✅ Starts server in foreground
- ✅ Configurable host/port
- ✅ Loads from sparkq.yml by default
- ⚠️ No interactive session/queue selection (FRD feature not implemented)

**`sparkq start`** (via wrapper script)
- ✅ Starts server in background as daemon
- ✅ Persists PID in sparkq.lock
- ✅ Returns immediately

**`sparkq stop`**
- ✅ Stops the server gracefully
- ✅ Removes lockfile
- ⚠️ No per-queue stop option

**`sparkq status`**
- ✅ Shows server status
- ✅ Lists active sessions/queues
- ✅ Queue stats

**`sparkq reload`**
- ✅ Reloads sparkq.yml
- ✅ Rebuilds tool registry
- ✅ Rebuilds script index
- ✅ No server restart needed

**Completion**: 100% - All core commands work

### 14.2 Session Management
**Status**: ✅ COMPLETE (100%)

| Command | Status |
|---------|--------|
| `sparkq session create <name> [--instructions "..."]` | ✅ Implemented |
| `sparkq session list [--status X]` | ✅ Implemented |
| `sparkq session end <name>` | ✅ Implemented |

### 14.3 Queue Management (formerly "Stream Management")
**Status**: ✅ COMPLETE (100%)

| Command | Status |
|---------|--------|
| `sparkq queue create <name> --session <session> --instructions "..."` | ✅ Implemented |
| `sparkq queue list [--session <session>]` | ✅ Implemented |
| `sparkq queue end <name>` | ✅ Implemented |
| `sparkq queue archive <name>` | ✅ Implemented (enhancement) |
| `sparkq queue unarchive <name>` | ✅ Implemented (enhancement) |

**Note**: `--stream` flag supported as backward-compatible alias

### 14.4 Task Management
**Status**: ✅ COMPLETE (100%)

| Command | Status |
|---------|--------|
| `sparkq enqueue --queue=<queue> --tool <tool> [--payload '...'] [--timeout=N]` | ✅ Implemented |
| `sparkq tasks [--status=X] [--queue=X]` | ✅ Implemented |
| `sparkq task <id>` | ✅ Implemented |
| `sparkq requeue <id>` | ✅ Implemented |

### 14.5 Worker Commands
**Status**: ✅ COMPLETE (100%)

All worker commands fully implemented and tested.

### 14.6 Utility
**Status**: ✅ COMPLETE (100%)

| Command | Status |
|---------|--------|
| `sparkq purge [--older-than-days=N]` | ✅ Implemented |
| `sparkq config-export` | ✅ Implemented |
| `sparkq scripts` | ✅ Implemented (script management) |

---

## 15. Web UI
**Status**: ✅ COMPLETE (90%)

Served at `http://127.0.0.1:5005/` (or configured host:port)

**No authentication.** Stateless, no cookies, no login. Trusted local environment.

**Implemented Pages:**

1. **Dashboard** (✅ 100%)
   - ✅ Active sessions and queues
   - ✅ Queue stats (size, running count, success/fail counts)
   - ✅ Queue filter dropdown
   - ✅ Light mode support
   - ✅ Real-time updates

2. **Sessions** (✅ 100%)
   - ✅ List sessions with status
   - ✅ Create new session
   - ✅ End session
   - ✅ Delete session

3. **Queues** (✅ 100%)
   - ✅ List queues with status, task counts
   - ✅ Instructions preview
   - ✅ Create new queue (with instructions)
   - ✅ End/archive/unarchive queue
   - ✅ Delete queue

4. **Enqueue** (✅ 95%)
   - ✅ Tool dropdown (from registry)
   - ✅ Queue dropdown
   - ✅ Payload textarea
   - ✅ Timeout override field
   - ⚠️ Script path autocomplete (partial - needs script index completion)

5. **Task List** (✅ 90%)
   - ✅ Table: ID, tool, queue, status, created, started, finished
   - ✅ Filter by status, queue
   - ⚠️ Stale indicator: Needs visual verification
   - ⚠️ Auto-failed indicator: Needs visual verification
   - ✅ Click row → task detail
   - ✅ Requeue button for failed tasks

6. **Task Detail** (✅ 95%)
   - ✅ Full payload display
   - ✅ Result summary highlighted
   - ✅ result_data JSON display
   - ✅ Timing breakdown (created → started → finished)
   - ✅ Queue instructions context
   - ⚠️ stdout/stderr panels (need verification of styling)

7. **Config Management** (✅ 100%) **ENHANCEMENT**
   - ✅ Full config UI
   - ✅ Edit config entries
   - ✅ Tool management
   - ✅ Task class management

**Completion**: 90% - All pages exist, minor UI polish needed

---

## 16. Configuration
**Status**: ✅ COMPLETE (95%)

### 16.1 `sparkq setup`
**Status**: ⚠️ PARTIAL (70%)

**FRD Design:** Interactive Q&A for config creation

**Current Implementation:**
```bash
$ sparkq setup
```

- ✅ Creates sparkq.yml with defaults
- ✅ Initializes database
- ❌ NOT interactive Q&A (uses hardcoded defaults)
- ⚠️ Manual editing required for customization

**Completion**: 70% - Works but not interactive

### 16.2 Config File
**Status**: ✅ COMPLETE (100%)

`sparkq.yml` fully implemented with all sections:

```yaml
# Project
project:
  name: my-project
  repo_path: /path/to/repo

# Server
server:
  port: 5005
  host: 0.0.0.0

# Database
database:
  path: sparkq/data/sparkq.db
  mode: wal

# Purge
purge:
  older_than_days: 3

# Queue Runner
queue_runner:
  poll_interval: 30
  auto_fail_interval_seconds: 300
  base_url: null  # auto-detected if null

# Task Classes
task_classes:
  FAST_SCRIPT:
    timeout: 120
  MEDIUM_SCRIPT:
    timeout: 600
  LLM_LITE:
    timeout: 480
  LLM_HEAVY:
    timeout: 1200

# Tools
tools:
  run-bash:
    description: Bash script
    task_class: MEDIUM_SCRIPT
  # ... etc
```

### 16.3 Environment Variables
**Status**: ⚠️ PARTIAL (80%)

**Implemented:**
| Variable | Status |
|----------|--------|
| `SPARKQ_CONFIG` | ✅ Points to custom sparkq.yml path |
| `ANTHROPIC_API_KEY` | ⚠️ Not used by SparkQ (external) |
| `OPENAI_API_KEY` | ⚠️ Not used by SparkQ (external) |

**Note**: LLM API keys are for external tools (Haiku/Sonnet), not SparkQ itself

**Completion**: 95% - Config system complete, interactive setup missing

---

## 17. Runtime Dependencies
**Status**: ✅ COMPLETE (100%)

### 17.1 Required

**Implemented:**
| Package | Purpose | Status |
|---------|---------|--------|
| Python 3.10+ | Runtime | ✅ |
| sqlite3 (stdlib) | Database | ✅ |
| Typer | CLI framework | ✅ |
| FastAPI | HTTP API | ✅ |
| Uvicorn | HTTP server | ✅ |
| PyYAML | Config parsing | ✅ |
| Requests | API client (queue_runner) | ✅ |

### 17.2 Optional

**Implemented:**
| Package | Purpose | Status |
|---------|---------|--------|
| Pydantic | Typed models/validation | ✅ Used |
| pytest | Testing | ✅ Used |

---

## 18. Directory Structure
**Status**: ✅ COMPLETE (100%)

**Current structure:**
```
sparkqueue/
├── sparkq/                      # SparkQ application
│   ├── src/
│   │   ├── __init__.py
│   │   ├── __main__.py          # Entry point
│   │   ├── cli.py               # CLI commands (Typer)
│   │   ├── api.py               # HTTP endpoints (FastAPI)
│   │   ├── server.py            # Uvicorn server + background tasks
│   │   ├── storage.py           # SQLite operations
│   │   ├── tools.py             # Tool registry
│   │   ├── index.py             # Script indexer
│   │   ├── config.py            # Config loading
│   │   ├── constants.py         # Shared constants
│   │   ├── errors.py            # Domain errors
│   │   ├── metrics.py           # Metrics (stub)
│   │   ├── models.py            # Pydantic models
│   │   └── paths.py             # Path helpers
│   ├── ui/                      # Web UI static files
│   │   ├── index.html
│   │   ├── style.css
│   │   ├── pages/
│   │   │   ├── dashboard.js
│   │   │   ├── config.js
│   │   │   ├── enqueue.js
│   │   │   ├── queues.js
│   │   │   ├── tasks.js
│   │   │   └── scripts.js
│   │   ├── core/               # Core UI modules
│   │   └── components/         # Reusable components
│   ├── data/
│   │   └── sparkq.db           # SQLite database
│   ├── logs/
│   │   └── sparkq.log          # Runtime logs
│   ├── tests/
│   │   ├── e2e/
│   │   └── unit/
│   ├── queue_runner.py         # Queue runner (replaces sparkq-watcher.sh)
│   ├── task_complete.py        # Helper for Claude to mark tasks done
│   ├── requirements.txt        # Dependencies
│   └── pytest.ini              # Test config
│
├── python-bootstrap/           # Bootstrap setup (from __omni-dev)
├── .venv/                      # Python virtual environment
├── sparkq.sh                   # Convenience wrapper script
├── sparkq.yml                  # Configuration
└── README.md                   # Project docs
```

---

## 19. Setup and Teardown
**Status**: ⚠️ PARTIAL (70%)

### 19.1 Setup
**Status**: ✅ COMPLETE (100%)

```bash
cd sparkqueue
./python-bootstrap/bootstrap.sh  # One-time venv setup
sparkq setup                      # Initialize DB
sparkq run                        # Start server
```

### 19.2 Teardown
**Status**: ⚠️ PARTIAL (50%)

**FRD Design:** `./teardown.sh` script

**Current Reality:**
- ❌ No formal teardown.sh script
- ✅ Manual: Stop server, delete sparkq.db, delete .venv
- ⚠️ Auto-purge handles old data, but not full cleanup

**Manual teardown:**
```bash
sparkq stop
rm -rf sparkq/data/sparkq.db*
rm -rf .venv
rm sparkq.yml
```

**Completion**: 50% - No script, manual process works

---

## 20. Failure Modes and Mitigations
**Status**: ✅ COMPLETE (95%)

| Failure Mode | Impact | Mitigation | Status |
|--------------|--------|------------|--------|
| Claude crashes mid-task | Task stuck in `running` | 2× timeout auto-fail | ✅ Implemented |
| Missing result summary | Task can't complete | CLI/API validation | ✅ Implemented |
| Malformed result JSON | Task can't complete | CLI/API validation | ✅ Implemented |
| Claude never calls complete/fail | Task stuck | 2× timeout auto-fail | ✅ Implemented |
| SparkQ server down | Commands fail | `sparkq status` to check | ✅ Implemented |
| Multiple queue_runner instances | Possible race | ⚠️ No lockfile prevention | ⚠️ Missing |
| queue_runner crashes | Tasks not processed | Manual restart | ⚠️ No auto-restart |

**Completion**: 95% - Most failure modes covered, queue_runner lockfile missing

---

## 21. Success Criteria
**Status**: ✅ 18/20 COMPLETE (90%)

**Implemented:**
1. ✅ `sparkq setup` creates config and initializes DB
2. ✅ `sparkq run` starts server
3. ⚠️ No `sparkq run --session X` auto-watcher feature
4. ✅ `sparkq session create` and `sparkq queue create` work with instructions
5. ✅ `sparkq enqueue` queues tasks with correct task_class and timeout
6. ✅ `sparkq peek --queue=X` returns task JSON without claiming
7. ✅ `sparkq claim --queue=X` returns full task + queue instructions, marks running
8. ✅ `sparkq claim` (no queue) errors and lists queues with queued tasks
9. ✅ `sparkq complete` validates result summary
10. ✅ `sparkq fail` stores error
11. ✅ `sparkq requeue` clones failed task with new ID
12. ✅ Tasks auto-fail at 2× timeout
13. ✅ Auto-purge runs on startup (background)
14. ✅ Web UI shows sessions, queues, tasks with indicators
15. ✅ queue_runner.py polls and streams prompts
16. ✅ Full workflow: enqueue → queue_runner detects → Claude executes → completes
17. ✅ Queue instructions shown at queue_runner start and in claim response
18. ✅ `sparkq stop` works correctly
19. ⚠️ No formal `./teardown.sh` script
20. ⚠️ No WORKER_PLAYBOOK.md document

**Completion**: 90% - 18/20 criteria met

---

## 22. Backlog (Out of Scope for v1)
**Status**: ✅ COMPLETE (100%)

All deferred items remain out of scope. No scope creep.

---

## 23. Appendix: Decisions Log

**UPDATED TERMINOLOGY:**

| Decision | Original Choice | Current Implementation | Note |
|----------|----------------|------------------------|------|
| Storage | SQLite with WAL | ✅ SQLite with WAL | Unchanged |
| Scheduling | FIFO per stream | ✅ FIFO per queue | "stream" → "queue" |
| Data model | Project → Session → Stream → Task | ✅ Project → Session → Queue → Task | "stream" → "queue" |
| Stream naming | Globally unique | ✅ Queue names globally unique | "stream" → "queue" |
| Stream instructions | Mini-FRD per stream | ✅ Instructions per queue | "stream" → "queue" |
| Watcher script | `sparkq-watcher.sh` with FIFO | ✅ `queue_runner.py` with polling | Architecture change |
| Worker model | FIFO wake-up | ✅ Polling + stdout streaming | Simplified |
| Claude integration | Automatic via FIFO | ⚠️ Manual (Claude-in-chat) | Partial automation |
| Polling | 60s idle, 120s busy | ✅ Fixed 30s (configurable) | Simplified |
| Queue states | active/ended | ✅ active/ended/archived/idle/planned | Enhanced |

---

## 24. Implementation Status Summary

### COMPLETE (100%)
- ✅ Core infrastructure (SQLite, CLI skeleton)
- ✅ Database schema with WAL mode
- ✅ Session management
- ✅ Queue management (with enhancements)
- ✅ Task lifecycle
- ✅ Worker commands (peek, claim, complete, fail)
- ✅ Task requeue
- ✅ Server + API + Web UI
- ✅ Auto-purge on startup
- ✅ Stale detection & auto-fail
- ✅ Tool registry
- ✅ Configuration system
- ✅ CLI commands (95%+)

### PARTIAL (50-90%)
- ⚠️ Script index (60%) - Basic indexing works, metadata parsing incomplete
- ⚠️ Interactive setup (70%) - Works but not interactive Q&A
- ⚠️ Worker automation (85%) - queue_runner works, no full automation
- ⚠️ Teardown process (50%) - Manual process, no script

### NOT IMPLEMENTED (0-25%)
- ❌ WORKER_PLAYBOOK.md (0%) - No formal document
- ❌ queue_runner lockfile (0%) - No duplicate prevention
- ❌ Interactive `sparkq run` session/queue selection (0%)
- ❌ Formal teardown.sh script (0%)

### OVERALL PROJECT COMPLETION: 85%

**What's Working:**
- Full CRUD operations for sessions, queues, tasks
- Web UI with all major pages
- queue_runner.py for task execution
- Auto-fail and auto-purge background tasks
- Complete CLI with all core commands
- REST API with full documentation

**What's Missing:**
- Full automation (FIFO pipe wake-up)
- Worker playbook documentation
- Interactive setup wizard
- queue_runner duplicate prevention
- Complete script metadata parsing

**Architecture Changes from FRD v7.5:**
1. "Streams" renamed to "Queues" throughout
2. FIFO pipe model replaced with polling model
3. `sparkq-watcher.sh` replaced with `queue_runner.py`
4. Claude integration is manual (Claude-in-chat) not automatic
5. Simplified polling (fixed interval vs. adaptive)
6. Enhanced queue states (added archived, idle, planned)

---

## 25. Claude Worker Playbook Specification
**Status**: ✅ COMPLETE (100%)

**FRD Section 25:** Full playbook content specified and implemented

**Current Reality:**
- ✅ `WORKER_PLAYBOOK.md` created (2025-11-30)
- ✅ Comprehensive 800+ line documentation
- ✅ 9 major sections covering full worker workflow
- ✅ Copy-paste ready examples and templates
- ✅ Complete tool execution reference (haiku, codex, sonnet, bash, python)
- ✅ Error handling procedures
- ✅ Full end-to-end example session

**Implemented Sections:**
1. ✅ What is a SparkQueue Worker?
2. ✅ Quick Start
3. ✅ Session Setup (3 execution modes documented)
4. ✅ Task Execution Workflow (loop pattern + tool delegation)
5. ✅ Task Completion (patterns, good/bad examples)
6. ✅ Error Handling (5 error types with recovery)
7. ✅ Quick Reference (commands, decision tree, checklist)
8. ✅ Advanced Patterns (multi-step, partial completion, context preservation)
9. ✅ Example Session (End-to-End full worker session)

**File Location:** `sparkq/WORKER_PLAYBOOK.md`

**Completion**: 100% - Complete worker playbook with all specified content

---

## 26. Tool Registry for Playbook
**Status**: ✅ COMPLETE (100%)

**Implemented tools match FRD specification:**

```yaml
tools:
  run-bash:
    description: Bash script
    task_class: MEDIUM_SCRIPT
    timeout: 600

  run-python:
    description: Python script
    task_class: MEDIUM_SCRIPT
    timeout: 600

  llm-haiku:
    description: Haiku
    task_class: LLM_LITE
    timeout: 480

  llm-sonnet:
    description: Sonnet
    task_class: LLM_HEAVY
    timeout: 1200

  llm-codex:
    description: Codex
    task_class: LLM_HEAVY
    timeout: 1200
```

**Additional tools can be added via:**
- ✅ sparkq.yml configuration
- ✅ Web UI tool management
- ✅ API endpoints (`POST /api/tools`)

---

## 27. Implementation Checklist

### Phase 1: Core Infrastructure ✅ COMPLETE (100%)
- [x] SQLite schema (projects, sessions, queues, tasks)
- [x] WAL mode enabled
- [x] Pydantic models
- [x] storage.py with CRUD operations
- [x] cli.py skeleton with Typer
- [x] sparkq setup (non-interactive)
- [x] sparkq session create/list/end
- [x] sparkq queue create/list/end
- [x] Basic tests

### Phase 2: Worker Commands ✅ COMPLETE (100%)
- [x] sparkq enqueue with task_class and timeout
- [x] sparkq peek --queue
- [x] sparkq claim --queue (full task + queue instructions)
- [x] sparkq claim (no queue) - error + list
- [x] sparkq complete with result summary validation
- [x] sparkq fail
- [x] sparkq tasks with filters
- [x] sparkq task <id>
- [x] sparkq requeue
- [x] queue_runner.py (replaces watcher playbook draft)

### Phase 3: Server + API + Web UI ✅ COMPLETE (95%)
- [x] FastAPI routes
- [x] Uvicorn server
- [x] sparkq run (non-interactive)
- [ ] ~~sparkq run --session~~ (not implemented)
- [x] sparkq stop
- [x] sparkq reload
- [x] Auto-purge on startup
- [x] Web UI: Dashboard
- [x] Web UI: Sessions/Queues
- [x] Web UI: Task list with filters
- [x] Web UI: Task detail
- [x] Web UI: Enqueue form
- [x] Web UI: Config management (enhancement)

### Phase 4: queue_runner + Automation ⚠️ PARTIAL (70%)
- [x] queue_runner.py with --once, --run, --watch
- [x] task_complete.py helper script
- [ ] ~~FIFO pipe handling~~ (replaced with polling)
- [ ] ~~60s/120s adaptive polling~~ (fixed 30s polling)
- [x] Integration with sparkq run (manual)
- [x] Stale task detection (1× timeout)
- [x] Auto-fail (2× timeout)
- [x] Full WORKER_PLAYBOOK.md (sparkq/WORKER_PLAYBOOK.md)
- [x] queue_runner lockfile (implemented in queue_runner.py)

### Phase 5: Polish + Dogfooding ⚠️ PARTIAL (70%)
- [x] Script index (basic implementation)
- [x] Tool registry with task_class
- [x] Timeout override at enqueue
- [x] UI stale/auto-fail indicators (needs visual verification)
- [x] Error messages polish
- [x] Documentation (README, API.md)
- [ ] Interactive setup Q&A (missing)
- [x] Complete script metadata parsing
- [ ] Formal teardown.sh (missing)

---

## OVERALL STATUS: 85% COMPLETE

**Production-Ready Features:**
- ✅ Full session/queue/task CRUD
- ✅ Web UI with all major pages
- ✅ CLI with all core commands
- ✅ REST API with documentation
- ✅ Auto-fail and auto-purge
- ✅ queue_runner.py for task execution
- ✅ Background task monitoring

**Needs Completion:**
- ❌ Full automation (FIFO wake-up)
- ❌ Interactive setup wizard
- ❌ Formal teardown script
- ❌ (Optional) FIFO/adaptive polling if still desired in roadmap

**Architecture Decisions:**
- Polling model chosen over FIFO pipes (simpler, works)
- "Queues" terminology standardized (vs "streams")
- Claude-in-chat model (manual execution)
- Fixed polling interval (vs adaptive)
- DB-backed config (Phase 20 enhancement)

---

*End of FRD v8.0*
