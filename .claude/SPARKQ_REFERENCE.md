# SparkQ Reference Architecture - Quick Lookup

**Last Updated**: 2025-11-29 (Phase 13)

## Critical File Paths

```
sparkq/
├── src/
│   ├── api.py              # FastAPI server, all endpoints
│   ├── storage.py          # SQLite database layer
│   ├── cli.py              # Typer CLI commands
│   └── worker.py           # Task execution engine
├── ui/
│   ├── index.html          # Main HTML (navigation tabs)
│   ├── style.css           # Global styles
│   ├── core/
│   │   └── app-core.js     # Core: Router, API client, Utils (base)
│   ├── utils/
│   │   └── ui-utils.js     # Utils: formatTimestamp, showToast, AutoRefresh
│   ├── components/
│   │   └── quick-add.js    # QuickAdd component (chat-style enqueue)
│   └── pages/
│       ├── dashboard.js    # Dashboard page
│       ├── sessions.js     # Sessions list/CRUD
│       ├── streams.js      # Streams list/CRUD + QuickAdd integration
│       ├── tasks.js        # Tasks list/detail
│       ├── enqueue.js      # Manual enqueue form
│       ├── config.js       # Config page
│       └── scripts.js      # Scripts index
└── sparkq.db               # SQLite database
```

## Data Model Hierarchy

```
Project (hidden in UI since Phase 12)
  ├─ id: "prj_*"           (default: "prj_default")
  ├─ Sessions
  │   ├─ id: "ses_*"
  │   ├─ project_id        (always "prj_default")
  │   └─ Streams
  │       ├─ id: "str_*"
  │       ├─ session_id
  │       └─ Tasks
  │           ├─ id: "tsk_*"
  │           ├─ stream_id
  │           ├─ tool_name  ("llm-haiku", "llm-sonnet", "run-python", "run-bash")
  │           ├─ task_class ("LLM_LITE", "LLM_HEAVY", "MEDIUM_SCRIPT")
  │           ├─ status     ("queued", "running", "completed", "failed")
  │           └─ payload    (JSON string)
```

## API Endpoints Reference

### Sessions
- `GET /api/sessions` → `{sessions: [...]}`
- `POST /api/sessions` → `{session: {...}}`
  - Body: `{name: str}`
  - Returns: `{session: {id, name, project_id, ...}}`
- `GET /api/sessions/{session_id}` → `{session: {...}}`
- `PATCH /api/sessions/{session_id}` → `{session: {...}}`
- `DELETE /api/sessions/{session_id}` → `{message: "..."}`

### Streams
- `GET /api/streams` → `{streams: [...]}`
- `POST /api/streams` → `{stream: {...}}`
  - Body: `{name: str, session_id: str, instructions?: str}`
- `GET /api/streams/{stream_id}` → `{stream: {...}}`
- `GET /api/streams/{stream_id}/tasks` → `{tasks: [...]}`
- `PATCH /api/streams/{stream_id}` → `{stream: {...}}`
- `DELETE /api/streams/{stream_id}` → `{message: "..."}`

### Tasks
- `GET /api/tasks` → `{tasks: [...]}`
- `POST /api/tasks` → `{task_id: str, ...}`
  - Body: `{stream_id, tool_name, task_class, payload, timeout}`
- `POST /api/tasks/quick-add` → `{task_id: str, tool: str, task_class: str}` **← Phase 13**
  - Body: `{stream_id: str, mode: "llm"|"script", prompt?: str, script_path?: str, script_args?: str}`
  - Smart detection: <50 words → llm-haiku, ≥50 words → llm-sonnet
- `GET /api/tasks/{task_id}` → `{task: {...}}`
- `PATCH /api/tasks/{task_id}` → `{task: {...}}`
- `DELETE /api/tasks/{task_id}` → `{message: "..."}`

### Other
- `GET /health` → `{status: "ok", timestamp: "..."}`
- `GET /` → Serves index.html
- `GET /ui/*` → Static files

## JavaScript Global Objects

### window.API (from app-core.js)
```javascript
window.API = {
  api: async function(method, path, body, opts) {
    // Returns: response JSON
    // Throws: {message, status} on error
  }
}
```

### window.Utils (from app-core.js + ui-utils.js)

**Base Utils (app-core.js):**
```javascript
window.Utils = {
  // Formatting
  normalizeStatus(status)          // → "queued"|"running"|"completed"|"failed"
  formatStatusLabel(status)        // → Human-readable status
  formatNumber(n)                  // → "1,234"
  formatValue(val, fallback)       // → val || fallback

  // UI feedback
  showAlert(type, title, msg)      // Show alert banner
  dismissAlert()                   // Dismiss alert
  showError(msg)                   // Red error alert
  showSuccess(msg)                 // Green success alert

  // Errors
  handleApiError(action, err)      // Handle API errors

  // Helpers
  copyToClipboard(text)            // Copy to clipboard
  withButtonLoading(btn, fn)       // Button loading state
  attachValidationHandlers(form)   // Form validation
  clearFormErrors(form)            // Clear form errors
  setStatusIndicator(status)       // Update status dot
}
```

**Phase 13 Utils (ui-utils.js):**
```javascript
window.Utils.formatTimestamp(isoString)  // → "2m ago" | "Nov 29, 6:15 PM"
window.Utils.formatDuration(seconds)     // → "5m 30s" | "2h 15m"
window.Utils.showToast(msg, type)        // type: "success"|"error"|"warning"|"info"
window.Utils.AutoRefresh                 // Class for auto-refresh
```

### window.Pages (from page modules)
```javascript
window.Pages = {
  Dashboard: { render: async (container) => {...} },
  Sessions: { render: async (container) => {...} },
  Streams: { render: async (container) => {...} },
  Tasks: { render: async (container) => {...} },
  Enqueue: { render: async (container) => {...} },
  Config: { render: async (container) => {...} },
  Scripts: { render: async (container) => {...} }
}
```

### window.QuickAdd (from quick-add.js)
```javascript
class QuickAdd {
  constructor(containerId, streamId, streamName)
  render()                               // Render component
  setRefreshCallback(callback)          // Set callback for refresh after task add
  // Modes: 'llm' | 'script'
  // Enter key: Add task (Shift+Enter for newline)
}
```

## Common Patterns

### 1. Page Module Structure
```javascript
(function(Pages, API, Utils) {
  'use strict';

  const api = API.api;
  const formatTimestamp = Utils.formatTimestamp;
  const showToast = Utils.showToast;

  async function renderPageName(container) {
    if (!container) return;

    container.innerHTML = `<div class="card">...</div>`;

    try {
      const response = await api('GET', '/api/endpoint', null, {action: 'description'});
      // Process data
    } catch (err) {
      console.error('Error:', err);
      showToast('Error message', 'error');
    }
  }

  Pages.PageName = {
    async render(container) {
      await renderPageName(container);
    }
  };

})(window.Pages, window.API, window.Utils);
```

### 2. API Call Pattern
```javascript
// GET
const response = await api('GET', '/api/sessions', null, {action: 'load sessions'});
const sessions = response?.sessions || [];

// POST
const response = await api('POST', '/api/sessions',
  {name: 'my-session'},
  {action: 'create session'}
);
const session = response?.session;

// PATCH
const response = await api('PATCH', `/api/sessions/${sessionId}`,
  {name: 'updated-name'},
  {action: 'update session'}
);

// DELETE
await api('DELETE', `/api/sessions/${sessionId}`, null, {action: 'delete session'});
```

### 3. Storage Layer Patterns (Python)
```python
from sparkq.src.storage import Storage

storage = Storage('sparkq.db')

# Create operations return dict with 'id' key
task_dict = storage.create_task(
    stream_id=stream_id,
    tool_name='llm-haiku',
    task_class='LLM_LITE',
    payload=json.dumps({"prompt": "Hello"}),
    timeout=300
)
task_id = task_dict['id']  # IMPORTANT: Not just task_id!

# Get operations return dict or None
session = storage.get_session(session_id)
if not session:
    raise HTTPException(status_code=404, detail="Session not found")

# List operations return list of dicts
sessions = storage.list_sessions()  # Returns all from default project

# Update operations
storage.update_task_status(task_id, 'completed', result='...')
```

## Navigation & Routing

### HTML Structure (index.html)
```html
<nav class='navbar'>
  <button class='nav-tab active' data-tab='dashboard'>Dashboard</button>
  <button class='nav-tab' data-tab='sessions'>Sessions</button>
  <button class='nav-tab' data-tab='streams'>Streams</button>
  <button class='nav-tab' data-tab='tasks'>Tasks</button>
  <button class='nav-tab' data-tab='enqueue'>Enqueue</button>
  <button class='nav-tab' data-tab='config'>Config</button>
  <button class='nav-tab' data-tab='scripts'>Scripts</button>
</nav>

<main id='app' class='container'>
  <div id='dashboard-page' class='page-content'></div>
  <div id='sessions-page' class='page-content'></div>
  <div id='streams-page' class='page-content'></div>
  <div id='tasks-page' class='page-content'></div>
  <div id='enqueue-page' class='page-content'></div>
  <div id='config-page' class='page-content'></div>
  <div id='scripts-page' class='page-content'></div>
</main>
```

### Router Logic (app-core.js)
```javascript
// Navigate to page
navigateTo('sessions')  // Calls Pages.Sessions.render(container)

// Tab naming:
// - data-tab attribute: 'sessions'
// - Page container ID: 'sessions-page'
// - Page module: Pages.Sessions
// - Page file: sparkq/ui/pages/sessions.js
```

## Phase 13 Features

### Smart Task Detection
```javascript
// In /api/tasks/quick-add endpoint
const wordCount = prompt.split().length;
if (wordCount < 50) {
  tool_name = 'llm-haiku';
  task_class = 'LLM_LITE';
  timeout = 300;  // 5 min
} else {
  tool_name = 'llm-sonnet';
  task_class = 'LLM_HEAVY';
  timeout = 900;  // 15 min
}
```

### QuickAdd Component Usage
```javascript
// In streams.js or any page
const quickAdd = new window.QuickAdd('container-id', streamId, streamName);
quickAdd.setRefreshCallback(() => loadStreamDetails(container, streamId, streamName));
quickAdd.render();
```

### Auto-Refresh Pattern
```javascript
const autoRefresh = new Utils.AutoRefresh(60000);  // 60 seconds
autoRefresh.addCallback(() => {
  renderPage(container);  // Refresh callback
});
autoRefresh.start();

// Manual refresh
autoRefresh.refresh();  // Triggers all callbacks immediately
```

## Common Errors & Fixes

### 1. "Utils.X is not a function"
**Cause**: ui-utils.js replaced window.Utils instead of extending it
**Fix**: Use `window.Utils.X = X` instead of `window.Utils = {X}`

### 2. "Cannot read property 'id' of undefined"
**Cause**: storage.create_X() returns dict, not just ID
**Fix**:
```python
# WRONG
task_id = storage.create_task(...)
# RIGHT
task_dict = storage.create_task(...)
task_id = task_dict['id']
```

### 3. Page shows "Loading..." forever
**Cause**: API error not caught, missing data handling
**Fix**: Check browser console, verify API endpoint returns expected shape

### 4. 405 Method Not Allowed
**Cause**: Wrong HTTP method or missing route
**Fix**: Check @app.get/@app.post in api.py matches curl method

### 5. "X is not defined" in browser console
**Cause**: Script load order wrong or IIFE not exposing to window
**Fix**: Check index.html script order: core → utils → components → pages

## Server Management

```bash
# Start
./sparkq.sh --start

# Stop
./sparkq.sh --stop

# Restart
./sparkq.sh --stop && sleep 2 && ./sparkq.sh --start

# Check status
curl -s http://localhost:5005/health

# View logs (if configured)
tail -f logs/sparkq.log
```

## Database Quick Queries

```bash
sqlite3 sparkq.db

# List tables
.tables

# Check default project
SELECT * FROM projects WHERE id='prj_default';

# Count sessions
SELECT COUNT(*) FROM sessions;

# Recent tasks
SELECT id, stream_id, tool_name, status, created_at
FROM tasks
ORDER BY created_at DESC
LIMIT 10;

# Sessions with stream count
SELECT s.id, s.name, COUNT(st.id) as stream_count
FROM sessions s
LEFT JOIN streams st ON st.session_id = s.id
GROUP BY s.id;
```

## Quick Debugging Checklist

1. **JavaScript not loading?**
   - Check HTTP 200: `curl -I http://localhost:5005/ui/pages/X.js`
   - Check syntax: `node --check sparkq/ui/pages/X.js`

2. **API not responding?**
   - Check health: `curl http://localhost:5005/health`
   - Check endpoint exists in api.py
   - Check request body matches Pydantic model

3. **Page stuck loading?**
   - Open browser console (F12)
   - Look for red errors
   - Check Network tab for failed requests

4. **Data not appearing?**
   - Verify API returns data: `curl http://localhost:5005/api/X | jq`
   - Check response shape matches code expectations
   - Verify data extraction: `response?.items || []`

5. **Storage errors?**
   - Check database exists: `ls -la sparkq.db`
   - Verify table schema: `sqlite3 sparkq.db ".schema"`
   - Check foreign keys: session_id exists before creating stream

---

**Note**: This reference is for Claude's quick lookup during debugging and development. Update this file when adding new features or fixing architectural issues.
