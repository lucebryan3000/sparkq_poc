# Phase 11 Quick Reference Guide

**Status**: Planning Complete | Not for Execution
**Last Updated**: 2025-11-28
**Trigger**: Execute when Phase 10 reaches ~2,100-2,200 lines

---

## What is Phase 11?

Phase 11 is a **non-feature organizational refactor** that splits the monolithic `app.js` (1,866 → 2,100-2,200 lines) into a modular IIFE architecture:

- **Before**: 1 large file (`app.js`)
- **After**: 8 focused files (1 core + 7 pages)
- **Behavior**: Identical (zero new features, zero behavior changes)
- **Effort**: ~6-7 hours (1 work day)
- **Complexity**: Low (moving code around, no logic changes)

---

## The Numbers

| Metric | Value |
|--------|-------|
| **Files created** | 8 (1 core, 7 page modules) |
| **Total lines** | ~2,100-2,200 (no change) |
| **Core module size** | ~1,000 lines |
| **Page module sizes** | 80-420 lines each |
| **Build system needed** | ❌ None (pure IIFE) |
| **Estimated execution time** | 6-7 hours |
| **Risk level** | 🟢 Low (organizational only) |

---

## File Structure (Phase 11 Target)

```
sparkq/ui/
├── core/
│   ├── app-core.js              (new)    ~1,000 lines
│   └── README.md                (new)
├── pages/
│   ├── dashboard.js             (new)    ~80 lines
│   ├── sessions.js              (new)    ~80 lines
│   ├── streams.js               (new)    ~120 lines
│   ├── tasks.js                 (new)    ~420 lines
│   ├── enqueue.js               (new)    ~370 lines
│   ├── config.js                (new)    ~114 lines
│   └── scripts.js               (new)    ~145 lines
├── index.html                   (modified)
├── app.js                       (archived)
├── style.css                    (unchanged)
└── README.md                    (new)
```

---

## Module Pattern (IIFE)

Every page module follows this pattern:

```javascript
// pages/tasks.js
(function(Pages, API, Utils) {

  // Private scope (not accessible outside)
  const CACHE = {};

  // Public interface
  Pages.Tasks = {
    async render(container) {
      // Implementation using API.*, Utils.*, CACHE
    }
  };

  // Private helpers
  async function helper() { /* ... */ }

})(window.Pages, window.API, window.Utils);
```

**Key points**:
- Parameters shadow globals (cleaner syntax)
- Private variables/functions stay private
- Public interface registered in `Pages` registry
- No imports/exports (no build system needed)

---

## Module Dependencies

```
index.html
    ↓
[Load in this order]
    ↓
core/app-core.js (MUST load first)
    ├─ Initializes window.API
    ├─ Initializes window.Utils
    └─ Initializes window.Pages = {}
    ↓
pages/*.js (can load in any order after core)
    ├─ Pages.Dashboard = { ... }
    ├─ Pages.Sessions = { ... }
    ├─ Pages.Tasks = { ... }
    └─ (etc.)
```

**Critical**: core must load first, or pages fail with "undefined window.Pages" error.

---

## Execution Steps (Simplified)

### Step 1: Preparation (~30 min)
```bash
git checkout -b phase-11-modularization
git tag phase-10-complete
```

### Step 2: Extract Core (~1 hour)
- Create `sparkq/ui/core/app-core.js`
- Copy STATE, API, UTILITIES, COMPONENTS, MAIN APP sections
- Initialize window.API, window.Utils, window.Pages

### Step 3: Extract Pages (~3 hours)
- Create `sparkq/ui/pages/` directory
- For each page: extract render function, wrap in IIFE, register in Pages
- 7 pages × ~25 min each = ~3 hours

### Step 4: Update HTML (~15 min)
```html
<script src="core/app-core.js"></script>
<script src="pages/dashboard.js"></script>
<script src="pages/sessions.js"></script>
<!-- ... etc ... -->
```

### Step 5: Test & Validate (~1.5 hours)
- All pages load without errors
- All API operations work
- No console errors/warnings
- Performance unchanged
- Regression: Phase 10 & 9 features intact

### Step 6: Commit (~45 min)
```bash
git add -A
git commit -m "feat: Phase 11 - Modularize UI with IIFE pattern"
```

**Total**: ~6-7 hours

---

## Validation Checklist

**Quick Console Checks** (2 min):
```javascript
// In browser console:
window.API              // Should exist
window.Utils            // Should exist
window.Pages            // Should exist
window.Pages.Dashboard  // Should exist
window.Pages.Tasks      // Should exist
// ... etc for all 7 pages
```

**Page Load Checklist** (10 min per page):
- [ ] Dashboard loads, renders correctly
- [ ] Sessions loads, renders correctly
- [ ] Streams loads, renders correctly
- [ ] Tasks loads, renders correctly (verify Phase 10 features)
- [ ] Enqueue loads, renders correctly
- [ ] Config loads, renders correctly
- [ ] Scripts loads, renders correctly

**Feature Checklist** (15 min):
- [ ] Navigation between pages works
- [ ] Task detail modal opens/closes
- [ ] Batch operations work (Phase 10)
- [ ] Pagination works (Phase 10)
- [ ] Dark mode toggle works (Phase 10)
- [ ] Keyboard shortcuts work (Phase 10)
- [ ] Copy-to-clipboard works (Phase 10)

**Console Check** (2 min):
- [ ] No errors in console
- [ ] No warnings in console
- [ ] No undefined references

**Performance Check** (5 min):
- [ ] Page load time < 2s (DevTools)
- [ ] Script parse < 200ms (DevTools)
- [ ] No memory leaks (leave open 15 min)

---

## Success Criteria (Binary)

✅ **Phase 11 is successful if ALL of these are true**:
1. ✅ 8 module files exist (1 core + 7 pages)
2. ✅ index.html loads all 8 scripts in correct order
3. ✅ Zero JavaScript errors on any page
4. ✅ All 7 pages render correctly
5. ✅ All Phase 10 features still work
6. ✅ All Phase 9 features still work
7. ✅ Page load time < 2 seconds
8. ✅ No console errors or warnings
9. ✅ Module documentation complete
10. ✅ Single atomic git commit

---

## What Could Go Wrong?

| Issue | Symptom | Fix |
|-------|---------|-----|
| Page module loads before core | "Uncaught ReferenceError: Pages is not defined" | Check HTML script load order (core first) |
| State not copied to core | Pages function but data is missing | Verify all state vars copied to app-core.js |
| Missing helper function | "Uncaught ReferenceError: helper is not defined" | Search app.js for missing function, add to right module |
| Circular dependency | Page A calls page B which calls page A | Use API/Utils for inter-page communication (unlikely) |
| File size mismatch | Modules total < original app.js | Check for accidentally deleted code |
| Performance degradation | Page load time > 2s | Profile with DevTools; likely not an issue |

**Mitigation**: Keep `phase-10-complete` git tag; easy to rollback if issues found.

---

## Why IIFE (Not Something Else)?

| Approach | Trade-off | Phase 11 Decision |
|----------|-----------|-------------------|
| **Keep monolithic** | ❌ File gets unwieldy beyond 2,500 lines | No; defeats purpose of modularization |
| **IIFE modules** | ✅ Simple, no build, manual loading | **CHOSEN** ← Low complexity, high clarity |
| **ES6 modules** | ⚠️ Requires import-map, more complex | Overkill for current size; defer to Phase 15+ |
| **Full bundler** | ❌ 500MB node_modules, build step required | Contradicts simplicity philosophy |

**Why IIFE wins**: Simplest approach that enables parallel development without build system complexity.

---

## After Phase 11: What's Next?

### Phase 12+
- Add new features to existing modules
- If new page needed: create `pages/new-page.js`, add to HTML
- If shared utility needed: add to `core/app-core.js`

### If Growing Beyond 2,500 Lines Total
- Consider ES6 modules (easier IDE support)
- But no build system needed yet

### If Team Size Grows
- Modular architecture enables parallel development
- Pages can be developed independently

### If Bundling Becomes Needed
- Convert IIFE to ES6 imports (straightforward)
- Use Vite or esbuild for bundling
- No existing code needs to change, just syntax conversion

---

## Key Decisions Summary

| Decision | Choice | Why |
|----------|--------|-----|
| **Module Pattern** | IIFE | Simple, no build system |
| **File Count** | 8 | Balance between organization and complexity |
| **Load Strategy** | Sequential HTML scripts | Transparent, explicit ordering |
| **Size Threshold** | ~2,200 lines triggers split | Reasonable before unwieldy |
| **Rollback Plan** | Git tag phase-10-complete | Safe to attempt, easy to revert |
| **Behavior Changes** | Zero | Purely organizational refactor |

---

## Quick Links

- **Full Phase 11 Plan**: [PHASE_11_MODULARIZATION_PLAN.md](./PHASE_11_MODULARIZATION_PLAN.md)
- **Phase 10 Plan**: [PHASE_10_IMPLEMENTATION_PLAN.md](./PHASE_10_IMPLEMENTATION_PLAN.md)
- **Roadmap**: [ROADMAP_PHASE_10_11.md](./ROADMAP_PHASE_10_11.md)
- **Project Guidelines**: [CLAUDE.md](./CLAUDE.md)

---

## When to Execute Phase 11

✅ **Execute Phase 11 when ALL of these are true**:
- [ ] Phase 10 is complete and stable
- [ ] `app.js` is at 2,100-2,200 lines (within expected range)
- [ ] All Phase 10 features tested and working
- [ ] No critical bugs blocking deployment
- [ ] Team has ~7 hours available for uninterrupted refactoring
- [ ] This plan has been reviewed and approved

⚠️ **Defer Phase 11 if**:
- Phase 10 scope expands significantly
- Critical bugs found in Phase 10
- Need to add features in parallel

---

**Ready for Phase 11 execution when Phase 10 stabilizes. See detailed plans for full documentation.**
