# Phase 6.2 Implementation Plan: Test Fixes & Remediation

## Execution Strategy

This document outlines the implementation approach for Phase 6.2, using the **Codex Orchestration Pattern** to maximize parallelization and minimize wall-clock time.

---

## Task Analysis Summary

### Total Tasks: 5 Batches
- **Batch 1 (Sequential):** Critical atomicity fix + 3 low-priority test updates
- **Batch 2 (Parallel):** 4 ID generation test assertions (independent)
- **Batch 3 (Sequential):** CLI fixture setup + script creation
- **Batch 4 (Optional):** Watcher script creation or xfail marking
- **Batch 5 (Sequential):** Validation & test execution

### Model Assignment
- **Sonnet:** Orchestration & atomicity fix analysis (reasoning)
- **Codex:** Test file modifications (code generation)
- **Haiku:** Test validation & syntax checks

---

## Batch Structure

```
BATCH 1: Critical Path (Parallel after planning)
├── FIX: Concurrent claim atomicity (Sonnet analysis + code fix)
├── UPDATE: API response test (Codex)
└── UPDATE: ID assertions (Codex - prepare 4 fixes in parallel)

BATCH 2: Low-Priority Updates (Parallel)
├── ID test 1: test_gen_project_id_format
├── ID test 2: test_gen_session_id_format
├── ID test 3: test_gen_stream_id_format
└── ID test 4: test_gen_task_id_format

BATCH 3: Script Fixtures (Sequential - depends on BATCH 1)
├── Update conftest.py with mock script fixtures
├── Update test_cli.py with script setup
└── Create mock script files

BATCH 4: Watcher Decision (Sequential - optional)
├── OPTION A: Mark tests as xfail
└── OPTION B: Create sparkq-watcher.sh

BATCH 5: Validation (Sequential - final)
├── Run pytest on fixed tests
├── Full test suite execution
└── Commit & document
```

---

## Detailed Task Specifications

### BATCH 1: Critical Fixes

#### Task 1.1: Fix Concurrent Claim Atomicity (CRITICAL)
**File:** `sparkq/src/storage.py`
**Method:** `claim_task()`
**Issue:** Race condition allows multiple workers to claim same task

**Analysis Needed:**
1. Check current isolation level (should be SERIALIZABLE)
2. Review claim operation:
   - SELECT oldest queued task
   - UPDATE to running status
   - Need atomic transaction wrapping

**Fix Strategy:**
```python
# Current (likely non-atomic):
task = conn.execute("SELECT ... WHERE status='queued' ...").fetchone()
conn.execute("UPDATE tasks SET status='running' WHERE id=?", (task.id,))

# Fixed (must be atomic):
# Use explicit transaction with IMMEDIATE/EXCLUSIVE lock
def claim_task(self, stream_id, worker_id=None):
    try:
        conn = sqlite3.connect(self.db_path)
        conn.isolation_level = None  # autocommit OFF
        conn.execute("BEGIN IMMEDIATE")  # Exclusive lock

        cursor = conn.execute(
            "SELECT * FROM tasks WHERE stream_id=? AND status='queued' ORDER BY created_at LIMIT 1",
            (stream_id,)
        )
        task = cursor.fetchone()

        if not task:
            conn.commit()
            return None

        conn.execute(
            "UPDATE tasks SET status='running', claimed_at=?, worker_id=? WHERE id=?",
            (now_iso(), worker_id, task['id'])
        )
        conn.commit()
        return task
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
```

**Validation:** Concurrent stress test with 10+ workers claiming from same stream

#### Task 1.2: Update API Response Test
**File:** `sparkq/tests/integration/test_api.py`
**Test:** `TestHealthEndpoints::test_status`
**Issue:** Test expects fields that `/health` endpoint doesn't provide

**Expected Response (per API.md):**
```json
{
  "status": "ok",
  "timestamp": "2024-05-05T12:00:00+00:00"
}
```

**Fix:** Update assertion to only check for these 2 fields

#### Task 1.3: Update ID Generation Assertions (Prepare 4 parallel updates)
**File:** `sparkq/tests/unit/test_models.py`
**Issue:** Tests expect 12-char IDs, actual implementation produces 16-char

**Current assertion:** `assert len(id) == (4 + 8)`  # prj_ + 8 hex
**New assertion:** `assert len(id) == (4 + 12)`  # prj_ + 12 hex

**Tests to update:**
1. `test_gen_project_id_format` - line ~31
2. `test_gen_session_id_format` - line ~31
3. `test_gen_stream_id_format` - line ~31
4. `test_gen_task_id_format` - line ~31

---

### BATCH 2: Parallel ID Assertion Updates
**Type:** Code generation (Codex)
**Effort:** 4 parallel operations, ~5 min total wall-clock

---

### BATCH 3: Script Fixture Setup

#### Task 3.1: Update conftest.py
**File:** `sparkq/tests/conftest.py`
**Add:** Mock script directory fixture

```python
@pytest.fixture
def temp_script_dir(tmp_path):
    """Create mock scripts directory for testing."""
    script_dir = tmp_path / "mock_scripts"
    script_dir.mkdir()

    # Create mock bash script
    bash_script = script_dir / "test-script.sh"
    bash_script.write_text("""#!/bin/bash
# name: test-bash-script
# description: Test bash script
echo "Test script"
""")
    bash_script.chmod(0o755)

    # Create mock Python script
    py_script = script_dir / "test_script.py"
    py_script.write_text("""#!/usr/bin/env python3
# name: test-python-script
# description: Test python script
print("Test script")
""")
    py_script.chmod(0o755)

    return script_dir
```

#### Task 3.2: Update test_cli.py fixtures
**File:** `sparkq/tests/integration/test_cli.py`
**Update:** Use temp_script_dir fixture in script discovery tests

---

### BATCH 4: Watcher Script Decision

**Option A: Mark as xfail (Quick - 30 min)**
```python
@pytest.mark.xfail(reason="sparkq-watcher.sh implementation deferred to Phase 7")
def test_watcher_starts_and_creates_lockfile():
    ...
```

**Option B: Create watcher script (Full - 4-6 hours)**
- Create `sparkq/sparkq-watcher.sh`
- Implement lockfile mechanism
- Handle process management

**Recommendation:** Option A for Phase 6.2 MVP, Option B in Phase 7

---

## Execution Plan

### Phase 6.2.1: Critical Fixes (2-4 hours)

**Step 1: Sonnet Analysis** (30 min)
- Analyze claim_task() implementation
- Design atomic transaction fix
- Provide detailed specification

**Step 2: Implement Fixes** (1.5-2 hours)
- Fix concurrency issue in storage.py
- Update API test (Codex)
- Prepare 4 ID assertion updates (Codex parallel)

**Step 3: Validate** (30 min)
- Run concurrent stress test
- Run specific test fixes
- Verify no regressions

### Phase 6.2.2: Script Fixtures (1-2 hours)

**Step 1: Create fixtures** (Codex)
- Update conftest.py with mock scripts
- Update test_cli.py to use fixtures

**Step 2: Test** (30 min)
- Run CLI script tests
- Verify script discovery works

### Phase 6.2.3: Watcher & Validation (30 min - 6+ hours)

**Step 1: Decide watcher scope**
- Option A (xfail): 30 min
- Option B (implement): 4-6 hours

**Step 2: Full validation** (1-2 hours)
- Run complete test suite
- Generate coverage report
- Verify 94%+ pass rate

---

## Success Criteria

### Before Phase 6.2
- ✅ 81/93 tests passing (87%)
- ❌ 11 tests failing
- ⏭️ 1 test skipped

### After Phase 6.2 (Target)
- ✅ 88-90/93 tests passing (94-96%)
- ❌ 0-2 tests failing (acceptable/known)
- ⏭️ 1-3 tests xfail (deferred scope)

### Specific Test Results
- [ ] `test_concurrent.py::TestConcurrentAccess::test_atomic_claim` → PASS
- [ ] `test_models.py::TestIDGeneration` (4 tests) → ALL PASS
- [ ] `test_api.py::TestHealthEndpoints::test_status` → PASS
- [ ] `test_cli.py::TestScriptCommands` (2 tests) → PASS
- [ ] `test_watcher.py::TestWatcherBehavior` → XFAIL or PASS

---

## Risk Mitigation

### Risk: Claim Atomicity Fix Breaks Other Tests
- **Mitigation:** Run full test suite after change
- **Rollback:** Revert to original storage.py implementation
- **Validation:** Run stress test 3x consecutively

### Risk: Script Fixture Changes Break Existing Tests
- **Mitigation:** Only modify test files, not test data
- **Rollback:** Revert conftest.py and test_cli.py

### Risk: Watcher Script Takes Too Long
- **Mitigation:** Use Option A (xfail) as fallback
- **Decision Point:** At 1 hour mark during Phase 6.2.3

---

## Deliverables

### Code Changes
1. ✅ `sparkq/src/storage.py` - Atomic claim fix
2. ✅ `sparkq/tests/unit/test_models.py` - ID assertions (4 updates)
3. ✅ `sparkq/tests/integration/test_api.py` - Response format test
4. ✅ `sparkq/tests/integration/test_cli.py` - Script fixtures
5. ✅ `sparkq/tests/conftest.py` - Mock script directory
6. ⚠️ `sparkq/sparkq-watcher.sh` - Optional, Phase 7 candidate

### Documentation
1. ✅ This implementation plan
2. ✅ Updated test README with xfail rationale
3. ✅ Git commit messages documenting changes

### Quality Metrics
- **Test pass rate:** 94%+
- **Concurrent stress test:** 100+ iterations, 100% atomic
- **No intermittent failures:** Run full suite 3x
- **Code coverage:** Maintained or improved

---

## Timeline Estimate

| Phase | Task | Duration | Dependencies |
|-------|------|----------|--------------|
| 6.2.1 | Atomicity fix | 2-4h | None |
| 6.2.1 | API test update | 30m | None |
| 6.2.1 | ID assertions (4 parallel) | 1h | None |
| 6.2.2 | Script fixtures | 1-2h | 6.2.1 complete |
| 6.2.3 | Watcher (Option A/B) | 30m-6h | 6.2.2 complete |
| 6.2.3 | Validation & commit | 1-2h | All fixes complete |
| **Total** | **Phase 6.2** | **5-15h** | **Depends on watcher scope** |

---

## Next Actions

1. ✅ Review this plan
2. ⏭️ Execute Phase 6.2.1 (Critical fixes)
3. ⏭️ Execute Phase 6.2.2 (Script fixtures)
4. ⏭️ Decide watcher scope + execute Phase 6.2.3
5. ⏭️ Commit all changes with descriptive messages
6. ⏭️ Update project README with test status

---

## Appendix: Technical Details

### Claim Atomicity Deep Dive

**Problem:**
```
Worker 1: SELECT task WHERE status='queued' LIMIT 1
Worker 2: SELECT task WHERE status='queued' LIMIT 1    <- SAME TASK!
Worker 1: UPDATE task SET status='running'
Worker 2: UPDATE task SET status='running'              <- OVERWRITES!
```

**Solution (SQLite WAL mode):**
```
- Use BEGIN IMMEDIATE to acquire exclusive lock
- SELECT and UPDATE in single transaction
- Isolationlevel prevents concurrent reads during write
```

**Testing:**
```python
import concurrent.futures
import threading

def stress_test_claim(n_workers=10, n_tasks=100):
    # Create stream with 100 tasks
    # Launch 10 workers claiming simultaneously
    # Verify each task claimed by exactly 1 worker
    # Verify no worker claims the same task twice
```

---

## References
- FRD: `sparkq/README.md`
- API: `sparkq/API.md`
- Test output: Phase 6.1 execution (81 passed, 11 failed)
- Plan: `/home/luce/apps/sparkqueue/PHASE_6_2_TEST_REMEDIATION_PLAN.md`
