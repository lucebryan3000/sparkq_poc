# Python Bootstrap Tool Context

⚠️ **This is a ONE-TIME bootstrap utility, completely SEPARATE from SparkQueue.** ⚠️

---

## Critical Context

**This directory is NOT part of SparkQueue:**
- This is a standalone venv setup tool
- Used once during initial project setup
- SparkQ does not depend on this after initial bootstrap
- SparkQ uses standard Python venv after setup

---

## What This Tool Does

Initial Python environment setup:
1. Creates `.venv/` directory
2. Installs base Python dependencies
3. Configures initial environment
4. Exits (one-time operation)

After bootstrap completes:
- SparkQ runs via `./sparkq.sh` wrapper
- Standard Python venv management applies
- No ongoing dependency on bootstrap scripts

---

## Architecture Boundary

```
sparkqueue/
├── sparkq/                    ← THIS IS SPARKQ (the application)
│   ├── src/
│   ├── ui/
│   └── ...
├── sparkq.sh                  ← Primary entry point for SparkQ
├── sparkq.yml                 ← SparkQ configuration
└── __omni-dev/
    └── python-bootstrap/      ← THIS DIRECTORY (one-time tool)
        ├── bootstrap.sh       ← Used once, then done
        └── ...
```

**Key Point**: These are two separate tools in the same repo for convenience only.

---

## Guidelines When Working Here

### DO NOT:
- ❌ Reference this directory in SparkQ documentation
- ❌ Treat this as part of SparkQ's architecture
- ❌ Include this in SparkQ FRD or feature documents
- ❌ Add runtime dependencies from SparkQ to this tool
- ❌ Update SparkQ code to call bootstrap scripts

### DO:
- ✅ Treat this as a standalone utility
- ✅ Keep changes isolated to this directory only
- ✅ Test bootstrap functionality independently
- ✅ Document bootstrap process in this directory's README

---

## If You're Working on SparkQ Docs

**Stop. Do not reference this directory.**

SparkQ documentation should reference:
- ✅ Standard Python venv management
- ✅ `./sparkq.sh` wrapper script
- ✅ `./sparkq.sh setup` command
- ✅ Direct SparkQ commands

SparkQ documentation should NOT reference:
- ❌ `python-bootstrap` directory
- ❌ `bootstrap.sh` script
- ❌ `python-bootstrap.config`
- ❌ "Bootstrap-based deployment"
- ❌ Any files in `__omni-dev/`

---

## If You're Working on SparkQ Code

**You should not be in this directory.**

Navigate to:
```bash
cd ../../sparkq/
```

All SparkQ application code lives in `sparkq/`, not here.

---

## Tool Purpose & Lifecycle

**Initial Setup** (one time):
```bash
# User runs bootstrap once
./python-bootstrap/bootstrap.sh
# Creates .venv/, installs deps, done
```

**Ongoing Usage** (SparkQ runtime):
```bash
# User runs SparkQ via wrapper
./sparkq.sh start     # Uses .venv/, no bootstrap
./sparkq.sh run       # Uses .venv/, no bootstrap
./sparkq.sh stop      # Uses .venv/, no bootstrap
```

**Bootstrap is not called again after initial setup.**

---

## Files in This Directory

- `bootstrap.sh` — Main bootstrap script (one-time venv setup)
- `stop-env.sh` — Process manager (deprecated, use `./sparkq.sh stop`)
- `kill-python.sh` — Kill script (deprecated, use `./sparkq.sh stop`)
- `requirements.txt` — Base dependencies for bootstrap
- `README.md` — Bootstrap tool documentation
- `python-bootstrap.config` — Bootstrap configuration

**Note**: Some scripts may be deprecated in favor of SparkQ's integrated management via `sparkq.sh`.

---

## Maintenance

If maintaining this bootstrap tool:
- Keep it focused on one-time venv setup
- Do not add SparkQ-specific features here
- Consider whether new features belong in `sparkq.sh` instead
- Test that SparkQ works without re-running bootstrap

---

## Summary

**Remember**:
- This is `python-bootstrap` (setup tool)
- SparkQ is in `../../sparkq/` (application)
- They are separate tools
- SparkQ docs should never reference this directory
- After initial setup, this tool is not used
