# Phase 9 UI/UX Implementation - Codex Prompts (Ready for Execution)

> Generated for: Complete Orchestration Pattern
> Total Prompts: 4 (for parallel execution)
> Estimated Wall-Clock Time: 20-30 minutes
> Cost: $0 (Codex subscription)

---

## PROMPT 1: API Config Endpoint

**File to modify**: `sparkq/src/api.py`
**Current file size**: ~530 lines
**Changes**: Add 1 new endpoint after line 518 (after existing endpoints, before static file mount if needed)
**Estimated lines to add**: ~30 lines

```
Context: Phase 9 - UI/UX Enhancement. Add REST API endpoint to expose server configuration.

Reference: PHASE_9_IMPLEMENTATION_PLAN.md sections "API Backend Changes Needed" and "New Endpoint: /api/config"

Task: Add /api/config endpoint to sparkq/src/api.py that returns complete server configuration

File to create/modify: sparkq/src/api.py

Requirements:
- Add a new FastAPI GET endpoint at route "/api/config"
- Endpoint must be async and return a JSON response
- Must read sparkq.yml using YAML parser (yaml module already imported in project)
- Must use ToolRegistry.get_registry() to get tool and task_class definitions
- Response must include: server, database, purge, tools, task_classes sections
- Response format matches this exact structure (with real values from config):
  {
    "server": {"port": 8420, "host": "0.0.0.0"},
    "database": {"path": "sparkq/data/sparkq.db", "mode": "wal"},
    "purge": {"older_than_days": 3},
    "tools": {tool_name: {description, task_class}, ...},
    "task_classes": {class_name: {timeout}, ...}
  }
- Must include safe defaults if sparkq.yml missing
- Must handle missing config gracefully (return empty tools/classes dicts if file not found)
- Endpoint should be placed after the /api/scripts/index endpoint (around line 518)

Code patterns to follow:
- Match the style of other @app.get() endpoints in the file (lines 174-518)
- Import Path from pathlib (already imported)
- Import yaml if not already imported (already imported)
- Use try/except for file reading, not exceptions propagation
- Return dict directly (FastAPI auto-converts to JSON)
- Follow docstring pattern: '''Get complete server configuration'''

Specification:
```python
# Add after line 518, before file mount section

@app.get("/api/config")
async def get_config():
    '''Get complete server configuration'''
    from pathlib import Path
    from .tools import get_registry

    # Read sparkq.yml
    config_path = Path("sparkq.yml")
    server_config = {}
    database_config = {}
    purge_config = {}

    if config_path.exists():
        try:
            with open(config_path) as f:
                full_config = yaml.safe_load(f) or {}
                server_config = full_config.get("server", {})
                database_config = full_config.get("database", {})
                purge_config = full_config.get("purge", {})
        except Exception:
            pass  # Use defaults

    # Get tool registry
    registry = get_registry()

    return {
        "server": server_config or {"port": 8420, "host": "0.0.0.0"},
        "database": database_config or {"path": "sparkq/data/sparkq.db", "mode": "wal"},
        "purge": purge_config or {"older_than_days": 3},
        "tools": registry.tools or {},
        "task_classes": registry.task_classes or {},
    }
```

Validation:
- Python syntax valid: python -m py_compile sparkq/src/api.py
- Endpoint exists: grep -n "async def get_config" sparkq/src/api.py
- Returns valid JSON: curl http://localhost:8420/api/config | jq .
- No import errors: Server starts without errors (running process check)
```

---

## PROMPT 2: UI Refactoring + Config/Scripts Pages

**File to modify**: `sparkq/ui/app.js`
**Current file size**: 1566 lines
**Changes**: Reorganize into modules, add Config and Scripts page modules
**Estimated lines to add/modify**: ~350 lines (270 new, 80 modified)

```
Context: Phase 9 - UI/UX Enhancement. Refactor monolithic app.js into logical modules, add Config viewer and Scripts discovery pages.

Reference: PHASE_9_IMPLEMENTATION_PLAN.md sections "Codex Task Classification", "File Modification Plan", "Current State Assessment"

Task: Reorganize sparkq/ui/app.js from monolithic structure into namespace modules AND add two new page modules: Pages.Config and Pages.Scripts

File to create/modify: sparkq/ui/app.js

Requirements - REFACTORING (preserve all existing behavior):
- Add section comments to organize code into logical modules:
  // ===== STATE & GLOBALS =====
  // ===== API CLIENT =====
  // ===== UTILITIES =====
  // ===== COMPONENTS =====
  // ===== PAGES =====
  // ===== MAIN APP =====
- Move lines 1-30 (constants, init) into "STATE & GLOBALS" section
- Create "API CLIENT" section with api() and safeJson() functions (lines 186-231)
- Create "UTILITIES" section with utility functions (lines 300-527)
- Create "COMPONENTS" section with UI helpers like showAlert(), showError(), markFieldError() etc (lines 313-527)
- Create "PAGES" section with all existing page render functions
- Do NOT change any function behavior or logic, only reorganize and add comments
- Ensure pages object still caches all page containers in cachePages() function

Requirements - NEW PAGES:
1. Add Pages.Config module (after Pages.Enqueue, before closing code):
   - Async function that fetches /api/config
   - Display config data in organized sections:
     * Server section: port, host
     * Database section: path, mode
     * Purge section: older_than_days
     * Tools section: display as table with columns: Tool Name, Description, Task Class
     * Task Classes section: display as table with columns: Class Name, Timeout
   - Use existing card/table styles from current pages
   - Add error handling (showError on fetch fail)
   - Loading state: "Loading configuration…"
   - No actions/buttons needed, read-only view

2. Add Pages.Scripts module (after Pages.Config):
   - Async function that calls loadScriptIndex() to get scripts array
   - Display scripts in a table or cards
   - Table columns: Name, Description, Timeout, Task Class, Inputs, Outputs
   - Add search input that filters scripts by name/description (case-insensitive)
   - Add task_class filter dropdown (populated from unique task classes in scripts)
   - Show count: "Found X scripts"
   - Link each script: clicking script name prefills enqueue form
   - Use existing script autocomplete pattern as reference
   - Error handling: show "No scripts loaded" if loadScriptIndex fails

Requirements - INTEGRATION:
- Update cachePages() to include config-page and scripts-page elements
- Update router() function to handle 'config' and 'scripts' page routes
- Add config and scripts to pages initialization (line 30-35)
- No changes to existing page logic (dashboard, sessions, streams, tasks, enqueue)

Code patterns to follow:
- Match existing async page render functions (renderTasksPage, renderEnqueuePage pattern)
- Use existing API error handling (handleApiError function)
- Use existing card and table HTML structure
- Use existing CSS classes (card, grid, grid-2, table, input-group, etc)
- Follow modal pattern for any detail views (already exists for tasks)
- Reuse existing formatValue, formatNumber utility functions

Specification:
[Provide exact module reorganization structure and new page function skeletons - focus on:
1. Reorganizing into sections with comments
2. Adding Pages.Config with config display logic
3. Adding Pages.Scripts with script listing and search
4. Updating cachePages() and router() for new pages
5. Ensuring all existing functionality preserved]

Validation:
- No syntax errors: node -c sparkq/ui/app.js (or browser console check)
- Module structure present: grep "// ===== " sparkq/ui/app.js | wc -l (should show 6)
- Pages exist: grep "Pages.Config\|Pages.Scripts" sparkq/ui/app.js | wc -l (should show at least 2)
- No behavior change: existing pages (dashboard, tasks, enqueue, etc) still work exactly as before
- UI loads: curl http://localhost:8420/ui/ returns valid HTML
- No TODO/FIXME left: grep -i "TODO\|FIXME" sparkq/ui/app.js | grep -v "^//.*//.*TODO" (should be 0)
```

---

## PROMPT 3: HTML Structure Updates

**File to modify**: `sparkq/ui/index.html`
**Current file size**: 33 lines
**Changes**: Add nav tabs and page containers
**Estimated lines to add**: ~8-10 lines

```
Context: Phase 9 - UI/UX Enhancement. Add HTML structure for config and scripts pages, plus breadcrumb navigation.

Task: Update sparkq/ui/index.html to add new page containers and navigation elements

File to create/modify: sparkq/ui/index.html

Requirements:
- Add two new nav tab buttons in the nav-tabs section (after enqueue tab):
  <button class='nav-tab' data-page='config'>Config</button>
  <button class='nav-tab' data-page='scripts'>Scripts</button>
- Add two new page content divs in the main section (after enqueue-page):
  <div id='config-page' class='page-content'></div>
  <div id='scripts-page' class='page-content'></div>
- Add breadcrumb navigation container before or after main (optional, can be styled to visibility: hidden initially):
  <div id='breadcrumbs' class='breadcrumbs'></div>
- Do NOT modify any existing HTML structure, only add new elements
- Preserve all existing classes and attributes

Code patterns to follow:
- Match existing nav-tab button structure (line 13-17)
- Match existing page-content div structure (line 23-27)
- Use same naming convention: data-page attribute matches div id-page pattern
- Keep minimal markup, no inline styles

Specification:
In nav-tabs section (after line 17):
<button class='nav-tab' data-page='config'>Config</button>
<button class='nav-tab' data-page='scripts'>Scripts</button>

In main section (after line 27):
<div id='config-page' class='page-content'></div>
<div id='scripts-page' class='page-content'></div>

After main section (before closing body):
<div id='breadcrumbs' class='breadcrumbs'></div>

Validation:
- HTML valid: HTML validation checker or browser dev tools
- New elements present: grep -c "config-page\|scripts-page\|breadcrumbs" sparkq/ui/index.html (should be 3)
- Nav tabs added: grep "data-page='config'" sparkq/ui/index.html (should find 1)
- All existing structure preserved: curl http://localhost:8420/ui/ loads without errors
```

---

## PROMPT 4: CSS Styling Enhancements

**File to modify**: `sparkq/ui/style.css`
**Current file size**: ~580 lines
**Changes**: Add breadcrumb, pagination, and mobile responsive styles
**Estimated lines to add**: ~60-80 lines

```
Context: Phase 9 - UI/UX Enhancement. Add CSS styles for new UI components and mobile responsiveness.

Task: Add CSS styles for breadcrumb navigation, pagination controls, modal a11y improvements, and mobile media queries

File to create/modify: sparkq/ui/style.css

Requirements:
1. Breadcrumb Navigation Styles (15-20 lines):
   - .breadcrumbs container: display flex, gap, padding
   - .breadcrumb-item: padding, cursor pointer
   - .breadcrumb-separator: margin, color
   - .breadcrumb-active: color (use var(--accent) or var(--text))
   - Hover effect on clickable items

2. Pagination Styles (10-15 lines):
   - .pagination-container: display flex, gap, justify-content, align-items
   - .pagination-button: padding, border, background, cursor, transition
   - .pagination-button:disabled: opacity, cursor
   - .pagination-info: font-size smaller, color var(--subtle)

3. Modal A11y Styles (10-15 lines):
   - .modal:focus: outline (using --accent color)
   - .modal-content:focus-within: outline effects
   - .modal-close-button:focus: visible focus ring
   - Smooth transitions for focus states

4. Mobile Responsive Styles (20-30 lines):
   - @media (max-width: 768px):
     * Stack grid layouts: grid-template-columns: 1fr
     * Increase touch targets: min-height: 44px for buttons
     * Adjust padding/margin for mobile
     * Make modal full-screen or increase size
   - @media (max-width: 480px):
     * Further reduce padding
     * Stack navbar tabs vertically or in smaller row
     * Simplify table layout or horizontal scroll
   - Use existing CSS variables (--bg, --surface, --text, --accent, --border, etc)

Code patterns to follow:
- Follow existing CSS structure and variable usage
- Match indentation and formatting style
- Use CSS custom properties (var(--*)) consistently
- Include comments for new sections: /* Breadcrumb Navigation */ etc
- Use transition: all 0.15s ease for interactions (matches existing pattern)
- Use border-radius: 10px or 14px to match existing components

Specification:
Add after main styles, before closing of file:

/* ===== BREADCRUMB NAVIGATION ===== */
.breadcrumbs {
  display: flex;
  gap: 8px;
  padding: 12px 0;
  align-items: center;
  flex-wrap: wrap;
}

.breadcrumb-item {
  padding: 4px 8px;
  cursor: pointer;
  color: var(--accent);
  transition: opacity 0.15s ease;
}

.breadcrumb-item:hover {
  opacity: 0.8;
}

.breadcrumb-separator {
  color: var(--subtle);
  margin: 0 4px;
}

.breadcrumb-active {
  color: var(--text);
  cursor: default;
}

/* ===== PAGINATION ===== */
.pagination-container {
  display: flex;
  gap: 12px;
  justify-content: center;
  align-items: center;
  margin-top: 16px;
  padding: 12px;
}

.pagination-button {
  padding: 8px 12px;
  background: var(--muted);
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text);
  cursor: pointer;
  transition: all 0.15s ease;
  min-height: 36px;
  min-width: 36px;
}

.pagination-button:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}

.pagination-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pagination-info {
  color: var(--subtle);
  font-size: 13px;
}

/* ===== MODAL A11Y IMPROVEMENTS ===== */
.modal:focus {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.modal-content:focus-within {
  outline: none;
}

/* ===== MOBILE RESPONSIVE ===== */
@media (max-width: 768px) {
  .grid-2 {
    grid-template-columns: 1fr;
  }

  button, input, select, textarea {
    min-height: 44px;
  }

  .card {
    padding: 12px;
  }

  .modal-content {
    width: 95vw;
    max-height: 90vh;
    padding: 16px;
  }

  .table {
    font-size: 13px;
  }

  .nav-tabs {
    flex-direction: row;
    gap: 4px;
  }

  .nav-tab {
    padding: 6px 10px;
    font-size: 13px;
  }
}

@media (max-width: 480px) {
  .container {
    padding: 12px;
  }

  .card {
    padding: 8px;
  }

  .navbar {
    flex-wrap: wrap;
    gap: 8px;
  }

  .nav-tabs {
    flex: 1 1 100%;
    gap: 4px;
  }

  .modal-content {
    width: 100vw;
    height: 100vh;
    border-radius: 0;
    padding: 12px;
  }
}

Validation:
- CSS syntax valid: CSS linter or browser dev tools
- Breadcrumb styles present: grep -c ".breadcrumb" sparkq/ui/style.css (should be 5+)
- Pagination styles present: grep -c ".pagination" sparkq/ui/style.css (should be 3+)
- Media queries present: grep -c "@media" sparkq/ui/style.css (should have 2+ media queries)
- No CSS errors: Load UI in browser, check dev tools for CSS parsing errors
- Mobile layout works: Test at 320px, 768px, 1024px viewport widths (visual check)
```

---

## Execution Instructions

Execute these 4 prompts in parallel across 4 terminal windows:

```bash
# Terminal 1 - API Endpoint
codex exec --full-auto -C /home/luce/apps/sparkqueue "[PROMPT 1 content above]"

# Terminal 2 - UI Refactoring + Pages
codex exec --full-auto -C /home/luce/apps/sparkqueue "[PROMPT 2 content above]"

# Terminal 3 - HTML Structure
codex exec --full-auto -C /home/luce/apps/sparkqueue "[PROMPT 3 content above]"

# Terminal 4 - CSS Styling
codex exec --full-auto -C /home/luce/apps/sparkqueue "[PROMPT 4 content above]"
```

**Wall-clock time**: 20-30 minutes (all 4 parallel)
**Expected output**: 4 modified files with combined ~350 lines added/modified
**Cost**: $0 (Codex subscription)

---

## Post-Execution Validation (Haiku)

After all 4 prompts complete, run validation commands from PHASE_9_IMPLEMENTATION_PLAN.md STEP 3.

All prompts are ready to execute. No additional context needed.
