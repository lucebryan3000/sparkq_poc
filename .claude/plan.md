# Plan: Remove Hardcoded Paths from sparkq/ Folder

## Problem Statement

The `sparkq/` folder contains hardcoded absolute paths that prevent portability when moving or copying the project to a new location. We need to replace these with dynamic path resolution.

## Current Hardcoded Paths Analysis

### Category 1: Absolute Hardcoded Paths in Code

**File:** `sparkq/test_integration.py`
- **Line 9:** `sys.path.insert(0, '/home/luce/apps/sparkqueue')`
- **Line 36:** `repo_path="/home/luce/apps/sparkqueue"`
- **Impact:** Integration tests fail if project is moved
- **Severity:** HIGH

**Files:** `sparkq/docs/API.md`, `sparkq/docs/SPARKQ_README.md`
- Documentation examples with hardcoded paths
- **Impact:** Confusing documentation
- **Severity:** LOW (documentation only)

### Category 2: Relative Path Assumptions (Require CWD = Project Root)

**File:** `sparkq/src/config.py`
- **Line 10:** `CONFIG_PATH = Path("sparkq.yml")` - Assumes CWD is project root
- **Line 11:** `DEFAULT_DB_PATH = "sparkq/data/sparkq.db"` - Assumes CWD is project root

**File:** `sparkq/src/server.py`
- **Line 18:** `LOCKFILE_PATH = Path("sparkq.lock")` - Assumes CWD is project root
- **Lines 180-183:** Explicitly does `os.chdir(project_root)` to fix relative paths

**File:** `sparkq/src/cli.py`
- **Line 279:** `log_dir = Path("sparkq/tests/logs")` - Assumes CWD is project root

**File:** `sparkq/src/api.py`
- **Line 533:** `repo_root = Path(__file__).resolve().parents[2]` - Uses `__file__` resolution (GOOD)
- **Line 67:** `static_dir = Path(__file__).resolve().parent.parent / "ui"` - Uses `__file__` resolution (GOOD)

## Existing Good Patterns in Codebase

The codebase already uses dynamic path resolution in several places:

1. **`Path(__file__).resolve()` pattern** - Used in:
   - `sparkq/src/api.py:67` - UI static directory
   - `sparkq/src/api.py:533` - Build prompts directory
   - `sparkq/queue_runner.py:47` - SRC_DIR resolution
   - `sparkq/tests/conftest.py:9,16` - Test directories

2. **Server's chdir approach** - `sparkq/src/server.py:180-183`:
   ```python
   project_root = Path(__file__).parent.parent.parent
   os.chdir(project_root)
   ```
   This ensures all relative paths work correctly.

## Solution Strategy

### Approach A: Centralized Path Resolver (Recommended)

Create a central `sparkq/src/paths.py` module that dynamically resolves all project paths:

**Advantages:**
- Single source of truth for all paths
- Easy to test and maintain
- Consistent across entire codebase
- Can handle both running from source and installed packages

**Implementation:**
```python
# sparkq/src/paths.py
from pathlib import Path

def get_project_root() -> Path:
    """Get the project root directory (parent of sparkq/ folder)."""
    # This file is at sparkq/src/paths.py
    # Project root is 2 levels up
    return Path(__file__).resolve().parent.parent.parent

def get_sparkq_dir() -> Path:
    """Get the sparkq/ source directory."""
    return Path(__file__).resolve().parent.parent

def get_config_path() -> Path:
    """Get the sparkq.yml config file path."""
    return get_project_root() / "sparkq.yml"

def get_default_db_path() -> str:
    """Get the default database path (relative to project root)."""
    return str(get_project_root() / "sparkq" / "data" / "sparkq.db")

def get_lockfile_path() -> Path:
    """Get the server lockfile path."""
    return get_project_root() / "sparkq.lock"

def get_test_logs_dir() -> Path:
    """Get the test logs directory."""
    return get_project_root() / "sparkq" / "tests" / "logs"
```

### Approach B: Keep Current Pattern (Not Recommended)

Keep using relative paths but ensure all entry points call `os.chdir(project_root)` first.

**Disadvantages:**
- Fragile - easy to miss entry points
- Side effects (changing CWD)
- Doesn't work well with imports from other projects

## Implementation Plan

### Phase 1: Create Centralized Path Resolver

**File to create:** `sparkq/src/paths.py`

```python
"""Centralized path resolution for SparkQ project.

This module provides dynamic path resolution to ensure portability.
All paths are resolved relative to the project structure, not hardcoded.
"""
from pathlib import Path

def get_project_root() -> Path:
    """Get the project root directory (parent of sparkq/ folder)."""
    return Path(__file__).resolve().parent.parent.parent

def get_sparkq_dir() -> Path:
    """Get the sparkq/ source directory."""
    return Path(__file__).resolve().parent.parent

def get_config_path() -> Path:
    """Get the default sparkq.yml config file path."""
    return get_project_root() / "sparkq.yml"

def get_default_db_path() -> str:
    """Get the default database path."""
    return str(get_project_root() / "sparkq" / "data" / "sparkq.db")

def get_lockfile_path() -> Path:
    """Get the server lockfile path."""
    return get_project_root() / "sparkq.lock"

def get_test_logs_dir() -> Path:
    """Get the test logs directory."""
    return get_sparkq_dir() / "tests" / "logs"

def get_build_prompts_dir() -> Path:
    """Get the build prompts directory."""
    return get_project_root() / "_build" / "prompts-build"

def get_ui_dir() -> Path:
    """Get the UI static files directory."""
    return get_sparkq_dir() / "ui"
```

### Phase 2: Update sparkq/src/config.py

**Changes:**
```python
# Before:
CONFIG_PATH = Path("sparkq.yml")
DEFAULT_DB_PATH = "sparkq/data/sparkq.db"

# After:
from .paths import get_config_path, get_default_db_path

CONFIG_PATH = get_config_path()
DEFAULT_DB_PATH = get_default_db_path()
```

### Phase 3: Update sparkq/src/server.py

**Changes:**
```python
# Before:
LOCKFILE_PATH = Path("sparkq.lock")

# After:
from .paths import get_lockfile_path

LOCKFILE_PATH = get_lockfile_path()
```

**Also remove the os.chdir() call (lines 180-183) since paths are now absolute:**
```python
# REMOVE THIS:
# Change to project root to ensure relative paths work
from pathlib import Path
project_root = Path(__file__).parent.parent.parent
os.chdir(project_root)
```

### Phase 4: Update sparkq/src/cli.py

**Changes:**
```python
# Before (line 279):
log_dir = Path("sparkq/tests/logs") / timestamp

# After:
from .paths import get_test_logs_dir

log_dir = get_test_logs_dir() / timestamp
```

### Phase 5: Update sparkq/src/api.py

**Changes:**
```python
# Before (line 67):
static_dir = Path(__file__).resolve().parent.parent / "ui"

# After:
from .paths import get_ui_dir

static_dir = get_ui_dir()

# Before (line 533):
repo_root = Path(__file__).resolve().parents[2]
prompts_dir = repo_root / "_build" / "prompts-build"

# After:
from .paths import get_build_prompts_dir

prompts_dir = get_build_prompts_dir()
repo_root = prompts_dir.parent.parent  # Still needed for relative_to() call
```

### Phase 6: Update sparkq/test_integration.py

**Changes:**
```python
# Before (lines 8-9):
# Add sparkq parent directory to path
sys.path.insert(0, '/home/luce/apps/sparkqueue')

# After:
# Add sparkq parent directory to path dynamically
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Before (line 36):
repo_path="/home/luce/apps/sparkqueue",

# After:
repo_path=str(Path(__file__).resolve().parent.parent),
```

### Phase 7: Update Documentation (Optional)

Update examples in:
- `sparkq/docs/API.md` - Replace hardcoded paths with placeholders
- `sparkq/docs/SPARKQ_README.md` - Replace hardcoded paths with placeholders

## Files to Modify

1. **CREATE:** `sparkq/src/paths.py` (new file)
2. **EDIT:** `sparkq/src/config.py` (2 changes)
3. **EDIT:** `sparkq/src/server.py` (2 changes - add import, remove chdir)
4. **EDIT:** `sparkq/src/cli.py` (1 change)
5. **EDIT:** `sparkq/src/api.py` (2 changes)
6. **EDIT:** `sparkq/test_integration.py` (2 changes)
7. **OPTIONAL:** Update documentation files

## Testing Strategy

After implementation:

1. **Test from different working directories:**
   ```bash
   cd /tmp
   python -m sparkq.src.cli --help  # Should work
   ```

2. **Test integration tests:**
   ```bash
   cd /home/luce/apps/sparkqueue
   python sparkq/test_integration.py  # Should work with dynamic paths
   ```

3. **Test server startup:**
   ```bash
   ./sparkq.sh start  # Should create lockfile in correct location
   ```

4. **Test copying project:**
   ```bash
   cp -r /home/luce/apps/sparkqueue /tmp/sparkqueue-copy
   cd /tmp/sparkqueue-copy
   ./sparkq.sh setup  # Should work without modifications
   ```

## Benefits

- **Full portability:** Project can be moved/copied anywhere
- **No hardcoded paths:** All paths resolved dynamically
- **Consistent pattern:** Single source of truth for paths
- **Better maintainability:** Easier to understand where files are located
- **No CWD dependencies:** Works regardless of current directory

## Risks and Mitigations

**Risk:** Breaking existing deployment scripts that depend on relative paths
**Mitigation:** The paths module returns absolute paths, which work from any CWD

**Risk:** Import order issues if paths.py imports other modules
**Mitigation:** Keep paths.py minimal with no internal imports

**Risk:** Tests might break if they assume specific CWD
**Mitigation:** Review test suite and update any CWD-dependent tests

## Implementation Order

1. Create `paths.py` module (safe, no side effects)
2. Update `config.py` (low risk, used everywhere)
3. Update `server.py` (medium risk, test thoroughly)
4. Update `cli.py` (low risk, only affects E2E test logs)
5. Update `api.py` (low risk, already uses similar pattern)
6. Update `test_integration.py` (low risk, standalone file)
7. Update documentation (cosmetic)

## Success Criteria

- [ ] No hardcoded absolute paths remain in `sparkq/` folder
- [ ] All Python code uses centralized path resolver
- [ ] Integration tests pass from any location
- [ ] Server starts successfully with correct lockfile location
- [ ] Database and config files are found correctly
- [ ] Project can be copied to new location and works immediately
