# Python Environment Setup

## Quick Start (Recommended)

Use the python-bootstrap system for automated setup:

```bash
# Preview what will happen
./python-bootstrap/bootstrap.sh --dry-run

# Install dependencies and set up venv
./python-bootstrap/bootstrap.sh --install-only

# Then run the application
./python-bootstrap/bootstrap.sh
```

## Step-by-Step Manual Setup

### 1. Check Python Availability
```bash
# Check what Python versions are available
python3 --version
python3.11 --version
which python3.11

# Or use pyenv if installed
pyenv versions
pyenv install 3.11.14
```

### 2. Create Virtual Environment
```bash
# Create venv in current directory
python3.11 -m venv .venv

# Activate the virtual environment
source .venv/bin/activate

# Verify activation (prompt should show (.venv))
which python
python --version
```

### 3. Install Dependencies

#### Bootstrap Base Dependencies
```bash
pip install --upgrade pip
pip install -r python-bootstrap/requirements.txt
```

#### Project Dependencies
```bash
# If project has requirements.txt
if [ -f requirements.txt ]; then
  pip install -r requirements.txt
fi

# Or if using pyproject.toml for dependencies
if [ -f pyproject.toml ]; then
  pip install -e .
fi
```

### 4. Verify Setup
```bash
# Check venv is active
which python  # Should show .venv/bin/python

# List installed packages
pip list

# Check specific required packages
pip show pyyaml
```

## Configuration

### Bootstrap Configuration File
The bootstrap process creates/updates `python-bootstrap.config`:

```bash
cat python-bootstrap.config
```

Key settings:
- `PROJECT_ROOT` - Project directory
- `VENV_DIR` - Where venv is located (.venv by default)
- `APP_DIR` - Application directory (_build/sparkqueue)
- `PY_VERSION` - Required Python version
- `MAIN_SCRIPT` - Entry point script
- `REQUIREMENTS_FILES` - Dependency files to install

### Update Configuration
```bash
# Edit manually
nano python-bootstrap.config

# Or let bootstrap detect and update it
./python-bootstrap/bootstrap.sh --dry-run
```

## Handling Python Version Issues

### Pyenv Installation (if needed)

#### macOS
```bash
brew install pyenv
echo 'eval "$(pyenv init --path)"' >> ~/.zprofile
echo 'eval "$(pyenv init -)"' >> ~/.zprofile
eval "$(pyenv init -)"
```

#### Linux
```bash
git clone https://github.com/pyenv-project/pyenv.git ~/.pyenv
echo 'export PATH="$HOME/.pyenv/bin:$PATH"' >> ~/.bashrc
echo 'eval "$(pyenv init --path)"' >> ~/.bashrc
eval "$(pyenv init --path)"
```

#### Install Specific Python Version
```bash
pyenv install 3.11.14
pyenv local 3.11.14  # For this project
```

### Bypass Pyenv Requirement
```bash
# Tell bootstrap where Python is
PY_BIN=/usr/bin/python3.11 ./python-bootstrap/bootstrap.sh

# Or set in config
echo "PY_BIN=/usr/bin/python3.11" >> python-bootstrap.config
```

## Verifying Setup

### Test Imports
```bash
python -c "import yaml; print('PyYAML OK')"
```

### Run Application
```bash
# In foreground to see any errors
./python-bootstrap/bootstrap.sh --foreground

# Or manually
source .venv/bin/activate
python _build/sparkqueue/sparkqueue.py
```

### Check Process Running
```bash
./python-bootstrap/stop-env.sh
# or
pgrep -f sparkqueue -a
```

## Troubleshooting Setup

### "Command not found: python3.11"
- Install Python 3.11 or use `/dev` setup commands
- Check `which python3` and use available version
- Use pyenv to install required version

### "permission denied" on bootstrap.sh
```bash
chmod +x ./python-bootstrap/bootstrap.sh
chmod +x ./python-bootstrap/stop-env.sh
chmod +x ./python-bootstrap/kill-python.sh
```

### Venv Activation Not Working
```bash
# On Windows
.venv\Scripts\activate

# On macOS/Linux
source .venv/bin/activate

# Verify (prompt should show (.venv))
echo $VIRTUAL_ENV
```

### "pip: command not found"
```bash
# Venv not activated, try:
source .venv/bin/activate

# Or use full path
.venv/bin/pip install package_name
```

### Existing Venv Issues
```bash
# Bootstrap detects existing venv and offers options
./python-bootstrap/bootstrap.sh

# Or force clean rebuild
./python-bootstrap/bootstrap.sh --clean --yes

# Or manually remove old venv
rm -rf .venv
./python-bootstrap/bootstrap.sh --install-only
```

## Environment Cleanup

### Deactivate Virtual Environment
```bash
deactivate
```

### Remove Virtual Environment
```bash
rm -rf .venv
```

### Clean Bootstrap Files
```bash
# See what will be deleted
./python-bootstrap/bootstrap.sh --clean --dry-run

# Actually clean
./python-bootstrap/bootstrap.sh --clean --yes
```

## Next Steps

- Review project documentation in `docs/`
- Use `/dev` for common development tasks
- Use `/test` to run tests
- Use `/build` for deployment
- Use `/debug` for debugging
