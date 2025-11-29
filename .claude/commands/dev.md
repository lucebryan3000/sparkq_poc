# Development Setup & Common Tasks

## Quick Start – Using run.sh (Recommended)

The project includes a simple `run.sh` wrapper script that handles venv setup and running:

### 1. Setup (one-time)
```bash
./run.sh setup
```

### 2. Start the Application
```bash
# Start in background (default)
./run.sh start

# Or run in foreground
./run.sh start --foreground

# Show status
./run.sh status

# Stop the application
./run.sh stop

# View logs
./run.sh logs
```

## Alternative: Using python-bootstrap Directly

If you prefer the bootstrap system:

```bash
# Dry-run to see what will be set up
./python-bootstrap/bootstrap.sh --dry-run

# Set up virtual environment and install dependencies
./python-bootstrap/bootstrap.sh --install-only
```

### Manage Running Process (with bootstrap)
```bash
# Interactive manager (see running processes, view logs, kill)
./python-bootstrap/stop-env.sh

# Or quick kill all sparkqueue processes
./python-bootstrap/kill-python.sh
```

## Development Workflow

### First Time Setup
1. Run `./python-bootstrap/bootstrap.sh --dry-run` to preview
2. Run `./python-bootstrap/bootstrap.sh --install-only` to create venv
3. Activate venv: `source .venv/bin/activate`
4. Test the setup: `python --version`

### Modifying Dependencies
1. Update `requirements.txt` in the project root or `python-bootstrap/requirements.txt`
2. Reinstall: `./python-bootstrap/bootstrap.sh --clean` (rebuilds venv)
3. Or just: `pip install -r requirements.txt` (faster for incremental changes)

### Testing Changes
```bash
# Activate the venv
source .venv/bin/activate

# Run your app or tests
python _build/sparkqueue/sparkqueue.py
```

### Debugging
- Use `print()` for quick debugging
- Use `pdb` for interactive debugging: `import pdb; pdb.set_trace()`
- Check logs: `tail -f logs/*.log`

## Bootstrap Command Reference

### Common Flags
```bash
# Preview changes without making them
./python-bootstrap/bootstrap.sh --dry-run

# Clean rebuild (removes venv, deps, and reinstalls)
./python-bootstrap/bootstrap.sh --clean

# Run in foreground (don't background the process)
./python-bootstrap/bootstrap.sh --foreground

# Install deps only (don't launch the app)
./python-bootstrap/bootstrap.sh --install-only

# Custom command after setup
./python-bootstrap/bootstrap.sh --run-cmd "python -c 'print(1+1)'"

# See all options
./python-bootstrap/bootstrap.sh --help
```

## Common Issues & Solutions

### Pyenv Not Found
**Error:** `pyenv not found. Install pyenv or set PY_BIN to a Python 3.11.14+ interpreter.`

**Solutions:**
1. Install pyenv: Follow https://github.com/pyenv-project/pyenv#installation
2. Or specify Python path: `PY_BIN=/usr/bin/python3 ./python-bootstrap/bootstrap.sh`

### Venv Already Exists
The bootstrap script detects existing venvs and offers to reuse or rebuild them:
- `[R]euse` (default) - Keep existing, just reinstall deps if config changed
- `[C]lean & recreate` - Remove and rebuild fresh
- `[A]bort` - Exit without proceeding

### Wrong Python Version
The bootstrap enforces the version in `python-bootstrap.config` or `pyproject.toml`:
```bash
# Check venv's Python version
.venv/bin/python --version

# Rebuild with a specific version
PY_VERSION=3.12 ./python-bootstrap/bootstrap.sh --clean --yes
```

### Permission Denied on Bootstrap Script
```bash
chmod +x ./python-bootstrap/bootstrap.sh
chmod +x ./python-bootstrap/stop-env.sh
chmod +x ./python-bootstrap/kill-python.sh
```

## Documentation
- Review `python-bootstrap/README.md` for complete bootstrap documentation
- Review `python-bootstrap/STOP-ENV-GUIDE.md` for process management
- Check `docs/` for project-specific documentation
