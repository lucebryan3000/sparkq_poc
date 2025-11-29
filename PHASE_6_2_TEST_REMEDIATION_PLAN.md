# Phase 6.2: Test Remediation & Stabilization Plan

## Overview
Following automated test execution in Phase 6.1, we identified 11 failing tests out of 93 total (81 ✅ passed, 1 skipped). This plan addresses the failures while maintaining core feature stability.

## Current Status
- **Total Tests:** 93
- **Passing:** 81 ✅
- **Failing:** 11 ❌
- **Skipped:** 1
- **Success Rate:** 87% (81/93)

---

## Test Failure Categories

### Category 1: ID Generation Format Tests (4 failures)
**Tests:** `test_models.py::TestIDGeneration` (4 tests)
**Issue:** Generated IDs are 16 characters (e.g., `prj_aadf63c59096`) instead of expected 12 (4 prefix + 8 suffix)
**Root Cause:** ID generation changed to use 12-char hex hashes instead of 8-char
**Scope:** Low priority - functionality works, test expectations are outdated
**Fix:** Update test assertions to expect 16-char IDs

---

### Category 2: Watcher Script Missing (3 failures)
**Tests:** `test_watcher.py::TestWatcherBehavior` (3 tests)
**Issue:** `sparkq-watcher.sh` script not found or not executable; tests timeout after 5 seconds
**Root Cause:** Shell script referenced in README but not generated during Phase 3 implementation
**Scope:** Medium priority - needed for production but tests can be skipped for MVP
**Fix:** Either create `sparkq-watcher.sh` or skip/mark E2E watcher tests as xfail

**Decision Point:**
- **Option A (Minimum):** Mark tests as xfail with note about Phase 7 scope
- **Option B (Recommended):** Create stub `sparkq-watcher.sh` with basic locking mechanism

---

### Category 3: API Response Format Mismatch (1 failure)
**Test:** `test_api.py::TestHealthEndpoints::test_status`
**Issue:** Test expects `/health` endpoint to return `{"status": "ok", ...}` but also expects other fields that aren't present
**Root Cause:** Generated test has wrong expectations vs. actual API contract in API.md
**Scope:** Low priority - `/health` endpoint works correctly per API.md
**Fix:** Update test to match actual `/health` response format

---

### Category 4: CLI Script Index Issues (2 failures)
**Tests:** `test_cli.py::TestScriptCommands` (2 tests)
- `test_script_list` - exit code 2
- `test_script_search` - exit code 2
**Issue:** CLI commands expecting script index discovery to work
**Root Cause:** ScriptIndex looks for scripts in configured directories; test setup doesn't populate test scripts
**Scope:** Low priority - feature works, test fixture setup incomplete
**Fix:** Update test fixtures to create mock script files in temp directory

---

### Category 5: Concurrent Task Claim Atomicity (1 failure)
**Test:** `test_concurrent.py::TestConcurrentAccess::test_atomic_claim`
**Issue:** Multiple concurrent claim attempts return the same task ID 10 times (not atomic)
**Root Cause:** SQLite claim operation may not be properly locked or transaction scope incomplete
**Scope:** High priority - data consistency issue for production
**Fix:** Verify claim operation uses SERIALIZE isolation level; add explicit transaction locking

---

## Remediation Scope Breakdown

### MUST FIX (Critical for Production)
1. **Concurrent claim atomicity** - Data integrity issue
   - **Effort:** 2-4 hours
   - **Files:** `src/storage.py` (claim_task method)
   - **Testing:** Verify with concurrent stress test

### SHOULD FIX (Important for Quality)
2. **API response format** - Aligns with documented API contract
   - **Effort:** 1 hour
   - **Files:** `tests/integration/test_api.py`
   - **Action:** Update test expectations

3. **ID generation test assertions** - Matches actual implementation
   - **Effort:** 1 hour
   - **Files:** `tests/unit/test_models.py`
   - **Action:** Change assertions from 12 to 16 char IDs

4. **Script index test setup** - Proper fixture initialization
   - **Effort:** 2 hours
   - **Files:** `tests/integration/test_cli.py`, `tests/conftest.py`
   - **Action:** Create mock script directory in fixtures

### NICE TO HAVE (Polish, Can Defer to Phase 7)
5. **Watcher script** - E2E process management
   - **Effort:** 4-6 hours
   - **Files:** Create `sparkq-watcher.sh`
   - **Decision:** Mark tests as xfail for now, implement in Phase 7

---

## Implementation Plan

### Phase 6.2.1: Critical Fixes (2-4 hours)
**Goal:** Ensure data consistency and API correctness

#### Task 1: Fix Concurrent Claim Atomicity
- [ ] Review `src/storage.py::claim_task()` implementation
- [ ] Check transaction isolation level (should be SERIALIZABLE)
- [ ] Add explicit row-level locking if needed
- [ ] Create concurrent stress test with 10+ workers
- [ ] Verify only 1 worker can claim each task
- [ ] Run test repeatedly to ensure no race conditions

#### Task 2: Update Test Expectations for API Response
- [ ] Update `tests/integration/test_api.py::test_status`
- [ ] Verify test matches API.md documentation
- [ ] Run test to confirm passes

#### Task 3: Update ID Generation Test Assertions
- [ ] Update all 4 tests in `tests/unit/test_models.py::TestIDGeneration`
- [ ] Change assertions from `len() == 12` to `len() == 16`
- [ ] Verify format still matches pattern (4-char prefix + 12-char hex)
- [ ] Run tests to confirm passes

### Phase 6.2.2: Important Fixes (2-3 hours)
**Goal:** Complete test suite functionality

#### Task 4: Fix Script Index Test Fixtures
- [ ] Update `tests/conftest.py` to create mock script directory
- [ ] Create sample Python/Bash scripts in fixture
- [ ] Update `tests/integration/test_cli.py` fixtures
- [ ] Ensure script discovery works in test environment
- [ ] Run tests to confirm passes

### Phase 6.2.3: Watcher Tests Resolution (30 min decision + 4-6h implementation)
**Goal:** Decide scope for watcher script

#### Option A: Mark as xfail (30 minutes)
- [ ] Mark 3 watcher tests with `@pytest.mark.xfail`
- [ ] Add comments explaining Phase 7 scope
- [ ] Test suite now shows "1 xfail" instead of 3 failures

#### Option B: Create Stub Watcher Script (4-6 hours)
- [ ] Create `sparkq-watcher.sh` with basic functionality
- [ ] Implement lockfile creation/checking
- [ ] Handle SIGINT cleanup
- [ ] Test with automated tests
- [ ] Document in README

---

## Success Criteria

### Test Results Target
```
Expected: 93 total tests
- ✅ Passing: 88+ (94%+)
- ❌ Failing: 0-2 (known/acceptable)
- ⏭️  Skipped/XFail: 1-3 (deferred to Phase 7)
```

### Specific Targets
1. Concurrent claim test: PASS (data consistency verified)
2. ID generation tests: PASS (4/4 passing)
3. API response test: PASS (format correct)
4. CLI script tests: PASS (2/2 passing)
5. Watcher tests: Either XFAIL (marked) or PASS (fully implemented)

---

## Risk Assessment

### Low Risk
- ID assertion updates - no code changes, test-only
- API test update - matches documented contract
- Script fixture setup - isolated test fixture change

### Medium Risk
- Watcher script creation - adds new shell script dependency
- Script index test fixtures - requires directory structure mocking

### High Risk
- Claim atomicity fix - touches core task queue logic
  - **Mitigation:** Comprehensive concurrent stress testing before merge
  - **Rollback:** Simple revert of storage.py changes
  - **Validation:** Run full test suite 3x to ensure stability

---

## Phase 6.2 Deliverables

### Code Changes
1. `src/storage.py` - Fix claim atomicity (if needed)
2. `tests/unit/test_models.py` - Update ID assertions
3. `tests/integration/test_api.py` - Update endpoint test
4. `tests/integration/test_cli.py` - Fix script fixtures
5. `tests/conftest.py` - Add script index fixtures
6. Optional: `sparkq-watcher.sh` - Create watcher script

### Documentation Updates
1. Update test README with xfail/skipped test rationale
2. Document watcher script plan (Phase 7)

### Quality Metrics
- Test pass rate: 94%+
- All critical tests (claim atomicity): PASS
- Concurrent stress test: 100 iterations, all atomic
- No intermittent failures in repeat runs

---

## Timeline Estimate
- **Critical fixes:** 2-4 hours
- **Important fixes:** 2-3 hours
- **Watcher decision:** 30 minutes (decision) + 0-6 hours (implementation)
- **Total:** 5-13 hours (depending on watcher scope)

---

## Rollback Plan
If critical fixes break functionality:
1. Revert `src/storage.py` to previous version
2. Rerun test suite
3. Investigate root cause
4. Create new remediation plan

---

## Related Documents
- [FRD] `/home/luce/apps/sparkqueue/sparkq/README.md`
- [API] `/home/luce/apps/sparkqueue/sparkq/API.md`
- [Test Output] Phase 6.1 test execution (81 passed, 11 failed)

---

## Next Steps
1. Review and approve this plan
2. Execute Phase 6.2.1 (critical fixes) first
3. Execute Phase 6.2.2 (important fixes)
4. Decide on watcher script scope
5. Execute Phase 6.2.3 accordingly
6. Validate final test results
7. Commit all changes with descriptive messages
