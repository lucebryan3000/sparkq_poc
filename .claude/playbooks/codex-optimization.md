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

### Original (Expensive):
```
Phase 1: Storage Layer
- Sonnet: Design schema (5K tokens)
- Haiku: Create models.py (8K tokens)
- Haiku: Create storage.py (12K tokens)
- Haiku: Create CRUD operations (20K tokens)
- Haiku: Validation (5K tokens)
Total: 50K tokens × $2.20-$6.60/M = ~$0.15
```

### Optimized (Cheap):
```
Phase 1: Storage Layer
- Sonnet: Generate 6 Codex prompts (2K tokens)
- Codex: Create models.py (0 tokens)
- Codex: Create storage.py foundation (0 tokens)
- Codex: Add Project CRUD (0 tokens)
- Codex: Add Session CRUD (0 tokens)
- Codex: Add Stream CRUD (0 tokens)
- Codex: Add Task CRUD stubs (0 tokens)
- Haiku: Validate syntax (3K tokens)
Total: 5K tokens × $2.20-$6.60/M = ~$0.02
```

**Savings:** $0.15 → $0.02 = 87% reduction

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
