# SparkQ Project Guidelines

## Overview

SparkQ is a single-user, local-first dev cockpit for orchestrating queues, LLMs, and scripts. This file contains project-wide guidelines for contributors and agents working on SparkQueue.

**Primary Reference**: See [`_build/FRD/sparkq_FRD-v9.0.md`](_build/FRD/sparkq_FRD-v9.0.md) for the authoritative Build Charter & Roadmap.

---

## Core Guardrails

1. **Single-user, local-first**: No auth, no tenancy, no billing, no multi-user features
2. **Simplicity bias**: Prefer SQLite, file-based storage, minimal infrastructure
3. **CLI-first design**: CLI is primary interface, Web UI is secondary
4. **No over-engineering**: Implement only what's explicitly needed
5. **Manual execution**: Claude-in-chat reviews and decides; keep manual control

---

## Error Handling Patterns

Storage layer raises domain errors from `sparkq/src/errors.py`:
- `ValidationError` - Bad inputs, constraint violations
- `NotFoundError` - Resource missing (queue, task, session)
- `ConflictError` - State collisions, duplicate operations
- All subclass `SparkQError`

API layer maps `SparkQError` → HTTP status codes:
- `ValidationError` → 400 Bad Request
- `NotFoundError` → 404 Not Found
- `ConflictError` → 409 Conflict
- Unhandled errors → 500 Internal Server Error

CLI layer catches exceptions, renders human-readable messages, exits with code 1.

**When adding new operations**:
- Raise domain errors in storage/business logic
- Avoid sprinkling `HTTPException`/`typer.Exit` in lower layers
- Keep error handling centralized and consistent

---

## Naming Conventions

- **"Queue"** is the primary term throughout code, docs, and UI
- Keep `--stream/-s` as backwards-compatible CLI alias only
- Prefer "queue" terminology everywhere for consistency
- Task statuses: `queued`, `running`, `succeeded`, `failed`
- Queue statuses: `active`, `ended`, (`archived` - pending implementation)

---

## Configuration & Constants

- Shared constants live in `sparkq/src/constants.py`
  - Timeouts (FAST_SCRIPT, MEDIUM_SCRIPT, LLM_LITE, LLM_HEAVY)
  - Stale multipliers (warning at 1×, auto-fail at 2×)
  - DB lock timeout
- Reuse constants instead of hardcoding numbers
- Default config location: `sparkq.yml` in project root
- Resolution order: `SPARKQ_CONFIG` env → CWD → repo root

---

## Stale Task Detection

- Tasks record `claimed_at` timestamp when claimed
- Stale detection runs against running tasks using `claimed_at` (fallback: `started_at`)
- Utility helpers in storage layer:
  - `get_stale_tasks()` - Find tasks exceeding timeout
  - `mark_stale_warning()` - Mark task with ⚠️ warning
  - `auto_fail_stale_tasks()` - Auto-fail tasks exceeding 2× timeout

---

## Testing Protocol

Before requesting user validation:
1. Implement feature/fix
2. Run automated tests (`pytest sparkq/tests/`)
3. Verify no regressions in existing features
4. Test error handling and edge cases
5. **Only then** request user validation for UX/visual aspects

See `.claude/playbooks/self-testing-protocol.md` for detailed procedures.

---

## Git Workflow

**Commit Frequency**:
- At least once per hour during active development
- Batch related changes into logical commits
- Don't commit after every single change
- Only commit when work reaches stable, testable state

**Safety Rules**:
- Never update git config without explicit request
- Never force push, hard reset, or skip hooks without explicit request
- Never commit secrets (.env, credentials.json)
- Check authorship before amending (`git log -1 --format='%an %ae'`)

**Commit Format**:
- Use HEREDOC for commit messages
- Follow existing style (see `git log`)
- Focus on "why" rather than "what"

---

## Model Selection

SparkQ uses intelligent model routing to minimize cost:
- **Haiku**: Simple searches, validation, log analysis (fast, cheap)
- **Codex**: Code generation from specs ($0 cost)
- **Sonnet**: Orchestration, reasoning, complex decisions

See Section 9.5 in FRD v9.0 for complete decision tree.

---

## Documentation Structure

- **FRD v9.0**: `_build/FRD/sparkq_FRD-v9.0.md` (Build Charter & Roadmap)
- **Backlog**: `_build/FRD/sparkq_FRD-v9.0-backlog.md` (Out of scope features)
- **Worker Playbook**: `sparkq/WORKER_PLAYBOOK.md` (Queue runner guide)
- **API Docs**: `sparkq/docs/API.md` (REST API reference)
- **Directory Context**:
  - `sparkq/CLAUDE.md` - SparkQ app-specific context
  - `__omni-dev/python-bootstrap/CLAUDE.md` - Bootstrap tool isolation

---

## What to Avoid

- ❌ Multi-tenant features or tenancy abstractions
- ❌ Multi-user auth, RBAC, teams, organizations
- ❌ Billing/subscription flows
- ❌ Distributed/clustered deployment as first-class features
- ❌ Over-engineering with unnecessary abstractions
- ❌ Refactoring code that isn't being changed
- ❌ Adding features not explicitly requested
- ❌ Referencing `python-bootstrap` in docs (one-time tool, not part of runtime)

---

## Key File Locations

- **CLI entry**: `sparkq.sh` (wrapper script)
- **Server**: `sparkq/src/server.py` (FastAPI/Uvicorn)
- **CLI commands**: `sparkq/src/cli.py` (Typer)
- **Storage**: `sparkq/src/storage.py` (SQLite operations)
- **Models**: `sparkq/src/models.py` (Pydantic/SQLAlchemy)
- **Errors**: `sparkq/src/errors.py` (Domain exceptions)
- **Constants**: `sparkq/src/constants.py` (Timeouts, multipliers)
- **Config**: `sparkq.yml` (Project configuration)
- **Database**: `sparkq/data/sparkq.db` (SQLite WAL mode)

---

## Quick Reference

**Start server**: `./sparkq.sh start` (background) or `./sparkq.sh run` (foreground)
**Stop server**: `./sparkq.sh stop`
**Run tests**: `pytest sparkq/tests/`
**Setup**: `./sparkq.sh setup` (interactive wizard)
**Teardown**: `./sparkq.sh teardown` (clean removal)

**See FRD v9.0 for complete command reference and architecture details.**
