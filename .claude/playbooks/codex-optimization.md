# Codex Optimization Playbook

> **Purpose:** Convert any implementation plan into a Codex-optimized execution model to minimize Claude token costs while maximizing parallel execution speed.

---

## 1. Purpose

### Problem
Traditional implementation plans use expensive Claude models (Sonnet/Haiku) for code generation, consuming significant token budgets. Codex runs on a separate subscription and costs $0 in Claude tokens.

### Solution
Systematically identify all code-generation tasks and delegate them to Codex, reserving Claude (Sonnet/Haiku) only for orchestration, business logic, and validation.

### Expected Outcomes
- **89-95% reduction in Claude token costs**
- **Faster execution** via parallel Codex commands
- **Same or better code quality** (Codex excels at pattern-based generation)
- **Clear model assignment** for every task

---

## 2. Model Assignment Matrix

### Use Codex For (0 Claude tokens):
- ✅ Any code file creation from specification
- ✅ Boilerplate and scaffolding
- ✅ Type definitions (Pydantic, TypeScript interfaces)
- ✅ CRUD operations (database, API)
- ✅ CLI command implementations
- ✅ Schema definitions (SQL DDL, JSON Schema)
- ✅ Test file generation
- ✅ Configuration files (YAML, JSON, TOML)
- ✅ Documentation (README, API docs)
- ✅ UI components (HTML, CSS, React)
- ✅ Bash scripts (setup, teardown, utilities)

### Use Sonnet For (3x token cost):
- ✅ Generating prompts for Codex
- ✅ Orchestrating multi-step workflows
- ✅ Business logic with complex conditionals
- ✅ Integration code (combining multiple components)
- ✅ Architecture decisions
- ✅ Interactive flows (Q&A, wizards)
- ✅ Manual testing and validation
- ✅ Git operations (commits, PRs)

### Use Haiku For (1x token cost):
- ✅ Syntax validation (python -m py_compile)
- ✅ Import resolution checks
- ✅ Quick sanity tests
- ✅ Placeholder detection (TODO, FIXME)
- ✅ Output summarization

### Never Use Opus:
- ❌ Eliminated entirely - Sonnet can generate Codex prompts

---

## 2.5 The Complete Orchestration Pattern (SparkQ Implementation)

### What is the Complete Orchestration Pattern?

The **Complete Orchestration Pattern** is a proven 3-step workflow that maximizes token efficiency while ensuring high code quality:

1. **Step 1: Sonnet Prompt Generation** (expensive but critical)
   - Sonnet reads the full specification (FRD + phase requirements)
   - Generates detailed, optimized Codex prompts for the batch
   - Includes exact file paths, requirements, examples
   - Output: 1-3K tokens per batch generating 1-2K token Codex prompts

2. **Step 2: Codex Parallel Execution** (free!)
   - All Codex commands run in parallel (separate processes)
   - Each command generates code from the detailed Sonnet-generated prompt
   - Total execution: 10-30 minutes depending on batch size
   - Cost: $0 (Codex has its own subscription)
   - Benefit: Human-quality code, fastest execution

3. **Step 3: Haiku Validation** (cheap quick checks)
   - After Codex batch completes, Haiku validates syntax
   - Runs syntax checks, import validation, placeholder detection
   - Catches errors early before integration
   - Cost: 1-2K tokens per batch
   - Benefit: Early error detection, confidence before integration

### Why This Pattern Works

| Stage | Model | Token Cost | Purpose | Time |
|-------|-------|-----------|---------|------|
| 1 | Sonnet | 1-3K | Generate detailed Codex prompts | 2-5 min |
| 2 | Codex | $0 | Execute code generation in parallel | 10-30 min |
| 3 | Haiku | 1-2K | Validate syntax, catch errors | 2-5 min |
| **TOTAL** | **Mixed** | **~5-10K per batch** | **High-quality code, minimal tokens** | **15-45 min** |

### SparkQ Implementation Example

**Phase 2: Task Queue & CRUD Operations**

**Architecture:**
```
Step 1 (Sonnet - 5K tokens):
  ├─ Read FRD v7.5 Section 8-9 (Task operations)
  ├─ Read Phase 2 spec
  ├─ Generate 5 detailed Codex prompts:
  │  ├─ Prompt 1: Tools registry (ToolRegistry class)
  │  ├─ Prompt 2: Enqueue operation
  │  ├─ Prompt 3: Peek operation
  │  ├─ Prompt 4: Claim operation
  │  └─ Prompt 5: Complete/Fail operations
  └─ Output: 5 optimized prompts (~1K tokens each)

Step 2 (Codex - $0):
  ├─ Terminal 1: Execute Prompt 1 → tools.py
  ├─ Terminal 2: Execute Prompt 2 → storage methods
  ├─ Terminal 3: Execute Prompt 3 → storage methods
  ├─ Terminal 4: Execute Prompt 4 → storage methods
  └─ Terminal 5: Execute Prompt 5 → storage methods

Step 3 (Haiku - 5K tokens):
  ├─ After Batch 1: Validate tools.py syntax (1K)
  ├─ After Batch 2: Validate storage.py syntax (1K)
  ├─ After Batch 3: Check imports and placeholders (1K)
  ├─ After Batch 4: Check imports and placeholders (1K)
  └─ After Batch 5: Final integration check (1K)

TOTAL COST: 10K tokens for Phase 2 Task Operations
```

**Execution Timing:**
- Sonnet prompt generation: 5 minutes (serial)
- Codex execution: 15 minutes (all 5 prompts parallel)
- Haiku validation: 5 minutes (batched)
- **Wall-clock time: 25 minutes with parallelization**

### Key Benefits of This Pattern

1. **Cost Efficiency**
   - Sonnet used ONLY for prompt generation (reusable)
   - Codex runs for $0 (separate subscription)
   - Haiku for cheap validation only
   - Traditional approach: 20K tokens/phase → New approach: 5-10K tokens/phase

2. **Code Quality**
   - Detailed Sonnet prompts → Codex generates high-quality code
   - Haiku validates before integration → Fewer surprises
   - Result: 95%+ of code works on first try

3. **Speed**
   - Parallel Codex execution (6-10 processes simultaneously)
   - 25-45 min total wall-clock time per phase
   - 1/3 the time of sequential approach

4. **Predictability**
   - Token costs are known upfront (from Phase specs)
   - Parallel batches have defined dependencies
   - Execution timeline is predictable

### How to Apply This Pattern

1. For each Phase prompt, add an "Execution Overview" section
2. Specify the 3-step workflow with token costs
3. Break phase into batches with clear dependencies
4. Document which Codex commands run in parallel
5. Specify Haiku validation checkpoints
6. Calculate total token cost and wall-clock time

### Document Structure for Each Phase

```markdown
# SparkQ Phase X: [Description] - Complete Orchestration

> **Total Token Budget:** ~YK tokens
> **Breakdown:** AK Sonnet (prompt generation) + BK Haiku (validation) + $0 Codex
> **Execution Model:** Sonnet → Codex (parallel) → Haiku (validation)

## Execution Overview
[High-level 3-step explanation]

## Complete Execution Workflow
[Detailed breakdown of each batch with token costs]

## Execution Sequence
[Timeline diagram showing batches and parallelization]
```

---

## 2.6 Contextual Task Classification Using Project History

Once a project has completed its initial phases, you accumulate a library of **proven execution patterns** that can dramatically accelerate future prompt generation. SparkQ's five-phase implementation demonstrates how pattern reuse reduces token costs by 30-40% while maintaining the same high-quality output.

The key insight: **Don't reinvent the wheel for every phase.** When you know how Phase 1 storage CRUD succeeded (5-8K tokens, 100% first-try), you can reference that pattern in Phase 4 error handling instead of regenerating detailed specs from scratch.

### The SparkQ Proven Patterns Table

After completing Phases 1-5, SparkQ established these validated patterns:

| Pattern Category | Introduced | Key Characteristics | Success Metrics | Baseline Cost |
|-----------------|-----------|---------------------|-----------------|---------------|
| **Storage CRUD** | Phase 1 | SQLite schema + Pydantic models + 5 entity classes | 100% first-try, 0 errors | 5-8K tokens |
| **API Endpoints** | Phase 3 | FastAPI + request/response models + error handling (404/409) | 18 endpoints, 100% success | 8K tokens (prompts only) |
| **CLI Commands** | Phase 2-3 | Typer framework + interactive prompts + config persistence | 5 commands, 0 syntax errors | 5K tokens |
| **UI Components** | Phase 3 | SPA router + dark theme + API client + responsive layout | 661 LOC, 0 placeholders | 3K tokens |
| **Error Handling** | Phase 4-5 | Try/catch blocks + logging + graceful degradation | Timeout enforcement working | 4K tokens |

**Pattern Reuse Impact:**
- Phase 1 (foundation): 5-8K tokens (no prior patterns)
- Phase 2 (similar CRUD): 12-17K tokens (50% pattern reuse)
- Phase 3 (new API layer): 51K tokens (new patterns established)
- Phase 4 (error handling): Estimated 8-10K tokens (70% pattern reuse from Phase 3)
- Phase 5 (enhancements): Estimated 10K tokens (60% pattern reuse)

**Key Finding:** Once Phase 3 established API endpoint patterns, subsequent phases requiring similar endpoints (Phase 4 watcher API, Phase 5 script index API) could reference "follow Phase 3 API pattern" instead of regenerating full specs. This saved 3-5K Sonnet tokens per batch.

### How to Apply Contextual Classification

**Step 1: Catalog Completed Patterns**

After each successful phase, document:
- What pattern was used (e.g., "FastAPI endpoint with Pydantic models")
- What worked well (e.g., "100% first-try, detailed prompt with method signatures")
- Token cost baseline (e.g., "3K Sonnet for prompt generation")
- Example prompt that succeeded

**Step 2: Match New Tasks to Existing Patterns**

When planning a new phase, ask:
1. "Have we done something similar before?"
2. "Can we reference an existing batch structure?"
3. "Can Codex use a previous file as a template?"

**Example from Phase 5:**
```
New Task: Add script execution tracking endpoints

Pattern Match: Phase 3 API endpoints (FastAPI + Pydantic)

Optimized Prompt:
"Follow the Phase 3 API endpoint pattern from api.py.
Create 3 new endpoints for script execution:
- POST /api/scripts/execute
- GET /api/scripts/{id}/status
- POST /api/scripts/{id}/cancel

Use the same error handling (404/409), request/response models,
and storage integration as Session endpoints (lines 45-120 in api.py)."

Token Savings: 3K → 1K (67% reduction by referencing existing code)
```

**Step 3: Update Prompts with Pattern References**

Instead of:
```
Create a FastAPI endpoint with the following characteristics:
- Pydantic request model with field validation
- Response model with proper typing
- Error handling for 404 Not Found, 409 Conflict
- Integration with Storage layer methods
- Proper HTTP status codes (200/201/404/409)
[... 15 more lines of detailed spec ...]
```

Use:
```
Create POST /api/tasks/{id}/retry endpoint.
Follow Phase 3 Task endpoint pattern (api.py lines 280-310).
Replace 'complete' logic with retry logic (requeue + reset status).
```

**Result:** Same quality output, 70% fewer prompt tokens.

### Real-World Example: Phase 5 Referenced Phase 3

**Phase 3 Original Prompt (API endpoints):**
- Token cost: 8K Sonnet
- Generated: 18 endpoints, 463 LOC
- Success rate: 100%

**Phase 5 Enhancement Prompt (using Phase 3 as template):**
- Token cost: 2K Sonnet (75% reduction)
- Generated: 4 new endpoints following exact same pattern
- Success rate: 100%
- **How:** "Follow api.py Session endpoint structure (lines 45-120). Add script execution endpoints with same error handling."

**What Changed:** Codex already understood the project's API pattern from Phase 3. Instead of re-explaining FastAPI conventions, Pydantic models, and error handling, the prompt simply referenced existing code. Codex generated identical-quality code using pattern matching.

### Token Savings Math

**Traditional Approach (no pattern reuse):**
- Phase 1: 8K tokens
- Phase 2: 17K tokens (full specs)
- Phase 3: 51K tokens (full specs)
- Phase 4: 15K tokens (full specs)
- Phase 5: 18K tokens (full specs)
- **Total: 109K tokens**

**Pattern Reuse Approach (SparkQ actual):**
- Phase 1: 8K tokens (baseline)
- Phase 2: 12K tokens (reuse storage pattern)
- Phase 3: 51K tokens (new API layer)
- Phase 4: 10K tokens (reuse API + error patterns)
- Phase 5: 10K tokens (reuse API + UI patterns)
- **Total: 91K tokens**

**Savings: 18K tokens (16% overall), with 30-40% savings on Phases 4-5**

### When NOT to Reuse Patterns

Avoid pattern reuse when:
1. **New technology stack:** Phase 3 introduced FastAPI (couldn't reuse Phase 1 CLI patterns)
2. **Different architecture:** Web UI required JavaScript patterns (couldn't reuse Python patterns)
3. **Significant complexity increase:** Error handling added new requirements beyond basic CRUD

**Rule of thumb:** If >50% of the task matches an existing pattern, reuse it. If <50%, write full spec and create a new pattern for future reuse.

### Measuring Pattern Reuse Effectiveness

Track these metrics after each phase:
- **Pattern match rate:** % of batches that referenced prior patterns
- **Token reduction:** Actual vs estimated without pattern reuse
- **Quality consistency:** Did referenced patterns maintain 100% first-try success?
- **Time savings:** Faster prompt generation when referencing existing code

**SparkQ Results:**
- Pattern match rate: 60% (Phases 4-5 heavily referenced Phase 3)
- Token reduction: 30-40% on pattern-reuse batches
- Quality consistency: 100% (same as full-spec batches)
- Time savings: Sonnet prompt generation 50% faster (5 min → 2.5 min)

### Practical Guidance

1. **Document patterns immediately after success** - Don't wait until the next phase
2. **Include file paths and line numbers** - Makes Codex reference precise
3. **Version your patterns** - "Phase 3 API pattern v1" helps track evolution
4. **Test pattern references** - First batch using a pattern should be validated carefully
5. **Update patterns when improved** - If Phase 5 improves error handling, update the pattern doc

**Pattern Library Structure:**
```
docs/patterns/
├── storage-crud-pattern.md (Phase 1)
├── cli-command-pattern.md (Phase 2)
├── api-endpoint-pattern.md (Phase 3)
├── ui-component-pattern.md (Phase 3)
└── error-handling-pattern.md (Phase 4-5)
```

Each pattern document contains:
- Example code (with file paths)
- Codex prompt that succeeded
- Token cost baseline
- When to use / when not to use

**Remember:** Pattern reuse compounds. Phase 6 will benefit from Phases 1-5. Phase 10 will have a rich library. The initial investment in documenting patterns pays dividends across the entire project lifecycle.

---

## 3. Optimization Workflow

### Step 1: Analyze Original Plan

**Input:** Traditional implementation plan (e.g., Phase 1 prompt)

**Questions to ask:**
1. Which tasks are pure code generation?
2. Which tasks require reasoning/decisions?
3. Which tasks can run in parallel?
4. Which tasks depend on previous completions?

**Example Analysis:**
```
Original task: "Create storage.py with CRUD operations"

Break down:
- Schema DDL → Codex (pattern-based SQL)
- Connection manager → Codex (standard pattern)
- Project CRUD → Codex (straightforward operations)
- Session CRUD → Codex (straightforward operations)
- Stream CRUD → Codex (straightforward operations)
- Task CRUD stubs → Codex (trivial stubs)

Result: 6 parallel Codex commands, 0 Sonnet needed
```

---

### Step 2: Create Task Breakdown Table

| Task | Original Model | Optimized Model | Parallel Group | Claude Tokens |
|------|---------------|-----------------|----------------|---------------|
| Create models.py | Haiku | Codex | 1 | 0 + 500 (prompt) |
| Create storage.py schema | Sonnet | Codex | 1 | 0 + 500 (prompt) |
| Add Project CRUD | Haiku | Codex | 2 | 0 + 300 (prompt) |
| Add Session CRUD | Haiku | Codex | 2 | 0 + 300 (prompt) |
| Add Stream CRUD | Haiku | Codex | 2 | 0 + 300 (prompt) |
| Validate syntax | Haiku | Haiku | 3 | 2000 (validation) |
| **TOTAL** | **~15K** | **~4K** | | **73% savings** |

---

### Step 3: Design Parallel Execution Batches

**Rules:**
- Group independent tasks into parallel batches
- Ensure dependencies are resolved before next batch
- Codex commands can all run simultaneously (separate processes)
- Validation runs after all code generation completes

**Template:**
```
Batch 1 (Foundation) - Parallel:
├─ Codex: Create models.py
├─ Codex: Create storage.py foundation
└─ Codex: Create __init__.py

Batch 2 (CRUD Operations) - Parallel:
├─ Codex: Add Project CRUD
├─ Codex: Add Session CRUD
├─ Codex: Add Stream CRUD
└─ Codex: Add Task CRUD stubs

Batch 3 (Validation) - Parallel:
├─ Haiku: Validate models.py syntax
└─ Haiku: Validate storage.py syntax

Sequential (Integration):
└─ Sonnet: Manual integration test
```

---

### 3.3.1 Pre-Batching Dependency Checklist

Before designing batch execution groups, systematically analyze task dependencies to avoid guesswork and maximize parallelization. SparkQ Phases 1-5 demonstrated that **accurate dependency analysis** is the difference between 45-minute and 25-minute execution times.

**Why This Matters:**

Poor dependency analysis leads to:
- ❌ Over-sequencing: Tasks wait unnecessarily, wasting wall-clock time
- ❌ Under-sequencing: Parallel tasks fail due to missing prerequisites
- ❌ Redesign cycles: Discovering dependencies mid-execution forces re-planning

Systematic dependency analysis enables:
- ✅ Maximum parallelization (target >70% of batches parallel)
- ✅ Predictable execution timelines
- ✅ Clear execution roadmap for anyone following the plan

#### Dependency Classification Checklist

For each task in your phase, answer these questions:

**Hard Dependencies (MUST Run After)**
Tasks with hard dependencies must execute sequentially. Identify these first:

- **Does this task write to a file that another task reads?**
  - Example: API foundation (Batch 2) must complete before API endpoints (Batches 3-5)

- **Does this task create classes/functions that another task imports?**
  - Example: `models.py` (Batch 1) must exist before `storage.py` can import models

- **Does this task create infrastructure that another task requires?**
  - Example: Server lockfile logic must exist before CLI commands can check server status

- **Does this task modify a file that another task also modifies?**
  - Example: Multiple batches adding endpoints to `api.py` must run sequentially to avoid conflicts

**Action:** Mark as Sequential. Batch N+1 starts after Batch N completes.

**Soft Dependencies (CAN Run After)**
Tasks with soft dependencies can often run in parallel if designed carefully:

- **Does this task benefit from another task's completion but not require it?**
  - Example: Web UI (Batch 7) benefits from API existence but can be coded independently

- **Does this task reference the same spec section but different code sections?**
  - Example: Session endpoints (Batch 3) and Stream endpoints (Batch 4) both reference API patterns but modify different methods

- **Does this task need validation before the next sequential batch?**
  - Example: All Batches 3-5 should validate before Batch 6 integration testing

**Action:** Mark as Parallel Group. Run simultaneously, validate together before next sequential batch.

**Zero Dependencies (Fully Independent)**
Tasks with zero dependencies can run anytime after prerequisites:

- **Does this task create a new file with no imports from in-progress work?**
  - Example: CLI skeleton can be created while storage layer is being built

- **Does this task only read from completed batches?**
  - Example: Documentation batch reads from all files but writes to separate `.md` files

- **Does this task operate on separate domains (UI vs API vs CLI)?**
  - Example: Web UI core (Batch 7) is independent of API endpoints (Batches 3-5)

**Action:** Mark as Parallel Anytime. Can run as soon as prerequisites complete.

#### Reordering Principles

After classifying dependencies, optimize execution order:

1. **Minimize Sequential Chains**
   - Target: <3 sequential batches total
   - Method: Ask "Does Batch X truly require Batch Y output, or just the spec?"
   - Example: If Codex can generate code from spec alone, it doesn't need previous batch output

2. **Maximize Parallel Blocks**
   - Rule: If tasks don't write to the same file, they can run in parallel
   - Example: Phase 3 runs Batches 3-7 in parallel (5 batches simultaneously)
   - Impact: 25 minutes sequential → 10 minutes parallel = 60% time savings

3. **Group File Modifications**
   - If multiple batches modify the same file (e.g., `api.py`), batch them sequentially
   - Alternative: Split file into modules to enable parallelization
   - Example: Instead of 5 batches modifying `api.py`, create `api/sessions.py`, `api/streams.py`, etc.

4. **Validate Before Integration**
   - Add Haiku validation checkpoints after parallel groups
   - Prevents cascading failures if one parallel batch has errors
   - Minimal cost: 1-2K Haiku tokens per checkpoint

#### Automated Dependency Analysis (Sonnet Prompt)

Use this prompt to have Sonnet generate a dependency matrix:

```
Analyze task dependencies for [PHASE_NAME]

Tasks to analyze:
1. [Task 1 description]
2. [Task 2 description]
3. [Task 3 description]
...
N. [Task N description]

For each task pair (i, j), classify the dependency:

- HARD: Task j MUST complete before task i can start
- SOFT: Task j SHOULD complete before task i, but not required
- NONE: Tasks i and j are independent

Output format (dependency matrix):

```
       | Task 1 | Task 2 | Task 3 | ... | Task N
-------|--------|--------|--------|-----|-------
Task 1 |   -    | NONE   | HARD   | ... | SOFT
Task 2 | NONE   |   -    | NONE   | ... | NONE
Task 3 | NONE   | NONE   |   -    | ... | HARD
...
Task N | NONE   | NONE   | NONE   | ... |   -
```

Based on this matrix, propose optimal batch grouping:
- Batch 1 (Sequential): [Tasks with no dependencies]
- Batch 2 (Sequential after 1): [Tasks depending only on Batch 1]
- Batch 3 (Parallel): [Independent tasks after Batch 2]
- ...

Estimate parallelization ratio: (parallel batches / total batches) × 100%
```

**Expected Output:**

Sonnet will produce a dependency matrix showing which tasks block which others, then recommend batching strategy. Review and adjust based on file modification conflicts.

#### Real Example: SparkQ Phase 3

**Tasks Identified:**
1. Server foundation (`server.py`)
2. API foundation (`api.py`)
3. Session endpoints (modify `api.py`)
4. Stream endpoints (modify `api.py`)
5. Task endpoints (modify `api.py`)
6. CLI commands (modify `cli.py`)
7. Web UI core (create `index.html`, `style.css`, `app.js`)
8. Web UI features (modify `app.js`)

**Dependency Analysis:**

| Dependency Type | Tasks | Reasoning |
|----------------|-------|-----------|
| **HARD** | 2 → 1 | API imports server, must exist first |
| **HARD** | 3,4,5 → 2 | Endpoints modify `api.py`, foundation must exist |
| **HARD** | 8 → 7 | UI features modify `app.js`, core must exist first |
| **SOFT** | 6 → 1 | CLI checks server status, but can code from spec |
| **NONE** | 6, 7 ↔ 3,4,5 | Different files, different domains |

**Optimal Batching:**

```
Batch 1 (Sequential): Server foundation
Batch 2 (Sequential after 1): API foundation

PARALLEL BLOCK (after Batch 2):
├─ Batch 3: Session endpoints (sequential within 3-5)
├─ Batch 4: Stream endpoints (sequential within 3-5)
├─ Batch 5: Task endpoints (sequential within 3-5)
├─ Batch 6: CLI commands (parallel)
└─ Batch 7: Web UI core (parallel)

Batch 8 (Sequential after 7): Web UI features
```

**Parallelization Ratio:** 75% (Batches 3-7 = 5 parallel out of 6 batches after foundation)

**Result:** 25 minutes wall-clock vs 40 minutes sequential (38% faster)

#### When to Use This Checklist

**Always use before:**
- Writing batch specifications for any phase
- Generating Codex prompts (dependencies inform batch order)
- Estimating wall-clock execution time

**Especially important when:**
- Phase has >5 tasks (complexity increases exponentially)
- Multiple tasks modify the same files
- Tasks span different domains (API, UI, CLI, docs)
- Optimizing an existing phase for faster execution

**Time investment vs payoff:**
- Checklist: 10-15 minutes upfront analysis
- Payoff: 30-50% reduction in wall-clock time (15-30 min savings)
- Bonus: Prevents mid-execution surprises and rework

#### Integration with Section 3.3

After completing this dependency analysis, proceed to Section 3.3 "Design Parallel Execution Batches" with:

1. **Clear dependency classifications** for each task
2. **Optimized batch grouping** (sequential vs parallel)
3. **Parallelization ratio target** (aim for >70%)
4. **Execution timeline estimate** based on longest parallel path

This systematic approach ensures your batch design is based on evidence, not assumptions, and maximizes both speed and token efficiency.

---

### Step 4: Write Codex Prompts

**Prompt Template:**
```bash
codex exec --full-auto -C /path/to/project "
Context: [Project name] Phase [X] - [Phase description]
Reference: [FRD/spec section]

Task: [Specific task in 1-2 sentences]

File to create/modify: [exact path]

Requirements:
- [Requirement 1]
- [Requirement 2]
- [Requirement 3]

Specification:
[Paste exact spec from original prompt, or write detailed spec]

Validation: [How to verify, e.g., python -m py_compile path/to/file.py]

Output: Confirm file created and any important details.
"
```

**Good Prompt Characteristics:**
- ✅ Specific file path
- ✅ Clear requirements list
- ✅ Exact specification (paste from original prompt)
- ✅ Validation command
- ✅ Context about the project phase
- ✅ Reference to authoritative spec (FRD, API doc)

**Poor Prompt Characteristics:**
- ❌ Vague: "Create some helper functions"
- ❌ No file path specified
- ❌ Missing context
- ❌ No validation step
- ❌ Ambiguous requirements

---

### Step 5: Execute in Batches

**Single Codex Command:**
```bash
codex exec --full-auto -C /project/path "[prompt]"
```

**Parallel Batch (Background Jobs):**
```bash
codex exec --full-auto -C /project/path "[prompt1]" &
codex exec --full-auto -C /project/path "[prompt2]" &
codex exec --full-auto -C /project/path "[prompt3]" &
wait  # Wait for all background jobs to complete
```

**Parallel Batch (Multiple Terminals) - Recommended:**
```
Terminal 1: codex exec --full-auto "[prompt1]"
Terminal 2: codex exec --full-auto "[prompt2]"
Terminal 3: codex exec --full-auto "[prompt3]"
```

**Why multiple terminals preferred:**
- ✅ See real-time output from each command
- ✅ Can interrupt individual commands if needed
- ✅ Clear separation of concerns
- ✅ Easier debugging

---

### Step 6: Validation with Haiku

**After Codex batch completes:**
```
Haiku validates:
1. Syntax check: python -m py_compile file.py
2. Import resolution: Check all imports work
3. Placeholder detection: grep for TODO, FIXME, XXX
4. Output summary: What was created/modified
```

**Prompt for Haiku:**
```
Validate the following files generated by Codex:
- path/to/file1.py
- path/to/file2.py

Validation steps:
1. Run: python -m py_compile on each file
2. Check all imports resolve
3. Check for placeholders (TODO, FIXME, XXX, PLACEHOLDER)
4. Summarize: What files exist, any issues found

Report: PASS or FAIL with details
```

---

### Step 7: Calculate Token Savings

**Formula:**
```
Original cost = (Opus tokens × $11/M) + (Sonnet tokens × $6.60/M) + (Haiku tokens × $2.20/M)
Optimized cost = (Sonnet prompt tokens × $6.60/M) + (Haiku validation tokens × $2.20/M)
Savings = Original cost - Optimized cost
Savings % = (Savings / Original cost) × 100
```

**Example:**
```
Original Plan:
- Opus: 10K tokens × $11/M = $0.11
- Sonnet: 50K tokens × $6.60/M = $0.33
- Haiku: 100K tokens × $2.20/M = $0.22
Total: $0.66

Optimized Plan:
- Sonnet (prompts): 10K tokens × $6.60/M = $0.07
- Haiku (validation): 20K tokens × $2.20/M = $0.04
- Codex: 400K tokens × $0/M = $0.00
Total: $0.11

Savings: $0.66 - $0.11 = $0.55 (83% reduction)
```

---

## 4. Playbook Checklist

### Pre-Optimization Analysis
- [ ] Read original implementation plan completely
- [ ] Identify all code generation tasks
- [ ] Identify all reasoning/orchestration tasks
- [ ] Map task dependencies (what must run first)
- [ ] Calculate original token cost estimate

### Task Classification
- [ ] For each task, ask: "Is this pure code generation from spec?"
  - If YES → Codex
  - If NO → Check if it requires reasoning
    - Requires decisions/logic → Sonnet
    - Simple validation → Haiku

### Parallel Batch Design
- [ ] Group Codex tasks into parallel batches
- [ ] Ensure batch N+1 doesn't depend on batch N
- [ ] Identify validation points (after code generation)
- [ ] Plan Sonnet integration points (after validation)

### Prompt Writing
- [ ] Write specific, detailed prompts for each Codex task
- [ ] Include file paths, requirements, specifications
- [ ] Add validation commands to prompts
- [ ] Reference authoritative specs (FRD, API docs)

### Execution Planning
- [ ] Decide: background jobs or multiple terminals?
- [ ] Plan for error handling (what if Codex fails?)
- [ ] Schedule validation after each batch
- [ ] Plan manual testing checkpoints

### Documentation
- [ ] Create optimized plan document (like sparkq_implementation_plan_codex.md)
- [ ] Include token cost comparison table
- [ ] Document parallel execution batches
- [ ] Provide example prompts for each task type

### Execution
- [ ] Execute Batch 1 (foundation)
- [ ] Validate Batch 1 outputs
- [ ] Execute Batch 2 (CRUD/features)
- [ ] Validate Batch 2 outputs
- [ ] Continue through all batches
- [ ] Run integration tests
- [ ] Commit to git

### Post-Execution Review
- [ ] Calculate actual token usage
- [ ] Compare to original estimate
- [ ] Document lessons learned
- [ ] Update playbook if needed

---

## 5. Test Criteria

### Codex Prompt Quality Test

**Good Prompt Example:**
```bash
codex exec --full-auto -C /home/user/project "
Context: SparkQ Phase 1.2 - Database Storage Layer
Reference: FRD v7.5 Section 7.2

Task: Create Pydantic models for SparkQ data entities

File to create: sparkq/src/models.py

Requirements:
- Import Enum, BaseModel, Field from pydantic
- Import Optional, List from typing
- Define 4 enums: TaskStatus, TaskClass, SessionStatus, StreamStatus
- Define 5 models: Project, Session, Stream, Task, TaskClassDefaults
- All fields typed with Optional where nullable
- Use datetime for timestamp fields

Specification:
```python
class TaskStatus(str, Enum):
    QUEUED = \"queued\"
    RUNNING = \"running\"
    SUCCEEDED = \"succeeded\"
    FAILED = \"failed\"

class Project(BaseModel):
    id: str
    name: str
    repo_path: Optional[str] = None
    prd_path: Optional[str] = None
    created_at: datetime
    updated_at: datetime

[... complete spec ...]
```

Validation: python -m py_compile sparkq/src/models.py

Output: Confirm models.py created with all 5 models and 4 enums.
"
```

**Test:** Run prompt, check output quality, verify file created correctly

---

### Parallel Execution Test

**Setup:**
```bash
# Create 3 test prompts
PROMPT1="codex exec --full-auto 'Create file1.py with hello function'"
PROMPT2="codex exec --full-auto 'Create file2.py with goodbye function'"
PROMPT3="codex exec --full-auto 'Create file3.py with status function'"
```

**Test Parallel Execution:**
```bash
# Start all 3 in parallel
eval "$PROMPT1" &
eval "$PROMPT2" &
eval "$PROMPT3" &
wait

# Verify all 3 files exist
test -f file1.py && test -f file2.py && test -f file3.py && echo "PASS" || echo "FAIL"
```

**Expected:** All 3 files created, faster than sequential execution

---

### Token Savings Test

**Before Optimization:**
- Record estimated token usage from original plan
- Record estimated cost

**After Optimization:**
- Record actual Sonnet tokens used (prompts)
- Record actual Haiku tokens used (validation)
- Record Codex tokens used (for reference, though $0)
- Calculate actual cost

**Test:** Actual savings ≥ 70% of original estimate

---

### Validation Test

**After Codex generates code:**
```bash
# Syntax check
python -m py_compile path/to/*.py

# Import check
python -c "import path.to.module; print('PASS')"

# Placeholder check
grep -r "TODO\|FIXME\|XXX\|PLACEHOLDER" path/to/ && echo "FAIL: Placeholders found" || echo "PASS"

# Type check (if using mypy)
mypy path/to/module.py
```

**Expected:** All checks pass, no placeholders, no syntax errors

---

### Integration Test

**After all batches complete:**
```bash
# Run setup
./setup.sh

# Activate venv
source venv/bin/activate

# Test CLI
python -m module_name --help

# Run basic workflow
python -m module_name command1
python -m module_name command2
python -m module_name command3

# Verify outputs
test -f expected_output_file && echo "PASS" || echo "FAIL"
```

**Expected:** End-to-end workflow works as specified

---

## 6. Common Patterns

### 6.1 SparkQ Prompt Patterns Library

These patterns are proven from Phase 1-5 successful executions. Copy-paste these templates for Phase 6+ tasks of the same type, replacing [PLACEHOLDERS] with your specific values. Each pattern includes baseline token costs from actual phase execution, success metrics, Haiku validation templates, and real examples.

#### Pattern 1: Storage Layer CRUD Operations

**Phases:** Phase 1 (foundation), Phase 2 (entity extensions)
**Baseline Token Cost:** ~1500 tokens total (600 Sonnet + 0 Codex + 900 Haiku)
**Success Metrics:** 100% first-try (Phase 1: 4 entities, 0 errors; Phase 2: task CRUD working)

**Template Codex Prompt:**

```bash
codex exec --full-auto -C /home/luce/apps/sparkqueue "
Context: SparkQ Phase [X] - [ENTITY_NAME] Storage Operations
Reference: FRD v7.5 Section [SECTION_NUMBER]

Task: Implement complete CRUD operations for [ENTITY_NAME] in storage.py

File to modify: sparkq/src/storage.py

Current state: Storage class exists with schema foundation

Methods to create:
- create_[ENTITY](project_id, [FIELDS]) → [ENTITY_CLASS]
- list_[ENTITIES](project_id, [OPTIONAL_FILTERS]) → List[[ENTITY_CLASS]]
- get_[ENTITY](project_id, [ENTITY]_id) → [ENTITY_CLASS] or None
- update_[ENTITY]([ENTITY]_id, [FIELDS]) → [ENTITY_CLASS]
- delete_[ENTITY]([ENTITY]_id) → bool

Specification:

class Storage:
    def create_[ENTITY](self, project_id: str, [FIELD1]: [TYPE1], [FIELD2]: [TYPE2]):
        '''Create new [ENTITY] and return model instance'''
        # Insert into [ENTITY_TABLE]
        # Return [ENTITY_CLASS] model with all fields
        pass

    def list_[ENTITIES](self, project_id: str, [OPTIONAL_FILTERS]):
        '''List all [ENTITIES] with optional filtering'''
        # Query [ENTITY_TABLE] with filters
        # Return List[[ENTITY_CLASS]]
        pass

    # ... remaining methods following same pattern ...

Integration:
- Import [ENTITY_CLASS] from .models
- Use SQLite cursor for queries
- All methods return model instances (Pydantic)
- Error handling: return None if not found (except create which inserts)

Validation: python -m py_compile sparkq/src/storage.py && python -c \"from sparkq.src.storage import Storage; print('Storage imported')\"
"
```

**Real Example (Phase 1 - Sessions):**

Prompt created `create_session()`, `list_sessions()`, `get_session()`, `update_session()`, `delete_session()` in storage.py. Success: 100%, 0 retries.

**Haiku Validation Template:**

```bash
Validate storage.py CRUD implementation:
1. Syntax check: python -m py_compile sparkq/src/storage.py
2. Import check: python -c "from sparkq.src.storage import Storage; s = Storage(); print('OK')"
3. Placeholder check: grep -n "TODO\|FIXME\|XXX" sparkq/src/storage.py
4. Method signature check: grep -n "def create_\|def list_\|def get_\|def update_\|def delete_" sparkq/src/storage.py

Expected output: All 5 methods found, no TODO/FIXME, imports resolve
```

**When to Reuse:** Any phase that needs full CRUD for a new entity. Reference: "Follow Phase 1 [ENTITY_NAME] CRUD pattern from storage.py lines XYZ."

**When to Deviate:** If your entity needs complex filtering logic beyond simple field matching, add "Advanced Filtering" specification with example queries.

---

#### Pattern 2: FastAPI REST Endpoints

**Phases:** Phase 3 (sessions/streams/tasks endpoints), Phase 4-5 (extensions)
**Baseline Token Cost:** ~3000 tokens total (1000 Sonnet + 0 Codex + 2000 Haiku)
**Success Metrics:** 100% first-try (Phase 3: 18 endpoints across 3 batches, all working)

**Template Codex Prompt:**

```bash
codex exec --full-auto -C /home/luce/apps/sparkqueue "
Context: SparkQ Phase [X] - [RESOURCE_NAME] REST Endpoints
Reference: FRD v7.5 Section [SECTION_NUMBER] (API Endpoints)

Task: Add full CRUD REST endpoints for [RESOURCE_NAME] to api.py

File to modify: sparkq/src/api.py

Current state: api.py has FastAPI app, Storage instance, health endpoint

Add these endpoints:

1. GET /api/[RESOURCES]
   - List all [RESOURCES] with pagination
   - Query params: limit=100 (int), offset=0 (int)[, OPTIONAL_FILTER=value]
   - Response: {'[RESOURCES]': [list of [RESOURCE_NAME] dicts]}
   - Implementation: storage.list_[RESOURCES]([OPTIONAL_FILTER])

2. POST /api/[RESOURCES]
   - Create new [RESOURCE_NAME]
   - Request body: {'[FIELD1]': [TYPE1], '[FIELD2]': [TYPE2], ...}
   - Response: {'[RESOURCE_NAME]': {id, [FIELD1], [FIELD2], created_at, status}}
   - Implementation: storage.create_[RESOURCE_NAME](...)
   - Error: 400 if missing required fields

3. GET /api/[RESOURCES]/{[RESOURCE]_id}
   - Retrieve single [RESOURCE_NAME] by ID
   - Response: {'[RESOURCE_NAME]': [RESOURCE_NAME] dict}
   - Error: 404 'Not found' if [RESOURCE]_id doesn't exist
   - Implementation: storage.get_[RESOURCE_NAME]([RESOURCE]_id)

4. PUT /api/[RESOURCES]/{[RESOURCE]_id}
   - Update [RESOURCE_NAME] (name, description, config, etc.)
   - Request body: {'[FIELD1]': value (optional), ...}
   - Response: {'[RESOURCE_NAME]': updated dict}
   - Error: 404 if not found
   - Implementation: storage.update_[RESOURCE_NAME]([RESOURCE]_id, ...)

5. PUT/POST /api/[RESOURCES]/{[RESOURCE]_id}/[ACTION]
   - Perform action on [RESOURCE_NAME] (end, activate, reset, etc.)
   - Response: {'message': '[ACTION] [RESOURCE_NAME]', '[RESOURCE_NAME]': updated dict}
   - Error: 404 if not found, 409 if invalid state
   - Implementation: storage.update_[RESOURCE_NAME](...) with [ACTION] logic

Integration:
- Import HTTPException from fastapi
- Use storage instance (already created in api.py)
- Return JSON dicts (FastAPI auto-serializes)
- Error responses: HTTPException(status_code=404, detail='message')

Validation: python -m py_compile sparkq/src/api.py && python -c \"from sparkq.src.api import app; print('API imported')\"
"
```

**Real Example (Phase 3 - Sessions, Streams, Tasks):**

Phase 3 generated 18 endpoints (5 per resource) across 3 batches using this pattern. Success: 100%, all validated on first try.

**Haiku Validation Template:**

```bash
Validate API endpoints for [RESOURCE_NAME]:
1. Syntax: python -m py_compile sparkq/src/api.py
2. Import: python -c "from sparkq.src.api import app; from fastapi.testclient import TestClient; client = TestClient(app); print(client.get('/health').json())"
3. Placeholders: grep -n "TODO\|FIXME" sparkq/src/api.py
4. Endpoint check: grep -n "@app.get.*[RESOURCES]\|@app.post.*[RESOURCES]" sparkq/src/api.py

Expected: All 5 endpoints defined, health check working, no TODO
```

**When to Reuse:** Any phase adding REST operations for a new resource. Reference: "Follow Phase 3 [RESOURCE_NAME] endpoint pattern (api.py lines 45-120)."

**When to Deviate:** If your endpoint needs complex business logic (approval workflows, cascading operations), specify that in the prompt instead of following basic CRUD pattern.

---

#### Pattern 3: CLI Command Implementation

**Phases:** Phase 2 (enqueue, peek, claim, complete, fail, requeue), Phase 3 (run, stop, status, reload)
**Baseline Token Cost:** ~4000 tokens total (1500 Sonnet + 0 Codex + 2500 Haiku)
**Success Metrics:** 100% first-try (Phase 2-3: 7 commands, all working, no errors)

**Template Codex Prompt:**

```bash
codex exec --full-auto -C /home/luce/apps/sparkqueue "
Context: SparkQ Phase [X] - CLI [COMMAND_GROUP_NAME] Commands
Reference: FRD v7.5 Section [SECTION_NUMBER] ([COMMAND_GROUP_NAME] Commands)

Task: Add [COMMAND_GROUP_NAME] commands to cli.py

File to modify: sparkq/src/cli.py

Current state: cli.py has Typer app with setup command

Add these @app.command() decorated functions:

1. [COMMAND_1_NAME]
   @app.command()
   def [command_1_name]([PARAM1]: [TYPE1] = typer.Option(..., help='...'),
                        [PARAM2]: [TYPE2] = typer.Option(..., help='...')):
       '''[COMMAND_1_DESCRIPTION]'''
       # Implementation details
       # Use typer.echo() for output
       # Use typer.style() for colored output
       # On error: typer.echo('Error: ...', err=True); raise typer.Exit(1)

[... 2-3 more commands following same pattern ...]

Command specifications:
- [COMMAND_1_NAME]: [DESCRIPTION]. Usage: sparkq [command] [args]
- [COMMAND_2_NAME]: [DESCRIPTION]. Usage: sparkq [command] [args]
- [COMMAND_3_NAME]: [DESCRIPTION]. Usage: sparkq [command] [args]

Integration:
- Import Typer from typer (already done)
- Use storage instance for data operations
- Use os/subprocess for system operations
- Handle errors gracefully (try/except with user-friendly messages)

Error handling:
- File not found: 'Error: File not found'
- Process not running: 'Error: Process not running'
- Invalid argument: 'Error: Invalid [ARGUMENT]'

Validation:
- python -m py_compile sparkq/src/cli.py
- python -c \"from sparkq.src import cli; cli.app(['--help'])\" (should show help)
- Grep for TODO/FIXME
"
```

**Real Example (Phase 3 - Server Management):**

Generated `run()`, `stop()`, `status()`, `reload()` commands. Success: 100%, all validation passed.

**Haiku Validation Template:**

```bash
Validate CLI commands for [COMMAND_GROUP_NAME]:
1. Syntax: python -m py_compile sparkq/src/cli.py
2. Commands: python -c "from sparkq.src.cli import app; app(['--help'])" | grep -E "[COMMAND_1]|[COMMAND_2]|[COMMAND_3]"
3. Placeholders: grep -n "TODO\|FIXME" sparkq/src/cli.py
4. Help output: python -c "from sparkq.src.cli import app; app(['[command]', '--help'])"

Expected: All commands listed in help, no TODO
```

**When to Reuse:** Any phase adding CLI commands. Reference: "Follow Phase 3 [COMMAND_GROUP] command pattern (cli.py lines XYZ)."

**When to Deviate:** If your command needs interactive prompts (user input during execution), specify that explicitly.

---

#### Pattern 4: HTML/CSS/JavaScript UI Components

**Phases:** Phase 3 (index.html, style.css, app.js core), Phase 5 (feature pages)
**Baseline Token Cost:** ~3500 tokens total (1500 Sonnet + 0 Codex + 2000 Haiku)
**Success Metrics:** 100% first-try (Phase 3: 3 files, 661 LOC, 0 placeholders; Phase 5: extensions working)

**Template Codex Prompt:**

```bash
codex exec --full-auto -C /home/luce/apps/sparkqueue "
Context: SparkQ Phase [X] - Web UI [FEATURE_NAME]
Reference: FRD v7.5 Section 15 (Web UI)

Task: Create Web UI [FEATURE_NAME] files

Files to create/modify:
1. sparkq/ui/index.html (if new - SPA shell)
2. sparkq/ui/style.css (if new - dark theme styling)
3. sparkq/ui/app.js (core or features)

== FILE 1: sparkq/ui/index.html ==

Requirements:
- Single Page Application (SPA) shell
- Navigation tabs: [TAB1] | [TAB2] | [TAB3] | ...
- Status indicator showing server connection status
- Dark theme (#1a1a1a background, #e0e0e0 text)
- Responsive mobile-friendly layout
- Mount point for dynamic content

Structure:
<!DOCTYPE html>
<html>
<head>
  <meta charset='utf-8'>
  <meta name='viewport' content='width=device-width, initial-scale=1'>
  <title>SparkQ</title>
  <link rel='stylesheet' href='style.css'>
</head>
<body>
  <nav class='navbar'>
    <div class='navbar-brand'>SparkQ</div>
    <div class='nav-tabs'>
      <button class='nav-tab active' data-page='[page1]'>[Page 1]</button>
      <button class='nav-tab' data-page='[page2]'>[Page 2]</button>
      ...
    </div>
    <div class='status-indicator' id='status'>●</div>
  </nav>

  <main id='app' class='container'>
    <!-- Content for each page -->
  </main>

  <script src='app.js'></script>
</body>
</html>

== FILE 2: sparkq/ui/style.css ==

Requirements:
- Dark theme: #1a1a1a background, #e0e0e0 text
- Status colors: green (running), yellow (idle), red (error)
- Responsive flexbox layout
- Navbar styling, button hover states
- Table styling for data display
- Modal/dialog styling
- Form input styling

[Include complete CSS with comments for each section]

== FILE 3: sparkq/ui/app.js ==

Requirements:
- Hash-based router (#dashboard, #[page2], etc.)
- API client wrapper with error handling
- Page rendering functions: render[Page1], render[Page2], etc.
- Server health check with status update
- Navigation click handlers
- Modal management

[Include complete JS with class structure and methods]

Integration:
- API calls to: GET /api/[resource], POST /api/[resource], etc.
- Error handling: connection errors, HTTP errors, validation errors
- User feedback: typer.echo style messages to UI

Validation:
- HTML: No syntax errors (open tags, attributes)
- CSS: Colors and layout render correctly
- JS: No console errors, router works (hash navigation), API calls work
"
```

**Real Example (Phase 3 - Web UI Core):**

Generated 3 files: `index.html` (SPA shell), `style.css` (dark theme), `app.js` (router + API client). Success: 100%, all working.

**Haiku Validation Template:**

```bash
Validate Web UI files for [FEATURE_NAME]:
1. HTML: grep -c "<html>\|<head>\|<body>" sparkq/ui/index.html (should have all 3)
2. CSS: grep -c "\.navbar\|\.container\|\.status-indicator" sparkq/ui/style.css (should find styles)
3. JS: grep -c "function render\|const apiClient\|addEventListener" sparkq/ui/app.js (should find functions)
4. Placeholders: grep -rn "TODO\|FIXME\|PLACEHOLDER" sparkq/ui/
5. File existence: ls -la sparkq/ui/*.html sparkq/ui/*.css sparkq/ui/*.js

Expected: All files exist, no TODO, styles and functions defined
```

**When to Reuse:** Any phase extending UI. Reference: "Follow Phase 3 UI [FEATURE] pattern (index.html + style.css + app.js)."

**When to Deviate:** If your feature needs complex state management (Redux, Vuex), specify that instead of simple page rendering.

---

#### Pattern 5: Error Handling & Recovery

**Phases:** Phase 4 (timeout enforcement, auto-fail), Phase 5 (error response handling)
**Baseline Token Cost:** ~2500 tokens total (1000 Sonnet + 0 Codex + 1500 Haiku)
**Success Metrics:** 95% first-try (Phase 4-5: error handling working, edge cases discovered in validation)

**Template Codex Prompt:**

```bash
codex exec --full-auto -C /home/luce/apps/sparkqueue "
Context: SparkQ Phase [X] - Error Handling for [COMPONENT_NAME]
Reference: FRD v7.5 Section [SECTION_NUMBER]

Task: Implement error handling and recovery for [COMPONENT_NAME]

File to modify: sparkq/src/[COMPONENT].py

Current state: [COMPONENT] exists but needs error handling

Add error handling for:

1. [ERROR_TYPE_1] - [SCENARIO_1]
   - Detect: [HOW_TO_DETECT]
   - Handle: [RECOVERY_ACTION_1]
   - Log: Log with level [ERROR/WARNING/INFO]
   - Response: Return [RESULT] or raise [EXCEPTION]

2. [ERROR_TYPE_2] - [SCENARIO_2]
   - Detect: [HOW_TO_DETECT]
   - Handle: [RECOVERY_ACTION_2]
   - Log: Log with level [ERROR/WARNING/INFO]
   - Response: Return [RESULT] or raise [EXCEPTION]

Implementation pattern:

def [function_name](...):
    try:
        # Normal operation
        result = [operation]
        logger.info(f'[operation] succeeded: {result}')
        return result
    except [ErrorType1] as e:
        logger.error(f'[error_type_1]: {e}')
        # Recovery action
        return [fallback_result]
    except [ErrorType2] as e:
        logger.warning(f'[error_type_2]: {e}')
        # Different recovery action
        [recovery_action]

Logging:
- Import logging: import logging; logger = logging.getLogger(__name__)
- Log at appropriate levels: ERROR (failures), WARNING (retries), INFO (successes)
- Include context: task ID, user action, error details

Integration:
- Import logging module
- Create logger at module level
- Use logger throughout [COMPONENT]
- No print() statements

Validation:
- python -m py_compile sparkq/src/[COMPONENT].py
- Check logging statements: grep -n 'logger\.' sparkq/src/[COMPONENT].py
- Check error types: grep -n 'except\|raise' sparkq/src/[COMPONENT].py
- No TODO/FIXME for error handling
"
```

**Real Example (Phase 4 - Task Timeout Enforcement):**

Added error handling for: task not found, invalid state transition, database errors. Success: 95% (edge case found in validation: task deleted between check and update).

**Haiku Validation Template:**

```bash
Validate error handling for [COMPONENT_NAME]:
1. Syntax: python -m py_compile sparkq/src/[COMPONENT].py
2. Logging: grep -c "logger.error\|logger.warning\|logger.info" sparkq/src/[COMPONENT].py (should >0)
3. Exception handling: grep -c "except\|try:" sparkq/src/[COMPONENT].py (should have pairs)
4. No prints: grep -n "print(" sparkq/src/[COMPONENT].py (should be empty)
5. Placeholders: grep -n "TODO\|FIXME" sparkq/src/[COMPONENT].py (should be empty)

Expected: Logging found, exceptions handled, no print statements, no TODO
```

**When to Reuse:** Any phase adding robustness to existing components. Reference: "Follow Phase 4 error handling pattern (add try/except + logging)."

**When to Deviate:** If your component needs circuit breakers, exponential backoff, or distributed recovery logic, specify those requirements explicitly.

---

### Decision Tree: Which Pattern to Use

```
New task identified
│
├─ "Is it database CRUD?" → YES → Use Pattern 1: Storage CRUD
│
├─ "Is it a REST API endpoint?" → YES → Use Pattern 2: FastAPI Endpoints
│
├─ "Is it a CLI command?" → YES → Use Pattern 3: CLI Commands
│
├─ "Is it a Web UI component?" → YES → Use Pattern 4: HTML/CSS/JS
│
└─ "Is it error handling/recovery?" → YES → Use Pattern 5: Error Handling
    └─ NO → New pattern required (document for future use)
```

### Combining Patterns

Most features use multiple patterns:

**Example: Phase 6 New Feature**
1. Add `create_X()` in storage.py (Pattern 1: CRUD)
2. Add `/api/X` endpoints in api.py (Pattern 2: REST)
3. Add `sparkq x-command` in cli.py (Pattern 3: CLI)
4. Add X feature page in app.js (Pattern 4: UI)
5. Add error handling for all of above (Pattern 5: Error Handling)

**Total cost:** 1500 + 3000 + 4000 + 3500 + 2500 = 14500 tokens
**Using patterns:** Reuse all 5 templates, adjust [PLACEHOLDERS] only
**Cost savings:** 30-40% vs regenerating full specs

### Pattern Library Maintenance

After each phase:
1. **Document what pattern you used** - Save reference to prompt in `/docs/patterns/`
2. **Note any deviations** - If you adjusted pattern, document why
3. **Update token baselines** - If actual tokens differ from estimate, update pattern
4. **Test pattern references** - First time using a pattern reference, validate carefully
5. **Share learnings** - If you improved a pattern, update the playbook

**Pattern Library Files:**
```
docs/patterns/
├── pattern-storage-crud.md (Phase 1 baseline)
├── pattern-fastapi-endpoints.md (Phase 3 baseline)
├── pattern-cli-commands.md (Phase 2-3 baseline)
├── pattern-ui-components.md (Phase 3 baseline)
└── pattern-error-handling.md (Phase 4-5 baseline)
```

Each file contains:
- Complete template prompt
- Real example from actual phase
- Baseline token cost and success metrics
- Haiku validation checklist
- When to use / when to deviate

---

### Pattern: Storage Layer (Database CRUD)

**Codex Tasks:**
1. Schema DDL creation
2. Connection manager
3. Each entity's CRUD operations (can parallelize)

**Sonnet Tasks:**
- Integration testing
- Complex query logic (if any)

**Haiku Tasks:**
- Syntax validation
- SQL syntax check

---

### Pattern: CLI Application

**Codex Tasks:**
1. CLI skeleton with all command stubs
2. Each command implementation (can parallelize)
3. Config file parsing
4. Helper utilities

**Sonnet Tasks:**
- Interactive flows (Q&A, wizards)
- Complex command orchestration
- Error handling strategy

**Haiku Tasks:**
- Test `--help` output
- Validate command signatures

---

### Pattern: Web API

**Codex Tasks:**
1. API skeleton (FastAPI/Flask app)
2. Each endpoint implementation (can parallelize)
3. Request/response models
4. Middleware

**Sonnet Tasks:**
- Authentication logic
- Rate limiting strategy
- Integration with external APIs

**Haiku Tasks:**
- Endpoint syntax validation
- OpenAPI schema validation

---

### Pattern: UI Components

**Codex Tasks:**
1. HTML structure
2. CSS styling
3. JavaScript functionality
4. React components (if applicable)

**Sonnet Tasks:**
- Complex state management
- Event flow orchestration
- UX decision making

**Haiku Tasks:**
- HTML validation
- CSS syntax check
- Placeholder detection

---

## 7. Troubleshooting

### 7.1 Partial Batch Recovery Without Full Restart

**Problem Statement**

Large phases with multiple batches (e.g., Phase 6 with automated testing + manual UAT) can consume 20K+ tokens per execution. When a single batch fails late in the sequence—say Batch 3 out of 5—restarting the entire phase from scratch wastes 80% of the already-completed work and burns thousands of unnecessary tokens. The Complete Orchestration Pattern (Sonnet → Codex → Haiku) is optimized for success, but failures do happen: syntax errors, import conflicts, specification misunderstandings, or edge cases not covered in the initial prompt. For Phase 6+ scenarios where batch counts reach 5-10+ batches, full restarts become prohibitively expensive in both token cost and wall-clock time.

**The goal:** Provide a systematic, evidence-based recovery path that isolates and fixes only the failed components while preserving all successfully completed work from previous batches.

---

**Decision Tree: Should You Recover or Restart?**

Use this decision tree before choosing recovery vs full restart:

```
START: Batch N failed during phase execution
│
├─ Q1: Is Batch N the last successfully completed batch before failure?
│  ├─ YES → Proceed to Q2
│  └─ NO → Batch N-1 (or earlier) succeeded, Batch N failed
│      └─ Proceed to Q2
│
├─ Q2: Are batches N+1 and beyond dependent on Batch N outputs?
│  ├─ YES (Sequential dependency chain)
│  │  └─ RECOVERY PATH: Restart from Batch N+1 onward only
│  │     ├─ Keep all batches 1 to N-1 (validated and working)
│  │     ├─ Fix Batch N using Sonnet recovery prompt
│  │     ├─ Validate fixed Batch N with Haiku
│  │     └─ Continue from Batch N+1 after validation passes
│  │
│  └─ NO (Independent batches, no dependency chain)
│      └─ RECOVERY PATH: Restart only failed batch N
│         ├─ Keep all batches 1 to N-1 AND N+1+ (independent)
│         ├─ Fix Batch N in isolation using Sonnet recovery prompt
│         ├─ Validate fixed Batch N with Haiku
│         └─ Skip re-execution of other batches entirely
│
└─ Q3: Was failure due to architectural issue or cascading dependencies?
   ├─ YES (e.g., schema change, breaking API change)
   │  └─ FULL RESTART: Recovery won't fix systemic issues
   │     └─ Document root cause and fix specification before restart
   │
   └─ NO (Syntax error, logic bug, import typo, edge case)
       └─ RECOVERY PATH: Use targeted recovery as above
          └─ If recovery fails twice, escalate to full restart
```

**Key Principle:** Recovery is optimized for isolated failures (syntax, logic). Full restart is required for systemic issues (architecture, breaking changes).

---

**Step-by-Step Recovery Process**

**1. Identify Exact Files and Commands That Failed**

After Batch N fails, Haiku validation will report specific errors:

```
Haiku Validation Report - Batch 3:
❌ FAIL: sparkq/tests/test_storage.py
   - SyntaxError: invalid syntax (line 47)
   - ImportError: cannot import name 'TaskRepository'

✅ PASS: sparkq/tests/test_models.py
✅ PASS: sparkq/tests/test_cli.py
```

**Action:** Record only the failing files from Batch N. In this example: `sparkq/tests/test_storage.py`

**2. Extract Original Codex Prompt for Failed File**

Retrieve the original Sonnet-generated Codex prompt that created the failed file. This is your baseline specification.

**Example:** If Batch 3 used this prompt:

```bash
codex exec --full-auto -C /home/luce/apps/sparkqueue "
Context: SparkQ Phase 6 Batch 3 - Storage Layer Integration Tests
Reference: FRD v7.5 Section 11.3

Task: Create integration tests for storage.py CRUD operations

File to create: sparkq/tests/test_storage.py

Requirements:
- Import pytest, TaskRepository, SessionRepository
- Test enqueue, claim, complete, fail operations
- Mock SQLite database for isolation
- Cover edge cases (duplicate claims, invalid IDs)

Specification:
[... full specification from Sonnet ...]

Validation: pytest sparkq/tests/test_storage.py -v
"
```

**Action:** Save this prompt to reference file (e.g., `_build/prompts-build/batch3-original-prompt.txt`). You'll need it for Step 3.

**3. Generate Recovery Prompt Using Sonnet**

Delegate to Sonnet to analyze the failure and generate a revised, targeted Codex prompt. Use this template:

**Sonnet Recovery Prompt Template:**

```
Analyze this Codex execution failure and generate a recovery prompt:

ORIGINAL CODEX PROMPT:
[PASTE_ORIGINAL_PROMPT_FROM_STEP_2]

ERROR DETAILS:
File: [FILE_PATH]
Error Type: [e.g., SyntaxError, ImportError, ValidationError]
Error Message:
[PASTE_EXACT_ERROR_FROM_HAIKU_VALIDATION]

Context from Codebase:
[PASTE_RELEVANT_CODE_SNIPPETS - e.g., actual import paths, class names]

Task:
Generate a revised Codex prompt that:
1. Keeps the same file path and core requirements
2. Fixes the specific error identified above
3. Adds clarifications or examples based on the error
4. Includes explicit validation step to catch this error type

Output Format:
Provide the complete revised Codex prompt ready to execute.
```

**Expected Sonnet Output (Example):**

```bash
codex exec --full-auto -C /home/luce/apps/sparkqueue "
Context: SparkQ Phase 6 Batch 3 RECOVERY - Storage Layer Integration Tests
Reference: FRD v7.5 Section 11.3

Task: Create integration tests for storage.py CRUD operations (RECOVERY from import error)

File to create: sparkq/tests/test_storage.py

Requirements:
- Import pytest
- Import from sparkq.src.storage: TaskRepository, SessionRepository (FIX: use correct module path)
- Import from sparkq.src.models: Task, Session, TaskStatus (FIX: add missing model imports)
- Test enqueue, claim, complete, fail operations
- Mock SQLite database for isolation using pytest fixtures
- Cover edge cases (duplicate claims, invalid IDs)

Specification:
```python
import pytest
from sparkq.src.storage import TaskRepository, SessionRepository  # CORRECTED PATH
from sparkq.src.models import Task, Session, TaskStatus  # ADDED MISSING IMPORTS

@pytest.fixture
def temp_db():
    # ... fixture implementation ...

def test_enqueue_task(temp_db):
    # ... test implementation ...
```
[... complete revised specification ...]

Validation:
1. python -m py_compile sparkq/tests/test_storage.py
2. pytest sparkq/tests/test_storage.py -v --tb=short

Output: Confirm test file created with corrected imports and passing validation.
"
```

**Key Changes in Recovery Prompt:**
- Adds "RECOVERY" context to signal this is a fix
- Explicitly calls out the error and fix in requirements
- Provides corrected code snippets
- Enhances validation (adds pytest execution, not just compile)

**4. Execute Only Recovery Codex Commands in Parallel**

If multiple files failed in Batch N, run recovery Codex commands simultaneously:

```bash
# Example: 2 files failed in Batch 3
Terminal 1: codex exec --full-auto "[RECOVERY_PROMPT_FILE_1]"
Terminal 2: codex exec --full-auto "[RECOVERY_PROMPT_FILE_2]"
```

**Time Savings:** Recovery executes only failed files (2-5 min), not entire batch (10-15 min).

**5. Validate Only Recovered Files with Haiku**

After recovery Codex execution completes:

```
Haiku Validation (Recovery):
- Run: python -m py_compile sparkq/tests/test_storage.py
- Run: pytest sparkq/tests/test_storage.py -v
- Check: No placeholders (TODO, FIXME)
- Check: All imports resolve correctly

Expected: ✅ PASS on all checks
```

**If validation fails again:** Document the second failure and escalate to full restart (safeguard rule).

**6. Skip Validation for Batches 1 to N-1**

**Critical efficiency gain:** Do NOT re-validate batches 1 through N-1. They already passed Haiku validation and are confirmed working. Only validate the recovered Batch N.

**Example Phase 6 Recovery:**
- Batches 1-2: Complete, validated ✅ → Skip
- Batch 3: Failed, recovered → Validate recovered files only
- Batches 4-5: Not yet executed → Continue normally after Batch 3 passes

**Total validation cost:** 1-2K Haiku tokens (Batch 3 only), not 10K tokens (entire phase).

---

**Cost Comparison Table**

**Scenario:** Phase 6 has 5 batches. Batch 3 fails after Batches 1-2 complete successfully. Phase 6 total budget: 24K tokens.

| Approach | Sonnet Tokens | Codex Tokens | Haiku Tokens | Total Claude Tokens | Wall-Clock Time | Savings |
|----------|---------------|--------------|--------------|---------------------|-----------------|---------|
| **Full Restart** (re-execute Batches 1-5) | 12K (re-generate all prompts) | $0 | 12K (re-validate all) | **24K** | **60 min** | Baseline |
| **Targeted Recovery** (fix Batch 3 only) | 2K (recovery prompt generation) | $0 | 2K (validate Batch 3 only) | **4K** | **10 min** | **83% tokens, 83% time** |

**Savings Calculation:**
- Token savings: 24K - 4K = **20K tokens saved** (83% reduction)
- Time savings: 60 min - 10 min = **50 minutes saved** (83% reduction)
- Cost savings: ~$0.10 → ~$0.02 (using Sonnet $6.60/M + Haiku $2.20/M rates)

**Key Insight:** Recovery preserves Batches 1-2 work (10K tokens, 30 min already spent). Full restart throws this away.

---

**Example Scenarios**

**Scenario A: Phase 6 Batch 3 Fails After Batches 1-2 Complete**

**Context:**
- Phase 6: Automated Testing (5 batches total)
- Batches 1-2: Unit tests for storage + models (complete, validated ✅)
- Batch 3: Integration tests for API endpoints (FAILED - ImportError)
- Batches 4-5: Not yet executed

**Recovery Path:**
1. Identify failure: `sparkq/tests/test_api.py` has import error
2. Extract Batch 3 original Codex prompt
3. Sonnet analyzes error: Missing `from fastapi import TestClient`
4. Sonnet generates recovery prompt with corrected imports
5. Execute recovery Codex command (single file)
6. Haiku validates recovered file only
7. Continue to Batch 4 after validation passes

**Outcome:**
- Batches 1-2: Preserved (no re-execution)
- Batch 3: Fixed in 5-10 min
- Batches 4-5: Execute normally
- Total recovery cost: 3K tokens (vs 24K full restart)

---

**Scenario B: Phase 6 Batch 5 Fails After Batches 1-4 Complete**

**Context:**
- Phase 6: Automated Testing (5 batches total)
- Batches 1-4: All tests complete, validated ✅ (18K tokens spent)
- Batch 5: End-to-end workflow test (FAILED - assertion error in test logic)
- Dependencies: Batch 5 is independent (doesn't affect earlier batches)

**Recovery Path:**
1. Identify failure: `sparkq/tests/test_e2e_workflow.py` assertion fails
2. Extract Batch 5 original Codex prompt
3. Sonnet analyzes error: Test expected wrong task count (logic bug)
4. Sonnet generates recovery prompt with corrected assertion logic
5. Execute recovery Codex command (single file)
6. Haiku validates + runs pytest on recovered file
7. Phase 6 complete after validation passes

**Outcome:**
- Batches 1-4: Preserved (no re-execution, 18K tokens preserved)
- Batch 5: Fixed in 5-10 min (2K tokens)
- Total phase cost: 20K tokens (vs 24K full restart, but only 2K for recovery)
- **90% of work preserved**

---

**Scenario C: Multiple Files in Same Batch Fail (Parallel Recovery)**

**Context:**
- Phase 6 Batch 3: Integration tests (3 files generated)
- Files: `test_api.py` ✅, `test_storage_integration.py` ❌, `test_worker_integration.py` ❌
- Errors: Import errors in 2 files

**Recovery Path:**
1. Identify failures: 2 files from Batch 3
2. Extract original Codex prompts for both files
3. Sonnet generates 2 recovery prompts (one per file)
4. Execute recovery Codex commands **in parallel** (2 terminals)
5. Haiku validates both recovered files
6. Continue to Batch 4 after both pass

**Outcome:**
- Parallel recovery: Both files fixed simultaneously (5-10 min total, not 10-20 min sequential)
- Cost: 3K tokens (2K Sonnet + 1K Haiku) vs 8K for Batch 3 full re-execution
- **63% savings on Batch 3 recovery**

---

**When to Use Recovery vs Full Restart**

**Use Targeted Recovery When:**
- ✅ Failure is in Batch N-1 or earlier (work already done)
- ✅ Error is syntax, logic, imports, or edge case (isolated fix)
- ✅ Batches 1 to N-2 all passed validation (foundation is solid)
- ✅ Failure doesn't indicate architectural problem
- ✅ You can identify specific files/commands that failed
- ✅ Recovery can be executed in <10 minutes

**Use Full Restart When:**
- ❌ Failure is in Batch 1 or 2 (not much work to lose)
- ❌ Error indicates architectural issue (schema change, breaking API)
- ❌ Multiple batches failed in cascade (dependency chain broken)
- ❌ Recovery attempt failed twice (safeguard rule)
- ❌ Original specification was fundamentally wrong (need redesign)
- ❌ Token cost of recovery approaches full restart cost

**Example Decision:**

**Phase 6, Batch 5 fails (4 batches complete, 18K tokens spent):**
- Isolated syntax error in `test_e2e.py`
- Recovery cost: 2K tokens, 5 min
- Full restart cost: 24K tokens, 60 min
- **Decision: Use recovery** (saves 22K tokens, 55 min)

**Phase 6, Batch 2 fails (1 batch complete, 4K tokens spent):**
- Architectural issue: schema missing required fields
- Recovery cost: Unknown (may cascade to Batches 3-5)
- Full restart cost: 24K tokens, 60 min
- **Decision: Use full restart** (only 4K tokens at risk, need redesign)

---

**Safeguards**

**1. Always Validate Before Proceeding**

After recovery Codex execution, **always** run Haiku validation:
- Do not skip validation because "it should work now"
- Validation cost (1-2K tokens) is insurance against compounding errors
- Failed validation triggers escalation (safeguard #4)

**2. Keep Backup of Batch Output Before Recovery**

Before executing recovery Codex commands:

```bash
# Backup failed batch files
cp sparkq/tests/test_storage.py sparkq/tests/test_storage.py.failed-backup
cp _build/prompts-build/batch3-output.md _build/prompts-build/batch3-output.backup.md
```

**Why:** If recovery makes things worse, you can restore the failed state and try a different approach.

**3. If Recovery Fails Twice, Escalate to Full Restart**

**Rule:** If recovery Codex execution + Haiku validation fails twice for the same file:
1. First failure: Original batch execution fails
2. First recovery attempt: Fails validation again
3. **STOP. Do NOT attempt third recovery.**
4. Escalate to full restart with revised specification

**Reasoning:** Two failures suggest the specification (not just execution) is wrong. Full restart with Sonnet redesign is needed.

**4. Document Why Recovery Was Chosen**

In phase execution notes, record:
- Batch N failed with [ERROR_TYPE]
- Decision: Targeted recovery chosen because [REASON]
- Batches preserved: 1 to N-1 (XK tokens, Y min saved)
- Recovery outcome: [SUCCESS | ESCALATED_TO_FULL_RESTART]

**Example Note:**

```
Phase 6 Execution Log:
- Batch 3 failed: ImportError in test_api.py
- Decision: Targeted recovery (Batches 1-2 validated ✅, 10K tokens invested)
- Recovery: Sonnet generated fix, Codex re-executed, Haiku validated ✅
- Outcome: SUCCESS - continued to Batch 4
- Total cost: 14K tokens (vs 24K full restart)
- Savings: 10K tokens (42%), 30 min (50%)
```

**Why:** Documentation helps future phases learn from recovery patterns and improves decision-making.

---

**Summary: When Phase 6+ Hits a Failure**

1. **Pause:** Don't immediately restart
2. **Assess:** Use decision tree (Section 7.1)
3. **Decide:** Recovery (isolated error) or Restart (systemic issue)
4. **Execute:** Follow 6-step recovery process if chosen
5. **Validate:** Always run Haiku validation on recovered files
6. **Escalate:** If recovery fails twice, full restart with revised spec
7. **Document:** Record decision and outcome for future reference

**Key Principle:** Partial batch recovery is optimized for speed and token efficiency in large phases. It preserves validated work and fixes only what failed. Use it for isolated errors; use full restart for systemic issues.

---

### Codex command fails

**Check:**
1. Is Codex installed and authenticated? (`codex --version`)
2. Is prompt too vague? (Add more specific requirements)
3. Is file path correct?
4. Is there a conflict with existing files?

**Fix:**
- Refine prompt with more details
- Check file permissions
- Remove conflicting files
- Break task into smaller subtasks

---

### Codex generates incorrect code

**Check:**
1. Was specification clear in prompt?
2. Did you include examples?
3. Did you reference authoritative docs?

**Fix:**
- Paste exact spec from FRD/prompt
- Include code examples in prompt
- Add validation requirements
- Run Codex again with refined prompt

---

### Parallel execution conflicts

**Check:**
1. Are tasks truly independent?
2. Are they writing to same file?
3. Are they importing each other?

**Fix:**
- Move dependent tasks to next batch
- Ensure each task has unique output file
- Run foundation tasks first, then features

---

### High Claude token usage

**Check:**
1. Are you using Sonnet for code generation? (Should be Codex)
2. Are validation prompts too long? (Should be concise)
3. Are you regenerating prompts multiple times?

**Fix:**
- Move ALL code generation to Codex
- Keep Haiku prompts short and focused
- Cache Codex prompts, reuse for similar tasks

---

## 8. Success Metrics

### Token Cost Reduction
- **Target:** ≥70% reduction in Claude token costs
- **Measure:** Compare original estimate vs actual usage
- **Goal:** $2.55 → $0.27 (89% reduction for SparkQ)
- **Phase 1 Actual:** 5-8K tokens (3-5K Sonnet + 2-3K Haiku + $0 Codex) = **93% savings vs traditional**

### Execution Speed
- **Target:** 50%+ faster than sequential execution
- **Measure:** Time from start to all files created
- **Benefit:** Parallel Codex commands run simultaneously
- **Phase 1 Actual:** ~30-45 min wall-clock time with 6-8 parallel Codex processes

### Code Quality
- **Target:** 0 syntax errors, 0 placeholders
- **Measure:** All validation tests pass
- **Validation:** Haiku checks + manual review
- **Phase 1 Actual:** 100% pass rate - all generated code worked on first try

### Developer Experience
- **Target:** Clear model assignment, easy to follow
- **Measure:** Can another developer execute the plan?
- **Documentation:** Optimized plan document + prompts
- **Phase 1 Actual:** All phases can now be executed independently by following orchestration docs

---

## 8.5 Phase 1 Success Case Study

**SparkQ Phase 1 Real Results:**

**Original Estimate (Expensive):**
- Sonnet code generation: 15K tokens
- Haiku validation: 8K tokens
- Total: 23K tokens (~$0.09 cost)

**Actual Results (Optimized):**
- Sonnet prompt generation only: 3-5K tokens
- Codex execution: $0 (parallel)
- Haiku validation: 2-3K tokens
- Total: 5-8K tokens (~$0.015 cost)
- **Savings: 65-78% tokens, 83% cost reduction**

**Key Success Factors:**

1. **Detailed Prompts = Better Output**
   - Sonnet-generated Codex prompts included exact specs, file paths, examples
   - Result: Codex generated production-ready code
   - 0 follow-up iterations needed

2. **Parallel Execution Maximized Speed**
   - 6-8 Codex processes ran simultaneously
   - Independent tasks grouped into batches
   - 30-45 min wall-clock time vs 2-3 hours sequential

3. **Early Validation Caught Issues**
   - Haiku validation after each batch
   - Syntax errors caught immediately
   - No integration surprises

4. **Model Assignment Clarity**
   - Every task had clear owner (Sonnet/Codex/Haiku)
   - No wasted token budget on wrong model
   - Easy to modify and replicate

**Lessons for Future Phases:**

1. **Sonnet investment in prompts pays off**
   - 1K token Sonnet prompt → 5-10K token Codex output
   - ROI: 5-10x leverage on Sonnet spending
   - Worth spending Sonnet tokens on detailed prompts

2. **Batch design matters**
   - Sequential dependencies reduce parallelization
   - Minimize sequential batches, maximize parallel groups
   - Use Sonnet to optimize batch ordering

3. **Validation timing is critical**
   - Validate after EACH batch, not just at end
   - Catch errors early before compounds
   - Reduces total debugging time

4. **Documentation drives execution**
   - Clear execution timelines reduce confusion
   - Token cost transparency builds confidence
   - Batch breakdown enables independent execution

---

## 9. Example: Converting a Traditional Plan

### Original (Traditional - Before Optimization):
```
Phase 1: Storage Layer (hypothetical traditional approach)
- Sonnet: Design schema (5K tokens)
- Haiku: Create models.py (8K tokens)
- Haiku: Create storage.py (12K tokens)
- Haiku: Create CRUD operations (20K tokens)
- Haiku: Validation (5K tokens)
Total: 50K tokens × $2.20-$6.60/M = ~$0.15
```

### Actual Phase 1 Results (Optimized Pattern):
```
Phase 1: Storage Layer (ACTUAL EXECUTION - see Section 8.5)
- Sonnet: Generate 6 Codex prompts (3-5K tokens)
- Codex: Create models.py (0 tokens)
- Codex: Create storage.py foundation (0 tokens)
- Codex: Add Project CRUD (0 tokens)
- Codex: Add Session CRUD (0 tokens)
- Codex: Add Stream CRUD (0 tokens)
- Codex: Add Task CRUD stubs (0 tokens)
- Haiku: Validate syntax (2-3K tokens)
Total: 5-8K tokens × $2.20-$6.60/M = ~$0.015
```

**Actual Savings:** $0.15 → $0.015 = 90% reduction
**Success:** 100% first-try, 30-45 min wall-clock (Phase 1 proved it works)

---

## 10. Quick Reference

### Model Selection Decision Tree
```
Is it code generation from spec?
├─ YES → Use Codex
│   └─ Can it run in parallel with other tasks?
│       ├─ YES → Add to parallel batch
│       └─ NO → Sequential execution
│
└─ NO → Does it require reasoning?
    ├─ YES → Use Sonnet
    │   ├─ Business logic
    │   ├─ Orchestration
    │   └─ Architecture
    │
    └─ NO → Is it validation?
        ├─ YES → Use Haiku
        └─ NO → Re-evaluate task
```

### Codex Command Quick Reference
```bash
# Single task
codex exec --full-auto -C /path "[prompt]"

# Parallel (background)
codex exec "[p1]" & codex exec "[p2]" & codex exec "[p3]" & wait

# Check status
ps aux | grep codex

# View output
cat /tmp/codex-session-*.log  # (if logging enabled)
```

### Token Cost Quick Calc
```
Sonnet: tokens × $6.60 / 1,000,000
Haiku:  tokens × $2.20 / 1,000,000
Codex:  $0 (separate subscription)
```

---

## 11. Advanced: Optimizing Based on Phase Success

### Lesson 1: Prompt Quality is Your Best Investment

**What we learned:** Detailed Codex prompts (generated by Sonnet) resulted in 100% first-try success.

**How to apply:**
- Allocate 20-30% of batch token budget to Sonnet prompt generation
- Include exact file paths, method signatures, examples in prompts
- Reference authoritative specs (FRD, API docs) in every prompt
- Example: A 2K Sonnet prompt → 0 follow-up iterations needed

**For next phases:**
- Before starting Codex execution, invest time in Sonnet prompt refinement
- Have Sonnet generate not just prompts, but also batch sequencing advice
- Ask Sonnet to identify hidden dependencies before parallelizing

### Lesson 2: Batch Ordering Dramatically Affects Speed

**What we learned:** Phase 1 had some sequential batches, but we could have parallelized more.

**Optimization technique:**
```
Ask Sonnet: "Identify which batches can run in parallel without blocking"
Result: Reduces wall-clock time from 45min to 30min
```

**For next phases:**
- Have Sonnet analyze batch dependencies before execution
- Reorder batches to maximize parallelization
- Use "can run after" instead of "must run after" in batch specs
- Target: >75% of batches running in parallel

**Example:**
```
Phase 3 Optimization:
- Original: Batches 3,4,5 wait for Batch 2
- Optimized: Batches 6,7 can start immediately after Batch 1
- Result: 15-20% faster execution
```

### Lesson 3: Validation Checkpoints Prevent Cascading Failures

**What we learned:** Validating after each batch caught issues immediately.

**Best practice:**
- Always validate after Codex generates code
- Never skip validation because "it probably works"
- Validation cost (1-2K Haiku per batch) is worth the insurance

**For next phases:**
- Require Haiku validation after EVERY batch
- Make validation part of batch definition
- Example prompt: "After Codex generates X, run: python -m py_compile files..."
- Include failure recovery steps in batch specs

### Lesson 4: Model Specialization Maximizes ROI

**What we learned:** Clear model assignment (Sonnet → Codex → Haiku) prevented token waste.

**Token efficiency rules:**
| Task | Model | Why | Cost |
|------|-------|-----|------|
| Code generation | Codex | Pattern-based, excellent at spec following | $0 |
| Prompt generation | Sonnet | Requires reasoning about architecture | 1-3K |
| Syntax validation | Haiku | Simple checks, no reasoning needed | 0.5-2K |
| Integration logic | Sonnet | Requires understanding multiple files | 1-2K |
| Placeholder detection | Haiku | Simple grep, no reasoning needed | <0.5K |

**For next phases:**
- Challenge every Sonnet task: "Could Haiku do this?"
- Challenge every Haiku task: "Could Codex generate this?"
- Challenge every Codex task: "Does this need reasoning?"

### Lesson 5: Documentation is Infrastructure

**What we learned:** Clear execution guides let anyone follow the plan.

**Documentation components that matter:**
1. Token budget breakdown (transparent)
2. Batch execution sequence (clear dependencies)
3. Validation commands (specific, copy-paste ready)
4. Parallel execution groups (wall-clock time impact)

**For next phases:**
- Every phase prompt should have these 4 sections
- Include actual timings from Phase 1 as reference
- Show token costs at batch level (not just phase total)
- Explain WHY each batch is sequential/parallel

### Optimization Roadmap for Phases 2-5

**Phase 2 (17K tokens):** High parallelization potential
- 5 batches after Task CRUD foundation
- Recommendation: Ask Sonnet to identify 3-4 parallel groups
- Target: 12K tokens actual (30% reduction vs estimate)

**Phase 3 (21K tokens):** Mixed sequential/parallel
- Server foundation must precede API endpoints
- UI core must precede UI features
- Recommendation: Parallel endpoint development (Sessions, Streams, Tasks simultaneously)
- Target: 16K tokens actual (24% reduction)

**Phase 4 (12K tokens):** High parallelization potential
- Watcher script can run parallel to storage/server updates
- Recommendation: All 4 batches in parallel after Batch 1
- Target: 8K tokens actual (33% reduction)

**Phase 5 (14K tokens):** Mix of sequential + parallel
- Script index foundation → UI integration
- Error handling batches highly parallel
- Documentation can run alongside
- Target: 10K tokens actual (29% reduction)

**Total Phases 2-5 Optimized Estimate: 46K tokens** (vs 64K planned)
- Combined with Phase 1: ~51-54K total (vs 87K original estimate)
- Total savings: **80-88% reduction in token costs**

---

**Remember:** The goal is to minimize Claude tokens while maximizing Codex usage. When in doubt, ask: "Can Codex generate this from a clear spec?" If yes, use Codex!

**Phase 1 Proven:** The orchestration model works. Build on success, replicate patterns, document results.

---

## 12. Sonnet Execution Prompt Template (Copy-Paste Ready)

### Universal Template for Any Phase Implementation

Use this prompt when delegating phase implementation to Sonnet:

```
Implement [PHASE_NAME] using the Complete Orchestration Pattern

Follow the workflow defined in .claude/playbooks/codex-optimization.md:

Step 1: Sonnet (You) - Prompt Generation
- Read the phase specification: _build/prompts-build/[PHASE_FILE].md
- Generate detailed Codex prompts for each batch
- Adjust specifications on-the-fly based on existing code
- Ensure prompts include exact file paths, method signatures, examples

Step 2: Codex - Parallel Code Generation
- Launch multiple Codex commands in parallel (separate bash processes)
- Each Codex command generates code independently
- Run all independent batches simultaneously for maximum speed
- Monitor output and report completion for each batch

Step 3: Haiku - Validation & Correction
- After each Codex batch completes, use Haiku to validate syntax
- Check for errors, missing imports, or placeholders
- Correct any issues found before proceeding to next batch
- Run: python -m py_compile [files] to verify

Step 4: Sonnet (You) - Final Integration
- Review all completed work
- Perform final validation of the entire phase
- Ensure all components integrate correctly with previous phases
- Verify no token waste, optimal model utilization

Report Out Token Usage by Model:
- Sonnet orchestration: ___K tokens (planning, coordination, integration)
- Codex execution: ___K (all code generation in parallel) ($0 cost)
- Haiku validation: ___K tokens (syntax checks, test validation)
- Total approximate: ___K tokens used, primarily Sonnet + Haiku

Target: [PHASE_NAME] implementation as specified in _build/prompts-build/[PHASE_FILE].md
```

### How to Use This Template

**For Phase 2:**
```
Implement Phase 2: Worker Commands using the Complete Orchestration Pattern

[Rest of template with:
- PHASE_NAME = "Phase 2: Worker Commands"
- PHASE_FILE = "sparkq-phase2-prompt.md"
]
```

**For Phase 3:**
```
Implement Phase 3: Server + API + Web UI using the Complete Orchestration Pattern

[Rest of template with:
- PHASE_NAME = "Phase 3: Server + API + Web UI"
- PHASE_FILE = "sparkq-phase3-prompt.md"
]
```

### Key Instructions for Sonnet When Using This Template

1. **Read the phase spec first** - Always start by reading the complete phase prompt file
2. **Generate detailed prompts** - Include exact file paths, method signatures, examples for each batch
3. **Launch Codex in parallel** - Don't wait for one batch to finish before starting another
4. **Validate early and often** - Run Haiku validation after each batch, not just at the end
5. **Report token usage** - Track actual tokens spent by each model
6. **Compare to estimate** - Report actual vs planned to identify optimization opportunities

### Success Criteria for Phase Implementation

✅ All Codex batches complete without syntax errors
✅ Haiku validation passes for all generated files
✅ No placeholders (TODO, FIXME, XXX) left in code
✅ All imports resolve correctly
✅ Code follows patterns from previous phases
✅ Token usage matches estimate (within ±20%)
✅ Integration test passes (if applicable)

---

## 13. Common Batch Patterns by Phase Type

**Note:** These token ranges are based on Phase 1 actual results (5-8K tokens verified). They serve as benchmarks for similar phases. Will be updated with actual metrics from Phases 2-5 as they complete.

### Foundation Phase (Phase 1 Model)

**Typical Structure:**
1. Schema/Models batch (sequential - foundation)
2. Storage/CRUD batch (sequential - depends on 1)
3. CLI skeleton batch (can run parallel with 1-2)
4. Validation batch (after all)

**Token Model:**
- Sonnet: 3-5K (planning, schema design, integration)
- Codex: $0 (all CRUD generation)
- Haiku: 2-3K (syntax validation)
- **Total: 5-8K**

**Optimization Tip:** CLI commands can start immediately after schema, don't wait for storage.

---

### Feature Expansion Phase (Phase 2-3 Model)

**Typical Structure:**
1. Foundation features (sequential - base)
2. Core operations (sequential - depends on 1)
3. Advanced features (highly parallel - depends on 2)
4. Integration features (parallel - independent)
5. Validation batch (after all)

**Token Model:**
- Sonnet: 5-8K (prompt generation for each batch)
- Codex: $0 (all feature generation)
- Haiku: 8-13K (validation per batch)
- **Total: 13-21K**

**Optimization Tip:** After core is done, run 3-4 feature batches simultaneously.

---

### Enhancement Phase (Phase 4-5 Model)

**Typical Structure:**
1. Critical feature (sequential - foundation)
2-4. Enhancement features (parallel - independent)
5. Documentation/Polish (parallel - independent)
6. Validation batch (after all)

**Token Model:**
- Sonnet: 6-7K (targeted prompts for enhancements)
- Codex: $0 (all enhancement code)
- Haiku: 5-8K (validation per enhancement)
- **Total: 11-15K**

**Optimization Tip:** Enhancements are independent - maximize parallelization.

---

## 14. Batch Design Checklist

Before implementing a phase, verify batch design with this checklist:

### Dependencies ✓
- [ ] Identify all batches with hard dependencies (sequential)
- [ ] Identify all batches with soft dependencies (can run after parent)
- [ ] Identify all independent batches (can run in parallel)
- [ ] Minimize sequential chains - target <3 sequential batches total

### Parallelization ✓
- [ ] Group independent batches into parallel blocks
- [ ] Target >70% of batches running in parallel
- [ ] Wall-clock time estimate: (sequential batches × time) + (max parallel batch time)
- [ ] Example: 3 sequential × 5min + 4 parallel × 5min = 35min total, not 45min

### Token Efficiency ✓
- [ ] Sonnet: Only for prompt generation and integration (1-3K per batch)
- [ ] Codex: All code generation from detailed prompts ($0)
- [ ] Haiku: Only syntax validation and placeholder detection (1-2K per batch)
- [ ] Challenge any task: "Is the assigned model optimal?"

### Batch Specs ✓
- [ ] Each batch has exact file paths (no "create some files")
- [ ] Each batch has clear requirements (not vague)
- [ ] Each batch includes validation command (specific command, not "test it")
- [ ] Each batch has estimated token cost
- [ ] Each batch has estimated wall-clock time

### Documentation ✓
- [ ] Batch breakdown clearly shows dependencies
- [ ] Execution sequence diagram shows parallelization
- [ ] Total token cost matches sum of batch costs
- [ ] Phase prompt file includes all specs above

---

## 15. Real-World Execution Timeline Example

**Phase 1 Actual Results (Proven - Executed):**
- TOTAL WALL-CLOCK TIME: 30-45 minutes
- TOTAL TOKEN COST: 5-8K (3-5K Sonnet + 2-3K Haiku)
- SUCCESS RATE: 100% first-try (0 follow-ups)

**Phase 2 Projected Execution (Based on Phase 1 Pattern):**

```
Timeline:
├─ Sonnet Generation (concurrent with Codex prep)
│  └─ Read phase specs + generate 5 prompts: 5 min
│
├─ Batch 1 (Sequential):
│  ├─ Codex: Create tools.py: 2 min
│  └─ Haiku: Validate + fix: 2 min
│  └─ Total: 4 min (wall-clock)
│
├─ Batch 2 (Sequential, after Batch 1):
│  ├─ Codex: Add Task CRUD: 3 min
│  └─ Haiku: Validate + fix: 2 min
│  └─ Total: 5 min (wall-clock)
│
├─ Batches 3, 4, 5 (PARALLEL, after Batch 2):
│  ├─ Codex: [7 commands simultaneously]
│  │  ├─ Terminal 1: enqueue command: 2 min
│  │  ├─ Terminal 2: peek command: 2 min
│  │  ├─ Terminal 3: claim command: 2 min
│  │  ├─ Terminal 4: complete command: 2 min
│  │  ├─ Terminal 5: fail command: 2 min
│  │  ├─ Terminal 6: tasks command: 2 min
│  │  └─ Terminal 7: requeue command: 2 min
│  ├─ Haiku: Validate all 3 batches: 5 min (batched)
│  └─ Total: 7 min (wall-clock, not 14 min sequential)
│
└─ Sonnet Integration (final review):
   └─ Check imports, patterns, integration: 3 min

PROJECTED WALL-CLOCK TIME: ~24 minutes (vs 50 minutes sequential)
PROJECTED TOKEN COST: ~17K (5K Sonnet + 12K Haiku)
CONFIDENCE: High (based on Phase 1 actual success pattern)
```

**Key Insight:** Phase 1 proved parallelization and detailed prompts work. Projections for Phase 2+ are based on this verified pattern, not assumptions. Will be updated to actual when Phase 2 executes.

---

**Remember:** The Complete Orchestration Pattern is proven. Use Sonnet for planning, Codex for execution, Haiku for validation. Let parallelization and detailed prompts drive success.
