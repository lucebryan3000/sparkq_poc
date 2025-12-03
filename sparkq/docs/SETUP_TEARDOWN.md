# SparkQ Setup & Teardown Guide

This document covers the installation, configuration seeding, and clean removal of SparkQ.

## Quick Reference

```bash
# Initial setup
./sparkq.sh setup

# Clean removal
./sparkq.sh teardown

# Force removal (no prompts, includes .venv)
./sparkq.sh teardown --force

# Update example files from current config
./sparkq/scripts/setup/setup.sh --update
```

---

## Setup Process

### What `./sparkq.sh setup` Does

The setup script performs 6 steps:

| Step | Action | Details |
|------|--------|---------|
| 1/6 | Create virtualenv | Creates `.venv/` if missing |
| 2/6 | Install dependencies | `pip install -r sparkq/requirements.txt` |
| 3/6 | Install test deps | `pip install -r sparkq/requirements-test.txt` |
| 4/6 | Seed config | Copy `sparkq.yml.example` → `sparkq.yml` |
| 5/6 | Seed .env | Copy `.env.example` → `.env` (if present) |
| 6/6 | Create directories | `sparkq/data/` and `sparkq/logs/` |

After directory setup, it also:
- Initializes the SQLite database
- Seeds the project record
- Seeds configuration tables from `sparkq.yml`
- Seeds tools and task_classes tables

### Configuration File Seeding

#### sparkq.yml

The main configuration file is seeded from the example template:

```
sparkq/scripts/setup/sparkq.yml.example  →  sparkq.yml
```

**Seeding behavior:**
- If `sparkq.yml` **doesn't exist**: Copy from example
- If `sparkq.yml` **exists**: Leave untouched (preserves your customizations)

#### .env (Optional)

Environment variables file:

```
sparkq/scripts/setup/.env.example  →  .env
```

**Seeding behavior:**
- If `.env.example` exists and `.env` **doesn't exist**: Copy from example
- Otherwise: Skip

---

## Database Initialization & Config Seeding

When setup runs, it executes Python code that:

### 1. Creates Database Tables

```python
storage.init_db()
```

Creates all tables if they don't exist:
- `projects` - Project metadata
- `sessions` - Work sessions
- `queues` - Task queues
- `tasks` - Individual tasks
- `config` - Runtime configuration
- `prompts` - Text expander templates (33 defaults seeded)
- `agent_roles` - Agent role definitions
- `tools` - Tool definitions
- `task_classes` - Timeout configurations
- `audit_log` - Change tracking

### 2. Seeds Default Project

Ensures a project record exists, using values from `sparkq.yml`:

```yaml
project:
  name: sparkq-local
  repo_path: .
```

### 3. Seeds Config Table

If the `config` table is empty, seeds it from `sparkq.yml`:

| Namespace | Key | Source in YAML |
|-----------|-----|----------------|
| `purge` | `config` | `purge:` section |
| `queue_runner` | `config` | `queue_runner:` section |
| `tools` | `all` | `tools:` section |
| `task_classes` | `all` | `task_classes:` section |
| `ui` | `build_id` | Auto-generated |
| `features` | `flags` | `features.flags:` section |
| `defaults` | `queue` | `defaults.queue:` section |

**Key behavior:**
- Only seeds if config table is **empty**
- Existing config entries are never overwritten
- This is a one-time seed operation

### 4. Seeds Tools & Task Classes Tables

After config is seeded, populates the dedicated tables:

**Task Classes** (from `task_classes:` in YAML):
```yaml
task_classes:
  FAST_SCRIPT:
    timeout: 120
  MEDIUM_SCRIPT:
    timeout: 600
  LLM_LITE:
    timeout: 480
  LLM_HEAVY:
    timeout: 1200
```

**Tools** (from `tools:` in YAML):
```yaml
tools:
  run-bash:
    description: Bash script
    task_class: MEDIUM_SCRIPT
  llm-sonnet:
    description: Sonnet
    task_class: LLM_HEAVY
```

**Key behavior:**
- Only seeds if **both** tables are empty
- If either has data, neither is modified
- Config table values take precedence over YAML

### 5. Seeds Default Prompts

The `prompts` table is seeded with 33 default text expanders organized by category:

| Category | Count | Examples |
|----------|-------|----------|
| Core Dev & Code | 7 | code-review, refactor, fix, debug |
| Frontend/UI | 3 | component, ui-handler, fix-ui |
| Backend/Python | 3 | endpoint, storage, model |
| Testing/QA | 3 | write-tests, test-fail, cover |
| Documentation | 3 | docs, summary, report |
| Generative | 4 | audit, api-audit, e2e-audit, build |
| Security | 2 | security, validate |
| Troubleshooting | 3 | ui-error, backend-error, db-fix |
| Orchestration | 3 | css-fix, clean, deps |

**Key behavior:**
- Only seeds if prompts table is **empty**
- Your custom prompts are never overwritten

### 6. Seeds Agent Roles

Built-in agent roles are seeded from `sparkq/src/agent_roles.py`:

**Key behavior:**
- Uses `INSERT ... ON CONFLICT DO UPDATE`
- Updates label/description but preserves your custom `active` flag
- Safe to run multiple times

---

## Configuration Priority

SparkQ uses a layered configuration system:

```
Priority (highest to lowest):
1. Database config table (runtime changes via UI/API)
2. sparkq.yml file (static configuration)
3. Hardcoded defaults (fallback values)
```

### Config Resolution at Runtime

When the server starts:

1. Load `sparkq.yml`
2. Merge with hardcoded defaults for missing values
3. Check database `config` table for overrides
4. Apply final configuration

### Where Config Values Live

| Setting | File Location | DB Location |
|---------|--------------|-------------|
| Server port/host | `sparkq.yml → server:` | Not stored in DB |
| Database path | `sparkq.yml → database:` | Not stored in DB |
| Purge settings | `sparkq.yml → purge:` | `config.purge.config` |
| Queue runner | `sparkq.yml → queue_runner:` | `config.queue_runner.config` |
| Tool definitions | `sparkq.yml → tools:` | `tools` table + `config.tools.all` |
| Task classes | `sparkq.yml → task_classes:` | `task_classes` table + `config.task_classes.all` |
| Feature flags | `sparkq.yml → features:` | `config.features.flags` |
| Prompts | N/A | `prompts` table only |
| Agent roles | `agent_roles.py` | `agent_roles` table |

---

## Validation: Ensuring Config Applies Correctly

### Verify Database Was Created

```bash
ls -la sparkq/data/sparkq.db
```

### Verify Tables Were Created

```bash
sqlite3 sparkq/data/sparkq.db ".tables"
```

Expected output:
```
agent_roles  audit_log    config       projects     prompts
queues       sessions     task_classes tasks        tools
```

### Verify Config Was Seeded

```bash
sqlite3 sparkq/data/sparkq.db "SELECT namespace, key FROM config;"
```

Expected output:
```
purge|config
queue_runner|config
tools|all
task_classes|all
ui|build_id
features|flags
defaults|queue
```

### Verify Task Classes Were Seeded

```bash
sqlite3 sparkq/data/sparkq.db "SELECT name, timeout FROM task_classes;"
```

Expected output:
```
FAST_SCRIPT|120
LLM_HEAVY|1200
LLM_LITE|480
MEDIUM_SCRIPT|600
```

### Verify Tools Were Seeded

```bash
sqlite3 sparkq/data/sparkq.db "SELECT name, task_class FROM tools;"
```

Expected output:
```
llm-codex|LLM_HEAVY
llm-haiku|LLM_LITE
llm-sonnet|LLM_HEAVY
quick-check|FAST_SCRIPT
run-bash|MEDIUM_SCRIPT
run-python|MEDIUM_SCRIPT
script-index|MEDIUM_SCRIPT
```

### Verify Prompts Were Seeded

```bash
sqlite3 sparkq/data/sparkq.db "SELECT COUNT(*) FROM prompts;"
```

Expected: `33` (or more if you've added custom prompts)

### Verify via API

Start the server and check:

```bash
# Start server
./sparkq.sh start

# Check config endpoint
curl http://localhost:5005/api/config

# Check task classes
curl http://localhost:5005/api/config/task-classes

# Check tools
curl http://localhost:5005/api/config/tools
```

---

## Teardown Process

### What `./sparkq.sh teardown` Does

The teardown script:

1. **Shows what will be removed**
2. **Asks for confirmation** (unless `--force`)
3. **Creates backups** in `sparkq/scripts/teardown/backup/<timestamp>/`
4. **Removes artifacts**

### Artifacts Removed

| Artifact | Path | Backup Location |
|----------|------|-----------------|
| Database | `sparkq/data/sparkq.db*` | `backup/<ts>/sparkq/data/` |
| Config | `sparkq.yml` | `backup/<ts>/sparkq.yml` |
| Lock file | `sparkq.lock` | `backup/<ts>/sparkq.lock` |
| Logs | `sparkq/logs/` | `backup/<ts>/sparkq/logs/` |
| Venv (optional) | `.venv/` | `backup/<ts>/.venv/` |

### Teardown Modes

**Interactive (default):**
```bash
./sparkq.sh teardown
```
- Prompts for confirmation
- Asks about .venv removal separately

**Force mode:**
```bash
./sparkq.sh teardown --force
```
- No prompts
- Also removes `.venv/`
- Use for automated/CI environments

### Teardown Backups

Before removing anything, teardown creates backups:

```
sparkq/scripts/teardown/backup/
└── 20251203-143022/
    ├── sparkq/
    │   ├── data/
    │   │   └── sparkq.db
    │   └── logs/
    │       └── *.log
    ├── sparkq.yml
    └── sparkq.lock
```

**Note:** These are separate from the regular database backups in `sparkq/data/backups/`.

---

## Updating Example Files

To update the example files from your current configuration:

```bash
./sparkq/scripts/setup/setup.sh --update
```

This updates:
- `sparkq/scripts/setup/sparkq.yml.example` ← from `sparkq.yml`
- `sparkq/scripts/setup/.env.example` ← from `.env`
- `sparkq/scripts/setup/requirements.txt.example` ← from `sparkq/requirements.txt`

Useful when you've customized config and want to share the template.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PROJECT_NAME` | `sparkq-local` | Project name for DB record |
| `PROJECT_ROOT` | Script directory | Root path for relative paths |
| `SERVER_PORT` | `5005` | Server port |
| `DB_PATH` | `sparkq/data/sparkq.db` | Database file path |
| `SPARKQ_ENV` | `dev` | Environment mode (dev/prod/test) |
| `SPARKQ_CONFIG` | (none) | Override config file path |

---

## Troubleshooting

### Setup Fails: "python not found"

Ensure Python 3.11+ is installed and in PATH:
```bash
python --version
# or
python3 --version
```

### Setup Fails: pip install errors

Try upgrading pip and retrying:
```bash
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r sparkq/requirements.txt
```

### Config Not Seeding

If config table already has entries, seeding is skipped. To re-seed:
```bash
# Clear config table (backup first!)
sqlite3 sparkq/data/sparkq.db "DELETE FROM config;"

# Re-run setup
./sparkq.sh setup
```

### Tools/Task Classes Not Seeding

Same as above - tables must be empty for seeding:
```bash
sqlite3 sparkq/data/sparkq.db "DELETE FROM tools; DELETE FROM task_classes;"
./sparkq.sh setup
```

### Prompts Not Seeding

```bash
sqlite3 sparkq/data/sparkq.db "DELETE FROM prompts;"
./sparkq.sh setup
```

### Database Locked

If you get "database is locked" errors:
```bash
# Stop any running server
./sparkq.sh stop

# Check for stale processes
ps aux | grep sparkq

# Remove lock file
rm -f sparkq.lock
```

---

## Re-initialization Workflow

To completely reset and reinitialize SparkQ:

```bash
# 1. Stop server
./sparkq.sh stop

# 2. Full teardown (with backups)
./sparkq.sh teardown --force

# 3. Fresh setup
./sparkq.sh setup

# 4. Start server
./sparkq.sh start
```

Your teardown backups will be in `sparkq/scripts/teardown/backup/`.

---

## Summary: What Gets Seeded and When

| Data | Seeding Trigger | Condition |
|------|-----------------|-----------|
| Database tables | `init_db()` | Always (creates if missing) |
| Project record | Setup script | Creates/updates project |
| Config entries | `_seed_config_if_empty()` | Only if config table empty |
| Task classes | `_seed_tools_task_classes_if_empty()` | Only if both tables empty |
| Tools | `_seed_tools_task_classes_if_empty()` | Only if both tables empty |
| Prompts | `init_db()` | Only if prompts table empty |
| Agent roles | `_seed_agent_roles()` | Upserts (updates existing) |
