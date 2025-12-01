# SparkQ Test Indexer Workflow

- Run `make test-index` (runs `python3 tools/test_index.py --fail-on-missing`) to verify all public surfaces have coverage as defined in `sparkq/tests/TEST_CONTRACT.md`.
- To inspect details, run `python3 tools/test_index.py --json` for a machine-readable report of coverage and gaps.
- If any MISSING entries appear, use `_build/prompts/sparkq-sync-tests.md` to guide adding tests using the patterns in `sparkq/tests/patterns.md`.
- Keep `sparkq/tests/browser/helpers/page_matrix.js` updated when adding UI pages so browser smoke tests and the indexer stay aligned.
