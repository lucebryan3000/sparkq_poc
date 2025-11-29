# SparkQ
Distributed Task Queue for Claude Sessions

## Quick Start
1) **Install/Setup** – from `sparkq/`, create a venv and install deps:
```bash
./setup.sh
source venv/bin/activate
```
2) **Initialize database** – generate `sparkq.yml`, bootstrap `sparkq.db`, and register your project:
```bash
sparkq setup
```
3) **Create session** – start a named workspace:
```bash
sparkq session create my-session
# Optional: sparkq stream create default --session my-session
```
4) **Start server** – launch the API/Web UI (binds to 127.0.0.1:8420):
```bash
sparkq run
```
5) **Create task** – enqueue and work a task through the FIFO lifecycle:
```bash
sparkq enqueue --stream [name] --tool [name]
sparkq peek --stream [name]
sparkq claim --stream [name]
sparkq complete --task-id [id] --summary '[result]'
```

## Features
- FIFO task queues
- Timeout enforcement (auto-fail on stale claims)
- Web UI dashboard
- REST API
- CLI for workers
- Script indexing (from configured `script_dirs`)
- Auto-purge of old tasks

## Architecture
- **CLI (Typer)** drives setup, session/stream management, and task lifecycle commands.
- **Storage (SQLite WAL)** lives in `sparkq.db`, providing projects, sessions, streams, and tasks with FIFO queries and status transitions.
- **Server (FastAPI + Uvicorn)** in `src/server.py`/`src/api.py` exposes REST endpoints, serves the static UI, and guards a `sparkq.lock` PID file.
- **Tool registry** loads from `sparkq.yml` to resolve tool metadata and task-class timeouts; **ScriptIndex** scans configured script directories for discoverability.
- **Background maintenance** threads purge old tasks and auto-fail stale running tasks.
- **Web UI** (served at `/ui`) consumes the REST API for dashboard, sessions, streams, tasks, and enqueue flows.

## Directory Structure
```
sparkq/
├── requirements.txt
├── setup.sh
├── teardown.sh
├── sparkq-watcher.sh
├── src/
│   ├── __main__.py        # CLI entrypoint
│   ├── api.py             # FastAPI routes
│   ├── cli.py             # sparkq CLI commands
│   ├── server.py          # Uvicorn wrapper + lockfile + background workers
│   ├── storage.py         # SQLite persistence
│   ├── tools.py           # Tool registry from sparkq.yml
│   └── index.py           # Script indexing helpers
├── ui/
│   ├── index.html
│   ├── app.js
│   └── style.css
└── test_integration.py
```

## Configuration (`sparkq.yml`)
Created via `sparkq setup`. Key fields:
```yaml
project:
  name: my-project
  repo_path: /path/to/repo
  prd_path: null
server:
  port: 8420
database:
  path: sparkq.db
  mode: wal
purge:
  older_than_days: 3
script_dirs:
  - scripts
task_classes:
  FAST_SCRIPT: { timeout: 30 }
  MEDIUM_SCRIPT: { timeout: 300 }
  LLM_LITE: { timeout: 300 }
  LLM_HEAVY: { timeout: 900 }
tools:
  run-bash:    { description: Execute a bash script,  task_class: MEDIUM_SCRIPT }
  run-python:  { description: Execute a python script, task_class: MEDIUM_SCRIPT }
  llm-haiku:   { description: Call Claude Haiku,       task_class: LLM_LITE }
  llm-sonnet:  { description: Call Claude Sonnet,      task_class: LLM_HEAVY }
```
Edit to add tool metadata or override timeouts, then `sparkq reload` to refresh the registry.

## CLI Commands
- `sparkq setup` – interactive config + DB init.
- `sparkq run|stop|status` – control the server (binds to 127.0.0.1:8420) and manage `sparkq.lock`.
- `sparkq reload` – reload tools/timeouts from `sparkq.yml`.
- `sparkq session create|list|end` – manage work sessions.
- `sparkq stream create|list|end` – manage streams within sessions.
- `sparkq enqueue` – queue a task with `--stream`, `--tool`, optional `--task-class/--timeout/--prompt-file/--metadata`.
- `sparkq peek` / `sparkq claim` / `sparkq complete` / `sparkq fail` – inspect, claim, and finish tasks.
- `sparkq tasks` – list tasks with filters; `sparkq requeue` – clone failed/succeeded tasks.
- `sparkq purge` – placeholder for manual purge (auto-purge already runs in server).

## Web UI
- Available after `sparkq run` at `http://127.0.0.1:8420/ui/`.
- Tabs for dashboard, sessions, streams, tasks, and enqueue; polls `/health`, `/stats`, `/api/*`.
- Good for monitoring queue health and manual task/stream checks while workers use the CLI or API.

## API Documentation
- REST endpoints live under `/api/*` (FastAPI). See `API.md` for full route and payload details.
- Interactive docs are available when the server is running at `http://127.0.0.1:8420/docs`.

## Playbooks
- Worker runbooks and operational guidance: see `WORKER_PLAYBOOK.md`.

## Troubleshooting
- `sparkq.yml not found` – run `sparkq setup` from the project root to generate config and DB.
- `Stream '<name>' not found` when enqueuing – create it first via `sparkq stream create <name> --session <session>`.
- `Error: SparkQ server already running` – stop/remove stale `sparkq.lock` via `sparkq stop` before restarting.
- Port 8420 in use – stop the conflicting process; server is pinned to 127.0.0.1:8420.
- Tasks stuck in `running` – they auto-fail after 2× timeout; you can also fail/requeue via CLI.
