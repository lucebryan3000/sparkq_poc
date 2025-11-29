# SparkQ Phase 1: Core Infrastructure - Claude Code Prompt

> **Token Budget:** ~$0.75 Claude | Codex: 200K tokens
> **Duration:** ~2-3 hours
> **Output:** SQLite schema, storage layer, CLI skeleton, session/stream management

---

## Context

You are implementing **SparkQ Phase 1** - the core infrastructure for a single-user, dev-only task queue.

**Reference Documents:**
- FRD v7.5 Section 7 (Data Model)
- FRD v7.5 Section 14 (CLI Commands)
- FRD v7.5 Section 18 (Directory Structure)

**Key Constraints:**
- SQLite with WAL mode (single file: `sparkq.db`)
- Python 3.11+, Typer CLI, Pydantic models
- Self-contained in `sparkq/` directory
- No server yet (Phase 3)
- No watcher yet (Phase 4)

---

## Phase 1.1: Project Scaffolding

### Task 1.1.1: Create Directory Structure

Create the following structure:

```
sparkq/
├── sparkq.yml.example      # Example config
├── requirements.txt        # Python dependencies
├── setup.sh               # Creates venv, installs deps
├── teardown.sh            # Cleanup script
└── src/
    ├── __init__.py
    ├── __main__.py        # Entry point
    ├── cli.py             # CLI commands (Typer)
    ├── storage.py         # SQLite operations
    ├── models.py          # Pydantic models
    └── tools.py           # Tool registry (stub)
```

### Task 1.1.2: Create requirements.txt

```
typer>=0.9.0
pydantic>=2.0.0
pyyaml>=6.0
```

### Task 1.1.3: Create setup.sh

```bash
#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

echo "Creating Python virtual environment..."
python3 -m venv venv

echo "Activating venv and installing dependencies..."
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

echo ""
echo "Setup complete!"
echo "Activate with: source sparkq/venv/bin/activate"
echo "Then run: sparkq setup"
```

### Task 1.1.4: Create teardown.sh

```bash
#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

echo "SparkQ Teardown"
echo "==============="

# Stop server if running (placeholder for Phase 3)
if [ -f "sparkq.lock" ]; then
    PID=$(cat sparkq.lock)
    if ps -p "$PID" > /dev/null 2>&1; then
        echo "Stopping SparkQ server (PID $PID)..."
        kill "$PID" 2>/dev/null || true
    fi
    rm -f sparkq.lock
fi

# Remove database
if [ -f "sparkq.db" ]; then
    echo "Removing database..."
    rm -f sparkq.db sparkq.db-wal sparkq.db-shm
fi

# Remove venv
if [ -d "venv" ]; then
    echo "Removing virtual environment..."
    rm -rf venv
fi

# Remove temp files
rm -f /tmp/sparkq-*

echo ""
echo "Cleaned up. Delete this folder to remove SparkQ entirely."
```

---

## Phase 1.2: Database Schema & Storage Layer

### Task 1.2.1: Create SQLite Schema

In `src/storage.py`, implement the schema from FRD Section 7.2:

```sql
-- Enable WAL mode for concurrent access
PRAGMA journal_mode=WAL;

-- Projects (v1: single row, auto-created on setup)
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    repo_path TEXT,
    prd_path TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Sessions (a bounded period of work)
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    started_at TEXT NOT NULL,
    ended_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Streams (a feature lane within a session)
CREATE TABLE IF NOT EXISTS streams (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    name TEXT NOT NULL UNIQUE,
    instructions TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Tasks (the work items)
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    stream_id TEXT NOT NULL REFERENCES streams(id),
    tool_name TEXT NOT NULL,
    task_class TEXT NOT NULL,
    payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    timeout INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    result TEXT,
    error TEXT,
    stdout TEXT,
    stderr TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    started_at TEXT,
    finished_at TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tasks_stream_status ON tasks(stream_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_started_at ON tasks(started_at);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
CREATE INDEX IF NOT EXISTS idx_streams_session ON streams(session_id);
CREATE INDEX IF NOT EXISTS idx_streams_status ON streams(status);
CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
```

### Task 1.2.2: Implement storage.py

Create `src/storage.py` with:

```python
"""SparkQ SQLite Storage Layer"""

import sqlite3
import uuid
from datetime import datetime
from pathlib import Path
from contextlib import contextmanager
from typing import Optional, List

# ID generation helpers
def gen_project_id() -> str:
    return f"prj_{uuid.uuid4().hex[:12]}"

def gen_session_id() -> str:
    return f"ses_{uuid.uuid4().hex[:12]}"

def gen_stream_id() -> str:
    return f"str_{uuid.uuid4().hex[:12]}"

def gen_task_id() -> str:
    return f"tsk_{uuid.uuid4().hex[:12]}"

def now_iso() -> str:
    return datetime.utcnow().isoformat() + "Z"


class Storage:
    def __init__(self, db_path: str = "sparkq.db"):
        self.db_path = db_path
    
    @contextmanager
    def connection(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()
    
    def init_db(self):
        """Create tables if they don't exist"""
        # Implementation here
        pass
    
    # === Project CRUD ===
    def create_project(self, name: str, repo_path: str = None, prd_path: str = None) -> dict:
        pass
    
    def get_project(self) -> Optional[dict]:
        """Get the single project (v1: single project only)"""
        pass
    
    # === Session CRUD ===
    def create_session(self, name: str, description: str = None) -> dict:
        pass
    
    def get_session(self, session_id: str) -> Optional[dict]:
        pass
    
    def get_session_by_name(self, name: str) -> Optional[dict]:
        pass
    
    def list_sessions(self, status: str = None) -> List[dict]:
        pass
    
    def end_session(self, session_id: str) -> bool:
        pass
    
    # === Stream CRUD ===
    def create_stream(self, session_id: str, name: str, instructions: str = None) -> dict:
        pass
    
    def get_stream(self, stream_id: str) -> Optional[dict]:
        pass
    
    def get_stream_by_name(self, name: str) -> Optional[dict]:
        pass
    
    def list_streams(self, session_id: str = None, status: str = None) -> List[dict]:
        pass
    
    def end_stream(self, stream_id: str) -> bool:
        pass
    
    # === Task CRUD (stub for Phase 2) ===
    def create_task(self, stream_id: str, tool_name: str, task_class: str, 
                    payload: str, timeout: int) -> dict:
        pass
    
    def get_task(self, task_id: str) -> Optional[dict]:
        pass
    
    def list_tasks(self, stream_id: str = None, status: str = None) -> List[dict]:
        pass
```

**Implementation requirements:**
- Use context manager for all database operations
- Return dicts (converted from sqlite3.Row)
- Handle None/missing values gracefully
- All timestamps in ISO format with Z suffix

### Task 1.2.3: Create Pydantic Models

Create `src/models.py`:

```python
"""SparkQ Pydantic Models"""

from enum import Enum
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field


class TaskStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class TaskClass(str, Enum):
    FAST_SCRIPT = "FAST_SCRIPT"
    MEDIUM_SCRIPT = "MEDIUM_SCRIPT"
    LLM_LITE = "LLM_LITE"
    LLM_HEAVY = "LLM_HEAVY"


class SessionStatus(str, Enum):
    ACTIVE = "active"
    ENDED = "ended"


class StreamStatus(str, Enum):
    ACTIVE = "active"
    ENDED = "ended"


class Project(BaseModel):
    id: str
    name: str
    repo_path: Optional[str] = None
    prd_path: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class Session(BaseModel):
    id: str
    project_id: str
    name: str
    description: Optional[str] = None
    status: SessionStatus = SessionStatus.ACTIVE
    started_at: datetime
    ended_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class Stream(BaseModel):
    id: str
    session_id: str
    name: str
    instructions: Optional[str] = None
    status: StreamStatus = StreamStatus.ACTIVE
    created_at: datetime
    updated_at: datetime


class Task(BaseModel):
    id: str
    stream_id: str
    tool_name: str
    task_class: TaskClass
    payload: str  # JSON string
    status: TaskStatus = TaskStatus.QUEUED
    timeout: int
    attempts: int = 0
    result: Optional[str] = None  # JSON string
    error: Optional[str] = None
    stdout: Optional[str] = None
    stderr: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None


class TaskClassDefaults(BaseModel):
    """Default timeouts by task class"""
    FAST_SCRIPT: int = 30
    MEDIUM_SCRIPT: int = 300
    LLM_LITE: int = 300
    LLM_HEAVY: int = 900
```

---

## Phase 1.3: CLI Skeleton

### Task 1.3.1: Create Entry Point

Create `src/__main__.py`:

```python
"""SparkQ CLI Entry Point"""

from .cli import app

if __name__ == "__main__":
    app()
```

### Task 1.3.2: Create CLI with Typer

Create `src/cli.py`:

```python
"""SparkQ CLI Commands"""

import typer
from typing import Optional
from pathlib import Path

app = typer.Typer(
    name="sparkq",
    help="SparkQ - Dev-only task queue. Queue work, walk away, review results later.",
    no_args_is_help=True,
)

# === Setup ===

@app.command()
def setup():
    """Interactive setup to create sparkq.yml and initialize database."""
    # Implementation: Interactive Q&A per FRD 16.1
    # - Project name
    # - Repository path
    # - PRD file path
    # - Script directories
    # - Task class timeouts
    # - Server port
    # Write sparkq.yml
    # Initialize database
    pass


@app.command()
def status():
    """Show SparkQ status (server, sessions, streams, queue stats)."""
    pass


@app.command()
def reload():
    """Reload sparkq.yml (tools, script index). No server restart needed."""
    pass


# === Session Commands ===

session_app = typer.Typer(help="Manage work sessions")
app.add_typer(session_app, name="session")


@session_app.command("create")
def session_create(
    name: str = typer.Argument(..., help="Session name (e.g., 'api-v2')"),
    description: Optional[str] = typer.Option(None, "--description", "-d", help="Session description"),
):
    """Create a new work session."""
    pass


@session_app.command("list")
def session_list(
    status: Optional[str] = typer.Option(None, "--status", "-s", help="Filter by status (active, ended)"),
):
    """List all sessions."""
    pass


@session_app.command("end")
def session_end(
    name: str = typer.Argument(..., help="Session name to end"),
):
    """End a session (marks it as ended, no new streams)."""
    pass


# === Stream Commands ===

stream_app = typer.Typer(help="Manage feature streams within sessions")
app.add_typer(stream_app, name="stream")


@stream_app.command("create")
def stream_create(
    name: str = typer.Argument(..., help="Stream name (globally unique, e.g., 'auth')"),
    session: str = typer.Option(..., "--session", "-s", help="Parent session name"),
    instructions: Optional[str] = typer.Option(None, "--instructions", "-i", help="Stream instructions (mini-FRD)"),
):
    """Create a new stream within a session."""
    pass


@stream_app.command("list")
def stream_list(
    session: Optional[str] = typer.Option(None, "--session", "-s", help="Filter by session"),
    status: Optional[str] = typer.Option(None, "--status", help="Filter by status (active, ended)"),
):
    """List streams."""
    pass


@stream_app.command("end")
def stream_end(
    name: str = typer.Argument(..., help="Stream name to end"),
):
    """End a stream (marks it as ended, no new tasks)."""
    pass


# === Task Commands (Stubs for Phase 2) ===

@app.command()
def enqueue(
    tool: str = typer.Argument(..., help="Tool name from registry"),
    payload: str = typer.Argument(..., help="JSON payload for the tool"),
    stream: str = typer.Option(..., "--stream", "-s", help="Target stream name"),
    timeout: Optional[int] = typer.Option(None, "--timeout", "-t", help="Timeout override (seconds)"),
):
    """Queue a task for execution."""
    typer.echo("Phase 2: Not implemented yet")
    raise typer.Exit(1)


@app.command()
def peek(
    stream: str = typer.Option(..., "--stream", "-s", help="Stream to peek"),
):
    """Check for next queued task without claiming it."""
    typer.echo("Phase 2: Not implemented yet")
    raise typer.Exit(1)


@app.command()
def claim(
    stream: Optional[str] = typer.Option(None, "--stream", "-s", help="Stream to claim from"),
):
    """Claim the next queued task. Returns full task + stream instructions."""
    typer.echo("Phase 2: Not implemented yet")
    raise typer.Exit(1)


@app.command()
def complete(
    task_id: str = typer.Argument(..., help="Task ID to complete"),
    result: str = typer.Option(..., "--result", "-r", help="JSON result (must include 'summary' field)"),
    stdout: Optional[str] = typer.Option(None, "--stdout", help="Captured stdout"),
    stderr: Optional[str] = typer.Option(None, "--stderr", help="Captured stderr"),
):
    """Mark a task as succeeded."""
    typer.echo("Phase 2: Not implemented yet")
    raise typer.Exit(1)


@app.command()
def fail(
    task_id: str = typer.Argument(..., help="Task ID to fail"),
    error: str = typer.Option(..., "--error", "-e", help="Error message"),
    stdout: Optional[str] = typer.Option(None, "--stdout", help="Captured stdout"),
    stderr: Optional[str] = typer.Option(None, "--stderr", help="Captured stderr"),
):
    """Mark a task as failed."""
    typer.echo("Phase 2: Not implemented yet")
    raise typer.Exit(1)


@app.command()
def tasks(
    status: Optional[str] = typer.Option(None, "--status", "-s", help="Filter by status"),
    stream: Optional[str] = typer.Option(None, "--stream", help="Filter by stream"),
    stale: bool = typer.Option(False, "--stale", help="Show only stale (past timeout) tasks"),
):
    """List tasks with optional filters."""
    typer.echo("Phase 2: Not implemented yet")
    raise typer.Exit(1)


@app.command()
def task(
    task_id: str = typer.Argument(..., help="Task ID to show"),
):
    """Show detailed task information."""
    typer.echo("Phase 2: Not implemented yet")
    raise typer.Exit(1)


@app.command()
def requeue(
    task_id: str = typer.Argument(..., help="Failed task ID to requeue"),
):
    """Clone a failed task as a new queued task."""
    typer.echo("Phase 2: Not implemented yet")
    raise typer.Exit(1)


# === Server Commands (Stubs for Phase 3) ===

@app.command()
def run(
    session: Optional[str] = typer.Option(None, "--session", "-s", help="Start all streams in this session"),
):
    """Start SparkQ server. Interactive mode if no --session specified."""
    typer.echo("Phase 3: Not implemented yet")
    raise typer.Exit(1)


@app.command()
def stop(
    stream: Optional[str] = typer.Option(None, "--stream", "-s", help="Stop only this stream's watcher"),
):
    """Stop SparkQ server (and all watchers, or just specified stream)."""
    typer.echo("Phase 3: Not implemented yet")
    raise typer.Exit(1)


# === Utility Commands ===

@app.command()
def purge(
    older_than: str = typer.Option("3d", "--older-than", help="Delete tasks older than (e.g., '3d', '1w')"),
):
    """Manually purge old succeeded/failed tasks."""
    typer.echo("Purge: Not implemented yet")
    raise typer.Exit(1)


if __name__ == "__main__":
    app()
```

### Task 1.3.3: Implement `sparkq setup`

Full implementation of interactive setup per FRD Section 16.1:

```python
@app.command()
def setup():
    """Interactive setup to create sparkq.yml and initialize database."""
    import yaml
    
    typer.echo("\nSparkQ Setup")
    typer.echo("=" * 40)
    
    # Project info
    project_name = typer.prompt("Project name", default="my-project")
    repo_path = typer.prompt("Repository path", default=str(Path.cwd()))
    prd_path = typer.prompt("PRD file path (for context, optional)", default="")
    
    # Script directories
    typer.echo("\nScript directories to index:")
    script_dirs = []
    while True:
        dir_path = typer.prompt("  Add directory (empty to finish)", default="")
        if not dir_path:
            break
        script_dirs.append(dir_path)
    
    # Task class timeouts
    typer.echo("\nTask class default timeouts (seconds):")
    fast_timeout = typer.prompt("  FAST_SCRIPT", default="30", type=int)
    medium_timeout = typer.prompt("  MEDIUM_SCRIPT", default="300", type=int)
    llm_lite_timeout = typer.prompt("  LLM_LITE", default="300", type=int)
    llm_heavy_timeout = typer.prompt("  LLM_HEAVY", default="900", type=int)
    
    # Server port
    server_port = typer.prompt("\nServer port", default="8420", type=int)
    
    # Build config
    config = {
        "project": {
            "name": project_name,
            "repo_path": repo_path,
            "prd_path": prd_path or None,
        },
        "server": {
            "port": server_port,
        },
        "database": {
            "path": "sparkq.db",
            "mode": "wal",
        },
        "purge": {
            "older_than_days": 3,
        },
        "script_dirs": script_dirs if script_dirs else ["scripts"],
        "task_classes": {
            "FAST_SCRIPT": {"timeout": fast_timeout},
            "MEDIUM_SCRIPT": {"timeout": medium_timeout},
            "LLM_LITE": {"timeout": llm_lite_timeout},
            "LLM_HEAVY": {"timeout": llm_heavy_timeout},
        },
        "tools": {
            "run-bash": {
                "description": "Execute a bash script",
                "task_class": "MEDIUM_SCRIPT",
            },
            "run-python": {
                "description": "Execute a python script",
                "task_class": "MEDIUM_SCRIPT",
            },
            "llm-haiku": {
                "description": "Call Claude Haiku",
                "task_class": "LLM_LITE",
            },
            "llm-sonnet": {
                "description": "Call Claude Sonnet",
                "task_class": "LLM_HEAVY",
            },
        },
    }
    
    # Write config
    config_path = Path("sparkq.yml")
    with open(config_path, "w") as f:
        yaml.dump(config, f, default_flow_style=False, sort_keys=False)
    
    typer.echo(f"\nConfiguration saved to {config_path}")
    
    # Initialize database
    from .storage import Storage
    storage = Storage("sparkq.db")
    storage.init_db()
    
    # Create project record
    storage.create_project(
        name=project_name,
        repo_path=repo_path,
        prd_path=prd_path or None,
    )
    
    typer.echo("Database initialized.")
    typer.echo("\nRun 'sparkq session create <name>' to start working.")
```

### Task 1.3.4: Implement Session Commands

```python
@session_app.command("create")
def session_create(
    name: str = typer.Argument(..., help="Session name (e.g., 'api-v2')"),
    description: Optional[str] = typer.Option(None, "--description", "-d", help="Session description"),
):
    """Create a new work session."""
    from .storage import Storage
    
    storage = Storage("sparkq.db")
    
    # Check project exists
    project = storage.get_project()
    if not project:
        typer.echo("Error: Run 'sparkq setup' first.", err=True)
        raise typer.Exit(1)
    
    # Check name not taken
    existing = storage.get_session_by_name(name)
    if existing:
        typer.echo(f"Error: Session '{name}' already exists.", err=True)
        raise typer.Exit(1)
    
    session = storage.create_session(name=name, description=description)
    typer.echo(f"Created session: {session['name']} ({session['id']})")


@session_app.command("list")
def session_list(
    status: Optional[str] = typer.Option(None, "--status", "-s", help="Filter by status (active, ended)"),
):
    """List all sessions."""
    from .storage import Storage
    
    storage = Storage("sparkq.db")
    sessions = storage.list_sessions(status=status)
    
    if not sessions:
        typer.echo("No sessions found.")
        return
    
    typer.echo(f"\n{'Name':<20} {'Status':<10} {'Started':<20} {'Streams':<10}")
    typer.echo("-" * 60)
    
    for s in sessions:
        streams = storage.list_streams(session_id=s['id'])
        stream_count = len(streams)
        typer.echo(f"{s['name']:<20} {s['status']:<10} {s['started_at'][:19]:<20} {stream_count:<10}")


@session_app.command("end")
def session_end(
    name: str = typer.Argument(..., help="Session name to end"),
):
    """End a session (marks it as ended, no new streams)."""
    from .storage import Storage
    
    storage = Storage("sparkq.db")
    
    session = storage.get_session_by_name(name)
    if not session:
        typer.echo(f"Error: Session '{name}' not found.", err=True)
        raise typer.Exit(1)
    
    if session['status'] == 'ended':
        typer.echo(f"Session '{name}' is already ended.")
        return
    
    storage.end_session(session['id'])
    typer.echo(f"Ended session: {name}")
```

### Task 1.3.5: Implement Stream Commands

```python
@stream_app.command("create")
def stream_create(
    name: str = typer.Argument(..., help="Stream name (globally unique, e.g., 'auth')"),
    session: str = typer.Option(..., "--session", "-s", help="Parent session name"),
    instructions: Optional[str] = typer.Option(None, "--instructions", "-i", help="Stream instructions (mini-FRD)"),
):
    """Create a new stream within a session."""
    from .storage import Storage
    
    storage = Storage("sparkq.db")
    
    # Find session
    sess = storage.get_session_by_name(session)
    if not sess:
        typer.echo(f"Error: Session '{session}' not found.", err=True)
        raise typer.Exit(1)
    
    if sess['status'] == 'ended':
        typer.echo(f"Error: Session '{session}' is ended.", err=True)
        raise typer.Exit(1)
    
    # Check name not taken
    existing = storage.get_stream_by_name(name)
    if existing:
        typer.echo(f"Error: Stream '{name}' already exists.", err=True)
        raise typer.Exit(1)
    
    stream = storage.create_stream(
        session_id=sess['id'],
        name=name,
        instructions=instructions,
    )
    
    typer.echo(f"Created stream: {stream['name']} ({stream['id']})")
    if instructions:
        typer.echo(f"Instructions: {instructions[:50]}...")


@stream_app.command("list")
def stream_list(
    session: Optional[str] = typer.Option(None, "--session", "-s", help="Filter by session"),
    status: Optional[str] = typer.Option(None, "--status", help="Filter by status (active, ended)"),
):
    """List streams."""
    from .storage import Storage
    
    storage = Storage("sparkq.db")
    
    session_id = None
    if session:
        sess = storage.get_session_by_name(session)
        if not sess:
            typer.echo(f"Error: Session '{session}' not found.", err=True)
            raise typer.Exit(1)
        session_id = sess['id']
    
    streams = storage.list_streams(session_id=session_id, status=status)
    
    if not streams:
        typer.echo("No streams found.")
        return
    
    typer.echo(f"\n{'Name':<20} {'Session':<15} {'Status':<10} {'Tasks':<10}")
    typer.echo("-" * 55)
    
    for st in streams:
        # Get session name
        sess = storage.get_session(st['session_id'])
        sess_name = sess['name'] if sess else "?"
        
        # Count tasks (stub - returns 0 until Phase 2)
        tasks = storage.list_tasks(stream_id=st['id'])
        task_count = len(tasks)
        
        typer.echo(f"{st['name']:<20} {sess_name:<15} {st['status']:<10} {task_count:<10}")


@stream_app.command("end")
def stream_end(
    name: str = typer.Argument(..., help="Stream name to end"),
):
    """End a stream (marks it as ended, no new tasks)."""
    from .storage import Storage
    
    storage = Storage("sparkq.db")
    
    stream = storage.get_stream_by_name(name)
    if not stream:
        typer.echo(f"Error: Stream '{name}' not found.", err=True)
        raise typer.Exit(1)
    
    if stream['status'] == 'ended':
        typer.echo(f"Stream '{name}' is already ended.")
        return
    
    storage.end_stream(stream['id'])
    typer.echo(f"Ended stream: {name}")
```

---

## Phase 1 Completion Criteria

After Phase 1, all these commands should work:

```bash
# Setup
cd sparkq && ./setup.sh
source venv/bin/activate
sparkq setup                              # Interactive config

# Session management
sparkq session create api-v2 --description "API version 2 work"
sparkq session list
sparkq session list --status=active

# Stream management  
sparkq stream create auth --session api-v2 --instructions "Implement JWT auth"
sparkq stream create endpoints --session api-v2
sparkq stream list
sparkq stream list --session api-v2

# End operations
sparkq stream end auth
sparkq session end api-v2
```

---

## Validation Checklist

Before moving to Phase 2, verify:

- [ ] `sparkq.db` created with WAL mode
- [ ] All tables created with correct schema
- [ ] `sparkq.yml` generated with all config sections
- [ ] Session CRUD works (create, list, end)
- [ ] Stream CRUD works (create, list, end)
- [ ] Stream names are globally unique (enforced)
- [ ] Ended sessions reject new streams
- [ ] All stub commands return "Phase X: Not implemented yet"
- [ ] No syntax errors: `python -m py_compile sparkq/src/*.py`

---

## File Manifest

After Phase 1, you should have:

```
sparkq/
├── sparkq.yml           # Created by setup
├── sparkq.db            # SQLite database
├── requirements.txt     # Dependencies
├── setup.sh            # Executable
├── teardown.sh         # Executable
└── src/
    ├── __init__.py     # Empty or version string
    ├── __main__.py     # Entry point
    ├── cli.py          # ~300 lines
    ├── storage.py      # ~200 lines
    ├── models.py       # ~100 lines
    └── tools.py        # Stub (~20 lines)
```

---

## Next Phase Preview

**Phase 2** will implement:
- `sparkq enqueue` with task_class and timeout
- `sparkq peek --stream`
- `sparkq claim --stream` (returns task + stream instructions)
- `sparkq complete` with result.summary validation
- `sparkq fail`
- `sparkq tasks` with filters
- `sparkq requeue`
- Draft WORKER_PLAYBOOK.md
