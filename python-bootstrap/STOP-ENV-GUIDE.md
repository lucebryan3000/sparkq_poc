# Stop Python Environment – Usage Guide

Two scripts are available to detect and stop the background Python environment:

## 1. Interactive Environment Manager

**File:** `stop-env.sh`

**Usage:**
```bash
./scripts/python-bootstrap/stop-env.sh
```

**Features:**
- Detects all running sparkqueue processes
- Shows process details (PID, user, elapsed time, command)
- Interactive menu with options:
  - `[k]` Kill process(es) - Gracefully stops processes with SIGTERM, force kills with SIGKILL if needed
  - `[l]` View logs - Shows last 50 lines of bootstrap.log
  - `[q]` Quit - Exit without taking action
- Displays environment status (project root, venv location, app directory)
- Shows recent log activity if no processes are running

**Example Output:**
```
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║  Python Environment Manager – Stop Background Process         ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝

Environment Status
─────────────────────────────────────────
  ✓ Project root: /Users/luce/_dev/sparkqueue
  ✓ Virtual env: /Users/luce/_dev/sparkqueue/.venv
  ✓ App directory: /Users/luce/_dev/sparkqueue/_build/sparkqueue

Running Python Processes
─────────────────────────────────────────
  Found 1 process(es):

  [0] PID: 76913
      76913 luce       00:45 /Users/luce/.pyenv/versions/3.11.14/bin/python3 /Users/luce/_dev/sparkqueue/_build/sparkqueue/sparkqueue.py

Select action:
  [k] Kill process(es)
  [l] View logs
  [q] Quit

Choice [q]:
```

---

## 2. Quick Kill Script

**File:** `kill-python.sh`

**Usage:**
```bash
./scripts/python-bootstrap/kill-python.sh
```

**Features:**
- Instantly kills all running sparkqueue processes
- Attempts graceful shutdown first (SIGTERM)
- Force kills (SIGKILL) if process doesn't respond
- Minimal output, no prompts

**Example Output:**
```
Killing sparkqueue processes:
  PID 76913: ✓ Stopped

✓ Done
```

---

## Quick Reference

### When to use each script:

| Scenario | Script | Command |
|----------|--------|---------|
| Want to see what's running first | `stop-env.sh` | `./scripts/python-bootstrap/stop-env.sh` |
| View recent log output | `stop-env.sh` | `./scripts/python-bootstrap/stop-env.sh` → choose `[l]` |
| Immediately kill all processes | `kill-python.sh` | `./scripts/python-bootstrap/kill-python.sh` |
| Can't remember which to use | Either! | Both work the same way |

---

## How it Works

Both scripts:
1. Search for Python processes matching `sparkqueue` pattern using `pgrep`
2. Detect the venv and app directory locations
3. Find and display running processes
4. Optionally kill them with proper signal handling

### Process Termination Strategy:
1. **SIGTERM** (graceful) - Allows process to clean up
2. **Wait 0.5-1 second** - Give process time to shut down
3. **SIGKILL** (force) - If still running, force immediate termination

---

## Manual Commands (If Scripts Don't Work)

If you know the PID directly:
```bash
# Graceful kill
kill 76913

# Force kill
kill -9 76913

# Find all sparkqueue processes
pgrep -f sparkqueue

# Find all Python processes
ps aux | grep python
```

---

## Troubleshooting

**"No running sparkqueue processes found"**
- The background process has already exited
- The application crashed before launching (check logs with `./stop-env.sh` → `[l]`)
- No bootstrap has been run yet

**"Failed to kill PID XXXX"**
- You may not have permission to kill the process
- The process has already terminated
- Try `kill -9 XXXX` for force kill

**Process still running after kill**
- May be stuck in a system call, try force kill: `kill -9 <PID>`
- Check if there are child processes: `ps aux | grep <PID>`

**View logs to diagnose issues:**
```bash
tail -50 _build/sparkqueue/logs/bootstrap.log
```
