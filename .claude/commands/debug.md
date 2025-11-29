# Debugging Tips & Techniques

## Python Debugging Basics

### Print Debugging
```python
# Basic print
print(f"Variable value: {variable}")

# With module and line info
import sys
print(f"[{__name__}:{sys._getframe().f_lineno}] value={value}", file=sys.stderr)

# Pretty print complex objects
from pprint import pprint
pprint(complex_data_structure)
```

## Interactive Debugging with pdb

### Setting Breakpoints
```python
# Simple breakpoint
import pdb; pdb.set_trace()

# Python 3.7+
breakpoint()  # Requires PYTHONBREAKPOINT environment variable

# Run script with pdb
python -m pdb _build/sparkqueue/sparkqueue.py
```

### pdb Commands
```
n (next)      - Execute next line
s (step)      - Step into functions
c (continue)  - Continue execution
l (list)      - Show current code
p <var>       - Print variable value
pp <var>      - Pretty print variable
w (where)     - Show stack trace
u (up)        - Move up in stack
d (down)      - Move down in stack
h (help)      - Show help
q (quit)      - Quit debugger
```

## Logging in Application

### Using Python Logging
```python
import logging

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)

# Use in code
logger.debug(f"Debug info: {var}")
logger.info("Important event")
logger.warning("Potential issue")
logger.error("Error occurred", exc_info=True)
```

### Check Application Logs
```bash
# Watch logs in real-time
tail -f logs/*.log

# View last N lines
tail -50 logs/bootstrap.log

# Search logs for errors
grep ERROR logs/*.log

# Search with context
grep -C 3 "error_text" logs/*.log
```

## Debugging the Bootstrap Process

### Dry-Run to See What Happens
```bash
# Preview all steps without making changes
./python-bootstrap/bootstrap.sh --dry-run
```

### Verbose Bootstrap Output
```bash
# See detailed bootstrap process
./python-bootstrap/bootstrap.sh --verbose

# And keep logs for review
./python-bootstrap/bootstrap.sh --verbose 2>&1 | tee bootstrap_debug.log
```

### Check Bootstrap Configuration
```bash
# View current bootstrap config
cat python-bootstrap.config

# Review what was detected
./python-bootstrap/bootstrap.sh --dry-run | head -50
```

## Debugging Running Process

### Check What's Running
```bash
# Interactive process manager
./python-bootstrap/stop-env.sh

# Or see running Python processes
pgrep -f sparkqueue -a

# Or use ps
ps aux | grep sparkqueue | grep -v grep
```

### Attach to Running Process
```bash
# Get the PID
PID=$(pgrep -f sparkqueue)

# Attach with debugger (requires running with pdb -m flag)
# Or use strace to see system calls
strace -p $PID

# Or ltrace for library calls
ltrace -p $PID
```

## Debugging Tips

### Find Where Something is Being Called
```bash
# Search for function/variable usage
grep -r "function_name" _build/

# Find imports
grep -r "from.*import.*name" _build/

# Find all references to a variable
grep -r "variable" _build/ --include="*.py"
```

### Check Virtual Environment
```bash
# Verify venv is activated
which python
python --version

# Check installed packages
pip list

# Check specific package
pip show package_name
```

### Trace Imports and Execution
```python
# Show when modules are imported
python -v script.py

# Show even more detail
python -vv script.py
```

### Performance Profiling
```python
import cProfile
import pstats

# Profile a function
cProfile.run('function_call()', 'profile_stats')

# View results
stats = pstats.Stats('profile_stats')
stats.sort_stats('cumulative')
stats.print_stats(20)  # Top 20
```

## Common Debugging Scenarios

### "ModuleNotFoundError: No module named 'X'"
1. Check venv is activated: `which python`
2. Verify module is installed: `pip list | grep module_name`
3. Check Python path: `python -c "import sys; print(sys.path)"`
4. Reinstall dependencies: `pip install -r requirements.txt`

### "PermissionError" on File Operations
1. Check file permissions: `ls -la path/to/file`
2. Check directory permissions: `ls -la path/to/directory`
3. Check process user: `whoami`
4. Fix permissions if needed: `chmod 644 file` or `chmod 755 directory`

### Application Crashes at Startup
1. Check logs: `tail -50 logs/bootstrap.log`
2. Run with verbose: `./python-bootstrap/bootstrap.sh --verbose`
3. Run in foreground to see output: `./python-bootstrap/bootstrap.sh --foreground`
4. Test manually: `source .venv/bin/activate && python _build/sparkqueue/sparkqueue.py`

### Slow Application or High CPU
1. Profile with cProfile (see above)
2. Check system resources: `top`, `free -h`, `df -h`
3. Check logs for slow operations or errors
4. Look for infinite loops or blocking I/O

### Environment Variable Not Set
```bash
# Check if var is set
echo $VAR_NAME

# Set it temporarily
export VAR_NAME=value

# Or set for specific command
VAR_NAME=value python script.py

# Check all relevant vars
env | grep -i sparkqueue
```
