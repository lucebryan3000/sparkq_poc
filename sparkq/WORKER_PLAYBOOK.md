# SparkQueue Worker Playbook

> **Audience**: Claude-in-chat acting as a SparkQueue task worker
> **Purpose**: Step-by-step guide for executing tasks from queues
> **Last Updated**: 2025-11-30

## Table of Contents
1. [What is a SparkQueue Worker?](#what-is-a-sparkqueue-worker)
2. [Quick Start](#quick-start)
3. [Session Setup](#session-setup)
4. [Task Execution Workflow](#task-execution-workflow)
5. [Task Completion](#task-completion)
6. [Error Handling](#error-handling)
7. [Quick Reference](#quick-reference)
8. [Advanced Patterns](#advanced-patterns)
9. [Example Session](#example-session-end-to-end)

## What is a SparkQueue Worker?

A worker is a Claude-in-chat session that:
1. Runs `queue_runner.py` to poll a specific queue for tasks
2. Reads task prompts streamed to stdout
3. Executes tasks based on `tool_name` directive
4. Marks tasks complete using `task_complete.py`

## Quick Start

```bash
# 1. Start queue runner (connects you to a queue)
python3 sparkq/queue_runner.py --queue "Back End" --watch

# 2. Read the queue instructions (displayed once at start)
# 3. Execute tasks as they stream in
# 4. Mark each task complete with:
./sparkq/task_complete.py <task_id> "<summary>" --data "<result>"
```

**That's it.** The runner streams tasks, you execute them, you mark them done.

## Session Setup

### Step 1: Start the Queue Runner

**Three execution modes:**

1. **Watch mode (recommended for workers):**
   ```bash
   python3 sparkq/queue_runner.py --queue "Back End" --watch
   ```
   - Continuously polls every 30s (configurable)
   - Stays alive, processing tasks as they arrive
   - Best for active work sessions

2. **Run mode (process until empty):**
   ```bash
   python3 sparkq/queue_runner.py --queue "Back End"
   ```
   - Processes all queued tasks
   - Exits when queue is empty
   - Good for batch processing

3. **Once mode (testing):**
   ```bash
   python3 sparkq/queue_runner.py --queue "Back End" --once
   ```
   - Processes exactly one task
   - Exits immediately after
   - Useful for debugging

### Step 2: Read Queue Instructions

When queue_runner starts, it displays queue instructions **once**:

```
================================================================================
📋 QUEUE INSTRUCTIONS
================================================================================
Work on backend API endpoints. Focus on performance and error handling.
All changes must include tests. Follow REST conventions.
================================================================================
```

**Important:**
- These instructions apply to ALL tasks in this queue
- They provide context, guardrails, and scope boundaries
- They remain in your LLM context for subsequent tasks
- Follow them for every task you execute

### Step 3: Wait for Tasks

Queue runner will stream task prompts as they arrive:

```
[runner] Task: #42 (tsk_abc123)
[runner] Tool: llm-sonnet
[runner] Prompt:
Implement GET /api/users endpoint with pagination support

[runner] 🔧 EXECUTE WITH: Current Sonnet session (answer directly)
[runner] ⏳ Status: Running (claimed by worker-mybox-Back_End)
[runner] ✅ COMPLETE WITH: ./sparkq/task_complete.py tsk_abc123 "<summary>" --data "<result>"
```

**You're now in the task execution loop.**

## Task Execution Workflow

### The Loop Pattern

For each task streamed by queue_runner:

```
1. READ task prompt (streamed by queue_runner)
2. UNDERSTAND the tool_name directive
3. EXECUTE using the specified tool
4. CAPTURE the result
5. COMPLETE using task_complete.py
6. REPEAT for next task
```

### Execution by Tool Type

Queue runner tells you exactly how to execute each task via the `🔧 EXECUTE WITH:` line.

#### Tool: `llm-haiku`

**Execute with Haiku model (fast, cheap, simple tasks):**

```bash
[runner] 🔧 EXECUTE WITH: /haiku <prompt>
```

**Action:**
```bash
# Use /haiku command in your current session
/haiku Find all TODO comments in src/api.py
```

**When to expect:**
- Simple searches/lookups
- Syntax validation
- Quick file operations
- Simple text transformations

#### Tool: `llm-codex`

**Execute with Codex ($0 cost, code generation):**

```bash
[runner] 🔧 EXECUTE WITH: /codex <prompt>
```

**Action:**
```bash
# Use /codex command in your current session
/codex Create a GET /api/users endpoint with pagination
```

**When to expect:**
- Code generation from spec
- API endpoint implementation
- Utility function creation
- Test file generation

#### Tool: `llm-sonnet`

**Execute with current Sonnet session (complex reasoning):**

```bash
[runner] 🔧 EXECUTE WITH: Current Sonnet session (answer directly)
```

**Action:**
- Execute directly in your current conversation
- Use all available tools (Read, Write, Edit, Bash, etc.)
- Apply reasoning and judgment
- Make architectural decisions

**When to expect:**
- Complex multi-step tasks
- Architectural decisions
- Integration work
- Analysis requiring reasoning

#### Tool: `run-bash`

**Execute bash script locally:**

```bash
[runner] Tool: run-bash
[runner] Prompt:
sparkq/scripts/tools/deploy-staging.sh main #deploys
```

**Action:**
```bash
# Execute the script exactly as specified
bash sparkq/scripts/tools/deploy-staging.sh main #deploys
```

**Capture stdout/stderr for result_data.**

**Available Scripts (sparkq/scripts/tools/):**
- `deploy-staging.sh` - Deploy to staging environment
- `sample-task.sh` - Example bash task script
- `verify-phase15.sh` - Verification script

#### Tool: `run-python`

**Execute Python script locally:**

```bash
[runner] Tool: run-python
[runner] Prompt:
sparkq/scripts/tools/run-tests.py test_*.py 80
```

**Action:**
```bash
# Execute the script exactly as specified
python3 sparkq/scripts/tools/run-tests.py test_*.py 80
```

**Capture stdout/stderr for result_data.**

**Available Scripts (sparkq/scripts/tools/):**
- `run-tests.py` - Test execution with coverage thresholds
- `queue_selector.py` - Queue selection helper

### Unknown Tool (Fallback)

```bash
[runner] 🔧 EXECUTE WITH: Unknown tool 'custom-tool' - use Sonnet as fallback
```

**Action:**
- Execute with Sonnet (current session)
- Log a warning that tool is unknown
- Consider notifying user after task completion

## Task Completion

### Using task_complete.py

**Signature:**
```bash
./sparkq/task_complete.py <task_id> "<summary>" --data "<result>"
```

**Parameters:**
- `task_id`: From queue_runner output (e.g., `tsk_abc123`)
- `summary`: Brief description of what was accomplished (required)
- `--data`: Detailed result data (optional, defaults to summary)

### Completion Patterns

#### Pattern 1: Simple Task (Summary Only)

```bash
# Task: "Find all TODO comments in src/api.py"
# Result: Found 5 TODOs

./sparkq/task_complete.py tsk_abc123 "Found 5 TODO comments in src/api.py"
```

#### Pattern 2: Task with Detailed Results

```bash
# Task: "Run tests and report coverage"
# Result: All tests passed, 85% coverage

./sparkq/task_complete.py tsk_abc123 \
  "All tests passed, coverage: 85%" \
  --data "Tests: 42 passed, 0 failed. Coverage: 85% (target: 80%). Report: htmlcov/index.html"
```

#### Pattern 3: Code Generation Task

```bash
# Task: "Create GET /api/users endpoint"
# Result: Endpoint created in src/api.py

./sparkq/task_complete.py tsk_abc123 \
  "Created GET /api/users endpoint with pagination" \
  --data "File: src/api.py:450-485. Features: pagination, filtering, error handling. Tests: tests/test_users.py"
```

#### Pattern 4: Script Execution Task

```bash
# Task: Run deployment script
# Result: Deployment succeeded

./sparkq/task_complete.py tsk_abc123 \
  "Deployed to staging successfully" \
  --data "Build: build-12345. URL: https://staging.example.com. Deploy time: 2m 15s"
```

### What Makes a Good Summary?

**Good summaries:**
- ✅ "Created GET /api/users endpoint with pagination (src/api.py:450)"
- ✅ "All tests passed, coverage 85% (42 passed, 0 failed)"
- ✅ "Deployed to staging successfully (build-12345)"
- ✅ "Found 5 TODO comments (3 critical, 2 minor)"

**Bad summaries:**
- ❌ "Done" (too vague)
- ❌ "Completed successfully" (no specifics)
- ❌ "See result_data for details" (summary should be self-contained)

**Golden Rule**: Summary should answer "What was accomplished?" without reading result_data.

### What Makes Good Result Data?

**Include:**
- Specific file paths and line numbers
- Counts and metrics
- URLs or identifiers produced
- Error messages if relevant
- Next steps or follow-up items

**Example:**
```
File: src/api.py:450-485
Endpoint: GET /api/users
Features: pagination (limit/offset), role filtering, error handling
Tests: tests/test_users.py:120-185 (8 test cases)
Coverage: 95% for new code
Next: Add caching layer (logged as TODO)
```

## Edit-First Principle

**CRITICAL: When modifying code, ALWAYS follow this pattern:**

### 1. READ FIRST
**Use Read tool before ANY file modification**

```bash
# Always start with Read
Read tool → src/api.py
```

Never edit a file you haven't read in the current session.

### 2. UNDERSTAND EXISTING PATTERNS
**Study the code before changing it**

- Identify naming conventions
- Understand existing architecture
- Find similar patterns to follow
- Note code style (spacing, imports, structure)
- Look for established error handling patterns
- Check how similar features are implemented

### 3. USE EDIT TOOL (NEVER WRITE)
**Edit preserves context, Write destroys it**

```bash
# ✅ Correct: Use Edit for modifications
Edit tool → old_string → new_string

# ❌ WRONG: Don't use Write on existing files
Write tool → overwrites entire file (data loss risk)
```

**Why Edit not Write:**
- Edit shows exactly what changed (reviewable)
- Edit fails if code changed (prevents conflicts)
- Edit preserves file structure
- Write overwrites everything (dangerous)

### 4. PRESERVE EXISTING STYLE
**Match the codebase exactly**

- Keep same indentation (tabs vs spaces)
- Follow existing import order
- Match naming conventions (camelCase vs snake_case)
- Preserve comment style
- Use same string quote style (' vs ")
- Match line spacing patterns

### 5. MINIMAL CHANGES ONLY
**Change exactly what's needed, nothing more**

❌ **Don't:**
- Refactor surrounding code
- Add extra features "while you're there"
- "Improve" unrelated areas
- Add comments to code you didn't change
- Rename variables not in scope
- Reorganize imports unless task requires it

✅ **Do:**
- Change only what the task asks for
- Keep surrounding code untouched
- Preserve existing comments
- Leave "good enough" code alone

### Edit-First Workflow Example

**Task: "Add error handling to create_user endpoint"**

```bash
# ❌ BAD WORKFLOW (no Read)
Edit tool → (blind change, likely wrong)

# ✅ GOOD WORKFLOW
# Step 1: READ the file first
Read tool → src/api.py

# Step 2: UNDERSTAND the pattern
# Observation: Uses try/except blocks
# Observation: Raises HTTPException
# Observation: Error messages follow format "Failed to {action}: {detail}"
# Observation: Imports: from fastapi import HTTPException

# Step 3: EDIT with matching pattern
Edit tool →
  old_string: "def create_user(data: UserCreate):\n    user = db.create_user(data)"
  new_string: "def create_user(data: UserCreate):\n    try:\n        user = db.create_user(data)\n    except ValueError as e:\n        raise HTTPException(status_code=400, detail=f\"Failed to create user: {e}\")"

# Result: Error handling added, matches existing patterns exactly
```

### Anti-Patterns (DO NOT DO)

#### ❌ Writing Without Reading

```bash
# BAD: Modifying file blind
Write tool → src/api.py → (entire new content)
# Result: Lost all existing code, broke the app
```

#### ❌ Over-Engineering

```bash
# Task: "Fix typo in error message"

# BAD APPROACH:
# Your change: Created new error handling framework with:
#   - Custom exception hierarchy (5 new classes)
#   - Error logging middleware
#   - Error translation system
#   - Telemetry integration

# GOOD APPROACH:
Edit tool → old_string: "Eror" → new_string: "Error"
# Result: Fixed typo, nothing else changed
```

#### ❌ Scope Creep

```bash
# Task: "Add pagination to /users endpoint"

# BAD: Adding unrequested features
# Your changes:
#   - Added pagination ✓ (requested)
#   - Added caching ✗ (not requested)
#   - Added rate limiting ✗ (not requested)
#   - Added telemetry ✗ (not requested)
#   - Refactored entire auth system ✗ (definitely not requested)

# GOOD: Only add pagination
Edit tool → Add limit/offset params to /users endpoint
# Result: Pagination added, nothing else touched
```

#### ❌ Refactoring Unrelated Code

```bash
# Task: "Fix bug in line 50"

# BAD: Changing code not mentioned in task
# Your changes:
#   - Fixed bug in line 50 ✓ (requested)
#   - Refactored lines 1-100 ✗ (not requested)
#   - Renamed 15 variables ✗ (not requested)
#   - Reorganized imports ✗ (not requested)
#   - Added type hints ✗ (not requested)
#   - "Improved" error messages ✗ (not requested)

# GOOD: Fix only line 50
Edit tool → Fix bug in line 50
# Result: Bug fixed, everything else unchanged
```

### Golden Rules

1. **If you didn't Read it, don't Edit it**
2. **If the task doesn't ask for it, don't add it**
3. **Edit shows what changed, Write hides it**
4. **Match existing patterns exactly**
5. **When in doubt, change less**

### Quick Checklist

Before making ANY code change, verify:

- [ ] Have you Read the file first?
- [ ] Do you understand the existing patterns?
- [ ] Are you using Edit (not Write)?
- [ ] Are you matching the existing style?
- [ ] Are you changing ONLY what's requested?
- [ ] Have you avoided refactoring unrelated code?
- [ ] Have you avoided adding unrequested features?

If you can't check all boxes, STOP and reconsider your approach.

## Error Handling

### Error Types and Recovery

#### Error: task_complete.py Fails

**Symptom:**
```bash
./sparkq/task_complete.py tsk_abc123 "Summary"
❌ Error: 404 Not Found
Response: {"detail": "Task not found"}
```

**Possible Causes:**
1. Task ID typo (check queue_runner output)
2. Task already completed (race condition)
3. SparkQ server down

**Recovery:**
1. Verify task ID from queue_runner output
2. Check task status via API:
   ```bash
   curl http://localhost:5005/api/tasks/tsk_abc123
   ```
3. If task already succeeded/failed, move on to next task
4. If server down, restart it and retry

#### Error: Script Execution Fails

**Symptom:**
```bash
bash ./scripts/deploy.sh
Error: Branch 'main' not found
```

**Recovery:**
1. Mark task as failed with error details:
   ```bash
   ./sparkq/task_complete.py tsk_abc123 \
     "Deployment failed: branch 'main' not found" \
     --data "Error: git branch 'main' does not exist. Available branches: [list]. User intervention required."
   ```
2. Let queue_runner continue (error is captured in task result)

**Note:** Failed task completion still uses `task_complete.py` (not a separate fail script). The summary should indicate failure.

#### Error: Queue Runner Stops

**Symptom:**
- No new tasks streaming
- No queue_runner output

**Recovery:**
1. Check if process is alive:
   ```bash
   ps aux | grep queue_runner
   ```
2. Check for error messages in queue_runner output
3. Restart queue_runner:
   ```bash
   python3 sparkq/queue_runner.py --queue "Back End" --watch
   ```
4. Resume from where you left off (already-completed tasks won't re-run)

#### Error: Unknown Tool Name

**Symptom:**
```bash
[runner] 🔧 EXECUTE WITH: Unknown tool 'xyz' - use Sonnet as fallback
```

**Recovery:**
1. Execute using Sonnet (current session)
2. Complete task normally
3. Optionally notify user that tool 'xyz' is not configured

#### Error: Task Timeout (Stale Warning)

**Symptom:**
- Task takes longer than timeout
- UI shows yellow ⚠️ WARNING badge

**What Happens:**
- Task marked as `stale_warned_at` after 1× timeout
- Task will auto-fail after 2× timeout

**Recovery:**
1. Complete task as quickly as possible
2. If task will exceed 2× timeout, stop work and mark failed:
   ```bash
   ./sparkq/task_complete.py tsk_abc123 \
     "Task incomplete due to timeout" \
     --data "Partially completed: [what was done]. Remaining: [what's left]. Recommend increasing timeout or breaking into smaller tasks."
   ```
3. Queue will auto-fail at 2× timeout if not completed

### Rate Limiting and Throttling

**If executing many tasks rapidly:**
- Queue runner auto-throttles (30s poll interval in --watch mode)
- For --run mode, tasks execute as fast as you can complete them
- No built-in rate limiting (assumes dev environment)

**Best practice:**
- Let queue_runner pace you naturally
- Don't manually batch-complete tasks (can cause race conditions)

## Quick Reference

### Essential Commands

```bash
# Start queue runner (watch mode)
python3 sparkq/queue_runner.py --queue "Back End" --watch

# Complete a task (simple)
./sparkq/task_complete.py tsk_abc123 "Summary of work done"

# Complete a task (with details)
./sparkq/task_complete.py tsk_abc123 "Summary" --data "Detailed results"

# Check task status
curl http://localhost:5005/api/tasks/tsk_abc123

# List all tasks in queue
curl http://localhost:5005/api/queues/{queue_id}/tasks
```

### Task Loop Pattern (Copy-Paste Template)

```markdown
# ========================================
# TASK EXECUTION TEMPLATE
# ========================================

# 1. READ task from queue_runner output
TASK_ID="tsk_abc123"
TOOL="llm-sonnet"
PROMPT="<task prompt here>"

# 2. EXECUTE based on tool
# - llm-haiku → /haiku <prompt>
# - llm-codex → /codex <prompt>
# - llm-sonnet → Execute directly
# - run-bash → bash <script>
# - run-python → python3 <script>

# 3. CAPTURE result
SUMMARY="<what was accomplished>"
DETAILS="<detailed results, file paths, metrics>"

# 4. COMPLETE task
./sparkq/task_complete.py "$TASK_ID" "$SUMMARY" --data "$DETAILS"

# 5. REPEAT for next task
```

### Delegation Decision Tree

```
Task received
│
├─ Tool: llm-haiku
│  └─ Use /haiku command
│
├─ Tool: llm-codex
│  └─ Use /codex command
│
├─ Tool: llm-sonnet
│  └─ Execute in current session
│
├─ Tool: run-bash
│  └─ Execute: bash <script>
│
├─ Tool: run-python
│  └─ Execute: python3 <script>
│
└─ Tool: unknown
   └─ Fallback to Sonnet + log warning
```

### Common Pitfalls

**❌ Don't:**
- Skip reading queue instructions
- Mark tasks complete before actually executing them
- Use task IDs from previous sessions (always use current stream)
- Batch-complete tasks manually (causes race conditions)
- Ignore tool_name directive (always execute with specified tool)

**✅ Do:**
- Read queue instructions at session start
- Execute tasks in order as streamed
- Use task_complete.py for every task
- Provide descriptive summaries
- Capture detailed results in --data
- Follow queue instructions for all tasks

### Troubleshooting Checklist

**Task not streaming?**
- [ ] Queue runner process still alive? (`ps aux | grep queue_runner`)
- [ ] Queue has tasks? (check UI at http://localhost:5005/)
- [ ] SparkQ server running? (`curl http://localhost:5005/api/health`)

**task_complete.py fails?**
- [ ] Task ID correct? (copy from queue_runner output)
- [ ] Task still in 'running' status? (not already completed)
- [ ] Server reachable? (`curl http://localhost:5005/api/health`)

**Timeout warnings?**
- [ ] Task taking longer than expected?
- [ ] Warned at 1× timeout, will auto-fail at 2×
- [ ] Complete ASAP or mark failed with partial results

### Configuration Files

**Queue runner config (`sparkq.yml`):**
```yaml
queue_runner:
  base_url: http://192.168.1.100:5005  # API endpoint
  poll_interval: 30                     # Seconds between polls (--watch mode)
  auto_fail_interval_seconds: 60       # How often to check for stale tasks
```

**Task classes and timeouts:**
```yaml
task_classes:
  FAST_SCRIPT:
    timeout: 30      # 30 seconds
  MEDIUM_SCRIPT:
    timeout: 300     # 5 minutes
  LLM_LITE:
    timeout: 300     # 5 minutes
  LLM_HEAVY:
    timeout: 900     # 15 minutes

tools:
  run-bash:
    task_class: MEDIUM_SCRIPT
  run-python:
    task_class: MEDIUM_SCRIPT
  llm-haiku:
    task_class: LLM_LITE
  llm-sonnet:
    task_class: LLM_HEAVY
  llm-codex:
    task_class: LLM_HEAVY
```

## Advanced Patterns

### Multi-Step Tasks

For complex tasks requiring multiple steps:

```bash
# Task: "Refactor authentication module"

# Step 1: Analyze current code (Sonnet)
# ... analysis work ...

# Step 2: Generate refactored code (Codex)
/codex Refactor authentication module based on analysis: [paste analysis]

# Step 3: Run tests (Bash)
bash sparkq/scripts/tools/run-tests.py

# Complete with comprehensive summary
./sparkq/task_complete.py tsk_abc123 \
  "Refactored authentication module, all tests pass" \
  --data "Files modified: src/auth.py (lines 50-200), tests/test_auth.py (lines 30-120). Tests: 15 passed, 0 failed. Coverage: 92%."
```

### Partial Completion (Timeout Risk)

If task will exceed 2× timeout:

```bash
# You've been working 12 minutes, timeout is 15 minutes (approaching 2× = 30 min)

./sparkq/task_complete.py tsk_abc123 \
  "Partially completed: authentication refactor" \
  --data "Completed: User login flow (src/auth.py:50-150). Remaining: Password reset flow, session management. Recommend splitting into subtasks. Current progress: 60%."
```

**Note:** Partial completion is better than auto-fail. Capture what was done.

### Error Task Completion

For tasks that failed execution:

```bash
# Script failed with error

./sparkq/task_complete.py tsk_abc123 \
  "Deployment failed: database connection error" \
  --data "Error: psycopg2.OperationalError: could not connect to server. Deployment rollback completed. No changes applied to production. User intervention required: check database server status."
```

**Key:** Summary indicates failure, data contains error details and context.

### Long-Running Tasks

For tasks that legitimately take > timeout:

1. **Before starting**, notify user that task may timeout
2. **During execution**, provide progress updates if possible
3. **If timeout warning appears**, decide:
   - Can you finish before 2×? → Continue
   - Will exceed 2×? → Mark partial completion
4. **After completion**, suggest increasing timeout for similar tasks

### Context Preservation

Queue runner maintains context across tasks in a single session:

```bash
# Task 1: Analyze codebase
/haiku Find all authentication-related files
# Result: 5 files identified

# Task 2: Refactor based on Task 1
# You still have context from Task 1 analysis
# No need to re-analyze
```

**Benefit:** Faster execution, shared context, consistent decisions.

**Risk:** Context pollution (use /clear if needed between sessions).

## Example Session (End-to-End)

### Full Worker Session

```bash
# ========================================
# SESSION START
# ========================================

# Terminal: Start queue runner
$ python3 sparkq/queue_runner.py --queue "Back End" --watch

[runner] Mode: Continuous polling (poll every 30s) (--watch)
[runner] Queue: Back End (que_xyz789)
[runner] Worker: worker-mybox-Back_End
[runner] API: http://192.168.1.100:5005

================================================================================
📋 QUEUE INSTRUCTIONS
================================================================================
Work on backend API endpoints. All changes must include tests.
Follow REST conventions. Prioritize performance and error handling.
================================================================================

[runner] Polling for tasks... (press Ctrl+C to stop)

# ----------------------------------------
# TASK 1: Simple Haiku Search
# ----------------------------------------

[runner] Task: #42 (tsk_001)
[runner] Tool: llm-haiku
[runner] Prompt:
Find all TODO comments in src/api.py

[runner] 🔧 EXECUTE WITH: /haiku Find all TODO comments in src/api.py
[runner] ⏳ Status: Running (claimed by worker-mybox-Back_End)
[runner] ✅ COMPLETE WITH: ./sparkq/task_complete.py tsk_001 "<summary>" --data "<result>"

# Claude: Execute with Haiku
/haiku Find all TODO comments in src/api.py

# Haiku responds:
# Found 5 TODO comments:
# 1. Line 150: TODO: Add rate limiting
# 2. Line 320: TODO: Implement caching
# ...

# Claude: Mark complete
$ ./sparkq/task_complete.py tsk_001 \
  "Found 5 TODO comments in src/api.py" \
  --data "Line 150: Add rate limiting, Line 320: Implement caching, Line 450: Optimize query, Line 600: Add logging, Line 750: Refactor error handling"

✅ Task tsk_001 marked as succeeded

# ----------------------------------------
# TASK 2: Code Generation with Codex
# ----------------------------------------

[runner] Task: #43 (tsk_002)
[runner] Tool: llm-codex
[runner] Prompt:
Create GET /api/users endpoint with pagination support

[runner] 🔧 EXECUTE WITH: /codex Create GET /api/users endpoint with pagination support
[runner] ⏳ Status: Running (claimed by worker-mybox-Back_End)
[runner] ✅ COMPLETE WITH: ./sparkq/task_complete.py tsk_002 "<summary>" --data "<result>"

# Claude: Execute with Codex
/codex Create GET /api/users endpoint with pagination support. Include limit/offset params, error handling, and tests.

# Codex generates code in src/api.py and tests/test_users.py

# Claude: Mark complete
$ ./sparkq/task_complete.py tsk_002 \
  "Created GET /api/users endpoint with pagination" \
  --data "File: src/api.py:850-920. Features: pagination (limit/offset), role filtering, error handling (400/404/500). Tests: tests/test_users.py:300-380 (8 test cases). All tests pass."

✅ Task tsk_002 marked as succeeded

# ----------------------------------------
# TASK 3: Complex Sonnet Task
# ----------------------------------------

[runner] Task: #44 (tsk_003)
[runner] Tool: llm-sonnet
[runner] Prompt:
Refactor authentication module to use JWT tokens instead of sessions

[runner] 🔧 EXECUTE WITH: Current Sonnet session (answer directly)
[runner] ⏳ Status: Running (claimed by worker-mybox-Back_End)
[runner] ✅ COMPLETE WITH: ./sparkq/task_complete.py tsk_003 "<summary>" --data "<result>"

# Claude: Execute directly (Sonnet)
# ... reads src/auth.py, analyzes current session-based auth ...
# ... generates new JWT-based implementation ...
# ... updates tests ...
# ... runs test suite ...

# Claude: Mark complete
$ ./sparkq/task_complete.py tsk_003 \
  "Refactored auth module to JWT tokens, all tests pass" \
  --data "Files modified: src/auth.py (200 lines), src/middleware.py (50 lines), tests/test_auth.py (100 lines). Migration: Added JWT_SECRET env var, updated docs. Tests: 22 passed, 0 failed. Coverage: 95%. Breaking change: Clients must use Authorization header."

✅ Task tsk_003 marked as succeeded

# ----------------------------------------
# TASK 4: Script Execution
# ----------------------------------------

[runner] Task: #45 (tsk_004)
[runner] Tool: run-bash
[runner] Prompt:
$ bash sparkq/scripts/tools/deploy-staging.sh main #deploys

[runner] Tool: run-bash
[runner] 🔧 EXECUTE WITH: Unknown tool 'run-bash' - use Sonnet as fallback
[runner] ⏳ Status: Running (claimed by worker-mybox-Back_End)
[runner] ✅ COMPLETE WITH: ./sparkq/task_complete.py tsk_004 "<summary>" --data "<result>"

# Claude: Execute bash script
$ bash sparkq/scripts/tools/deploy-staging.sh main #deploys

Deploying branch: main
Running migrations... OK
Cache warmup... OK
Deployment URL: https://staging.example.com
Build ID: build-67890
Deploy time: 2m 15s

# Claude: Mark complete
$ ./sparkq/task_complete.py tsk_004 \
  "Deployed to staging successfully" \
  --data "Branch: main. Build: build-67890. URL: https://staging.example.com. Deploy time: 2m 15s. Migrations: 3 applied. Cache warmed. Health check: OK."

✅ Task tsk_004 marked as succeeded

# ----------------------------------------
# IDLE / POLLING
# ----------------------------------------

[runner] Queue empty, polling in 30s...
[runner] Queue empty, polling in 30s...

# ... worker waits for new tasks ...

# ========================================
# SESSION END (User presses Ctrl+C)
# ========================================

^C[runner] Received signal 2, shutting down...
[runner] Released lock: /tmp/sparkq-runner-que_xyz789.lock
```

### Session Summary

**Tasks completed:** 4
**Execution time:** ~20 minutes
**Tools used:** Haiku (1), Codex (1), Sonnet (2)
**Pattern:**
1. Queue runner streams tasks
2. Claude executes based on tool_name
3. Claude marks complete with task_complete.py
4. Repeat

**Key Takeaways:**
- Follow tool_name directive for each task
- Provide detailed summaries and result_data
- Context preserved across tasks (same session)
- Queue runner handles polling and claiming
- Worker focuses only on execution and completion

---

## AI Models Execution Guidelines

### When Processing Tasks: Model Selection Logic

1. **Check Queue Instructions First**
   - Look for keywords: "haiku", "codex", "sonnet", "quick check", "generate code"
   - Example: If instructions say "Use Haiku for validation", prefer Haiku for syntax/import tasks

2. **Use Task Payload Size as Hint**
   - < 50 words + simple check → Haiku (fast, cheap)
   - Spec-based code generation → Codex (free, pattern-based)
   - Multi-step orchestration → Sonnet (reasoning-heavy)

3. **Fallback to Task Class**
   - `LLM_LITE` → Consider Haiku if task is simple
   - `LLM_HEAVY` → Consider Codex if task is code-heavy, Sonnet otherwise
   - `FAST_SCRIPT`, `MEDIUM_SCRIPT` → Execute as Bash/Python (no LLM needed)

4. **Respect Codex Session Continuity**
   - If queue has `codex_session_id`, use `codex exec resume <session_id>` for follow-up Codex tasks
   - Maintains context across multi-task workflows
   - Check queue config: `curl http://localhost:5005/api/queues/{queue_id} | jq .codex_session_id`

### Model Delegation Examples

**Example 1: Syntax Validation Task**
- Task: "Validate syntax of sparkq/src/api.py"
- Queue instructions: "Use Haiku for quick checks"
- **Action**: Use Haiku → `python -m py_compile sparkq/src/api.py`

**Example 2: Code Generation Task**
- Task: "Generate CRUD operations for Widget model"
- Queue has `codex_session_id`: `"abc123"`
- **Action**: Use Codex with resume → `codex exec resume abc123 "Generate CRUD..."`

**Example 3: Complex Integration Task**
- Task: "Wire Codex session management into queue_runner"
- Requires reading multiple files, designing logic, coordinating components
- **Action**: Use Sonnet (you!) → Multi-step workflow with Edit/Write tools

### Cost Optimization Reminder

- **Haiku**: ~15 task types (see `.claude/CLAUDE.md` for full list) → 1× token cost
- **Codex**: ~15 task types (see `.claude/CLAUDE.md` for full list) → $0 tokens
- **Sonnet**: Orchestration, reasoning, integration → 3× token cost

**Golden Rule**: Delegate to cheapest model that can complete the task successfully.
