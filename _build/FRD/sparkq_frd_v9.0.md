# SparkQ — Functional Requirements Document (FRD) v9.0

> **Status**: Production-aligned specification post Phase 20.4 (feature complete for intended scope; minor gaps/decisions noted)
> **Audience**: Bryan + orchestration agents (Sonnet/Codex/Haiku)
> **Purpose**: Authoritative map of current system state, guardrails, and deferred work; foundation for v1.1 roadmap

---

## Executive Summary

SparkQ Phase 20.4 is **feature complete for its intended scope**, with a few minor decisions/gaps noted below. This is a single-user, local-first dev cockpit built on SQLite, FastAPI, and Typer. The system is production-ready for its intended scope: queue management, task tracking, and manual execution via Claude-in-chat. Phases 3 and 4 (Codex session wiring, approval workflows) remain deferred and optional unless explicitly re-scoped.

---

## 1. Core Purpose

**One sentence:** Queue work, walk away, review results later.

**Definition:** A local task queue for your dev machine that coordinates Bash scripts, Python scripts, and LLM calls without manual babysitting. Self-contained (copy into project, use, delete when done).

**What It Does:**
- Stores tasks in SQLite (WAL mode) with FIFO per-queue discipline
- Provides CLI (primary) and Web UI (secondary) for queue management
- Runs `queue_runner.py` to stream prompts to Claude-in-chat for manual execution
- Tracks stale tasks, auto-fails after timeout, auto-purges old results
- Maintains session and work context across a queue session

---

## 2. What SparkQ Is NOT

- Not a production system (no HA, no cluster, no redundancy)
- Not multi-user or multi-tenant
- Not a replacement for CI/CD or workflow engines (no DAGs, no branching logic)
- Not a hosted service or SaaS platform
- Not an automated execution platform (Claude-in-chat is manual; no full automation)
- Not distributed or cloud-native

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    SparkQ Server                         │
│  - FastAPI/Uvicorn on localhost:5005 (configurable)    │
│  - SQLite database (WAL mode)                           │
│  - Web UI at /ui                                        │
│  - REST API at /api                                     │
│  - Auto-purge (background) + stale detection            │
│  - Lockfile-based queue_runner coordination             │
└─────────────────────────────────────────────────────────┘
                         │
                  HTTP API (polling)
                         │
┌─────────────────────────────────────────────────────────┐
│              queue_runner.py (per queue)                │
│  - Polls queue via API (30s default interval)          │
│  - Streams task prompts to stdout                       │
│  - Displays queue instructions at session start         │
│  - Lockfile (/tmp/sparkq-runner-<queue>.lock)         │
│  - Modes: --once, --run (default), --watch             │
└─────────────────────────────────────────────────────────┘
                         │
                 task_complete.py
                         │
┌─────────────────────────────────────────────────────────┐
│            Claude-in-chat (Manual Execution)           │
│  - Reads streamed task prompts                         │
│  - Executes using available tools                      │
│  - Marks tasks complete via task_complete.py           │
│  - Maintains context across same-session tasks         │
└─────────────────────────────────────────────────────────┘
```

**Key Design Decisions:**
- Manual, not automated: Claude decides what to do, when to do it
- Local-first: no cloud dependencies, everything in SQLite + file system
- FIFO per queue: tasks processed in order
- Polling, not push: queue_runner pulls on interval (resilient to outages)
- Lockfile-based coordination: prevents duplicate queue_runner instances

---

## 4. Guardrails (Guidance, Not Choke Points)

These are design guardrails that preserve the system's intent:

1. **Single-user, local-first**: No auth, no tenancy, no billing, no SSO. No distributed/cluster targets.
2. **Simplicity bias**: Prefer file-based storage, minimal infrastructure, good-enough-for-one-power-user.
3. **Backward compatibility**: Opt-in features when expanding; don't break existing workflows.
4. **FRD governs scope**: Ideas beyond this FRD are marked **future** or **out-of-scope** until explicitly accepted.
5. **Creative latitude within bounds**: Pragmatic, scoped additions are OK; avoid big architectural changes without discussion.

---

## 5. Data Model

### Projects
- Unique name per project (one SparkQ per repo)
- Configured via `sparkq.yml` (host, port, database path, timeouts, etc.)
- One SQLite database per project

### Sessions
- Named work sessions (e.g., "feature-x", "bugfix-2024-12-01")
- Track work context and task grouping
- Can be ended to close the session

### Queues
- Unique name (globally scoped, not per-session)
- FIFO task discipline
- Instructions: user-provided context for workers executing tasks
- Status: storage/API support `archived`; models enum currently `active|ended`; CLI/UI do not expose archive (decision pending)
- Support archive/unarchive operations (API works; CLI/UI exposure pending decision)

### Tasks
- Status: `queued`, `running`, `succeeded`, `failed`
- Claim/execute via workers
- Track `claimed_at`, `started_at`, stale warnings, auto-fail timeouts
- Timeout classes: FAST_SCRIPT (30s), MEDIUM_SCRIPT (300s), LLM_LITE (300s), LLM_HEAVY (900s)
- Stale multipliers: warning at 1× timeout, auto-fail at 2× timeout

### Supporting Tables
- `prompts`: Task prompt text
- `tools`: Available tools for task execution
- `task_classes`: Timeout and behavior configuration
- `config`: DB-backed configuration (fallback if sparkq.yml missing)

---

## 6. Lifecycle

### Full Cycle
```
Copy into project → sparkq setup → Use during dev → sparkq teardown
```

### Phase Details

**Setup** (`sparkq setup`)
- ✅ **Complete (100%)**
- Interactive prompts for project info, script directories, timeouts
- Generates `sparkq.yml` with full configuration
- Creates database and required tables
- No silent defaults; all settings explicitly confirmed

**Usage**
- ✅ **Complete**
- CLI: enqueue, claim, complete, fail, list, filter
- Web UI: dashboard, queue view, task detail, status monitoring
- queue_runner: poll and stream tasks to Claude-in-chat
- Manual execution: user marks tasks done via `task_complete.py` or `./sparkq.sh complete`

**Teardown** (`sparkq teardown`)
- ✅ **Complete (100%)**
- Clean removal of all SparkQueue artifacts
- Interactive confirmation (two-stage: core removal + optional venv)
- `--force` flag for automation (skips prompts, removes venv)
- `--help` shows what will be deleted
- Idempotent: safe to run multiple times
- Removes: `sparkq/data/sparkq.db*`, `sparkq.yml`, `sparkq.lock`, `sparkq/logs/`, optional `.venv/`

**Auto-Features**
- ✅ Auto-purge: Completed tasks auto-deleted after 3 days (configurable)
- ✅ Stale detection: Running tasks marked as warned or auto-failed based on timeout
- ✅ Lock files: Prevents duplicate queue_runner instances per queue

---

## 7. CLI / API / UI Status

### CLI (Primary Interface)
- ✅ **Complete**
- Commands: `setup`, `teardown`, `start`, `stop`, `restart`, `run`, `session`, `queue`, `enqueue`, `claim`, `complete`, `fail`, `tasks`, `task`, `purge`, `reload`
- Archive/unarchive supported via API; CLI exposure pending
- Typer-based with inline help and type hints

### REST API
- ✅ **Complete (95%)**
- Endpoints for sessions, queues, tasks, tools
- Archive/unarchive implemented in storage + API
- Pagination and filtering support
- Interactive docs at `/docs`
- Exception handling maps domain errors → HTTP status (400/404/409)

### Web UI
- ✅ **Complete (95%)**
- Dashboard at `/` with queue overview
- Task list with filtering and sorting
- Visual indicators: ⚠️ stale-warned, 🔴 auto-failed, 💀 timeout
- Light/dark mode support
- Real-time refresh on task updates

### Missing / Pending Decisions
- Archive/unarchive enum in `QueueStatus`: currently implemented in storage; needs `QueueStatus.archived` enum entry
- Archive/unarchive CLI commands: API and storage ready; needs CLI wrapper and UI button
- **Decision**: Expose archive in CLI/UI, or leave as API-only?

---

## 8. Script Index

- ✅ **Complete (file-based)**
- Metadata parsing: reads comment headers from scripts (name, description, inputs, outputs, tags, timeout, task_class)
- In-memory index: loaded at startup, refreshed via `sparkq reload`
- No database table (design decision: keep scripts as source of truth)
- Supports `sparkq scripts` command to list and discover scripts

---

## 9. Worker Model (queue_runner.py)

- ✅ **Complete (95%)**
- Polling interval: 30 seconds (configurable)
- Modes: `--once` (one poll cycle), `--run` (infinite loop), `--watch` (with status updates)
- Streaming: writes prompts to stdout for Claude-in-chat
- Lockfile: `/tmp/sparkq-runner-<queue>.lock` prevents duplicate instances
- Worker ID: `worker-{hostname}-{queue_name}` for stable tracking
- Execution: manual (Claude reviews and decides)
- Documentation: WORKER_PLAYBOOK.md (comprehensive operational guide)

**Missing:**
- ❌ Full automation (by design; kept manual)
- ❌ Auto-restart after failure (manual intervention required)
- ❌ FIFO communication protocol (uses polling + streaming)

---

## 10. Task Execution Model

### Task Classes & Timeouts
- **FAST_SCRIPT**: 30 seconds (quick Bash operations)
- **MEDIUM_SCRIPT**: 300 seconds (normal operations)
- **LLM_LITE**: 300 seconds (quick LLM calls)
- **LLM_HEAVY**: 900 seconds (heavy Codex/analysis work)

### Stale Detection
- **Warning**: Task marked `stale_warned` after 1× timeout
- **Auto-fail**: Task auto-failed after 2× timeout (no recovery)
- **Tracking**: Uses `claimed_at` timestamp (fallback: `started_at`)

### Failure Handling
- ✅ Auto-fail for stale tasks
- ✅ Manual fail via CLI
- ✅ Requeue to move failed tasks back to queued
- ❌ Automated recovery loops (manual intervention required)

---

## 11. Configuration

### sparkq.yml
- Host and port (default: 0.0.0.0:5005)
- Database path (default: `sparkq/data/sparkq.db`)
- Purge age (default: 3 days)
- queue_runner poll interval (default: 30s)
- Auto-fail interval (default: 30s)
- Environment mode: dev/test (cache-busting on), prod (production caching)

### Defaults
- All defaults are sensible for single-user dev use
- Overridable via environment variables and command flags
- Interactive setup captures all config options

### Auto-Generated Config Path
- Resolution order: `SPARKQ_CONFIG` env → CWD `sparkq.yml` → repo root `sparkq.yml`
- Relative paths resolve from config file location

---

## 12. Testing & Validation

- ✅ Unit tests for core functions (storage, CLI, models)
- ✅ Dev caching tests for UI asset freshness
- ⚠️ E2E tests present but not comprehensive for all scenarios
- Test command: `pytest sparkq/tests/` or `make test`

---

## 13. What's Complete (Phase 20.4)

✅ **Core system features:**
- SQLite with WAL mode
- FastAPI/Uvicorn server
- Typer CLI with 20+ commands
- Web UI with dashboard and task detail views
- queue_runner with lockfile coordination
- Task tracking, queuing, claiming, completion
- Auto-purge and stale detection
- Setup and teardown workflows

✅ **Documentation:**
- WORKER_PLAYBOOK.md (826 lines, comprehensive)
- API reference
- CLI help and inline documentation
- Architecture documentation
- Bootstrap setup guide

✅ **Visual indicators:**
- Stale-warned (⚠️)
- Auto-failed (🔴)
- Timeout/error (💀)
- Light/dark mode

---

## 14. What's Deferred (Not Phase 20.4)

### Phase 3: Codex Session Wiring (Executable once scoped in v9+ prompts)
- Persistent Codex session storage
- Codex API integration
- Session resume capability
- Command execution tracking

**Status**: Design available; not implemented. Executable if prompted under v9+ with explicit scope.

### Phase 4: Approval Workflow (Executable once scoped in v9+ prompts)
- Approval gating (pending/approved/rejected)
- Queue modes: strict vs relaxed
- Bounded test/fix cycles (`max_test_fix_cycles`)
- Review artifact storage (`_build/reviews/`)
- Haiku + Codex test/fix automation

**Status**: Design available; not implemented. Executable if prompted under v9+ with explicit scope.

---

## 15. Known Gaps & Pending Decisions

1. **Archive enum/CLI/UI alignment**
   - Archive/unarchive work in storage + API
   - `QueueStatus` enum missing `"archived"` entry
   - CLI/UI do not expose archive commands
   - **Decision needed**: Expose in CLI/UI, or document as API-only?

2. **Wording alignment**
   - Some docs mention "distributed task queue"
   - Guardrail is single-user/local-first
   - **Action**: Update public-facing docs (README, ARCHITECTURE, etc.) to emphasize local-first

3. **Script index persistence**
   - Index is file-based and in-memory (no DB table)
   - Design decision: keep scripts as source of truth
   - **Clarification**: This is intentional; no action needed

4. **Interactive setup**
   - Currently fully interactive with `typer.prompt()`
   - ✅ Complete and working

5. **Formal teardown script**
   - ✅ Implemented in Phase 20.4
   - `sparkq teardown` command fully functional
   - Integrated into `sparkq.sh` wrapper

---

## 16. Roadmap & Implementation Phases

### Planning Phases (Pre-Execution)

#### Phase 1: Preflight & Planning
**Status**: ⏳ Planned (not yet executed)

**Deliverables:**
- `_build/planning/Phase-1-Preflight-Snapshot.md` — Current state of repo, SQLite schema, code patterns, existing implementations
- `_build/planning/Phase-1-Implementation-Plan.md` — Repo-specific plan, assumptions validated, corrections to prompt framework

**Scope**: Understand current reality, validate assumptions, prepare for Phase 2

---

#### Phase 2: Charter Application & Core Wiring (Design)
**Status**: ⏳ Planned (not yet executed)

**Deliverables:**
- `_build/planning/Phase-2-Charter-Draft.md` — Finalized Charter location, structure, heading outline, guardrails
- `_build/planning/Phase-2-Data-Model-Design.md` — Core queue/task model extensions, SQLite schema changes (design-only, no migrations)

**Scope**: Design-level work; prepare data structures for Phase 3 behavior wiring; no implementation

---

### Implementation Phases (Post-Planning)

#### Phase 3: Codex Session Wiring
**Status**: ⏳ Deferred (reference design available in Prompt-2)

**Scope**: Persistent Codex session storage, resume capability, command execution tracking

---

#### Phase 4: Approval Workflow
**Status**: ⏳ Deferred (reference design available in Prompt-4)

**Scope**: Approval gating, queue modes (strict/relaxed), bounded test/fix cycles, review artifacts

---

### v1.0 Release (Current - Stable)
- ✅ Phase 20.4 feature complete for intended scope
- Ready for production use within single-user dev scope
- FRD v9.0 finalizes specification as authoritative reference

### v1.1+ Roadmap (Conditional)
- **Phase 1/2 (Planning)**: Execute planning phases to scope Phase 3/4
- **Phase 3 (Optional)**: Codex session wiring (only if explicitly scoped via Phase 1/2)
- **Phase 4 (Optional)**: Approval workflows (only if explicitly scoped via Phase 1/2)
- **Polish items**: Archive enum/CLI/UI alignment, wording fixes, additional testing

---

## 17. Decision Checkpoints for v9.0 Finalization

Before publishing v9.0 as authoritative:

1. ✅ **Confirm teardown script completion**: Phase 20.4 done; update Lifecycle to 100%
2. ✅ **Confirm interactive setup**: Code uses `typer.prompt()`; mark complete
3. ⚠️ **Archive enum/CLI decision**: Should archive be exposed in CLI/UI or remain API-only?
4. ⚠️ **Wording audit**: Update docs to remove "distributed" phrasing; emphasize single-user/local-first
5. ⚠️ **Confirm script index remains file-based**: No DB table; by design
6. ⚠️ **Phase 3/4 status**: Keep as reference-only unless re-scoped into v1.1

---

## 18. Non-Goals (Out of Scope)

- Multi-user authentication, tenancy, billing
- Distributed or clustered deployments
- Automated approval/test loops (unless explicitly re-scoped)
- Cloud-native infrastructure or SaaS platform
- Full workflow DAGs or complex branching logic
- CI/CD replacement

---

## 19. Summary

**Phase 20.4 is complete and production-ready within its scope** (single-user, local-first dev cockpit).

v9.0 serves as the authoritative specification for:
- Current system capabilities (what's done)
- Deferred work (Phase 3/4, pending decisions)
- Guardrails that preserve the design intent
- Decisions needed to finalize the roadmap

Use this FRD as the foundation for v1.1 roadmap planning and as the source of truth for orchestration agents preparing new feature work.

---

## Appendix A: Key Documentation by Purpose

### For New Users
- **[README.md](../../README.md)** — Quick-start guide with installation, common commands, and troubleshooting
- **[sparkq/docs/SPARKQ_README.md](../../sparkq/docs/SPARKQ_README.md)** — Complete SparkQ user guide with workflows and examples
- **[python-bootstrap/README.md](../../python-bootstrap/README.md)** — Virtual environment setup and bootstrap configuration

### For Developers / Contributors
- **[CLAUDE.md](../../CLAUDE.md)** — Project guidelines, error handling patterns, naming conventions, defaults
- **[.claude/CLAUDE.md](../../.claude/CLAUDE.md)** — Claude Code configuration, development workflow, intelligent model selection
- **[ARCHITECTURE.md](../../ARCHITECTURE.md)** — System design, component overview, data flow (if exists; check project)

### For API Integration
- **[sparkq/docs/API.md](../../sparkq/docs/API.md)** — REST API reference with endpoints, status codes, pagination, filtering
- **[sparkq/docs/UI_README.md](../../sparkq/docs/UI_README.md)** — Web UI features, dashboard overview, real-time updates
- **[sparkq/docs/UI_CORE_README.md](../../sparkq/docs/UI_CORE_README.md)** — UI component architecture and styling

### For Operational Use
- **[sparkq/WORKER_PLAYBOOK.md](../../sparkq/WORKER_PLAYBOOK.md)** — Comprehensive guide for Claude workers executing queue tasks (826 lines, essential)
- **[README.md - Background Service Management](../../README.md#background-service-management)** — Running SparkQ as a daemon

### For Requirements & Planning
- **[_build/FRD/sparkq_frd_v8.0.md](../../_build/FRD/sparkq_frd_v8.0.md)** — Previous specification (v8.0, Phase 20.4 aligned)
- **[_build/FRD/sparkq_frd_v9.0.md](../../_build/FRD/sparkq_frd_v9.0.md)** — Current authoritative specification (this document)

### For Feature Implementation
- **[_build/prompts/Feature-AIModels-Prompt-1.md](../../_build/prompts/Feature-AIModels-Prompt-1.md)** — Specification validation protocol
- **[_build/prompts/Feature-AIModels-Prompt-2.md](../../_build/prompts/Feature-AIModels-Prompt-2.md)** — Charter application and core wiring (design)
- **[_build/prompts/Feature-AIModels-Prompt-3.md](../../_build/prompts/Feature-AIModels-Prompt-3.md)** — Superseded Codex session/prompt engine plan (reference only)
- **[_build/prompts/Feature-AIModels-Prompt-4.md](../../_build/prompts/Feature-AIModels-Prompt-4.md)** — Approval workflow design (Phase 4, deferred reference)

---

## Appendix B: Project Structure

**Key directories:**
- `sparkq/src/` — Core application (API, CLI, storage, server, tools)
- `sparkq/ui/` — Web dashboard (HTML, JS, CSS, static assets)
- `sparkq/tests/` — Unit and E2E test suites
- `sparkq/docs/` — User and API documentation
- `sparkq/scripts/` — Example and utility scripts
- `sparkq/data/` — Runtime data (SQLite database)
- `sparkq/logs/` — Runtime logs (sparkq.log)
- `_build/FRD/` — Requirements documents (v8.0, v9.0)
- `_build/prompts/` — Codex/orchestration prompts (4+ feature prompts)
- `python-bootstrap/` — Virtual environment setup automation
- `.claude/` — Claude Code configuration and commands

**Key files:**
- `sparkq.yml` — Project configuration (host, port, database path, timeouts)
- `sparkq.sh` — CLI wrapper script (primary entry point)
- `sparkq/teardown.sh` — Clean removal script for artifacts (Phase 20.4)
- `sparkq/queue_runner.py` — Worker polling and prompt streaming
- `sparkq/task_complete.py` — Task completion helper for Claude
- `WORKER_PLAYBOOK.md` — Operational guide (826 lines, comprehensive)
- `README.md` — Root quick-start and troubleshooting
- `CLAUDE.md` — Developer guidelines and error handling
- `ARCHITECTURE.md` — System design and component overview (if available)

---

## Appendix C: Command Reference (Quick Lookup)

### Server Management
```bash
./sparkq.sh start                 # Start in background
./sparkq.sh stop                  # Stop background server
./sparkq.sh restart               # Stop, wait 5s, start
./sparkq.sh run                   # Start in foreground
./sparkq.sh status                # Check if running
./sparkq.sh setup                 # Interactive setup (first run)
./sparkq.sh teardown              # Clean removal of all artifacts
```

### Queue Operations
```bash
./sparkq.sh queue create <name>   # Create a named queue
./sparkq.sh queue list            # List all queues
./sparkq.sh queue archive <id>    # Archive a queue (API-only for now)
./sparkq.sh session create <name> # Create a session
./sparkq.sh session list          # List sessions
./sparkq.sh session end <id>      # End a session
```

### Task Operations
```bash
./sparkq.sh enqueue               # Enqueue a new task
./sparkq.sh peek                  # See next task in queue
./sparkq.sh claim                 # Claim a task
./sparkq.sh complete              # Mark task as complete
./sparkq.sh fail                  # Mark task as failed
./sparkq.sh requeue               # Move failed task back to queue
./sparkq.sh tasks                 # List tasks with filters
./sparkq.sh task <id>             # Show task detail
./sparkq.sh purge                 # Delete old succeeded/failed tasks
```

### Configuration & Utilities
```bash
./sparkq.sh reload                # Reload config and script index
./sparkq.sh config-export         # Export DB config to YAML
./sparkq.sh scripts               # List and discover scripts
./sparkq.sh run --env dev         # Start with cache-busting (dev mode)
./sparkq.sh run --env prod        # Start with production caching
```

### Worker & Execution
```bash
./sparkq/queue_runner.py --queue <name> --run
                                  # Stream tasks from queue to stdout
./sparkq/queue_runner.py --queue <name> --once
                                  # Single poll cycle
./sparkq/queue_runner.py --queue <name> --watch
                                  # Stream with status updates
python sparkq/task_complete.py    # Mark task done (helper for Claude)
```
