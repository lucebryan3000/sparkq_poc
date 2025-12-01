# SparkQ Application Context

This is the **main SparkQueue application directory**. When working here, you are modifying the production SparkQ system.

---

## What This Is

- The core SparkQ application (queue management, task tracking, web UI)
- Production code that runs as a service via `./sparkq.sh`
- SQLite + FastAPI + Typer CLI architecture
- Single-user, local-first dev cockpit

---

## What This Is NOT

- **NOT** a bootstrap tool or one-time utility
- **NOT** dependent on any external bootstrap scripts
- **NOT** part of `__omni-dev/` tooling
- Uses standard Python venv after initial setup

---

## Key Guidelines When Working Here

### Code Changes
- Follow patterns documented in parent `../CLAUDE.md`
- Respect SparkQ's single-user/local-first guardrails
- Test changes before committing (see Self-Testing Protocol in FRD)
- Never reference `python-bootstrap` or bootstrap scripts in code/docs
- Changes here affect the running SparkQ system

### Documentation
- Update FRD v9.0 (`../_build/FRD/sparkq_FRD-v9.0.md`) for significant changes
- Keep API docs in `docs/API.md` current
- Update `WORKER_PLAYBOOK.md` for queue runner changes

### Testing
- Run `pytest sparkq/tests/` before committing
- Functional testing required before requesting user validation
- Only ask user to verify UX/visual aspects after automated tests pass

---

## Key Modules

- **`src/`** — Core application code
  - `api/` — FastAPI REST endpoints
  - `cli/` — Typer CLI commands
  - `storage/` — SQLite data layer
  - `server/` — Uvicorn server management
  - `models/` — Pydantic/SQLAlchemy models
  - `errors.py` — Domain error definitions

- **`ui/`** — Web dashboard
  - Bootstrap-based HTML/CSS/JS
  - Light/dark mode support
  - Real-time task status updates

- **`tests/`** — Test suites
  - `unit/` — Unit tests for core functions
  - `integration/` — Integration tests
  - `browser/` — UI/browser tests

- **`docs/`** — Documentation
  - `API.md` — REST API reference
  - `SPARKQ_README.md` — User guide
  - `UI_README.md` — Web UI documentation

- **`scripts/`** — Example task scripts
  - Script index metadata in comment headers
  - Used for demonstration and testing

---

## File Naming Conventions

- Python modules: `snake_case.py`
- Classes: `PascalCase`
- Functions: `snake_case`
- Constants: `UPPER_SNAKE_CASE`
- Test files: `test_*.py`

---

## Error Handling

Storage layer raises domain errors from `src/errors.py`:
- `ValidationError` for bad inputs
- `NotFoundError` when resource is missing
- `ConflictError` for state collisions
- All subclass `SparkQError`

API layer maps `SparkQError` → HTTP status codes (400/404/409)

CLI catches exceptions, renders human messages, exits with code 1

---

## Naming Conventions

- "Queue" is the primary term
- Keep `--stream/-s` as backwards-compatible CLI alias only
- Prefer "queue" in code, docs, and UI

---

## Reference Documents

- **FRD v9.0**: `../_build/FRD/sparkq_FRD-v9.0.md` — Authoritative specification
- **Root CLAUDE.md**: `../CLAUDE.md` — Project-wide guidelines
- **Config CLAUDE.md**: `../.claude/CLAUDE.md` — Claude Code configuration
- **Worker Playbook**: `WORKER_PLAYBOOK.md` — Queue runner operational guide

---

## Architecture Boundary

This directory (`sparkq/`) contains the entire SparkQ application. Nothing outside this directory (except configuration files like `../sparkq.yml` and wrapper scripts like `../sparkq.sh`) is part of the runtime system.

External tools like `__omni-dev/python-bootstrap/` are separate utilities, not part of SparkQ.
