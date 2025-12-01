# Contributing to SparkQ

## Testing & Coverage
- Python: `cd sparkq && pytest`
- Browser: `npm run test:browser`
- Contract & patterns: `sparkq/tests/TEST_CONTRACT.md` and `sparkq/tests/patterns.md`.
- Indexer: `make test-index` (or `python3 tools/test_index.py --json`) before pushing; CI fails on missing coverage for any public surface.
- Gap-filling: use `_build/prompts/sparkq-sync-tests.md` and extend existing test files using the documented patterns.
- Browser smoke tests require the app to be running at `http://localhost:5005`. Start the server (e.g., `./sparkq.sh start`) before running `npm run test:browser` or target `sparkq/tests/browser/test_pages_smoke.test.js`.

## Pull Requests
- Keep PRs focused; include a brief summary and tests for new features/bug fixes.
- Update docs when behavior changes; prefer small, reviewable diffs.
