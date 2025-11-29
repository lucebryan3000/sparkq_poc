# SparkQueue Planning Index

**Current Version**: Phase 9 Complete (1,866 lines)
**Next**: Phase 10 & 11 planned and documented
**Last Updated**: 2025-11-28

---

## Planning Documents (Read in Order)

### 1. **Roadmap** - Start Here
📄 [ROADMAP_PHASE_10_11.md](./ROADMAP_PHASE_10_11.md)

**Purpose**: High-level overview of Phase 10 & 11
**Contains**:
- Quick reference for both phases
- Feature list for Phase 10 (5 features, +270 lines)
- Architecture decision for Phase 11 (IIFE modules)
- Timeline sketch (~3-4 weeks total)
- Success metrics
- Confidence levels

**Read time**: 10 minutes
**Audience**: Everyone (project overview)

---

### 2. **Phase 10 Detailed Plan**
📄 [PHASE_10_IMPLEMENTATION_PLAN.md](./PHASE_10_IMPLEMENTATION_PLAN.md)

**Purpose**: Comprehensive feature development specification
**Contains**:
- Current state analysis (1,866 lines, 6 sections)
- 3 architectural options evaluated (single file vs IIFE vs ES6)
- Recommendation: Keep monolithic for Phase 10
- 5 detailed feature specifications
  - Batch Operations (80 lines)
  - Task Pagination (70 lines)
  - Keyboard Shortcuts (50 lines)
  - Dark/Light Mode (40 lines)
  - Copy-to-Clipboard (30 lines)
- Implementation strategy (sequential development)
- Acceptance criteria (code, features, performance, compatibility, testing)
- Architecture decision summary table
- Code examples for each feature

**Read time**: 30 minutes
**Audience**: Developers implementing Phase 10 features

---

### 3. **Phase 11 Detailed Plan**
📄 [PHASE_11_MODULARIZATION_PLAN.md](./PHASE_11_MODULARIZATION_PLAN.md)

**Purpose**: Complete modularization specification
**Contains**:
- Executive summary
- Architecture decision: IIFE modules (not ES6, not bundler)
- Full file structure breakdown (8 files, ~2,100 lines)
- Module dependency graph
- IIFE pattern explanation
- 7-step migration strategy
  - Step 1: Preparation
  - Step 2: Extract core module
  - Step 3: Extract 7 page modules
  - Step 4: Update HTML
  - Step 5: Validation & testing
  - Step 6: Cleanup & documentation
  - Step 7: Final commit
- Risk mitigation
- Success criteria (functional, code quality, performance, compatibility, git history)
- Future considerations (ES6 migration, bundler adoption)
- Implementation checklist (copy for execution)

**Read time**: 45 minutes
**Audience**: Developers executing Phase 11 modularization

---

### 4. **Quick Reference**
📄 [PHASE_11_QUICK_REFERENCE.md](./PHASE_11_QUICK_REFERENCE.md)

**Purpose**: Fast lookup during Phase 11 execution
**Contains**:
- What is Phase 11? (1-paragraph summary)
- The numbers (file counts, line counts, effort estimate)
- Target file structure
- IIFE pattern template
- Execution steps simplified (6 steps, 6-7 hours)
- Validation checklist
- Success criteria (10-point binary checklist)
- Troubleshooting table (common issues & fixes)
- Why IIFE decision table
- After Phase 11 guidance
- Key decisions summary
- When to execute Phase 11

**Read time**: 5 minutes
**Audience**: Quick reference during Phase 11 execution

---

### 5. **This Document**
📄 [PLANNING_INDEX.md](./PLANNING_INDEX.md) (you are here)

**Purpose**: Navigation guide for all planning documents
**Contains**:
- Overview of all planning documents
- Reading order and purposes
- File structure summary
- Navigation quick links
- Decision history

**Read time**: 5 minutes (skimmable)
**Audience**: Everyone (navigation)

---

## File Structure Overview

```
sparkqueue/.claude/
├── PLANNING_INDEX.md                    ← You are here (navigation)
├── ROADMAP_PHASE_10_11.md              ← Start here (overview)
├── PHASE_10_IMPLEMENTATION_PLAN.md      ← Feature development spec
├── PHASE_11_MODULARIZATION_PLAN.md      ← Modularization spec
├── PHASE_11_QUICK_REFERENCE.md         ← Quick lookup (execution)
├── CLAUDE.md                            ← Project guidelines
└── [older phase plans...]
```

---

## Decision History

### Phase 9 → Phase 10: Architecture Approach
**Question**: Keep `app.js` monolithic for Phase 10, or split into modules immediately?

**Options Evaluated**:
- Option A: Monolithic (recommended for Phase 10)
- Option B: IIFE modules (deferred to Phase 11)
- Option C: ES6 modules (not recommended)
- Option D: Full bundler (not recommended)

**Decision**: **Option A + Option B (two-phase)**
- Phase 10: Monolithic (1,866 → 2,100-2,200 lines)
- Phase 11: IIFE modules (split when reaches 2,100-2,200 lines)

**Rationale**:
- Phase 10 features are straightforward, no need for modularization yet
- Single file avoids refactoring overhead during feature development
- Phase 11 split happens after features stabilize
- IIFE pattern offers simplicity without build system

---

### Phase 10: Module Pattern Decision
**Question**: What is the best module pattern for Phase 11?

**Options Evaluated**:
| Pattern | Complexity | Build System | Future-Proof |
|---------|-----------|--------------|--------------|
| IIFE ✅ | Low | None | Easy → ES6 later |
| ES6 | Medium | No | Already modern |
| Bundler | High | Yes (Webpack) | Over-engineered |

**Decision**: **IIFE Pattern**

**Rationale**:
- Matches project philosophy (simplicity first)
- Zero build system (aligns with SparkQueue bootstrap approach)
- HTTP/2 multiplexing handles 8 files efficiently
- Manual loading order is transparent
- Easy migration to ES6 or bundler later if needed

---

### Phase 11: File Organization
**Question**: How many files? One core + many pages, or different structure?

**Options Evaluated**:
- 1 core + 7 pages (chosen)
- 1 shared + 7 pages + helpers (too fragmented)
- 1 core + 3 feature groups + 7 pages (over-organized)

**Decision**: **1 core + 7 pages**

**Rationale**:
- Matches app structure (1 dashboard has 7 pages)
- 8 files is clear without being fragmented
- ~250-400 lines per page is readable
- Core ~1,000 lines is substantial but manageable
- Easy to add new pages (just create `pages/new-page.js`)

---

## Navigation Quick Links

### By Role

**Project Manager/Stakeholder**:
1. Read [ROADMAP_PHASE_10_11.md](./ROADMAP_PHASE_10_11.md) (overview)
2. Check "Timeline Sketch" and "Success Metrics"
3. Reference "Confidence Levels" for risk assessment

**Feature Developer (Phase 10)**:
1. Read [PHASE_10_IMPLEMENTATION_PLAN.md](./PHASE_10_IMPLEMENTATION_PLAN.md)
2. Focus on "Feature Breakdown" and "Implementation Strategy"
3. Use "Code Examples" for reference implementations

**Modularization Engineer (Phase 11)**:
1. Read [PHASE_11_DETAILED_PLAN.md](./PHASE_11_MODULARIZATION_PLAN.md) fully
2. Keep [PHASE_11_QUICK_REFERENCE.md](./PHASE_11_QUICK_REFERENCE.md) open during execution
3. Follow "7-Step Migration Strategy"
4. Use "Implementation Checklist" to track progress

**New Team Member**:
1. Start with [ROADMAP_PHASE_10_11.md](./ROADMAP_PHASE_10_11.md)
2. Read [PHASE_10_IMPLEMENTATION_PLAN.md](./PHASE_10_IMPLEMENTATION_PLAN.md)
3. Reference [PHASE_11_MODULARIZATION_PLAN.md](./PHASE_11_MODULARIZATION_PLAN.md) when needed
4. Bookmark [PHASE_11_QUICK_REFERENCE.md](./PHASE_11_QUICK_REFERENCE.md)

---

## Key Metrics Summary

### Phase 10
| Metric | Value |
|--------|-------|
| Current size | 1,866 lines |
| New additions | +200-300 lines |
| Target size | 2,100-2,200 lines |
| Features | 5 new (batch ops, pagination, shortcuts, dark mode, copy) |
| Build system | None (remains vanilla JS) |
| Estimated duration | 2-3 weeks |

### Phase 11
| Metric | Value |
|--------|-------|
| Starting size | 2,100-2,200 lines |
| Ending size | 2,100-2,200 lines (same, reorganized) |
| Files created | 8 (1 core + 7 pages) |
| Module pattern | IIFE (no build system) |
| Behavior changes | 0 (purely organizational) |
| Estimated duration | 6-7 hours (1 work day) |
| Risk level | Low (organizational only) |

---

## Before You Begin

### Prerequisites for Phase 10
- [ ] Understand current Phase 9 state (1,866 lines, 7 pages)
- [ ] Have read [PHASE_10_IMPLEMENTATION_PLAN.md](./PHASE_10_IMPLEMENTATION_PLAN.md)
- [ ] Have working development environment
- [ ] Browser DevTools available for testing
- [ ] ~2-3 weeks available for development

### Prerequisites for Phase 11
- [ ] Phase 10 is complete and stable
- [ ] `app.js` is at 2,100-2,200 lines (not larger)
- [ ] Have read [PHASE_11_MODULARIZATION_PLAN.md](./PHASE_11_MODULARIZATION_PLAN.md)
- [ ] Have git repository with clean working directory
- [ ] ~7 hours available for uninterrupted refactoring
- [ ] Can deploy to production after merge
- [ ] [PHASE_11_QUICK_REFERENCE.md](./PHASE_11_QUICK_REFERENCE.md) bookmarked for lookup

---

## Success Indicators

### Phase 10 Complete When
- ✅ All 5 features implemented and tested
- ✅ `app.js` is 2,100-2,200 lines (within target)
- ✅ No console errors or warnings
- ✅ All Phase 9 features still working
- ✅ Performance metrics acceptable (< 2s page load)
- ✅ Mobile responsive (320px, 768px, 1024px)

### Phase 11 Complete When
- ✅ 8 module files created (1 core + 7 pages)
- ✅ All pages load without JavaScript errors
- ✅ Identical behavior to Phase 10 (no new features)
- ✅ Module architecture documented
- ✅ Single atomic git commit
- ✅ All tests passing

---

## Contingency Scenarios

### If Phase 10 Scope Expands
**Action**: Defer lower-priority features to Phase 11 or later
**Impact**: Phase 10 extends, Phase 11 may combine feature + modularization

### If Phase 10 Performance Degrades
**Action**: Optimize before modularizing (Phase 11 is not the fix)
**Impact**: May need to reconsider feature scope

### If Phase 11 Modularization Encounters Critical Issues
**Action**: Rollback to `phase-10-complete` tag, assess and retry
**Impact**: Modularization deferred; stay monolithic until Phase 15+

### If New Requirements Emerge Mid-Phase-10
**Action**: Assess impact on timeline; defer if necessary
**Impact**: Phase 10 duration may extend

---

## Document Maintenance

**Last Updated**: 2025-11-28
**Status**: ✅ All plans complete and ready for review

**When to Update This Index**:
- After Phase 10 starts (update progress/timeline)
- After Phase 11 starts (track execution steps)
- If requirements change (update decision history)
- If new phases planned (add to index)

---

## FAQ (Frequently Asked Questions)

**Q: Can Phase 10 and Phase 11 happen simultaneously?**
A: No. Phase 11 is modularizing Phase 10 code. Phase 10 must stabilize first.

**Q: Do I need to read all documents?**
A: No. See "Navigation Quick Links" above for role-specific reading list.

**Q: Can we use ES6 modules instead of IIFE?**
A: Not for Phase 11 (added complexity). ES6 is future option if bundler adopted.

**Q: Will Phase 11 modularization break anything?**
A: No. Zero behavior changes (purely organizational). All tests should still pass.

**Q: How long will Phase 11 actually take?**
A: 6-7 hours (1 work day) of focused refactoring + testing.

**Q: What if Phase 10 doesn't reach exactly 2,200 lines?**
A: That's fine. Trigger is "around 2,100-2,300 lines". Execute when Phase 10 stabilizes.

**Q: Can we skip Phase 11 and stay monolithic?**
A: Yes, but at 2,500+ lines the file becomes unwieldy. Phase 11 enables parallel development.

**Q: What happens after Phase 11?**
A: Modular structure remains. Phase 12+ adds features to appropriate modules.

---

## Related Documentation

- [Project Guidelines](./CLAUDE.md) - Development workflow and principles
- [Phase 9 Implementation](./PHASE_9_IMPLEMENTATION_PLAN.md) - Previous phase for reference
- [Git Log](../../.git/logs/HEAD) - Commit history

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-11-28 | Initial planning complete |
| - | - | Phase 10 & 11 fully documented |

---

**Ready for planning review and approval. See individual documents for detailed specifications.**
