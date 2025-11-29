# Phase 9 UI/UX Implementation Plan - Complete Orchestration Model

> **Total Token Budget:** ~8-10K tokens (Sonnet + Haiku only, $0 Codex execution)
> **Breakdown:** 4-5K Sonnet (prompt generation) + 3-4K Haiku (validation) + $0 Codex code generation
> **Execution Model:** Sonnet → Codex (parallel) → Haiku (validation)
> **Wall-Clock Time:** ~35-50 minutes with parallelization
> **Status**: Ready for orchestrated Codex execution

---

## Executive Summary

Phase 9 enhances the SparkQ web dashboard to achieve feature parity with CLI while improving UX. Using the Complete Orchestration Pattern:

1. **Step 1 (Sonnet)**: Generate 4 detailed Codex prompts from this specification (4-5K tokens, 5 min)
2. **Step 2 (Codex)**: Execute all 4 prompts in parallel across 4 processes ($0 cost, 20-30 min)
3. **Step 3 (Haiku)**: Validate syntax, imports, and completeness of generated files (3-4K tokens, 5 min)

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

## Codex Task Classification

### Code Generation Tasks (Codex - $0)
1. **API Backend Enhancement** - `sparkq/src/api.py`
   - Add `/api/config` endpoint (75 lines)
   - Pattern: REST endpoint with config aggregation

2. **UI Refactoring & Core Features** - `sparkq/ui/app.js`
   - Reorganize into modules (namespace pattern)
   - Add Config viewer page module
   - Add Scripts discovery page module
   - Add error handling improvements
   - Pattern: Vanilla JS module organization

3. **HTML Structure Updates** - `sparkq/ui/index.html`
   - Add 2 new page containers
   - Add breadcrumb container
   - Pattern: Minimal HTML template additions

4. **Styling Enhancements** - `sparkq/ui/style.css`
   - Add breadcrumb styles
   - Add pagination styles
   - Add modal a11y styles
   - Pattern: CSS variable-based theming

### Orchestration Tasks (Sonnet - 4-5K tokens)
- Generate 4 detailed Codex prompts
- Each prompt: exact file path, requirements, context, examples

### Validation Tasks (Haiku - 3-4K tokens)
- Syntax validation for each generated file
- Import path verification
- Placeholder detection (TODO/FIXME)
- Integration compatibility check

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

## Complete Execution Workflow - Codex Orchestration

### STEP 1: Sonnet Prompt Generation (5 min, 4-5K tokens)

**Objective**: Generate 4 detailed Codex prompts for parallel execution

**Deliverables**:
- 1 prompt for API endpoint enhancement (api.py)
- 1 prompt for UI refactoring with new modules (app.js)
- 1 prompt for HTML structure updates (index.html)
- 1 prompt for styling enhancements (style.css)

**Process** (Sonnet):
1. Read this complete specification (sections: Current State, Features, Decisions)
2. Read existing source files to understand patterns
3. Generate 4 detailed Codex prompts, each including:
   - Exact file path and current line count
   - Complete requirements and acceptance criteria
   - Specific code patterns and examples from current codebase
   - Exact insertions/modifications needed
   - Validation instructions

**Estimated tokens**: 4-5K (includes context reading + prompt generation)

---

### STEP 2: Codex Parallel Execution (20-30 min, $0 cost)

Execute all 4 Codex prompts in parallel across separate terminal processes:

**Terminal 1**: Generate `sparkq/src/api.py` enhancement
- Add `/api/config` endpoint (~75 lines)
- Returns server, database, purge, tools, task_classes
- Reads sparkq.yml + ToolRegistry

**Terminal 2**: Generate `sparkq/ui/app.js` refactoring + core features
- Reorganize existing code into namespace modules
- Add Pages.Config module (150-200 lines)
- Add Pages.Scripts module (120-150 lines)
- Add error handling improvements throughout

**Terminal 3**: Generate `sparkq/ui/index.html` updates
- Add nav tabs for Config, Scripts pages
- Add page containers for both new pages
- Add breadcrumb navigation container
- Add focus trap for modal a11y

**Terminal 4**: Generate `sparkq/ui/style.css` enhancements
- Add breadcrumb navigation styles
- Add pagination button styles
- Add modal a11y focus styles
- Add media queries for mobile (320px, 768px, 1024px)

**Execution**:
```bash
# Run each in separate terminal window
codex exec --full-auto -C /home/luce/apps/sparkqueue "Prompt 1 from Step 1..."
codex exec --full-auto -C /home/luce/apps/sparkqueue "Prompt 2 from Step 1..."
codex exec --full-auto -C /home/luce/apps/sparkqueue "Prompt 3 from Step 1..."
codex exec --full-auto -C /home/luce/apps/sparkqueue "Prompt 4 from Step 1..."
```

**Expected**: All 4 files modified/enhanced with zero syntax errors
**Wall-clock time**: 20-30 minutes (parallel execution)

---

### STEP 3: Haiku Validation (5 min, 3-4K tokens)

After Step 2 completes, validate all generated files:

**Validation A** (1K tokens):
```bash
python -m py_compile sparkq/src/api.py
grep -n "async def get_config" sparkq/src/api.py
curl http://localhost:8420/api/config | jq . 2>/dev/null
```
- ✓ Python syntax valid
- ✓ Endpoint exists
- ✓ Returns valid JSON

**Validation B** (1K tokens):
```bash
grep -n "const Pages\|const API\|const Utils" sparkq/ui/app.js | head -10
grep "Pages.Config\|Pages.Scripts" sparkq/ui/app.js | wc -l
```
- ✓ Modules properly defined
- ✓ New page modules present
- ✓ No placeholder code (TODO/FIXME) in new sections

**Validation C** (1K tokens):
```bash
grep -n "config-page\|scripts-page\|breadcrumbs" sparkq/ui/index.html
```
- ✓ New page containers added
- ✓ Breadcrumb nav element present

**Validation D** (1K tokens):
```bash
grep -n "\.breadcrumb\|@media.*320px\|\.pagination" sparkq/ui/style.css
```
- ✓ Breadcrumb styles added
- ✓ Mobile media queries present
- ✓ Pagination styles present

**Final Check**:
```bash
# Verify UI still loads without errors
curl http://localhost:8420/ui/ | grep -c "DOCTYPE"
# Check browser console for errors (manual)
```

---

## Success Criteria for Phase 9

### After Step 2 (Codex Execution)
- ✅ `/api/config` endpoint returns valid JSON with full configuration
- ✅ `app.js` reorganized into namespace modules without behavior changes
- ✅ Pages.Config and Pages.Scripts modules present and functional
- ✅ index.html contains new page containers and breadcrumb nav
- ✅ style.css includes breadcrumb, pagination, and mobile responsive styles
- ✅ All files valid syntax (Python + JavaScript)
- ✅ UI loads at `http://localhost:8420/ui/` without errors

### After Step 3 (Haiku Validation)
- ✅ All syntax validations pass
- ✅ No placeholder code (TODO/FIXME) in new sections
- ✅ Import paths correct
- ✅ API endpoint accessible and returning expected data
- ✅ No console errors in browser

### Future Enhancement Tasks (Not in MVP)
These features are out of scope for Phase 9 MVP but documented for future phases:
- Copy-to-clipboard functionality
- Keyboard shortcuts (Escape, Enter, Tab)
- Breadcrumb click navigation
- Task pagination "Load More"
- Stream/Session detail modals
- Dark/light mode toggle
- Batch operations (checkboxes)
- Accessibility audit (WCAG 2.1 AA)
- Mobile responsiveness testing
- Real-time WebSocket updates

---

## Notes

1. **Architecture**: Single-file app.js using namespace pattern (no build system)
2. **Backward Compatibility**: All changes preserve existing behavior
3. **Phased Approach**: MVP focuses on Config viewer + Scripts page
4. **Token Efficiency**: 8-10K tokens total (Sonnet + Haiku) vs 25K+ for traditional approach
5. **Parallelization**: All 4 Codex prompts execute simultaneously = 50% time savings

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

## Next Steps

### When Ready to Execute
1. **Step 1 (Now)**: Review & approve this Codex-optimized plan
2. **Step 2 (Sonnet, 5 min)**: Use this spec to generate 4 detailed Codex prompts
   - Sonnet will read current source files and generate exact, executable prompts
   - Output: 4 Codex prompts ready to execute in parallel
3. **Step 3 (Codex, 20-30 min)**: Execute prompts in parallel
   - 4 terminal windows running simultaneously
   - Each generates/modifies one file
   - Cost: $0 (Codex has separate subscription)
4. **Step 4 (Haiku, 5 min)**: Validate all files
   - Syntax checks
   - Integration compatibility
   - No placeholder code left behind

### Execution Command (After Step 1 Approval)
```bash
# Step 1: Generate Codex prompts (Sonnet)
# (Manually invoke Sonnet with this file as context)

# Step 2: Execute in 4 parallel terminals
codex exec --full-auto -C /home/luce/apps/sparkqueue "<Prompt 1 from Sonnet>"
codex exec --full-auto -C /home/luce/apps/sparkqueue "<Prompt 2 from Sonnet>"
codex exec --full-auto -C /home/luce/apps/sparkqueue "<Prompt 3 from Sonnet>"
codex exec --full-auto -C /home/luce/apps/sparkqueue "<Prompt 4 from Sonnet>"

# Step 3: Validate (Haiku)
# (Run validation commands from STEP 3 section above)

# Step 4: Test
git diff  # Review all changes
npm run test  # If applicable
# Manual: Visit http://localhost:8420/ui/ and verify pages load
```

---

## Acceptance Checklist

- [ ] Plan reviewed and approved by user
- [ ] Sonnet generates 4 detailed Codex prompts
- [ ] Codex executes all 4 prompts in parallel without errors
- [ ] Haiku validates all generated files
- [ ] All syntax validations pass
- [ ] `/api/config` endpoint returns valid JSON
- [ ] Config page and Scripts page load without errors
- [ ] Changes committed to git

---

**Ready for Codex-optimized execution following the Complete Orchestration Pattern.**
