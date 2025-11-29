# SparkQueue UI Roadmap: Phase 10 & 11

> **Current State**: Phase 9 complete (1,866 lines, 7 pages)
> **Next**: Phase 10 feature development → Phase 11 modularization
> **Timeline**: ~2-3 weeks (Phase 10) + ~1 week (Phase 11)

---

## Quick Reference

### Phase 10: Feature Enhancement (Monolithic)
- **File**: Single `sparkq/ui/app.js`
- **Size**: 1,866 → ~2,100-2,200 lines (+200-300 lines)
- **Features**: Batch operations, pagination, keyboard shortcuts, dark mode, copy-to-clipboard
- **Pattern**: Monolithic (maintained for simplicity during feature dev)
- **Trigger for Phase 11**: File exceeds 2,300 lines OR parallel work needed

### Phase 11: Architecture Refactor (Modular)
- **Files**: 8 modular files (1 core + 7 pages)
- **Size**: Same 2,100-2,200 lines, better organized
- **Pattern**: IIFE-wrapped modules (no build system)
- **Effort**: 6-7 hours (organizational refactor, zero behavior changes)
- **Trigger**: After Phase 10 completes + stabilizes (~1-2 weeks)

---

## Phase 10 At a Glance

### Phase 10 Feature List

| Feature | Priority | Lines | Location | Status |
|---------|----------|-------|----------|--------|
| Batch Operations (checkboxes, bulk actions) | 2 | 80 | Tasks page | Planned |
| Task Pagination ("Load More" button) | 2 | 70 | Tasks page | Planned |
| Keyboard Shortcuts (Escape, Ctrl+K, etc.) | 3 | 50 | MAIN APP | Planned |
| Dark/Light Mode Toggle | 3 | 40 | COMPONENTS + CSS | Planned |
| Copy-to-Clipboard Helper | 2 | 30 | UTILITIES + Tasks | Planned |
| **Total Phase 10 Addition** | - | **270** | - | **Planned** |
| **Projected Total (Post-Phase 10)** | - | **~2,100-2,200** | - | **On Track** |

### Phase 10 Acceptance Criteria
- ✅ All features implemented and tested
- ✅ No console errors or warnings
- ✅ Performance maintained (< 2s page load)
- ✅ All Phase 9 features still work
- ✅ Keyboard navigation working
- ✅ Mobile responsive (320px, 768px, 1024px)

### Phase 10 Development Strategy
1. **Single file approach** (keep app.js monolithic)
2. Implement features sequentially, one per commit
3. Test after each feature
4. Monitor file size growth
5. Plan Phase 11 trigger point

---

## Phase 11 At a Glance

### Phase 11 Modularization

**Before** (Phase 10 end):
```
sparkq/ui/app.js         (2,100-2,200 lines, monolithic)
```

**After** (Phase 11 end):
```
sparkq/ui/
├── core/app-core.js     (~1,000 lines: shared functionality)
├── pages/dashboard.js   (~80 lines)
├── pages/sessions.js    (~80 lines)
├── pages/streams.js     (~120 lines)
├── pages/tasks.js       (~420 lines, includes Phase 10 features)
├── pages/enqueue.js     (~370 lines)
├── pages/config.js      (~114 lines)
└── pages/scripts.js     (~145 lines)
```

### Phase 11 Module Architecture

```
                    index.html
                        |
            [Loads scripts in order]
                        |
            core/app-core.js (FIRST)
        [Exposes API, Utils, Pages]
                        |
        +-------+-------+-------+-------+-------+-------+-------+
        |       |       |       |       |       |       |       |
    dashboard sessions streams tasks enqueue config scripts
        |       |       |       |       |       |       |       |
    [Each module registers in Pages registry]
```

### Phase 11 Module Breakdown

**Core Module** (`app-core.js` - ~1,000 lines):
- STATE & GLOBALS (80 lines): Constants, globals, filters
- API CLIENT (70 lines): HTTP request handler
- UTILITIES (250 lines): Formatting, DOM helpers, validators
- COMPONENTS (400 lines): UI building blocks, modals, forms
- MAIN APP (200 lines): Router, initialization, events

**Page Modules** (~1,130 lines total):
- `pages/dashboard.js`: Dashboard rendering (~80 lines)
- `pages/sessions.js`: Session list (~80 lines)
- `pages/streams.js`: Stream list (~120 lines)
- `pages/tasks.js`: Task management (~420 lines, largest)
- `pages/enqueue.js`: Job enqueueing (~370 lines)
- `pages/config.js`: Configuration (~114 lines)
- `pages/scripts.js`: Script management (~145 lines)

### Phase 11 IIFE Pattern Example

```javascript
// pages/tasks.js
(function(Pages, API, Utils) {

  // Private module scope
  const CACHE = {};
  const FILTERS = { streamId: '', status: '' };

  // Register in global Pages registry
  Pages.Tasks = {
    async render(container) {
      // Full Tasks page implementation
      const tasks = await API.getTasks(FILTERS);
      // ... rendering logic ...
    }
  };

  // Private helpers (not accessible from other modules)
  async function renderTaskList() { /* ... */ }
  async function renderTaskDetail(taskId) { /* ... */ }

})(window.Pages, window.API, window.Utils);
```

### Phase 11 Benefits
- ✅ Cleaner file organization (8 files vs 1 monolithic)
- ✅ Easier navigation (find code by page name)
- ✅ Enables parallel development (multiple people on different pages)
- ✅ Better onboarding (smaller files to understand)
- ✅ Zero build system complexity (IIFE pattern is simple)
- ✅ Future-proof (easy migration to ES6 modules or bundler later)

---

## Development Timeline Sketch

### Phase 10 (Feature Development)
```
Week 1:
  Mon: Batch operations implementation
  Tue: Test batch operations, fix bugs
  Wed: Pagination & keyboard shortcuts
  Thu: Dark mode theme toggle
  Fri: Copy-to-clipboard helpers, general testing

Week 2:
  Mon: Performance optimization & polish
  Tue: Full regression testing (Phase 9 features)
  Wed: Mobile responsive testing
  Thu: Code review & fixes
  Fri: Phase 10 complete, stabilize, tag phase-10-complete

→ Phase 10 complete (~2,100-2,200 lines)
```

### Phase 11 (Modularization)
```
After Phase 10 stabilizes (1-2 weeks):

Day 1:
  Morning: Preparation (feature branch, backup tag)
  Afternoon: Extract core module

Day 2:
  Full day: Extract 7 page modules (one per 1-1.5 hours)

Day 3:
  Morning: Update HTML, initial validation
  Afternoon: Full testing (all pages, all features)
  Evening: Fix any issues found

Day 4:
  Morning: Documentation & cleanup
  Afternoon: Code review, final commit
  Evening: Merge & deploy

→ Phase 11 complete (modularized, identical behavior)
```

---

## Key Decision: Why IIFE Modules (Not ES6 or Bundler)?

### Comparison Matrix

| Factor | IIFE | ES6 Modules | Bundler (Webpack/Vite) |
|--------|------|-------------|------------------------|
| **Build System** | None ✅ | None | Required ⚠️ |
| **Complexity** | Low ✅ | Medium | High ⚠️ |
| **Browser Support** | Excellent ✅ | Good (polyfill) | Excellent ✅ |
| **Performance** | Excellent (HTTP/2) ✅ | Good (HTTP/2) | Excellent ✅ |
| **Learning Curve** | Easy ✅ | Medium | Hard ⚠️ |
| **IDE Support** | Good ✅ | Excellent ✅ | Excellent ✅ |
| **node_modules Size** | 0KB ✅ | 0KB | 500MB+ ⚠️ |
| **Development Speed** | Very Fast ✅ | Fast ✅ | Slower ⚠️ |
| **Project Fit** | Excellent ✅ | Good | Overkill ⚠️ |

**Decision**: **IIFE Modules** for Phase 11
- Aligns with SparkQueue philosophy (simplicity first)
- No build complexity
- HTTP/2 multiplexing handles 8 files efficiently
- Easy to transition to ES6 or bundler later if needed

---

## Critical Success Metrics

### Phase 10 Completion Metrics
- [ ] `app.js` size: 2,100-2,200 lines (target achieved)
- [ ] Page load time: < 2 seconds
- [ ] No console errors or warnings
- [ ] All 5 new features working correctly
- [ ] All Phase 9 features still working
- [ ] Responsive on 320px, 768px, 1024px widths

### Phase 11 Completion Metrics
- [ ] All 7 pages load without errors
- [ ] Modular file structure created (8 files)
- [ ] Page load time: < 2 seconds (same as Phase 10)
- [ ] No console errors or warnings
- [ ] Identical behavior to Phase 10 (zero new features)
- [ ] All Phase 10 & 9 features working
- [ ] Module architecture documented

---

## After Phase 11: Future Considerations

### Phase 12+ (Future features in modular structure)
- Continue adding features to appropriate modules
- Can add new pages by creating `pages/new-page.js`
- Shared utilities go to `core/app-core.js`

### Transition to ES6 (Phase 15+, if needed)
Current IIFE:
```javascript
(function(Pages, API, Utils) {
  Pages.Tasks = { /* ... */ };
})(window.Pages, window.API, window.Utils);
```

Future ES6:
```javascript
import { API, Utils } from './core/app-core.js';
export const Tasks = { /* ... */ };
```

Migration is straightforward; no breaking changes needed.

### Adoption of Bundler (Phase 20+, if needed)
If codebase grows significantly:
1. Install Vite: `npm install -D vite`
2. Update index.html to use ES6 modules
3. Convert IIFE → ES6 imports (existing structure makes this easy)
4. Run `vite build` for production

No changes to current IIFE work needed; future option only.

---

## Implementation Confidence Level

| Aspect | Confidence | Notes |
|--------|------------|-------|
| **Phase 10 feature scope** | 🟢 High | Features well-defined, moderate complexity |
| **Phase 10 timeline** | 🟢 High | Features are straightforward, no blockers expected |
| **Phase 10 monolithic approach** | 🟢 High | Single file holds up well to 2,200 lines |
| **Phase 11 modularization plan** | 🟢 High | IIFE pattern proven, low-risk organizational refactor |
| **Phase 11 timeline** | 🟢 High | Extraction process straightforward, no build system complexity |
| **Zero behavior change** | 🟢 High | Moving code, not changing logic; easy to validate |
| **Parallel development post-Phase 11** | 🟢 High | Module isolation enables this cleanly |

---

## Rollback & Risk Mitigation

### If Phase 10 Encounters Issues
- **Light scope**: Defer lower-priority features to Phase 11
- **Critical blocker**: Revert Phase 10 changes, return to Phase 9 stable
- **Growth unexpected**: Trigger Phase 11 modularization earlier

### If Phase 11 Encounters Issues
- **Pre-Phase 11**: Create git tag `phase-10-complete` (known good state)
- **If migration fails**: Reset to `phase-10-complete`, retry or defer modularization
- **Worst case**: Revert modularization, stay on monolithic until Phase 15+

---

## Related Documentation

- [Phase 10 Implementation Plan](./PHASE_10_IMPLEMENTATION_PLAN.md) - Detailed feature specs and development strategy
- [Phase 11 Modularization Plan](./PHASE_11_MODULARIZATION_PLAN.md) - Detailed migration steps and IIFE pattern examples
- [SparkQueue Project Guidelines](./CLAUDE.md) - Project principles and development workflow

---

## Summary Table

| Phase | Version | Size | Architecture | Status | Effort |
|-------|---------|------|--------------|--------|--------|
| 9 | 1.0 | 1,866 lines | Monolithic (6 sections) | ✅ Complete | - |
| 10 | 1.1 | 2,100-2,200 lines | Monolithic (enhanced) | 📋 Planned | ~2-3 weeks |
| 11 | 1.2 | 2,100-2,200 lines | Modular (8 IIFE files) | 📋 Planned | ~6-7 hours |
| 12+ | 1.3+ | Growing | Modular (add to modules) | 📋 Future | Per-feature |

---

**Ready for Phase 10 & 11 planning review.**
**Questions? See Phase 10 or Phase 11 detailed plans above.**
