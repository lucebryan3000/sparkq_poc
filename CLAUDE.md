# SparkQ Contributor Notes

## Error handling
- Storage layer raises domain errors from `src/errors.py`:
  - `ValidationError` for bad inputs, `NotFoundError` when a resource is missing, `ConflictError` for state collisions. All subclass `SparkQError`.
- API layer maps `SparkQError` to HTTP status codes (400/404/409) via a shared handler; unhandled errors fall through to the generic 500 handler.
- CLI catches exceptions, renders a human message, and exits with code 1; domain errors propagate unchanged so the API/handlers stay authoritative.
- When adding new operations, raise the domain errors in storage/business logic; avoid sprinkling `HTTPException`/`typer.Exit` in lower layers.

## Naming
- "Queue" is the primary term. Keep `--stream/-s` only as a backwards-compatible alias in the CLI; prefer queue in code, docs, and UI.

## Defaults and timeouts
- Shared constants live in `src/constants.py` (timeouts, stale multipliers, DB lock timeout). Reuse them instead of hardcoding numbers.

## Stale tasks
- Tasks now record `claimed_at`; stale detection runs against running tasks using `claimed_at` (or `started_at` fallback). Utility helpers: `get_stale_tasks`, `mark_stale_warning`, and `auto_fail_stale_tasks`.
