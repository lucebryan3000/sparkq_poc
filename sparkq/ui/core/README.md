# Core Module (app-core.js)

## Purpose
Shared functionality for all page modules.

## What's Included
- **STATE & GLOBALS** (~30 lines): Constants, global state, filters
- **API CLIENT** (~50 lines): HTTP request handler, error handling
- **UTILITIES** (~200 lines): Format functions, validators, DOM helpers
- **COMPONENTS** (~300 lines): UI builders, modals, forms, alerts
- **MAIN APP** (~150 lines): Router, initialization, event listeners

## Module Exports (exposed as window.*)
- `window.API`: HTTP client and API methods
  - `api(method, path, body, options)`: Main HTTP client
- `window.Utils`: Utility functions
  - Format: `formatTime()`, `formatBytes()`, `formatNumber()`, etc.
  - Validators: `validateEmail()`, `validateRequired()`, etc.
  - Helpers: `showAlert()`, `showError()`, `showSuccess()`, `createElement()`, etc.
- `window.Pages`: Page registry (empty at init, filled by page modules)
  - Each page module registers itself: `Pages.Dashboard`, `Pages.Tasks`, etc.

## Loading
Must load **FIRST** before any page modules.

**Location**: `sparkq/ui/core/app-core.js`
**Size**: ~900-1000 lines
**Dependencies**: None (standalone)

## Usage in Page Modules
All pages can access:
- `API.api()` - Make HTTP requests
- `Utils.*` - Format, validate, and display helpers
- `window.Pages` - Page registry for self-registration

Example in a page module:
```javascript
(function(Pages, API, Utils) {
  async function loadData() {
    try {
      const response = await API.api('GET', '/api/data');
      const formatted = Utils.formatNumber(response.count);
      Utils.showSuccess(`Loaded: ${formatted}`);
    } catch (err) {
      Utils.handleApiError('load data', err);
    }
  }

  Pages.MyPage = {
    async render(container) {
      await loadData();
    }
  };
})(window.Pages, window.API, window.Utils);
```

## Adding Features

### Shared Feature (Used by Multiple Pages)
1. Add to `core/app-core.js`
2. Export in `window.Utils` or `window.API`
3. Import in pages via function parameters

### Page-Specific Feature (Only One Page)
1. Add to `pages/{page}.js`
2. Keep as private scope inside IIFE
3. Access via IIFE parameters (Pages, API, Utils)

### New Page (Phase 12+)
1. Create `pages/new-page.js`
2. Follow IIFE pattern from existing pages
3. Add `<script>` tag in `index.html`
4. Register `Pages.NewPage = { async render(container) { } }`

## Key Functions

### API Client
- `api(method, path, body, {action})` - Make HTTP requests with error handling

### Utilities (Formatting)
- `formatNumber(value)` - Format as localized number
- `formatValue(value, fallback)` - Safe value display with fallback
- `formatStatusLabel(state)` - Human-readable status text
- `normalizeStatus(health)` - Normalize health response to status

### Utilities (UI)
- `showAlert(message, type, duration)` - Show dismissible alert
- `showError(message, error)` - Show error alert with logging
- `showSuccess(message)` - Show success alert
- `setStatusIndicator(state, health)` - Update status display

### Utilities (Forms)
- `attachValidationHandlers(form)` - Add live validation to form
- `validateRequiredFields(form)` - Check all required fields
- `markFieldError(field, message)` - Mark field as invalid
- `clearFieldError(field)` - Clear error from field

### Utilities (Theme)
- `initTheme()` - Initialize theme from localStorage or system preference
- `applyTheme(theme)` - Apply theme ("light" or "dark")
- `toggleTheme()` - Toggle between light and dark

### Main App
- `cachePages()` - Cache page DOM references
- `router(page)` - Navigate to page and render
- `startStatusPolling()` - Start status refresh interval
- `startDashboardPolling()` - Start dashboard-specific refresh
- `setupKeyboardShortcuts()` - Initialize keyboard handlers

## Architecture Decisions

### Why IIFE Pattern?
- No build system needed (pure browser ES5)
- Private scope for page-specific helpers
- Global registry for page modules
- Works with HTTP/2 multiplexing (8 files, no performance penalty)

### Why These Modules Export?
- `window.API`: Centralized HTTP client with consistent error handling
- `window.Utils`: Reusable formatting, validation, UI helpers
- `window.Pages`: Page registry for dynamic page loading and routing

### Dependencies?
- None - Core module is completely self-contained
- Pages depend on Core (loaded first)
- Pages do NOT depend on each other

## Performance Notes
- Total: 8 script files (~1800-2000 lines total)
- HTTP/2 multiplexing: Efficient parallel loading
- Load time: < 2 seconds (same as monolithic)
- Memory: < 50MB total

## Troubleshooting

### "API is undefined" Error
→ `core/app-core.js` didn't load
→ Check: Is `core/app-core.js` first in `index.html` scripts?

### "Pages.{PageName} is undefined"
→ `pages/{page}.js` didn't load
→ Check: Script tag exists in `index.html`?
→ Check: File has syntax errors?

### Module-not-found Errors
→ Use `Utils.*` and `API.*` from core
→ Import via IIFE parameters (Pages, API, Utils)
→ Don't use relative imports (IIFE doesn't support them)

## Next Steps (Phase 12+)
- [ ] Monitor page load performance
- [ ] Add lazy-loading for large pages
- [ ] Consider code splitting if modules exceed 200 lines
- [ ] Profile with DevTools to optimize hot paths
