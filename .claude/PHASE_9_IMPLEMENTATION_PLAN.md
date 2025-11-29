# Phase 9 UI/UX Implementation Plan

**Status**: Plan ready for review and approval
**Created**: 2025-11-28
**Target**: Enhance SparkQ web dashboard to provide feature parity with CLI and improve UX

---

## Current State Assessment

### Code Structure
- **File**: `sparkq/ui/app.js` (1566 lines, monolithic single file)
- **Architecture**: Vanilla JavaScript with direct DOM manipulation
- **State Management**: Global variables and closures (pages, currentPage, taskFilters, etc.)
- **Styling**: `style.css` (well-structured with CSS variables)
- **HTML**: `index.html` (minimal, 33 lines with 5 page containers)

### Current Capabilities
✅ Dashboard with health/stats
✅ Sessions listing and creation
✅ Streams listing and creation
✅ Tasks listing with filters (stream, status)
✅ Task detail modal with full inspection
✅ Task lifecycle operations (claim, complete, fail, requeue)
✅ Enqueue form with script autocomplete
✅ Script indexing and metadata display
✅ Status polling (10s intervals)
✅ Error handling with notifications
✅ Form validation
✅ Loading states and button feedback

### Missing/Incomplete Features
❌ Configuration viewer (sparkq.yml, tools, task classes)
❌ Scripts discovery/search dedicated page
❌ Stream management improvements (detail view, end stream)
❌ Session detail view with nested streams
❌ Real-time updates beyond polling
❌ Advanced pagination for large datasets
❌ Keyboard shortcuts
❌ Dark/light mode toggle
❌ Batch operations (fail multiple, requeue multiple)
❌ Copy-to-clipboard for IDs
❌ Breadcrumb navigation
❌ Accessibility improvements (ARIA, semantic HTML)
❌ Mobile responsiveness polish

---

## Implementation Approach

### Architecture Refactoring

The 1566-line monolithic `app.js` should be **refactored into modules** while keeping it in a single file (no build system). Use patterns:

```javascript
// 1. Namespace pattern for logical grouping
const AppState = { /* global state */ };
const Components = { /* reusable UI components */ };
const Pages = { /* page-specific code */ };
const API = { /* API client functions */ };
const Utils = { /* utility functions */ };

// 2. Module comments to mark sections
// ===== STATE & GLOBALS =====
// ===== API CLIENT =====
// ===== COMPONENTS =====
// ===== PAGES =====
// ===== UTILITIES =====
// ===== MAIN APP =====
```

### Priority Levels

#### Priority 1: Core Missing Features (Foundational)
1. **Configuration Viewer Page**
   - Display sparkq.yml settings (server port, database path, purge days)
   - List all registered tools with descriptions, task classes, timeouts
   - List all task classes with timeout values
   - Read-only view (no editing)
   - API endpoint: `/api/config` (check if exists, if not create in api.py)

2. **Scripts Discovery Page**
   - Dedicated page separate from enqueue
   - Search/filter scripts by name, description, tags
   - Display script metadata (inputs, outputs, timeout, task_class)
   - Link scripts to enqueue form
   - Reuse existing script index loading logic

3. **Improved Error Handling**
   - Add error boundary for uncaught exceptions
   - Improve error messages with actionable guidance
   - Handle network timeouts gracefully
   - Handle 404s, 500s, 503s with specific messages

#### Priority 2: UX Enhancements (Polish)
4. **Copy-to-Clipboard**
   - Add copy icon to task IDs, stream IDs, session IDs
   - Use clipboard API with fallback
   - Show "Copied!" feedback toast

5. **Keyboard Navigation**
   - Tab through inputs and buttons
   - Enter to submit forms
   - Escape to close modals
   - Ctrl+K for command palette (optional)

6. **Breadcrumbs**
   - Show navigation path: Dashboard > Sessions > [Session] > Streams > [Stream] > Tasks
   - Link navigation back to previous level
   - Current page highlighted

7. **Pagination for Tasks**
   - Limit initial load to 50 tasks
   - Add "Load More" button or pagination controls
   - Show task count and current range

8. **Stream Detail View**
   - Show stream info (ID, name, session, created_at, status)
   - List tasks in stream with inline status badges
   - Add "End Stream" button for active streams
   - Show task count by status

9. **Session Detail View**
   - Show session info (ID, name, created_at, status)
   - List nested streams with task counts
   - Add "End Session" button for active sessions
   - Show task count aggregated across streams

#### Priority 3: Nice-to-Have (Polish & Accessibility)
10. **Dark/Light Mode Toggle**
    - Add toggle in navbar
    - Persist to localStorage
    - Use CSS custom properties (already in place)

11. **Batch Operations**
    - Checkbox column in task table
    - Bulk "Fail Selected", "Requeue Selected", "Purge Selected"
    - Confirmation dialog with count

12. **Accessibility (WCAG 2.1 AA)**
    - Add semantic HTML5 elements (nav, main, section, article)
    - Add ARIA labels and roles
    - Ensure color contrast ratios
    - Make modals focusable with proper focus management

13. **Mobile Responsiveness**
    - Test on 320px, 768px, 1024px breakpoints
    - Stack grid on mobile (use media queries)
    - Touch-friendly button sizing (min 44px)
    - Viewport meta tag already present

14. **Real-Time Updates (WebSocket)**
    - Optional: implement WebSocket for real-time task status
    - Fall back to polling if WebSocket unavailable
    - Subscribe to specific streams
    - Update task list without full re-render

---

## API Backend Changes Needed

### New Endpoint: `/api/config` (Priority 1.1)
**Purpose**: Return complete server configuration to UI

**Implementation Location**: `sparkq/src/api.py`

**Response Format**:
```json
{
  "server": {
    "port": 8420,
    "host": "0.0.0.0"
  },
  "database": {
    "path": "sparkq/data/sparkq.db",
    "mode": "wal"
  },
  "purge": {
    "older_than_days": 3
  },
  "tools": {
    "run-bash": {
      "description": "Execute a bash script",
      "task_class": "MEDIUM_SCRIPT"
    },
    "run-python": {
      "description": "Execute a python script",
      "task_class": "MEDIUM_SCRIPT"
    },
    "llm-haiku": {
      "description": "Call Claude Haiku",
      "task_class": "LLM_LITE"
    },
    "llm-sonnet": {
      "description": "Call Claude Sonnet",
      "task_class": "LLM_HEAVY"
    }
  },
  "task_classes": {
    "FAST_SCRIPT": {"timeout": 30},
    "MEDIUM_SCRIPT": {"timeout": 300},
    "LLM_LITE": {"timeout": 300},
    "LLM_HEAVY": {"timeout": 900}
  }
}
```

**Implementation Steps**:
1. Import yaml and Path in api.py
2. Create function to read sparkq.yml and ToolRegistry
3. Add `@app.get("/api/config")` endpoint
4. Return formatted JSON response

---

## File Modification Plan

### Phase 9a: Core Refactoring
**File**: `sparkq/ui/app.js`
**Changes**: Reorganize into logical sections with clear module comments

**Section Breakdown** (by line number ranges):
1. **Constants & Init** (1-30): Keep as-is
2. **STATE & GLOBALS** (31-100): Organize AppState object
3. **API CLIENT** (186-231): Create API module
4. **UTILITIES** (300-527): Create Utils module
5. **COMPONENTS** (554-605): Reusable UI helpers
6. **PAGES** (606-1567): Organize Pages module

**No functional changes**, just reorganization for clarity.

### Phase 9b: Backend API Enhancement

#### sparkq/src/api.py - Add Configuration Endpoint
**Location**: Add before or after existing endpoints

```python
@app.get("/api/config")
async def get_config():
    """Get complete server configuration"""
    import yaml
    from pathlib import Path
    from .tools import get_registry

    # Read server config
    config_path = Path("sparkq.yml")
    server_config = {}
    if config_path.exists():
        with open(config_path) as f:
            full_config = yaml.safe_load(f) or {}
            server_config = full_config.get("server", {})
            database_config = full_config.get("database", {})
            purge_config = full_config.get("purge", {})

    # Get tool registry
    registry = get_registry()

    return {
        "server": server_config or {"port": 8420, "host": "0.0.0.0"},
        "database": database_config or {"path": "sparkq/data/sparkq.db", "mode": "wal"},
        "purge": purge_config or {"older_than_days": 3},
        "tools": registry.tools,
        "task_classes": registry.task_classes,
    }
```

### Phase 9c: New Pages in UI

#### sparkq/ui/app.js - Add Configuration Page
```javascript
// New section in Pages module
Pages.Config = {
  async render(container) {
    // Fetch /api/config
    // Display server settings, tools, task classes
    // Format as cards or table
  }
}
```

#### sparkq/ui/app.js - Add Scripts Page
```javascript
// New section in Pages module
Pages.Scripts = {
  async render(container) {
    // Reuse existing loadScriptIndex()
    // Add search/filter
    // Display in table or cards
    // Link to enqueue form
  }
}
```

#### sparkq/ui/app.js - Improve Stream Detail
```javascript
// Extend Pages.Streams
Pages.Streams.renderStreamDetail = async function(streamId) {
  // Fetch stream info
  // List tasks in stream
  // Show "End Stream" button
}
```

#### sparkq/ui/app.js - Improve Session Detail
```javascript
// Extend Pages.Sessions
Pages.Sessions.renderSessionDetail = async function(sessionId) {
  // Fetch session info
  // List nested streams
  // Show "End Session" button
}
```

### Phase 9c: index.html Updates
**File**: `sparkq/ui/index.html`
**Changes**:
- Add nav tabs for Config, Scripts (if creating separate pages)
- Add breadcrumb container before main
- Add modals for stream/session details if needed
- Add focus trap script for modal accessibility

```html
<!-- New nav tabs -->
<button class='nav-tab' data-page='config'>Config</button>
<button class='nav-tab' data-page='scripts'>Scripts</button>

<!-- New page containers -->
<div id='config-page' class='page-content'></div>
<div id='scripts-page' class='page-content'></div>

<!-- Breadcrumb nav -->
<div id='breadcrumbs' class='breadcrumbs'></div>
```

### Phase 9d: style.css Updates
**File**: `sparkq/ui/style.css`
**Changes**:
- Add breadcrumb styles
- Add modal focus styles for a11y
- Add responsive media queries for mobile
- Add pagination styles
- Add checkbox styles for batch operations

---

## Implementation Sequence

### Step 1: Create Config API Endpoint
**Files**: `sparkq/src/api.py`
**Changes**:
- Add `/api/config` endpoint that returns full configuration
- Endpoint reads sparkq.yml using yaml parser
- Returns server, database, purge, tools, task_classes in single response
- Include safe defaults if config file missing

**Time**: ~20 minutes
**Testing**: `curl http://localhost:8420/api/config` returns JSON

### Step 2: Code Refactoring (No Behavior Changes)
**Files**: `app.js`
**Changes**:
- Reorganize into modules using namespace pattern
- Add section comments
- Group related functions
- Keep all functionality identical

**Time**: ~30 minutes
**Testing**: Verify all pages still work exactly as before

### Step 3: Configuration Viewer Page (Priority 1.1)
**Files**: `app.js`, `index.html`, `style.css`
**Changes**:
- Add `/api/config` endpoint in api.py (if needed)
- Create Pages.Config module
- Add 'config' nav tab
- Add 'config-page' container
- Render config data as cards or table
- Add "Reload Config" button

**Time**: ~45 minutes
**Testing**: Open config page, verify all settings display

### Step 4: Scripts Discovery Page (Priority 1.2)
**Note**: Reuse existing loadScriptIndex() - no new backend work needed
**Files**: `app.js`, `index.html`
**Changes**:
- Create Pages.Scripts module
- Reuse loadScriptIndex()
- Add search input for scripts
- Add filter by task_class
- Display scripts in table or grid
- Add link to enqueue page with pre-selected script

**Time**: ~40 minutes
**Testing**: Open scripts page, search for scripts, navigate to enqueue

### Step 5: Improved Error Handling (Priority 1.3)
**Note**: No API changes needed - pure UI improvements
**Files**: `app.js`, `style.css`
**Changes**:
- Add error boundary wrapper
- Enhance error messages with context
- Add specific handling for common errors (network, 404, 500)
- Add retry buttons for failed API calls
- Improve error toast styling

**Time**: ~30 minutes
**Testing**: Trigger various errors, verify helpful messages

### Step 6: Copy-to-Clipboard (Priority 2.1)
**Files**: `app.js`, `style.css`
**Changes**:
- Create Utils.copyToClipboard function
- Add copy buttons/icons to IDs throughout UI
- Add "Copied!" toast feedback
- Add keyboard shortcut Ctrl+C on focused ID

**Time**: ~25 minutes
**Testing**: Click copy buttons, verify clipboard content

### Step 7: Keyboard Navigation (Priority 2.2)
**Files**: `app.js`, `style.css`
**Changes**:
- Add keyboard event handlers for Enter, Escape, Tab
- Add Escape to close modals
- Add Enter to submit forms
- Add Tab trapping in modals (focus management)
- Add visual focus indicators

**Time**: ~30 minutes
**Testing**: Navigate with keyboard only, ensure all features accessible

### Step 8: Breadcrumbs (Priority 2.3)
**Files**: `app.js`, `index.html`, `style.css`
**Changes**:
- Add breadcrumb state tracking
- Create Utils.renderBreadcrumbs function
- Update on page navigation
- Make breadcrumbs clickable to navigate back
- Style breadcrumb component

**Time**: ~35 minutes
**Testing**: Navigate between pages, verify breadcrumb updates

### Step 9: Task Pagination (Priority 2.4)
**Files**: `app.js`, `style.css`
**Changes**:
- Add pagination state to AppState
- Modify renderTasksPage to paginate
- Add "Load More" button or pagination controls
- Show "Showing X-Y of Z" count
- Keep filter state across pagination

**Time**: ~40 minutes
**Testing**: Load task page, verify pagination works

### Step 10: Stream & Session Details (Priority 2.5 & 2.6)
**Files**: `app.js`, `style.css`
**Changes**:
- Make stream rows clickable
- Show stream detail modal with nested info
- Add "End Stream" button with confirmation
- Make session rows clickable
- Show session detail modal with nested streams
- Add "End Session" button with confirmation

**Time**: ~50 minutes
**Testing**: Click stream/session rows, open details, verify actions

### Step 11: Dark/Light Mode (Priority 3.1)
**Files**: `app.js`, `index.html`, `style.css`
**Changes**:
- Add mode toggle button in navbar
- Store preference in localStorage
- Apply `[data-theme="light"]` or `[data-theme="dark"]` to html
- Create light color palette in CSS variables
- Update navbar styling for theme toggle

**Time**: ~30 minutes
**Testing**: Toggle theme, verify colors change and persist on reload

### Step 12: Accessibility Improvements (Priority 3.2)
**Files**: `app.js`, `index.html`, `style.css`
**Changes**:
- Replace divs with semantic HTML (nav, main, section, article)
- Add ARIA labels and roles throughout
- Add skip-to-main link
- Ensure color contrast ≥ 4.5:1 for text
- Add focus indicators for keyboard users
- Test with screen reader (NVDA/JAWS simulation)

**Time**: ~60 minutes
**Testing**: Run aXe audit, test with keyboard only, verify ARIA labels

### Step 13: Mobile Responsiveness (Priority 3.3)
**Files**: `style.css`, `index.html`
**Changes**:
- Add mobile media queries (320px, 768px breakpoints)
- Stack grid layouts on mobile
- Increase button sizes to minimum 44px
- Make modals full-screen on mobile
- Test on actual devices or browser DevTools

**Time**: ~40 minutes
**Testing**: Open UI on mobile devices, verify layout and interactions

### Step 14: Batch Operations (Priority 3.4)
**Files**: `app.js`, `style.css`
**Changes**:
- Add checkbox column to task table
- Create CheckboxState for selected tasks
- Add bulk action toolbar (Fail Selected, Requeue Selected, etc.)
- Add confirmation dialog with count
- Handle deselect on page change

**Time**: ~45 minutes
**Testing**: Select multiple tasks, perform bulk actions

### Step 15: Real-Time Updates (Priority 3.5) - Optional
**Files**: `app.js`
**Changes**:
- Add WebSocket connection to server (if /api/ws exists)
- Fall back to polling if unavailable
- Subscribe to stream updates
- Update task list on events without full re-render
- Add connection status indicator

**Time**: ~60 minutes (if implemented)
**Testing**: Enqueue task in CLI, watch UI update in real-time

---

## Testing Strategy

### Manual Testing Checklist
- [ ] All 7 pages render without console errors
- [ ] Navigation works (tabs, breadcrumbs, back buttons)
- [ ] Filters persist across page navigation
- [ ] Task detail modal opens and closes properly
- [ ] All task actions (claim, complete, fail, requeue) work
- [ ] Create session/stream dialogs work
- [ ] Enqueue form validates and submits
- [ ] Script autocomplete works
- [ ] Error messages are helpful
- [ ] Status polling updates health indicator

### Accessibility Testing
- [ ] Keyboard-only navigation (no mouse)
- [ ] Tab order is logical
- [ ] Focus is visible
- [ ] Modals trap focus
- [ ] Escape closes modals
- [ ] Forms have labels
- [ ] Color not sole conveyor of info
- [ ] aXe audit passes

### Responsive Testing
- [ ] 320px width (mobile phone)
- [ ] 768px width (tablet)
- [ ] 1024px width (desktop)
- [ ] Touch interactions work on mobile

### Performance Testing
- [ ] Page loads < 2 seconds
- [ ] Task filtering < 100ms
- [ ] No console warnings or errors
- [ ] No memory leaks on long sessions

---

## Risk Assessment

### Low Risk
- Refactoring (no behavior changes)
- Adding new pages
- Adding copy-to-clipboard
- Adding keyboard shortcuts

### Medium Risk
- Modal focus management (a11y)
- Real-time WebSocket updates (if implemented)
- Batch operations (ensure state consistency)

### Mitigations
- Keep all changes in single file (easy to revert)
- Test each step before moving to next
- Use git commits for each major feature
- Monitor browser console for errors

---

## Success Criteria

### Functionality
- ✅ All 7 pages functional (Dashboard, Sessions, Streams, Tasks, Enqueue, Config, Scripts)
- ✅ Task lifecycle fully operational (peek, claim, complete, fail, requeue)
- ✅ Stream/session management complete
- ✅ Configuration viewer displays all settings
- ✅ Scripts discovery page with search

### UX
- ✅ First-time users understand workflow
- ✅ Common task (claim, complete) takes ≤ 3 clicks
- ✅ Status always clear (health indicator, task badges, error messages)
- ✅ Error messages are actionable
- ✅ No dead-end states or confusing flows

### Performance
- ✅ Pages load < 2 seconds
- ✅ Filtering < 100ms
- ✅ Supports ≥ 1000 tasks without significant lag
- ✅ No memory leaks

### Accessibility
- ✅ WCAG 2.1 AA compliant
- ✅ Fully keyboard navigable
- ✅ Screen reader friendly
- ✅ Color-blind friendly (no color-only info)

### Code Quality
- ✅ Well-organized sections with clear comments
- ✅ No console errors or warnings
- ✅ Consistent naming conventions
- ✅ DRY principle followed (reuse utils, components)

---

## Notes

1. **No Build System**: Keep everything in single `.js` file with namespace pattern for modularity
2. **Backward Compatibility**: All changes preserve existing API contracts
3. **Progressive Enhancement**: Features can be implemented one at a time
4. **Testing**: Manual testing sufficient given single-file scope
5. **Documentation**: Update UI in comments as code evolves

---

## Implementation Decisions (Investigated & Resolved)

1. **Config Endpoint**: Does NOT exist in api.py
   - **Decision**: Create `/api/config` endpoint in api.py that returns full config (server, database, tools, task_classes)
   - **Alternative**: Parse sparkq.yml client-side via fs (not ideal for security)
   - **Implementation**: Add endpoint to return JSON config from ToolRegistry + server settings

2. **WebSocket**: No WebSocket support currently
   - **Decision**: WebSocket is Priority 3.5 (optional, deferred)
   - **Reason**: Current polling (10s) is sufficient for MVP; WebSocket can be added later
   - **Keep**: Current polling mechanism as-is

3. **Modal vs Page**: For stream/session details
   - **Decision**: Use modals (like task detail modal)
   - **Reason**: Consistent UX, non-blocking, easy to implement, matches existing pattern

4. **Pagination**: Task list pagination style
   - **Decision**: "Load More" button (simpler, more common in web apps)
   - **Alternative**: Could add traditional pagination later if needed
   - **Implementation**: Keep initial 50 tasks, add button to load next batch

5. **Batch Size**: Initial task display count
   - **Decision**: 50 tasks per load
   - **Rationale**: Balances usability (not overwhelming) with performance (not too many requests)
   - **Scalability**: Can increase to 100 if performance permits

6. **Dark Mode Default**: Light/dark theme detection
   - **Decision**: Respect system preference (prefers-color-scheme media query)
   - **Fallback**: Default to dark (current color scheme)
   - **Storage**: Remember user choice in localStorage, override system preference

---

## Acceptance Checklist

- [ ] Plan reviewed and approved by user
- [ ] Core refactoring complete (no behavior changes)
- [ ] Config viewer implemented
- [ ] Scripts discovery page implemented
- [ ] Error handling improved
- [ ] Copy-to-clipboard working
- [ ] Keyboard navigation working
- [ ] Breadcrumbs implemented
- [ ] Task pagination implemented
- [ ] Stream/session details implemented
- [ ] All tests pass (manual checklist)
- [ ] a11y audit passes
- [ ] Mobile responsive verified
- [ ] Code reviewed and documented
- [ ] Changes committed to git

---

**Ready for user approval and feedback before implementation begins.**
