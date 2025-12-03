# SparkQ Technical Debt & Bug Remediation Report

**Audit Date:** 2025-12-03
**Auditor:** Claude (Opus 4)
**Focus:** Bugs, dead code, syntax issues, broken links, tech debt

---

## Executive Summary

This report identifies technical debt, bugs, and issues requiring remediation to ensure **stability, resiliency, availability, and consistency** of SparkQ. Issues are categorized by severity and file location.

**Critical Issues:** 2
**High Priority:** 5
**Medium Priority:** 12
**Low Priority (Tech Debt):** 15+

---

## 1. Critical Bugs (Must Fix Before Production)

### 1.1 Missing Database Columns

**File:** `sparkq/src/storage.py`
**Severity:** 🔴 CRITICAL
**Impact:** SQL errors when using LLM session or model profile features

**Issue:** Two columns are referenced in code but never created in the database schema:

```python
# Line 638-666: These functions use llm_sessions column
def get_llm_sessions(self, queue_id: str) -> Optional[dict]:
    cursor.execute("SELECT llm_sessions FROM queues WHERE id = ?", ...)  # FAILS

def update_llm_session(self, queue_id: str, llm_name: str, session_data: dict):
    cursor.execute("UPDATE queues SET llm_sessions = ? ...", ...)  # FAILS

# Line 728: model_profile used in update_queue_fields
updates["model_profile"] = model_profile  # FAILS
```

**Root Cause:** Missing `_ensure_column()` calls in `init_db()`:
```python
# Lines 203-204 exist:
_ensure_column("queues", "codex_session_id", "TEXT")
_ensure_column("queues", "default_agent_role_key", "TEXT")

# Missing:
_ensure_column("queues", "llm_sessions", "TEXT")  # MISSING
_ensure_column("queues", "model_profile", "TEXT")  # MISSING
```

**Fix:**
```python
# Add after line 204 in storage.py init_db():
_ensure_column("queues", "llm_sessions", "TEXT")
_ensure_column("queues", "model_profile", "TEXT DEFAULT 'auto'")
```

---

### 1.2 API Endpoints Using Missing Columns

**File:** `sparkq/src/api.py`
**Severity:** 🔴 CRITICAL
**Impact:** HTTP 500 errors on these endpoints

| Endpoint | Line | Issue |
|----------|------|-------|
| `GET /api/queues/{queue_id}/llm-sessions` | 1318-1329 | Uses missing `llm_sessions` column |
| `PUT /api/queues/{queue_id}/llm-sessions/{llm_name}` | 1332-1356 | Uses missing `llm_sessions` column |
| `PUT /api/queues/{queue_id}` | 1221-1263 | Uses missing `model_profile` column |

---

## 2. High Priority Issues

### 2.1 Unused Imports (Dead Code)

**Files & Lines:**

| File | Line | Import | Status |
|------|------|--------|--------|
| `sparkq/src/storage.py` | 18 | `DEFAULT_TASK_TIMEOUT_SECONDS` | Unused |
| `sparkq/src/api.py` | 19 | `TASK_CLASS_TIMEOUTS` | Unused |
| `sparkq/src/api.py` | 32 | `now_iso` | Unused |
| `sparkq/src/server.py` | 11 | `Path` | Unused |
| `sparkq/src/config.py` | 3 | `annotations` | Unused |
| `sparkq/src/config.py` | 12 | `reset_paths_cache` | Unused |
| `sparkq/src/index.py` | 3 | `json` | Unused |

**Fix:** Remove or use these imports. Run `autoflake` or manually clean.

---

### 2.2 Broken Documentation Links

**File:** `README.md` (root)

| Link Text | Target | Actual Location | Status |
|-----------|--------|-----------------|--------|
| `_build/FRD/sparkq_FRD-v9.0.md` | Build Charter | Does not exist | ❌ Missing |
| `python-bootstrap/README.md` | Bootstrap docs | `__omni-dev/python-bootstrap/README.md` | ❌ Wrong path |
| `sparkq/README.md` | SparkQ guide | `sparkq/docs/SPARKQ_README.md` | ❌ Wrong path |
| `sparkq/API.md` | API reference | `sparkq/docs/API.md` | ❌ Wrong path |
| `ARCHITECTURE.md` | Architecture | `docs/ARCHITECTURE.md` | ❌ Wrong path |

**File:** `CLAUDE.md` (root)

| Link Text | Target | Status |
|-----------|--------|--------|
| `_build/FRD/sparkq_FRD-v9.0.md` | FRD v9.0 | ❌ Missing |

---

### 2.3 Overly Broad Exception Handling

**Pattern:** `except Exception:` used 30+ times across codebase

**Files with most occurrences:**

| File | Count | Concern |
|------|-------|---------|
| `sparkq/src/storage.py` | 18 | May hide database errors |
| `sparkq/src/api.py` | 7 | May hide API processing errors |
| `sparkq/src/cli.py` | 2 | Acceptable for CLI error handling |

**Recommendation:** Replace with specific exception types where possible:
- `sqlite3.Error` for database operations
- `json.JSONDecodeError` for JSON parsing
- `ValidationError` for input validation

---

### 2.4 Browser Test TODOs

**File:** `sparkq/tests/browser/test_build_and_tools.test.js`

```javascript
// Line 87: TODO: Restore when build-id input is present in Config UI
// Line 91: TODO: Re-enable when queue tabs are exposed in current UI build
```

**Impact:** Incomplete test coverage for UI features

---

### 2.5 Orphaned Test Files

**File:** `sparkq/tests/TEST_CONTRACT.md` (line 37)

> Top-level CJS one-offs in `sparkq/tests/` (`test-console-logs.cjs`, `test-debug.cjs`, `test-network.cjs`, `test-queue-ops.cjs`, `test-ui-queue-operations.cjs`, `test-ui-simple.cjs`) appear unused by current Jest config

**Impact:** Dead test code taking up space, potential confusion

---

## 3. Medium Priority Issues

### 3.1 Duplicate Code Patterns

**Pattern:** Modal creation logic duplicated across files

| File | Lines | Pattern |
|------|-------|---------|
| `sparkq/ui/pages/dashboard.js` | 136-231 | `promptValue()` inline modal |
| `sparkq/ui/pages/dashboard.js` | 1358-1618 | `showEditTaskDialog()` modal |
| `sparkq/ui/components/utils.js` | (various) | `showPrompt()`, `showConfirm()` |

**Recommendation:** Consolidate modal creation into single utility

---

### 3.2 Inconsistent Status Values

**Issue:** Task filter reset uses hardcoded status values that may drift from enums

**File:** `sparkq/ui/pages/dashboard.js` (lines 1303-1304, 1321-1327)

```javascript
// Hardcoded status values instead of referencing TaskStatus enum
state.statuses = new Set(['queued', 'running', 'succeeded', 'failed', 'timeout', 'cancelled', 'canceled']);
```

**Models definition:** `sparkq/src/models.py` (lines 9-13)
```python
class TaskStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    # Note: 'timeout', 'cancelled', 'canceled' not in enum
```

**Impact:** UI may show filter options that don't match actual task states

---

### 3.3 CLI Session Parameter Unused

**File:** `sparkq/src/cli.py` (line 361)

```python
# session parameter is reserved for future UI defaults
_ = session
```

**Impact:** Dead code, confusing for users who pass `--session` flag

---

### 3.4 Config File Path Inconsistencies

**Issue:** Multiple ways to reference script directories in config

**File:** `sparkq.yml`
```yaml
sparkq_scripts_dir: sparkq/scripts
script_dirs:
  - sparkq/scripts/tools
```

**File:** `sparkq/src/cli.py` (setup command)
```yaml
sparkq_scripts_dir: sparkq/scripts
project_script_dirs: ["scripts"]  # Different key name!
```

**Impact:** Confusion about config structure

---

### 3.5 Potential Race Condition in Storage

**File:** `sparkq/src/storage.py`
**Pattern:** Read-modify-write without locking

```python
# Line 654-666: get_llm_sessions → modify → update_llm_session
def update_llm_session(self, queue_id: str, llm_name: str, session_data: dict):
    sessions = self.get_llm_sessions(queue_id) or {}  # READ
    sessions[llm_name] = {...}                         # MODIFY
    conn.execute("UPDATE queues SET llm_sessions = ?") # WRITE
    # Race: Another process could update between READ and WRITE
```

**Impact:** Data loss in concurrent environments (low risk for single-user mode)

---

### 3.6 Inconsistent Error Response Formats

**File:** `sparkq/src/api.py`

```python
# Line 1327: Returns generic error
except Exception:
    raise HTTPException(status_code=500, detail="Internal server error")

# Line 1315: Returns specific error
except NotFoundError as e:
    raise HTTPException(status_code=404, detail=str(e))
```

**Recommendation:** Standardize error response format with error codes

---

### 3.7 UI Dist Files Duplicated

**Pattern:** Source files in `sparkq/ui/pages/` duplicated to `sparkq/ui/dist/`

| Source | Dist | Issue |
|--------|------|-------|
| `ui/pages/config.js` | `ui/dist/config.js` | Manual copy, may drift |
| `ui/pages/*.js` | `ui/dist/*.js` | No build process |

**Recommendation:** Either automate copy or remove dist folder

---

### 3.8 Magic Numbers in Timeouts

**File:** `sparkq/src/constants.py`

```python
STALE_WARNING_MULTIPLIER = 1.0  # Document what this means
STALE_FAIL_MULTIPLIER = 2.0    # Document what this means
```

**File:** Various locations with hardcoded `60` (seconds conversion)

**Recommendation:** Add comments explaining multiplier meaning

---

### 3.9 Missing Input Validation

**File:** `sparkq/src/api.py`

**Pattern:** Some endpoints don't validate string lengths or formats

```python
# Line 1637+: quick-add endpoint accepts arbitrary payload
@app.post("/api/tasks/quick-add")
def quick_add_task(...):
    # No validation on prompt length
    # No validation on tool_name format
```

**Recommendation:** Add Pydantic validators for max length, allowed characters

---

### 3.10 Logging Without Context

**File:** `sparkq/src/api.py` (multiple locations)

```python
logger.exception("Failed to load LLM sessions for queue %s", queue_id)
# Missing: user context, request ID, timing
```

**Recommendation:** Add request ID to all log entries for tracing

---

### 3.11 Test Coverage Gaps

**Pattern:** UI JavaScript has minimal test coverage

```
sparkq/tests/ui/
└── test_delegated_smoke.py  # Only 1 test file for UI
```

**Recommendation:** Add Jest tests for:
- Dashboard interactions
- Modal behavior
- Form validation
- Error handling

---

### 3.12 Inconsistent Datetime Handling

**File:** `sparkq/src/storage.py`

```python
# Line 633: Uses datetime.now(UTC).isoformat()
cursor.execute("UPDATE queues SET codex_session_id = ?, updated_at = ?",
    (session_id, datetime.now(UTC).isoformat(), queue_id))

# Line 663: Uses now_iso() helper
cursor.execute("UPDATE queues SET llm_sessions = ?, updated_at = ?",
    (json.dumps(sessions), now_iso(), queue_id))
```

**Recommendation:** Use `now_iso()` consistently everywhere

---

## 4. Low Priority (Tech Debt)

### 4.1 Code Style Inconsistencies

- Mixed quotes (single vs double) in JavaScript
- Inconsistent spacing around operators
- Some functions exceed 100 lines (e.g., `dashboard.js` render functions)

### 4.2 Missing Type Hints

**Files with incomplete type hints:**
- `sparkq/src/storage.py` - Some functions lack return types
- `sparkq/src/api.py` - Response models not always used

### 4.3 Documentation Debt

- No inline JSDoc comments in UI JavaScript
- Some Python docstrings are incomplete
- API endpoint descriptions could be more detailed

### 4.4 Configuration Validation

- No schema validation for `sparkq.yml`
- Invalid config silently falls back to defaults
- No config diff/migration tooling

### 4.5 Performance Considerations

- No database query optimization (EXPLAIN ANALYZE)
- No connection pooling configuration
- No request rate limiting

### 4.6 Security Hardening

- No CSRF protection for state-changing endpoints
- No request size limits configured
- No security headers (CSP, X-Frame-Options, etc.)

---

## 5. Remediation Priority Matrix

| Priority | Issue | Effort | Impact |
|----------|-------|--------|--------|
| P0 | Missing llm_sessions/model_profile columns | 10 min | Critical |
| P1 | Fix broken documentation links | 30 min | High |
| P1 | Remove unused imports | 15 min | Medium |
| P2 | Consolidate exception handling | 2 hr | Medium |
| P2 | Clean up orphaned test files | 30 min | Low |
| P2 | Standardize modal utilities | 2 hr | Medium |
| P3 | Add missing type hints | 4 hr | Low |
| P3 | Add UI JavaScript tests | 8 hr | Medium |
| P3 | Add config schema validation | 2 hr | Low |

---

## 6. Recommended Actions

### Immediate (Before Next Release)

1. **Add missing database columns:**
   ```python
   _ensure_column("queues", "llm_sessions", "TEXT")
   _ensure_column("queues", "model_profile", "TEXT DEFAULT 'auto'")
   ```

2. **Fix documentation links in README.md**

3. **Remove unused imports**

### Short-term (Next Sprint)

1. Replace broad `except Exception:` with specific exceptions
2. Add request ID to all API logs
3. Consolidate modal creation code
4. Clean up orphaned test files

### Long-term (Tech Debt Backlog)

1. Add comprehensive UI test coverage
2. Implement config schema validation
3. Add security headers to API responses
4. Document all magic numbers

---

## Appendix: Files Audited

```
sparkq/src/
├── api.py          (76KB) - 7 issues found
├── cli.py          (42KB) - 3 issues found
├── storage.py      (78KB) - 20 issues found
├── server.py       (11KB) - 1 issue found
├── config.py       (3KB)  - 2 issues found
├── index.py        (10KB) - 1 issue found
├── models.py       (2KB)  - Clean
├── errors.py       (0.4KB)- Clean
├── constants.py    (0.6KB)- Clean
└── tools.py        (7KB)  - 1 issue found

sparkq/ui/
├── pages/dashboard.js (45KB) - 5 issues found
├── pages/config.js    (12KB) - 1 issue found
├── core/*.js          - Clean
└── components/*.js    - Clean

Documentation:
├── README.md          - 5 broken links
├── CLAUDE.md          - 1 broken link
└── sparkq/docs/*.md   - Clean
```

---

*Report generated by automated codebase audit*
