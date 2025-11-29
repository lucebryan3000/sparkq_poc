# SparkQ Implementation Strategy - Codex-Optimized

> **Token Optimization:** Maximize Codex (separate subscription) to minimize Claude costs
> **Budget:** Claude Max $200/mo | Codex subscription (unlimited within reason)
> **Reference:** FRD v7.5

---

## Part 1: Token Economics - Codex First Strategy

### 1.1 Model Cost Analysis

| Model | Input | Output | Blended (70/30) | Cost to User | Best For |
|-------|-------|--------|-----------------|--------------|----------|
| Codex | Subscription | Subscription | N/A | **$0** | ALL code generation, CRUD, boilerplate, tests |
| Haiku | $1/M | $5/M | $2.20/M | Tokens | Validation only (syntax checks) |
| Sonnet | $3/M | $15/M | $6.60/M | Tokens | Orchestration, complex business logic |
| Opus 4.5 | $5/M | $25/M | $11.00/M | Tokens | NOT USED (eliminated) |

**Key Insight:** Codex can handle 95% of code generation at $0 Claude token cost!

### 1.2 Revised Model Assignment Rules

| Task Type | Primary Model | Validator | Token Cost |
|-----------|---------------|-----------|------------|
| **Architecture decisions** | Sonnet | - | 3x (necessary) |
| **Orchestration/integration** | Sonnet | - | 3x (necessary) |
| **Complex business logic** | Sonnet | Haiku | 3x + 1x |
| **ALL code generation** | **Codex** | Haiku | **0 + 1x** |
| **Boilerplate/scaffolding** | **Codex** | Haiku | **0 + 1x** |
| **Type definitions** | **Codex** | Haiku | **0 + 1x** |
| **CRUD operations** | **Codex** | Haiku | **0 + 1x** |
| **CLI commands** | **Codex** | Haiku | **0 + 1x** |
| **Test generation** | **Codex** | Haiku | **0 + 1x** |
| **Documentation** | **Codex** | - | **0** |
| **Validation/syntax check** | Haiku | - | 1x |

**Rule of thumb:** If it's code, use Codex. If it requires reasoning/decisions, use Sonnet.

### 1.3 Revised Token Budget Per Phase

| Phase | Sonnet (prompts) | Haiku (validation) | Codex (code) | Claude Cost |
|-------|------------------|-------------------|--------------|-------------|
| Phase 1: Core | 10K | 20K | 400K | **~$0.11** |
| Phase 2: Worker | 8K | 15K | 300K | **~$0.09** |
| Phase 3: Server | 12K | 25K | 500K | **~$0.12** |
| Phase 4: Watcher | 5K | 10K | 100K | **~$0.05** |
| Phase 5: Polish | 8K | 20K | 200K | **~$0.09** |
| **TOTAL** | **43K** | **90K** | **1.5M** | **~$0.46** |

**Budget reality:** ~0.2% of monthly Claude budget! Massive savings vs original $2.55 estimate.

---

## Part 2: Execution Strategy

### Full Orchestration Pattern (Sonnet → Codex → Haiku)

For each phase batch:

**Step 1: Sonnet (Prompt Generation)**
- Reads phase requirements from FRD + phase prompt file
- Generates complete Codex prompts with all specifications
- Estimates Codex complexity and parallel batch groups
- Cost: 1-3K tokens per batch

**Step 2: Codex (Code Generation - Parallel)**
- Executes all independent tasks simultaneously (0 Claude cost)
- Runs 6-8 `codex exec --full-auto` commands in parallel
- Fast execution (30-90s per command)
- Cost: $0 (separate subscription)

**Step 3: Haiku (Validation)**
- Validates syntax: `python -m py_compile [files]`
- Checks imports and dependencies
- Quick spot checks on structure
- Cost: 1-3K tokens per batch

**Step 4: Sonnet (Integration)**
- If needed: combines or reviews outputs
- Updates dependencies between files
- Cost: 0-2K tokens (only if needed)

**Example - Phase 2.1 (Tool Registry + Task CRUD):**

```
SONNET GENERATES (1K tokens):
  Task 1: "Create tools.py with ToolRegistry class..."
  Task 2: "Add Task CRUD methods to storage.py..."

CODEX EXECUTES (parallel, $0 cost):
  Terminal 1: codex exec --full-auto "[Task 1 prompt]"
  Terminal 2: codex exec --full-auto "[Task 2 prompt]"

HAIKU VALIDATES (1K tokens):
  python -m py_compile sparkq/src/tools.py
  python -m py_compile sparkq/src/storage.py
```

### Why This Pattern Works

1. **Sonnet** is expensive but fast at reasoning (use sparingly for prompts)
2. **Codex** is free but dumb (needs detailed specs, no reasoning)
3. **Haiku** is cheap for quick syntax checks
4. **Parallel Codex** = maximum throughput with zero Claude cost

Cost comparison:
- Old: All Sonnet (~$3+ per phase) = expensive
- New: Minimal Sonnet + Full Codex (~$0.05 per phase) = 98% savings

---

## Part 3: Phase-by-Phase Breakdown

## Phase 1: Core Infrastructure

**Goal:** SQLite + CLI skeleton + session/stream management

### Phase 1.1: Project Scaffolding

**Execution:**
```bash
# Single Codex command handles entire scaffolding
codex exec --full-auto -C /home/luce/apps/sparkqueue "
Create SparkQ Phase 1.1 scaffolding:
1. sparkq/src/ with __init__.py
2. sparkq/requirements.txt (typer, pydantic, pyyaml)
3. sparkq/setup.sh (executable)
4. sparkq/teardown.sh (executable)
[Full spec from Phase 1 prompt]
"
```

**Models:**
- Codex: ALL scaffolding (1 command)
- Haiku: Validation (syntax check)

**Claude tokens:** ~500 (prompt generation) + 2K (validation) = **~2.5K tokens**

---

### Phase 1.2: Database Schema & Storage Layer

**Parallel Batch 1:**
```bash
# Terminal 1
codex exec --full-auto "Create sparkq/src/models.py with all Pydantic models..."

# Terminal 2
codex exec --full-auto "Create sparkq/src/storage.py with schema DDL and connection manager..."
```

**Parallel Batch 2 (after Batch 1):**
```bash
# All 4 run simultaneously
codex exec --full-auto "Add Project CRUD to storage.py..." &
codex exec --full-auto "Add Session CRUD to storage.py..." &
codex exec --full-auto "Add Stream CRUD to storage.py..." &
codex exec --full-auto "Add Task CRUD stubs to storage.py..." &
wait
```

**Models:**
- Codex: models.py + storage.py (6 commands, parallel)
- Haiku: Validation (2 files, syntax + imports)

**Claude tokens:** ~1K (prompts) + 3K (validation) = **~4K tokens**

---

### Phase 1.3: CLI Skeleton & Commands

**Sequential:**
```bash
# Sonnet writes __main__.py directly (4 lines, faster than delegation)

# Codex creates CLI skeleton
codex exec --full-auto "Create sparkq/src/cli.py with all Typer command stubs..."

# Sonnet implements setup command (business logic)
# <Sonnet writes the setup() function>
```

**Parallel Batch (session + stream commands):**
```bash
# All 6 run simultaneously
codex exec --full-auto "Implement session_create in cli.py..." &
codex exec --full-auto "Implement session_list in cli.py..." &
codex exec --full-auto "Implement session_end in cli.py..." &
codex exec --full-auto "Implement stream_create in cli.py..." &
codex exec --full-auto "Implement stream_list in cli.py..." &
codex exec --full-auto "Implement stream_end in cli.py..." &
wait
```

**Models:**
- Sonnet: __main__.py (direct) + setup command (business logic)
- Codex: CLI skeleton + 6 commands (7 commands, some parallel)
- Haiku: Validation (test `sparkq --help`)

**Claude tokens:** ~2K (Sonnet code) + 1.5K (prompts) + 3K (validation) = **~6.5K tokens**

---

### Phase 1.4: Integration Testing

**Sonnet only:**
- Run setup.sh
- Execute full workflow
- Verify database
- Manual testing

**Claude tokens:** ~2K (test coordination)

---

**Phase 1 Total Claude Cost:** ~15K tokens = **~$0.05** (vs original $0.75 estimate)

---

## Phase 2: Worker Commands

### Phase 2.1: Task Enqueue

**Parallel:**
```bash
codex exec --full-auto "Implement enqueue command in cli.py..." &
codex exec --full-auto "Create tools.py with registry loader..." &
wait
```

**Models:**
- Codex: enqueue + tools.py (2 commands, parallel)
- Haiku: Validation

**Claude tokens:** ~3K

---

### Phase 2.2: Peek and Claim

**Parallel:**
```bash
codex exec --full-auto "Implement peek command in cli.py..." &
codex exec --full-auto "Implement claim command in cli.py..." &
codex exec --full-auto "Add claim without --stream behavior..." &
wait
```

**Models:**
- Codex: 3 implementations (parallel)
- Haiku: Validation

**Claude tokens:** ~4K

---

### Phase 2.3: Complete and Fail

**Parallel:**
```bash
codex exec --full-auto "Implement complete command with result.summary validation..." &
codex exec --full-auto "Implement fail command..." &
wait
```

**Models:**
- Codex: 2 commands (parallel)
- Haiku: Validation + test result.summary enforcement

**Claude tokens:** ~4K

---

### Phase 2.4: Task Listing and Requeue

**Parallel:**
```bash
codex exec --full-auto "Implement tasks command with filters..." &
codex exec --full-auto "Implement task detail command..." &
codex exec --full-auto "Implement requeue command..." &
wait
```

**Models:**
- Codex: 3 commands (parallel)
- Haiku: Validation

**Claude tokens:** ~4K

---

### Phase 2.5: Worker Playbook (Draft)

**Model:** Codex (not Haiku!)
```bash
codex exec --full-auto "Create WORKER_PLAYBOOK.md draft version per Phase 2 spec..."
```

**Claude tokens:** ~2K

**Phase 2 Total:** ~17K tokens = **~$0.06**

---

## Phase 3: Server + API + Web UI

### Phase 3.1: FastAPI Server Setup

**Parallel:**
```bash
codex exec --full-auto "Create server.py with Uvicorn wrapper and lockfile handling..." &
codex exec --full-auto "Create api.py with FastAPI app, CORS, health endpoint..." &
wait
```

**Claude tokens:** ~3K

---

### Phase 3.2: API Endpoints

**Parallel (all 3 simultaneously):**
```bash
codex exec --full-auto "Add Session endpoints to api.py (GET/POST/PUT)..." &
codex exec --full-auto "Add Stream endpoints to api.py (GET/POST/PUT)..." &
codex exec --full-auto "Add Task endpoints to api.py (GET/POST with filters)..." &
wait
```

**Claude tokens:** ~5K

---

### Phase 3.3: CLI Run/Stop Integration

**Parallel:**
```bash
codex exec --full-auto "Implement sparkq run interactive mode..." &
codex exec --full-auto "Implement sparkq run --session mode..." &
codex exec --full-auto "Implement sparkq stop..." &
codex exec --full-auto "Implement sparkq reload..." &
wait
```

**Claude tokens:** ~5K

---

### Phase 3.4: Web UI

**Parallel (all 3 core files):**
```bash
codex exec --full-auto "Create ui/index.html with SPA shell and navigation..." &
codex exec --full-auto "Create ui/style.css with dark theme and status indicators..." &
codex exec --full-auto "Create ui/app.js with fetch wrapper, router, dashboard..." &
wait
```

**Then parallel (3 UI features):**
```bash
codex exec --full-auto "Add Sessions/Streams pages to app.js..." &
codex exec --full-auto "Add Task list/detail pages to app.js..." &
codex exec --full-auto "Add Enqueue form to app.js..." &
wait
```

**Claude tokens:** ~8K

**Phase 3 Total:** ~21K tokens = **~$0.07**

---

## Phase 4: Watcher + Playbook

### Phase 4.1: Watcher Script

**Single Codex:**
```bash
codex exec --full-auto "Create sparkq-watcher.sh with full spec from FRD 13.3..."
```

**Claude tokens:** ~3K

---

### Phase 4.2: Timeout Enforcement

**Parallel:**
```bash
codex exec --full-auto "Add stale detection to storage.py..." &
codex exec --full-auto "Add auto-fail background task to server.py..." &
codex exec --full-auto "Add stale indicators to UI..." &
wait
```

**Claude tokens:** ~4K

---

### Phase 4.3: Full Worker Playbook

**Model:** **Sonnet** (requires understanding of Claude behavior patterns)
- Comprehensive playbook needs reasoning about delegation patterns
- Worth the 3x cost for quality

**Claude tokens:** ~5K

**Phase 4 Total:** ~12K tokens = **~$0.04**

---

## Phase 5: Polish + Dogfooding

### Phase 5.1: Script Index

**Parallel:**
```bash
codex exec --full-auto "Create index.py with script scanner and metadata parser..." &
codex exec --full-auto "Add UI autocomplete for scripts..." &
wait
```

**Claude tokens:** ~4K

---

### Phase 5.2: Interactive Setup Enhancement

**Model:** Sonnet (interactive flow logic)

**Claude tokens:** ~3K

---

### Phase 5.3: Error Handling

**Parallel:**
```bash
codex exec --full-auto "Add consistent error messages to cli.py..." &
codex exec --full-auto "Add error responses to api.py..." &
codex exec --full-auto "Add error display to UI..." &
wait
```

**Claude tokens:** ~4K

---

### Phase 5.4: Documentation

**Parallel:**
```bash
codex exec --full-auto "Create README.md..." &
codex exec --full-auto "Create API.md..." &
codex exec --full-auto "Add --help text to all CLI commands..." &
wait
```

**Claude tokens:** ~3K

**Phase 5 Total:** ~14K tokens = **~$0.05**

---

## Part 4: Final Summary

### Total Token Budget (Codex-Optimized)

| Phase | Sonnet | Haiku | Codex | Claude Cost |
|-------|--------|-------|-------|-------------|
| Phase 1 | 5K | 10K | 400K | $0.05 |
| Phase 2 | 5K | 12K | 300K | $0.06 |
| Phase 3 | 8K | 13K | 500K | $0.07 |
| Phase 4 | 7K | 5K | 100K | $0.04 |
| Phase 5 | 6K | 8K | 200K | $0.05 |
| **TOTAL** | **31K** | **48K** | **1.5M** | **$0.27** |

**Savings:** $2.55 → $0.27 = **89% reduction!**

### Key Changes from Original Plan

1. **Eliminated Opus 4.5 entirely** - Sonnet can generate Codex prompts
2. **Moved ALL code generation to Codex** - was split between Haiku/Codex
3. **Reduced Haiku to validation only** - was doing code generation
4. **Sonnet only for:**
   - Prompt generation for Codex
   - Business logic (setup command, interactive flows)
   - Integration testing
   - Complex reasoning (playbook)

### Execution Pattern

```
For each phase:
1. Sonnet analyzes requirements (1-2K tokens)
2. Sonnet generates Codex prompts (1-3K tokens)
3. Launch Codex commands in parallel (0 Claude tokens)
4. Haiku validates outputs (2-5K tokens)
5. Sonnet integrates if needed (1-2K tokens)
```

### Codex Usage Notes

- Each `codex exec` command is independent
- Can run 6-8 in parallel via bash background jobs
- No token cost to Claude
- Fast execution (30-90s per command)
- Built-in validation (syntax checking)

### When NOT to use Codex

1. **Interactive setup flows** - Requires conditional logic
2. **Complex state management** - Sonnet better at reasoning
3. **Integration code** - Combining multiple components
4. **Architecture decisions** - Not code generation

---

## Part 5: Prompt Templates for Codex

### Generic Template

```bash
codex exec --full-auto -C /home/luce/apps/sparkqueue "
Context: SparkQ Phase X - [description]
Reference: FRD v7.5 Section Y

Task: [Specific task description]

Requirements:
- [Requirement 1]
- [Requirement 2]
- [Requirement 3]

File to create/modify: [path]

Specification:
[Paste exact spec from Phase prompt, lines X-Y]

Validation: Run python -m py_compile when done.
"
```

### Storage CRUD Template

```bash
codex exec --full-auto -C /home/luce/apps/sparkqueue "
Add [Entity] CRUD methods to sparkq/src/storage.py Storage class:

Methods to implement:
- create_[entity](params) -> dict: [spec]
- get_[entity](id) -> Optional[dict]: [spec]
- get_[entity]_by_name(name) -> Optional[dict]: [spec]
- list_[entities](filters) -> List[dict]: [spec]
- end_[entity](id) -> bool: [spec]

Pattern:
- Use self.connection() context manager
- Convert sqlite3.Row to dict
- ISO timestamps with now_iso()
- Return dict with all fields

Validate with: python -m py_compile sparkq/src/storage.py
"
```

### CLI Command Template

```bash
codex exec --full-auto -C /home/luce/apps/sparkqueue "
Implement [command_name] function in sparkq/src/cli.py:

Spec from Phase 1 prompt lines X-Y:
[Paste exact spec]

Pattern:
- Import Storage from .storage
- Error handling: typer.echo(\"Error: ...\", err=True) + raise typer.Exit(1)
- Success: typer.echo(\"...\")
- Use storage methods, convert to dict

Validate: python -m py_compile sparkq/src/cli.py
"
```

---

## Part 6: Implementation Checklist

### Before Starting Each Phase

- [ ] Read Phase prompt from _build/prompts-build/
- [ ] Identify all Codex-eligible tasks
- [ ] Group into parallel batches
- [ ] Sonnet generates prompts for batch
- [ ] Launch Codex commands
- [ ] Haiku validates outputs
- [ ] Sonnet integrates
- [ ] Test manually
- [ ] Commit to git

### Codex Command Pattern

```bash
# Single command
codex exec --full-auto -C /home/luce/apps/sparkqueue "[prompt]"

# Parallel batch (background jobs)
codex exec --full-auto "[prompt1]" &
codex exec --full-auto "[prompt2]" &
codex exec --full-auto "[prompt3]" &
wait

# Parallel batch (multiple terminals) - preferred for visibility
# Terminal 1: codex exec "[prompt1]"
# Terminal 2: codex exec "[prompt2]"
# Terminal 3: codex exec "[prompt3]"
```

---

**Next Steps:** Proceed with Phase 1 using this optimized Codex-first strategy!
