# SparkQ Test Patterns (v1)

Canonical snippets to keep tests consistent. Use these when filling gaps surfaced by `tools/test_index.py`.

## API Validation (pytest + FastAPI TestClient)
- Location: `sparkq/tests/integration/test_api_validation.py`.
- Pattern:
  - Use `client` fixture (isolated DB).
  - For POST/PUT endpoints: send minimal valid payload, assert `status_code`, required fields, and state transitions.
  - For GET list endpoints: create a resource, call list, assert presence and filtering.
  - For GET item endpoints: create resource, fetch by id, assert shape.
  - For “end/archive” style: create → mutate → assert status/flag.

## CLI Smoke (pytest + Typer CliRunner)
- Location: `sparkq/tests/integration/test_cli.py`.
- Pattern:
  - Use `cli_runner` fixture to set up config, scripts, storage.
  - Invoke command, assert `exit_code == 0`, expected stdout fragments, and storage state when applicable.
  - For commands creating IDs, regex-match the ID (see `SESSION_ID_RE`, `QUEUE_ID_RE`, `TASK_ID_RE`).

## Storage Unit (pytest)
- Location: `sparkq/tests/unit/test_storage.py`.
- Pattern:
  - Instantiate `Storage` with temp DB path.
  - For CRUD: create → read → update/end/archive/delete → assert result and DB state.
  - For error paths: attempt invalid operations and assert return/exception as existing tests do.

## Browser Page Smoke (Jest + Puppeteer)
- Location: `sparkq/tests/browser/test_<page>_page.test.js` or matrix-driven smoke test.
- Pattern:
  - Boot app (per existing setup), navigate to tab/page.
  - Assert primary selector renders, tab click works, no console errors, bundles detected.
  - Extend with page-specific assertions when needed (keep smoke in matrix).

## Prompt Usage
- The sync prompt `_build/prompts/sparkq-sync-tests.md` should direct Codex/Claude to:
  - Run the indexer conceptually.
  - For each missing surface, apply the relevant pattern above in the existing file.
  - Avoid new structures unless extending the pattern library.
