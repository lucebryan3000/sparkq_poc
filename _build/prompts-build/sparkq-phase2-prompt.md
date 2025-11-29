# SparkQ Phase 2: Worker Commands - Complete Orchestration

> **Execution Model:** Sonnet (prompts) → Codex (code) → Haiku (validation)
> **Token Budget:** ~17K total (5K Sonnet + 12K Haiku | Codex $0)
> **Duration:** ~2-3 hours
> **Output:** Complete worker protocol (enqueue, peek, claim, complete, fail, tasks, requeue)

---

## Execution Overview

### Step 1: Sonnet Task (Prompt Generation - 1K tokens)

**Read these inputs:**
- This phase prompt file (context)
- FRD v7.5 Sections 8, 10, 12, 14.4-14.5 (specifications)
- Phase 1 implementation (for patterns and dependencies)

**Generate:**
- 5 complete Codex prompts (one per batch below)
- Each with full spec, file paths, requirements, validation

**Your role:** Read this file, extract batch specifications, create detailed prompts ready for Codex.

### Step 2: Codex Execution (Code Generation - $0 cost)

Launch batches in sequence or parallel as indicated. Each batch contains independent tasks that can run simultaneously.

### Step 3: Haiku Validation (Syntax Check - ~1K tokens per batch)

Run validation commands after each batch completes. Fix any syntax errors before moving to next batch.

### Step 4: Sonnet Integration (Review - 2K tokens)

After all batches complete, Sonnet reviews files for:
- Consistent patterns with Phase 1
- Proper imports and dependencies
- Task integration

---

## Context

You are implementing **SparkQ Phase 2** - the worker commands that enable Claude Code sessions to claim and execute tasks.

**Prerequisites:**
- Phase 1 complete (storage.py, models.py, cli.py skeleton, session/stream CRUD)
- SQLite database initialized with schema
- sparkq.yml configuration exists

**Reference Documents:**
- FRD v7.5 Section 8 (Task Model)
- FRD v7.5 Section 10 (Tool Registry)
- FRD v7.5 Section 12 (Worker Contract)
- FRD v7.5 Section 14.4-14.5 (Task & Worker Commands)

**Key Constraints:**
- Tasks use FIFO ordering per stream
- `result.summary` is REQUIRED on complete (CLI enforces)
- `claim` returns full task + stream instructions
- `claim` without `--stream` shows error + lists streams with queued tasks

---

## Phase 2.1: Tool Registry + Task CRUD

### Batch 1 (Foundation - Sequential)

```bash
# Terminal 1: Create tools.py (tool registry + timeout resolution)
codex exec --full-auto -C /home/luce/apps/sparkqueue "
Context: SparkQ Phase 2.1 - Tool Registry
Reference: FRD v7.5 Section 10 (Tool Registry)

Task: Create src/tools.py with ToolRegistry class

File to create: sparkq/src/tools.py

Requirements:
- Load tools from sparkq.yml
- Manage task class timeouts (FAST_SCRIPT=30s, MEDIUM_SCRIPT=300s, LLM_LITE=300s, LLM_HEAVY=900s)
- Allow timeout overrides at multiple levels (override > tool config > task class default)
- Singleton pattern with get_registry() and reload_registry()
- Handle missing config gracefully

Specification:
Use this exact implementation structure:
1. TASK_CLASS_DEFAULTS dict with 4 timeout classes
2. ToolRegistry class with methods:
   - __init__(config_path='sparkq.yml')
   - _load() - parses sparkq.yml
   - reload() - resets and reloads
   - get_tool(name) -> Optional[Dict]
   - list_tools() -> Dict
   - get_timeout(tool_name, override=None) -> int (3-level priority)
   - get_task_class(tool_name) -> str
3. Module-level _registry singleton
4. get_registry() function
5. reload_registry() function

Validation: python -m py_compile sparkq/src/tools.py
"
```

### Batch 2 (Task CRUD - Parallel after foundation)

```bash
# Terminal 1: Add Task CRUD to storage.py
codex exec --full-auto -C /home/luce/apps/sparkqueue "
Context: SparkQ Phase 2.1 - Task CRUD
Reference: FRD v7.5 Section 8 (Task Model)

Task: Add complete Task CRUD methods to sparkq/src/storage.py Storage class

File to modify: sparkq/src/storage.py

Methods to implement:
1. create_task(stream_id, tool_name, task_class, prompt_path=None, timeout=None, metadata=None) -> dict
   - Create new task with status='queued'
   - Use now_iso() for created_at
   - Return task dict with all fields including task_id

2. get_task(task_id) -> Optional[dict]
   - Return task by ID or None
   - Convert sqlite3.Row to dict

3. list_tasks(stream_id=None, status=None, limit=None) -> List[dict]
   - Filter by stream_id (optional)
   - Filter by status (optional)
   - Apply LIMIT if provided
   - Return list of task dicts

4. get_oldest_queued_task(stream_id) -> Optional[dict]
   - Get oldest queued task for stream (FIFO order)
   - Order by created_at ASC

5. claim_task(task_id) -> dict
   - Update task: status='claimed', claimed_at=now_iso(), worker_session_id=<auto>
   - Return updated task dict

6. complete_task(task_id, result_summary, result_data=None) -> dict
   - Require result_summary (enforce at CLI level)
   - Update: status='succeeded', completed_at=now_iso(), result_summary, result_data
   - Return updated task dict

7. fail_task(task_id, error_message, error_type=None) -> dict
   - Update: status='failed', failed_at=now_iso(), error_message, error_type
   - Return updated task dict

8. requeue_task(task_id) -> dict
   - Update: status='queued', claimed_at=NULL, completed_at=NULL, failed_at=NULL
   - Reset worker markers
   - Return updated task dict

9. purge_old_tasks(older_than_days=3) -> int
   - Delete succeeded/failed tasks older than N days
   - Return count of deleted tasks

Patterns:
- Use self.connection() context manager for all DB operations
- Convert sqlite3.Row to dict with: dict(row) after row_factory = sqlite3.Row
- Use now_iso() for all timestamps (imported from models)

Validation: python -m py_compile sparkq/src/storage.py
"
```

---

## Phase 2.2: Enqueue + Peek Commands

### Batch 3 (Parallel)

```bash
# Terminal 1: Implement enqueue command
codex exec --full-auto -C /home/luce/apps/sparkqueue "
Context: SparkQ Phase 2.2 - Enqueue Command
Reference: FRD v7.5 Section 14.4

Task: Implement sparkq_enqueue() function in sparkq/src/cli.py

File to modify: sparkq/src/cli.py

Function signature:
def sparkq_enqueue(
    stream: str = typer.Option(..., help='Stream name'),
    tool: str = typer.Option(..., help='Tool name to execute'),
    task_class: str = typer.Option('MEDIUM_SCRIPT', help='Task class (FAST_SCRIPT, MEDIUM_SCRIPT, LLM_LITE, LLM_HEAVY)'),
    timeout: Optional[int] = typer.Option(None, help='Override timeout in seconds'),
    prompt_file: Optional[str] = typer.Option(None, help='Path to prompt file'),
    metadata: Optional[str] = typer.Option(None, help='JSON metadata')
):

Implementation:
1. Validate stream exists (via storage.get_stream)
2. Validate tool exists in registry
3. Load prompt from file if provided (read file, pass content)
4. Parse metadata JSON if provided
5. Call storage.create_task() with all parameters
6. Output task ID: 'Task {task_id} enqueued to stream {stream}'

Error handling:
- Stream not found: 'Error: Stream not found'
- Tool not registered: 'Error: Tool not registered'
- Invalid JSON metadata: 'Error: Invalid metadata JSON'
- File not found: 'Error: Prompt file not found'

Validation: python -m py_compile sparkq/src/cli.py
"
```

```bash
# Terminal 2: Implement peek command
codex exec --full-auto -C /home/luce/apps/sparkqueue "
Context: SparkQ Phase 2.2 - Peek Command
Reference: FRD v7.5 Section 14.4

Task: Implement sparkq_peek() function in sparkq/src/cli.py

File to modify: sparkq/src/cli.py

Function signature:
def sparkq_peek(
    stream: str = typer.Option(..., help='Stream name')
):

Implementation:
1. Get oldest queued task for stream: storage.get_oldest_queued_task(stream_id)
2. If no task: Output 'No queued tasks'
3. If task exists: Output task details in format:
   Task {task_id}: {tool_name} (task_class: {task_class})
   Queued: {created_at}
   (prompt shown if available)

Error handling:
- Stream not found: 'Error: Stream not found'

Validation: python -m py_compile sparkq/src/cli.py
"
```

---

## Phase 2.3: Claim + Complete + Fail Commands

### Batch 4 (Parallel)

```bash
# Terminal 1: Implement claim command
codex exec --full-auto -C /home/luce/apps/sparkqueue "
Context: SparkQ Phase 2.3 - Claim Command
Reference: FRD v7.5 Section 14.4

Task: Implement sparkq_claim() function in sparkq/src/cli.py

File to modify: sparkq/src/cli.py

Function signature:
def sparkq_claim(
    stream: Optional[str] = typer.Option(None, help='Stream name')
):

Implementation:
1. If stream is None:
   - List all streams with queued tasks
   - Output: 'Available streams: stream1, stream2, ...'
   - Show task count per stream
   - Exit without error
2. If stream provided:
   - Get oldest queued task: storage.get_oldest_queued_task(stream_id)
   - If no task: 'No queued tasks in stream {stream}'
   - If task exists:
     a. Claim it: storage.claim_task(task_id)
     b. Get stream details: storage.get_stream(stream_id)
     c. Output full task + stream instructions:
        Task {task_id}: {tool_name}
        Stream: {stream_name}
        Instructions: {stream.instructions (if any)}
        Prompt: {task.prompt (if any)}

Error handling:
- Stream not found: 'Error: Stream not found'

Validation: python -m py_compile sparkq/src/cli.py
"
```

```bash
# Terminal 2: Implement complete command
codex exec --full-auto -C /home/luce/apps/sparkqueue "
Context: SparkQ Phase 2.3 - Complete Command
Reference: FRD v7.5 Section 14.4

Task: Implement sparkq_complete() function in sparkq/src/cli.py

File to modify: sparkq/src/cli.py

Function signature:
def sparkq_complete(
    task_id: str = typer.Option(..., help='Task ID'),
    summary: str = typer.Option(..., help='Result summary (REQUIRED)'),
    result_file: Optional[str] = typer.Option(None, help='Path to detailed result file')
):

Implementation:
1. Get task: storage.get_task(task_id)
   - Error if not found: 'Error: Task not found'
   - Error if not claimed: 'Error: Task must be claimed first'
2. Load result data from file if provided
3. Call storage.complete_task(task_id, summary, result_data)
4. Output: 'Task {task_id} marked as succeeded'

Error handling:
- Task not found: 'Error: Task not found'
- Task not claimed: 'Error: Task must be claimed first'
- Result file not found: 'Error: Result file not found'
- Empty summary: 'Error: Result summary is required'

Validation: python -m py_compile sparkq/src/cli.py
"
```

```bash
# Terminal 3: Implement fail command
codex exec --full-auto -C /home/luce/apps/sparkqueue "
Context: SparkQ Phase 2.3 - Fail Command
Reference: FRD v7.5 Section 14.4

Task: Implement sparkq_fail() function in sparkq/src/cli.py

File to modify: sparkq/src/cli.py

Function signature:
def sparkq_fail(
    task_id: str = typer.Option(..., help='Task ID'),
    error: str = typer.Option(..., help='Error message'),
    error_type: Optional[str] = typer.Option(None, help='Error type (optional)')
):

Implementation:
1. Get task: storage.get_task(task_id)
   - Error if not found: 'Error: Task not found'
2. Call storage.fail_task(task_id, error, error_type)
3. Output: 'Task {task_id} marked as failed'

Error handling:
- Task not found: 'Error: Task not found'
- Empty error message: 'Error: Error message is required'

Validation: python -m py_compile sparkq/src/cli.py
"
```

---

## Phase 2.4: Task Listing + Requeue Commands

### Batch 5 (Parallel)

```bash
# Terminal 1: Implement tasks command (list with filters)
codex exec --full-auto -C /home/luce/apps/sparkqueue "
Context: SparkQ Phase 2.4 - Tasks List Command
Reference: FRD v7.5 Section 14.4

Task: Implement sparkq_tasks() function in sparkq/src/cli.py

File to modify: sparkq/src/cli.py

Function signature:
def sparkq_tasks(
    stream: Optional[str] = typer.Option(None, help='Filter by stream'),
    status: Optional[str] = typer.Option(None, help='Filter by status (queued, claimed, succeeded, failed)'),
    limit: Optional[int] = typer.Option(None, help='Limit results')
):

Implementation:
1. Call storage.list_tasks(stream_id=stream, status=status, limit=limit)
2. If no tasks: 'No tasks found'
3. Format output as table:
   ID | Stream | Tool | Status | Created | Worker
   ... one row per task ...
4. Show count at end: 'Showing X task(s)'

Formatting:
- Truncate IDs to 12 chars
- Status values: queued, claimed, succeeded, failed
- Timestamps: ISO format (from created_at)
- Worker session ID: show first 8 chars or '-' if none

Error handling:
- Stream not found: 'Error: Stream not found' (optional - can skip if not found)
- Invalid status: 'Error: Invalid status'

Validation: python -m py_compile sparkq/src/cli.py
"
```

```bash
# Terminal 2: Implement requeue command
codex exec --full-auto -C /home/luce/apps/sparkqueue "
Context: SparkQ Phase 2.4 - Requeue Command
Reference: FRD v7.5 Section 14.4

Task: Implement sparkq_requeue() function in sparkq/src/cli.py

File to modify: sparkq/src/cli.py

Function signature:
def sparkq_requeue(
    task_id: str = typer.Option(..., help='Task ID to requeue')
):

Implementation:
1. Get task: storage.get_task(task_id)
   - Error if not found: 'Error: Task not found'
2. Check task status - can only requeue if claimed, succeeded, or failed
   - Error if queued: 'Error: Task is already queued'
3. Call storage.requeue_task(task_id)
4. Output: 'Task {task_id} requeued'

Error handling:
- Task not found: 'Error: Task not found'
- Already queued: 'Error: Task is already queued'

Validation: python -m py_compile sparkq/src/cli.py
"
```

---

## Complete Execution Workflow

### Batch Breakdown (Ready for Codex)

**5 Batches total, organized for sequential/parallel execution:**

#### Batch 1: Tool Registry (Sequential)
- **Sonnet generates:** 1 Codex prompt for tools.py
- **Codex executes:** Create tools.py with ToolRegistry class
- **Haiku validates:** `python -m py_compile sparkq/src/tools.py`
- **Tokens:** 1K (Sonnet) + 0 (Codex) + 1K (Haiku) = 2K

#### Batch 2: Task CRUD (Sequential - depends on Batch 1)
- **Sonnet generates:** 1 Codex prompt for storage.py Task methods
- **Codex executes:** Add 9 Task CRUD methods to storage.py
- **Haiku validates:** `python -m py_compile sparkq/src/storage.py`
- **Tokens:** 1K (Sonnet) + 0 (Codex) + 1K (Haiku) = 2K

#### Batch 3: Enqueue + Peek (Parallel - depends on Batch 2)
- **Sonnet generates:** 2 Codex prompts
- **Codex executes (parallel):**
  - Terminal 1: Implement enqueue command
  - Terminal 2: Implement peek command
- **Haiku validates:** `python -m py_compile sparkq/src/cli.py`
- **Tokens:** 1K (Sonnet) + 0 (Codex) + 1K (Haiku) = 2K

#### Batch 4: Claim + Complete + Fail (Parallel - depends on Batch 2)
- **Sonnet generates:** 3 Codex prompts
- **Codex executes (parallel):**
  - Terminal 1: Implement claim command
  - Terminal 2: Implement complete command
  - Terminal 3: Implement fail command
- **Haiku validates:** `python -m py_compile sparkq/src/cli.py`
- **Tokens:** 1K (Sonnet) + 0 (Codex) + 2K (Haiku) = 3K

#### Batch 5: Tasks + Requeue (Parallel - depends on Batch 2)
- **Sonnet generates:** 2 Codex prompts
- **Codex executes (parallel):**
  - Terminal 1: Implement tasks command with filters
  - Terminal 2: Implement requeue command
- **Haiku validates:** `python -m py_compile sparkq/src/cli.py`
- **Tokens:** 1K (Sonnet) + 0 (Codex) + 1K (Haiku) = 2K

### Execution Sequence

```
PHASE 2 ORCHESTRATION:

Batch 1 (sequential):
  Sonnet → [generate 1 prompt] → Codex [create tools.py] → Haiku [validate]
  Cost: 2K tokens

Batch 2 (sequential, after Batch 1):
  Sonnet → [generate 1 prompt] → Codex [add Task CRUD] → Haiku [validate]
  Cost: 2K tokens

Batches 3, 4, 5 (can run in parallel, after Batch 2):
  Sonnet → [generate 5 prompts]
  Codex [execute 7 commands in parallel across 3 batches]
  Haiku [validate all 3 batches in parallel]
  Cost: 7K tokens

Sonnet Integration (final review):
  - Verify imports across files
  - Check patterns consistency
  - Review task orchestration
  Cost: 2K tokens

TOTAL PHASE 2 COST: 17K tokens (5K Sonnet + 12K Haiku + $0 Codex)
```

### Copy-Paste Ready

Each batch above contains complete Codex prompts that are ready to copy-paste and execute.

All code follows Phase 1 patterns and integrates with Storage class.

**Next Phase:** Phase 3 can begin immediately after Phase 2 completion.
