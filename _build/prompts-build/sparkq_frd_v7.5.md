# SparkQ — Functional Requirements Document (FRD) v7.5

## 1. Purpose

SparkQ is a **single-user, dev-only job queue** that runs tasks so you don't have to babysit them.

**One sentence:** Queue work, walk away, review results later.

---

## 2. What SparkQ Is

- A local task queue for your dev machine
- Coordinates Bash scripts, Python scripts, and LLM calls
- Stores everything in SQLite (one file, WAL mode)
- Provides a CLI (primary) and Web UI (secondary)
- Self-contained: copy into project, use, delete when done
- **Does NOT execute tasks** — Claude Code sessions are the workers

## 3. What SparkQ Is NOT

- Not a production system
- Not pushed to QA or prod
- Not a workflow engine (no DAGs, no dependencies, no branching)
- Not multi-user or multi-tenant
- Not a replacement for CI/CD
- Not a hosted service
- Not a task executor — it's a dumb queue + UI

---

## 4. Lifecycle

```
┌─────────────────────────────────────────────────────────────────────┐
│  Copy into project → sparkq setup → Use during dev → Delete folder │
└─────────────────────────────────────────────────────────────────────┘
```

SparkQ is disposable. When you hit MVP 1.0 on your project, delete the `sparkq/` folder and its database. It served its purpose.

**Data retention:** Auto-purge task history older than 3 days on startup (background task). All meaningful work is committed to Git anyway.

---

## 5. Guardrails

### 5.1 DO

| Principle | Rationale |
|-----------|-----------|
| Keep it self-contained | Copy/paste into any project |
| Use SQLite (single file, WAL mode) | Zero setup, handles concurrent access |
| Build CLI first | Clean API boundaries, testable, scriptable |
| Stay dev-only | No prod concerns (auth, scale, HA) |
| Delete when done | Clean exit, no cruft |

### 5.2 DO NOT

| Anti-Pattern | Why Not |
|--------------|---------|
| Add authentication | Dev tool, trusted environment |
| Add TLS/HTTPS | Localhost only |
| Add user management | Single user (you) |
| Add task dependencies | Queue tasks, not pipelines |
| Add priority scheduling | FIFO is enough |
| Add external message brokers | SQLite is enough |
| Add Docker/K8s deployment | Local dev only |
| Over-engineer | Ship it, use it, move on |
| Let Claude estimate time | Use historical task data instead |

### 5.3 Feature Freeze Boundary

These are **explicitly out of scope** — do not add them:

- Priority queues
- Task dependencies / DAGs
- Cron scheduling
- Webhooks
- Metrics / Prometheus
- Multi-node support
- API authentication
- Cloud storage / S3
- Service mode (daemon)

If you need these, you need a different tool.

---

## 6. Architecture

### 6.1 Component Overview

SparkQ runs as one server process. Claude Code sessions are the workers.

```
┌─────────────────────────────────────────────────────────────────┐
│                        SparkQ Server                             │
│  - SQLite queue (WAL mode)                                       │
│  - Web UI (enqueue, view, monitor)                               │
│  - CLI (setup, run, enqueue, peek, claim, complete, fail)        │
│  - Auto-purge on startup (background)                            │
│  - NO task execution                                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ CLI commands
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 Claude Code Session (per stream)                 │
│  - Watcher (background bash) polls queue, signals via FIFO      │
│  - Claude Code claims tasks, executes, reports results          │
│  - Maintains full context across all tasks in stream            │
│  - Has stream instructions (mini-FRD) for context               │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 Storage

- **Database:** `sparkq.db` (SQLite, single file, WAL mode)
- **Location:** `<project>/sparkq/sparkq.db`
- **Concurrency:** WAL mode handles multiple readers + writers
- **Cleanup:** Delete the file, done

### 6.3 Lockfiles

**SparkQ server lockfile:**
- On startup, create `sparkq.lock` with PID
- If lockfile exists and PID is alive, refuse to start
- Prevents multiple server instances

**Watcher lockfile (per stream):**
- On startup, create `/tmp/sparkq-<stream>.lock` with PID
- If lockfile exists and PID is alive, refuse to start
- Prevents duplicate watchers for same stream

### 6.4 Network

- Binds to `127.0.0.1` only (localhost)
- No remote access
- No TLS, no auth (trusted local environment)

### 6.5 Auto-Purge

On server startup:
- Background bash task runs automatically
- Deletes `succeeded` and `failed` tasks older than 3 days
- Never touches `queued` or `running` tasks
- Non-blocking (server starts immediately)

---

## 7. Data Model

### 7.1 Entity Relationships

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
│  Groups multiple streams that work toward a common goal         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ 1:many
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         streams                                  │
│  A feature lane within a session (e.g., "auth", "api", "ui")    │
│  Globally unique name — no need to specify session in commands  │
│  Has instructions (mini-FRD) defining goals and context         │
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

### 7.2 Database Schema

```sql
-- Enable WAL mode for concurrent access
PRAGMA journal_mode=WAL;

-- Projects (v1: single row, auto-created on setup)
CREATE TABLE projects (
    id TEXT PRIMARY KEY,              -- e.g., "my-saas-app"
    name TEXT NOT NULL,               -- display name
    repo_path TEXT,                   -- e.g., "/home/user/projects/my-app"
    prd_path TEXT,                    -- path to project PRD for context
    created_at TEXT NOT NULL,         -- ISO timestamp
    updated_at TEXT NOT NULL
);

-- Sessions (a bounded period of work)
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,              -- e.g., "ses_abc123"
    project_id TEXT NOT NULL REFERENCES projects(id),
    name TEXT NOT NULL,               -- e.g., "api-v2", "payment-feature"
    description TEXT,                 -- optional notes
    status TEXT NOT NULL DEFAULT 'active',  -- active, ended
    started_at TEXT NOT NULL,         -- ISO timestamp
    ended_at TEXT,                    -- ISO timestamp, null if active
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Streams (a feature lane within a session)
CREATE TABLE streams (
    id TEXT PRIMARY KEY,              -- e.g., "str_xyz789"
    session_id TEXT NOT NULL REFERENCES sessions(id),
    name TEXT NOT NULL UNIQUE,        -- globally unique (e.g., "auth", "api")
    instructions TEXT,                -- mini-FRD: goals, context, done-when
    status TEXT NOT NULL DEFAULT 'active',  -- active, ended
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Tasks (the work items)
CREATE TABLE tasks (
    id TEXT PRIMARY KEY,              -- e.g., "tsk_def456"
    stream_id TEXT NOT NULL REFERENCES streams(id),
    tool_name TEXT NOT NULL,          -- e.g., "run-bash", "llm-claude"
    task_class TEXT NOT NULL,         -- FAST_SCRIPT, MEDIUM_SCRIPT, LLM_LITE, LLM_HEAVY
    payload TEXT NOT NULL,            -- JSON
    status TEXT NOT NULL DEFAULT 'queued',  -- queued, running, succeeded, failed
    timeout INTEGER NOT NULL,         -- seconds (from task class or override)
    attempts INTEGER NOT NULL DEFAULT 0,
    result TEXT,                      -- JSON with required 'summary' field
    error TEXT,                       -- error message, nullable
    stdout TEXT,                      -- captured stdout, nullable
    stderr TEXT,                      -- captured stderr, nullable
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    started_at TEXT,                  -- when claimed
    finished_at TEXT                  -- when completed/failed
);

-- Indexes for common queries
CREATE INDEX idx_tasks_stream_status ON tasks(stream_id, status);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_started_at ON tasks(started_at);
CREATE INDEX idx_tasks_created_at ON tasks(created_at);
CREATE INDEX idx_streams_session ON streams(session_id);
CREATE INDEX idx_streams_status ON streams(status);
CREATE INDEX idx_sessions_project ON sessions(project_id);
CREATE INDEX idx_sessions_status ON sessions(status);
```

### 7.3 Example Data

```
Project: "my-saas-app"
    │
    ├── Session: "api-v2" (active)
    │       ├── Stream: "auth"
    │       │   Instructions: "Implement JWT auth per PRD 4.2. Done when tests pass."
    │       │   └── 3 tasks (1 running, 2 queued)
    │       │
    │       ├── Stream: "endpoints"
    │       │   Instructions: "Build user CRUD endpoints. Done when OpenAPI spec complete."
    │       │   └── 5 tasks (all queued)
    │       │
    │       └── Stream: "api-tests"
    │           Instructions: "Integration tests for all endpoints."
    │           └── 0 tasks
    │
    └── Session: "payment-feature" (ended)
            └── Stream: "stripe" (ended) → 42 tasks (historical)
```

---

## 8. Task Model

### 8.1 Task Structure

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (e.g., "tsk_abc123") |
| `stream_id` | string | Reference to stream |
| `tool_name` | string | Registered tool to execute |
| `task_class` | enum | FAST_SCRIPT, MEDIUM_SCRIPT, LLM_LITE, LLM_HEAVY |
| `payload` | JSON | Input for the tool |
| `status` | enum | `queued`, `running`, `succeeded`, `failed` |
| `timeout` | integer | Seconds before task is considered stale |
| `attempts` | integer | Execution attempt count |
| `result` | JSON | Must include `summary` field (see 8.5) |
| `error` | text | Error message on failure (nullable) |
| `stdout` | text | Captured stdout (nullable) |
| `stderr` | text | Captured stderr (nullable) |
| `created_at` | timestamp | When task was created |
| `updated_at` | timestamp | Last status change |
| `started_at` | timestamp | When claimed (nullable) |
| `finished_at` | timestamp | When completed/failed (nullable) |

### 8.2 Task Lifecycle

```
queued → running → succeeded
              ↘ failed
```

- **queued:** Waiting for a worker to claim
- **running:** Claimed, work in progress
- **succeeded:** Done, completed successfully
- **failed:** Done, completed with error

All tasks stay in the same table. Views are filters, not separate storage.

### 8.3 Scheduling

**FIFO per stream.** SparkQ does not perform cross-stream fairness or priority scheduling in v1.

- `sparkq claim --stream=<name>` returns the oldest `queued` task for that stream
- Each stream is its own FIFO lane
- Workers don't compete across streams

### 8.4 Task Classes

Task classes define default timeouts:

| Class | Default Timeout | Use Case |
|-------|-----------------|----------|
| `FAST_SCRIPT` | 30 seconds | Quick bash/python utilities |
| `MEDIUM_SCRIPT` | 300 seconds (5m) | Normal scripts, tests, migrations |
| `LLM_LITE` | 300 seconds (5m) | Haiku, light LLM tasks |
| `LLM_HEAVY` | 900 seconds (15m) | Sonnet/Opus, big refactors |

- Tools in the registry specify their `task_class`
- Timeout can be overridden at enqueue time
- Task class is stored on the task record

### 8.5 Result Format

`result` is a JSON object. **Workers MUST include a `summary` field.**

```json
{
  "summary": "Migrated 12 users to new schema",
  "rows_affected": 12,
  "files_changed": ["models/user.py"]
}
```

- `summary` (string, required): Short, human-readable description of what was done
- Additional fields are optional and tool-specific
- **Haiku generates the summary** — even for simple completions, have Haiku summarize
- CLI enforces: `sparkq complete` rejects if `result.summary` is missing

### 8.6 Timeouts and Stale Detection

Timeouts are per-task, sourced from:
1. Task class default
2. Tool override in registry
3. Override at enqueue time (`--timeout`)

**Timeout behavior:**
- Web UI shows **warning indicator** when `now - started_at > timeout` (stale)
- SparkQ **auto-fails** task when `now - started_at > 2x timeout` (dead)
- Auto-fail error: `"Auto-failed: task exceeded 2x timeout (Xs) with no complete/fail reported. Likely worker crash or disconnect."`

### 8.7 Failed Task Requeue

When a task fails:
1. Review error, stdout, stderr in UI
2. Fix the underlying issue
3. Click "Requeue" or run `sparkq requeue <task_id>`
4. **Clone behavior:** Creates new task with new ID, copies payload, fresh `queued` status
5. Original failed task stays in history for reference

---

## 9. Streams

### 9.1 Purpose

Streams provide **context isolation for Claude Code sessions**.

Each stream:
- Has one Claude Code worker session
- Maintains its own conversation context
- Has instructions (mini-FRD) defining goals
- Is a FIFO queue of tasks

### 9.2 Stream Names

**Stream names are globally unique within a SparkQ project.**

All CLI/API commands that operate on streams or tasks accept `--stream=<name>` and do not require a session identifier.

### 9.3 Stream Instructions

When you create a stream, you define its instructions — a mini-FRD:

```bash
sparkq stream create auth --session api-v2 \
  --instructions "Implement JWT authentication per PRD section 4.2.
Endpoints: /login, /logout, /refresh
Done when: all auth tests pass"
```

Instructions are:
- Shown when the watcher starts
- Included in the claim response
- Claude's starting context for all tasks in that stream

### 9.4 Stream States

| Status | Meaning |
|--------|---------|
| `active` | Accepting and processing tasks |
| `ended` | No new tasks, historical only |

**No paused state.** If you need to stop a stream:
- `sparkq stream end <name>` marks it `ended`
- Any `queued` tasks stay in DB but won't be claimed
- To resume work, create a new stream and requeue tasks

---

## 10. Tool Registry

### 10.1 Structure

Tools are registered in `sparkq.yml`:

```yaml
tools:
  run-bash:
    description: Execute a bash script
    task_class: MEDIUM_SCRIPT
    timeout: 300                    # optional override

  run-migrations:
    description: Run database migrations
    task_class: MEDIUM_SCRIPT
    timeout: 1800                   # 30 minutes - migrations are slow

  run-python:
    description: Execute a python script
    task_class: MEDIUM_SCRIPT

  llm-haiku:
    description: Call Claude Haiku
    task_class: LLM_LITE

  llm-sonnet:
    description: Call Claude Sonnet
    task_class: LLM_HEAVY
    timeout: 900
```

### 10.2 Reloading

- Tools are loaded at startup
- `sparkq reload` reloads tools from `sparkq.yml`
- No hot-reload; explicit reload required

---

## 11. Script Index

### 11.1 Purpose

Build an index of available scripts so:
- LLM tools know what scripts exist (context awareness)
- UI can autocomplete script paths
- No hallucinated paths

### 11.2 Metadata Format

Scripts declare metadata in top comment block:

```bash
#!/bin/bash
# name: deploy-staging
# description: Deploys current branch to staging environment
# inputs: branch (optional, defaults to current)
# outputs: deployment URL
# tags: deploy, staging

set -e
# script body...
```

### 11.3 Index Behavior

- On startup, scan directories listed in `sparkq.yml` (`script_dirs`)
- Parse top comment block until first non-comment line
- Build in-memory index
- Rebuild on `sparkq reload`

---

## 12. Worker Contract

### 12.1 Overview

SparkQ is the dumb queue. Claude Code is the brain and hands.

```
SparkQ                          Claude Code
────────                        ───────────
Stores tasks                    Executes tasks
Tracks status                   Decides how to execute
Provides UI                     Maintains context
Validates payloads              Captures output
Detects stale tasks             Reports results
Auto-fails dead tasks           Generates summaries (via Haiku)
```

### 12.2 CLI Commands for Workers

**`sparkq peek --stream=<stream>`**
- Returns: Single-line JSON of next queued task, or empty string if none
- Does NOT change task status (task stays `queued`)
- Used by: Watcher (to check if work exists)

**`sparkq claim --stream=<stream>`**
- Returns: Full task record as JSON including stream instructions
- Side effect: Atomically transitions `queued` → `running`, sets `started_at`
- If no queued task: Returns empty string, exits 0
- Used by: Claude

**`sparkq claim`** (without --stream)
- Does NOT claim anything
- Lists streams with queued tasks
- Prompts user to specify stream

```
$ sparkq claim

Error: --stream is required

Streams with queued tasks:
  auth      3 queued
  stripe    1 queued

Usage: sparkq claim --stream=<name>
```

**`sparkq complete <task_id> --result '<json>' [--stdout '<text>'] [--stderr '<text>']`**
- Side effect: Transitions `running` → `succeeded`, sets `finished_at`
- Stores result, stdout, stderr
- **Validates:** `result.summary` must exist and be a string
- If validation fails: Rejects, task stays `running`, error message shown
- Used by: Claude

**`sparkq fail <task_id> --error '<message>' [--stdout '<text>'] [--stderr '<text>']`**
- Side effect: Transitions `running` → `failed`, sets `finished_at`
- Stores error, stdout, stderr
- Used by: Claude

### 12.3 Claim Response Format

`sparkq claim` returns the **full task record** plus stream context:

```json
{
  "id": "tsk_abc123",
  "stream": {
    "id": "str_xyz789",
    "name": "auth",
    "instructions": "Implement JWT authentication per PRD section 4.2.\nEndpoints: /login, /logout, /refresh\nDone when: all auth tests pass"
  },
  "tool_name": "run-bash",
  "task_class": "MEDIUM_SCRIPT",
  "payload": {
    "script_path": "scripts/migrate.sh",
    "args": ["--dry-run"]
  },
  "status": "running",
  "timeout": 300,
  "attempts": 1,
  "created_at": "2025-01-15T10:30:00Z",
  "started_at": "2025-01-15T10:32:15Z"
}
```

### 12.4 Complete/Fail Examples

```bash
# Success - Haiku generates summary
sparkq complete tsk_abc123 \
  --result '{"summary": "Migration dry-run completed, 0 rows affected", "exit_code": 0}' \
  --stdout "$(cat /tmp/task.out)" \
  --stderr "$(cat /tmp/task.err)"

# Failure
sparkq fail tsk_abc123 \
  --error "Script exited 1: permission denied on users table" \
  --stdout "$(cat /tmp/task.out)" \
  --stderr "$(cat /tmp/task.err)"
```

**Rules:**
- `result.summary` is required on complete (CLI enforces)
- `--stdout` and `--stderr` are optional but recommended for bash/python tasks
- Have Haiku generate the summary, even for simple completions

---

## 13. Worker Model: Watcher + FIFO

### 13.1 Overview

SparkQ does NOT execute tasks. Claude Code sessions are the workers. A background watcher script monitors the queue and signals Claude when tasks are available.

```
┌─────────────────────────────────────────────────────────────────┐
│                        SparkQ Server                             │
│  - SQLite queue                                                  │
│  - Web UI (enqueue, view, monitor)                               │
│  - CLI (setup, run, enqueue, peek, claim, complete, fail)        │
│  - NO task execution                                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ CLI
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 Claude Code Session (per stream)                 │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Watcher (background bash)                                 │   │
│  │ - Polls queue: 60s when idle, 120s when Claude busy       │   │
│  │ - Only wakes Claude when done_flag exists                 │   │
│  │ - Writes to FIFO pipe (non-blocking via exec 3<>)         │   │
│  │ - Lockfile prevents duplicate watchers per stream         │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              │ writes "wake" to FIFO             │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Claude Code (interactive)                                 │   │
│  │ - Blocks on: cat /tmp/sparkq-<stream>-pipe               │   │
│  │ - Unblocks when watcher signals                          │   │
│  │ - Claims task, executes, completes                       │   │
│  │ - Maintains full context across all tasks                │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 13.2 Watcher Polling

Simple polling with backoff:

| Condition | Poll Interval |
|-----------|---------------|
| Claude is idle (`done_flag` exists) | 60 seconds |
| Claude is busy (`done_flag` missing) | 120 seconds |

No task-class-aware polling. Keep it simple.

### 13.3 Watcher Script

```bash
#!/bin/bash
# sparkq-watcher.sh

STREAM=$1
PIPE=/tmp/sparkq-$STREAM-pipe
DONE=/tmp/sparkq-$STREAM-done
LOCK=/tmp/sparkq-$STREAM.lock

# === Lockfile check ===
if [ -f "$LOCK" ]; then
    OLD_PID=$(cat "$LOCK")
    if ps -p "$OLD_PID" > /dev/null 2>&1; then
        echo "[sparkq-watcher] ERROR: Stream '$STREAM' already has active watcher (PID $OLD_PID)"
        echo "[sparkq-watcher] Kill it first: kill $OLD_PID"
        exit 1
    fi
    rm -f "$LOCK"
fi

echo $$ > "$LOCK"
trap "rm -f $LOCK" EXIT

# === Setup FIFO ===
mkfifo "$PIPE" 2>/dev/null || true
exec 3<>"$PIPE"  # Open read/write - critical for non-blocking writes

echo "[sparkq-watcher] Started for stream: $STREAM"
echo "[sparkq-watcher] Pipe: $PIPE"
echo "[sparkq-watcher] Done flag: $DONE"
echo "[sparkq-watcher] Lock: $LOCK (PID $$)"

# === Main loop ===
while true; do
    if [ -f "$DONE" ]; then
        # Claude is idle, check for work
        TASK=$(sparkq peek --stream="$STREAM" 2>/dev/null)
        if [ -n "$TASK" ]; then
            echo "[sparkq-watcher] Task available, waking Claude..."
            rm -f "$DONE"
            echo "wake" >&3
        fi
        sleep 60   # Idle polling
    else
        # Claude is busy, back off
        sleep 120
    fi
done
```

### 13.4 Claude Code Playbook

The playbook lives at `sparkq/WORKER_PLAYBOOK.md`:

```markdown
# SparkQ Worker - Stream: <STREAM_NAME>

## Setup (run once per session)

Clean up old temp files and start watcher:
```bash
rm -f /tmp/sparkq-<STREAM_NAME>-*
nohup ./sparkq-watcher.sh <STREAM_NAME> > /tmp/sparkq-<STREAM_NAME>-watcher.log 2>&1 &
echo "Watcher PID: $!"
```

## Wait for Task

Run this to wait for and claim the next task:
```bash
touch /tmp/sparkq-<STREAM_NAME>-done && \
cat /tmp/sparkq-<STREAM_NAME>-pipe > /dev/null && \
sparkq claim --stream=<STREAM_NAME>
```

## After Successful Task

1. Have Haiku summarize what was done
2. Call complete:
```bash
sparkq complete <TASK_ID> \
  --result '{"summary": "<haiku-generated-summary>"}' \
  --stdout "$(cat /tmp/task.out)" \
  --stderr "$(cat /tmp/task.err)"
```

Then immediately run the wait command again.

## After Failed Task

```bash
sparkq fail <TASK_ID> \
  --error "Short description of what went wrong" \
  --stdout "$(cat /tmp/task.out)" \
  --stderr "$(cat /tmp/task.err)"
```

Then immediately run the wait command again.

## The Pattern

1. Signal ready → wait → claim → execute → complete/fail → repeat
2. Always end with the wait command
3. Take as long as needed on each task - watcher waits for you
4. Always have Haiku generate the summary

## Error Recovery

If `sparkq complete` rejects (missing summary, invalid JSON):
1. Check the error message
2. Fix the --result JSON
3. Retry the command

If watcher seems dead:
1. Check: `ps aux | grep sparkq-watcher`
2. Restart: `nohup ./sparkq-watcher.sh <STREAM_NAME> > /tmp/sparkq-<STREAM_NAME>-watcher.log 2>&1 &`

If SparkQ server is down:
1. Check: `sparkq status`
2. Restart: `sparkq run`
```

### 13.5 Sequence Diagram

```
You              SparkQ           Watcher              Claude
 │                 │                 │                    │
 │──enqueue task──▶│                 │                    │
 │                 │                 │   touch done       │
 │                 │                 │◀───────────────────│
 │                 │                 │   cat pipe (BLOCK) │
 │                 │                 │◀───────────────────│
 │                 │   peek          │                    │
 │                 │◀────────────────│                    │
 │                 │   task exists   │                    │
 │                 │────────────────▶│                    │
 │                 │                 │   rm done          │
 │                 │                 │   echo wake > pipe │
 │                 │                 │───────────────────▶│
 │                 │                 │                    │ (unblocks)
 │                 │                 │   claim            │
 │                 │◀────────────────────────────────────│
 │                 │   full task JSON│                    │
 │                 │   + stream info │                    │
 │                 │────────────────────────────────────▶│
 │                 │                 │                    │ (executes)
 │                 │                 │                    │ ...
 │                 │                 │                    │ (haiku summary)
 │                 │                 │   complete         │
 │                 │◀────────────────────────────────────│
 │                 │                 │   touch done       │
 │                 │                 │◀───────────────────│
 │                 │                 │   cat pipe (BLOCK) │
 │                 │                 │◀───────────────────│
 │                 │                 │                    │
```

---

## 14. CLI Commands

### 14.1 Setup & Server

**`sparkq setup`**
- Interactive Q&A to configure `sparkq.yml`
- Sets: project name, repo path, PRD path, script_dirs, tool defaults
- Option to review and revise defaults
- Run once per project (or re-run to reconfigure)

**`sparkq run`** (interactive mode)
```
$ sparkq run

Starting SparkQ server on http://localhost:8420

Sessions with queued tasks:
  1. api-v2 (2 streams, 4 queued tasks)
  2. payments (3 streams, 12 queued tasks)

Select session: 1

Streams in 'api-v2':
  1. auth (3 queued)
  2. endpoints (1 queued)

Select stream: 1

[auth] Starting watcher...
[auth] Instructions: Implement JWT authentication per PRD section 4.2.
[auth] Endpoints: /login, /logout, /refresh
[auth] Done when: all auth tests pass
[auth] 3 queued tasks

Ready. Waiting for tasks...
```

**`sparkq run --session <name>`** (direct mode)
```
$ sparkq run --session api-v2

Starting SparkQ server on http://localhost:8420

Starting watchers for session 'api-v2':

[auth] Starting watcher...
[auth] Instructions: Implement JWT authentication per PRD section 4.2.
[auth] 3 queued tasks

[endpoints] Starting watcher...
[endpoints] Instructions: Build user CRUD endpoints.
[endpoints] 1 queued task

Ready. Open Claude terminals for each stream.
```

**`sparkq stop`**
- Stops the server
- Stops all watchers
- Tasks in `running` stay running (Claude finishes current work)
- Queued tasks stay queued

**`sparkq stop --stream=<name>`**
- Stops watcher for that stream only
- Server keeps running
- Other streams unaffected

**`sparkq status`**
- Shows server status
- Lists active sessions/streams
- Queue stats

**`sparkq reload`**
- Reloads `sparkq.yml` (tools, script index)
- No server restart needed

### 14.2 Session Management

| Command | Description |
|---------|-------------|
| `sparkq session create <name> [--description "..."]` | Create a new session |
| `sparkq session list` | List all sessions |
| `sparkq session end <name>` | End a session |

### 14.3 Stream Management

| Command | Description |
|---------|-------------|
| `sparkq stream create <name> --session <session> --instructions "..."` | Create stream with instructions |
| `sparkq stream list [--session <session>]` | List streams |
| `sparkq stream end <name>` | End a stream |

### 14.4 Task Management

| Command | Description |
|---------|-------------|
| `sparkq enqueue <tool> '<payload>' --stream=<stream> [--timeout=N]` | Queue a task |
| `sparkq tasks [--status=X] [--stream=X] [--stale]` | List tasks |
| `sparkq task <id>` | Show task details |
| `sparkq requeue <id>` | Clone failed task as new queued task |

### 14.5 Worker Commands

| Command | Description |
|---------|-------------|
| `sparkq peek --stream=<stream>` | Check for queued task (watcher) |
| `sparkq claim --stream=<stream>` | Claim next task (Claude) |
| `sparkq claim` | Error + list streams with queued tasks |
| `sparkq complete <id> --result '<json>' [--stdout '...'] [--stderr '...']` | Mark succeeded (requires result.summary) |
| `sparkq fail <id> --error '...' [--stdout '...'] [--stderr '...']` | Mark failed |

### 14.6 Utility

| Command | Description |
|---------|-------------|
| `sparkq purge [--older-than=3d]` | Manually purge old tasks |

---

## 15. Web UI

Served at `http://127.0.0.1:8420/`

**No authentication.** Stateless, no cookies, no login. Trusted local environment.

**Pages:**

1. **Dashboard**
   - Active session and streams
   - Queue size, running count, recent success/fail counts
   - Stream filter dropdown

2. **Sessions**
   - List sessions with status
   - Create new session
   - End session

3. **Streams**
   - List streams with status, task counts, instructions preview
   - Create new stream (with instructions)
   - End stream

4. **Enqueue**
   - Tool dropdown (from registry)
   - Stream dropdown
   - Payload textarea (with template from tool config)
   - Timeout override field
   - Script path autocomplete (from index)
   - Submit button

5. **Task List**
   - Table: ID, tool, stream, status, created, started, finished, duration
   - Filter by status, stream
   - **Stale indicator:** Yellow warning for running tasks past timeout
   - **Auto-failed indicator:** Red for tasks auto-failed at 2x timeout
   - Click row → task detail
   - Requeue button for failed tasks

6. **Task Detail**
   - Full payload
   - Result JSON (with summary highlighted)
   - stdout panel (scrollable)
   - stderr panel (scrollable)
   - Error message (if failed)
   - Timing breakdown (queued → started → finished, duration)
   - Stream instructions context

---

## 16. Configuration

### 16.1 `sparkq setup`

Interactive setup creates `sparkq.yml`:

```
$ sparkq setup

SparkQ Setup
============

Project name [my-project]: my-saas-app
Repository path [/home/user/my-project]: 
PRD file path (for context) []: docs/PRD.md

Script directories to index:
  Add directory (empty to finish): scripts
  Add directory (empty to finish): tools
  Add directory (empty to finish): 

Task class defaults:
  FAST_SCRIPT timeout [30]: 
  MEDIUM_SCRIPT timeout [300]: 
  LLM_LITE timeout [300]: 
  LLM_HEAVY timeout [900]: 

Server port [8420]: 

Configuration saved to sparkq.yml
Run 'sparkq run' to start.
```

### 16.2 Config File

`sparkq.yml`:

```yaml
# Project
project:
  name: my-saas-app
  repo_path: /home/user/my-project
  prd_path: docs/PRD.md

# Server
server:
  port: 8420

# Storage
database:
  path: sparkq.db
  mode: wal

# Purge settings
purge:
  older_than_days: 3

# Script indexing
script_dirs:
  - scripts
  - tools

# Task class defaults
task_classes:
  FAST_SCRIPT:
    timeout: 30
  MEDIUM_SCRIPT:
    timeout: 300
  LLM_LITE:
    timeout: 300
  LLM_HEAVY:
    timeout: 900

# Tool registry
tools:
  run-bash:
    description: Execute a bash script
    task_class: MEDIUM_SCRIPT

  run-migrations:
    description: Run database migrations
    task_class: MEDIUM_SCRIPT
    timeout: 1800

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

### 16.3 Environment Variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | API key for Claude |
| `OPENAI_API_KEY` | API key for OpenAI (if used) |

Keys are read from environment, not stored in config.

---

## 17. Runtime Dependencies

### 17.1 Required (v1)

| Package | Purpose |
|---------|---------|
| Python 3.11+ | Runtime |
| sqlite3 (stdlib) | Database |
| Typer | CLI framework |
| FastAPI | HTTP API |
| Uvicorn | HTTP server |

### 17.2 Optional

| Package | Purpose |
|---------|---------|
| Jinja2 | Server-side HTML templates (if needed) |
| pydantic | Typed models/validation (if needed) |

### 17.3 Note

These are v1 implementation choices. They may be swapped later (e.g., Flask instead of FastAPI) as long as the external contracts remain stable:
- CLI commands and flags
- HTTP API endpoints
- Worker protocol (peek, claim, complete, fail)
- SQLite schema

---

## 18. Directory Structure

```
your-project/
├── src/
├── scripts/
│   ├── deploy-staging.sh
│   └── run-migrations.py
├── docs/
│   └── PRD.md
├── sparkq/                      ← Self-contained, copy this
│   ├── sparkq.yml               ← Config (created by setup)
│   ├── sparkq.db                ← Database (created on first run)
│   ├── sparkq.lock              ← Server lockfile (created on run)
│   ├── sparkq-watcher.sh        ← Watcher script
│   ├── WORKER_PLAYBOOK.md       ← Claude playbook template
│   ├── requirements.txt         ← Python dependencies
│   ├── setup.sh                 ← Creates venv, installs deps
│   ├── teardown.sh              ← Deletes venv and database
│   └── src/
│       ├── __init__.py
│       ├── __main__.py          ← Entry point
│       ├── cli.py               ← CLI commands (Typer)
│       ├── api.py               ← HTTP endpoints (FastAPI)
│       ├── engine.py            ← Queue logic
│       ├── storage.py           ← SQLite operations
│       ├── tools.py             ← Tool registry
│       ├── index.py             ← Script indexer
│       ├── purge.py             ← Auto-purge logic
│       └── ui/                  ← Web UI static files
│           ├── index.html
│           ├── app.js
│           └── style.css
```

---

## 19. Setup and Teardown

### 19.1 Setup

```bash
cd your-project/sparkq
./setup.sh          # Creates venv, installs deps
sparkq setup        # Interactive config
sparkq run          # Start server + pick session/stream
```

### 19.2 Teardown

```bash
./teardown.sh
```

`teardown.sh` does:
1. Stop sparkq if running
2. Delete `sparkq.db`
3. Delete `sparkq.lock`
4. Delete `venv/`
5. Print "Cleaned up. Delete this folder to remove sparkq entirely."

---

## 20. Failure Modes and Mitigations

| Failure Mode | Impact | Mitigation |
|--------------|--------|------------|
| Claude crashes mid-task | Task stuck in `running` | 2x timeout auto-fail; `sparkq tasks --status=running --stale` for visibility |
| Claude misparses claim | Task not executed | Low risk - JSON is clean; playbook keeps Claude on track |
| Missing result.summary | Task can't complete | CLI rejects with clear error; Claude retries with valid JSON |
| Malformed result JSON | Task can't complete | CLI rejects with clear error; Claude retries |
| Claude never calls complete/fail | Task stuck in `running` | 2x timeout auto-fail with clear error message |
| Two sessions same stream | Race conditions | Watcher lockfile prevents duplicate watcher startup |
| Watcher process dies | Claude never wakes | Check `ps aux | grep sparkq-watcher`; restart watcher |
| FIFO pipe deleted | Watcher write fails | Watcher recreates pipe on startup |
| SparkQ server down | All commands fail | `sparkq status` to check; `sparkq run` to restart |
| Done flag from old session | Premature wake | Clean temp files on session start: `rm -f /tmp/sparkq-*` |

---

## 21. Success Criteria

SparkQ v1 is done when:

1. `sparkq setup` creates config interactively
2. `sparkq run` starts server, prompts for session/stream, starts watcher
3. `sparkq run --session X` starts server + all watchers for that session
4. `sparkq session create` and `sparkq stream create` work with instructions
5. `sparkq enqueue` queues tasks with correct task_class and timeout
6. `sparkq peek --stream=X` returns task JSON without claiming
7. `sparkq claim --stream=X` returns full task + stream instructions, marks running
8. `sparkq claim` (no stream) errors and lists streams with queued tasks
9. `sparkq complete` validates result.summary, rejects if missing
10. `sparkq fail` stores error and stdout/stderr
11. `sparkq requeue` clones failed task with new ID
12. `sparkq tasks --stale` shows tasks past timeout
13. Tasks auto-fail at 2x timeout
14. Auto-purge runs on startup (background)
15. Web UI shows sessions, streams, tasks with stale indicators
16. Watcher polls 60s idle / 120s busy, uses lockfile
17. Full workflow: enqueue → watcher detects → Claude wakes → executes → Haiku summarizes → completes → waits again
18. Stream instructions shown at watcher start and in claim response
19. `sparkq stop` and `sparkq stop --stream=X` work correctly
20. `./teardown.sh` cleans everything up

---

## 22. Backlog (Out of Scope for v1)

These are explicitly deferred:

### 22.1 Auto-Repair (v2 candidate)

On bash/python failure:
1. Send error + script to LLM
2. LLM proposes fix
3. Apply fix in place
4. Re-run task
5. If still fails, mark failed

### 22.2 Other Future Ideas

- Priority scheduling
- Task dependencies
- Postgres backend option
- Service mode (long-running daemon)
- Cross-stream task visibility

---

## 23. Appendix: Decisions Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Storage | SQLite with WAL | Zero setup, handles concurrent access |
| Scheduling | FIFO per stream | Simple, predictable, no cross-stream complexity |
| Data model | Project → Session → Stream → Task | Organized history, context isolation |
| Stream naming | Globally unique | No need for --session in task commands |
| Stream instructions | Mini-FRD per stream | Claude knows context without re-sending |
| Stream states | active/ended only | No paused; canceled = ended, requeue if needed |
| Task storage | Single table, filter by status | No moving data, simple queries |
| Task classes | 4 classes with timeout defaults | FAST_SCRIPT, MEDIUM_SCRIPT, LLM_LITE, LLM_HEAVY |
| Watcher polling | 60s idle, 120s busy | Simple backoff, no task-class-aware polling |
| result.summary | Required, CLI enforces | Consistent data, Haiku generates it |
| stdout/stderr | Separate CLI flags | Predictable schema, queryable, dedicated UI panels |
| Claim response | Full task + stream instructions | Context without re-sending |
| claim without --stream | Error + list streams | Helpful UX, prevents accidents |
| Timeout enforcement | Warning at 1x, auto-fail at 2x | Visibility without premature kills |
| Failed task resubmit | Clone with new ID | Clean audit trail |
| Purge | Auto on startup, background | Non-blocking, 3 days default |
| Tool reload | Explicit `sparkq reload` | No hot-reload complexity |
| Web UI auth | None | Trusted local system |
| sparkq setup | Interactive Q&A | Easy first-time config, PRD path for context |
| sparkq run | Interactive or --session | Flexible: pick stream or start all |
| Runtime stack | Python 3.11+, Typer, FastAPI, Uvicorn | Modern, fast, swappable later |

---

## 24. Implementation Phases

SparkQ is built in 5 phases. Each phase produces working, testable code before moving to the next.

### 24.1 Phase 1: Core Infrastructure

**Goal:** SQLite schema + CLI skeleton

**Deliverables:**
- `sparkq/src/storage.py` - SQLite operations, schema creation, WAL mode
- `sparkq/src/cli.py` - Typer CLI skeleton with all commands stubbed
- `sparkq/src/models.py` - Pydantic models for Project, Session, Stream, Task
- Database migrations/initialization
- Basic tests for storage layer

**Commands working after Phase 1:**
```bash
sparkq setup          # Creates sparkq.yml and initializes DB
sparkq status         # Shows "SparkQ not running" (server not built yet)
sparkq session create <name>
sparkq session list
sparkq stream create <name> --session <session> --instructions "..."
sparkq stream list
```

**Claude Playbook:** Not needed yet - no worker commands.

---

### 24.2 Phase 2: Worker Commands

**Goal:** Complete worker protocol (peek, claim, complete, fail)

**Deliverables:**
- `sparkq enqueue` - Create tasks with tool, payload, task_class, timeout
- `sparkq peek --stream=X` - Return next queued task (no status change)
- `sparkq claim --stream=X` - Claim task, return full record + stream instructions
- `sparkq claim` (no stream) - Error + list streams with queued tasks
- `sparkq complete` - Validate result.summary, transition to succeeded
- `sparkq fail` - Store error, transition to failed
- `sparkq tasks` - List with filters (--status, --stream, --stale)
- `sparkq task <id>` - Show single task detail
- `sparkq requeue <id>` - Clone failed task

**Commands working after Phase 2:**
```bash
sparkq enqueue run-bash '{"script_path": "test.sh"}' --stream=auth
sparkq peek --stream=auth
sparkq claim --stream=auth
sparkq complete tsk_123 --result '{"summary": "done"}' --stdout "..." --stderr "..."
sparkq fail tsk_123 --error "failed" --stdout "..." --stderr "..."
sparkq tasks --status=queued --stream=auth
sparkq requeue tsk_123
```

**Claude Playbook:** Draft `WORKER_PLAYBOOK.md` (basic version) - Claude can now manually test the worker flow.

---

### 24.3 Phase 3: Server + API + Web UI

**Goal:** HTTP server with API and basic Web UI

**Deliverables:**
- `sparkq/src/api.py` - FastAPI routes matching CLI functionality
- `sparkq/src/server.py` - Uvicorn server startup
- `sparkq/src/ui/` - Static HTML/JS/CSS for Web UI
- `sparkq run` - Starts server (interactive mode: prompt for session/stream)
- `sparkq run --session X` - Starts server + watchers for all streams
- `sparkq stop` - Stops server and watchers
- `sparkq reload` - Reload tools and script index
- Auto-purge on startup (background)

**API Endpoints working after Phase 3:**
```
GET  /api/health
GET  /api/status
GET  /api/sessions
POST /api/sessions
GET  /api/streams
POST /api/streams
GET  /api/tasks
POST /api/tasks
GET  /api/tasks/<id>
POST /api/tasks/<id>/requeue
GET  /api/tools
GET  /api/scripts
```

**Web UI Pages:**
- Dashboard
- Sessions list
- Streams list
- Task list with filters
- Task detail
- Enqueue form

**Claude Playbook:** Not updated - server is for human use.

---

### 24.4 Phase 4: Watcher + Full Worker Playbook

**Goal:** Watcher script + comprehensive Claude operating procedures

**Deliverables:**
- `sparkq/sparkq-watcher.sh` - Full watcher with lockfile, FIFO, polling
- `sparkq/WORKER_PLAYBOOK.md` - Complete Claude operating procedures
- Integration of watcher start/stop with `sparkq run` and `sparkq stop`
- Stale task detection (1x timeout warning in UI)
- Auto-fail logic (2x timeout)

**Watcher features:**
- Lockfile per stream (prevents duplicates)
- FIFO pipe for wake signaling
- 60s poll when idle, 120s when busy
- Clean shutdown on SIGTERM

**Claude Playbook:** Full version with all patterns (see Section 25).

---

### 24.5 Phase 5: Polish + Dogfooding

**Goal:** Use SparkQ to build SparkQ features

**Deliverables:**
- Script index implementation
- Tool registry with task_class support
- `sparkq setup` interactive Q&A
- Timeout override at enqueue
- UI polish (stale indicators, auto-fail indicators)
- Error messages and edge case handling
- Documentation

**Dogfooding:** Use SparkQ streams to implement remaining features:
- Stream "polish-ui" - UI improvements
- Stream "docs" - Documentation
- Stream "edge-cases" - Error handling

---

## 25. Claude Worker Playbook Specification

The Worker Playbook defines how Claude operates when claiming and executing tasks. It pulls patterns from the proven hybrid-codex playbook.

### 25.1 Playbook Location

```
sparkq/WORKER_PLAYBOOK.md
```

Claude reads this file at the start of each session. It can be referenced via `/sparkq-worker` slash command.

### 25.2 Playbook Structure

```markdown
# SparkQ Worker Playbook

## 1. Session Setup
## 2. Task Loop
## 3. Execution Patterns by Tool Type
## 4. Delegation Patterns (Haiku/Codex)
## 5. Validation Patterns
## 6. Error Recovery
## 7. Edit-First Principle
## 8. Summary Generation
```

### 25.3 Full Playbook Content

```markdown
# SparkQ Worker Playbook

> Operating procedures for Claude Code when working as a SparkQ stream worker.

## 1. Session Setup

When starting a new worker session:

### 1.1 Clean Previous State
```bash
rm -f /tmp/sparkq-<STREAM>-*
```

### 1.2 Start Watcher
```bash
nohup ./sparkq-watcher.sh <STREAM> > /tmp/sparkq-<STREAM>-watcher.log 2>&1 &
echo "Watcher PID: $!"
```

### 1.3 Verify Setup
```bash
ps aux | grep sparkq-watcher
sparkq status
```

### 1.4 Read Stream Instructions
The claim response includes stream instructions. Read them carefully - they define:
- What this stream is trying to accomplish
- Routing guidance (when to delegate vs execute directly)
- Done-when criteria

---

## 2. Task Loop

### 2.1 Wait for Task
```bash
touch /tmp/sparkq-<STREAM>-done && \
cat /tmp/sparkq-<STREAM>-pipe > /dev/null && \
sparkq claim --stream=<STREAM>
```

### 2.2 Execute Task
Based on `tool_name`, follow the appropriate execution pattern (Section 3).

### 2.3 Generate Summary
**Always have Haiku generate the summary** (Section 8).

### 2.4 Complete or Fail
```bash
# Success
sparkq complete <TASK_ID> \
  --result '{"summary": "<haiku-summary>", ...}' \
  --stdout "$(cat /tmp/task.out)" \
  --stderr "$(cat /tmp/task.err)"

# Failure
sparkq fail <TASK_ID> \
  --error "<what went wrong>" \
  --stdout "$(cat /tmp/task.out)" \
  --stderr "$(cat /tmp/task.err)"
```

### 2.5 Return to Wait
Immediately run the wait command again (2.1).

---

## 3. Execution Patterns by Tool Type

### 3.1 run-bash / run-bash-fast

Execute the script locally, capture output:

```bash
# Extract from payload
SCRIPT_PATH=$(echo '$PAYLOAD' | jq -r '.script_path')
ARGS=$(echo '$PAYLOAD' | jq -r '.args // [] | join(" ")')

# Execute with output capture
bash "$SCRIPT_PATH" $ARGS > /tmp/task.out 2> /tmp/task.err
EXIT_CODE=$?

# Check result
if [ $EXIT_CODE -eq 0 ]; then
  # Generate summary, call complete
else
  # Call fail with error context
fi
```

### 3.2 run-python

Same pattern as bash:

```bash
SCRIPT_PATH=$(echo '$PAYLOAD' | jq -r '.script_path')
ARGS=$(echo '$PAYLOAD' | jq -r '.args // [] | join(" ")')

python "$SCRIPT_PATH" $ARGS > /tmp/task.out 2> /tmp/task.err
EXIT_CODE=$?
```

### 3.3 llm-haiku (LLM_LITE)

Delegate focused work to Haiku:

1. Read `payload.prompt` and `payload.context_files`
2. Load context files into prompt
3. Call Haiku with the combined prompt
4. If `payload.output_path` specified, write result to file
5. Haiku's response becomes part of the result
6. Generate summary of what Haiku produced

### 3.4 llm-sonnet (LLM_HEAVY)

For complex reasoning, planning, or architectural decisions:

1. Read `payload.prompt` and `payload.context_files`
2. This is YOU (Sonnet) - think deeply about the problem
3. If task requires code generation, consider delegating to Haiku or Codex
4. Document your reasoning in the result
5. Generate summary

### 3.5 delegate-codex

Use Codex CLI for mechanical code generation:

```bash
# Build Codex command from payload
PROMPT=$(echo '$PAYLOAD' | jq -r '.prompt')
CONTEXT=$(echo '$PAYLOAD' | jq -r '.context_files // [] | map("--add-file " + .) | join(" ")')
MODEL=$(echo '$PAYLOAD' | jq -r '.model // "gpt-5.1-codex"')

# Execute Codex
codex exec -m $MODEL $CONTEXT "$PROMPT" > /tmp/task.out 2> /tmp/task.err
```

**When to use Codex:**
- Type definitions and interfaces
- Boilerplate code generation
- File format conversions
- Documentation generation
- Simple refactoring patterns

**When NOT to use Codex:**
- Project-specific logic requiring deep context
- Architectural decisions
- Complex state management
- Anything requiring understanding of business logic

### 3.6 validate-outputs

Run syntax validation:

```bash
DIRECTORY=$(echo '$PAYLOAD' | jq -r '.directory')

# Validate bash scripts
find "$DIRECTORY" -name "*.sh" -exec bash -n {} \;

# Validate Python
find "$DIRECTORY" -name "*.py" -exec python -m py_compile {} \;

# Validate TypeScript (if tsc available)
find "$DIRECTORY" -name "*.ts" -exec tsc --noEmit {} \;

# Check for placeholders
grep -r "TODO\|FIXME\|XXX\|PLACEHOLDER" "$DIRECTORY" && echo "WARNING: Placeholders found"
```

---

## 4. Delegation Patterns

### 4.1 When to Delegate to Haiku

Use Haiku (LLM_LITE) for:
- Focused, single-purpose tasks
- Code implementation within clear constraints
- Text transformation and formatting
- Summarization
- Simple analysis

**Delegation prompt template:**
```
Task: [specific task description]

Context:
[relevant code or documentation]

Constraints:
- [constraint 1]
- [constraint 2]

Output format:
[expected output structure]
```

### 4.2 When to Delegate to Codex

Use Codex for:
- Pure code generation without project context
- Type definitions from examples
- Test generation from implementation
- Documentation from code
- Format conversions

**Codex prompt quality checklist:**
- Single, clear objective
- Specific output path
- Framework/library versions specified
- Example format or template reference

### 4.3 When to Handle Yourself (Sonnet)

Keep for yourself:
- Architectural decisions
- Multi-file refactoring requiring context
- Debugging complex issues
- Integration planning
- Anything requiring understanding of "why"

### 4.4 Escalation

If a task is unclear or requires human decision:

```bash
sparkq fail <TASK_ID> \
  --error "Escalation: [reason]. Need clarification on [specific question]."
```

The human will review and create a new task with clarification.

---

## 5. Validation Patterns

### 5.1 After Code Generation

Always validate generated code before completing:

```bash
# Syntax check
bash -n generated-script.sh
python -m py_compile generated-module.py
tsc --noEmit generated-types.ts

# Check for placeholders
grep -E "TODO|FIXME|XXX|PLACEHOLDER|undefined|null" generated-file.*
```

### 5.2 After File Modification

Verify the file is valid:

```bash
# For config files
python -c "import yaml; yaml.safe_load(open('config.yml'))"
python -c "import json; json.load(open('config.json'))"

# For scripts
bash -n modified-script.sh
```

### 5.3 Integration Check

If task modified multiple files:

1. Check imports/references are valid
2. Run relevant tests if available
3. Note any dependencies that may need updating

---

## 6. Error Recovery

### 6.1 sparkq complete Rejected

If `sparkq complete` fails (missing summary, invalid JSON):

1. Read the error message
2. Fix the `--result` JSON
3. Retry the command
4. Task stays `running` until successful complete/fail

### 6.2 Script Execution Failed

If bash/python script exits non-zero:

1. Capture stdout/stderr
2. Analyze the error
3. Decide: retry with fix, or fail with explanation
4. If fixable and within scope, fix and retry
5. If not fixable, call `sparkq fail` with clear error

### 6.3 Watcher Died

If tasks aren't being picked up:

```bash
# Check watcher
ps aux | grep sparkq-watcher

# Restart if needed
nohup ./sparkq-watcher.sh <STREAM> > /tmp/sparkq-<STREAM>-watcher.log 2>&1 &
```

### 6.4 SparkQ Server Down

```bash
sparkq status
# If down:
sparkq run --session <SESSION>
```

---

## 7. Edit-First Principle

**Before creating any new file, check if it already exists.**

### 7.1 Check Existing

```bash
if [ -f "$TARGET_PATH" ]; then
  echo "File exists - will edit"
  # Read current content, plan modifications
else
  echo "File does not exist - will create"
  # Plan new file content
fi
```

### 7.2 Search for Similar

```bash
# Before creating a new utility
find . -name "*.sh" | xargs grep -l "similar_function"

# Before creating a new module
find . -name "*.py" | xargs grep -l "SimilarClass"
```

### 7.3 Why Edit-First Matters

- Avoids duplicate code
- Maintains consistency
- Reduces merge conflicts
- Respects existing patterns

---

## 8. Summary Generation

**Every task completion requires a summary. Always have Haiku generate it.**

### 8.1 Why Haiku

- Cheap and fast
- Consistent voice/format
- You (Sonnet) can move to next task
- Summaries are for human scan-ability

### 8.2 Summary Prompt Template

```
Summarize what was done in this task for a developer reviewing the task queue.

Task: [tool_name]
Payload: [payload summary]
Outcome: [what happened]
Files affected: [list if any]
Exit code: [if applicable]

Write a 1-2 sentence summary that answers: "What did this task accomplish?"
Keep it factual and specific. No fluff.
```

### 8.3 Summary Examples

**Good:**
- "Executed deploy-staging.sh successfully. Deployed commit abc123 to staging.example.com."
- "Generated Zod schema for User type. Created src/lib/validation/user-schema.ts with 3 validators."
- "Migration failed: permission denied on users table. See stderr for details."

**Bad:**
- "Task completed." (too vague)
- "I ran the script and it worked and everything is good now." (too verbose, first person)
- "Success" (no information)

---

## 9. Stream Context

Each stream has instructions (mini-FRD). They're included in the claim response.

### 9.1 Read Instructions First

Before executing any task, read the stream instructions to understand:
- Overall goal of this stream
- Routing preferences (delegate vs execute)
- Done-when criteria
- Any constraints or patterns to follow

### 9.2 Stay in Scope

If a task seems outside the stream's scope:
1. Check if it's a dependency of the main goal
2. If yes, execute it
3. If no, escalate: "Task appears out of scope for stream [X]. Clarify?"

---

## 10. Quick Reference

### Commands
```bash
# Wait for task
touch /tmp/sparkq-<STREAM>-done && cat /tmp/sparkq-<STREAM>-pipe > /dev/null && sparkq claim --stream=<STREAM>

# Complete
sparkq complete <ID> --result '{"summary": "..."}' --stdout "$(cat /tmp/task.out)" --stderr "$(cat /tmp/task.err)"

# Fail
sparkq fail <ID> --error "..." --stdout "$(cat /tmp/task.out)" --stderr "$(cat /tmp/task.err)"

# Check watcher
ps aux | grep sparkq-watcher
```

### Task Loop
```
wait → claim → execute → summarize (haiku) → complete → wait
```

### Delegation Decision
```
Need project context?     → You (Sonnet) or Haiku
Mechanical code gen?      → Codex
Focused single task?      → Haiku
Architectural decision?   → You (Sonnet)
Unclear/needs human?      → Escalate (fail with question)
```
```

---

## 26. Tool Registry for Playbook

These tools support the playbook's execution patterns:

```yaml
tools:
  # === Bash/Python Execution ===
  run-bash:
    description: Execute a bash script locally
    task_class: MEDIUM_SCRIPT
    timeout: 300

  run-bash-fast:
    description: Quick bash utility (health checks, simple ops)
    task_class: FAST_SCRIPT
    timeout: 30

  run-python:
    description: Execute a python script locally
    task_class: MEDIUM_SCRIPT
    timeout: 300

  # === LLM Delegation ===
  llm-haiku:
    description: Delegate focused task to Haiku
    task_class: LLM_LITE
    timeout: 300

  llm-sonnet:
    description: Complex reasoning task (handled by worker itself)
    task_class: LLM_HEAVY
    timeout: 900

  delegate-codex:
    description: Delegate code generation to Codex CLI
    task_class: LLM_LITE
    timeout: 300

  # === Validation ===
  validate-outputs:
    description: Run syntax validation on generated code
    task_class: FAST_SCRIPT
    timeout: 60

  validate-integration:
    description: Check multi-file integration (imports, refs)
    task_class: MEDIUM_SCRIPT
    timeout: 120

  # === Utility ===
  summarize:
    description: Generate summary of work (uses Haiku)
    task_class: FAST_SCRIPT
    timeout: 30
```

---

## 27. Implementation Checklist

### Phase 1: Core Infrastructure
- [ ] SQLite schema (projects, sessions, streams, tasks)
- [ ] WAL mode enabled
- [ ] Pydantic models
- [ ] storage.py with CRUD operations
- [ ] cli.py skeleton with Typer
- [ ] sparkq setup (interactive)
- [ ] sparkq session create/list
- [ ] sparkq stream create/list
- [ ] Basic tests

### Phase 2: Worker Commands
- [ ] sparkq enqueue with task_class and timeout
- [ ] sparkq peek --stream
- [ ] sparkq claim --stream (full task + stream instructions)
- [ ] sparkq claim (no stream) - error + list
- [ ] sparkq complete with result.summary validation
- [ ] sparkq fail
- [ ] sparkq tasks with filters
- [ ] sparkq task <id>
- [ ] sparkq requeue
- [ ] Draft WORKER_PLAYBOOK.md

### Phase 3: Server + API + Web UI
- [ ] FastAPI routes
- [ ] Uvicorn server
- [ ] sparkq run (interactive)
- [ ] sparkq run --session
- [ ] sparkq stop / stop --stream
- [ ] sparkq reload
- [ ] Auto-purge on startup
- [ ] Web UI: Dashboard
- [ ] Web UI: Sessions/Streams
- [ ] Web UI: Task list with filters
- [ ] Web UI: Task detail
- [ ] Web UI: Enqueue form

### Phase 4: Watcher + Full Playbook
- [ ] sparkq-watcher.sh with lockfile
- [ ] FIFO pipe handling
- [ ] 60s/120s polling
- [ ] Integration with sparkq run/stop
- [ ] Stale task detection (1x timeout)
- [ ] Auto-fail (2x timeout)
- [ ] Full WORKER_PLAYBOOK.md (Section 25.3)

### Phase 5: Polish + Dogfooding
- [ ] Script index
- [ ] Tool registry with task_class
- [ ] Timeout override at enqueue
- [ ] UI stale/auto-fail indicators
- [ ] Error messages polish
- [ ] Documentation
- [ ] Dogfood: use SparkQ to finish SparkQ
