# SparkQ Phase 2: Worker Commands - Claude Code Prompt

> **Token Budget:** ~$0.45 Claude | Codex: 150K tokens
> **Duration:** ~2-3 hours
> **Output:** Complete worker protocol (enqueue, peek, claim, complete, fail, tasks, requeue)

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

## Phase 2.1: Task Enqueue

### Task 2.1.1: Implement Tool Registry

Create/update `src/tools.py`:

```python
"""SparkQ Tool Registry"""

import yaml
from pathlib import Path
from typing import Optional, Dict, Any

# Default task class timeouts (seconds)
TASK_CLASS_DEFAULTS = {
    "FAST_SCRIPT": 30,
    "MEDIUM_SCRIPT": 300,
    "LLM_LITE": 300,
    "LLM_HEAVY": 900,
}


class ToolRegistry:
    def __init__(self, config_path: str = "sparkq.yml"):
        self.config_path = config_path
        self.tools: Dict[str, Dict[str, Any]] = {}
        self.task_class_timeouts: Dict[str, int] = TASK_CLASS_DEFAULTS.copy()
        self._load()
    
    def _load(self):
        """Load tools from sparkq.yml"""
        config_file = Path(self.config_path)
        if not config_file.exists():
            return
        
        with open(config_file) as f:
            config = yaml.safe_load(f)
        
        # Load task class timeout overrides
        if "task_classes" in config:
            for tc, settings in config["task_classes"].items():
                if isinstance(settings, dict) and "timeout" in settings:
                    self.task_class_timeouts[tc] = settings["timeout"]
        
        # Load tools
        if "tools" in config:
            self.tools = config["tools"]
    
    def reload(self):
        """Reload tools from config file"""
        self.tools = {}
        self.task_class_timeouts = TASK_CLASS_DEFAULTS.copy()
        self._load()
    
    def get_tool(self, name: str) -> Optional[Dict[str, Any]]:
        """Get tool configuration by name"""
        return self.tools.get(name)
    
    def list_tools(self) -> Dict[str, Dict[str, Any]]:
        """List all registered tools"""
        return self.tools.copy()
    
    def get_timeout(self, tool_name: str, override: int = None) -> int:
        """
        Resolve timeout for a task.
        Priority: override > tool config > task class default
        """
        if override is not None:
            return override
        
        tool = self.get_tool(tool_name)
        if not tool:
            return TASK_CLASS_DEFAULTS["MEDIUM_SCRIPT"]
        
        # Tool-specific timeout override
        if "timeout" in tool:
            return tool["timeout"]
        
        # Task class default
        task_class = tool.get("task_class", "MEDIUM_SCRIPT")
        return self.task_class_timeouts.get(task_class, 300)
    
    def get_task_class(self, tool_name: str) -> str:
        """Get task class for a tool"""
        tool = self.get_tool(tool_name)
        if not tool:
            return "MEDIUM_SCRIPT"
        return tool.get("task_class", "MEDIUM_SCRIPT")


# Singleton instance
_registry: Optional[ToolRegistry] = None


def get_registry() -> ToolRegistry:
    """Get or create the tool registry singleton"""
    global _registry
    if _registry is None:
        _registry = ToolRegistry()
    return _registry


def reload_registry():
    """Reload the tool registry from config"""
    global _registry
    if _registry is not None:
        _registry.reload()
    else:
        _registry = ToolRegistry()
```

### Task 2.1.2: Add Task CRUD to Storage

Update `src/storage.py` to implement task operations:

```python
# Add to Storage class:

def create_task(self, stream_id: str, tool_name: str, task_class: str,
                payload: str, timeout: int) -> dict:
    """Create a new task in queued status"""
    task_id = gen_task_id()
    now = now_iso()
    
    with self.connection() as conn:
        conn.execute("""
            INSERT INTO tasks (
                id, stream_id, tool_name, task_class, payload,
                status, timeout, attempts, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, 'queued', ?, 0, ?, ?)
        """, (task_id, stream_id, tool_name, task_class, payload,
              timeout, now, now))
        
        return self.get_task(task_id)

def get_task(self, task_id: str) -> Optional[dict]:
    """Get a task by ID"""
    with self.connection() as conn:
        row = conn.execute(
            "SELECT * FROM tasks WHERE id = ?", (task_id,)
        ).fetchone()
        return dict(row) if row else None

def list_tasks(self, stream_id: str = None, status: str = None,
               stale_only: bool = False) -> List[dict]:
    """List tasks with optional filters"""
    query = "SELECT * FROM tasks WHERE 1=1"
    params = []
    
    if stream_id:
        query += " AND stream_id = ?"
        params.append(stream_id)
    
    if status:
        query += " AND status = ?"
        params.append(status)
    
    if stale_only:
        # Stale = running AND (now - started_at) > timeout
        query += """ AND status = 'running' 
                     AND started_at IS NOT NULL
                     AND (julianday('now') - julianday(started_at)) * 86400 > timeout"""
    
    query += " ORDER BY created_at ASC"
    
    with self.connection() as conn:
        rows = conn.execute(query, params).fetchall()
        return [dict(row) for row in rows]

def get_queued_by_stream(self, stream_id: str) -> Optional[dict]:
    """Get the oldest queued task for a stream (FIFO)"""
    with self.connection() as conn:
        row = conn.execute("""
            SELECT * FROM tasks 
            WHERE stream_id = ? AND status = 'queued'
            ORDER BY created_at ASC
            LIMIT 1
        """, (stream_id,)).fetchone()
        return dict(row) if row else None

def claim_task(self, task_id: str) -> Optional[dict]:
    """
    Atomically claim a task: queued -> running
    Returns the updated task or None if not claimable
    """
    now = now_iso()
    
    with self.connection() as conn:
        # Atomic update - only succeeds if status is queued
        cursor = conn.execute("""
            UPDATE tasks 
            SET status = 'running', 
                started_at = ?,
                attempts = attempts + 1,
                updated_at = ?
            WHERE id = ? AND status = 'queued'
        """, (now, now, task_id))
        
        if cursor.rowcount == 0:
            return None
        
        return self.get_task(task_id)

def complete_task(self, task_id: str, result: str, 
                  stdout: str = None, stderr: str = None) -> Optional[dict]:
    """
    Mark a task as succeeded.
    Returns updated task or None if task not found/not running.
    """
    now = now_iso()
    
    with self.connection() as conn:
        cursor = conn.execute("""
            UPDATE tasks
            SET status = 'succeeded',
                result = ?,
                stdout = ?,
                stderr = ?,
                finished_at = ?,
                updated_at = ?
            WHERE id = ? AND status = 'running'
        """, (result, stdout, stderr, now, now, task_id))
        
        if cursor.rowcount == 0:
            return None
        
        return self.get_task(task_id)

def fail_task(self, task_id: str, error: str,
              stdout: str = None, stderr: str = None) -> Optional[dict]:
    """
    Mark a task as failed.
    Returns updated task or None if task not found/not running.
    """
    now = now_iso()
    
    with self.connection() as conn:
        cursor = conn.execute("""
            UPDATE tasks
            SET status = 'failed',
                error = ?,
                stdout = ?,
                stderr = ?,
                finished_at = ?,
                updated_at = ?
            WHERE id = ? AND status = 'running'
        """, (error, stdout, stderr, now, now, task_id))
        
        if cursor.rowcount == 0:
            return None
        
        return self.get_task(task_id)

def get_streams_with_queued_tasks(self) -> List[dict]:
    """Get all streams that have queued tasks, with counts"""
    with self.connection() as conn:
        rows = conn.execute("""
            SELECT s.id, s.name, s.session_id, COUNT(t.id) as queued_count
            FROM streams s
            INNER JOIN tasks t ON t.stream_id = s.id
            WHERE t.status = 'queued' AND s.status = 'active'
            GROUP BY s.id
            ORDER BY queued_count DESC
        """).fetchall()
        return [dict(row) for row in rows]

def count_tasks_by_status(self, stream_id: str = None) -> dict:
    """Count tasks by status, optionally filtered by stream"""
    query = """
        SELECT status, COUNT(*) as count
        FROM tasks
    """
    params = []
    
    if stream_id:
        query += " WHERE stream_id = ?"
        params.append(stream_id)
    
    query += " GROUP BY status"
    
    with self.connection() as conn:
        rows = conn.execute(query, params).fetchall()
        return {row['status']: row['count'] for row in rows}
```

### Task 2.1.3: Implement `sparkq enqueue` Command

Update `src/cli.py`:

```python
import json

@app.command()
def enqueue(
    tool: str = typer.Argument(..., help="Tool name from registry"),
    payload: str = typer.Argument(..., help="JSON payload for the tool"),
    stream: str = typer.Option(..., "--stream", "-s", help="Target stream name"),
    timeout: Optional[int] = typer.Option(None, "--timeout", "-t", help="Timeout override (seconds)"),
):
    """Queue a task for execution."""
    from .storage import Storage
    from .tools import get_registry
    
    storage = Storage("sparkq.db")
    registry = get_registry()
    
    # Validate tool exists
    tool_config = registry.get_tool(tool)
    if not tool_config:
        available = list(registry.list_tools().keys())
        typer.echo(f"Error: Tool '{tool}' not found.", err=True)
        typer.echo(f"Available tools: {', '.join(available)}", err=True)
        raise typer.Exit(1)
    
    # Validate stream exists and is active
    stream_record = storage.get_stream_by_name(stream)
    if not stream_record:
        typer.echo(f"Error: Stream '{stream}' not found.", err=True)
        raise typer.Exit(1)
    
    if stream_record['status'] == 'ended':
        typer.echo(f"Error: Stream '{stream}' is ended. Cannot enqueue tasks.", err=True)
        raise typer.Exit(1)
    
    # Validate payload is valid JSON
    try:
        json.loads(payload)
    except json.JSONDecodeError as e:
        typer.echo(f"Error: Invalid JSON payload: {e}", err=True)
        raise typer.Exit(1)
    
    # Resolve task class and timeout
    task_class = registry.get_task_class(tool)
    resolved_timeout = registry.get_timeout(tool, timeout)
    
    # Create task
    task = storage.create_task(
        stream_id=stream_record['id'],
        tool_name=tool,
        task_class=task_class,
        payload=payload,
        timeout=resolved_timeout,
    )
    
    typer.echo(f"Enqueued task: {task['id']}")
    typer.echo(f"  Tool: {tool} ({task_class})")
    typer.echo(f"  Stream: {stream}")
    typer.echo(f"  Timeout: {resolved_timeout}s")
```

---

## Phase 2.2: Peek and Claim

### Task 2.2.1: Implement `sparkq peek` Command

```python
@app.command()
def peek(
    stream: str = typer.Option(..., "--stream", "-s", help="Stream to peek"),
):
    """Check for next queued task without claiming it. Returns JSON or empty string."""
    from .storage import Storage
    
    storage = Storage("sparkq.db")
    
    # Validate stream exists
    stream_record = storage.get_stream_by_name(stream)
    if not stream_record:
        typer.echo(f"Error: Stream '{stream}' not found.", err=True)
        raise typer.Exit(1)
    
    # Get oldest queued task (FIFO)
    task = storage.get_queued_by_stream(stream_record['id'])
    
    if task:
        # Return single-line JSON (for watcher parsing)
        typer.echo(json.dumps(task, separators=(',', ':')))
    # else: empty output (exit 0)
```

### Task 2.2.2: Implement `sparkq claim` Command

Per FRD Section 12.2-12.3, claim returns full task + stream instructions:

```python
@app.command()
def claim(
    stream: Optional[str] = typer.Option(None, "--stream", "-s", help="Stream to claim from"),
):
    """
    Claim the next queued task. Returns full task + stream instructions as JSON.
    Without --stream, shows error and lists streams with queued tasks.
    """
    from .storage import Storage
    
    storage = Storage("sparkq.db")
    
    # If no stream specified, show helpful error per FRD 12.2
    if not stream:
        typer.echo("Error: --stream is required\n", err=True)
        
        streams_with_tasks = storage.get_streams_with_queued_tasks()
        
        if streams_with_tasks:
            typer.echo("Streams with queued tasks:")
            for s in streams_with_tasks:
                typer.echo(f"  {s['name']:<20} {s['queued_count']} queued")
        else:
            typer.echo("No streams have queued tasks.")
        
        typer.echo("\nUsage: sparkq claim --stream=<name>")
        raise typer.Exit(1)
    
    # Validate stream exists
    stream_record = storage.get_stream_by_name(stream)
    if not stream_record:
        typer.echo(f"Error: Stream '{stream}' not found.", err=True)
        raise typer.Exit(1)
    
    # Get oldest queued task
    queued_task = storage.get_queued_by_stream(stream_record['id'])
    
    if not queued_task:
        # No task available - empty output, exit 0
        return
    
    # Atomically claim the task
    claimed_task = storage.claim_task(queued_task['id'])
    
    if not claimed_task:
        # Race condition - task was claimed by someone else
        typer.echo("Error: Task was claimed by another worker.", err=True)
        raise typer.Exit(1)
    
    # Build response with stream context per FRD 12.3
    response = {
        "id": claimed_task['id'],
        "stream": {
            "id": stream_record['id'],
            "name": stream_record['name'],
            "instructions": stream_record.get('instructions'),
        },
        "tool_name": claimed_task['tool_name'],
        "task_class": claimed_task['task_class'],
        "payload": json.loads(claimed_task['payload']),
        "status": claimed_task['status'],
        "timeout": claimed_task['timeout'],
        "attempts": claimed_task['attempts'],
        "created_at": claimed_task['created_at'],
        "started_at": claimed_task['started_at'],
    }
    
    typer.echo(json.dumps(response, indent=2))
```

---

## Phase 2.3: Complete and Fail

### Task 2.3.1: Implement `sparkq complete` Command

Per FRD Section 8.5, `result.summary` is REQUIRED:

```python
@app.command()
def complete(
    task_id: str = typer.Argument(..., help="Task ID to complete"),
    result: str = typer.Option(..., "--result", "-r", help="JSON result (must include 'summary' field)"),
    stdout: Optional[str] = typer.Option(None, "--stdout", help="Captured stdout"),
    stderr: Optional[str] = typer.Option(None, "--stderr", help="Captured stderr"),
):
    """Mark a task as succeeded. Result must include 'summary' field."""
    from .storage import Storage
    
    storage = Storage("sparkq.db")
    
    # Validate task exists
    task = storage.get_task(task_id)
    if not task:
        typer.echo(f"Error: Task '{task_id}' not found.", err=True)
        raise typer.Exit(1)
    
    # Validate task is running
    if task['status'] != 'running':
        typer.echo(f"Error: Task '{task_id}' is not running (status: {task['status']}).", err=True)
        typer.echo("Only running tasks can be completed.", err=True)
        raise typer.Exit(1)
    
    # Validate result is valid JSON
    try:
        result_obj = json.loads(result)
    except json.JSONDecodeError as e:
        typer.echo(f"Error: Invalid JSON in --result: {e}", err=True)
        raise typer.Exit(1)
    
    # Validate result.summary exists and is a string (per FRD 8.5)
    if 'summary' not in result_obj:
        typer.echo("Error: result.summary is required (string)", err=True)
        typer.echo("Example: --result '{\"summary\": \"Completed migration of 12 users\"}'", err=True)
        raise typer.Exit(1)
    
    if not isinstance(result_obj['summary'], str):
        typer.echo("Error: result.summary must be a string", err=True)
        raise typer.Exit(1)
    
    # Complete the task
    updated_task = storage.complete_task(
        task_id=task_id,
        result=result,
        stdout=stdout,
        stderr=stderr,
    )
    
    if not updated_task:
        typer.echo(f"Error: Failed to complete task '{task_id}'.", err=True)
        raise typer.Exit(1)
    
    typer.echo(f"Completed task: {task_id}")
    typer.echo(f"Summary: {result_obj['summary']}")
```

### Task 2.3.2: Implement `sparkq fail` Command

```python
@app.command()
def fail(
    task_id: str = typer.Argument(..., help="Task ID to fail"),
    error: str = typer.Option(..., "--error", "-e", help="Error message"),
    stdout: Optional[str] = typer.Option(None, "--stdout", help="Captured stdout"),
    stderr: Optional[str] = typer.Option(None, "--stderr", help="Captured stderr"),
):
    """Mark a task as failed."""
    from .storage import Storage
    
    storage = Storage("sparkq.db")
    
    # Validate task exists
    task = storage.get_task(task_id)
    if not task:
        typer.echo(f"Error: Task '{task_id}' not found.", err=True)
        raise typer.Exit(1)
    
    # Validate task is running
    if task['status'] != 'running':
        typer.echo(f"Error: Task '{task_id}' is not running (status: {task['status']}).", err=True)
        typer.echo("Only running tasks can be failed.", err=True)
        raise typer.Exit(1)
    
    # Fail the task
    updated_task = storage.fail_task(
        task_id=task_id,
        error=error,
        stdout=stdout,
        stderr=stderr,
    )
    
    if not updated_task:
        typer.echo(f"Error: Failed to mark task '{task_id}' as failed.", err=True)
        raise typer.Exit(1)
    
    typer.echo(f"Failed task: {task_id}")
    typer.echo(f"Error: {error}")
```

---

## Phase 2.4: Task Listing and Requeue

### Task 2.4.1: Implement `sparkq tasks` Command

```python
@app.command()
def tasks(
    status: Optional[str] = typer.Option(None, "--status", "-s", help="Filter by status (queued, running, succeeded, failed)"),
    stream: Optional[str] = typer.Option(None, "--stream", help="Filter by stream name"),
    stale: bool = typer.Option(False, "--stale", help="Show only stale (past timeout) running tasks"),
):
    """List tasks with optional filters."""
    from .storage import Storage
    from datetime import datetime
    
    storage = Storage("sparkq.db")
    
    # Resolve stream ID if provided
    stream_id = None
    if stream:
        stream_record = storage.get_stream_by_name(stream)
        if not stream_record:
            typer.echo(f"Error: Stream '{stream}' not found.", err=True)
            raise typer.Exit(1)
        stream_id = stream_record['id']
    
    # Get tasks
    task_list = storage.list_tasks(
        stream_id=stream_id,
        status=status,
        stale_only=stale,
    )
    
    if not task_list:
        typer.echo("No tasks found.")
        return
    
    # Get stream names for display
    stream_names = {}
    for t in task_list:
        if t['stream_id'] not in stream_names:
            s = storage.get_stream(t['stream_id'])
            stream_names[t['stream_id']] = s['name'] if s else '?'
    
    # Display header
    typer.echo(f"\n{'ID':<16} {'Tool':<15} {'Stream':<12} {'Status':<10} {'Created':<20}")
    typer.echo("-" * 75)
    
    for t in task_list:
        stream_name = stream_names.get(t['stream_id'], '?')
        created = t['created_at'][:19] if t['created_at'] else ''
        
        # Check if stale (for running tasks)
        stale_marker = ""
        if t['status'] == 'running' and t['started_at']:
            started = datetime.fromisoformat(t['started_at'].replace('Z', '+00:00'))
            elapsed = (datetime.now(started.tzinfo) - started).total_seconds()
            if elapsed > t['timeout']:
                stale_marker = " ⚠️"
        
        typer.echo(f"{t['id']:<16} {t['tool_name']:<15} {stream_name:<12} {t['status']:<10}{stale_marker} {created:<20}")
    
    typer.echo(f"\nTotal: {len(task_list)} tasks")
```

### Task 2.4.2: Implement `sparkq task` Command (Detail View)

```python
@app.command()
def task(
    task_id: str = typer.Argument(..., help="Task ID to show"),
):
    """Show detailed task information."""
    from .storage import Storage
    from datetime import datetime
    
    storage = Storage("sparkq.db")
    
    t = storage.get_task(task_id)
    if not t:
        typer.echo(f"Error: Task '{task_id}' not found.", err=True)
        raise typer.Exit(1)
    
    # Get stream info
    stream = storage.get_stream(t['stream_id'])
    stream_name = stream['name'] if stream else '?'
    
    typer.echo(f"\n{'='*60}")
    typer.echo(f"Task: {t['id']}")
    typer.echo(f"{'='*60}")
    
    typer.echo(f"\nBasic Info:")
    typer.echo(f"  Tool:       {t['tool_name']}")
    typer.echo(f"  Task Class: {t['task_class']}")
    typer.echo(f"  Stream:     {stream_name}")
    typer.echo(f"  Status:     {t['status']}")
    typer.echo(f"  Timeout:    {t['timeout']}s")
    typer.echo(f"  Attempts:   {t['attempts']}")
    
    typer.echo(f"\nTiming:")
    typer.echo(f"  Created:    {t['created_at']}")
    typer.echo(f"  Started:    {t['started_at'] or '-'}")
    typer.echo(f"  Finished:   {t['finished_at'] or '-'}")
    
    # Calculate duration if finished
    if t['started_at'] and t['finished_at']:
        started = datetime.fromisoformat(t['started_at'].replace('Z', '+00:00'))
        finished = datetime.fromisoformat(t['finished_at'].replace('Z', '+00:00'))
        duration = (finished - started).total_seconds()
        typer.echo(f"  Duration:   {duration:.1f}s")
    
    typer.echo(f"\nPayload:")
    try:
        payload_obj = json.loads(t['payload'])
        typer.echo(f"  {json.dumps(payload_obj, indent=4)}")
    except:
        typer.echo(f"  {t['payload']}")
    
    if t['result']:
        typer.echo(f"\nResult:")
        try:
            result_obj = json.loads(t['result'])
            typer.echo(f"  {json.dumps(result_obj, indent=4)}")
        except:
            typer.echo(f"  {t['result']}")
    
    if t['error']:
        typer.echo(f"\nError:")
        typer.echo(f"  {t['error']}")
    
    if t['stdout']:
        typer.echo(f"\nStdout:")
        typer.echo(f"  {t['stdout'][:500]}{'...' if len(t['stdout']) > 500 else ''}")
    
    if t['stderr']:
        typer.echo(f"\nStderr:")
        typer.echo(f"  {t['stderr'][:500]}{'...' if len(t['stderr']) > 500 else ''}")
```

### Task 2.4.3: Implement `sparkq requeue` Command

Per FRD Section 8.7, requeue clones a failed task with a new ID:

```python
@app.command()
def requeue(
    task_id: str = typer.Argument(..., help="Failed task ID to requeue"),
):
    """Clone a failed task as a new queued task."""
    from .storage import Storage
    
    storage = Storage("sparkq.db")
    
    # Get original task
    original = storage.get_task(task_id)
    if not original:
        typer.echo(f"Error: Task '{task_id}' not found.", err=True)
        raise typer.Exit(1)
    
    # Only failed tasks can be requeued
    if original['status'] != 'failed':
        typer.echo(f"Error: Task '{task_id}' is not failed (status: {original['status']}).", err=True)
        typer.echo("Only failed tasks can be requeued.", err=True)
        raise typer.Exit(1)
    
    # Verify stream is still active
    stream = storage.get_stream(original['stream_id'])
    if not stream:
        typer.echo(f"Error: Stream no longer exists.", err=True)
        raise typer.Exit(1)
    
    if stream['status'] == 'ended':
        typer.echo(f"Error: Stream '{stream['name']}' is ended. Cannot requeue.", err=True)
        raise typer.Exit(1)
    
    # Create new task (clone with fresh state)
    new_task = storage.create_task(
        stream_id=original['stream_id'],
        tool_name=original['tool_name'],
        task_class=original['task_class'],
        payload=original['payload'],
        timeout=original['timeout'],
    )
    
    typer.echo(f"Requeued task: {new_task['id']}")
    typer.echo(f"  Original: {task_id}")
    typer.echo(f"  Tool: {new_task['tool_name']}")
    typer.echo(f"  Stream: {stream['name']}")
```

---

## Phase 2.5: Worker Playbook (Draft)

### Task 2.5.1: Create Draft WORKER_PLAYBOOK.md

Create `sparkq/WORKER_PLAYBOOK.md`:

```markdown
# SparkQ Worker Playbook (Draft)

> Basic operating procedures for Claude Code when working as a SparkQ stream worker.
> Full playbook comes in Phase 4.

## 1. Session Setup

Clean up old temp files:
```bash
rm -f /tmp/sparkq-<STREAM>-*
```

## 2. Task Loop

### 2.1 Wait and Claim
```bash
sparkq claim --stream=<STREAM>
```

If no task, check again later or wait for watcher signal (Phase 4).

### 2.2 Execute Task

Based on `tool_name` in the claim response:

**run-bash / run-python:**
```bash
# Extract script path from payload
bash <script_path> > /tmp/task.out 2> /tmp/task.err
```

**llm-haiku:**
- Read payload.prompt and payload.context_files
- Execute with Haiku
- Capture result

### 2.3 Complete Task

**Always have Haiku generate the summary.**

```bash
sparkq complete <TASK_ID> \
  --result '{"summary": "<haiku-generated-summary>"}' \
  --stdout "$(cat /tmp/task.out)" \
  --stderr "$(cat /tmp/task.err)"
```

### 2.4 Fail Task

If execution fails:
```bash
sparkq fail <TASK_ID> \
  --error "Short description of what went wrong" \
  --stdout "$(cat /tmp/task.out)" \
  --stderr "$(cat /tmp/task.err)"
```

## 3. Commands Reference

| Command | Purpose |
|---------|---------|
| `sparkq peek --stream=X` | Check for task without claiming |
| `sparkq claim --stream=X` | Claim next task (returns JSON) |
| `sparkq complete <id> --result '...'` | Mark succeeded |
| `sparkq fail <id> --error '...'` | Mark failed |
| `sparkq tasks --stream=X` | List tasks |
| `sparkq requeue <id>` | Clone failed task |

## 4. Error Recovery

### sparkq complete Rejected

If missing `result.summary`:
1. Add summary to result JSON
2. Retry command

### Task Stuck in Running

If a task is running but worker crashed:
1. Check with `sparkq tasks --stale`
2. Wait for auto-fail at 2x timeout (Phase 4)
3. Then `sparkq requeue <id>`

## 5. Summary Generation

**Every completion requires `result.summary`.**

Good summaries:
- "Executed deploy-staging.sh successfully. Deployed commit abc123."
- "Generated Zod schema for User type with 3 validators."
- "Migration failed: permission denied on users table."

Bad summaries:
- "Done" (too vague)
- "Task completed successfully" (no information)
```

---

## Phase 2 Completion Criteria

After Phase 2, all these commands should work:

```bash
# Enqueue tasks
sparkq enqueue run-bash '{"script_path": "test.sh"}' --stream=auth
sparkq enqueue llm-haiku '{"prompt": "Hello"}' --stream=auth --timeout=60

# Peek without claiming
sparkq peek --stream=auth              # Returns task JSON

# Claim task
sparkq claim --stream=auth             # Claims and returns full task + stream instructions
sparkq claim                           # Error + list streams with queued tasks

# Complete with summary
sparkq complete tsk_abc123 --result '{"summary": "Task done", "exit_code": 0}'
sparkq complete tsk_abc123 --result '{"no_summary": true}'  # ERROR: summary required

# Fail task
sparkq fail tsk_abc123 --error "Script exited with code 1"

# List and view tasks
sparkq tasks                           # All tasks
sparkq tasks --status=queued           # Filter by status
sparkq tasks --stream=auth             # Filter by stream
sparkq tasks --stale                   # Running tasks past timeout

sparkq task tsk_abc123                 # Full detail view

# Requeue failed task
sparkq requeue tsk_abc123              # Creates new task with same payload
```

---

## Validation Checklist

Before moving to Phase 3, verify:

- [ ] Tool registry loads from sparkq.yml
- [ ] `sparkq enqueue` validates tool, stream, and payload
- [ ] `sparkq peek` returns JSON without changing status
- [ ] `sparkq claim` atomically transitions queued → running
- [ ] `sparkq claim` returns stream instructions in response
- [ ] `sparkq claim` (no stream) shows helpful error + stream list
- [ ] `sparkq complete` validates result.summary exists
- [ ] `sparkq complete` rejects if task not running
- [ ] `sparkq fail` stores error and stdout/stderr
- [ ] `sparkq tasks` filters work (--status, --stream, --stale)
- [ ] `sparkq task` shows full detail including payload/result
- [ ] `sparkq requeue` clones failed task with new ID
- [ ] `sparkq requeue` rejects non-failed tasks
- [ ] WORKER_PLAYBOOK.md exists with basic instructions

---

## File Changes Summary

**Modified files:**
- `src/storage.py` - Added task CRUD operations
- `src/cli.py` - Implemented all Phase 2 commands
- `src/tools.py` - Full tool registry implementation

**New files:**
- `sparkq/WORKER_PLAYBOOK.md` - Draft worker playbook

---

## Test Scenarios

### Scenario 1: Basic Task Flow

```bash
# Setup (from Phase 1)
sparkq session create test-session
sparkq stream create test-stream --session test-session --instructions "Test stream"

# Enqueue
sparkq enqueue run-bash '{"script_path": "echo.sh"}' --stream=test-stream
# Output: Enqueued task: tsk_xxx

# Peek (doesn't change status)
sparkq peek --stream=test-stream
# Output: {"id":"tsk_xxx","status":"queued",...}

# Claim
sparkq claim --stream=test-stream
# Output: Full task JSON with stream.instructions

# Complete
sparkq complete tsk_xxx --result '{"summary": "Echo completed"}'
# Output: Completed task: tsk_xxx

# Verify
sparkq task tsk_xxx
# Output: Status: succeeded, Result: {"summary": "Echo completed"}
```

### Scenario 2: Claim Without Stream

```bash
sparkq claim
# Output:
# Error: --stream is required
#
# Streams with queued tasks:
#   test-stream          2 queued
#
# Usage: sparkq claim --stream=<name>
```

### Scenario 3: Missing Summary Rejection

```bash
sparkq enqueue run-bash '{"script_path": "test.sh"}' --stream=test-stream
sparkq claim --stream=test-stream
sparkq complete tsk_xxx --result '{"exit_code": 0}'
# Output:
# Error: result.summary is required (string)
# Example: --result '{"summary": "Completed migration of 12 users"}'
```

### Scenario 4: Requeue Flow

```bash
# Create and fail a task
sparkq enqueue run-bash '{"script_path": "fail.sh"}' --stream=test-stream
sparkq claim --stream=test-stream
sparkq fail tsk_xxx --error "Script not found"

# Requeue
sparkq requeue tsk_xxx
# Output: Requeued task: tsk_yyy
#         Original: tsk_xxx

# Verify original still exists
sparkq task tsk_xxx
# Output: Status: failed
```

---

## Next Phase Preview

**Phase 3** will implement:
- FastAPI server with HTTP endpoints
- Web UI (Dashboard, Sessions, Streams, Tasks, Enqueue)
- `sparkq run` (interactive and --session modes)
- `sparkq stop`
- `sparkq reload`
- Auto-purge on startup
