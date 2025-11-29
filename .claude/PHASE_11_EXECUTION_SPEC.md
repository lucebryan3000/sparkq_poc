# Phase 11 - Modularize UI with IIFE Pattern - Complete Orchestration Execution Spec

> **Status**: Ready for execution (not planning)
> **Current app.js**: 2,204 lines (Phase 10 complete with all features)
> **Total Token Budget**: ~8K tokens (3K Sonnet + 4K Haiku + $0 Codex)
> **Execution Model**: Sonnet → Codex (parallel) → Haiku (validation)
> **Wall-clock time**: 25-35 minutes
> **Parallelization ratio**: 80% (7 pages + 2 docs parallel after core)
> **Verified Features**: ✅ Batch ops, Pagination, Shortcuts, Dark/Light mode, Copy-to-clipboard

---

## Task Analysis

### Tasks Identified (12 total)

| Task | Type | Priority | Dependencies |
|------|------|----------|--------------|
| 1. Extract core module | Codex | P1 (HARD) | None - FIRST |
| 2. Extract dashboard page | Codex | P2 | Core (Step 1) |
| 3. Extract sessions page | Codex | P2 | Core (Step 1) |
| 4. Extract streams page | Codex | P2 | Core (Step 1) |
| 5. Extract tasks page | Codex | P2 | Core (Step 1) |
| 6. Extract enqueue page | Codex | P2 | Core (Step 1) |
| 7. Extract config page | Codex | P2 | Core (Step 1) |
| 8. Extract scripts page | Codex | P2 | Core (Step 1) |
| 9. Update index.html | Codex | P1 | Core complete |
| 10. Create core/README.md | Codex | P3 | None (parallel) |
| 11. Create UI README.md | Codex | P3 | None (parallel) |
| 12. Validation & testing | Haiku | P1 | All files complete |

### Task Classification (Playbook Section 2)

- **Codex** (9 tasks): Pure code extraction/generation from spec, no decisions needed
- **Haiku** (1 task): Syntax validation, file structure verification
- **Manual** (2 tasks): Git operations (tag, commit)

---

## Dependency Analysis

### HARD Dependencies (BLOCKING)
- **Core module MUST complete before**: All 7 pages, HTML update, validation
  - Reason: Pages import from window.API, window.Utils, window.Pages
  - If core missing: ReferenceError on page loads

### SOFT Dependencies (SEQUENTIAL BUT NOT BLOCKING)
- HTML update should happen after core (small dependency)
- Validation should happen after all code files (logical order)

### NONE Dependencies (FULLY PARALLEL)
- All 7 page extractions are completely independent
- Documentation (READMEs) can happen in parallel with page extraction

---

## Execution Batches

### Batch 1 (Sequential): Core Module & HTML Update
**Duration**: 10-15 minutes | **Tokens**: 2K Sonnet

**Batch 1a: Core Module Extraction**
- Extract `sparkq/ui/core/app-core.js` from `app.js`
- Sections: STATE, API CLIENT, UTILITIES, COMPONENTS, MAIN APP
- Initialize window.API, window.Utils, window.Pages

**Batch 1b: HTML Update**
- Modify `sparkq/ui/index.html`
- Remove `<script src="app.js">`
- Add core + 7 page script tags in order

### Batch 2 (Parallel): All 7 Page Modules + 2 READMEs
**Duration**: 10-20 minutes (parallel) | **Tokens**: $0 Codex

**Batch 2a-2g (7 files, ALL IN PARALLEL)**:
- `pages/dashboard.js` (~80 lines)
- `pages/sessions.js` (~80 lines)
- `pages/streams.js` (~120 lines)
- `pages/tasks.js` (~420 lines)
- `pages/enqueue.js` (~370 lines)
- `pages/config.js` (~114 lines)
- `pages/scripts.js` (~145 lines)

**Batch 2h-2i (2 files, PARALLEL WITH PAGES)**:
- `core/README.md` (module documentation)
- `sparkq/ui/README.md` (architecture guide)

### Batch 3 (Sequential): Validation & Testing
**Duration**: 5-10 minutes | **Tokens**: 2K Haiku + 2K Sonnet (commit)

**Batch 3a**: Haiku validation
- Syntax check all files
- Import resolution check
- Placeholder detection (TODO, FIXME)

**Batch 3b**: Manual git operations
- Create tag: `git tag phase-11-complete`
- Create commit with message
- Verify status clean

---

## Step 1: Sonnet Prompt Generation

### Prompt 1: Core Module Extraction

```bash
codex exec --full-auto -C /home/luce/apps/sparkqueue "
Context: Phase 11 - UI Modularization - Core Module Extraction

Task: Extract core functionality from monolithic app.js into shared core module

File to create: sparkq/ui/core/app-core.js

Source file: sparkq/ui/app.js (currently ~1,866-2,200 lines)

Requirements:
- Extract 5 major sections from app.js (in this order):
  1. STATE & GLOBALS (~80 lines): Constants, global vars, filter state
  2. API CLIENT (~70 lines): api() function, safeJson() handler
  3. UTILITIES (~250 lines): Format functions, validators, DOM helpers
  4. COMPONENTS (~400 lines): UI builders, modals, forms, alerts
  5. MAIN APP (~200 lines): Router, initialization, event setup

Architecture:
- Add guards at top: if (!window.API) window.API = {}; etc.
- Mark section boundaries with comments
- At end, expose: window.API = { ...all API methods... };
- At end, expose: window.Utils = { ...all utility functions... };
- At end, expose: window.Pages = {}; (empty registry, pages fill it)
- Add DOMContentLoaded event listener that:
  - Calls cachePages()
  - Calls router(currentPage)
  - Sets up event listeners

File structure template:
'use strict';

// ===== INITIALIZATION GUARDS =====
if (!window.API) window.API = {};
if (!window.Utils) window.Utils = {};
if (!window.Pages) window.Pages = {};

// ===== STATE & GLOBALS =====
[Copy lines for constants, global objects, filters, caches]

// ===== API CLIENT =====
[Copy api() function and safeJson() error handler]

// ===== UTILITIES =====
[Copy all utility functions: formatTime, formatBytes, createElement, etc.]

// ===== COMPONENTS =====
[Copy UI helpers: showAlert, showError, showSuccess, modal builders, form builders]

// ===== MAIN APP =====
[Copy cachePages(), router(), event listener setup]

// Expose to window
window.API = { [all methods from API CLIENT] };
window.Utils = { [all functions from UTILITIES] };
window.Pages = {};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  cachePages();
  router(currentPage);
  setupEventListeners();
});

Validation:
- All 5 sections present and complete
- No syntax errors (will validate separately)
- window.API, window.Utils, window.Pages exported
- DOMContentLoaded handler present
- Total lines should be ~900-1000
"
```

### Prompt 2: Update HTML Script Tags

```bash
codex exec --full-auto -C /home/luce/apps/sparkqueue "
Context: Phase 11 - UI Modularization - HTML Script Tag Update

Task: Update index.html to load modularized scripts

File to modify: sparkq/ui/index.html

Current state: Has <script src=\"app.js\"></script> before closing </body>

Changes required:
1. Remove the line: <script src=\"app.js\"></script>
2. Add BEFORE closing </body> tag:

<!-- Core module must load first (initializes API, Utils, Pages) -->
<script src=\"core/app-core.js\"></script>

<!-- Page modules can load in any order -->
<script src=\"pages/dashboard.js\"></script>
<script src=\"pages/sessions.js\"></script>
<script src=\"pages/streams.js\"></script>
<script src=\"pages/tasks.js\"></script>
<script src=\"pages/enqueue.js\"></script>
<script src=\"pages/config.js\"></script>
<script src=\"pages/scripts.js\"></script>

Important:
- core/app-core.js MUST be first
- Page scripts can be in any order
- All script tags should be within <body> or before </html> close
- Preserve all other HTML unchanged

Validation:
- Single app.js line removed
- 8 new script lines added
- core/app-core.js is first
- All 7 pages listed
"
```

### Prompts 3-9: Page Module Extraction (7 parallel)

```bash
codex exec --full-auto -C /home/luce/apps/sparkqueue "
Context: Phase 11 - UI Modularization - Page Modules

Task: Extract page-specific code from app.js into modular files

All 7 page modules follow the SAME PATTERN:

File to create: sparkq/ui/pages/{PAGE}.js

Pattern (use for ALL pages):

(function(Pages, API, Utils) {

  // Private module scope - copy ALL page-specific functions/helpers here
  // For example, for Tasks page:
  // - renderTasksPage() function
  // - renderTaskDetail() modal function
  // - bulkFail() helper
  // - bulkRequeue() helper
  // - any other task-specific helpers

  // Register page in global Pages registry
  Pages.{PageName} = {
    async render(container) {
      // Call the main page render function
      // Example: await renderTasksPage();
    }
  };

})(window.Pages, window.API, window.Utils);

PAGES TO EXTRACT (7 total):

1. pages/dashboard.js (~80 lines)
   - Find: renderDashboardPage() in app.js
   - Register as: Pages.Dashboard
   - Helpers: any dashboard-specific functions

2. pages/sessions.js (~80 lines)
   - Find: renderSessionsPage() in app.js
   - Register as: Pages.Sessions
   - Helpers: session filters, sorting logic

3. pages/streams.js (~120 lines)
   - Find: renderStreamsPage() in app.js
   - Register as: Pages.Streams
   - Helpers: stream list rendering

4. pages/tasks.js (~420 lines)
   - Find: renderTasksPage() in app.js
   - Register as: Pages.Tasks
   - Helpers: renderTaskDetail(), bulkFail(), bulkRequeue(), ALL task logic

5. pages/enqueue.js (~370 lines)
   - Find: renderEnqueuePage() in app.js
   - Register as: Pages.Enqueue
   - Helpers: form validation, submit handling

6. pages/config.js (~114 lines)
   - Find: renderConfigPage() in app.js
   - Register as: Pages.Config
   - Helpers: config display, edit/save

7. pages/scripts.js (~145 lines)
   - Find: renderScriptsPage() in app.js
   - Register as: Pages.Scripts
   - Helpers: script list, execution history

For EACH page:
- Copy ALL related functions from app.js
- Wrap in IIFE with (Pages, API, Utils) parameters
- Register Pages.{PageName} = { async render(container) { ... } }
- Private helpers stay within IIFE scope
- Can call API.* and Utils.* from core module

Validation per page:
- IIFE wrapper correct
- Pages registry entry present
- All page functions copied
- No missing dependencies (check for API.*, Utils.* calls)
- Line count matches estimate (~80-420)
"
```

### Prompts 10-11: README Documentation (2 parallel)

```bash
codex exec --full-auto -C /home/luce/apps/sparkqueue "
Context: Phase 11 - UI Modularization - Documentation

Task 1: Create core/README.md - Core Module Documentation

File to create: sparkq/ui/core/README.md

Content should explain:

# Core Module (app-core.js)

## Purpose
Shared functionality for all page modules.

## What's Included
- **STATE & GLOBALS** (~80 lines): Constants, global state, filters
- **API CLIENT** (~70 lines): HTTP request handler, error handling
- **UTILITIES** (~250 lines): Format functions, validators, DOM helpers
- **COMPONENTS** (~400 lines): UI builders, modals, forms, alerts
- **MAIN APP** (~200 lines): Router, initialization, event listeners

## Module Exports (exposed as window.*)
- window.API: HTTP client and API methods
- window.Utils: Utility functions
- window.Pages: Page registry (empty at init, filled by page modules)

## Loading
Must load FIRST before any page modules.

Location: sparkq/ui/core/app-core.js
Size: ~900-1000 lines
Dependencies: None

## Usage in Page Modules
All pages can access:
- API.* methods (getTasks, getStreams, etc.)
- Utils.* functions (formatTime, createElement, etc.)
- window.Pages for registration

## Adding Features
1. Shared feature → Add to core/app-core.js
2. Page-specific feature → Add to pages/{page}.js
3. New page → Create pages/new-page.js, follow IIFE pattern
"
```

```bash
codex exec --full-auto -C /home/luce/apps/sparkqueue "
Context: Phase 11 - UI Modularization - Documentation

Task 2: Create UI README.md - Architecture Guide

File to create: sparkq/ui/README.md

Content should explain:

# SparkQueue UI Architecture (Phase 11+)

## Overview
The UI is split into modular IIFE-wrapped files for better code organization and parallel development.

## File Structure
\`\`\`
sparkq/ui/
├── core/
│   ├── app-core.js              # Shared: API, Utils, Components
│   └── README.md
├── pages/
│   ├── dashboard.js             # Dashboard page
│   ├── sessions.js              # Sessions page
│   ├── streams.js               # Streams page
│   ├── tasks.js                 # Tasks page (largest, ~420 lines)
│   ├── enqueue.js               # Enqueue form
│   ├── config.js                # Configuration page
│   └── scripts.js               # Scripts page
├── index.html                   # Main HTML (loads core + pages)
├── style.css                    # Unified styles
└── README.md                    # This file
\`\`\`

## Module Pattern (IIFE)

Each page module uses:
\`\`\`javascript
(function(Pages, API, Utils) {

  // Private scope - not accessible from outside
  const CACHE = {};
  function privateHelper() { }

  // Public registration in Pages registry
  Pages.TaskName = {
    async render(container) {
      // Page implementation
    }
  };

})(window.Pages, window.API, window.Utils);
\`\`\`

## Loading Order
1. index.html loads scripts
2. core/app-core.js (initializes API, Utils, Pages)
3. pages/*.js (any order - each registers in Pages)
4. DOMContentLoaded fires → Router starts

## Adding New Features

### Feature in Multiple Pages (goes to Core)
1. Add to core/app-core.js
2. Export in window.Utils or window.API
3. Import in pages via Utils.* or API.*

### Feature in One Page (stays Local)
1. Add to pages/{page}.js
2. Keep as private scope inside IIFE
3. Access via IIFE parameters (Pages, API, Utils)

### New Page Needed (Phase 12+)
1. Create pages/new-page.js
2. Follow IIFE pattern from existing pages
3. Add <script> tag in index.html
4. Register Pages.NewPage = { async render(container) { } }

## Performance
- 8 script files instead of 1
- HTTP/2 multiplexing handles this efficiently
- Total load time: < 2s (same as monolithic)
- Memory usage: < 50MB

## Development Workflow
1. Make changes to appropriate file
2. Browser auto-reload or manual refresh
3. Test in DevTools
4. No build step needed
5. Commit when working

## Troubleshooting

### \"API is undefined\" error
→ core/app-core.js didn't load
→ Check: core/app-core.js loads first in index.html

### \"Pages.{PageName} is undefined\"
→ pages/{page}.js didn't load
→ Check: Script tag in index.html
→ Check: Page file syntax (IIFE wrapper)

### Module-not-found errors
→ Use Utils.* and API.* from core
→ Import via IIFE parameters (Pages, API, Utils)
→ Don't use relative imports (IIFE pattern doesn't support them)
"
```

---

## Step 2: Codex Execution

### Batch 1 (Sequential)
```bash
# 1a: Core Module Extraction
codex exec --full-auto -C /home/luce/apps/sparkqueue "
Context: Phase 11 - UI Modularization - Core Module Extraction

Task: Extract core functionality from monolithic app.js into shared core module

File to create: sparkq/ui/core/app-core.js

Source file: sparkq/ui/app.js (currently ~1,866-2,200 lines)

Requirements:
- Extract 5 major sections from app.js (in this order):
  1. STATE & GLOBALS (~80 lines): Constants, global vars, filter state
  2. API CLIENT (~70 lines): api() function, safeJson() handler
  3. UTILITIES (~250 lines): Format functions, validators, DOM helpers
  4. COMPONENTS (~400 lines): UI builders, modals, forms, alerts
  5. MAIN APP (~200 lines): Router, initialization, event setup

Architecture:
- Add guards at top: if (!window.API) window.API = {}; etc.
- Mark section boundaries with comments
- At end, expose: window.API = { ...all API methods... };
- At end, expose: window.Utils = { ...all utility functions... };
- At end, expose: window.Pages = {}; (empty registry, pages fill it)
- Add DOMContentLoaded event listener that:
  - Calls cachePages()
  - Calls router(currentPage)
  - Sets up event listeners

File structure template:
'use strict';

// ===== INITIALIZATION GUARDS =====
if (!window.API) window.API = {};
if (!window.Utils) window.Utils = {};
if (!window.Pages) window.Pages = {};

// ===== STATE & GLOBALS =====
[Copy lines for constants, global objects, filters, caches]

// ===== API CLIENT =====
[Copy api() function and safeJson() error handler]

// ===== UTILITIES =====
[Copy all utility functions: formatTime, formatBytes, createElement, etc.]

// ===== COMPONENTS =====
[Copy UI helpers: showAlert, showError, showSuccess, modal builders, form builders]

// ===== MAIN APP =====
[Copy cachePages(), router(), event listener setup]

// Expose to window
window.API = { [all methods from API CLIENT] };
window.Utils = { [all functions from UTILITIES] };
window.Pages = {};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  cachePages();
  router(currentPage);
  setupEventListeners();
});

Validation:
- All 5 sections present and complete
- No syntax errors (will validate separately)
- window.API, window.Utils, window.Pages exported
- DOMContentLoaded handler present
- Total lines should be ~900-1000
"
```

### Batch 1b (Sequential after 1a)
```bash
# 1b: Update HTML Script Tags
codex exec --full-auto -C /home/luce/apps/sparkqueue "
Context: Phase 11 - UI Modularization - HTML Script Tag Update

Task: Update index.html to load modularized scripts

File to modify: sparkq/ui/index.html

Current state: Has <script src=\"app.js\"></script> before closing </body>

Changes required:
1. Remove the line: <script src=\"app.js\"></script>
2. Add BEFORE closing </body> tag:

<!-- Core module must load first (initializes API, Utils, Pages) -->
<script src=\"core/app-core.js\"></script>

<!-- Page modules can load in any order -->
<script src=\"pages/dashboard.js\"></script>
<script src=\"pages/sessions.js\"></script>
<script src=\"pages/streams.js\"></script>
<script src=\"pages/tasks.js\"></script>
<script src=\"pages/enqueue.js\"></script>
<script src=\"pages/config.js\"></script>
<script src=\"pages/scripts.js\"></script>

Important:
- core/app-core.js MUST be first
- Page scripts can be in any order
- All script tags should be within <body> or before </html> close
- Preserve all other HTML unchanged

Validation:
- Single app.js line removed
- 8 new script lines added
- core/app-core.js is first
- All 7 pages listed
"
```

### Batch 2 (All 7 Pages + 2 READMEs in PARALLEL)
```bash
# Run all of these in parallel (separate terminals or background)

# 2a: Dashboard page
codex exec --full-auto -C /home/luce/apps/sparkqueue "
Context: Phase 11 - UI Modularization - Dashboard Page Module

Task: Extract dashboard-specific code from app.js

File to create: sparkq/ui/pages/dashboard.js

Pattern:
(function(Pages, API, Utils) {
  // Copy renderDashboardPage() from app.js
  // Copy any dashboard-specific helpers

  Pages.Dashboard = {
    async render(container) {
      await renderDashboardPage();
    }
  };
})(window.Pages, window.API, window.Utils);

Size: ~80 lines
Dependencies: API.getStatus(), Utils.formatStatusLabel(), Utils.formatBytes()
"
```

```bash
# 2b: Sessions page
codex exec --full-auto -C /home/luce/apps/sparkqueue "
Context: Phase 11 - UI Modularization - Sessions Page Module

Task: Extract sessions-specific code from app.js

File to create: sparkq/ui/pages/sessions.js

Pattern:
(function(Pages, API, Utils) {
  // Copy renderSessionsPage() from app.js
  // Copy session list rendering helpers

  Pages.Sessions = {
    async render(container) {
      await renderSessionsPage();
    }
  };
})(window.Pages, window.API, window.Utils);

Size: ~80 lines
Dependencies: API.getStatus(), Utils functions
"
```

```bash
# 2c: Streams page
codex exec --full-auto -C /home/luce/apps/sparkqueue "
Context: Phase 11 - UI Modularization - Streams Page Module

Task: Extract streams-specific code from app.js

File to create: sparkq/ui/pages/streams.js

Pattern:
(function(Pages, API, Utils) {
  // Copy renderStreamsPage() from app.js
  // Copy stream list and stats helpers

  Pages.Streams = {
    async render(container) {
      await renderStreamsPage();
    }
  };
})(window.Pages, window.API, window.Utils);

Size: ~120 lines
Dependencies: API.getStreams(), Utils functions
"
```

```bash
# 2d: Tasks page (LARGEST)
codex exec --full-auto -C /home/luce/apps/sparkqueue "
Context: Phase 11 - UI Modularization - Tasks Page Module

Task: Extract tasks-specific code from app.js

File to create: sparkq/ui/pages/tasks.js

Pattern:
(function(Pages, API, Utils) {
  // Copy renderTasksPage() from app.js - MAIN PAGE FUNCTION
  // Copy renderTaskDetail() modal function
  // Copy ALL task-specific helpers:
  // - bulkFail(), bulkRequeue(), bulkRetry()
  // - filter functions
  // - task action handlers
  // - pagination logic (Phase 10 addition)
  // - keyboard shortcuts (Phase 10 addition)

  Pages.Tasks = {
    async render(container) {
      await renderTasksPage();
    }
  };
})(window.Pages, window.API, window.Utils);

Size: ~420 lines (largest page)
Dependencies: API.getTasks(), API.failTask(), API.requeueTask(), Utils functions
Critical: Must include ALL Phase 10 features (batch ops, pagination, shortcuts)
"
```

```bash
# 2e: Enqueue page
codex exec --full-auto -C /home/luce/apps/sparkqueue "
Context: Phase 11 - UI Modularization - Enqueue Page Module

Task: Extract enqueue form-specific code from app.js

File to create: sparkq/ui/pages/enqueue.js

Pattern:
(function(Pages, API, Utils) {
  // Copy renderEnqueuePage() from app.js
  // Copy form validation helpers
  // Copy payload editor functions
  // Copy submit handler

  Pages.Enqueue = {
    async render(container) {
      await renderEnqueuePage();
    }
  };
})(window.Pages, window.API, window.Utils);

Size: ~370 lines
Dependencies: API.enqueueTask(), Utils.validateEmail(), form helpers
"
```

```bash
# 2f: Config page
codex exec --full-auto -C /home/luce/apps/sparkqueue "
Context: Phase 11 - UI Modularization - Config Page Module

Task: Extract config-specific code from app.js

File to create: sparkq/ui/pages/config.js

Pattern:
(function(Pages, API, Utils) {
  // Copy renderConfigPage() from app.js
  // Copy config display logic
  // Copy edit/save handlers

  Pages.Config = {
    async render(container) {
      await renderConfigPage();
    }
  };
})(window.Pages, window.API, window.Utils);

Size: ~114 lines
Dependencies: API.getConfig(), API.saveConfig()
"
```

```bash
# 2g: Scripts page
codex exec --full-auto -C /home/luce/apps/sparkqueue "
Context: Phase 11 - UI Modularization - Scripts Page Module

Task: Extract scripts-specific code from app.js

File to create: sparkq/ui/pages/scripts.js

Pattern:
(function(Pages, API, Utils) {
  // Copy renderScriptsPage() from app.js
  // Copy script list rendering
  // Copy execution history display

  Pages.Scripts = {
    async render(container) {
      await renderScriptsPage();
    }
  };
})(window.Pages, window.API, window.Utils);

Size: ~145 lines
Dependencies: API.getScripts(), Utils functions
"
```

```bash
# 2h: core/README.md (PARALLEL WITH PAGES)
codex exec --full-auto -C /home/luce/apps/sparkqueue "
Context: Phase 11 - UI Modularization - Documentation

Task: Create core/README.md explaining core module

File to create: sparkq/ui/core/README.md

Content template:
# Core Module (app-core.js)

## Purpose
Shared functionality for all page modules: API client, utilities, UI components, state management.

## What's Included
- STATE & GLOBALS (~80 lines): Constants, global variables, filter state
- API CLIENT (~70 lines): api() function, safeJson() error handler
- UTILITIES (~250 lines): Format functions (formatTime, formatBytes), validators, DOM helpers
- COMPONENTS (~400 lines): UI builders (showAlert, showError, showSuccess), modal system, form builders
- MAIN APP (~200 lines): Router, initialization, event listener setup

## Exports (exposed to window)
- window.API: HTTP client with methods like getTasks(), failTask(), etc.
- window.Utils: Utility functions like formatTime(), createElement(), etc.
- window.Pages: Empty registry filled by page modules

## Loading
Loads FIRST in index.html (before all page modules).

## Size
~900-1000 lines total

## Dependencies
None - this is the foundation module

## Usage
All page modules access this module via window.* globals or IIFE parameters.
"
```

```bash
# 2i: UI README.md (PARALLEL WITH PAGES)
codex exec --full-auto -C /home/luce/apps/sparkqueue "
Context: Phase 11 - UI Modularization - Documentation

Task: Create sparkq/ui/README.md explaining overall architecture

File to create: sparkq/ui/README.md

Content template:
# SparkQueue UI Architecture (Phase 11+)

## Overview
Modular IIFE-wrapped components for code organization and parallel development.

## File Structure
\`\`\`
sparkq/ui/
├── core/
│   ├── app-core.js     # Shared API, Utils, Components (~1,000 lines)
│   └── README.md
├── pages/
│   ├── dashboard.js    # Dashboard (~80 lines)
│   ├── sessions.js     # Sessions (~80 lines)
│   ├── streams.js      # Streams (~120 lines)
│   ├── tasks.js        # Tasks (~420 lines) - LARGEST
│   ├── enqueue.js      # Enqueue form (~370 lines)
│   ├── config.js       # Config (~114 lines)
│   └── scripts.js      # Scripts (~145 lines)
├── index.html          # Main HTML (loads core + 7 pages)
├── style.css           # Unified CSS
└── README.md           # This file
\`\`\`

## Module Pattern
Each page uses IIFE:
\`\`\`javascript
(function(Pages, API, Utils) {
  Pages.PageName = {
    async render(container) { /* implementation */ }
  };
})(window.Pages, window.API, window.Utils);
\`\`\`

## Loading Order
1. index.html
2. core/app-core.js (MUST be first)
3. pages/*.js (any order)
4. DOMContentLoaded event triggers router

## Key Features
- Zero build system
- HTTP/2 multiplexing efficient for 8 files
- Easy to add new pages
- No circular dependencies
- ~2,100 lines total (same as monolithic, better organized)
"
```

---

## Step 3: Haiku Validation

### Validation Checkpoints

```bash
# After all Batch 2 files complete, run Haiku validation

# Checkpoint 1: Syntax validation
haiku exec "
Task: Validate JavaScript syntax of all Phase 11 files

Check files:
- sparkq/ui/core/app-core.js
- sparkq/ui/pages/dashboard.js
- sparkq/ui/pages/sessions.js
- sparkq/ui/pages/streams.js
- sparkq/ui/pages/tasks.js
- sparkq/ui/pages/enqueue.js
- sparkq/ui/pages/config.js
- sparkq/ui/pages/scripts.js

Validation steps:
1. No syntax errors (parse as valid JavaScript)
2. All IIFE wrappers closed properly (check parentheses)
3. No undefined globals (except window.Pages, window.API, window.Utils)
4. No TODO or FIXME comments
5. All files match size estimates (±10%)

Report:
- List any syntax errors found
- List any warnings
- Confirm all 8 files valid
"

# Checkpoint 2: Module structure verification
haiku exec "
Task: Verify module structure and registration

Check:
- core/app-core.js exports window.API, window.Utils, window.Pages
- All 7 pages register in Pages registry (Pages.Dashboard, Pages.Tasks, etc.)
- Each page has async render(container) method
- No file imports from other files (IIFE pattern, no imports)
- All IIFE parameters match: (Pages, API, Utils)

Report any issues found
"

# Checkpoint 3: HTML verification
haiku exec "
Task: Verify index.html script loading order

Check:
- <script src=\"core/app-core.js\"></script> is FIRST
- All 7 page scripts loaded after core
- No <script src=\"app.js\"></script> remains
- All paths relative and correct

Report any issues
"
```

---

## Token Breakdown

| Stage | Model | Task Count | Token Cost | Time |
|-------|-------|-----------|-----------|------|
| Prompt Gen | Sonnet | 11 prompts | 3K | 5 min |
| Batch 1 (Core + HTML) | Codex | 2 files | $0 | 8 min |
| Batch 2 (Pages + Docs) | Codex | 9 files (parallel) | $0 | 12 min |
| Validation | Haiku | 3 checkpoints | 4K | 5 min |
| **TOTAL** | **Mixed** | **12 tasks** | **~8K tokens** | **25-35 min** |

---

## Execution Timeline

```
Phase 11 Execution Timeline (Complete Orchestration)

Total Wall-Clock: 25-35 minutes

┌─────────────────────────────────────────────────────┐
│ Step 1: Sonnet Prompt Generation (5 min, serial)   │
│ - Generate 11 detailed Codex prompts               │
│ - Token cost: 3K (investment in clear specs)       │
└─────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────┐
│ Step 2a: Batch 1 Core + HTML (8 min, serial)       │
│ - Extract app-core.js                              │
│ - Update index.html                                │
│ - Token cost: $0 (Codex)                           │
│ - Blocker for Batch 2                              │
└──────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────────────────┐
│ Step 2b: Batch 2 Pages + Docs (12 min, PARALLEL)                │
│ ├─ pages/dashboard.js        (3 min)  \                          │
│ ├─ pages/sessions.js         (3 min)   \                         │
│ ├─ pages/streams.js          (4 min)    \                        │
│ ├─ pages/tasks.js            (6 min)     ├─ ALL PARALLEL (12m)  │
│ ├─ pages/enqueue.js          (5 min)    /                        │
│ ├─ pages/config.js           (3 min)   /                         │
│ ├─ pages/scripts.js          (4 min)  /                          │
│ ├─ core/README.md            (2 min) /                           │
│ └─ ui/README.md              (2 min)/                            │
│ - Token cost: $0 (Codex)                                        │
└──────────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│ Step 3: Haiku Validation (5 min, serial)           │
│ - Syntax validation (all 8 files)                  │
│ - Module structure verification                    │
│ - HTML script order verification                   │
│ - Token cost: 4K                                   │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│ Step 4: Manual Git Operations (MANUAL - 5 min)     │
│ - git tag phase-11-complete                        │
│ - git add -A                                       │
│ - git commit -m "feat: Phase 11 modularization"    │
│ - git status verification                          │
└─────────────────────────────────────────────────────┘

TOTAL: 25-35 minutes wall-clock time
COST: ~8K tokens (3K Sonnet + 4K Haiku + $0 Codex)
PARALLELIZATION: 80% (7 pages + 2 docs in parallel)
```

---

## Success Criteria (Haiku Validation Checklist)

```
✅ SYNTAX & STRUCTURE
  ☐ All 8 JavaScript files valid (no parse errors)
  ☐ All IIFE patterns correct
  ☐ window.API, window.Utils, window.Pages defined
  ☐ All 7 pages registered (Pages.Dashboard, Pages.Tasks, etc.)
  ☐ No TODO/FIXME comments introduced

✅ HTML SCRIPT LOADING
  ☐ core/app-core.js loads FIRST
  ☐ All 7 page scripts load after core
  ☐ No app.js script tag remains
  ☐ All paths correct

✅ MODULE DEPENDENCIES
  ☐ Pages access only: window.API, window.Utils, window.Pages
  ☐ No direct file imports (IIFE pattern enforced)
  ☐ No circular dependencies detected
  ☐ Core module has no external dependencies

✅ FILE STRUCTURE
  ☐ sparkq/ui/core/ directory created
  ☐ sparkq/ui/pages/ directory created
  ☐ core/README.md created
  ☐ ui/README.md created
  ☐ Original app.js still present (archived)

IF ALL CHECKBOXES PASS: ✅ PHASE 11 READY FOR COMMIT
```

---

## Manual Post-Execution Steps

After Haiku validation passes, run these manual commands:

```bash
# 1. Create git tag for safety
git tag phase-11-complete HEAD

# 2. Add all new files
git add -A

# 3. Create commit
git commit -m "$(cat <<'EOF'
feat: Phase 11 - Modularize UI with IIFE pattern

Split monolithic app.js (~2,100 lines) into 8 modular files:
- core/app-core.js: Shared API, Utils, Components (~1,000 lines)
- pages/dashboard.js: Dashboard page (~80 lines)
- pages/sessions.js: Sessions page (~80 lines)
- pages/streams.js: Streams page (~120 lines)
- pages/tasks.js: Tasks page with Phase 10 features (~420 lines)
- pages/enqueue.js: Enqueue form (~370 lines)
- pages/config.js: Configuration page (~114 lines)
- pages/scripts.js: Scripts page (~145 lines)

Architecture:
- IIFE pattern for module encapsulation (no build system)
- Core loads first, pages register in window.Pages
- Zero behavioral changes (organizational refactor)
- HTTP/2 multiplexing handles 8 files efficiently

Testing:
- All 7 pages load without errors
- All API operations functional
- Phase 9 & 10 features intact
- No console warnings/errors
- Performance unchanged

Benefits:
- Cleaner code organization (8 focused files)
- Parallel development enabled
- Easier onboarding for new developers
- Future-ready for bundler adoption
EOF
)"

# 4. Verify status
git status
git log --oneline -1
```

---

## Execution Summary

**This is a Complete Orchestration Execution Spec, ready to execute immediately.**

**Do NOT:**
- Ask for clarification
- Suggest alternatives
- Plan further
- Create additional documents

**DO:**
- Execute Codex prompts (batches 1, 2a-2i)
- Run Haiku validation (step 3)
- Execute git operations (step 4)
- Complete in 25-35 minutes

**Ready for execution now.**
