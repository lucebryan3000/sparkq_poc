# SparkQ Test Contract

This contract defines the invariant SparkQ test coverage rules. Any new public surface must satisfy the matrix below; CI may block merges via `tools/test_index.py --fail-on-missing`.

## Coverage Matrix
- **API**: Every FastAPI route in `src/api.py` has:
  - Unit/integration coverage in `sparkq/tests/integration/test_api_validation.py` (minimal validation for new routes is acceptable).
  - Additional route-specific files may exist but do not replace the baseline entry above.
- **CLI**: Every Typer command in `src/cli.py` (including sub-commands) is exercised in `sparkq/tests/integration/test_cli.py`.
- **Storage**: Every public `Storage` method (non-underscore) in `src/storage.py` has coverage in `sparkq/tests/unit/test_storage.py` (happy path + basic error/edge expectations per method type).
- **UI pages**: Every page registered under `ui/pages/*.js` (`window.Pages.<Name>` or filename) is covered by a browser test:
  - Primary: `sparkq/tests/browser/test_<page>_page.test.js` or an entry in the shared page matrix-driven smoke test.
  - Optional: Puppeteer/Jest e2e add-ons may extend coverage but must not replace the primary mapping.

## Per-Surface Rules
- **API**:
  - New `/api/<resource>` endpoints get a minimal validation test in `integration/test_api_validation.py`.
  - Health/stats-style endpoints should be asserted for status + payload shape.
  - CRUD endpoints should assert creation/list/get/update/end/archive semantics where applicable.
- **CLI**:
  - Any new command registered on the root Typer app or sub-typers (`session`, `queue`, `scripts`, etc.) must appear in `integration/test_cli.py`.
  - Commands that mutate storage should assert both CLI output and resulting storage state.
- **Storage**:
  - New public methods require at least one unit test; mutation methods also assert persistence effects.
  - If a method can raise a domain error, add an error-path assertion mirroring existing patterns.
- **UI**:
  - New page registration must be added to the page matrix and/or a dedicated `test_<page>_page.test.js`.
  - Basic smoke: nav/tab works, key selector renders, no console errors, expected bundles present.
  - Page-specific behaviors stay in dedicated tests but keep the matrix entry for smoke.

## Tooling & Enforcement
- `python tools/test_index.py` produces a coverage report and supports `--fail-on-missing` for CI/pre-push.
- `make test-index` should run the indexer locally.
- The reusable prompt `_build/prompts/sparkq-sync-tests.md` consumes the indexer output and applies the test patterns to fill gaps.

## Legacy Artifacts (cleanup candidates)
- Top-level CJS one-offs in `sparkq/tests/` (`test-console-logs.cjs`, `test-debug.cjs`, `test-network.cjs`, `test-queue-ops.cjs`, `test-ui-queue-operations.cjs`, `test-ui-simple.cjs`) appear unused by current Jest config; remove or fold into matrix-driven tests once coverage parity is confirmed.
- `sparkq/tests/logs/` should remain git-ignored or cleaned regularly; it is not a source of truth.
