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
