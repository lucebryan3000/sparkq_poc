# SparkQueue Scripts

Utility scripts for managing and debugging SparkQueue processes.

## check-zombies.sh

**Purpose:** Detect and clean up zombie processes created by Codex executions or other background tasks.

### What is a Zombie Process?

A zombie (or defunct) process is a child process that has terminated, but its parent process hasn't yet waited for it to exit. This can happen when:
- A parent shell is killed before child processes complete
- Codex batch execution is interrupted
- Background jobs aren't properly waited for

### Usage

```bash
# Check for zombies and prompt to kill
./scripts/check-zombies.sh

# Auto-kill all zombies without prompting
./scripts/check-zombies.sh -y

# Continuously monitor for zombies (check every 5s)
./scripts/check-zombies.sh -w
```

### Features

✅ **Lists all zombies** with:
- PID and Parent PID
- Parent process name
- How long they've been running
- Command that created them

✅ **Interactive prompt** - Ask before killing

✅ **Auto-kill mode** - Kill zombies without prompting (`-y` flag)

✅ **Watch mode** - Continuously monitor for new zombies (`-w` flag)

✅ **Color-coded output** - Easy to scan and understand

✅ **Automatic recheck** - Verifies zombies are gone after killing

### How It Works

1. **Scan:** Uses `ps` to find all processes with state `Z` (zombie)
2. **Display:** Shows each zombie with:
   - PID and parent process details
   - Elapsed time since creation
   - Command that spawned it
3. **Kill:** Kills the parent process (zombies can't be directly killed - parent must be terminated)
4. **Verify:** Rechecks to confirm all zombies are eliminated

### Example Output

```
═════════════════════════════════════════════════════════════════
Zombie Processes Found:
═════════════════════════════════════════════════════════════════

[1] PID: 52345 (Parent: 52345→52340:bash)
    Status: ZOMBIE (Z)
    User: luce
    Running for: 00:15:32
    Command: codex exec --full-auto -C /home/luce/apps/sparkqueue

═════════════════════════════════════════════════════════════════
Total zombies found: 1

Warning: Killing zombies will terminate their parent processes.

Kill these zombie processes? (y/n)
```

### When to Use

- **After interrupted Codex batches:** If you Ctrl+C during codex execution
- **Periodic maintenance:** Run periodically to clean up stray processes
- **Process monitoring:** Use watch mode to catch zombies as they appear
- **Before new batches:** Ensure clean state before running new code generation

### Common Scenarios

**Scenario 1: Codex batch interrupted**
```bash
# Your Codex batch was killed
./scripts/check-zombies.sh -y
# Output: "Killed 1 parent process(es)"
```

**Scenario 2: Monitor during development**
```bash
# In one terminal, watch for zombies
./scripts/check-zombies.sh -w

# In another terminal, run your Codex batches
./scripts/some-codex-batch.sh
```

**Scenario 3: Nightly cleanup**
```bash
# Add to crontab for automatic cleanup
0 0 * * * /home/luce/apps/sparkqueue/scripts/check-zombies.sh -y >> /tmp/zombie-cleanup.log
```

### Technical Details

- **Zombie detection:** Looks for processes with `STAT=Z` or `STAT=z`
- **Runtime reporting:** Extracts from `etime` field (elapsed time)
- **Parent killing:** Uses `kill -9` to forcefully terminate parent processes
- **Safety:** Requires manual confirmation unless `-y` flag is used

### Related Scripts

- `python-bootstrap/stop-env.sh` - Interactive process manager for all SparkQ processes
- `python-bootstrap/kill-python.sh` - Quick kill all SparkQueue Python processes

### Troubleshooting

**Q: Script says "No zombie processes found" but I see them**
- Zombies may be short-lived and already cleaned up
- Run the script multiple times quickly
- Use watch mode: `./scripts/check-zombies.sh -w`

**Q: Killing parent didn't work**
- May need elevated privileges (sudo) for some processes
- Try: `sudo ./scripts/check-zombies.sh -y`

**Q: Want to see all processes (not just zombies)?**
- Use: `ps aux | grep defunct`
- Or: `ps -o pid,ppid,stat,etime,cmd | grep -E '\sZ\s'`

### Development Notes

- Uses POSIX shell (`bash`) for maximum compatibility
- Color codes disabled automatically if piping output
- No external dependencies beyond standard Linux utilities
- Tested on: Linux (Ubuntu, CentOS, etc.)

