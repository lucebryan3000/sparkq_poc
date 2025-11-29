# Build & Deployment Guide

## Using Python Bootstrap

The SparkQueue project uses the `python-bootstrap` system for setup and deployment. This is the recommended way to build and run the application.

### Bootstrap Dry-Run (Preview)
```bash
# See what will happen without making changes
./python-bootstrap/bootstrap.sh --dry-run
```

### Bootstrap Install Only (Recommended for Development)
```bash
# Set up venv and install dependencies without running
./python-bootstrap/bootstrap.sh --install-only
```

### Bootstrap Full Run (Development)
```bash
# Set up, install deps, and run in background (default)
./python-bootstrap/bootstrap.sh

# Or run in foreground (blocking)
./python-bootstrap/bootstrap.sh --foreground
```

### Bootstrap Full Run (Production)
```bash
# Clean install and run
./python-bootstrap/bootstrap.sh --clean --yes

# Run in background (non-blocking)
./python-bootstrap/bootstrap.sh --background --yes
```

## Manual Build Steps (if not using bootstrap)

### 1. Create Virtual Environment
```bash
python3.11 -m venv .venv
source .venv/bin/activate
```

### 2. Install Dependencies
```bash
# Bootstrap base dependencies
pip install -r python-bootstrap/requirements.txt

# Project dependencies
if [ -f requirements.txt ]; then
  pip install -r requirements.txt
fi

# Or editable install from pyproject.toml
if [ -f pyproject.toml ]; then
  pip install -e .
fi
```

### 3. Run Tests
```bash
# See /test command for details
pytest
```

### 4. Verify Syntax
```bash
# Check for Python syntax errors
python -m py_compile _build/sparkqueue/*.py

# Or use a linter
pip install pylint
pylint _build/sparkqueue/
```

## Build Checklist
- [ ] Virtual environment created and activated
- [ ] All dependencies installed
- [ ] All tests passing
- [ ] No syntax errors
- [ ] Bootstrap configuration valid
- [ ] Logs directory writable

## Bootstrap Configuration

The bootstrap process stores settings in `python-bootstrap.config`:
```bash
cat python-bootstrap.config
```

Key configuration items to verify:
- `PROJECT_ROOT` - Correct project path
- `APP_DIR` - Where the app lives
- `VENV_DIR` - Virtual environment location
- `MAIN_SCRIPT` - Entry point script
- `PY_VERSION` - Python version requirement
- `REQUIREMENTS_FILES` - Dependency files to install

## Troubleshooting Build Issues

### Pyenv Not Found
**Problem:** `pyenv not found. Install pyenv or set PY_BIN to a Python 3.11.14+ interpreter.`

**Solution:**
```bash
# Option 1: Install pyenv
git clone https://github.com/pyenv-project/pyenv.git ~/.pyenv
export PATH="$HOME/.pyenv/bin:$PATH"

# Option 2: Tell bootstrap where Python is
PY_BIN=/usr/bin/python3.11 ./python-bootstrap/bootstrap.sh
```

### Dependency Installation Fails
```bash
# Verbose mode to see detailed error messages
./python-bootstrap/bootstrap.sh --verbose

# Or manually:
source .venv/bin/activate
pip install -r requirements.txt --verbose
```

### Venv Creation Failed
```bash
# Check what python is available
python3 --version
which python3

# Rebuild venv cleanly
./python-bootstrap/bootstrap.sh --clean --yes
```

### Permission Issues
```bash
# Make bootstrap scripts executable
chmod +x ./python-bootstrap/bootstrap.sh
chmod +x ./python-bootstrap/stop-env.sh
chmod +x ./python-bootstrap/kill-python.sh

# Ensure logs directory is writable
mkdir -p logs
chmod 755 logs
```

## Deployment

### Pre-Deployment Checklist
1. Run full test suite: `/test`
2. Review bootstrap config: `cat python-bootstrap.config`
3. Check for uncommitted changes: `git status`
4. Verify Python version: `python --version`

### Deploy with Bootstrap
```bash
# Clean deploy (recommended for fresh installations)
./python-bootstrap/bootstrap.sh --clean --yes

# Quick redeploy (reuses venv if unchanged)
./python-bootstrap/bootstrap.sh --yes
```

### Monitor Deployment
```bash
# Interactive process manager
./python-bootstrap/stop-env.sh

# View logs
tail -f logs/*.log

# Quick kill if needed
./python-bootstrap/kill-python.sh
```

## Bootstrap Command Reference
See `/dev` for complete bootstrap command documentation.

Common flags:
- `--dry-run` - Preview without changes
- `--clean` - Full rebuild
- `--install-only` - Skip running the app
- `--foreground` - Don't background the process
- `--yes` - Auto-approve prompts
- `--verbose` - Detailed output
- `--help` - Show all options
