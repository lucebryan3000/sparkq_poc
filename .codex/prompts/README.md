# SparkQueue Codex Prompt Patterns

Ready-to-paste prompts for the most common SparkQueue tasks. Drop draft outputs into `.codex/generated/<feature>/` before curating commits.

## Task queue operations (Storage + models)
Use when changing task lifecycle logic, SQL queries, or queue defaults.

```
You are working in SparkQueue (SQLite-backed task queue).
- Storage lives in sparkq/src/storage.py; use now_iso() for timestamps and keep mutations inside Storage methods.
- Task statuses: queued | running | succeeded | failed. Task IDs use gen_task_id().
- Pydantic enums/models live in sparkq/src/models.py; keep status and task_class values in sync.
- Auto-fail/auto-purge runners live in sparkq/src/server.py; prefer updating Storage helpers they call.
Task: {describe the change}
Return: a patch for Storage (and models if needed), plus a brief note on how to validate with existing tests.
```

## API endpoints (FastAPI)
Use when adding or modifying REST endpoints or response shapes.

```
You are editing sparkq/src/api.py (FastAPI).
- Reuse request/response models where possible; keep JSON error shape via _error_response.
- Normalize tasks with _serialize_task before returning to clients.
- Storage is the source of truth for persistence; ScriptIndex and ToolRegistry live in sparkq/src/index.py and sparkq/src/tools.py.
- Update sparkq/docs/API.md if endpoints change.
Task: {describe the new/updated endpoint}
Return: FastAPI route changes plus any needed Pydantic models, keeping status codes and field names consistent.
```

## CLI commands (Typer)
Use when creating or refining CLI commands in `sparkq/src/cli.py` or `sparkq.sh`.

```
You are editing the Typer CLI in sparkq/src/cli.py.
- Get storage via get_storage(); wrap failures with _handle_exception/_emit_error.
- Mirror API behavior and validations; reuse Storage helpers instead of duplicating SQL.
- Keep background server controls aligned with sparkq/src/server.py.
Task: {describe the CLI feature}
Return: Typer command updates plus any minimal test or usage notes.
```

## Config, scripts, and tool discovery
Use when adjusting how SparkQueue reads `sparkq.yml`, indexes scripts, or resolves tool timeouts.

```
You are updating script/tool discovery.
- ScriptIndex lives in sparkq/src/index.py; ToolRegistry in sparkq/src/tools.py.
- Config is YAML (`sparkq.yml`); prefer graceful fallbacks and minimal exceptions.
Task: {describe the change}
Return: focused updates plus notes on expected config keys and defaults.
```
