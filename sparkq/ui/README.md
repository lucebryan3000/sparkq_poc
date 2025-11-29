# SparkQueue UI Architecture (Phase 11+)

## Overview
The UI is split into modular IIFE-wrapped files for better code organization and parallel development.

## File Structure
```
sparkq/ui/
├── core/
│   ├── app-core.js              # Shared: API, Utils, Components
│   └── README.md                # Core module documentation
├── pages/
│   ├── dashboard.js             # Dashboard page module
│   ├── sessions.js              # Sessions page module
│   ├── streams.js               # Streams page module
│   ├── tasks.js                 # Tasks page module (~420 lines)
│   ├── enqueue.js               # Enqueue form module
│   ├── config.js                # Configuration page module
│   └── scripts.js               # Scripts page module
├── index.html                   # Main HTML (loads core + pages)
├── style.css                    # Unified styles (shared by all pages)
└── README.md                    # This file
```

## Module Pattern (IIFE)

Each page module uses Immediately Invoked Function Expression (IIFE):

```javascript
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
```

### Benefits
- **No build system needed**: Pure browser JavaScript (ES5 compatible)
- **Private scope**: Page-specific helpers won't conflict
- **Global registry**: Pages can be loaded dynamically
- **HTTP/2 multiplexing**: 8 files load efficiently in parallel

## Loading Order
1. **index.html** loads scripts in order
2. **core/app-core.js** initializes (creates API, Utils, Pages)
3. **pages/*.js** each registers themselves in Pages registry
4. **DOMContentLoaded** fires → Router starts → Pages render

## Adding New Features

### Feature Used by Multiple Pages (goes to Core)
1. Add function/helper to `core/app-core.js`
2. Export in `window.Utils` or `window.API`
3. Reference in pages via parameters: `Utils.myFunction()`

**Example**: Add a date formatter
```javascript
// In core/app-core.js
function formatDate(dateStr) { /* ... */ }

// In EXPORTS section
window.Utils = { ..., formatDate };

// In any page module
Pages.MyPage = {
  async render(container) {
    const formatted = Utils.formatDate(myDate);
  }
};
```

### Feature Used by One Page (stays Local)
1. Add to `pages/{page}.js`
2. Keep as private function inside IIFE
3. Access directly in scope

**Example**: Add a task-specific sort function
```javascript
// In pages/tasks.js
(function(Pages, API, Utils) {

  function sortTasksByPriority(tasks) { /* ... */ }

  Pages.Tasks = {
    async render(container) {
      const sorted = sortTasksByPriority(tasks);
    }
  };

})(window.Pages, window.API, window.Utils);
```

### New Page (Phase 12+)
1. Create `pages/new-page.js`
2. Follow IIFE pattern from existing pages
3. Add `<script src="pages/new-page.js"></script>` in `index.html`
4. Register `Pages.NewPage` with async `render(container)` method

**Example**: Create a reports page
```javascript
// sparkq/ui/pages/reports.js
(function(Pages, API, Utils) {

  async function loadReports() {
    try {
      const data = await API.api('GET', '/api/reports');
      return data.reports;
    } catch (err) {
      Utils.handleApiError('load reports', err);
      return [];
    }
  }

  function renderReports(container, reports) {
    container.innerHTML = `
      <div class="card">
        <h2>Reports</h2>
        ${reports.map(r => `<div>${r.name}</div>`).join('')}
      </div>
    `;
  }

  Pages.Reports = {
    async render(container) {
      const reports = await loadReports();
      renderReports(container, reports);
    }
  };

})(window.Pages, window.API, window.Utils);
```

Then add to `index.html`:
```html
<script src='pages/reports.js'></script>
```

## Performance

### File Sizes
- core/app-core.js: ~950 lines
- pages/dashboard.js: ~80 lines
- pages/sessions.js: ~180 lines
- pages/streams.js: ~120 lines
- pages/tasks.js: ~420 lines (largest)
- pages/enqueue.js: ~370 lines
- pages/config.js: ~114 lines
- pages/scripts.js: ~145 lines
- **Total: ~1,800-2,000 lines**

### Load Characteristics
- **Total HTTP requests**: 8 script files
- **HTTP/2 multiplexing**: Efficient parallel loading
- **Load time**: < 2 seconds (same as monolithic app.js)
- **Memory usage**: < 50MB total
- **No build step**: Instant development refresh

## Development Workflow

### Making Changes

1. **Edit the relevant file**
   - Single page feature? → Edit `pages/{page}.js`
   - Shared feature? → Edit `core/app-core.js`

2. **Browser auto-reload or manual refresh**
   - No build step needed
   - Changes take effect immediately

3. **Test in DevTools**
   - Check console for errors
   - Verify page renders correctly

4. **Commit when working**
   - Keep commits focused on one change
   - Reference the page module in commit message

### Example: Add a feature to Tasks page
```bash
# 1. Edit the file
vim sparkq/ui/pages/tasks.js

# 2. Refresh browser
# Changes appear immediately

# 3. Test and commit
git add sparkq/ui/pages/tasks.js
git commit -m "feat: Add bulk complete action to tasks"
```

## Troubleshooting

### "API is undefined" Error
**Symptom**: Page shows "API is undefined" in console

→ **Cause**: `core/app-core.js` didn't load
→ **Fix**: Check `index.html` - is `core/app-core.js` the **first** script tag?

```html
<!-- This order is CRITICAL -->
<script src='core/app-core.js'></script>  <!-- FIRST -->
<script src='pages/dashboard.js'></script>
```

### "Pages.{PageName} is undefined"
**Symptom**: Page won't render, console shows "Pages.Dashboard is undefined"

→ **Cause**: Page module didn't load or has syntax error
→ **Fix**:
  1. Check script tag exists in `index.html`
  2. Check browser console for JavaScript errors
  3. Run syntax check: `node -c sparkq/ui/pages/{page}.js`

### Module-not-found Errors
**Symptom**: Page tries to use undefined function

→ **Cause**: Using wrong scope or import method
→ **Fix**: Use IIFE parameters correctly

```javascript
// ❌ WRONG - window.localStorage doesn't exist in this context
Pages.MyPage = {
  async render(container) {
    const data = window.myHelper();  // ERROR: myHelper is local to core
  }
};

// ✅ CORRECT - Use passed-in parameters
Pages.MyPage = {
  async render(container) {
    const formatted = Utils.formatValue(myData);  // Correct
    const response = await API.api('GET', '/api/data');  // Correct
  }
};
```

## Architecture Decisions (Why IIFE?)

### Why not ES6 modules?
- Requires build system (Webpack, Rollup, Vite)
- Adds complexity during development
- Need to compile before testing

### Why not CommonJS?
- Doesn't work in browser without bundler
- Would require Node.js-style module system

### Why IIFE?
- ✅ Works in all browsers (no transpiler)
- ✅ No build step needed (instant refresh)
- ✅ Private scope for each module
- ✅ Simple dependency injection via parameters
- ✅ HTTP/2 multiplexing handles multiple files efficiently
- ✅ Proven pattern (jQuery, etc.)

## Phase 12+ Planning

- **Monitor performance**: Use DevTools to identify slow pages
- **Consider lazy-loading**: Load large pages on-demand
- **Code splitting**: If any module exceeds 300 lines, split further
- **Profile with DevTools**: Optimize hot paths

## References

- [IIFE Pattern](https://developer.mozilla.org/en-US/docs/Glossary/IIFE)
- [HTTP/2 Multiplexing](https://developers.google.com/web/tools/chrome-devtools/network/reference#coloring-and-grouping)
- [Module Pattern](https://www.patterns.dev/posts/module-pattern/)
