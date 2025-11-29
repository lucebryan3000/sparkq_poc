# Python Bootstrap

A **one-time environment bootstrapper** for Python projects. It sets up a standardized, reproducible Python virtual environment and then gets out of the way.

## What is Python Bootstrap?

Python Bootstrap is a **generic, reusable, setup-only tool** that:
1. Detects your project structure
2. Ensures the correct Python version is available (installs via pyenv if needed)
3. Creates an isolated virtual environment (`.venv/`)
4. Installs dependencies from `requirements.txt` or `pyproject.toml`
5. Writes a `.env` file with standard paths
6. Manages `.gitignore` entries
7. **Then it gets out of the way** — you never reference it again

Once bootstrap completes, your `.venv/` is a normal Python virtual environment ready for development or deployment.

## Key Principle: Setup-Only, Not Infrastructure

**Important**: Python Bootstrap is NOT part of your application infrastructure. It runs once (or occasionally when dependencies change), then you interact with your app via:
- Direct venv activation: `source .venv/bin/activate`
- Wrapper scripts: `./app.sh run`
- CI/CD systems: just use the created `.venv/`

You should **never reference the `python-bootstrap/` folder again after setup completes**.

## Quick Start

### First Time: Set Up Environment
```bash
# Preview what will happen
./python-bootstrap/bootstrap.sh --dry-run

# Actually set up
./python-bootstrap/bootstrap.sh

# Or with auto-approval
./python-bootstrap/bootstrap.sh --yes
```

After this runs, you have a `.venv/` directory. That's all you need.

### Normal Development: Use the Environment

```bash
# Activate venv (one-time per terminal session)
source .venv/bin/activate

# Run commands normally
python your-script.py
npm install  # or whatever your project uses
```

### When Dependencies Change: Update & Redeploy

```bash
# If you modify requirements.txt or pyproject.toml
./python-bootstrap/bootstrap.sh --clean

# Or just let bootstrap detect the change automatically
./python-bootstrap/bootstrap.sh
```

### Command-Line Reference

For a complete list of all options:
```bash
./python-bootstrap/bootstrap.sh --help
```

Common flags:
- `--dry-run` — show what would happen without making changes
- `--install-only` — create venv + install deps, don't run a startup command
- `--clean` — remove old venv and redeploy from scratch
- `--clean-all` — like `--clean` but also remove .gitignore entries (useful for restructuring)
- `--yes` — auto-approve all prompts (useful for CI/CD)
- `--verbose` — show detailed pip install logs
- `--quiet` — show only phase status
- `--foreground|--background` — control how startup command runs (if configured)
- `--run-cmd "python app.py"` — override the startup command from config
- `--config <file>` — use a different config file

## Configuration File (python-bootstrap.config)

The config file defines project-specific paths and behavior. It's read once at bootstrap time and persisted with detected values.

### Path Settings
- `PROJECT_ROOT` — root directory of your project (auto-detected via git or explicit)
- `APP_DIR` — application directory containing source code
- `VENV_DIR` or `VENV_NAME` — where to create/store the virtual environment
- `CONFIG_FILE` — path to your application's config file (optional)
- `MAIN_SCRIPT` — entrypoint script (optional)

### Dependency Installation
- `REQUIREMENTS_FILES` — space-separated list of `requirements.txt` files
- `PYPROJECT_TOML` — path to `pyproject.toml` for modern Python projects
- `EDITABLE_INSTALL` — install packages in editable mode (true/false)
- `PRE_INSTALL_CMD` — custom command to run before installing deps
- `POST_INSTALL_CMD` — custom command to run after installing deps
- `INSTALL_DEPS` — whether to install dependencies (true/false)

### Python Version
- `PY_BIN` — Python binary to use (e.g., `/usr/bin/python3`)
- `PY_VERSION` — required Python version (e.g., `3.11`); bootstrap can install via pyenv
- `PYENV_ROOT` — path to pyenv installation (auto-detected if present)

### Environment File Management
- `WRITE_ENV` — create/update `.env` file (true/false)
- `ENV_PATH` — where to write `.env` (defaults to `$PROJECT_ROOT/.env`)
- `ENV_APPEND` — append to existing `.env` instead of overwriting (true/false)

### .gitignore Management
- `MANAGE_GITIGNORE` — automatically add venv/env to `.gitignore` (true/false)
- `GITIGNORE_PATH` — path to `.gitignore` file

### .claudeignore Management
- `MANAGE_CLAUDEIGNORE` — automatically manage `.claudeignore` entries (true/false)
- `CLAUDEIGNORE_PATH` — path to `.claudeignore` file

### Runtime Behavior
- `RUN_MODE` — `background` or `foreground` (how to run startup command)
- `RUN_CMD` — command to execute after setup (optional; can be overridden with `--run-cmd`)

### Safety & Prompts
- `ALLOW_ROOT` — permit running as root (default: false)
- `ALLOW_EXTERNAL_APP` — allow APP_DIR outside project root (default: false)
- `ALLOW_EXTERNAL_VENV` — allow VENV_DIR outside project root (default: false)
- `ALLOW_EXTERNAL_ALL` — shorthand to allow both (default: false)
- `PROMPT_EXTERNAL` — ask for confirmation if paths are external (default: true)
- `ASSUME_YES` — auto-approve all prompts (default: false)

### Logging
- `LOG_MAX_SIZE_BYTES` — max size of log file before rotation (default: 512 KB)
- `LOG_MAX_FILES` — keep this many rotated logs (default: 5)

## How Bootstrap Works: The 5 Phases

Bootstrap executes in distinct phases for clarity and debuggability:

1. **Phase 1 — Project Layout Detection**
   - Detects git root or uses explicit `PROJECT_ROOT`
   - Locates app directory, config files, pyproject.toml
   - Displays all resolved paths

2. **Phase 2 — Python Environment**
   - Checks for required Python version
   - Uses `PY_BIN` if available, otherwise searches system
   - Falls back to pyenv to install missing Python version (e.g., `3.11`)
   - Enforces version constraints from `pyproject.toml` or `runtime.txt`

3. **Phase 3 — Virtual Environment**
   - Creates `.venv/` in the configured location
   - **Smart venv reuse**: If `.venv/` already exists, shows detailed info:
     - Python version inside venv
     - Number of installed packages
     - Age and size
     - Prompts: `[R]euse`, `[C]lean & recreate`, or `[A]bort`
   - Validates venv with sanity checks (activate script exists, etc.)

4. **Phase 4 — Dependency Installation**
   - Runs `PRE_INSTALL_CMD` if configured
   - Installs from `requirements.txt` and/or `pyproject.toml`
   - **Hash-based install optimization**: Skips reinstall if nothing changed
     - Hash includes: config, deps, interpreter, pip version
     - Stored in `.bootstrap.hash`
   - Editable mode (--editable) for development workflows
   - Runs `POST_INSTALL_CMD` if configured

5. **Phase 5 — Environment Setup**
   - Writes `.env` file with standard variables (unless `--no-env`)
   - Manages `.gitignore` entries (venv, .env, logs)
   - Manages `.claudeignore` entries (Claude Code integration)
   - Optionally runs startup command if `RUN_CMD` is configured

## Key Features

### Auto-Detection
- Project root (via `.git` or explicit config)
- Python version from `pyproject.toml` or `runtime.txt`
- App directories, config files, venv location

### Python Version Management
- Respects version constraints in `pyproject.toml` (`requires-python`)
- Uses pyenv to install missing versions automatically
- Enforces minimum 3.10+ (configurable)

### Smart Virtual Environment Handling
- Detects existing venv and prompts what to do
- Shows Python version, package count, age, size
- Reuses if unchanged; rebuilds if dependencies modified
- Validates venv structure before use

### Dependency Hash Optimization
- Skips reinstall if dependencies haven't changed
- Includes config, interpreter, pip version in hash
- Hash stored in `.bootstrap.hash` for comparison

### File Management
- Writes `.env` with standard paths (PROJECT_ROOT, VENV, etc.)
- Auto-adds venv/.env to `.gitignore` (unless disabled)
- Auto-manages `.claudeignore` for Claude Code integration
- Log rotation: keeps 5 rotated logs, 512KB each (configurable)

### Safety Features
- Refuses to run as root (unless explicitly allowed with `ALLOW_ROOT=true`)
- Validates external venv/app paths (prompts for confirmation)
- Non-destructive: always previews with `--dry-run`
- Surgical cleanup: uses manifest to track added files

### Hooks & Extensibility
- `PRE_INSTALL_CMD` — custom setup before dependencies
- `POST_INSTALL_CMD` — custom setup after dependencies
- `EDITABLE_INSTALL` — install packages in editable mode

### Configuration Persistence
- Detected paths are written back to config for next run
- Allows auto-correction without manual editing
- Skipped on `--dry-run` for safety

## Example Workflows

### Scenario 1: New Project
```bash
# Initial setup
./python-bootstrap/bootstrap.sh --dry-run  # preview
./python-bootstrap/bootstrap.sh            # create .venv/

# Now use it normally
source .venv/bin/activate
python main.py
pip install additional-package
```

### Scenario 2: CI/CD Pipeline
```bash
# In your CI script
./python-bootstrap/bootstrap.sh --yes --install-only

# Then use the venv
source .venv/bin/activate
pytest
```

### Scenario 3: Dependency Update
```bash
# When requirements.txt changes
./python-bootstrap/bootstrap.sh
# Bootstrap detects the change and reinstalls

# Or force a clean rebuild
./python-bootstrap/bootstrap.sh --clean
```

### Scenario 4: Check What Would Happen
```bash
# Preview without making changes
./python-bootstrap/bootstrap.sh --dry-run

# Preview cleanup
./python-bootstrap/bootstrap.sh --clean --dry-run
```

## What Bootstrap Creates and Why

After bootstrap completes, your project has:

```
.venv/                    # Isolated Python environment
├── bin/                  # Executable scripts (python, pip, etc.)
├── lib/                  # Installed packages
└── pyvenv.cfg            # Venv configuration
.env                      # Environment variables (if WRITE_ENV=true)
.bootstrap.hash           # Dependency change detection
.gitignore                # Updated to exclude .venv/, .env, logs/
```

**These are normal files.** You don't need to reference bootstrap again to use them.

## Common Venv Handling Scenarios

When an existing venv is detected, bootstrap shows:

```
ℹ Existing virtual environment found:
  ○ Python version           3.11.5
  ○ Installed packages       45
  ○ Age                      5 days ago
  ○ Size                     328 MB

→ [R]euse, [C]lean & recreate, [A]bort? [R]: _
```

Choose an action:
- **[R]euse** (default): Keep venv, reinstall deps only if dependencies changed
- **[C]lean & recreate**: Remove and rebuild fresh (same as `--clean` but one-off)
- **[A]bort**: Cancel bootstrap

Auto-skip these prompts:
- `--yes` flag: Always reuse
- `--dry-run` flag: No changes made, skip prompt
- Non-interactive mode (piped stdin): Reuse automatically

## Recent Improvements (Refactoring)
- **Security**: Fixed command injection vulnerability in variable confirmation
- **Validation**: Added venv creation validation (checks activate script exists)
- **User Experience**: Smart venv reuse with visibility (Python version, package count, age, size) and optional prompt
- **Error Handling**: Enhanced pip install with detailed error reporting and `--verbose` support
- **Performance**: Eliminated Python subprocess overhead (50-100ms speedup) via bash-native path resolution
- **Code Quality**: Centralized path resolution logic, standardized boolean naming, consistent error handling
- **Robustness**: Added proper error logging for Python subprocesses with graceful fallbacks

## Manifest-Based Tracking

Bootstrap tracks what it adds to your project via a **manifest file**. This enables surgical cleanup without affecting your project:

```
.venv/.bootstrap.manifest
```

Contents:
- Environment variables added to `.env`
- `.gitignore` entries added
- `.claudeignore` entries added

This manifest is automatically created during Phase 5. It allows bootstrap to:
- Know exactly what to remove (without deleting other important .env entries)
- Preserve your project files while cleaning up bootstrap artifacts
- Safely re-run bootstrap multiple times

The manifest is **never referenced operationally** — it exists only for cleanup purposes.

## Cleanup & Redeploy

Use `--clean` when you need to reset or redeploy:

```bash
# Preview what will be deleted (safe!)
./python-bootstrap/bootstrap.sh --clean --dry-run

# Interactive cleanup + redeploy
./python-bootstrap/bootstrap.sh --clean

# Auto-approve cleanup (useful for CI)
./python-bootstrap/bootstrap.sh --clean --yes
```

### What Gets Removed

`--clean` removes:
- `.venv/` (the virtual environment)
- `.env` (environment file — using manifest to only remove bootstrap-added entries)
- `APP_DIR/logs/` (runtime logs)
- `.bootstrap.hash` (dependency change tracking)

`--clean-all` **also** removes:
- `.gitignore` entries (useful if restructuring your entire project)

### What's Always Preserved

Bootstrap **never** deletes:
- Your project source code
- `requirements.txt`, `pyproject.toml`, or config files
- The `.gitignore` file itself (only entries are removed with `--clean-all`)
- Your project's custom .env values (only bootstrap-added entries are removed)

## Notes
- No interactive menu: use flags for control. When APP_DIR/VENV_DIR are outside the project root, you'll be prompted unless you pass `--yes` or configure external allowances.
- For foreground runs that still print a summary/log tail, use `--foreground-wrapper`.
- The `--clean` flag is safe: always shows what will be deleted, and asks for confirmation (unless `--yes` or `--dry-run` is used).
