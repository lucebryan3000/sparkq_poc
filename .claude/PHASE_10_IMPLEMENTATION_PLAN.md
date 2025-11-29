# Phase 10 Implementation Plan - Frontend Architecture & Feature Enhancements

> **Status**: Ready for planning and approval
> **Focus**: UI modularization (optional), advanced features, and performance optimization
> **Execution Model**: TBD - Haiku/Sonnet depending on feature complexity

---

## Executive Summary

Phase 10 builds on Phase 9's complete configuration UI to add advanced features and improve maintainability. The primary architectural decision is whether to split `app.js` into module files or keep it monolithic with improved organization.

### Current State (Post-Phase 9)
- **app.js size**: 1,866 lines (6 organized sections via comments)
- **Architecture**: Single file, vanilla JavaScript
- **Pages**: 7 complete (Dashboard, Sessions, Streams, Tasks, Enqueue, Config, Scripts)
- **Features**: Full read access + task lifecycle operations
- **Next challenge**: Managing growth for Phase 10+ features (~200-300 lines of new code)

### Phase 10 Growth Projection
- **Phase 10 estimated additions**: 200-300 lines
  - WebSocket real-time updates: ~150 lines
  - Batch operations (checkboxes, bulk actions): ~80 lines
  - Keyboard shortcuts: ~40 lines
  - Theme toggle: ~30 lines
  - Estimated Phase 10 total: **2,100-2,200 lines**

- **Phase 11+ projection**: 2,500+ lines (force modularization trigger)

---

## Decision: app.js Modularization Strategy

### Current Analysis
| Metric | Value | Status |
|--------|-------|--------|
| Current size | 1,866 lines | ⚠️ Large but manageable |
| Section headers | 6 comments | ✅ Well-organized |
| Largest section | PAGES (1,277 lines, 68%) | ⚠️ Focal point |
| Individual page sizes | 80-400 lines | ✅ Reasonable |
| Growth trend | +293 lines/phase | ⚠️ Accelerating |
| Code duplication | None detected | ✅ DRY |

### Three Options Evaluated

#### Option A: Keep Single File (Status: Recommended for Phase 10)
**Approach**: Maintain monolithic structure with improved organization
- Keep section comments (already in place)
- Add inline documentation for complex sections
- Improve code clarity without splitting

**Pros**:
- Zero deployment complexity
- No module/import overhead
- Simple browser loading
- Easier debugging (single breakpoint scope)
- Current organization already good

**Cons**:
- File size harder to manage beyond 2,500 lines
- New developers must navigate large file
- Page functions still scattered (need better namespace)
- Will need splitting in Phase 11

**Recommendation**: Use for Phase 10 (MVP features), plan split for Phase 11

---

#### Option B: IIFE Module Pattern (Status: Plan for Phase 11)
**Approach**: Split into multiple IIFE-wrapped module files without build system
- Each page gets its own file: `pages/dashboard.js`, `pages/tasks.js`, etc.
- Shared utilities in `core/app-core.js`
- Load modules in `index.html` before closing `</body>`

**Directory Structure**:
```
sparkq/ui/
├── index.html         # HTML template (load scripts in order)
├── style.css          # All styles (unified)
├── core/
│   └── app-core.js    (~900 lines: STATE, API CLIENT, UTILITIES, COMPONENTS, MAIN APP)
├── pages/
│   ├── dashboard.js   (~80 lines)
│   ├── tasks.js       (~400 lines)
│   ├── enqueue.js     (~350 lines)
│   ├── sessions.js    (~80 lines)
│   ├── streams.js     (~120 lines)
│   ├── config.js      (~114 lines)
│   └── scripts.js     (~145 lines)
└── app.js             (DEPRECATED - split into modules)
```

**IIFE Pattern Example**:
```javascript
// pages/dashboard.js
(function(Pages, API, Utils) {
  Pages.Dashboard = {
    async render(container) {
      // Dashboard code here
    }
  };
})(window.Pages, window.API, window.Utils);
```

**Loading in index.html**:
```html
<script src="core/app-core.js"></script>
<script src="pages/dashboard.js"></script>
<script src="pages/tasks.js"></script>
<!-- ... other pages ... -->
```

**Pros**:
- Clean file organization
- Easier to navigate each page
- No build system needed
- Parallel development possible
- Performance: HTTP/2 multiplexing handles multiple files well
- Future-proof (can be bundled later)

**Cons**:
- More files to maintain
- Global namespace dependencies (Pages, API, Utils objects)
- Requires specific loading order
- Slightly more HTTP requests (mitigated by HTTP/2)
- Migration effort needed from single file

**Recommendation**: Implement as Phase 11 Step 1 (after Phase 10 features stabilize)

---

#### Option C: ES6 Modules + Import-map (Status: Not recommended)
**Approach**: Modern JavaScript modules with import-map polyfill
- Each module uses `import`/`export`
- `index.html` uses `<script type="importmap">` for resolution
- Optional: Use esbuild for production bundling

**Pros**:
- Modern standard syntax
- Better IDE support (imports are real dependencies)
- Explicit dependencies visible

**Cons**:
- Requires import-map (not all browsers support natively)
- Polyfill adds complexity
- More build consideration for production
- Overkill for current project scope

**Recommendation**: Skip for now, revisit if bundler adopted

---

#### Option D: Full Bundler (Webpack/Vite)
**Approach**: Use modern build tooling
- Webpack, Vite, or esbuild for bundling
- Automatic splitting and tree-shaking
- Development server

**Pros**:
- Professional tooling
- Code splitting automated
- Hot module replacement
- Optimization built-in

**Cons**:
- Adds 500MB+ node_modules
- Complex configuration
- CI/CD pipeline needed
- Overkill for single-page dashboard
- Contradicts project philosophy (simplicity)

**Recommendation**: Not needed; revisit only if SPA complexity increases

---

## Recommendation: Two-Phase Approach

### Phase 10 (Current)
**Strategy**: Option A - Keep monolithic, improve organization
**Action Items**:
1. Add strategic inline documentation to complex sections
2. Add defensive comments for non-obvious logic
3. Organize page render functions better (comment separators)
4. Track line count and plan Phase 11 migration
5. Implement Phase 10 features (WebSocket, batch ops, shortcuts)

**Rationale**:
- Phase 10 additions (~200-300 lines) won't exceed 2,200 total
- Single file deployment remains simple
- No refactoring overhead blocks feature development
- Proven organization pattern holds up well
- Phase 11 will have clear modularization trigger

**Growth Projection After Phase 10**:
- Estimated size: 2,100-2,200 lines
- Still manageable in single file
- Split trigger: 2,500+ lines or feature velocity requiring parallel work

---

### Phase 11 (Planned)
**Strategy**: Option B - IIFE Module Pattern
**Trigger**: File exceeds 2,300 lines OR new features require parallel page development
**Action Items** (Phase 11 Step 1):
1. Create `sparkq/ui/core/` directory
2. Extract core functionality to `core/app-core.js` (~900 lines)
3. Create `sparkq/ui/pages/` directory
4. Split each page render function to `pages/{page}.js`
5. Create IIFE wrappers for module dependency injection
6. Update `index.html` to load modules in correct order
7. Preserve `app.js` as deprecated archive (for reference)
8. Full regression test all pages for identical behavior

**Migration Benefits**:
- Easier onboarding for new developers
- Page developers can work in parallel
- Clearer code organization
- Easier to test individual pages
- Can transition to bundler later if needed

---

## Phase 10 Features & Implementation Plan

### Feature 1: Real-Time Updates via WebSocket (Optional, Priority 2)
**Scope**: Optional enhancement; polling still viable
**Files**:
- `sparkq/src/api.py`: Add WebSocket endpoint (if implementing)
- `sparkq/ui/app.js`: Add WebSocket client (~150 lines)

**Implementation**:
```javascript
// In UTILITIES section, add:
class TaskWebSocket {
  constructor() {
    this.ws = null;
    this.handlers = {};
  }

  connect() { /* ... */ }
  onTaskUpdate(handler) { /* ... */ }
  // ... other methods
}

// In dashboard polling, fallback to polling if WebSocket unavailable
```

**Decision**: Defer to Phase 11 if growth permits, keep polling for Phase 10 MVP

---

### Feature 2: Batch Operations (Priority 2)
**Scope**: Bulk fail/requeue tasks
**Files**: `sparkq/ui/app.js` (~80 lines in Tasks page section)

**Implementation**:
```javascript
// Add to renderTasksPage:
- Add checkbox column to task table
- Add "Select All" toggle in header
- Add bulk actions toolbar (Fail Selected, Requeue Selected)
- Track selected task IDs in state
- Validate actions before executing
```

**Estimated lines**: 80-100 (fits in Phase 10 budget)

---

### Feature 3: Keyboard Shortcuts (Priority 3)
**Scope**: Common operations via keyboard
**Files**: `sparkq/ui/app.js` (~40 lines in MAIN APP section)

**Implementation**:
```javascript
// Add to document.addEventListener('keydown'):
- Escape: Close modal
- Enter: Submit form
- Ctrl+K: Focus search
- Ctrl+Shift+T: Navigate to Tasks page
- Ctrl+Shift+E: Navigate to Enqueue page
```

**Estimated lines**: 40-50 (fits in Phase 10 budget)

---

### Feature 4: Dark/Light Mode Toggle (Priority 3)
**Scope**: Theme selection
**Files**:
- `sparkq/ui/app.js` (~30 lines)
- `sparkq/ui/style.css` (~20 lines, update existing CSS variables)

**Implementation**:
```javascript
// Add to navbar:
- Theme toggle button (sun/moon icon)
- Read prefers-color-scheme media query
- Store selection in localStorage
- Apply theme class to document root

// CSS variables already support theme switching:
--bg, --surface, --text, --accent, --border
```

**Estimated lines**: 30-40 (fits in Phase 10 budget)

---

### Feature 5: Copy-to-Clipboard Helpers (Priority 2)
**Scope**: Quick copy for task IDs, payloads
**Files**: `sparkq/ui/app.js` (~20 lines utility)

**Implementation**:
```javascript
// Add to UTILITIES section:
async function copyToClipboard(text, feedbackMs = 1500) {
  try {
    await navigator.clipboard.writeText(text);
    showSuccess('Copied to clipboard', feedbackMs);
  } catch (err) {
    showError('Copy failed', err);
  }
}

// Use in task detail modal, enqueue page, etc.
```

**Estimated lines**: 20-30 (fits in Phase 10 budget)

---

### Feature 6: Pagination for Task Lists (Priority 2)
**Scope**: "Load More" button for large task lists
**Files**: `sparkq/ui/app.js` (modify renderTasksPage ~50 lines)

**Implementation**:
```javascript
// In renderTasksPage, add:
- Track taskOffset and taskLimit
- Initial load: 50 tasks
- "Load More" button appends next 50 tasks
- Disable button when no more tasks
- Show "Found X tasks (showing Y-Z)"
```

**Estimated lines**: 50-70 (fits in Phase 10 budget)

---

## Phase 10 Scope & Line Budget

### Feature Breakdown
| Feature | Lines | Priority | Status |
|---------|-------|----------|--------|
| Batch Operations | 80 | 2 | Phase 10 |
| Keyboard Shortcuts | 50 | 3 | Phase 10 |
| Dark/Light Mode | 40 | 3 | Phase 10 |
| Copy-to-Clipboard | 30 | 2 | Phase 10 |
| Task Pagination | 70 | 2 | Phase 10 |
| **Phase 10 Subtotal** | **270** | - | **MVP** |
| WebSocket (opt) | 150 | 2 | Phase 11 |
| Extra buffer | ~30 | - | Buffer |
| **Projected Phase 10 Total** | **2,100-2,200** | - | **Ready** |

### Execution Threshold
- **Target end-of-Phase-10 size**: 2,100-2,200 lines (allows 400-600 line buffer before mandatory split)
- **Split trigger**: Exceed 2,300 lines → Initiate Phase 11 modularization
- **Comfort zone**: 1,800-2,300 lines (single file manageable)

---

## Detailed Implementation Strategy for Phase 10

### Option A: Single File Approach (Recommended)

#### Step 1: Code Organization (Preparation)
**Action**: Enhance existing section comments with subsection markers
```javascript
// ===== STATE & GLOBALS =====
// Constants
const API_BASE = '/api';
// ...

// State Variables
const pages = {};
// ...

// ===== API CLIENT =====
// HTTP Request Handler
async function api(method, path, body, options) {
  // ...
}

// ===== UTILITIES =====
// Status Handling
function normalizeStatus(health) { /* ... */ }

// ===== COMPONENTS =====
// UI Feedback
function showAlert(message, type, duration) { /* ... */ }

// ===== PAGES =====
// Dashboard Page (~80 lines)
async function loadDashboard() { /* ... */ }

// Tasks Page (~400 lines)
async function renderTasksPage() {
  // ... feature enhancements go here
}

// ... other pages ...

// ===== MAIN APP =====
// Initialization
cachePages();
```

**Benefit**: Readers can quickly jump to sections with `Ctrl+F` or IDE search

#### Step 2: Feature Implementation (Sequential)
1. **Batch Operations** (lines added to renderTasksPage section)
2. **Copy-to-Clipboard** (lines added to COMPONENTS section)
3. **Task Pagination** (lines added to renderTasksPage section)
4. **Keyboard Shortcuts** (lines added to MAIN APP section)
5. **Dark/Light Mode** (lines spread across COMPONENTS + MAIN APP)

**Process**:
- Implement one feature per commit
- Test in browser after each feature
- Verify no behavior regressions
- Track growing file size after each feature

#### Step 3: Performance Monitoring
**Metrics to track**:
- Page load time (should stay < 2s)
- Script parsing time (should stay < 200ms)
- Memory usage in browser (should stay < 50MB)
- Task list rendering (should stay < 100ms for 100 tasks)

**If degradation detected**:
- Profile with DevTools
- Consider feature deferral to Phase 11
- May trigger early modularization decision

---

### Option B: Early Modularization (If Phase 10 Scope Increases)

If Phase 10 features expand or new requirements emerge:

**Trigger Conditions** (any one triggers Phase 11 early):
1. File would exceed 2,300 lines by mid-Phase 10
2. New feature requires >150 lines and can't be deferred
3. Multiple developers need to work on different pages simultaneously
4. Performance degradation detected despite optimization

**Mitigation**:
1. Pause Phase 10 feature development
2. Execute Phase 11 modularization immediately
3. Resume Phase 10 features in modular structure
4. Benefits: Parallel development, cleaner code, future-proof

---

## Modularization Migration Plan (Phase 11 - For Reference)

### Phase 11 Step 1: Modularization (If Triggered)
**Timing**: Execute ONLY if Phase 10 triggers early modularization
**Duration**: 3-4 hours
**Complexity**: High but low-risk (purely organizational)

#### Files to Create
```
sparkq/ui/
├── core/
│   └── app-core.js (new)           # ~900 lines
├── pages/
│   ├── dashboard.js (new)          # ~80 lines
│   ├── tasks.js (new)              # ~400 lines
│   ├── enqueue.js (new)            # ~350 lines
│   ├── sessions.js (new)           # ~80 lines
│   ├── streams.js (new)            # ~120 lines
│   ├── config.js (new)             # ~114 lines
│   └── scripts.js (new)            # ~145 lines
├── index.html (modified)           # Add script tags
├── app.js (DEPRECATED)             # Keep as archive for reference
└── style.css (unchanged)
```

#### Migration Strategy
1. **Extract core** (`app-core.js`):
   - STATE & GLOBALS
   - API CLIENT
   - UTILITIES
   - COMPONENTS
   - MAIN APP sections
   - Export: `window.API`, `window.Utils`, `window.Pages = {}`

2. **Extract pages** (create `pages/{page}.js`):
   - Copy each page render function
   - Wrap in IIFE: `(function(Pages, API, Utils) { Pages.XXX = { ... }; })(window.Pages, window.API, window.Utils);`
   - Preserve all existing logic

3. **Update HTML** (`index.html`):
   - Replace single `<script src="app.js">` with:
   ```html
   <script src="core/app-core.js"></script>
   <script src="pages/dashboard.js"></script>
   <script src="pages/sessions.js"></script>
   <script src="pages/streams.js"></script>
   <script src="pages/tasks.js"></script>
   <script src="pages/enqueue.js"></script>
   <script src="pages/config.js"></script>
   <script src="pages/scripts.js"></script>
   ```

4. **Validation**:
   - All 7 pages load without errors
   - No console errors
   - Behavior identical to pre-split version
   - File sizes match (sum of modules = original size)

#### Risk Mitigation
- **Zero functional changes**: Only reorganization
- **Full test coverage**: All existing tests should still pass
- **Atomic commit**: Single git commit for entire migration
- **Rollback plan**: Keep `app.js` as fallback
- **Pair review**: Get code review before merging

---

## Acceptance Criteria for Phase 10

### Code Quality
- [ ] No linting errors (valid JavaScript)
- [ ] No console errors or warnings
- [ ] All section comments present and accurate
- [ ] Code follows existing patterns and conventions
- [ ] No duplicate functionality

### Features (as implemented)
- [ ] Batch Operations: Checkboxes work, bulk actions execute
- [ ] Copy-to-Clipboard: Helper function tested, works on task IDs
- [ ] Task Pagination: "Load More" button functions, shows counts
- [ ] Keyboard Shortcuts: All 5+ shortcuts respond correctly
- [ ] Dark/Light Mode: Toggle works, preference persists in localStorage

### Performance
- [ ] Page load time: < 2 seconds
- [ ] Script parsing: < 200ms
- [ ] Task list rendering: < 100ms for 100 tasks
- [ ] Memory usage: < 50MB after full session
- [ ] No memory leaks on long sessions

### Compatibility
- [ ] UI loads at `http://localhost:8420/ui/`
- [ ] All existing pages still function identically
- [ ] No breaking changes to API contracts
- [ ] Responsive on mobile (320px, 768px, 1024px)
- [ ] Keyboard navigation working

### Testing
- [ ] Manual testing of all new features
- [ ] Regression testing of Phase 9 features
- [ ] Browser DevTools console clean
- [ ] No TODO/FIXME left in code
- [ ] Git history clean and organized

---

## Architecture Decision Summary

| Decision | Recommendation | Rationale |
|----------|---|---|
| **Phase 10 App.js** | Keep monolithic (Option A) | 2,100-2,200 line projection stays manageable |
| **Phase 11 App.js** | Split to IIFE modules (Option B) | Size + parallel dev will warrant modularization |
| **Build System** | None (vanilla JS) | Simplicity aligns with project philosophy |
| **Module Pattern** | IIFE (not ES6) | Works without bundler, HTTP/2 compatible |
| **Loading Strategy** | Sequential scripts in HTML | Simple, predictable, no import resolution |
| **Feature Priorities** | Batch ops, Pagination, Shortcuts | High-impact, moderate complexity |
| **Deprecation** | Keep app.js as archive after split | Reference for future developers |

---

## Next Steps

### Immediate (Review & Approve)
1. **Review this plan** with stakeholder
2. **Confirm Phase 10 feature scope** (Batch ops? WebSocket? Both?)
3. **Approve modularization timing** (Phase 10 or Phase 11?)
4. **Identify any new requirements** for Phase 10

### When Ready to Execute Phase 10
1. **Step 1**: Create detailed feature specifications (Batch Operations, etc.)
2. **Step 2**: Implement features sequentially, one per commit
3. **Step 3**: Test after each feature implementation
4. **Step 4**: Monitor file size and performance throughout
5. **Step 5**: Decide modularization trigger (early Phase 11 vs planned Phase 11)

### Contingency
- If Phase 10 scope exceeds feature list → Defer to Phase 11
- If performance degrades → Implement batch optimizations or modularize early
- If new requirements emerge → Assess impact and adjust plan

---

## Appendix: Code Examples

### Example 1: IIFE Module Pattern for Phase 11
```javascript
// pages/tasks.js
(function(Pages, API, Utils) {
  Pages.Tasks = {
    async render(container) {
      // Full Tasks page implementation
      // Access shared APIs via API.*, Utils.*
      // Register detail modal renderer
      this.renderDetail = renderTaskDetailModal;
    },
    async renderDetail(taskId) {
      // Task detail modal logic
    }
  };

  // Helper functions scoped to this module
  async function renderTaskDetailModal(taskId) {
    // ...
  }
})(window.Pages, window.API, window.Utils);
```

### Example 2: Batch Operations Addition (Phase 10)
```javascript
// In renderTasksPage function (PAGES section)
// Add checkbox column to table header:
const checkboxCol = `<th style="width: 30px;"><input type="checkbox" id="select-all" title="Select all"></th>`;

// Add to each task row:
const checkboxCell = `<td style="width: 30px;"><input type="checkbox" class="task-checkbox" data-task-id="${task.id}"></td>`;

// Track selected tasks:
const selectedTasks = new Set();
document.getElementById('select-all').addEventListener('change', (e) => {
  document.querySelectorAll('.task-checkbox').forEach(cb => {
    cb.checked = e.target.checked;
    cb.checked ? selectedTasks.add(cb.dataset.taskId) : selectedTasks.delete(cb.dataset.taskId);
  });
});

// Bulk action buttons:
const bulkActions = `
  <div class="bulk-actions" style="display: ${selectedTasks.size > 0 ? 'flex' : 'none'}">
    <button onclick="bulkFail()">Fail Selected (${selectedTasks.size})</button>
    <button onclick="bulkRequeue()">Requeue Selected (${selectedTasks.size})</button>
  </div>
`;

async function bulkFail() {
  for (const taskId of selectedTasks) {
    await api('POST', `/api/tasks/${taskId}/fail`, { reason: 'Bulk fail' });
  }
  renderTasksPage(); // Refresh list
}
```

### Example 3: Keyboard Shortcuts (Phase 10)
```javascript
// In MAIN APP section
document.addEventListener('keydown', (e) => {
  // Ignore if typing in input/textarea
  if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

  // Escape: Close modals
  if (e.key === 'Escape') {
    document.querySelectorAll('[role="dialog"]').forEach(modal => modal.remove());
  }

  // Ctrl+K: Focus search
  if (e.ctrlKey && e.key === 'k') {
    e.preventDefault();
    document.querySelector('[data-search]')?.focus();
  }

  // Ctrl+Shift+T: Navigate to Tasks
  if (e.ctrlKey && e.shiftKey && e.key === 'T') {
    router('tasks');
  }

  // Ctrl+Shift+E: Navigate to Enqueue
  if (e.ctrlKey && e.shiftKey && e.key === 'E') {
    router('enqueue');
  }
});
```

---

**Ready for Phase 10 planning approval and feature specification.**
