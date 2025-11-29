# Phase 7: Watcher Script & Scripts CLI Implementation Plan

## Executive Summary

Phase 7 resolves the 5 remaining xfailed tests by implementing two major features:
1. **Watcher Script** (`sparkq-watcher.sh`) - Background process for stream monitoring
2. **Scripts CLI Commands** (`sparkq scripts list/search`) - CLI for script discovery

## Phase 7.1: Watcher Script Implementation

### Overview
Create `sparkq/sparkq-watcher.sh` - a shell script that:
- Monitors a stream for new tasks
- Manages lockfiles to prevent duplicate instances
- Handles graceful shutdown on signals (SIGTERM/SIGINT)
- Works with the SparkQueue task queue system

### Test Requirements (3 tests in `test_watcher.py`)

**Test 1: `test_watcher_starts_and_creates_lockfile`**
- Start watcher: `./sparkq-watcher.sh <stream_name>`
- Lock file should be created at: `/tmp/sparkq-<stream_name>.lock`
- Lock file content should contain the process PID
- Exit code: 0 on successful startup

**Test 2: `test_watcher_prevents_duplicate`**
- Start first watcher successfully
- Start second watcher with same stream name
- Second watcher should fail with exit code != 0
- Error message should contain "already" or "running"

**Test 3: `test_watcher_cleanup_on_signal`**
- Start watcher
- Send SIGTERM signal
- Lock file should be cleaned up (deleted)
- Watcher process should exit cleanly

### Implementation Design

**File Location:** `sparkq/sparkq-watcher.sh`

**Script Structure:**
```bash
#!/bin/bash
set -e

STREAM_NAME="$1"
LOCK_PATH="/tmp/sparkq-${STREAM_NAME}.lock"
PID=$$

# 1. Trap signals for cleanup
trap cleanup SIGTERM SIGINT EXIT

cleanup() {
  rm -f "$LOCK_PATH"
  exit 0
}

# 2. Check if already running (atomically acquire lock)
if [[ -f "$LOCK_PATH" ]]; then
  EXISTING_PID=$(<"$LOCK_PATH")
  if kill -0 "$EXISTING_PID" 2>/dev/null; then
    echo "Error: Watcher already running for stream '$STREAM_NAME' (PID: $EXISTING_PID)"
    exit 1
  fi
fi

# 3. Create lock file with PID
echo "$PID" > "$LOCK_PATH"

# 4. Main loop (monitor stream for tasks)
# For Phase 7, a basic loop that keeps the process alive
# Future: integrate with SparkQueue API to claim tasks
while true; do
  sleep 1
done
```

**Key Features:**
- Atomic lock creation (prevent race conditions)
- PID-based lock validation (check if process still exists)
- Signal handlers for cleanup (SIGTERM/SIGINT)
- Exit trap for lock cleanup

### Implementation Steps

1. Create `sparkq/sparkq-watcher.sh` with lock management
2. Make script executable: `chmod +x sparkq/sparkq-watcher.sh`
3. Implement signal handlers (trap cleanup)
4. Test lock creation and PID storage
5. Test duplicate prevention with PID validation
6. Test signal handling and cleanup
7. Run tests: `pytest tests/e2e/test_watcher.py::TestWatcherBehavior -xvs`

---

## Phase 7.2: Scripts CLI Commands Implementation

### Overview
Add `sparkq scripts` subcommand group with two subcommands:
- `sparkq scripts list` - List all available scripts
- `sparkq scripts search <query>` - Search scripts by name/tag/description

### Test Requirements (2 tests in `test_cli.py`)

**Test 1: `test_script_list`**
- Command: `sparkq scripts list`
- Should display all available scripts
- Output should contain script names: "hello-world" and "cleanup-db"
- Exit code: 0

**Test 2: `test_script_search`**
- Command: `sparkq scripts search hello`
- Should search by name/tag/description
- Output should contain "hello-world"
- Output should NOT contain "cleanup-db"
- Exit code: 0

### Test Setup Context
From `test_cli.py` fixture, sample scripts are pre-created:
- `scripts/hello.sh` - metadata includes name "hello-world"
- `scripts/cleanup.py` - metadata includes name "cleanup-db"

### Implementation Design

**Location:** Add to `sparkq/src/cli.py`

**Command Structure:**

```python
# Create scripts subcommand group
scripts_app = typer.Typer(help="Manage and search scripts")

@scripts_app.command("list", help="List all available scripts")
@cli_handler
def scripts_list():
    """Display all discovered scripts with metadata."""
    # 1. Load ScriptIndex from config
    # 2. Build the index
    # 3. Format and display results

@scripts_app.command("search", help="Search for scripts by name, description, or tags")
@cli_handler
def scripts_search(query: str = typer.Argument(..., help="Search query")):
    """Search scripts by name, description, or tags."""
    # 1. Load ScriptIndex from config
    # 2. Build the index
    # 3. Call search(query)
    # 4. Format and display results

# Add to main app
app.add_typer(scripts_app, name="scripts")
```

**Output Format - List Command:**
```
Scripts (X total):
  Name              Description        Tags
  ────────────────  ─────────────────  ──────────────
  hello-world       Says hello         greeting, sample
  cleanup-db        Cleans database    maintenance
```

**Output Format - Search Command:**
```
Search results for "hello" (X matches):
  Name              Description        Tags
  ────────────────  ─────────────────  ──────────────
  hello-world       Says hello         greeting, sample
```

### Implementation Steps

1. Import ScriptIndex in cli.py
2. Create `scripts_app` typer.Typer subcommand group
3. Implement `scripts_list()` command:
   - Initialize ScriptIndex with config path
   - Call `.build()` to discover scripts
   - Format output with table/columns
   - Display using typer.echo()
4. Implement `scripts_search(query)` command:
   - Initialize ScriptIndex with config path
   - Call `.build()` to discover scripts
   - Call `.search(query)` to filter results
   - Format and display results
5. Add `app.add_typer(scripts_app, name="scripts")` to register subcommand
6. Run tests: `pytest tests/integration/test_cli.py::TestScriptCommands -xvs`

### Formatting Considerations

**Available metadata fields (from ScriptIndex):**
- `name` - Script name (from header or filename)
- `description` - Human-readable description
- `tags` - List of tags (comma-separated in header)
- `path` - Full path to script file
- `inputs` - Input specification
- `outputs` - Output specification
- `timeout` - Execution timeout
- `task_class` - Task class for classification

**Display Strategy:**
- Show name, description, tags in table format
- Use consistent column widths
- Handle missing values gracefully (show "—")
- Highlight matched items in search results

---

## Implementation Sequence

### Batch 1: Watcher Script (Independent)
- Create `sparkq/sparkq-watcher.sh`
- Implement lock management
- Implement signal handlers
- Verify tests pass

### Batch 2: Scripts CLI (Depends on ScriptIndex)
- Add imports to cli.py
- Create scripts_app subcommand group
- Implement scripts_list command
- Implement scripts_search command
- Add app.add_typer() registration
- Verify tests pass

### Batch 3: Final Validation
- Run full test suite: `pytest tests/`
- Verify all 93 tests pass (87 passing, 0 failing, 5 xfailed → 2 xfailed after this phase)
- Commit changes
- Update xfail markers if needed

---

## Test Status After Phase 7

### Before Phase 7
```
87 passed ✅
0 failed ❌
1 skipped ⏭️
5 xfailed (watcher: 3, scripts: 2)
Pass rate: 93%
```

### After Phase 7
```
92 passed ✅ (↑ 5 from 87)
0 failed ❌
1 skipped ⏭️
0 xfailed ✅ (all features implemented)
Pass rate: 99%
```

---

## Dependencies and Context

### Watcher Script Dependencies
- Bash 4+
- `kill` command (check process existence)
- File I/O for lock management
- Signal handling (SIGTERM, SIGINT)

### Scripts CLI Dependencies
- `ScriptIndex` from `sparkq/src/index.py` (already exists)
- Typer CLI framework (already imported)
- Config path resolution

### Files to Modify
1. Create: `sparkq/sparkq-watcher.sh`
2. Modify: `sparkq/src/cli.py` (add scripts subcommands)

### Files to Keep Unchanged
- `sparkq/tests/e2e/test_watcher.py` (will pass after implementation)
- `sparkq/tests/integration/test_cli.py` (will pass after implementation)
- All other test files

---

## Success Criteria

### Watcher Script
- ✅ Lock file created with correct PID
- ✅ Prevents duplicate instances
- ✅ Cleans up lock on SIGTERM/SIGINT
- ✅ All 3 tests passing

### Scripts CLI
- ✅ Lists all scripts with metadata
- ✅ Searches scripts by query
- ✅ Output contains expected script names
- ✅ All 2 tests passing

### Overall
- ✅ All 5 xfailed tests now passing
- ✅ No regression in other tests (87 still passing)
- ✅ Full test suite: 92/93 passing (99% pass rate)
- ✅ Clean git history with descriptive commits

---

## Effort Estimate

- **Watcher Script:** 1-2 hours
- **Scripts CLI:** 1-1.5 hours
- **Testing & Validation:** 0.5 hours
- **Total:** 2.5-3.5 hours

---

## Risk Assessment

### Low Risk
- Watcher script is isolated shell script
- Scripts CLI reuses existing ScriptIndex
- No database changes required
- No API modifications needed

### Mitigation Strategies
- Run full test suite after each batch
- Test signal handling manually before committing
- Verify lock cleanup in edge cases
- Test script discovery with actual test fixtures

---

## Next Steps (Post-Phase 7)

Once Phase 7 is complete, the project reaches 99% test coverage with:
- ✅ Full REST API implementation
- ✅ Complete CLI commands
- ✅ Web UI with Sessions/Streams management
- ✅ Watcher script for background monitoring
- ✅ Script discovery and management

### Future Enhancements (Phase 8+)
- Extend watcher script with actual task claiming
- Add web UI for script discovery
- Implement task result streaming
- Add distributed worker support

---

**Phase 7 Status:** Ready for implementation
**Planned Completion:** After session implementation
**Success Metric:** 92/93 tests passing (99% pass rate)
