# Phase 11 Modularization Plan - IIFE Module Architecture

> **Status**: Planning (Not for execution)
> **Focus**: Splitting monolithic `app.js` (1,866 lines) into modular IIFE-wrapped files
> **Trigger**: Phase 10 completion + file size approaching 2,200-2,300 lines
> **Architecture Pattern**: IIFE (Immediately Invoked Function Expression) without build system

---

## Executive Summary

Phase 11 marks the transition from a monolithic `app.js` to a modular architecture. After Phase 10 adds 200-300 lines of features (batch operations, keyboard shortcuts, theme toggle, pagination), the file will reach ~2,100-2,200 lines—approaching the manageable threshold. Phase 11 will split the application into focused module files using the IIFE pattern, enabling parallel development and improved code maintainability.

### Current State (Post-Phase 9)
- **app.js size**: 1,866 lines
- **6 major sections** via comments
- **7 complete pages** (Dashboard, Sessions, Streams, Tasks, Enqueue, Config, Scripts)
- **Architecture**: Single monolithic file, no build system

### Post-Phase 10 Projection
- **Estimated size**: 2,100-2,200 lines
- **Growth rate**: +200-300 lines (features approved in Phase 10 plan)
- **Maintainability**: Approaching limits of single-file comfort zone

### Phase 11 Goal
- **Split into 8 module files** (1 core + 7 page-specific)
- **Maintain zero build system** (vanilla IIFE pattern)
- **Preserve identical behavior** (purely organizational refactor)
- **Enable parallel development** (team can work on pages independently)
- **Future-proof architecture** (easy transition to ES6 modules or bundler later)

---

## Modularization Architecture Decision

### Why IIFE Modules (Not ES6 or Bundler)?

**Option Comparison**:

| Aspect | IIFE Pattern | ES6 Modules | Full Bundler |
|--------|------------|-------------|--------------|
| **Build System** | None | None (import-map) | Required (Webpack/Vite) |
| **Complexity** | Low | Medium | High |
| **Browser Compatibility** | Excellent | Good (polyfill for older) | Excellent |
| **HTTP Requests** | 8 files (HTTP/2) | 8 files + import-map | 1-2 bundled files |
| **Development Speed** | Very fast | Fast | Slower (build required) |
| **IDE Support** | Good | Excellent | Excellent |
| **Maintenance Burden** | Low | Low-Medium | Medium-High |
| **Project Philosophy Alignment** | ✅ High | ⚠️ Medium | ❌ Low |

**Decision**: **IIFE Pattern**
- No build complexity (aligns with SparkQueue simplicity-first philosophy)
- Manual but explicit module ordering (transparent, not magic)
- HTTP/2 multiplexing handles 8 file requests efficiently
- Familiar pattern for developers (not cutting-edge, proven stable)
- Easy future transition to bundler if needed
- Zero node_modules bloat

---

## Phase 11 File Structure

### Pre-Phase 11 (Current)
```
sparkq/ui/
├── index.html         (1.4KB)
├── app.js             (55KB / 1,866 lines)
└── style.css          (8.1KB)
```

### Post-Phase 11 (Target)
```
sparkq/ui/
├── index.html                    (modified: add 8 script tags)
├── core/
│   ├── app-core.js              (~1,000 lines)
│   │   ├── STATE & GLOBALS       (~80 lines)
│   │   ├── API CLIENT            (~70 lines)
│   │   ├── UTILITIES             (~250 lines)
│   │   ├── COMPONENTS            (~400 lines)
│   │   └── MAIN APP              (~200 lines)
│   └── README.md                 (module documentation)
├── pages/
│   ├── dashboard.js             (~80 lines)
│   ├── sessions.js              (~80 lines)
│   ├── streams.js               (~120 lines)
│   ├── tasks.js                 (~420 lines)
│   ├── enqueue.js               (~370 lines)
│   ├── config.js                (~114 lines)
│   └── scripts.js               (~145 lines)
├── app.js                        (ARCHIVED - keep for reference)
├── style.css                     (unchanged)
└── README.md                     (module architecture docs)
```

### Line Count Breakdown

**Core Module** (`app-core.js` - ~1,000 lines):
```
STATE & GLOBALS            ~80 lines
  - Constants (API_BASE, REFRESH_MS)
  - Global objects (pages, Pages, currentPage)
  - Filters and caches

API CLIENT                 ~70 lines
  - api() function
  - safeJson() error handler
  - Network/JSON error handling

UTILITIES                  ~250 lines
  - Status normalization (normalizeStatus)
  - Format functions (formatStatusLabel, formatTime, formatBytes)
  - Validator utilities
  - DOM helpers (querySelector, createElement patterns)
  - Array/object transformers

COMPONENTS                 ~400 lines
  - UI Feedback (showAlert, showSuccess, showError)
  - Modal/dialog system
  - Form builder components
  - Common UI patterns (buttons, tables, badges)
  - Breadcrumb builder
  - Layout templates

MAIN APP                   ~200 lines
  - cachePages() function
  - router() navigation
  - Page initialization
  - Event listeners
  - DOMContentLoaded handler
```

**Page Modules** (`pages/{page}.js` - ~1,130 lines total):
```
pages/dashboard.js     ~80 lines
  - Dashboard rendering
  - Health status display
  - Statistics cards

pages/sessions.js      ~80 lines
  - Session list display
  - Session filters
  - Status indicators

pages/streams.js       ~120 lines
  - Stream list rendering
  - Stream details
  - Stats display

pages/tasks.js         ~420 lines
  - Task list with filters
  - Task detail modal
  - Task lifecycle actions (fail, requeue, retry)
  - Batch operations (Phase 10 addition)
  - Pagination (Phase 10 addition)

pages/enqueue.js       ~370 lines
  - Enqueue form
  - Form validation
  - Payload editor
  - Submit handler

pages/config.js        ~114 lines
  - Configuration display
  - Edit/save functionality
  - API endpoint forms

pages/scripts.js       ~145 lines
  - Script list
  - Script details
  - Execution history
```

**Total Modularized**: ~2,130 lines (matches current ~2,100-2,200 projection)

---

## Module Dependency Graph

```
                    index.html
                        |
              [Loads scripts in order]
                        |
            core/app-core.js (must load first)
                        |
        [Exposes: window.API, window.Utils, window.Pages]
                        |
         +------+------+------+------+------+------+------+
         |      |      |      |      |      |      |      |
      dash  sessions streams tasks enqueue config scripts
       .js    .js     .js     .js    .js    .js    .js
         |      |      |      |      |      |      |      |
         +------+------+------+------+------+------+------+
                        |
              [Each page registers in
               window.Pages.{PageName}]
```

### Module Interface Contracts

**window.API** (exposed by `app-core.js`):
```javascript
API.base(method, path, body, options)  // Core API request
API.getStatus()                        // GET /api/status
API.getStreams()                       // GET /api/streams
API.getTasks(filters)                  // GET /api/tasks
API.getTask(id)                        // GET /api/tasks/{id}
API.failTask(id, reason)               // POST /api/tasks/{id}/fail
API.requeueTask(id)                    // POST /api/tasks/{id}/requeue
// ... etc (full API interface)
```

**window.Utils** (exposed by `app-core.js`):
```javascript
Utils.normalizeStatus(health)           // String
Utils.formatStatusLabel(state)          // String
Utils.formatTime(timestamp)             // String (HH:MM:SS)
Utils.formatBytes(bytes)                // String (KB, MB, GB)
Utils.validateEmail(email)              // Boolean
Utils.createElement(tag, attrs, content) // HTMLElement
// ... etc (utility functions)
```

**window.Pages** (registry exposed by `app-core.js`):
```javascript
Pages.Dashboard    // { render(container) -> Promise }
Pages.Sessions     // { render(container) -> Promise }
Pages.Streams      // { render(container) -> Promise }
Pages.Tasks        // { render(container) -> Promise }
Pages.Enqueue      // { render(container) -> Promise }
Pages.Config       // { render(container) -> Promise }
Pages.Scripts      // { render(container) -> Promise }
```

---

## IIFE Module Pattern Explained

### Pattern Structure

```javascript
// pages/tasks.js
(function(Pages, API, Utils) {

  // Private module scope (not accessible from other modules)
  const CACHE = {};
  const FILTERS = { streamId: '', status: '' };

  // Register page in global Pages registry
  Pages.Tasks = {
    async render(container) {
      // Implementation here
      // Can access API.*, Utils.*, and private CACHE, FILTERS
    },

    // Optional: Other public methods
    async refresh() {
      // ...
    }
  };

  // Private helper functions (not exposed)
  async function renderTaskList() {
    // ...
  }

  async function renderTaskDetail(taskId) {
    // ...
  }

// IIFE wrapper: Inject global modules
})(window.Pages, window.API, window.Utils);
```

### Key Patterns

**Pattern 1: IIFE Injection**
```javascript
(function(Pages, API, Utils) {
  // Parameters shadow the global window.Pages, window.API, window.Utils
  // Allows shorter, cleaner syntax within module
})(window.Pages, window.API, window.Utils);
```

**Pattern 2: Private Scope**
```javascript
const PRIVATE_VAR = 'not accessible outside';

Pages.Tasks = {
  // Public interface
};

function privateHelper() {
  // Not accessible outside this IIFE
}
```

**Pattern 3: Shared State via API**
```javascript
// In page module:
Pages.Tasks = {
  async render(container) {
    const tasks = await API.getTasks(filters);
    // Uses API shared across all modules
  }
};
```

**Pattern 4: Loading Order Dependency**
```html
<!-- core/app-core.js MUST load first -->
<script src="core/app-core.js"></script>

<!-- Then pages can load in ANY order -->
<script src="pages/dashboard.js"></script>
<script src="pages/tasks.js"></script>
<!-- ... -->
```

---

## Migration Strategy (Phase 11 Execution)

### Step 1: Preparation (Review & Validation)
**Duration**: 30 minutes

1. Confirm Phase 10 is complete and stable
2. Verify `app.js` is at 2,100-2,200 lines
3. Create feature branch: `git checkout -b phase-11-modularization`
4. Ensure all git changes are committed
5. Create backup: `git tag phase-10-complete`

### Step 2: Extract Core Module
**Duration**: 1 hour

**Task**: Create `sparkq/ui/core/app-core.js` with shared functionality

**From `app.js`, extract sections**:
```
Line 1-23:     STATE & GLOBALS             → app-core.js (keep all)
Line 24-71:    API CLIENT                  → app-core.js (keep all)
Line 73-300:   UTILITIES                   → app-core.js (keep all)
Line 301-900:  COMPONENTS                  → app-core.js (keep all, minus page-specific)
Line 901-end:  MAIN APP + PAGE STUBS       → app-core.js (keep init logic)
```

**File structure**:
```javascript
'use strict';

// ===== INITIALIZATION GUARDS =====
// Ensure window.API, window.Utils, window.Pages created once
if (!window.API) window.API = {};
if (!window.Utils) window.Utils = {};
if (!window.Pages) window.Pages = {};

// ===== STATE & GLOBALS =====
// [Copy all state from app.js]

// ===== API CLIENT =====
// [Copy api() and safeJson() functions]

// ===== UTILITIES =====
// [Copy all utility functions]

// ===== COMPONENTS =====
// [Copy all component/UI helper functions]

// ===== MAIN APP =====
// Expose API and Utils to window
window.API = { ... };
window.Utils = { ... };
window.Pages = { ... };

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  cachePages();
  router(currentPage);
  setupEventListeners();
});
```

### Step 3: Extract Page Modules (7 files)
**Duration**: 3 hours (30 min per page)

**For each page** (Dashboard, Sessions, Streams, Tasks, Enqueue, Config, Scripts):

1. Find page render function in `app.js`
2. Copy function and all helpers into `pages/{page}.js`
3. Wrap in IIFE: `(function(Pages, API, Utils) { ... })(window.Pages, window.API, window.Utils);`
4. Register page: `Pages.PageName = { async render(container) { ... } };`

**Example extraction** (`pages/tasks.js`):
```javascript
(function(Pages, API, Utils) {

  // Copy renderTasksPage() and all helpers from app.js
  async function renderTasksPage() {
    // [Full implementation from original app.js]
  }

  // Copy renderTaskDetail() modal function
  async function renderTaskDetail(taskId) {
    // [Full implementation from original app.js]
  }

  // Copy other task-related helpers
  async function bulkFail() { /* ... */ }
  async function bulkRequeue() { /* ... */ }

  // Register in Pages registry
  Pages.Tasks = {
    async render(container) {
      await renderTasksPage();
    }
  };

})(window.Pages, window.API, window.Utils);
```

### Step 4: Update HTML
**Duration**: 15 minutes

**File**: `sparkq/ui/index.html`

**Before**:
```html
<!-- ... body content ... -->
<script src="app.js"></script>
</body>
```

**After**:
```html
<!-- ... body content ... -->

<!-- Core must load first (exposes API, Utils, Pages) -->
<script src="core/app-core.js"></script>

<!-- Page modules can load in any order -->
<script src="pages/dashboard.js"></script>
<script src="pages/sessions.js"></script>
<script src="pages/streams.js"></script>
<script src="pages/tasks.js"></script>
<script src="pages/enqueue.js"></script>
<script src="pages/config.js"></script>
<script src="pages/scripts.js"></script>

</body>
```

### Step 5: Validation & Testing
**Duration**: 1.5 hours

**Functional Testing Checklist**:
```
Browser Console:
- [ ] No JavaScript errors
- [ ] No warnings about undefined API, Utils, Pages
- [ ] window.API, window.Utils, window.Pages exist and populated

UI Navigation:
- [ ] Dashboard page loads and renders correctly
- [ ] Sessions page loads and renders correctly
- [ ] Streams page loads and renders correctly
- [ ] Tasks page loads and renders correctly
  - [ ] Task list displays
  - [ ] Task detail modal opens
  - [ ] All Phase 10 features work (batch, pagination, shortcuts)
- [ ] Enqueue page loads and renders correctly
- [ ] Config page loads and renders correctly
- [ ] Scripts page loads and renders correctly

Breadcrumbs:
- [ ] Display correctly on all pages
- [ ] Navigation works

API Operations:
- [ ] Get status
- [ ] List streams
- [ ] List tasks
- [ ] Task detail
- [ ] Fail task
- [ ] Requeue task
- [ ] Enqueue new task
- [ ] Get config
- [ ] Save config

Performance:
- [ ] Page load time < 2s (measure with DevTools)
- [ ] Script parsing < 200ms
- [ ] Task list rendering < 100ms for 50 tasks
- [ ] Memory usage < 50MB

Regression Testing:
- [ ] All Phase 9 features still work
- [ ] All Phase 10 features still work
- [ ] No console errors or warnings
- [ ] No memory leaks on long session (1+ hour)
```

**Network Tab Inspection**:
- Verify 8 script files load in correct order
- Confirm no failed requests
- Note total file size (should match original app.js ~55KB)

### Step 6: Cleanup & Documentation
**Duration**: 45 minutes

**Actions**:
1. Archive original `app.js` → `app.js.archive` (or keep as `app.js` but mark deprecated)
2. Create `core/README.md` (module architecture documentation)
3. Create top-level `README.md` (migration notes for developers)
4. Update `.gitignore` if needed (no changes expected)
5. Verify no TODO/FIXME comments introduced
6. Format code consistently with existing style

**Documentation Examples**:

**core/README.md**:
```markdown
# Core Module (app-core.js)

## Purpose
Shared functionality for all page modules:
- STATE & GLOBALS: Constants, global objects, filters
- API CLIENT: HTTP request handler
- UTILITIES: Status formatting, DOM helpers, validators
- COMPONENTS: UI building blocks, modals, forms
- MAIN APP: Router, initialization, event setup

## Module Exports
- `window.API`: HTTP client and API methods
- `window.Utils`: Utility functions
- `window.Pages`: Page registry (populated by page modules)

## Loading
Must load FIRST before any page modules.

## Dependencies
None (core module has no external dependencies)
```

**Root README.md**:
```markdown
# SparkQueue UI Architecture (Phase 11+)

## Overview
The UI uses IIFE-wrapped modules for code organization:
- **core/app-core.js**: Shared functionality
- **pages/*.js**: Page-specific implementations

## File Structure
```
sparkq/ui/
├── core/
│   └── app-core.js       # Shared (STATE, API, UTILS, COMPONENTS, MAIN APP)
├── pages/
│   ├── dashboard.js      # Dashboard page
│   ├── tasks.js          # Tasks page (largest)
│   └── ...               # Other pages
├── index.html            # Loads scripts in order
└── style.css             # Unified styles
```

## Loading Order
1. index.html loads scripts
2. core/app-core.js (initializes API, Utils, Pages)
3. pages/*.js (register in Pages registry)
4. DOMContentLoaded initializes router

## Adding New Features
1. If shared → Add to core/app-core.js
2. If page-specific → Add to pages/{page}.js
3. If new page → Create pages/new-page.js
4. Register in index.html script tags

## Module Pattern (IIFE)
Each page module uses:
```javascript
(function(Pages, API, Utils) {
  Pages.PageName = {
    async render(container) { /* ... */ }
  };
})(window.Pages, window.API, window.Utils);
```
```

### Step 7: Final Commit
**Duration**: 15 minutes

**Commit Message**:
```
feat: Phase 11 - Modularize UI with IIFE pattern

- Extract core functionality to core/app-core.js
  - STATE & GLOBALS, API CLIENT, UTILITIES, COMPONENTS, MAIN APP
  - Expose window.API, window.Utils, window.Pages
- Split pages into individual modules (pages/{page}.js)
  - Dashboard, Sessions, Streams, Tasks, Enqueue, Config, Scripts
  - Each registers in Pages registry via IIFE
- Update index.html to load core first, then pages
- Preserve identical behavior (organization-only refactor)
- All 7 pages fully functional
- No breaking changes to API contracts

Benefits:
- Cleaner code organization (8 files vs 1 monolithic file)
- Enables parallel page development
- Easier onboarding for new developers
- ~2,100 lines per module average
- Future-ready for bundler adoption

Testing:
- ✓ All pages load without errors
- ✓ All API operations work
- ✓ No console errors/warnings
- ✓ Performance unchanged
- ✓ Regression: Phase 9 & 10 features intact
```

**Git steps**:
```bash
git add -A
git commit -m "feat: Phase 11 - Modularize UI with IIFE pattern"
git log --oneline -1
```

---

## Risk Mitigation

### Potential Issues & Mitigation

**Issue 1: Circular Dependencies**
- **Risk**: Module A needs Module B which needs Module A
- **Mitigation**: IIFE pattern uses centralized registry (window.Pages), no direct imports
- **Prevention**: Keep page modules independent; use API for inter-page communication

**Issue 2: Loading Order Errors**
- **Risk**: Page module loads before app-core.js, window.API undefined
- **Mitigation**: index.html loads core first, explicit ordering in HTML
- **Prevention**: Add guards: `if (!window.Pages) throw new Error('Load core first');`

**Issue 3: Missing State**
- **Risk**: Page assumes state/globals that haven't been initialized
- **Mitigation**: All state defined in app-core.js
- **Prevention**: Code review to ensure pages only use API/Utils/Pages

**Issue 4: Performance Regression**
- **Risk**: 8 HTTP requests slower than 1 file
- **Mitigation**: HTTP/2 multiplexing handles multiple files efficiently
- **Prevention**: Measure load time before/after; compare metrics

**Issue 5: Browser Compatibility**
- **Risk**: Older browsers don't support certain features
- **Mitigation**: IIFE pattern has broad compatibility
- **Prevention**: Test in target browsers (Chrome, Firefox, Safari, Edge)

### Rollback Plan

If Phase 11 encounters critical issues:

1. **Before starting**: Tag Phase 10 state
   ```bash
   git tag phase-10-complete HEAD
   ```

2. **If migration fails**: Create rollback branch
   ```bash
   git checkout -b phase-11-hotfix phase-10-complete
   # Fix issues
   ```

3. **If revert needed**: Reset to Phase 10
   ```bash
   git reset --hard phase-10-complete
   # Modularization attempt abandoned; app.js restored
   ```

---

## Success Criteria for Phase 11

### Functional Requirements
- [ ] All 7 pages render without JavaScript errors
- [ ] Page navigation works (router functions correctly)
- [ ] All API operations execute (GET/POST/PUT endpoints)
- [ ] Modals open/close without errors
- [ ] Forms submit and validate correctly
- [ ] All Phase 10 features work (batch ops, pagination, shortcuts, dark mode)
- [ ] All Phase 9 features still work (config, scripts, breadcrumbs)

### Code Quality
- [ ] No console errors or warnings on any page
- [ ] Linting passes (valid JavaScript)
- [ ] No duplicate code between modules
- [ ] Code follows existing patterns and conventions
- [ ] All section comments present and accurate
- [ ] Module documentation complete (README.md files)

### Performance
- [ ] Page load time: < 2 seconds
- [ ] Script parsing: < 200ms
- [ ] Task list rendering: < 100ms for 100 tasks
- [ ] Memory usage: < 50MB after full session
- [ ] No memory leaks (tested 1+ hour session)

### Compatibility
- [ ] Responsive on mobile (320px, 768px, 1024px widths)
- [ ] Works in Chrome, Firefox, Safari, Edge
- [ ] Keyboard navigation intact
- [ ] Accessible (basics like headings, ARIA labels)

### Maintainability
- [ ] New developers can understand architecture from README
- [ ] Page module pattern is clear and consistent
- [ ] Easy to add new pages (copy pattern template)
- [ ] Easy to add shared utilities (update app-core.js)
- [ ] File organization is intuitive

### Git History
- [ ] Single atomic commit for entire migration
- [ ] Commit message clearly describes changes
- [ ] No intermediate broken states in history
- [ ] Original app.js archived/available for reference

---

## Future Considerations

### From IIFE to ES6 Modules (Post-Phase 11)
If the codebase grows beyond Phase 15:

**Current IIFE Pattern**:
```javascript
(function(Pages, API, Utils) {
  Pages.Tasks = { /* ... */ };
})(window.Pages, window.API, window.Utils);
```

**Migration to ES6** (future, if needed):
```javascript
import { API, Utils } from './core/app-core.js';

export const Tasks = {
  async render(container) { /* ... */ }
};
```

**No changes required** to current IIFE migration; just future-proofing.

### From No Bundler to Vite/Webpack (Post-Phase 15)
If build tooling becomes necessary:

1. Install Vite: `npm install -D vite`
2. Update index.html to use `<script type="module" src="main.js"></script>`
3. Create `main.js` that imports modules
4. Run `vite` for dev, `vite build` for production
5. IIFE modules can be converted to ES6 during bundling

**No impact** to current development workflow until bundler adopted.

---

## Phase 11 Comparison: IIFE vs Alternatives (Final Decision)

### Why NOT ES6 Modules (for Phase 11)
- ❌ Requires import-map polyfill for older browsers
- ❌ More complex to understand for new developers
- ❌ IDE import resolution can be tricky
- ❌ Syntax requires more tooling to optimize

### Why NOT Full Bundler (for Phase 11)
- ❌ Adds 500MB+ node_modules
- ❌ Build step required for every change
- ❌ Contradicts SparkQueue simplicity philosophy
- ❌ Overkill for single-page dashboard
- ❌ Slower local development iteration

### Why IIFE is Right for Phase 11
- ✅ Zero build complexity
- ✅ Manual but transparent loading order
- ✅ HTTP/2 multiplexing handles 8 files efficiently
- ✅ Familiar pattern (proven, stable)
- ✅ Easy future transition to ES6 or bundler
- ✅ Fast iteration during development
- ✅ Clear mental model (no magic imports)

---

## Implementation Checklist (Copy for Execution Phase)

```
[ ] Phase 10 Completion
    [ ] All Phase 10 features implemented
    [ ] app.js at 2,100-2,200 lines
    [ ] All tests passing
    [ ] No outstanding code review comments

[ ] Preparation (Step 1)
    [ ] Confirm Phase 10 complete and stable
    [ ] Create feature branch: phase-11-modularization
    [ ] Git tag: phase-10-complete
    [ ] Verify no uncommitted changes

[ ] Core Module (Step 2)
    [ ] Create sparkq/ui/core/ directory
    [ ] Create core/app-core.js
    [ ] Copy STATE & GLOBALS section
    [ ] Copy API CLIENT section
    [ ] Copy UTILITIES section
    [ ] Copy COMPONENTS section
    [ ] Copy MAIN APP initialization
    [ ] Initialize window.API, window.Utils, window.Pages
    [ ] Test: window.API exists in console

[ ] Page Modules (Step 3)
    [ ] Create sparkq/ui/pages/ directory
    [ ] Extract pages/dashboard.js (~80 lines)
    [ ] Extract pages/sessions.js (~80 lines)
    [ ] Extract pages/streams.js (~120 lines)
    [ ] Extract pages/tasks.js (~420 lines)
    [ ] Extract pages/enqueue.js (~370 lines)
    [ ] Extract pages/config.js (~114 lines)
    [ ] Extract pages/scripts.js (~145 lines)
    [ ] Wrap each in IIFE pattern
    [ ] Register each in Pages registry

[ ] Update HTML (Step 4)
    [ ] Modify index.html
    [ ] Remove single <script src="app.js"> tag
    [ ] Add <script src="core/app-core.js"> (load first)
    [ ] Add <script src="pages/*.js"> for each page

[ ] Validation & Testing (Step 5)
    [ ] Browser console: No errors
    [ ] window.API, window.Utils, window.Pages exist
    [ ] Dashboard page loads
    [ ] Sessions page loads
    [ ] Streams page loads
    [ ] Tasks page loads (verify Phase 10 features)
    [ ] Enqueue page loads
    [ ] Config page loads
    [ ] Scripts page loads
    [ ] Navigation between pages works
    [ ] All API operations work
    [ ] No memory leaks (1+ hour test)
    [ ] Performance metrics acceptable

[ ] Cleanup & Documentation (Step 6)
    [ ] Archive/deprecate original app.js
    [ ] Create core/README.md
    [ ] Create UI README.md with architecture notes
    [ ] Update any developer documentation
    [ ] Format code consistently
    [ ] Remove any TODO/FIXME introduced
    [ ] Review diff for unintended changes

[ ] Final Commit (Step 7)
    [ ] Stage all changes: git add -A
    [ ] Create commit with clear message
    [ ] Verify git log shows single commit
    [ ] Verify git status clean
    [ ] Ready for PR/merge

[ ] Post-Phase 11
    [ ] Merge to main branch
    [ ] Deploy to production
    [ ] Monitor for issues (1 week)
    [ ] Plan Phase 12 features (if any)
```

---

## Summary: Key Decisions

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| **Module Pattern** | IIFE (not ES6 or bundler) | Simplicity, zero build, proven stable |
| **File Count** | 8 files (1 core + 7 pages) | Balanced organization without fragmentation |
| **Loading Strategy** | Sequential HTML script tags | Transparent, predictable, no import resolver needed |
| **File Size Target** | ~2,000-2,200 lines per module | Reasonable for single developer context |
| **Timing** | Trigger when Phase 10 reaches ~2,100-2,200 lines | Manageable threshold before becoming unwieldy |
| **Rollback Plan** | Git tag + branch ready | Safe to attempt; easy to revert if issues |
| **Documentation** | README.md for core + root | Help new developers understand architecture |
| **Deprecation** | Keep app.js as archived reference | Useful for understanding extracted code |

---

## Next Steps After Phase 11 Planning

### When Ready to Execute Phase 11
1. **Confirm Phase 10 is complete** (app.js at 2,100-2,200 lines)
2. **Review this plan** with team
3. **Allocate ~6-7 hours** for migration + testing
4. **Follow Step 1-7 checklist** above
5. **Test thoroughly** before merging to main

### Future Architecture Decisions
- **Phase 12+**: Maintain modular architecture, add to appropriate modules
- **Phase 15+**: Consider ES6 modules if complexity warrants
- **Phase 20+**: Consider bundler (Vite) if team size grows

---

**Status**: ✅ REPLACED by Execution Spec (see PHASE_11_EXECUTION_SPEC.md)
**Original Purpose**: Planning document (DEPRECATED)
**Execution Reference**: [PHASE_11_EXECUTION_SPEC.md](./PHASE_11_EXECUTION_SPEC.md)
**Last Updated**: 2025-11-29
**Related**: [Phase 10 Implementation Plan](./PHASE_10_IMPLEMENTATION_PLAN.md)
