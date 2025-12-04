# SparkQ AI Peer Coding Reference Manual

> **Audience**: Claude Code CLI, OpenAI Codex, and AI coding assistants
> **Purpose**: Authoritative technical reference for developing, debugging, and maintaining SparkQ
> **Version**: 1.0.0
> **Last Updated**: December 2024

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Critical Pre-Flight Checks](#3-critical-pre-flight-checks)
4. [Python Backend Standards](#4-python-backend-standards)
5. [UI Development Standards](#5-ui-development-standards)
6. [Caching and Cache Busting](#6-caching-and-cache-busting)
7. [Testing Protocols](#7-testing-protocols)
8. [Common Failure Patterns](#8-common-failure-patterns)
9. [Playbook: Common Operations](#9-playbook-common-operations)
10. [Checklists](#10-checklists)
11. [Debugging Guide](#11-debugging-guide)
12. [Code Examples](#12-code-examples)

---

## 1. Executive Summary

### 1.1 What This Document Is

This document is a **machine-readable reference manual** for AI coding assistants working on SparkQ. It contains:

- Deterministic rules that MUST be followed
- Patterns that have been proven to work
- Anti-patterns that cause bugs
- Verification procedures for every change

### 1.2 Why This Document Exists

**Problem Statement**: UI elements frequently break due to:
- Inconsistent initialization patterns
- Missing null checks on DOM elements
- Race conditions between script loading
- Cache invalidation failures
- Event handlers not being attached
- Elements created but never functional

**Solution**: This document provides explicit, unambiguous instructions that eliminate guesswork.

### 1.3 Core Principles

```
1. VERIFY before MODIFY - Always read files before editing
2. TEST before COMMIT - Run automated tests before any commit
3. EXPLICIT over IMPLICIT - Never assume globals exist
4. DEFENSIVE over OPTIMISTIC - Always check for null/undefined
5. SYNC before VERIFY - Always sync UI files to dist/ before testing
```

---

## 2. Architecture Overview

### 2.1 System Context

```
┌─────────────────────────────────────────────────────────────────┐
│                        SparkQ System                            │
├─────────────────────────────────────────────────────────────────┤
│  User: Single developer (local-first, no auth required)         │
│  Platform: Ubuntu LTS                                           │
│  Runtime: Python 3.11+                                          │
│  Database: SQLite with WAL mode                                 │
│  UI: Vanilla JavaScript SPA (no framework)                      │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Technology Stack

| Layer | Technology | Location | Notes |
|-------|------------|----------|-------|
| **API** | FastAPI | `sparkq/src/api.py` | REST endpoints, ~2000 lines |
| **CLI** | Typer | `sparkq/src/cli.py` | Primary interface, ~1000 lines |
| **ORM** | SQLAlchemy | `sparkq/src/storage.py` | SQLite abstraction, ~1500 lines |
| **Models** | Pydantic | `sparkq/src/models.py` | Data validation |
| **Server** | Uvicorn | `sparkq/src/server.py` | ASGI server, lifecycle management |
| **Database** | SQLite | `sparkq/data/sparkq.db` | WAL mode enabled |
| **Config** | YAML | `sparkq.yml` | Project configuration |
| **UI** | Vanilla JS | `sparkq/ui/` | IIFE modules, no build system |
| **Tests** | pytest | `sparkq/tests/` | Unit, integration, e2e, UI |

### 2.3 File Structure (Critical Paths)

```
sparkq/
├── src/                          # Backend Python code
│   ├── api.py                    # FastAPI endpoints (READ FIRST)
│   ├── cli.py                    # Typer CLI commands
│   ├── storage.py                # Database operations
│   ├── models.py                 # Pydantic models
│   ├── server.py                 # Uvicorn lifecycle
│   ├── errors.py                 # Domain exceptions
│   ├── constants.py              # Shared constants
│   └── config.py                 # YAML config loader
├── ui/                           # Frontend JavaScript
│   ├── core/
│   │   └── app-core.js          # Core: API, Utils, routing (LOAD FIRST)
│   ├── pages/
│   │   ├── dashboard.js         # Dashboard page
│   │   ├── queues.js            # Queue management
│   │   ├── tasks.js             # Task details
│   │   ├── config.js            # Settings/config page
│   │   └── scripts.js           # Script browser
│   ├── components/
│   │   └── quick-add.js         # Reusable components
│   ├── utils/
│   │   └── ui-utils.js          # Modals, toasts, formatting
│   ├── dist/                    # SERVED FILES (sync from source)
│   ├── index.html               # Main HTML shell
│   └── style.css                # All styles
├── tests/
│   ├── unit/                    # Unit tests
│   ├── integration/             # API/CLI integration tests
│   ├── e2e/                     # End-to-end tests
│   └── ui/                      # UI smoke tests
├── data/
│   └── sparkq.db                # SQLite database
└── docs/                        # Documentation
```

### 2.4 Request Flow

```
Browser Request
     │
     ▼
┌─────────────┐
│   Uvicorn   │  (ASGI Server)
└─────────────┘
     │
     ▼
┌─────────────┐
│   FastAPI   │  (api.py - routes, middleware)
└─────────────┘
     │
     ▼
┌─────────────┐
│   Storage   │  (storage.py - SQLite operations)
└─────────────┘
     │
     ▼
┌─────────────┐
│   SQLite    │  (WAL mode, 5s lock timeout)
└─────────────┘
```

---

## 3. Critical Pre-Flight Checks

### 3.1 Before ANY Code Change

```bash
# 1. Verify server is running
curl -s http://localhost:5005/health | jq .

# 2. Verify database is accessible
ls -la sparkq/data/sparkq.db

# 3. Verify UI dist is synced
./sparkq.sh sync-ui

# 4. Run existing tests to establish baseline
pytest sparkq/tests/ -v --tb=short
```

### 3.2 Before UI Changes

```bash
# MANDATORY: Sync UI files to dist/ directory
./sparkq.sh sync-ui

# Verify sync completed
ls -la sparkq/ui/dist/

# Check for JavaScript syntax errors
node -c sparkq/ui/core/app-core.js
node -c sparkq/ui/utils/ui-utils.js
node -c sparkq/ui/pages/*.js
```

### 3.3 Before Backend Changes

```bash
# Verify Python syntax
python -m py_compile sparkq/src/api.py
python -m py_compile sparkq/src/storage.py

# Check imports
python -c "from src import api, storage, models"

# Run unit tests for affected module
pytest sparkq/tests/unit/test_storage.py -v
```

---

## 4. Python Backend Standards

### 4.1 Error Handling Pattern

**RULE**: Storage layer raises domain errors; API layer maps to HTTP status.

```python
# sparkq/src/errors.py - Domain errors
class SparkQError(Exception):
    """Base exception for all SparkQ errors."""
    pass

class ValidationError(SparkQError):
    """Invalid input or constraint violation."""
    pass

class NotFoundError(SparkQError):
    """Requested resource does not exist."""
    pass

class ConflictError(SparkQError):
    """State collision or duplicate operation."""
    pass
```

**Mapping (in api.py)**:
```python
# ValidationError → 400 Bad Request
# NotFoundError → 404 Not Found
# ConflictError → 409 Conflict
# SparkQError → 500 Internal Server Error
```

**DO**:
```python
# In storage.py
def get_queue(self, queue_id: str) -> dict:
    queue = self._fetch_queue(queue_id)
    if not queue:
        raise NotFoundError(f"Queue '{queue_id}' not found")
    return queue
```

**DO NOT**:
```python
# WRONG: Don't raise HTTP exceptions in storage layer
from fastapi import HTTPException

def get_queue(self, queue_id: str) -> dict:
    queue = self._fetch_queue(queue_id)
    if not queue:
        raise HTTPException(status_code=404, detail="Queue not found")  # WRONG!
```

### 4.2 Database Operations

**Connection Pattern**:
```python
# ALWAYS use context manager
with self.connection() as conn:
    cursor = conn.execute(query, params)
    result = cursor.fetchone()
    conn.commit()  # Only if modifying data
```

**Transaction Safety**:
```python
# For multi-step operations, use explicit transaction
def create_task_with_queue(self, queue_id: str, payload: str) -> dict:
    with self.connection() as conn:
        try:
            # Step 1: Verify queue exists
            queue = self._get_queue_internal(conn, queue_id)
            if not queue:
                raise NotFoundError(f"Queue '{queue_id}' not found")

            # Step 2: Create task
            task_id = self._generate_id("tsk")
            conn.execute(
                "INSERT INTO tasks (id, queue_id, payload) VALUES (?, ?, ?)",
                (task_id, queue_id, payload)
            )

            conn.commit()
            return {"id": task_id, "queue_id": queue_id}
        except Exception:
            conn.rollback()
            raise
```

### 4.3 API Endpoint Pattern

```python
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

class CreateTaskRequest(BaseModel):
    queue_id: str
    tool_name: str
    payload: str = "{}"
    timeout: int = 300

class TaskResponse(BaseModel):
    id: str
    queue_id: str
    status: str
    tool_name: str

@router.post("/api/tasks", response_model=TaskResponse)
async def create_task(request: CreateTaskRequest):
    """Create a new task in the specified queue."""
    try:
        task = storage.create_task(
            queue_id=request.queue_id,
            tool_name=request.tool_name,
            payload=request.payload,
            timeout=request.timeout,
        )
        return TaskResponse(**task)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
```

### 4.4 Constants Usage

**RULE**: Never hardcode timeouts or multipliers. Use constants.

```python
# sparkq/src/constants.py
TASK_CLASS_TIMEOUTS = {
    "FAST_SCRIPT": 120,
    "MEDIUM_SCRIPT": 600,
    "LLM_LITE": 480,
    "LLM_HEAVY": 1200,
}

STALE_WARNING_MULTIPLIER = 1.0    # Warn at 1x timeout
STALE_FAIL_MULTIPLIER = 2.0      # Auto-fail at 2x timeout
DB_LOCK_TIMEOUT_SECONDS = 5.0

# Usage in storage.py
from constants import TASK_CLASS_TIMEOUTS, STALE_WARNING_MULTIPLIER

def get_timeout_for_class(task_class: str) -> int:
    return TASK_CLASS_TIMEOUTS.get(task_class, 300)
```

---

## 5. UI Development Standards

### 5.1 CRITICAL: The Source-to-Dist Workflow

**RULE**: The server serves files from `sparkq/ui/dist/`, NOT from source directories.

```
Source Files          Sync Command         Served Files
─────────────        ─────────────        ─────────────
ui/core/app-core.js  ─┐
ui/pages/dashboard.js │  ./sparkq.sh      ui/dist/app-core.js
ui/pages/queues.js    │    sync-ui        ui/dist/dashboard.js
ui/utils/ui-utils.js ─┘        →          ui/dist/queues.js
                                          ui/dist/ui-utils.js
```

**MANDATORY WORKFLOW**:
```bash
# 1. Edit source file
vim sparkq/ui/pages/dashboard.js

# 2. Sync to dist
./sparkq.sh sync-ui

# 3. Hard refresh browser (Ctrl+Shift+R)

# 4. Test functionality

# 5. Commit BOTH source AND dist files
git add sparkq/ui/pages/dashboard.js sparkq/ui/dist/dashboard.js
```

### 5.2 Module Pattern (IIFE)

**RULE**: All page modules MUST use IIFE pattern with explicit dependency injection.

```javascript
// CORRECT: IIFE with dependency injection
(function(Pages, API, Utils, Components) {
  'use strict';

  // Private scope - not accessible from outside
  const CACHE = {};

  function privateHelper() {
    // Only accessible within this IIFE
  }

  // Public registration
  Pages.MyPage = {
    async render(container) {
      // Implementation
    }
  };

})(window.Pages, window.API, window.Utils, window.Components);
```

**WRONG PATTERNS**:
```javascript
// WRONG: Direct global access without checking
function renderPage() {
  Utils.showToast("Hello");  // May fail if Utils not loaded
}

// WRONG: Missing 'use strict'
(function(Pages) {
  // Without strict mode, silent failures occur
})

// WRONG: No null check on container
Pages.MyPage = {
  async render(container) {
    container.innerHTML = "<h1>Title</h1>";  // Fails if container is null
  }
};
```

### 5.3 Creating UI Elements That Actually Work

**RULE**: Every UI element creation MUST follow this pattern:

```javascript
// CORRECT: Complete element creation pattern
function createButton(text, onClick) {
  // 1. Create element
  const button = document.createElement('button');

  // 2. Set attributes BEFORE appending
  button.type = 'button';
  button.className = 'button primary';
  button.textContent = text;

  // 3. Attach event handler BEFORE appending
  if (typeof onClick === 'function') {
    button.addEventListener('click', onClick);
  }

  // 4. Return element (caller appends)
  return button;
}

// Usage
const container = document.getElementById('button-container');
if (container) {
  const btn = createButton('Click Me', () => {
    Utils.showToast('Clicked!');
  });
  container.appendChild(btn);
}
```

**COMMON FAILURE**: Event handlers not working

```javascript
// WRONG: Using innerHTML destroys event handlers
container.innerHTML += '<button id="my-btn">Click</button>';
document.getElementById('my-btn').addEventListener('click', handler);
// FAILS: The button from innerHTML has no handler

// CORRECT: Use DOM methods
const btn = document.createElement('button');
btn.id = 'my-btn';
btn.textContent = 'Click';
btn.addEventListener('click', handler);
container.appendChild(btn);
```

### 5.4 Modal Dialog Implementation

**RULE**: Always use the shared modal system from ui-utils.js.

```javascript
// CORRECT: Using shared modal system
async function handleDelete(id) {
  const confirmed = await Utils.showConfirm(
    'Delete Item',
    'Are you sure you want to delete this item?',
    { confirmLabel: 'Delete', cancelLabel: 'Cancel' }
  );

  if (confirmed) {
    try {
      await API.api('DELETE', `/api/items/${id}`);
      Utils.showToast('Item deleted', 'success');
      await refreshList();
    } catch (err) {
      Utils.handleApiError('delete item', err);
    }
  }
}

// CORRECT: Using prompt modal
async function handleRename(id, currentName) {
  const newName = await Utils.showPrompt(
    'Rename Item',
    'Enter new name:',
    currentName,
    { placeholder: 'Item name' }
  );

  if (newName && newName !== currentName) {
    try {
      await API.api('PUT', `/api/items/${id}`, { name: newName });
      Utils.showToast('Item renamed', 'success');
      await refreshList();
    } catch (err) {
      Utils.handleApiError('rename item', err);
    }
  }
}
```

### 5.5 Form Handling

```javascript
// CORRECT: Complete form handling pattern
function setupForm(form) {
  if (!form) {
    console.error('[SparkQ] Form element not found');
    return;
  }

  // 1. Attach validation handlers
  Utils.attachValidationHandlers(form);

  // 2. Handle submit
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // 3. Clear previous errors
    Utils.clearFormErrors(form);

    // 4. Validate required fields
    if (!Utils.validateRequiredFields(form)) {
      return;
    }

    // 5. Get form data
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);

    // 6. Submit with loading state
    const submitBtn = form.querySelector('button[type="submit"]');
    await Utils.withButtonLoading(submitBtn, async () => {
      try {
        await API.api('POST', '/api/endpoint', data);
        Utils.showToast('Saved successfully', 'success');
        form.reset();
      } catch (err) {
        Utils.handleApiError('save', err);
      }
    }, 'Saving...');
  });
}
```

### 5.6 Data-Action Pattern for Event Delegation

**RULE**: Use `data-action` attributes for delegated event handling.

```javascript
// In app-core.js - Already set up
document.body.addEventListener('click', delegatedHandler);

function delegatedHandler(event) {
  const target = event.target.closest('[data-action]');
  if (!target) return;

  event.preventDefault();
  event.stopPropagation();

  const action = target.dataset.action;
  dispatchAction(action, target, event);
}

// Register actions
Utils.registerAction('delete-task', async (target) => {
  const taskId = target.dataset.taskId;
  if (!taskId) return;

  const confirmed = await Utils.showConfirm('Delete Task', 'Are you sure?');
  if (confirmed) {
    await API.api('DELETE', `/api/tasks/${taskId}`);
    Utils.showToast('Task deleted', 'success');
  }
});

// In HTML/render function
function renderTask(task) {
  return `
    <div class="task-row">
      <span>${task.name}</span>
      <button
        data-action="delete-task"
        data-task-id="${task.id}"
        class="button danger"
      >
        Delete
      </button>
    </div>
  `;
}
```

### 5.7 Loading States

**RULE**: Always show loading states for async operations.

```javascript
// CORRECT: Button loading state
async function handleSubmit(button) {
  await Utils.withButtonLoading(button, async () => {
    await API.api('POST', '/api/action');
  }, 'Processing...');
}

// CORRECT: Page loading state
async function render(container) {
  if (!container) return;

  // Show loading immediately
  container.innerHTML = `
    <div class="card">
      <div class="loading-state">
        <span class="loading"></span>
        <p>Loading data...</p>
      </div>
    </div>
  `;

  try {
    const data = await API.api('GET', '/api/data');
    renderContent(container, data);
  } catch (err) {
    container.innerHTML = `
      <div class="card">
        <p class="error">Failed to load: ${err.message}</p>
        <button onclick="location.reload()">Retry</button>
      </div>
    `;
  }
}
```

---

## 6. Caching and Cache Busting

### 6.1 Development Mode Caching

**RULE**: In development, cache must be disabled for all static files.

```python
# sparkq/src/api.py - Development cache headers
def add_no_cache_headers(response: Response):
    """Add headers that prevent ALL caching in development."""
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response
```

### 6.2 Cache Buster Endpoint

**RULE**: UI must load cache buster script on every page load.

```python
# sparkq/src/api.py
@app.get("/ui-cache-buster.js")
def get_cache_buster():
    """Generate cache buster variables for UI."""
    env = get_app_env()
    cache_buster = int(time.time())
    build_id = get_build_id()

    content = f"""
window.__SPARKQ_ENV__ = "{env}";
window.__SPARKQ_CACHE_BUSTER__ = "{cache_buster}";
window.__SPARKQ_BUILD_ID__ = "{build_id}";
"""
    response = Response(content=content, media_type="application/javascript")
    add_no_cache_headers(response)
    return response
```

### 6.3 Testing Cache Behavior

```python
# sparkq/tests/unit/test_dev_caching.py
def test_static_files_send_no_cache_headers_in_dev(dev_client):
    response = dev_client.get("/ui/style.css")

    assert response.status_code == 200
    assert response.headers.get("Cache-Control") == "no-cache, no-store, must-revalidate, max-age=0"
    assert response.headers.get("Pragma") == "no-cache"
    assert response.headers.get("Expires") == "0"
```

### 6.4 Browser Cache Clearing

**RULE**: When debugging UI issues, ALWAYS do a hard refresh.

```
Chrome/Edge:  Ctrl+Shift+R (or Cmd+Shift+R on Mac)
Firefox:      Ctrl+Shift+R (or Cmd+Shift+R on Mac)
Safari:       Cmd+Option+E (clear cache), then Cmd+R

DevTools:
1. Open DevTools (F12)
2. Right-click refresh button
3. Select "Empty Cache and Hard Reload"
```

### 6.5 Cache Invalidation Checklist

When UI changes aren't appearing:

```bash
# 1. Verify source file was saved
cat sparkq/ui/pages/dashboard.js | head -20

# 2. Sync to dist
./sparkq.sh sync-ui

# 3. Verify dist file was updated
diff sparkq/ui/pages/dashboard.js sparkq/ui/dist/dashboard.js

# 4. Check file timestamps
ls -la sparkq/ui/dist/dashboard.js

# 5. Restart server (if static file middleware is caching)
./sparkq.sh stop && ./sparkq.sh start

# 6. Hard refresh browser
# Ctrl+Shift+R

# 7. Check DevTools Network tab for 304 responses
# If seeing 304, the server is returning cached content
```

---

## 7. Testing Protocols

### 7.1 Test Directory Structure

```
sparkq/tests/
├── conftest.py              # Shared fixtures
├── unit/                    # Unit tests (fast, isolated)
│   ├── test_storage.py      # Database operations
│   ├── test_models.py       # Pydantic models
│   ├── test_tools.py        # Tool registry
│   ├── test_dev_caching.py  # Cache header tests
│   └── test_ui_utils_modal.py # UI utility tests
├── integration/             # Integration tests (API + DB)
│   ├── test_api.py          # API endpoint tests
│   ├── test_api_validation.py
│   └── test_cli.py          # CLI command tests
├── e2e/                     # End-to-end tests
│   ├── test_full_cycle.py   # Complete workflows
│   └── test_queue_lifecycle.py
└── ui/                      # UI smoke tests
    └── test_delegated_smoke.py
```

### 7.2 Running Tests

```bash
# Run all tests
pytest sparkq/tests/ -v

# Run specific test file
pytest sparkq/tests/unit/test_storage.py -v

# Run specific test function
pytest sparkq/tests/unit/test_storage.py::test_create_task -v

# Run tests matching pattern
pytest sparkq/tests/ -v -k "test_api"

# Run with coverage
pytest sparkq/tests/ --cov=sparkq/src --cov-report=html

# Run with verbose output and show locals
pytest sparkq/tests/ -v --tb=long -l
```

### 7.3 Test Fixtures

```python
# sparkq/tests/conftest.py
import pytest
from src.storage import Storage

@pytest.fixture
def temp_db_path(tmp_path):
    """Temporary database path for isolated tests."""
    return tmp_path / "sparkq_test.db"

@pytest.fixture
def storage(temp_db_path):
    """Initialized storage instance with clean database."""
    store = Storage(str(temp_db_path))
    store.init_db()
    yield store
    # Cleanup
    for suffix in ("", "-wal", "-shm"):
        db_file = temp_db_path.with_name(temp_db_path.name + suffix)
        if db_file.exists():
            db_file.unlink()

@pytest.fixture
def project(storage):
    """Create a test project."""
    return storage.create_project(
        name="test-project",
        repo_path="/tmp/repo",
        prd_path="/tmp/prd",
    )

@pytest.fixture
def session(storage, project):
    """Create a test session."""
    return storage.create_session(
        name="test-session",
        description="Test session",
    )

@pytest.fixture
def queue(storage, session):
    """Create a test queue."""
    return storage.create_queue(
        session_id=session["id"],
        name="test-queue",
        instructions="Test instructions",
    )
```

### 7.4 API Test Patterns

```python
# sparkq/tests/integration/test_api.py
from fastapi.testclient import TestClient
from src import api

@pytest.fixture
def client(storage, monkeypatch):
    """FastAPI test client with test database."""
    api.storage = storage
    return TestClient(api.app)

def test_create_task(client, queue):
    """Test task creation via API."""
    response = client.post("/api/tasks", json={
        "queue_id": queue["id"],
        "tool_name": "test-tool",
        "payload": '{"key": "value"}',
        "timeout": 300,
    })

    assert response.status_code == 200
    data = response.json()
    assert "id" in data
    assert data["queue_id"] == queue["id"]
    assert data["status"] == "queued"

def test_create_task_invalid_queue(client):
    """Test task creation with non-existent queue."""
    response = client.post("/api/tasks", json={
        "queue_id": "que_nonexistent",
        "tool_name": "test-tool",
    })

    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()
```

### 7.5 UI Test Patterns

```python
# sparkq/tests/ui/test_delegated_smoke.py
@pytest.mark.e2e
def test_delegated_actions_present(ui_client):
    """Verify core UI actions render on key pages."""
    resp = ui_client.get("/ui/")
    assert resp.status_code == 200
    html = resp.text

    # Check for data-action attributes
    assert 'data-action="nav-dashboard"' in html
    assert 'data-action="nav-settings"' in html

# JavaScript static analysis
def test_show_prompt_exported(ui_utils):
    """Verify showPrompt helper is exported."""
    assert "showPrompt" in ui_utils["text"]

def test_modal_styles_present(ui_utils):
    """Verify modal CSS markers exist."""
    assert "modal-content" in ui_utils["text"]
    assert "modal-overlay" in ui_utils["text"]
```

### 7.6 Puppeteer Testing Recommendations

Current setup uses pytest for UI smoke tests. For more robust UI testing:

**Recommended: Playwright over Puppeteer**

```bash
# Install Playwright
pip install pytest-playwright
playwright install
```

```python
# sparkq/tests/ui/test_browser.py
import pytest
from playwright.sync_api import Page, expect

@pytest.fixture(scope="session")
def browser_context_args():
    return {"viewport": {"width": 1280, "height": 720}}

def test_dashboard_loads(page: Page):
    """Test dashboard page loads correctly."""
    page.goto("http://localhost:5005/ui/")

    # Wait for app to initialize
    page.wait_for_selector("#dashboard-page")

    # Check status indicator exists
    expect(page.locator("#status")).to_be_visible()

def test_create_queue_modal(page: Page):
    """Test queue creation modal works."""
    page.goto("http://localhost:5005/ui/")

    # Click new queue button
    page.click('[data-action="new-queue"]')

    # Wait for modal
    page.wait_for_selector(".modal-overlay.visible")

    # Fill form
    page.fill('input[name="name"]', "Test Queue")
    page.click('button:has-text("Create")')

    # Verify toast appears
    expect(page.locator(".toast-success")).to_be_visible()
```

**Why Playwright over Puppeteer**:
1. Better Python integration via pytest-playwright
2. Auto-wait reduces flakiness
3. Cross-browser support (Chromium, Firefox, WebKit)
4. Built-in assertions with `expect()`
5. Better trace/debug tooling

---

## 8. Common Failure Patterns

### 8.1 UI Element Not Functional

**Symptom**: Button/link exists but clicking does nothing.

**Causes**:
1. Event handler not attached
2. `innerHTML` overwrote element with handler
3. JavaScript error preventing initialization
4. Wrong selector in event delegation

**Diagnostic**:
```javascript
// In browser console:
// 1. Check if element exists
document.querySelector('[data-action="my-action"]');

// 2. Check if action is registered
window.ActionRegistry['my-action'];

// 3. Check for JavaScript errors
// Look at Console tab in DevTools

// 4. Check if Utils loaded
typeof window.Utils.showToast;
```

**Fix Pattern**:
```javascript
// Ensure action is registered BEFORE render
Utils.registerAction('my-action', async (target) => {
  console.log('Action triggered', target);
  // Implementation
});

// Ensure element has correct attributes
function renderElement() {
  return `<button data-action="my-action" data-id="${id}">Click</button>`;
}
```

### 8.2 Modal Not Appearing

**Symptom**: Clicking triggers nothing, no modal shows.

**Causes**:
1. `Utils.showModal` not available (ui-utils.js not loaded)
2. JavaScript error in handler
3. Modal CSS not loaded

**Diagnostic**:
```javascript
// Check Utils available
typeof window.Utils.showModal;  // should be "function"
typeof window.Utils.showPrompt; // should be "function"
typeof window.Utils.showConfirm; // should be "function"

// Test modal directly
window.Utils.showModal('Test', 'Does this appear?', [
  { label: 'OK', primary: true, value: true }
]);
```

**Fix**: Ensure ui-utils.js loads BEFORE page scripts in index.html.

### 8.3 API Calls Failing Silently

**Symptom**: Action appears to do nothing, no error shown.

**Cause**: Missing error handling in async function.

**Wrong**:
```javascript
async function handleClick() {
  const data = await API.api('POST', '/api/action');
  // If API fails, nothing happens
}
```

**Correct**:
```javascript
async function handleClick() {
  try {
    const data = await API.api('POST', '/api/action');
    Utils.showToast('Success', 'success');
  } catch (err) {
    Utils.handleApiError('perform action', err);
  }
}
```

### 8.4 Changes Not Appearing After Edit

**Symptom**: Edited file but browser shows old version.

**Diagnostic Checklist**:
```bash
# 1. Verify file was saved
cat sparkq/ui/pages/dashboard.js | grep "your-change"

# 2. Sync to dist
./sparkq.sh sync-ui

# 3. Verify dist was updated
cat sparkq/ui/dist/dashboard.js | grep "your-change"

# 4. Check if same content
diff sparkq/ui/pages/dashboard.js sparkq/ui/dist/dashboard.js

# 5. Clear browser cache
# Ctrl+Shift+R in browser
```

### 8.5 "Utils is undefined" or "API is undefined"

**Symptom**: JavaScript error in console about undefined globals.

**Cause**: Script loading order incorrect.

**Correct Loading Order** (in index.html):
```html
<!-- MUST BE IN THIS ORDER -->
<script src='dist/ui-utils.js'></script>   <!-- 1. Utils first -->
<script src='dist/app-core.js'></script>   <!-- 2. Core second -->
<script src='dist/quick-add.js'></script>  <!-- 3. Components -->
<script src='dist/dashboard.js'></script>  <!-- 4. Pages last -->
<script src='dist/config.js'></script>
```

### 8.6 Database Lock Errors

**Symptom**: "database is locked" error.

**Causes**:
1. Long-running transaction blocking
2. WAL checkpoint running
3. Multiple processes accessing DB

**Fix**:
```python
# Increase lock timeout in storage.py
DB_LOCK_TIMEOUT = 10.0  # seconds

def connection(self):
    conn = sqlite3.connect(
        self.db_path,
        timeout=DB_LOCK_TIMEOUT,
        isolation_level="IMMEDIATE"
    )
    conn.execute("PRAGMA journal_mode=WAL")
    return conn
```

---

## 9. Playbook: Common Operations

### 9.1 Adding a New API Endpoint

```bash
# 1. Define Pydantic models (if needed)
# Edit: sparkq/src/models.py

# 2. Add storage method
# Edit: sparkq/src/storage.py

# 3. Add API endpoint
# Edit: sparkq/src/api.py

# 4. Write tests
# Create/Edit: sparkq/tests/integration/test_api.py

# 5. Run tests
pytest sparkq/tests/integration/test_api.py -v -k "test_new_endpoint"

# 6. Manual verification
curl -X POST http://localhost:5005/api/new-endpoint \
  -H "Content-Type: application/json" \
  -d '{"key": "value"}'
```

### 9.2 Adding a New UI Page

```bash
# 1. Create page module
# Create: sparkq/ui/pages/newpage.js

# 2. Follow IIFE pattern (see Section 5.2)

# 3. Add script tag to index.html
# Edit: sparkq/ui/index.html
# Add: <script src='dist/newpage.js'></script>

# 4. Add route handling (if needed)
# Edit: sparkq/ui/core/app-core.js

# 5. Sync to dist
./sparkq.sh sync-ui

# 6. Test in browser
# Navigate to new page
# Check Console for errors
```

### 9.3 Adding a New Button with Action

```javascript
// 1. Register action (in page module or app-core.js)
Utils.registerAction('my-new-action', async (target, event) => {
  const itemId = target.dataset.itemId;
  if (!itemId) {
    console.error('No item ID provided');
    return;
  }

  try {
    await API.api('POST', `/api/items/${itemId}/action`);
    Utils.showToast('Action completed', 'success');
  } catch (err) {
    Utils.handleApiError('perform action', err);
  }
});

// 2. Render button with data-action
function renderItem(item) {
  return `
    <div class="item-row">
      <span>${item.name}</span>
      <button
        class="button primary"
        data-action="my-new-action"
        data-item-id="${item.id}"
      >
        Do Action
      </button>
    </div>
  `;
}

// 3. Sync and test
// ./sparkq.sh sync-ui
// Ctrl+Shift+R in browser
```

### 9.4 Fixing a Broken Modal

```bash
# 1. Check if Utils.showModal exists
# In browser console:
typeof window.Utils.showModal

# 2. If undefined, check script loading order in index.html
# ui-utils.js MUST load before page scripts

# 3. Check for JavaScript errors in ui-utils.js
node -c sparkq/ui/utils/ui-utils.js

# 4. Verify CSS exists for modal
grep "modal-overlay" sparkq/ui/style.css
grep "modal-content" sparkq/ui/style.css

# 5. Test modal directly in console
window.Utils.showModal('Test', 'Content', [
  { label: 'Cancel', value: false },
  { label: 'OK', primary: true, value: true }
]).then(console.log);
```

### 9.5 Debugging Non-Functional Form

```javascript
// 1. Check form element exists
const form = document.getElementById('my-form');
console.log('Form found:', !!form);

// 2. Check if submit handler attached
// Add temporary handler to verify
form.addEventListener('submit', (e) => {
  console.log('Submit triggered');
  e.preventDefault();
});

// 3. Check validation
Utils.attachValidationHandlers(form);
const isValid = Utils.validateRequiredFields(form);
console.log('Form valid:', isValid);

// 4. Check form data
const formData = new FormData(form);
console.log('Form data:', Object.fromEntries(formData));

// 5. Check API endpoint works
const data = Object.fromEntries(formData);
API.api('POST', '/api/endpoint', data)
  .then(r => console.log('Success:', r))
  .catch(e => console.error('Error:', e));
```

---

## 10. Checklists

### 10.1 Pre-Change Checklist

```
□ Server is running (curl http://localhost:5005/health)
□ Database is accessible (ls sparkq/data/sparkq.db)
□ UI is synced (./sparkq.sh sync-ui)
□ Tests pass (pytest sparkq/tests/ -v --tb=short)
□ Read target files before editing
```

### 10.2 UI Change Checklist

```
□ Source file edited correctly
□ Synced to dist (./sparkq.sh sync-ui)
□ No JavaScript syntax errors (node -c file.js)
□ Browser hard-refreshed (Ctrl+Shift+R)
□ Console shows no errors
□ Element renders correctly
□ Event handlers work
□ API calls succeed
□ Error states handled
□ Loading states shown
□ Both source AND dist files staged for commit
```

### 10.3 Backend Change Checklist

```
□ Read existing code first
□ Follow error handling pattern (domain errors in storage)
□ Use constants for timeouts/multipliers
□ Use context manager for DB connections
□ Input validation via Pydantic
□ Unit tests written/updated
□ Integration tests pass
□ No hardcoded values
□ Docstrings for public methods
```

### 10.4 API Endpoint Checklist

```
□ Pydantic model for request body
□ Pydantic model for response
□ Storage method implemented
□ Error handling (try/except with proper HTTP codes)
□ Integration test written
□ Manual curl test passes
□ OpenAPI docs updated (automatic with FastAPI)
```

### 10.5 Test Writing Checklist

```
□ Use fixtures from conftest.py
□ Test happy path
□ Test error cases (not found, validation, etc.)
□ Test edge cases (empty, null, max values)
□ Clean up test data (fixtures handle this)
□ Test is deterministic (no random, no time-dependent)
□ Test runs in isolation (no dependency on other tests)
```

### 10.6 Pre-Commit Checklist

```
□ All tests pass (pytest sparkq/tests/ -v)
□ No syntax errors (python -m py_compile src/*.py)
□ UI synced if changed (./sparkq.sh sync-ui)
□ Both source and dist files staged
□ Commit message describes "why" not "what"
□ No secrets in commit (.env, credentials)
□ No debug print statements left
```

---

## 11. Debugging Guide

### 11.1 Systematic Debugging Process

```
1. REPRODUCE: Can you consistently trigger the bug?
2. ISOLATE: What is the smallest input that causes the bug?
3. LOCATE: Which file/function is responsible?
4. UNDERSTAND: Why does the bug occur?
5. FIX: Make minimal change to fix root cause
6. VERIFY: Does fix resolve the issue?
7. TEST: Do existing tests still pass?
8. PREVENT: Add test to catch regression
```

### 11.2 JavaScript Debugging

```javascript
// Enable verbose logging temporarily
console.log('[DEBUG] Function called with:', arguments);

// Check DOM state
console.log('[DEBUG] Element:', document.getElementById('my-element'));
console.log('[DEBUG] Classes:', element.classList);
console.log('[DEBUG] Dataset:', element.dataset);

// Check global state
console.log('[DEBUG] API:', window.API);
console.log('[DEBUG] Utils:', window.Utils);
console.log('[DEBUG] Pages:', window.Pages);
console.log('[DEBUG] ActionRegistry:', window.ActionRegistry);

// Trace event flow
document.addEventListener('click', (e) => {
  console.log('[DEBUG] Click on:', e.target);
  console.log('[DEBUG] Closest action:', e.target.closest('[data-action]'));
}, true);
```

### 11.3 Python Debugging

```python
# Add logging
import logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

def problematic_function(arg):
    logger.debug(f"Called with: {arg}")
    # ... code ...
    logger.debug(f"Result: {result}")
    return result

# Use breakpoint (Python 3.7+)
def problematic_function(arg):
    breakpoint()  # Drops into pdb
    # ... code ...

# Print SQL queries
import sqlite3
sqlite3.enable_callback_tracebacks(True)

# In storage.py, add query logging
def connection(self):
    conn = sqlite3.connect(self.db_path)
    conn.set_trace_callback(print)  # Prints all SQL
    return conn
```

### 11.4 API Debugging

```bash
# Verbose curl output
curl -v http://localhost:5005/api/endpoint

# Check request/response headers
curl -i http://localhost:5005/api/endpoint

# Pretty print JSON
curl http://localhost:5005/api/endpoint | jq .

# Test POST with data
curl -X POST http://localhost:5005/api/endpoint \
  -H "Content-Type: application/json" \
  -d '{"key": "value"}' | jq .

# Check error response
curl -s http://localhost:5005/api/nonexistent | jq .
```

### 11.5 Database Debugging

```bash
# Open SQLite CLI
sqlite3 sparkq/data/sparkq.db

# List tables
.tables

# Show table schema
.schema tasks

# Query with headers
.headers on
.mode column
SELECT * FROM tasks LIMIT 5;

# Check WAL mode
PRAGMA journal_mode;

# Check for locks
PRAGMA lock_status;
```

---

## 12. Code Examples

### 12.1 Complete Page Module Template

```javascript
// sparkq/ui/pages/example.js
(function(Pages, API, Utils, Components) {
  'use strict';

  // ===== PRIVATE STATE =====
  let pageData = null;
  let isLoading = false;

  // ===== PRIVATE HELPERS =====

  async function fetchData() {
    try {
      const response = await API.api('GET', '/api/example');
      return response.items || [];
    } catch (err) {
      Utils.handleApiError('load example data', err);
      return [];
    }
  }

  function renderLoading(container) {
    container.innerHTML = `
      <div class="card">
        <div class="loading-state">
          <span class="loading"></span>
          <p>Loading...</p>
        </div>
      </div>
    `;
  }

  function renderError(container, message) {
    container.innerHTML = `
      <div class="card">
        <div class="error-state">
          <p class="error">${message}</p>
          <button class="button primary" data-action="example-retry">
            Retry
          </button>
        </div>
      </div>
    `;
  }

  function renderContent(container, items) {
    if (!items || items.length === 0) {
      container.innerHTML = `
        <div class="card">
          <div class="empty-state">
            <p>No items found</p>
            <button class="button primary" data-action="example-create">
              Create First Item
            </button>
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h2>Example Items</h2>
          <button class="button primary" data-action="example-create">
            New Item
          </button>
        </div>
        <div class="card-body">
          <table class="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(renderRow).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderRow(item) {
    return `
      <tr data-item-id="${item.id}">
        <td>${Utils.formatValue(item.name)}</td>
        <td>
          <span class="badge badge-${item.status}">
            ${item.status}
          </span>
        </td>
        <td>
          <button
            class="button small"
            data-action="example-edit"
            data-item-id="${item.id}"
          >
            Edit
          </button>
          <button
            class="button small danger"
            data-action="example-delete"
            data-item-id="${item.id}"
          >
            Delete
          </button>
        </td>
      </tr>
    `;
  }

  // ===== ACTION HANDLERS =====

  async function handleCreate() {
    const name = await Utils.showPrompt(
      'Create Item',
      'Enter item name:',
      '',
      { placeholder: 'Item name' }
    );

    if (!name) return;

    try {
      await API.api('POST', '/api/example', { name });
      Utils.showToast('Item created', 'success');
      await refresh();
    } catch (err) {
      Utils.handleApiError('create item', err);
    }
  }

  async function handleEdit(target) {
    const itemId = target.dataset.itemId;
    if (!itemId) return;

    const item = pageData?.find(i => i.id === itemId);
    if (!item) return;

    const newName = await Utils.showPrompt(
      'Edit Item',
      'Enter new name:',
      item.name,
      { placeholder: 'Item name' }
    );

    if (!newName || newName === item.name) return;

    try {
      await API.api('PUT', `/api/example/${itemId}`, { name: newName });
      Utils.showToast('Item updated', 'success');
      await refresh();
    } catch (err) {
      Utils.handleApiError('update item', err);
    }
  }

  async function handleDelete(target) {
    const itemId = target.dataset.itemId;
    if (!itemId) return;

    const confirmed = await Utils.showConfirm(
      'Delete Item',
      'Are you sure you want to delete this item?',
      { confirmLabel: 'Delete', cancelLabel: 'Cancel' }
    );

    if (!confirmed) return;

    try {
      await API.api('DELETE', `/api/example/${itemId}`);
      Utils.showToast('Item deleted', 'success');
      await refresh();
    } catch (err) {
      Utils.handleApiError('delete item', err);
    }
  }

  // ===== MAIN RENDER =====

  async function refresh() {
    const container = document.getElementById('example-page');
    if (!container) return;
    await render(container);
  }

  async function render(container) {
    if (!container) {
      console.error('[Example] Container not found');
      return;
    }

    if (isLoading) return;
    isLoading = true;

    renderLoading(container);

    try {
      pageData = await fetchData();
      renderContent(container, pageData);
    } catch (err) {
      renderError(container, err.message || 'Failed to load data');
    } finally {
      isLoading = false;
    }
  }

  // ===== REGISTER ACTIONS =====

  Utils.registerAction('example-create', handleCreate);
  Utils.registerAction('example-edit', handleEdit);
  Utils.registerAction('example-delete', handleDelete);
  Utils.registerAction('example-retry', refresh);

  // ===== EXPORT =====

  Pages.Example = {
    render,
    refresh
  };

})(window.Pages, window.API, window.Utils, window.Components);
```

### 12.2 Complete API Endpoint Template

```python
# sparkq/src/api.py - Example endpoint

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List

router = APIRouter()

# ===== MODELS =====

class CreateExampleRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None

class UpdateExampleRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None

class ExampleResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    status: str
    created_at: str
    updated_at: Optional[str]

class ExampleListResponse(BaseModel):
    items: List[ExampleResponse]
    total: int

# ===== ENDPOINTS =====

@router.get("/api/example", response_model=ExampleListResponse)
async def list_examples(
    status: Optional[str] = None,
    limit: int = 100,
    offset: int = 0
):
    """List all example items."""
    try:
        items = storage.list_examples(
            status=status,
            limit=min(limit, 1000),
            offset=offset
        )
        total = storage.count_examples(status=status)
        return ExampleListResponse(items=items, total=total)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/example", response_model=ExampleResponse)
async def create_example(request: CreateExampleRequest):
    """Create a new example item."""
    try:
        item = storage.create_example(
            name=request.name,
            description=request.description
        )
        return ExampleResponse(**item)
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/api/example/{item_id}", response_model=ExampleResponse)
async def get_example(item_id: str):
    """Get a specific example item."""
    try:
        item = storage.get_example(item_id)
        return ExampleResponse(**item)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.put("/api/example/{item_id}", response_model=ExampleResponse)
async def update_example(item_id: str, request: UpdateExampleRequest):
    """Update an example item."""
    try:
        updates = request.dict(exclude_unset=True)
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")

        item = storage.update_example(item_id, **updates)
        return ExampleResponse(**item)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/api/example/{item_id}")
async def delete_example(item_id: str):
    """Delete an example item."""
    try:
        storage.delete_example(item_id)
        return {"success": True, "id": item_id}
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
```

### 12.3 Complete Test Template

```python
# sparkq/tests/integration/test_example_api.py
import pytest
from fastapi.testclient import TestClient
from src.storage import Storage
from src import api

@pytest.fixture
def client(tmp_path, monkeypatch):
    """FastAPI test client with isolated database."""
    db_path = tmp_path / "test.db"
    storage = Storage(str(db_path))
    storage.init_db()

    api.storage = storage
    yield TestClient(api.app)

@pytest.fixture
def example_item(client):
    """Create a test example item."""
    response = client.post("/api/example", json={
        "name": "Test Item",
        "description": "Test description"
    })
    assert response.status_code == 200
    return response.json()

# ===== HAPPY PATH TESTS =====

def test_create_example(client):
    """Test creating an example item."""
    response = client.post("/api/example", json={
        "name": "New Item",
        "description": "New description"
    })

    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "New Item"
    assert data["description"] == "New description"
    assert "id" in data
    assert data["status"] == "active"

def test_get_example(client, example_item):
    """Test getting an example item."""
    response = client.get(f"/api/example/{example_item['id']}")

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == example_item["id"]
    assert data["name"] == example_item["name"]

def test_update_example(client, example_item):
    """Test updating an example item."""
    response = client.put(
        f"/api/example/{example_item['id']}",
        json={"name": "Updated Name"}
    )

    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Updated Name"
    assert data["description"] == example_item["description"]

def test_delete_example(client, example_item):
    """Test deleting an example item."""
    response = client.delete(f"/api/example/{example_item['id']}")

    assert response.status_code == 200
    assert response.json()["success"] is True

    # Verify deleted
    response = client.get(f"/api/example/{example_item['id']}")
    assert response.status_code == 404

def test_list_examples(client, example_item):
    """Test listing example items."""
    # Create another item
    client.post("/api/example", json={"name": "Second Item"})

    response = client.get("/api/example")

    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 2
    assert len(data["items"]) == 2

# ===== ERROR CASES =====

def test_create_example_invalid_name(client):
    """Test creating with empty name fails."""
    response = client.post("/api/example", json={
        "name": "",
        "description": "Test"
    })

    assert response.status_code == 422  # Pydantic validation error

def test_get_example_not_found(client):
    """Test getting non-existent item."""
    response = client.get("/api/example/nonexistent_id")

    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()

def test_update_example_not_found(client):
    """Test updating non-existent item."""
    response = client.put(
        "/api/example/nonexistent_id",
        json={"name": "New Name"}
    )

    assert response.status_code == 404

def test_delete_example_not_found(client):
    """Test deleting non-existent item."""
    response = client.delete("/api/example/nonexistent_id")

    assert response.status_code == 404

# ===== EDGE CASES =====

def test_create_example_max_length_name(client):
    """Test creating with maximum length name."""
    long_name = "x" * 255
    response = client.post("/api/example", json={
        "name": long_name
    })

    assert response.status_code == 200
    assert response.json()["name"] == long_name

def test_create_example_exceeds_max_length(client):
    """Test creating with name exceeding max length fails."""
    too_long = "x" * 256
    response = client.post("/api/example", json={
        "name": too_long
    })

    assert response.status_code == 422

def test_list_examples_with_pagination(client):
    """Test listing with pagination."""
    # Create 5 items
    for i in range(5):
        client.post("/api/example", json={"name": f"Item {i}"})

    # Get first page
    response = client.get("/api/example?limit=2&offset=0")
    data = response.json()
    assert len(data["items"]) == 2
    assert data["total"] == 5

    # Get second page
    response = client.get("/api/example?limit=2&offset=2")
    data = response.json()
    assert len(data["items"]) == 2

    # Get last page
    response = client.get("/api/example?limit=2&offset=4")
    data = response.json()
    assert len(data["items"]) == 1
```

---

## Appendix A: Quick Reference Commands

```bash
# Server
./sparkq.sh start         # Start server (background)
./sparkq.sh stop          # Stop server
./sparkq.sh run           # Start server (foreground)
./sparkq.sh setup         # Interactive setup

# UI
./sparkq.sh sync-ui       # Sync source to dist

# Testing
pytest sparkq/tests/ -v                     # All tests
pytest sparkq/tests/unit/ -v                # Unit tests only
pytest sparkq/tests/integration/ -v         # Integration tests
pytest sparkq/tests/ -v -k "test_api"       # Tests matching pattern
pytest sparkq/tests/ --cov=sparkq/src       # With coverage

# Syntax checking
python -m py_compile sparkq/src/api.py
node -c sparkq/ui/core/app-core.js

# Database
sqlite3 sparkq/data/sparkq.db ".tables"
sqlite3 sparkq/data/sparkq.db "SELECT * FROM tasks LIMIT 5;"

# API testing
curl http://localhost:5005/health | jq .
curl http://localhost:5005/api/version | jq .
```

---

## Appendix B: Error Code Reference

| HTTP Code | SparkQ Error | Meaning |
|-----------|--------------|---------|
| 400 | ValidationError | Invalid input, constraint violation |
| 404 | NotFoundError | Resource not found |
| 409 | ConflictError | State collision, duplicate operation |
| 422 | Pydantic Error | Request body validation failed |
| 500 | SparkQError | Internal server error |

---

## Appendix C: Task Status Flow

```
QUEUED → RUNNING → SUCCEEDED
              ↓
           FAILED
              ↓
        (can retry) → QUEUED
```

---

## Document Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | Dec 2024 | Initial release |

---

**END OF DOCUMENT**
