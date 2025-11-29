# SparkQ Implementation Strategy & Phased Plan

> **Purpose:** Token-efficient implementation of SparkQ using the right model for each task.
> **Budget:** Claude Max $200/mo + Codex $200/mo
> **Reference:** FRD v7.5

---

## Part 1: Implementation Strategy

### 1.1 Model Cost Analysis

| Model | Input | Output | Blended (70/30) | Weight vs Haiku | Best For |
|-------|-------|--------|-----------------|-----------------|----------|
| Haiku | $1/M | $5/M | $2.20/M | **1x** | Code generation, validation, summaries |
| Sonnet | $3/M | $15/M | $6.60/M | **3x** | Orchestration, complex logic, integration |
| Opus 4.5 | $5/M | $25/M | $11.00/M | **5x** | Prompt engineering, architecture, planning |
| Codex 5.1 | Subscription | Subscription | ~$0* | **0x** | Bulk code generation, boilerplate, types |

*Codex is separate subscription - use liberally for code generation.

### 1.2 Token Optimization Principles

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        TOKEN OPTIMIZATION PYRAMID                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│                            ┌─────────┐                                  │
│                            │ OPUS 4.5│  5x cost                         │
│                            │ Planning│  Use sparingly                   │
│                            └────┬────┘                                  │
│                                 │                                       │
│                       ┌─────────┴─────────┐                             │
│                       │     SONNET        │  3x cost                    │
│                       │  Orchestration    │  Use for coordination       │
│                       └─────────┬─────────┘                             │
│                                 │                                       │
│              ┌──────────────────┴──────────────────┐                    │
│              │              HAIKU                  │  1x cost           │
│              │   Code gen, validation, summaries   │  Use liberally     │
│              └──────────────────┬──────────────────┘                    │
│                                 │                                       │
│  ┌──────────────────────────────┴──────────────────────────────────┐    │
│  │                         CODEX 5.1                               │    │
│  │   Boilerplate, types, schemas, tests, documentation             │    │
│  │   SEPARATE BUDGET - USE HEAVILY                                 │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.3 Model Assignment Rules

| Task Type | Primary Model | Validator | Rationale |
|-----------|---------------|-----------|-----------|
| **Architecture decisions** | Opus 4.5 | - | Worth 5x for critical design |
| **Prompt engineering** | Opus 4.5 | - | Quality prompts = quality output |
| **Implementation planning** | Opus 4.5 | - | One-time cost, reused many times |
| **Orchestration/integration** | Sonnet | Haiku | Coordinates multi-file work |
| **Complex business logic** | Sonnet | Haiku | Requires reasoning |
| **Simple code generation** | Haiku | Haiku | Fast, cheap, parallel |
| **Boilerplate/scaffolding** | Codex | Haiku | Free (separate budget) |
| **Type definitions** | Codex | Haiku | Mechanical, pattern-based |
| **Test generation** | Codex | Haiku | Template-based |
| **Documentation** | Codex | Haiku | Straightforward |
| **Validation/syntax check** | Haiku | - | Fast, cheap |
| **Summaries** | Haiku | - | Simple task |

### 1.4 Parallel Execution Strategy

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     PARALLEL MULTI-AGENT PATTERN                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Sonnet (Orchestrator)                                                  │
│      │                                                                  │
│      ├──► Codex Agent 1: storage.py (schema, CRUD)                      │
│      │                                                                  │
│      ├──► Codex Agent 2: models.py (Pydantic models)                    │
│      │                                                                  │
│      ├──► Codex Agent 3: cli.py skeleton                                │
│      │                                                                  │
│      └──► Haiku Agent 4: tests/test_storage.py                          │
│                                                                         │
│  All complete ──► Haiku validates each file ──► Sonnet integrates       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.5 Estimated Token Budget Per Phase

| Phase | Opus 4.5 | Sonnet | Haiku | Codex | Est. Claude Cost |
|-------|----------|--------|-------|-------|------------------|
| Phase 1: Core | 10K (prompts) | 50K (orchestration) | 100K (validation) | 200K (code) | ~$0.75 |
| Phase 2: Worker | 5K (prompts) | 30K (orchestration) | 80K (validation) | 150K (code) | ~$0.45 |
| Phase 3: Server | 5K (prompts) | 40K (orchestration) | 100K (validation) | 250K (code) | ~$0.60 |
| Phase 4: Watcher | 5K (prompts) | 20K (orchestration) | 50K (validation) | 50K (code) | ~$0.30 |
| Phase 5: Polish | 5K (prompts) | 30K (orchestration) | 80K (validation) | 100K (code) | ~$0.45 |
| **TOTAL** | **30K** | **170K** | **410K** | **750K** | **~$2.55** |

**Budget reality check:** At these estimates, you'd use ~1.3% of your monthly Claude budget for the entire implementation. This leaves massive headroom for iteration, debugging, and refinement.

---

## Part 2: Phased Implementation Plan

### Overview

```
Phase 1: Core Infrastructure     ──► SQLite + CLI skeleton
Phase 2: Worker Commands         ──► peek, claim, complete, fail  
Phase 3: Server + API + UI       ──► FastAPI + Web UI
Phase 4: Watcher + Playbook      ──► Bash watcher + Claude playbook
Phase 5: Polish + Dogfooding     ──► Script index, refinements
```

---

## Phase 1: Core Infrastructure

**Goal:** SQLite schema, storage layer, CLI skeleton, basic session/stream management.

**Duration:** ~2-3 hours of Claude time

### Phase 1.1: Project Scaffolding

| Task | Model | Parallel? | Output |
|------|-------|-----------|--------|
| Create directory structure | Codex | Yes | Folder structure |
| Create requirements.txt | Codex | Yes | Dependencies file |
| Create setup.sh | Codex | Yes | Setup script |
| Create teardown.sh | Codex | Yes | Cleanup script |
| Validate structure | Haiku | After | Confirmation |

**Opus 4.5 Prompt (creates the Codex/Haiku prompts):**
```
Create Claude Code prompts for SparkQ Phase 1.1: Project Scaffolding

Context: SparkQ is a dev-only task queue. See FRD v7.5 Section 18 for directory structure.

Generate 4 Codex prompts (run in parallel):
1. Directory structure creation
2. requirements.txt with: typer, fastapi, uvicorn, pydantic
3. setup.sh (create venv, install deps)
4. teardown.sh (stop server, delete db, delete venv)

Then generate 1 Haiku validation prompt to verify all files exist and are valid.

Output format for each prompt:
- Model: [Codex|Haiku]
- Task: [description]
- Files: [output files]
- Prompt: [exact prompt text]
```

### Phase 1.2: Database Schema & Storage Layer

| Task | Model | Parallel? | Output |
|------|-------|-----------|--------|
| SQLite schema (DDL) | Codex | Yes | schema.sql |
| storage.py (CRUD operations) | Codex | Yes | storage.py |
| models.py (Pydantic) | Codex | Yes | models.py |
| Test storage layer | Haiku | After | test_storage.py |
| Validate & integrate | Haiku | After | Confirmation |

**Opus 4.5 Prompt:**
```
Create Claude Code prompts for SparkQ Phase 1.2: Database & Storage

Context: FRD v7.5 Section 7.2 defines the schema (projects, sessions, streams, tasks).

Generate 3 Codex prompts (run in parallel):
1. schema.sql - Full DDL with WAL pragma, all tables, indexes
2. storage.py - Python class with:
   - init_db() - creates tables if not exist
   - CRUD for each entity (create, get, list, update, delete)
   - Task-specific: get_queued_by_stream, claim_task, complete_task, fail_task
   - Use sqlite3 stdlib, context managers for connections
3. models.py - Pydantic models for:
   - Project, Session, Stream, Task
   - TaskStatus enum (queued, running, succeeded, failed)
   - TaskClass enum (FAST_SCRIPT, MEDIUM_SCRIPT, LLM_LITE, LLM_HEAVY)
   - Include validators, JSON serialization

Then generate 2 Haiku prompts:
1. test_storage.py - pytest tests for all CRUD operations
2. Validation - import all modules, verify no syntax errors

Output format: Model, Task, Files, Prompt (exact text)
```

### Phase 1.3: CLI Skeleton

| Task | Model | Parallel? | Output |
|------|-------|-----------|--------|
| cli.py with Typer | Codex | Yes | cli.py |
| __main__.py entry point | Codex | Yes | __main__.py |
| sparkq setup command | Haiku | After | Interactive Q&A |
| sparkq session commands | Haiku | After | create, list, end |
| sparkq stream commands | Haiku | After | create, list, end |
| Test CLI | Haiku | After | Manual test script |

**Opus 4.5 Prompt:**
```
Create Claude Code prompts for SparkQ Phase 1.3: CLI Skeleton

Context: FRD v7.5 Section 14 defines all CLI commands. Use Typer for CLI framework.

Generate 2 Codex prompts (parallel):
1. cli.py - Typer app with:
   - All command groups stubbed (setup, run, stop, session, stream, task, etc.)
   - Proper --help text from FRD descriptions
   - Import structure ready for implementation
2. __main__.py - Entry point that calls cli.app()

Then generate 3 Haiku prompts (sequential, each builds on previous):
1. Implement `sparkq setup` - Interactive Q&A per FRD 16.1
   - Project name, repo path, PRD path, script dirs
   - Write sparkq.yml
2. Implement `sparkq session create/list/end`
   - Uses storage.py
   - Proper output formatting
3. Implement `sparkq stream create/list/end`
   - Requires --session for create
   - --instructions flag for create
   - Uses storage.py

Final Haiku prompt: Test script that runs through session/stream creation flow.

Output format: Model, Task, Files, Prompt
```

### Phase 1 Completion Criteria

```bash
# All these should work after Phase 1:
sparkq setup                              # Interactive config
sparkq session create "api-v2"            # Create session  
sparkq session list                       # List sessions
sparkq stream create auth --session api-v2 --instructions "..."
sparkq stream list                        # List streams
sparkq stream list --session api-v2       # Filter by session
```

---

## Phase 2: Worker Commands

**Goal:** Complete worker protocol (enqueue, peek, claim, complete, fail, tasks, requeue)

**Duration:** ~2-3 hours of Claude time

### Phase 2.1: Task Enqueue

| Task | Model | Parallel? | Output |
|------|-------|-----------|--------|
| enqueue command | Codex | Yes | cli.py addition |
| Tool registry loader | Codex | Yes | tools.py |
| Payload validation | Haiku | After | Validation logic |
| Test enqueue | Haiku | After | Test cases |

**Opus 4.5 Prompt:**
```
Create Claude Code prompts for SparkQ Phase 2.1: Task Enqueue

Context: FRD v7.5 Section 14.4 and 10.1 define enqueue and tool registry.

Generate 2 Codex prompts (parallel):
1. tools.py - Tool registry:
   - Load tools from sparkq.yml
   - TaskClass defaults and timeout resolution
   - Tool lookup by name
2. enqueue command in cli.py:
   - sparkq enqueue <tool> '<payload>' --stream=<stream> [--timeout=N]
   - Validate tool exists
   - Validate stream exists and is active
   - Resolve task_class and timeout from tool or override
   - Create task via storage.py
   - Output: task ID and confirmation

Then generate 2 Haiku prompts:
1. Payload validation - JSON schema validation if tool defines it
2. Test enqueue - pytest tests for:
   - Valid enqueue
   - Invalid tool name
   - Invalid stream
   - Timeout override

Output format: Model, Task, Files, Prompt
```

### Phase 2.2: Peek and Claim

| Task | Model | Parallel? | Output |
|------|-------|-----------|--------|
| peek command | Codex | Yes | cli.py addition |
| claim command | Codex | Yes | cli.py addition |
| claim (no stream) behavior | Haiku | After | Error + list streams |
| Test peek/claim | Haiku | After | Test cases |

**Opus 4.5 Prompt:**
```
Create Claude Code prompts for SparkQ Phase 2.2: Peek and Claim

Context: FRD v7.5 Section 12.2 defines peek and claim behavior.

Generate 2 Codex prompts (parallel):
1. peek command:
   - sparkq peek --stream=<stream>
   - Returns oldest queued task as single-line JSON
   - Does NOT change status
   - Returns empty string if no tasks
2. claim command:
   - sparkq claim --stream=<stream>
   - Atomically: get oldest queued task, set status=running, set started_at
   - Returns full task record + stream instructions (per FRD 12.3)
   - Returns empty string if no tasks

Then generate 2 Haiku prompts:
1. claim without --stream:
   - Show error message
   - List streams with queued task counts
   - Per FRD 12.2 example output
2. Test peek/claim:
   - Peek doesn't change status
   - Claim changes status to running
   - Claim returns stream instructions
   - Claim without stream shows helpful error

Output format: Model, Task, Files, Prompt
```

### Phase 2.3: Complete and Fail

| Task | Model | Parallel? | Output |
|------|-------|-----------|--------|
| complete command | Codex | Yes | cli.py addition |
| fail command | Codex | Yes | cli.py addition |
| result.summary validation | Haiku | After | Validation logic |
| Test complete/fail | Haiku | After | Test cases |

**Opus 4.5 Prompt:**
```
Create Claude Code prompts for SparkQ Phase 2.3: Complete and Fail

Context: FRD v7.5 Section 12.2 and 8.5 define complete/fail and result.summary requirement.

Generate 2 Codex prompts (parallel):
1. complete command:
   - sparkq complete <task_id> --result '<json>' [--stdout '<text>'] [--stderr '<text>']
   - Validate task exists and status=running
   - Validate --result is valid JSON
   - Validate result.summary exists and is string
   - Set status=succeeded, finished_at=now
   - Store result, stdout, stderr
2. fail command:
   - sparkq fail <task_id> --error '<message>' [--stdout '<text>'] [--stderr '<text>']
   - Validate task exists and status=running
   - Set status=failed, finished_at=now
   - Store error, stdout, stderr

Then generate 2 Haiku prompts:
1. result.summary validation:
   - Clear error message if missing: "Error: result.summary is required (string)"
   - Clear error message if not string
   - Task stays running on validation failure
2. Test complete/fail:
   - Valid complete with summary
   - Reject complete without summary
   - Reject complete with non-string summary
   - Valid fail
   - Reject complete/fail on non-running task

Output format: Model, Task, Files, Prompt
```

### Phase 2.4: Task Listing and Requeue

| Task | Model | Parallel? | Output |
|------|-------|-----------|--------|
| tasks command | Codex | Yes | cli.py addition |
| task detail command | Codex | Yes | cli.py addition |
| requeue command | Haiku | After | Clone logic |
| Stale detection | Haiku | After | --stale flag logic |
| Test all | Haiku | After | Test cases |

**Opus 4.5 Prompt:**
```
Create Claude Code prompts for SparkQ Phase 2.4: Task Listing and Requeue

Context: FRD v7.5 Section 14.4 defines tasks, task, and requeue commands.

Generate 2 Codex prompts (parallel):
1. tasks command:
   - sparkq tasks [--status=X] [--stream=X] [--stale]
   - List tasks with filters
   - Table format: ID, tool, stream, status, created, started, finished
   - --stale: only show running tasks where now - started_at > timeout
2. task command:
   - sparkq task <id>
   - Show full task detail
   - Include payload, result, error, stdout, stderr
   - Show timing: created, started, finished, duration

Then generate 2 Haiku prompts:
1. requeue command:
   - sparkq requeue <task_id>
   - Validate task exists and status=failed
   - Create new task with new ID, same tool/payload/stream
   - Fresh queued status, attempts=0
   - Output: new task ID
2. Test all:
   - tasks with various filters
   - tasks --stale shows only stale
   - task shows full detail
   - requeue creates new task

Output format: Model, Task, Files, Prompt
```

### Phase 2.5: Worker Playbook (Draft)

| Task | Model | Parallel? | Output |
|------|-------|-----------|--------|
| Basic WORKER_PLAYBOOK.md | Haiku | No | Playbook file |

**Opus 4.5 Prompt:**
```
Create Claude Code prompt for SparkQ Phase 2.5: Draft Worker Playbook

Context: FRD v7.5 Section 25.3 contains the full playbook. For Phase 2, create a minimal version.

Generate 1 Haiku prompt:
Create WORKER_PLAYBOOK.md with:
- Basic task loop (wait, claim, execute, complete)
- Commands reference (peek, claim, complete, fail)
- Simple error recovery

This is a DRAFT - full playbook comes in Phase 4.
Keep it under 100 lines for now.

Output format: Model, Task, Files, Prompt
```

### Phase 2 Completion Criteria

```bash
# All these should work after Phase 2:
sparkq enqueue run-bash '{"script_path": "test.sh"}' --stream=auth
sparkq peek --stream=auth                 # Returns task JSON
sparkq claim --stream=auth                # Claims and returns full task
sparkq claim                              # Error + list streams
sparkq complete tsk_123 --result '{"summary": "done"}'
sparkq fail tsk_123 --error "failed"
sparkq tasks --status=queued              # List queued tasks
sparkq tasks --stream=auth --stale        # List stale tasks
sparkq task tsk_123                       # Show task detail
sparkq requeue tsk_123                    # Clone failed task
```

---

## Phase 3: Server + API + Web UI

**Goal:** HTTP server with FastAPI, Web UI for human interaction

**Duration:** ~3-4 hours of Claude time

### Phase 3.1: FastAPI Server Setup

| Task | Model | Parallel? | Output |
|------|-------|-----------|--------|
| server.py (Uvicorn wrapper) | Codex | Yes | server.py |
| api.py (FastAPI app) | Codex | Yes | api.py |
| Health and status endpoints | Haiku | After | Endpoints |
| Test server starts | Haiku | After | Test |

**Opus 4.5 Prompt:**
```
Create Claude Code prompts for SparkQ Phase 3.1: FastAPI Server Setup

Context: FRD v7.5 Section 15.4 defines API endpoints. Server runs on localhost:8420.

Generate 2 Codex prompts (parallel):
1. server.py:
   - Uvicorn server wrapper
   - Start/stop functions
   - Lockfile handling (sparkq.lock)
   - Background auto-purge on startup
2. api.py:
   - FastAPI app
   - CORS for localhost
   - Mount static files for UI
   - Basic structure with routers

Then generate 2 Haiku prompts:
1. Health and status endpoints:
   - GET /api/health - returns {"status": "ok", "version": "0.1.0"}
   - GET /api/status - returns queue stats, active sessions/streams
2. Test server:
   - Server starts and responds to health check
   - Status returns valid data

Output format: Model, Task, Files, Prompt
```

### Phase 3.2: API Endpoints

| Task | Model | Parallel? | Output |
|------|-------|-----------|--------|
| Session endpoints | Codex | Yes | api.py additions |
| Stream endpoints | Codex | Yes | api.py additions |
| Task endpoints | Codex | Yes | api.py additions |
| Tool/script endpoints | Haiku | After | api.py additions |
| Test all endpoints | Haiku | After | Test cases |

**Opus 4.5 Prompt:**
```
Create Claude Code prompts for SparkQ Phase 3.2: API Endpoints

Context: FRD v7.5 Section 15.4 defines all endpoints.

Generate 3 Codex prompts (parallel):
1. Session endpoints:
   - GET /api/sessions - list all
   - POST /api/sessions - create (body: name, description)
   - PUT /api/sessions/<id> - update (end session)
2. Stream endpoints:
   - GET /api/streams - list all, optional ?session= filter
   - POST /api/streams - create (body: name, session_id, instructions)
   - PUT /api/streams/<id> - update (end stream)
3. Task endpoints:
   - GET /api/tasks - list with ?status=, ?stream= filters
   - GET /api/tasks/<id> - single task detail
   - POST /api/tasks - enqueue (body: tool_name, payload, stream_id, timeout)
   - POST /api/tasks/<id>/requeue - clone failed task

Then generate 2 Haiku prompts:
1. Tool and script endpoints:
   - GET /api/tools - list registered tools
   - GET /api/scripts - list indexed scripts
2. Test all endpoints:
   - CRUD operations work
   - Filters work
   - Error responses are correct

Output format: Model, Task, Files, Prompt
```

### Phase 3.3: CLI Run/Stop Integration

| Task | Model | Parallel? | Output |
|------|-------|-----------|--------|
| sparkq run (interactive) | Haiku | Yes | cli.py update |
| sparkq run --session | Haiku | Yes | cli.py update |
| sparkq stop | Haiku | Yes | cli.py update |
| sparkq reload | Haiku | After | cli.py update |
| Test run/stop | Haiku | After | Test |

**Opus 4.5 Prompt:**
```
Create Claude Code prompts for SparkQ Phase 3.3: CLI Run/Stop

Context: FRD v7.5 Section 14.1 defines run/stop behavior.

Generate 3 Haiku prompts (can run in parallel - different functions):
1. sparkq run (interactive):
   - Start server
   - List sessions with queued tasks, prompt selection
   - List streams in session, prompt selection
   - Start watcher for selected stream
   - Show stream instructions
2. sparkq run --session <name>:
   - Start server
   - Start watchers for ALL streams in session
   - Show each stream's instructions
3. sparkq stop:
   - Stop server
   - Stop all watchers
   - Clean shutdown

Then generate 1 Haiku prompt:
4. sparkq reload:
   - Reload sparkq.yml (tools, config)
   - Rebuild script index
   - No server restart needed

Output format: Model, Task, Files, Prompt
```

### Phase 3.4: Web UI

| Task | Model | Parallel? | Output |
|------|-------|-----------|--------|
| index.html (shell) | Codex | Yes | ui/index.html |
| style.css | Codex | Yes | ui/style.css |
| app.js (dashboard) | Codex | Yes | ui/app.js |
| Sessions/streams pages | Haiku | After | UI additions |
| Task list/detail pages | Haiku | After | UI additions |
| Enqueue form | Haiku | After | UI additions |
| Test UI | Haiku | After | Manual test |

**Opus 4.5 Prompt:**
```
Create Claude Code prompts for SparkQ Phase 3.4: Web UI

Context: FRD v7.5 Section 15 defines UI pages. Simple, functional, no frameworks.

Generate 3 Codex prompts (parallel):
1. index.html:
   - Single-page app shell
   - Navigation: Dashboard, Sessions, Streams, Tasks, Enqueue
   - Content area for dynamic loading
   - No frameworks - vanilla HTML
2. style.css:
   - Clean, minimal styling
   - Dark theme (dev tool aesthetic)
   - Table styling for lists
   - Status indicators (queued=blue, running=yellow, succeeded=green, failed=red)
   - Stale indicator (orange warning)
3. app.js (core):
   - Fetch wrapper for API calls
   - Router for page navigation
   - Dashboard: show stats, active sessions/streams

Then generate 3 Haiku prompts (sequential - build on each other):
1. Sessions/streams pages:
   - List sessions with create/end buttons
   - List streams with status, task counts
   - Create forms
2. Task list/detail:
   - Task list with filters (status, stream dropdown)
   - Stale indicator for running tasks past timeout
   - Click row to see detail
   - Detail: payload, result, stdout/stderr panels, timing
3. Enqueue form:
   - Tool dropdown (populated from /api/tools)
   - Stream dropdown (populated from /api/streams)
   - Payload textarea
   - Timeout override field
   - Submit button

Output format: Model, Task, Files, Prompt
```

### Phase 3 Completion Criteria

```bash
# All these should work after Phase 3:
sparkq run                                # Interactive mode
sparkq run --session api-v2               # Direct mode
sparkq stop                               # Stop everything
sparkq reload                             # Reload config

# Web UI at http://localhost:8420
# - Dashboard shows stats
# - Can create sessions/streams
# - Can view/filter tasks
# - Can enqueue tasks
# - Can see task detail with stdout/stderr
```

---

## Phase 4: Watcher + Full Worker Playbook

**Goal:** Bash watcher script, comprehensive Claude operating procedures

**Duration:** ~1-2 hours of Claude time

### Phase 4.1: Watcher Script

| Task | Model | Parallel? | Output |
|------|-------|-----------|--------|
| sparkq-watcher.sh | Codex | No | Bash script |
| Watcher integration with run | Haiku | After | cli.py update |
| Test watcher | Haiku | After | Manual test |

**Opus 4.5 Prompt:**
```
Create Claude Code prompts for SparkQ Phase 4.1: Watcher Script

Context: FRD v7.5 Section 13.3 contains the full watcher script.

Generate 1 Codex prompt:
sparkq-watcher.sh:
- Takes stream name as $1
- Lockfile check (/tmp/sparkq-<stream>.lock)
- FIFO pipe setup (/tmp/sparkq-<stream>-pipe)
- Done flag handling (/tmp/sparkq-<stream>-done)
- Main loop: 60s poll when idle, 120s when busy
- exec 3<>"$PIPE" for non-blocking writes
- Clean trap for lockfile removal on exit

Then generate 2 Haiku prompts:
1. Integrate watcher with sparkq run:
   - sparkq run starts watcher(s) as background process
   - sparkq stop kills watcher(s) by PID
   - Store PIDs for cleanup
2. Test watcher:
   - Watcher starts and creates lockfile
   - Second watcher refuses to start
   - Watcher wakes on done flag + queued task
   - Watcher cleans up on stop

Output format: Model, Task, Files, Prompt
```

### Phase 4.2: Timeout Enforcement

| Task | Model | Parallel? | Output |
|------|-------|-----------|--------|
| Stale detection logic | Haiku | Yes | storage.py addition |
| Auto-fail logic | Haiku | Yes | Background task |
| UI stale indicators | Haiku | After | UI update |
| Test timeout | Haiku | After | Test |

**Opus 4.5 Prompt:**
```
Create Claude Code prompts for SparkQ Phase 4.2: Timeout Enforcement

Context: FRD v7.5 Section 8.6 defines timeout behavior.

Generate 2 Haiku prompts (parallel):
1. Stale detection:
   - Add get_stale_tasks() to storage.py
   - Returns running tasks where now - started_at > timeout
   - Used by sparkq tasks --stale and UI
2. Auto-fail logic:
   - Background task that runs every 60 seconds
   - Finds tasks where now - started_at > 2 * timeout
   - Auto-fails with error: "Auto-failed: task exceeded 2x timeout..."
   - Integrate with server startup

Then generate 2 Haiku prompts (sequential):
1. UI stale indicators:
   - Yellow warning icon for stale (1x timeout)
   - Red indicator for auto-failed
   - Tooltip showing time elapsed
2. Test timeout:
   - Create task, manually set started_at to past
   - Verify stale detection finds it
   - Verify auto-fail triggers at 2x

Output format: Model, Task, Files, Prompt
```

### Phase 4.3: Full Worker Playbook

| Task | Model | Parallel? | Output |
|------|-------|-----------|--------|
| Complete WORKER_PLAYBOOK.md | Sonnet | No | Full playbook |
| Validate playbook | Haiku | After | Review |

**Opus 4.5 Prompt:**
```
Create Claude Code prompts for SparkQ Phase 4.3: Full Worker Playbook

Context: FRD v7.5 Section 25.3 contains the complete playbook specification.

Generate 1 Sonnet prompt (this needs reasoning about Claude behavior):
Create the full WORKER_PLAYBOOK.md with all sections from FRD 25.3:
1. Session Setup
2. Task Loop
3. Execution Patterns by Tool Type (run-bash, run-python, llm-haiku, llm-sonnet, delegate-codex)
4. Delegation Patterns (when Haiku vs Codex vs Sonnet)
5. Validation Patterns
6. Error Recovery
7. Edit-First Principle
8. Summary Generation (Haiku always generates)
9. Stream Context
10. Quick Reference

The playbook should be comprehensive but scannable.
Claude will reference this at the start of each worker session.

Then generate 1 Haiku prompt:
Validate playbook:
- All commands are correct
- All sections are present
- Examples are valid
- No placeholders or TODOs

Output format: Model, Task, Files, Prompt
```

### Phase 4 Completion Criteria

```bash
# Watcher works:
./sparkq-watcher.sh auth                  # Starts watcher
# Second terminal:
./sparkq-watcher.sh auth                  # ERROR: already running

# Timeout works:
sparkq tasks --stale                      # Shows stale tasks
# Auto-fail happens automatically for 2x timeout tasks

# Playbook exists:
cat sparkq/WORKER_PLAYBOOK.md             # Full playbook content
```

---

## Phase 5: Polish + Dogfooding

**Goal:** Script index, refinements, use SparkQ to finish SparkQ

**Duration:** ~2-3 hours of Claude time

### Phase 5.1: Script Index

| Task | Model | Parallel? | Output |
|------|-------|-----------|--------|
| index.py (script indexer) | Codex | No | index.py |
| Integrate with reload | Haiku | After | cli.py update |
| UI autocomplete | Haiku | After | UI update |
| Test index | Haiku | After | Test |

**Opus 4.5 Prompt:**
```
Create Claude Code prompts for SparkQ Phase 5.1: Script Index

Context: FRD v7.5 Section 11 defines script index behavior.

Generate 1 Codex prompt:
index.py:
- Scan directories from sparkq.yml script_dirs
- Parse top comment block (# key: value pairs)
- Extract: name, description, inputs, outputs, tags
- Build in-memory dict: {path: metadata}
- Expose: build_index(), get_index(), search_scripts(query)

Then generate 3 Haiku prompts:
1. Integrate with reload:
   - sparkq reload rebuilds script index
   - Index built on server startup
2. UI autocomplete:
   - Script path input with autocomplete
   - Dropdown shows matching scripts with descriptions
3. Test index:
   - Create test scripts with metadata
   - Verify index finds them
   - Verify search works

Output format: Model, Task, Files, Prompt
```

### Phase 5.2: Interactive Setup

| Task | Model | Parallel? | Output |
|------|-------|-----------|--------|
| Enhanced sparkq setup | Haiku | No | cli.py update |
| Config validation | Haiku | After | Validation |
| Test setup | Haiku | After | Test |

**Opus 4.5 Prompt:**
```
Create Claude Code prompts for SparkQ Phase 5.2: Interactive Setup

Context: FRD v7.5 Section 16.1 shows the setup flow.

Generate 2 Haiku prompts:
1. Enhanced sparkq setup:
   - Full interactive Q&A per FRD 16.1
   - Project name, repo path, PRD path
   - Script directories (add multiple)
   - Task class timeout defaults
   - Server port
   - Write sparkq.yml
   - Initialize database
2. Config validation:
   - Validate sparkq.yml on load
   - Check required fields
   - Check paths exist
   - Clear error messages

Then generate 1 Haiku prompt:
3. Test setup:
   - Run through setup flow
   - Verify config file created
   - Verify database initialized

Output format: Model, Task, Files, Prompt
```

### Phase 5.3: Error Handling & Edge Cases

| Task | Model | Parallel? | Output |
|------|-------|-----------|--------|
| CLI error messages | Haiku | Yes | cli.py updates |
| API error responses | Haiku | Yes | api.py updates |
| UI error display | Haiku | Yes | UI updates |
| Edge case tests | Haiku | After | Test cases |

**Opus 4.5 Prompt:**
```
Create Claude Code prompts for SparkQ Phase 5.3: Error Handling

Context: Good error messages make SparkQ usable.

Generate 3 Haiku prompts (parallel):
1. CLI error messages:
   - Consistent format: "Error: <message>"
   - Helpful suggestions where applicable
   - Exit codes: 0=success, 1=error
2. API error responses:
   - Consistent JSON: {"error": "<message>", "code": "<ERROR_CODE>"}
   - Appropriate HTTP status codes
   - Validation errors include field names
3. UI error display:
   - Toast notifications for errors
   - Form validation feedback
   - Network error handling

Then generate 1 Haiku prompt:
4. Edge case tests:
   - Empty database
   - Invalid task ID
   - Stream not found
   - Task already completed
   - Concurrent claim attempts

Output format: Model, Task, Files, Prompt
```

### Phase 5.4: Documentation

| Task | Model | Parallel? | Output |
|------|-------|-----------|--------|
| README.md | Codex | Yes | README.md |
| CLI --help text | Haiku | Yes | cli.py updates |
| API docs | Codex | Yes | API.md |
| Validate docs | Haiku | After | Review |

**Opus 4.5 Prompt:**
```
Create Claude Code prompts for SparkQ Phase 5.4: Documentation

Context: Documentation for humans using SparkQ.

Generate 2 Codex prompts (parallel):
1. README.md:
   - What is SparkQ
   - Quick start (setup, run, enqueue, claim)
   - CLI reference (brief)
   - Web UI overview
   - Troubleshooting
2. API.md:
   - All endpoints with request/response examples
   - Error codes
   - Authentication (none - localhost only)

Then generate 2 Haiku prompts:
1. CLI --help text:
   - Every command has helpful --help
   - Examples in help text
   - Consistent formatting
2. Validate docs:
   - All commands documented
   - Examples are correct
   - No broken links

Output format: Model, Task, Files, Prompt
```

### Phase 5.5: Dogfooding

| Task | Model | Parallel? | Output |
|------|-------|-----------|--------|
| Create SparkQ session | Human | No | Session setup |
| Queue polish tasks | Human | No | Tasks enqueued |
| Execute via SparkQ | Claude (via SparkQ) | Yes | Features completed |

**Opus 4.5 Prompt:**
```
Create Claude Code prompts for SparkQ Phase 5.5: Dogfooding

Context: Use SparkQ to finish SparkQ.

This is a META prompt - generate instructions for the human, not code prompts.

Instructions for dogfooding:
1. Start SparkQ: sparkq run --session sparkq-polish
2. Create streams:
   - sparkq stream create ui-polish --session sparkq-polish --instructions "UI improvements"
   - sparkq stream create docs --session sparkq-polish --instructions "Documentation"
   - sparkq stream create edge-cases --session sparkq-polish --instructions "Error handling"
3. Enqueue remaining tasks as SparkQ tasks
4. Open Claude terminals for each stream
5. Execute tasks via the worker protocol
6. Review results in Web UI

This validates the entire system works end-to-end.

Output format: Human instructions (not prompts)
```

### Phase 5 Completion Criteria

```bash
# Script index works:
sparkq reload                             # Rebuilds index
# UI shows script autocomplete

# Setup works:
sparkq setup                              # Full interactive flow

# Error handling:
sparkq claim --stream=nonexistent         # Clear error message
sparkq complete invalid_id --result '{}'  # Clear error message

# Documentation:
cat sparkq/README.md                      # Comprehensive
sparkq --help                             # Helpful
sparkq enqueue --help                     # With examples

# Dogfooding:
# Actually used SparkQ to build the last features
```

---

## Part 3: Execution Checklist

### Before Starting

- [ ] Clone/copy sparkq folder structure to target project
- [ ] Have FRD v7.5 open for reference
- [ ] Have this implementation plan open
- [ ] Set up Claude Code terminal
- [ ] Set up Codex CLI (if using)

### Phase Execution Pattern

For each phase:

1. **Opus 4.5 generates prompts** (run once, save outputs)
2. **Execute Codex prompts in parallel** (separate terminal or batch)
3. **Execute Haiku prompts** (validation, sequential where needed)
4. **Sonnet orchestrates integration** (if multi-file coordination needed)
5. **Test completion criteria**
6. **Commit to Git**

### Token Tracking

After each phase, note actual token usage:

| Phase | Opus | Sonnet | Haiku | Codex | Notes |
|-------|------|--------|-------|-------|-------|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |
| 4 | | | | | |
| 5 | | | | | |

---

## Part 4: Prompt Templates for Opus 4.5

These are the master prompts you'll give to Opus 4.5 to generate the actual implementation prompts.

### Master Prompt Template

```
You are generating Claude Code implementation prompts for SparkQ Phase [X.Y]: [Name]

Context:
- SparkQ is a dev-only task queue (see FRD v7.5)
- [Specific FRD sections relevant to this phase]

Token optimization rules:
- Codex: Use for boilerplate, types, schemas, tests, docs (separate budget)
- Haiku: Use for validation, simple logic, summaries (1x cost)
- Sonnet: Use only for complex integration (3x cost)
- Generate prompts that can run in PARALLEL where possible

For each prompt, output:
1. Model: [Codex|Haiku|Sonnet]
2. Task: [Brief description]
3. Files: [Output files]
4. Dependencies: [What must exist first]
5. Parallel: [Yes|No - can run with others]
6. Prompt: [Exact prompt text to give to that model]

Generate prompts for:
[List of tasks for this phase]
```

### Validation Prompt Template (for Haiku)

```
Validate the following SparkQ implementation:

Files to check:
- [list of files]

Validation criteria:
1. All files exist and are valid Python/Bash/HTML/CSS/JS
2. No syntax errors (run python -m py_compile, bash -n, etc.)
3. No placeholder text (TODO, FIXME, XXX, PLACEHOLDER)
4. Imports resolve correctly
5. [Phase-specific criteria]

Output:
- PASS: All validations passed
- FAIL: [List of failures with file and line]
```

---

## Summary

**Total estimated Claude cost: ~$2.55** (1.3% of $200 monthly budget)

**Model distribution:**
- Opus 4.5: 30K tokens (prompt engineering only)
- Sonnet: 170K tokens (orchestration)
- Haiku: 410K tokens (code gen, validation)
- Codex: 750K tokens (bulk code - separate budget)

**Key principles:**
1. Opus writes prompts, not code
2. Codex does bulk generation (free from Claude budget)
3. Haiku validates everything
4. Sonnet only for complex integration
5. Parallel execution where possible

**Next step:** Run Phase 1.1 prompts through Opus 4.5 to generate the actual Codex/Haiku prompts.
