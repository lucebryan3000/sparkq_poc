Below is the **enhanced Codex Playbook**—now **Python-focused**, but using all your new supporting information (the audit script, the API discrepancy fixes, purge/reload missing routes, etc.) to produce a *next-level*, fully automated codebase-scanning/remediation engine.

This is the **final, production-grade version** you should use going forward.
It uses all your actual practices (Python backend, UI calling Python endpoints, pytest E2E, shell audit tools, grep-based route discovery, etc.).

This is what you give to Codex when you want it to **scan an entire Python/JS project**, find API/UI mismatches, generate missing backend routes, add missing tests, and validate everything without manual supervision.

---

# ✅ **CODEX PLAYBOOK — Python API Endpoint Audit, Detection, and Auto-Remediation Engine**

*(Full-Stack Python + JS UI Edition)*

Use this to make Codex automatically identify & fix:

* Missing Python API endpoints
* UI → backend mismatches
* Buttons calling nonexistent endpoints
* Wrong HTTP verbs or wrong paths
* Missing Pydantic models / request/response schemas
* Missing service/storage functions
* Improper route registration
* Incorrect FastAPI decorators
* Missing or incorrect test coverage
* Incomplete purge/reload/auxiliary endpoints
* Out-of-sync UI/API expectation drift
* Orphaned routes that should be removed or documented

This playbook transforms Codex into a **self-driving Python API integrity engine**.

Drop this into any project (SparkQueue or not).

---

```markdown
# 🧠 CODEX PLAYBOOK — Python API Endpoint Audit & Auto-Remediation Engine

## Technology Targets
Codex must assume:
- Python backend (FastAPI, Flask, or similar)
- Pydantic models for validation
- Python storage/service layers (SQLite/Postgres)
- JS/HTML/CSS frontend calling backend via fetch()
- pytest E2E / integration test suite
- Optional audit tooling: shell scripts (grep/awk/sed)

Codex may NOT propose non-Python frameworks unless explicitly told.

---

# 1. Objectives
Codex MUST:

1. **Scan the entire Python backend** and build a complete list of routes.
2. **Scan the entire JS UI code** and extract all API calls the UI expects.
3. **Compare “expected” vs “actual” endpoints** and find discrepancies.
4. **Identify missing endpoints**, wrong verbs, wrong paths, wrong models.
5. **Detect dead buttons** that call no API or call broken endpoints.
6. **Generate missing backend code** (FastAPI endpoints, Pydantic models, handlers).
7. **Generate missing storage/service functions**.
8. **Fix UI code that points at the wrong endpoint**.
9. **Add pytest coverage** for:
   - route existence
   - request/response structure
   - UI → API mapping
   - new endpoints
10. **Repeat remediation until all tests pass** and no mismatches remain.

---

# 2. Phase 1 — Codex Must Extract All Backend API Endpoints (Python)

Codex scans:
- `@app.get("/api/...")`
- `@app.post("/api/...")`
- `@app.put("/api/...")`
- `@app.delete("/api/...")`
- APIRouter includes
- dynamic URL segments (`{key}`, `{id}`, etc.)
- service/helper endpoints (purge, reload, config, audit)

Codex produces:

```

ACTUAL_ENDPOINTS = [
{ "method": "GET", "path": "/api/tasks" },
{ "method": "POST", "path": "/api/purge" },
{ "method": "POST", "path": "/api/reload" },
...
]

```

Codex must account for:
- dynamic routes
- slug parameters
- prefix routers

---

# 3. Phase 2 — Codex Must Extract All UI-Expected API Calls

Codex scans:

- fetch("/api/...")
- fetch(`/api/.../${id}`)
- api("POST", "/api/...")
- any custom wrapper invoking backend URLs
- any .js file under **ui/pages**, **components**, **utils**

Codex produces:

```

EXPECTED_ENDPOINTS = [
{ "method": "POST", "path": "/api/purge" },
{ "method": "POST", "path": "/api/reload" },
{ "method": "GET",  "path": "/api/streams" },
...
]

```

Codex must:
- normalize template literals → parameter patterns
- ignore query params
- convert dynamic UI paths (`/api/roles/${key}`) to wildcard format

---

# 4. Phase 3 — Codex Must Detect Discrepancies

Codex must compare:

```

EXPECTED_ENDPOINTS – ACTUAL_ENDPOINTS → missing backend
ACTUAL_ENDPOINTS – EXPECTED_ENDPOINTS → unused backend

````

Codex must generate a discrepancy list:
- Missing implementations
- Wrong HTTP verbs
- Wrong path structures
- UI calling nonexistent endpoints
- Buttons calling no endpoint
- Schema mismatches (UI expects fields that backend doesn’t return)
- Backend returns fields UI doesn’t use

Codex must ALWAYS treat missing endpoints as **critical**.

---

# 5. Phase 4 — Auto-Remediation Rules Codex Must Follow

Codex must apply the following fixes **in this order**:

### 5.1 Missing Endpoint (Backend)
Codex must generate:
- FastAPI route
- Pydantic request model
- Pydantic response model
- service layer logic
- storage layer function
- domain validation (400, 404, 422)
- error formatting
- register with router

Codex MUST match naming conventions in codebase.

### 5.2 UI Calls Wrong Endpoint
Codex must fix wrong URLs:
- path typos
- missing slugs
- wrong method
- wrong query structure
- mismatched dynamic keys

Codex MUST preserve app conventions.

### 5.3 Button Does Not Call API
Codex must:
- add an event handler
- call correct backend route
- preventDefault + stopPropagation if needed
- show UI feedback (toast/alert)

### 5.4 Backend Route Exists but UI Not Using It
Codex flags as **orphaned**.

No deletion unless explicitly told.

### 5.5 Schema Mismatch
Codex must update:
- Pydantic models
- storage field list
- serializer logic
- UI field usage

### 5.6 Missing Tests
Codex must add:
- pytest route existence test
- pytest E2E test
- pytest schema validation test
- Playwright button → API test (if available)

---

# 6. Phase 5 — Required Test Additions

Codex must generate the following Python tests:

### 6.1 Route existence tests
```python
@pytest.mark.parametrize("method,path", EXPECTED_ENDPOINTS)
def test_api_routes_exist(client, method, path):
    r = client.request(method, path)
    assert r.status_code not in (404, 405)
````

### 6.2 Schema validation tests

Codex must assert required fields exist.

### 6.3 UI → API mapping tests

Using Playwright/Pyppeteer Python bindings:

* Click each button
* Capture network requests
* Assert at least one matches expected endpoint
* Assert no 404/500 thrown

### 6.4 New endpoint functional tests

For any endpoint Codex generates.

---

# 7. Phase 6 — Validation Loop (Codex MUST Repeat)

Codex must rerun:

* pytest (unit, integration, E2E)
* UI → API mapping tests (Playwright or equivalent)
* audit script if present (e.g., tools/audit_api.sh)

Codex must continue remediation until:

* no missing endpoints
* all tests green
* all UI→API calls resolve correctly
* schemas consistent
* storage logic correct
* routes properly registered

---

# 8. Bonus: Integrate Existing Audit Tools (If Present)

Codex must run:

```
./tools/audit_api.sh --quick
```

If missing endpoints detected, Codex must fix
and rerun until:

```
AUDIT PASSED
```

---

# 9. Invocation Prompt (Use This When Calling Codex)

```
Run the CODEX PYTHON API AUDIT PLAYBOOK.

Scan the entire Python backend and the UI code.
Extract ACTUAL_ENDPOINTS from Python router files.
Extract EXPECTED_ENDPOINTS from JS frontend code.
Identify missing endpoints, dead buttons, wrong HTTP methods, wrong paths, schema mismatches, missing Pydantic models, missing service/storage logic.
Fix backend (FastAPI routes, Pydantic models, storage logic).
Fix UI (fetch paths, event handlers, button actions).
Add pytest tests for route existence, schema validation, and UI→API mapping.
Re-run pytest and any audit scripts until everything passes.
Produce a final discrepancy report and all patches.
```

---

# 10. Completion Criteria

Codex may only finish when:

* All Python API endpoints required by UI exist
* No UI button is dead
* All mismatches fixed
* Backend routes and UI expectations are aligned
* All pytest suites are green
* Audit script (if present) passes
* No missing schema or model definitions
* Code compiles and runs without warnings

---

# END OF PLAYBOOK

```

---

If you want, I can also provide:

### 🔧 A Python script Codex can use to automatically extract endpoints (instead of grep)
### 🧪 A pytest plugin for automatic endpoint coverage enforcement
### 📡 A CLI command that wraps this entire audit process into one `make audit`

Just tell me.
```
