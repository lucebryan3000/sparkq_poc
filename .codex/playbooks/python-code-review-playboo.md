````markdown
# Codex Python Engineering Playbook (Machine-Targeted Version)
**Purpose:**
A fully LLM-oriented, non-human code-generation rulebook.
This is the authoritative standard Codex must obey whenever generating, modifying, or reviewing Python code.
The focus is correctness, determinism, maintainability, safety, and strict pattern adherence.

Codex must treat every rule below as binding.

---

# 1. Execution Baseline (Environment & Toolchain)

Codex must auto-detect (from prompt context or project files):

- Python version
- Package manager (`pip`, `pip-tools`, `poetry`, `uv`)
- Lockfiles (`requirements.txt`, `poetry.lock`, `uv.lock`)
- Tooling (`ruff`, `black`, `isort`, `mypy/pyright`, CI config)

**Codex must not generate code incompatible with these versions or tools.**

If ambiguity exists, Codex must assume:
- Python ≥ 3.10
- Modern tooling (`ruff`, `black`, `mypy`)
- `pathlib` > `os.path`

---

# 2. Deterministic, Idempotent Code Generation (Mandatory)

Codex must ALWAYS:
- Generate entire files, never partial diffs (unless explicitly allowed).
- Avoid nondeterministic ordering.
- Not invent files, folders, or architecture not already defined.
- Maintain stable signatures across runs.
- Avoid “creative restructuring” or refactors unless explicitly instructed.

**Same input → identical output. No spontaneous changes.**

---

# 3. Repository & Architecture Structure

Codex must follow existing project patterns:
- Respect directory structure (never reorganize).
- Prefer `src/` layout when applicable.
- No ad-hoc `utils.py` dumps; group code by domain.
- Respect layering:
  - **Boundary layer:** API, CLI, workers, DB adapters
  - **Service / business logic layer:** pure logic, no IO
  - **Data layer:** repositories, models, schemas

Codex must never break boundaries or mix layers.

---

# 4. Typing & Interfaces (Strict Mode)

Codex must use:
- Full type hints for all public and private functions.
- Explicit return types (never implicit).
- `Optional[]`, `Union[]`, `Literal[]`, `TypedDict`, `Protocol`.
- Pydantic models or dataclasses for structured data.
- Generic types when behavior does not depend on concrete structures.

Codex must avoid:
- `Any` unless explicitly required.
- Untyped dicts/lists with ambiguous structure.

---

# 5. Data Modeling Standards

Codex must:
- Use Pydantic or Dataclasses for structured schemas.
- Use Enum for fixed categories.
- Only return dicts when required by API or DB layer.
- Normalize date/time to UTC (`zoneinfo`).
- Use `Decimal` for money or exact arithmetic.

---

# 6. Error Handling & Logging (LLM-Safe Patterns)

Codex must:
- Never use bare `except:`.
- Catch specific exceptions.
- Log errors with structured context.
- Never log secrets, tokens, or private content.
- Use domain-specific exceptions when appropriate.
- Prefer raising meaningful errors over returning `None` or falsey values.

Pattern:

```python
try:
    ...
except sqlite3.IntegrityError as exc:
    logger.error("Duplicate key: %s", exc)
    raise ValueError("Invalid input") from exc
except Exception as exc:
    logger.exception("Unhandled error")
    raise
````

---

# 7. Database & Storage Operations (Strict)

Codex must:

* Use parameterized SQL queries only.
* Never use f-strings for SQL.
* Use context managers for all DB connections and files.
* Convert rows via `dict(row)` or model constructors.
* Avoid N+1 queries: batch operations, joins, or bulk inserts.
* Keep all DB logic inside repository/storage layer.

Codex must never:

* Access DB directly from API or CLI logic.
* Mix SQL construction into business logic.

---

# 8. Network, Filesystem, & Side Effects

Codex must:

* Keep side effects at boundaries.
* Avoid global mutable state.
* Use `pathlib.Path` everywhere.
* Apply timeouts to all network calls.
* Use async safely (no mixing sync/async unless specified).
* Ensure proper cleanup (context managers only).

Codex must not:

* Use `eval`, `exec`, or untrusted deserialization (`pickle.loads`).
* Hardcode secrets, passwords, URLs, or API keys.

---

# 9. API Layer (FastAPI/Django/Flask Standards)

Codex must:

* Wrap responses in stable schema shapes.
* Validate inputs at the boundary using Pydantic.
* Never expose raw exceptions or tracebacks.
* Use meaningful HTTP status codes (400/404/409/422).
* Keep route handlers thin (delegate to services).

Example:

```python
@app.post("/items", response_model=ItemResponse)
async def create_item(req: ItemCreate):
    item = service.create_item(req)
    return {"item": item}
```

---

# 10. CLI Layer (Typer)

Codex must:

* Use Typer’s help text, options, and typed arguments.
* Ensure all errors result in meaningful messages.
* Never print raw exceptions.
* Keep commands thin; delegate real logic to service layer.

---

# 11. Configuration & Secrets

Codex must:

* Use environment variables (via `os.getenv` or `pydantic-settings`).
* Provide safe defaults.
* Never commit secrets to code.
* Centralize configuration into one module.

Codex must not:

* Reference environment infrastructure not present.

---

# 12. Testing Patterns (Machine-Safe Standards)

Codex must:

* Create deterministic tests (no sleep, network, randomness).
* Test behaviors, not implementation details.
* Use parametrized tests for coverage.
* Provide fixtures for DB or IO boundaries.
* Use TestClient for API testing.

Example:

```python
client = TestClient(app)
resp = client.get("/api/resource")
assert resp.status_code == 200
```

Codex must:

* Use mocks for time, randomness, or network.
* Never require external services.

---

# 13. Performance & Safety Standards

Codex must:

* Stream large IO; avoid loading entire payloads.
* Prevent N+1 queries.
* Use batching or async where IO-bound.
* Guard async code with cancellation and timeouts.
* Avoid expensive operations in tight loops.

---

# 14. Observability (Machine Enforcement)

Codex must:

* Add structured logs to critical flows.
* Provide context identifiers in logs.
* Never swallow exceptions silently.

Codex should avoid:

* Verbose logging in performance-sensitive code.

---

# 15. Dependency Hygiene

Codex must:

* Prefer stdlib over new dependencies.
* Add dependencies only when explicitly instructed.
* Keep versions pinned when modifying `requirements.txt`.
* Avoid vendored or duplicated dependencies.

---

# 16. Code Clarity & Maintainability (LLM-Safe)

Codex must:

* Use early returns.
* Avoid deep nesting (>3 levels).
* Use descriptive names: snake_case for functions, PascalCase for classes.
* Remove dead code, unused params, and obsolete comments.

Codex must not:

* Leave placeholder code (`TODO`, `pass`, commented stubs).
* Generate overly abstract class hierarchies.
* Mix concerns across layers.

---

# 17. Concurrency Rules

Codex must:

* Use asyncio for IO-bound concurrency.
* Avoid mixing threads and async unless explicitly directed.
* Protect shared mutable state with locks.
* Use cancellation-safe patterns.

Codex must not:

* Create event loops manually unless required.
* Block the event loop with synchronous IO.

---

# 18. Validation Commands (Codex Must Output These)

Every code output must include:

```bash
python -m py_compile path/to/file.py
python -c "import module; print('PASS')"
grep -n 'TODO\|FIXME\|XXX' -r path/to/file.py
```

API files additionally require:

```bash
python -c "from <path>.api import app; print('PASS')"
```

Test files must be validated with:

```bash
pytest -q
```

---

# 19. Common LLM Failure Modes Codex Must Avoid (Critical)

Codex must treat these as forbidden behaviors:

* Wrong or invented imports
* Inconsistent return types
* Missing “await” in async functions
* Unsafe SQL (string-concatenated queries)
* Hidden global state or mutable defaults
* Creating architecture not requested
* Forgetting validation commands
* Hardcoding secrets
* Leaving placeholder stubs
* Returning raw exceptions to clients
* Incorrect file paths or unsupported OS assumptions
* Returning mixed structures (dict | model | tuple)
* Over-engineering (unnecessary classes or layers)
* Tests that depend on internal implementation details

Codex must self-check for these errors before producing the final output.

---

# 20. Final Rule: Codex Must Follow Patterns, Not Improvise

The priority order is:

1. **Explicit instructions from the user**
2. **Existing codebase patterns**
3. **This playbook**
4. **Best practices**

Codex must always default to:
**Consistency > Creativity. Structure > Novelty. Determinism > Cleverness.**

---

```
```
