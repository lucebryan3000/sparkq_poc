# SparkQ Phase 3: Server + API + Web UI - Claude Code Prompt

> **Token Budget:** ~$0.60 Claude | Codex: 250K tokens
> **Duration:** ~3-4 hours
> **Output:** HTTP server with FastAPI, Web UI for human interaction

---

## Context

You are implementing **SparkQ Phase 3** - the HTTP server, REST API, and Web UI that provides human-friendly access to SparkQ.

**Prerequisites:**
- Phase 1 complete (storage.py, models.py, session/stream CRUD)
- Phase 2 complete (task CRUD, enqueue, peek, claim, complete, fail, requeue)
- SQLite database with WAL mode
- sparkq.yml configuration exists

**Reference Documents:**
- FRD v7.5 Section 6 (Architecture)
- FRD v7.5 Section 14.1 (Setup & Server Commands)
- FRD v7.5 Section 15 (Web UI)
- FRD v7.5 Section 15.4 (API Endpoints)

**Key Constraints:**
- Server binds to `127.0.0.1:8420` only (localhost)
- No authentication (trusted local environment)
- Auto-purge on startup (background task)
- Lockfile prevents multiple server instances

---

## Phase 3.1: FastAPI Server Setup

### Task 3.1.1: Create Server Module

Create `src/server.py`:

```python
"""SparkQ HTTP Server (Uvicorn wrapper)"""

import os
import sys
import signal
import atexit
from pathlib import Path
from typing import Optional
import threading
import time


LOCKFILE = "sparkq.lock"
DEFAULT_PORT = 8420


def get_pid_from_lockfile() -> Optional[int]:
    """Read PID from lockfile if it exists"""
    if not Path(LOCKFILE).exists():
        return None
    try:
        with open(LOCKFILE) as f:
            return int(f.read().strip())
    except (ValueError, IOError):
        return None


def is_process_running(pid: int) -> bool:
    """Check if a process with given PID is running"""
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def create_lockfile():
    """Create lockfile with current PID"""
    with open(LOCKFILE, 'w') as f:
        f.write(str(os.getpid()))


def remove_lockfile():
    """Remove lockfile on exit"""
    try:
        Path(LOCKFILE).unlink(missing_ok=True)
    except:
        pass


def check_server_running() -> Optional[int]:
    """
    Check if server is already running.
    Returns PID if running, None otherwise.
    Cleans up stale lockfile if process is dead.
    """
    pid = get_pid_from_lockfile()
    if pid is None:
        return None
    
    if is_process_running(pid):
        return pid
    
    # Stale lockfile - clean it up
    remove_lockfile()
    return None


def start_auto_purge(storage, older_than_days: int = 3):
    """Start background thread for auto-purge on startup"""
    def purge_task():
        try:
            from datetime import datetime, timedelta
            cutoff = datetime.utcnow() - timedelta(days=older_than_days)
            cutoff_iso = cutoff.isoformat() + "Z"
            
            with storage.connection() as conn:
                cursor = conn.execute("""
                    DELETE FROM tasks 
                    WHERE status IN ('succeeded', 'failed')
                    AND created_at < ?
                """, (cutoff_iso,))
                deleted = cursor.rowcount
                
            if deleted > 0:
                print(f"[auto-purge] Deleted {deleted} old tasks (>{older_than_days} days)")
        except Exception as e:
            print(f"[auto-purge] Error: {e}")
    
    thread = threading.Thread(target=purge_task, daemon=True)
    thread.start()


def run_server(port: int = DEFAULT_PORT, host: str = "127.0.0.1"):
    """Start the SparkQ server"""
    import uvicorn
    from .api import app
    from .storage import Storage
    
    # Check if already running
    existing_pid = check_server_running()
    if existing_pid:
        print(f"Error: SparkQ server already running (PID {existing_pid})")
        print(f"Stop it first with: sparkq stop")
        sys.exit(1)
    
    # Create lockfile
    create_lockfile()
    atexit.register(remove_lockfile)
    
    # Handle signals for clean shutdown
    def signal_handler(signum, frame):
        print("\nShutting down...")
        remove_lockfile()
        sys.exit(0)
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # Start auto-purge
    storage = Storage("sparkq.db")
    start_auto_purge(storage)
    
    print(f"Starting SparkQ server on http://{host}:{port}")
    print(f"Web UI: http://{host}:{port}/")
    print(f"API: http://{host}:{port}/api/")
    print(f"PID: {os.getpid()}")
    print()
    
    # Run uvicorn
    uvicorn.run(
        app,
        host=host,
        port=port,
        log_level="warning",
        access_log=False,
    )


def stop_server() -> bool:
    """Stop the running server"""
    pid = get_pid_from_lockfile()
    
    if pid is None:
        print("SparkQ server is not running.")
        return False
    
    if not is_process_running(pid):
        print("SparkQ server is not running (stale lockfile).")
        remove_lockfile()
        return False
    
    print(f"Stopping SparkQ server (PID {pid})...")
    
    try:
        os.kill(pid, signal.SIGTERM)
        
        # Wait for process to exit
        for _ in range(50):  # 5 seconds max
            time.sleep(0.1)
            if not is_process_running(pid):
                break
        
        if is_process_running(pid):
            print("Server didn't stop gracefully, forcing...")
            os.kill(pid, signal.SIGKILL)
        
        remove_lockfile()
        print("Server stopped.")
        return True
        
    except OSError as e:
        print(f"Error stopping server: {e}")
        return False


def server_status() -> dict:
    """Get server status information"""
    pid = get_pid_from_lockfile()
    
    if pid is None:
        return {"running": False, "pid": None}
    
    if not is_process_running(pid):
        remove_lockfile()
        return {"running": False, "pid": None, "stale_lockfile": True}
    
    return {"running": True, "pid": pid}
```

### Task 3.1.2: Create FastAPI Application

Create `src/api.py`:

```python
"""SparkQ REST API (FastAPI)"""

import json
from typing import Optional, List
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

from .storage import Storage
from .tools import get_registry, reload_registry


# === Pydantic Models for API ===

class SessionCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None


class SessionUpdate(BaseModel):
    status: Optional[str] = None  # "ended"


class StreamCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    session_id: str
    instructions: Optional[str] = None


class StreamUpdate(BaseModel):
    status: Optional[str] = None  # "ended"


class TaskCreate(BaseModel):
    tool_name: str
    payload: dict
    stream_id: str
    timeout: Optional[int] = None


class TaskRequeue(BaseModel):
    pass  # No body needed


class HealthResponse(BaseModel):
    status: str
    version: str


class StatusResponse(BaseModel):
    running: bool
    sessions_active: int
    streams_active: int
    tasks_queued: int
    tasks_running: int


# === FastAPI App ===

app = FastAPI(
    title="SparkQ API",
    description="Dev-only task queue API",
    version="0.1.0",
)

# Storage instance
def get_storage() -> Storage:
    return Storage("sparkq.db")


# === Health & Status Endpoints ===

@app.get("/api/health", response_model=HealthResponse)
def health():
    """Health check endpoint"""
    return {"status": "ok", "version": "0.1.0"}


@app.get("/api/status", response_model=StatusResponse)
def status():
    """Get queue status and statistics"""
    storage = get_storage()
    
    sessions = storage.list_sessions(status="active")
    streams = storage.list_streams(status="active")
    task_counts = storage.count_tasks_by_status()
    
    return {
        "running": True,
        "sessions_active": len(sessions),
        "streams_active": len(streams),
        "tasks_queued": task_counts.get("queued", 0),
        "tasks_running": task_counts.get("running", 0),
    }


# === Session Endpoints ===

@app.get("/api/sessions")
def list_sessions(status: Optional[str] = Query(None)):
    """List all sessions"""
    storage = get_storage()
    sessions = storage.list_sessions(status=status)
    
    # Add stream counts
    result = []
    for s in sessions:
        streams = storage.list_streams(session_id=s['id'])
        s['stream_count'] = len(streams)
        result.append(s)
    
    return result


@app.post("/api/sessions", status_code=201)
def create_session(data: SessionCreate):
    """Create a new session"""
    storage = get_storage()
    
    # Check project exists
    project = storage.get_project()
    if not project:
        raise HTTPException(400, "Run 'sparkq setup' first")
    
    # Check name not taken
    existing = storage.get_session_by_name(data.name)
    if existing:
        raise HTTPException(409, f"Session '{data.name}' already exists")
    
    session = storage.create_session(name=data.name, description=data.description)
    return session


@app.get("/api/sessions/{session_id}")
def get_session(session_id: str):
    """Get a session by ID"""
    storage = get_storage()
    session = storage.get_session(session_id)
    if not session:
        raise HTTPException(404, f"Session not found: {session_id}")
    return session


@app.put("/api/sessions/{session_id}")
def update_session(session_id: str, data: SessionUpdate):
    """Update a session (e.g., end it)"""
    storage = get_storage()
    
    session = storage.get_session(session_id)
    if not session:
        raise HTTPException(404, f"Session not found: {session_id}")
    
    if data.status == "ended":
        storage.end_session(session_id)
        return storage.get_session(session_id)
    
    return session


# === Stream Endpoints ===

@app.get("/api/streams")
def list_streams(
    session: Optional[str] = Query(None, alias="session_id"),
    status: Optional[str] = Query(None),
):
    """List all streams, optionally filtered by session"""
    storage = get_storage()
    
    session_id = None
    if session:
        # Allow lookup by name or ID
        sess = storage.get_session(session) or storage.get_session_by_name(session)
        if sess:
            session_id = sess['id']
    
    streams = storage.list_streams(session_id=session_id, status=status)
    
    # Add task counts
    result = []
    for st in streams:
        task_counts = storage.count_tasks_by_status(stream_id=st['id'])
        st['tasks_queued'] = task_counts.get('queued', 0)
        st['tasks_running'] = task_counts.get('running', 0)
        st['tasks_succeeded'] = task_counts.get('succeeded', 0)
        st['tasks_failed'] = task_counts.get('failed', 0)
        result.append(st)
    
    return result


@app.post("/api/streams", status_code=201)
def create_stream(data: StreamCreate):
    """Create a new stream"""
    storage = get_storage()
    
    # Verify session exists and is active
    session = storage.get_session(data.session_id)
    if not session:
        raise HTTPException(404, f"Session not found: {data.session_id}")
    
    if session['status'] == 'ended':
        raise HTTPException(400, "Cannot create stream in ended session")
    
    # Check name not taken (globally unique)
    existing = storage.get_stream_by_name(data.name)
    if existing:
        raise HTTPException(409, f"Stream '{data.name}' already exists")
    
    stream = storage.create_stream(
        session_id=data.session_id,
        name=data.name,
        instructions=data.instructions,
    )
    return stream


@app.get("/api/streams/{stream_id}")
def get_stream(stream_id: str):
    """Get a stream by ID"""
    storage = get_storage()
    stream = storage.get_stream(stream_id)
    if not stream:
        raise HTTPException(404, f"Stream not found: {stream_id}")
    return stream


@app.put("/api/streams/{stream_id}")
def update_stream(stream_id: str, data: StreamUpdate):
    """Update a stream (e.g., end it)"""
    storage = get_storage()
    
    stream = storage.get_stream(stream_id)
    if not stream:
        raise HTTPException(404, f"Stream not found: {stream_id}")
    
    if data.status == "ended":
        storage.end_stream(stream_id)
        return storage.get_stream(stream_id)
    
    return stream


# === Task Endpoints ===

@app.get("/api/tasks")
def list_tasks(
    status: Optional[str] = Query(None),
    stream: Optional[str] = Query(None, alias="stream_id"),
    stale: bool = Query(False),
):
    """List tasks with optional filters"""
    storage = get_storage()
    
    stream_id = None
    if stream:
        # Allow lookup by name or ID
        st = storage.get_stream(stream) or storage.get_stream_by_name(stream)
        if st:
            stream_id = st['id']
    
    tasks = storage.list_tasks(
        stream_id=stream_id,
        status=status,
        stale_only=stale,
    )
    
    # Add stream names
    stream_cache = {}
    result = []
    for t in tasks:
        if t['stream_id'] not in stream_cache:
            st = storage.get_stream(t['stream_id'])
            stream_cache[t['stream_id']] = st['name'] if st else '?'
        t['stream_name'] = stream_cache[t['stream_id']]
        
        # Parse payload for display
        try:
            t['payload_parsed'] = json.loads(t['payload'])
        except:
            t['payload_parsed'] = t['payload']
        
        result.append(t)
    
    return result


@app.post("/api/tasks", status_code=201)
def create_task(data: TaskCreate):
    """Enqueue a new task"""
    storage = get_storage()
    registry = get_registry()
    
    # Validate tool exists
    tool_config = registry.get_tool(data.tool_name)
    if not tool_config:
        available = list(registry.list_tools().keys())
        raise HTTPException(400, f"Tool '{data.tool_name}' not found. Available: {available}")
    
    # Validate stream exists and is active
    stream = storage.get_stream(data.stream_id)
    if not stream:
        raise HTTPException(404, f"Stream not found: {data.stream_id}")
    
    if stream['status'] == 'ended':
        raise HTTPException(400, "Cannot enqueue to ended stream")
    
    # Resolve task class and timeout
    task_class = registry.get_task_class(data.tool_name)
    timeout = registry.get_timeout(data.tool_name, data.timeout)
    
    # Create task
    task = storage.create_task(
        stream_id=data.stream_id,
        tool_name=data.tool_name,
        task_class=task_class,
        payload=json.dumps(data.payload),
        timeout=timeout,
    )
    
    return task


@app.get("/api/tasks/{task_id}")
def get_task(task_id: str):
    """Get a task by ID"""
    storage = get_storage()
    task = storage.get_task(task_id)
    if not task:
        raise HTTPException(404, f"Task not found: {task_id}")
    
    # Parse payload and result
    try:
        task['payload_parsed'] = json.loads(task['payload'])
    except:
        task['payload_parsed'] = task['payload']
    
    if task['result']:
        try:
            task['result_parsed'] = json.loads(task['result'])
        except:
            task['result_parsed'] = task['result']
    
    # Add stream info
    stream = storage.get_stream(task['stream_id'])
    task['stream_name'] = stream['name'] if stream else '?'
    
    return task


@app.post("/api/tasks/{task_id}/requeue", status_code=201)
def requeue_task(task_id: str):
    """Clone a failed task as a new queued task"""
    storage = get_storage()
    
    original = storage.get_task(task_id)
    if not original:
        raise HTTPException(404, f"Task not found: {task_id}")
    
    if original['status'] != 'failed':
        raise HTTPException(400, f"Only failed tasks can be requeued (status: {original['status']})")
    
    # Verify stream is still active
    stream = storage.get_stream(original['stream_id'])
    if not stream:
        raise HTTPException(400, "Stream no longer exists")
    
    if stream['status'] == 'ended':
        raise HTTPException(400, f"Stream '{stream['name']}' is ended")
    
    # Create new task
    new_task = storage.create_task(
        stream_id=original['stream_id'],
        tool_name=original['tool_name'],
        task_class=original['task_class'],
        payload=original['payload'],
        timeout=original['timeout'],
    )
    
    return {"original_id": task_id, "new_task": new_task}


# === Tool & Script Endpoints ===

@app.get("/api/tools")
def list_tools():
    """List registered tools"""
    registry = get_registry()
    tools = registry.list_tools()
    
    result = []
    for name, config in tools.items():
        result.append({
            "name": name,
            "description": config.get("description", ""),
            "task_class": config.get("task_class", "MEDIUM_SCRIPT"),
            "timeout": registry.get_timeout(name),
        })
    
    return result


@app.post("/api/reload")
def reload_config():
    """Reload tools and configuration from sparkq.yml"""
    reload_registry()
    return {"status": "ok", "message": "Configuration reloaded"}


# === Static Files (Web UI) ===

# Get the UI directory path
UI_DIR = Path(__file__).parent / "ui"

@app.get("/")
def serve_index():
    """Serve the main UI page"""
    index_path = UI_DIR / "index.html"
    if index_path.exists():
        return FileResponse(index_path)
    return JSONResponse(
        {"error": "Web UI not found. Run from sparkq directory."},
        status_code=404
    )


# Mount static files if directory exists
if UI_DIR.exists():
    app.mount("/static", StaticFiles(directory=UI_DIR), name="static")
```

### Task 3.1.3: Update CLI with Server Commands

Update `src/cli.py` to implement run/stop/status:

```python
@app.command()
def run(
    session: Optional[str] = typer.Option(None, "--session", "-s", help="Start all streams in this session"),
):
    """Start SparkQ server. Interactive mode if no --session specified."""
    from .server import run_server, check_server_running
    from .storage import Storage
    
    # Check if already running
    existing_pid = check_server_running()
    if existing_pid:
        typer.echo(f"Error: SparkQ server already running (PID {existing_pid})")
        typer.echo("Stop it first with: sparkq stop")
        raise typer.Exit(1)
    
    storage = Storage("sparkq.db")
    
    # Check project exists
    project = storage.get_project()
    if not project:
        typer.echo("Error: Run 'sparkq setup' first.", err=True)
        raise typer.Exit(1)
    
    if session:
        # Direct mode: start server for specific session
        sess = storage.get_session_by_name(session)
        if not sess:
            typer.echo(f"Error: Session '{session}' not found.", err=True)
            raise typer.Exit(1)
        
        if sess['status'] == 'ended':
            typer.echo(f"Error: Session '{session}' is ended.", err=True)
            raise typer.Exit(1)
        
        streams = storage.list_streams(session_id=sess['id'], status='active')
        
        typer.echo(f"\nStarting SparkQ for session '{session}'")
        typer.echo(f"\nStreams ({len(streams)}):")
        for st in streams:
            task_counts = storage.count_tasks_by_status(stream_id=st['id'])
            queued = task_counts.get('queued', 0)
            typer.echo(f"  [{st['name']}] {queued} queued")
            if st.get('instructions'):
                typer.echo(f"    Instructions: {st['instructions'][:60]}...")
        
        typer.echo()
        run_server()
    
    else:
        # Interactive mode: prompt for session/stream
        sessions = storage.list_sessions(status='active')
        
        if not sessions:
            typer.echo("No active sessions found.")
            typer.echo("Create one with: sparkq session create <name>")
            raise typer.Exit(1)
        
        # Show sessions with task counts
        typer.echo("\nActive sessions:")
        for i, s in enumerate(sessions, 1):
            streams = storage.list_streams(session_id=s['id'], status='active')
            total_queued = 0
            for st in streams:
                counts = storage.count_tasks_by_status(stream_id=st['id'])
                total_queued += counts.get('queued', 0)
            typer.echo(f"  {i}. {s['name']} ({len(streams)} streams, {total_queued} queued)")
        
        # Prompt for selection
        choice = typer.prompt("\nSelect session number", type=int)
        if choice < 1 or choice > len(sessions):
            typer.echo("Invalid selection.")
            raise typer.Exit(1)
        
        selected_session = sessions[choice - 1]
        streams = storage.list_streams(session_id=selected_session['id'], status='active')
        
        if not streams:
            typer.echo(f"No active streams in session '{selected_session['name']}'.")
            typer.echo("Create one with: sparkq stream create <name> --session " + selected_session['name'])
            raise typer.Exit(1)
        
        typer.echo(f"\nStreams in '{selected_session['name']}':")
        for st in streams:
            task_counts = storage.count_tasks_by_status(stream_id=st['id'])
            queued = task_counts.get('queued', 0)
            typer.echo(f"  [{st['name']}] {queued} queued")
            if st.get('instructions'):
                typer.echo(f"    Instructions: {st['instructions'][:60]}...")
        
        typer.echo()
        run_server()


@app.command()
def stop(
    stream: Optional[str] = typer.Option(None, "--stream", "-s", help="Stop only this stream's watcher"),
):
    """Stop SparkQ server (and all watchers, or just specified stream)."""
    from .server import stop_server, server_status
    
    if stream:
        # Phase 4: Stop specific stream watcher
        typer.echo(f"Stopping watcher for stream '{stream}'...")
        typer.echo("Note: Stream-specific stop will be implemented in Phase 4")
        # For now, just show message
        return
    
    # Stop the server
    status = server_status()
    if not status['running']:
        typer.echo("SparkQ server is not running.")
        return
    
    if stop_server():
        typer.echo("SparkQ server stopped.")
    else:
        typer.echo("Failed to stop server.", err=True)
        raise typer.Exit(1)


@app.command()
def status():
    """Show SparkQ status (server, sessions, streams, queue stats)."""
    from .server import server_status
    from .storage import Storage
    
    srv_status = server_status()
    storage = Storage("sparkq.db")
    
    typer.echo("\n" + "=" * 50)
    typer.echo("SparkQ Status")
    typer.echo("=" * 50)
    
    # Server status
    if srv_status['running']:
        typer.echo(f"\nServer: RUNNING (PID {srv_status['pid']})")
        typer.echo(f"  URL: http://127.0.0.1:8420/")
    else:
        typer.echo("\nServer: STOPPED")
    
    # Session/stream stats
    sessions = storage.list_sessions(status='active')
    all_streams = storage.list_streams(status='active')
    task_counts = storage.count_tasks_by_status()
    
    typer.echo(f"\nSessions: {len(sessions)} active")
    typer.echo(f"Streams: {len(all_streams)} active")
    
    typer.echo(f"\nTasks:")
    typer.echo(f"  Queued:    {task_counts.get('queued', 0)}")
    typer.echo(f"  Running:   {task_counts.get('running', 0)}")
    typer.echo(f"  Succeeded: {task_counts.get('succeeded', 0)}")
    typer.echo(f"  Failed:    {task_counts.get('failed', 0)}")
    
    # Show streams with queued tasks
    streams_with_tasks = storage.get_streams_with_queued_tasks()
    if streams_with_tasks:
        typer.echo(f"\nStreams with queued tasks:")
        for s in streams_with_tasks:
            typer.echo(f"  {s['name']:<20} {s['queued_count']} queued")


@app.command()
def reload():
    """Reload sparkq.yml (tools, script index). No server restart needed."""
    from .tools import reload_registry
    
    reload_registry()
    typer.echo("Configuration reloaded from sparkq.yml")
    typer.echo("Tools and script index updated.")
```

---

## Phase 3.2: Web UI

### Task 3.2.1: Create UI Directory Structure

```
sparkq/src/ui/
├── index.html      # Main SPA shell
├── style.css       # Dark theme styling
└── app.js          # Dashboard and page logic
```

### Task 3.2.2: Create index.html

Create `src/ui/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SparkQ - Task Queue</title>
    <link rel="stylesheet" href="/static/style.css">
</head>
<body>
    <div class="app">
        <nav class="sidebar">
            <div class="logo">
                <h1>⚡ SparkQ</h1>
            </div>
            <ul class="nav-links">
                <li><a href="#" data-page="dashboard" class="active">📊 Dashboard</a></li>
                <li><a href="#" data-page="sessions">📁 Sessions</a></li>
                <li><a href="#" data-page="streams">🌊 Streams</a></li>
                <li><a href="#" data-page="tasks">📋 Tasks</a></li>
                <li><a href="#" data-page="enqueue">➕ Enqueue</a></li>
            </ul>
            <div class="nav-footer">
                <div class="status-indicator" id="server-status">
                    <span class="status-dot"></span>
                    <span class="status-text">Checking...</span>
                </div>
            </div>
        </nav>
        
        <main class="content">
            <div id="page-content">
                <!-- Dynamic content loaded here -->
            </div>
        </main>
    </div>
    
    <script src="/static/app.js"></script>
</body>
</html>
```

### Task 3.2.3: Create style.css

Create `src/ui/style.css`:

```css
/* SparkQ Dark Theme */

:root {
    --bg-primary: #1a1a2e;
    --bg-secondary: #16213e;
    --bg-tertiary: #0f3460;
    --text-primary: #eaeaea;
    --text-secondary: #a0a0a0;
    --accent: #e94560;
    --success: #00d26a;
    --warning: #ffc107;
    --error: #ff6b6b;
    --info: #4dabf7;
    
    --status-queued: #4dabf7;
    --status-running: #ffc107;
    --status-succeeded: #00d26a;
    --status-failed: #ff6b6b;
}

* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
    background: var(--bg-primary);
    color: var(--text-primary);
    line-height: 1.6;
}

.app {
    display: flex;
    min-height: 100vh;
}

/* Sidebar */
.sidebar {
    width: 220px;
    background: var(--bg-secondary);
    padding: 20px;
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--bg-tertiary);
}

.logo h1 {
    font-size: 1.5rem;
    margin-bottom: 30px;
    color: var(--accent);
}

.nav-links {
    list-style: none;
    flex: 1;
}

.nav-links li {
    margin-bottom: 8px;
}

.nav-links a {
    display: block;
    padding: 10px 15px;
    color: var(--text-secondary);
    text-decoration: none;
    border-radius: 8px;
    transition: all 0.2s;
}

.nav-links a:hover,
.nav-links a.active {
    background: var(--bg-tertiary);
    color: var(--text-primary);
}

.nav-footer {
    padding-top: 20px;
    border-top: 1px solid var(--bg-tertiary);
}

.status-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.85rem;
}

.status-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--text-secondary);
}

.status-dot.running {
    background: var(--success);
}

.status-dot.stopped {
    background: var(--error);
}

/* Main Content */
.content {
    flex: 1;
    padding: 30px;
    overflow-y: auto;
}

.page-header {
    margin-bottom: 30px;
}

.page-header h2 {
    font-size: 1.8rem;
    margin-bottom: 8px;
}

.page-header p {
    color: var(--text-secondary);
}

/* Cards */
.card {
    background: var(--bg-secondary);
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 20px;
}

.card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 15px;
}

.card-title {
    font-size: 1.1rem;
    font-weight: 600;
}

/* Stats Grid */
.stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 20px;
    margin-bottom: 30px;
}

.stat-card {
    background: var(--bg-secondary);
    border-radius: 12px;
    padding: 20px;
    text-align: center;
}

.stat-value {
    font-size: 2.5rem;
    font-weight: bold;
    margin-bottom: 5px;
}

.stat-label {
    color: var(--text-secondary);
    font-size: 0.9rem;
}

.stat-card.queued .stat-value { color: var(--status-queued); }
.stat-card.running .stat-value { color: var(--status-running); }
.stat-card.succeeded .stat-value { color: var(--status-succeeded); }
.stat-card.failed .stat-value { color: var(--status-failed); }

/* Tables */
.table-container {
    overflow-x: auto;
}

table {
    width: 100%;
    border-collapse: collapse;
}

th, td {
    padding: 12px 15px;
    text-align: left;
    border-bottom: 1px solid var(--bg-tertiary);
}

th {
    background: var(--bg-tertiary);
    font-weight: 600;
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

tr:hover {
    background: rgba(255, 255, 255, 0.02);
}

/* Status Badges */
.status-badge {
    display: inline-block;
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 0.8rem;
    font-weight: 500;
}

.status-badge.queued {
    background: rgba(77, 171, 247, 0.2);
    color: var(--status-queued);
}

.status-badge.running {
    background: rgba(255, 193, 7, 0.2);
    color: var(--status-running);
}

.status-badge.succeeded {
    background: rgba(0, 210, 106, 0.2);
    color: var(--status-succeeded);
}

.status-badge.failed {
    background: rgba(255, 107, 107, 0.2);
    color: var(--status-failed);
}

.status-badge.active {
    background: rgba(0, 210, 106, 0.2);
    color: var(--status-succeeded);
}

.status-badge.ended {
    background: rgba(160, 160, 160, 0.2);
    color: var(--text-secondary);
}

/* Stale indicator */
.stale-indicator {
    color: var(--warning);
    margin-left: 5px;
}

/* Buttons */
.btn {
    display: inline-block;
    padding: 10px 20px;
    border: none;
    border-radius: 8px;
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    text-decoration: none;
}

.btn-primary {
    background: var(--accent);
    color: white;
}

.btn-primary:hover {
    background: #d63a52;
}

.btn-secondary {
    background: var(--bg-tertiary);
    color: var(--text-primary);
}

.btn-secondary:hover {
    background: #1a4a7a;
}

.btn-small {
    padding: 5px 12px;
    font-size: 0.8rem;
}

/* Forms */
.form-group {
    margin-bottom: 20px;
}

.form-group label {
    display: block;
    margin-bottom: 8px;
    font-weight: 500;
}

.form-group input,
.form-group select,
.form-group textarea {
    width: 100%;
    padding: 12px;
    background: var(--bg-primary);
    border: 1px solid var(--bg-tertiary);
    border-radius: 8px;
    color: var(--text-primary);
    font-size: 0.95rem;
}

.form-group input:focus,
.form-group select:focus,
.form-group textarea:focus {
    outline: none;
    border-color: var(--accent);
}

.form-group textarea {
    min-height: 150px;
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: 0.85rem;
}

/* Task Detail */
.task-detail {
    display: grid;
    gap: 20px;
}

.detail-section {
    background: var(--bg-primary);
    border-radius: 8px;
    padding: 15px;
}

.detail-section h4 {
    margin-bottom: 10px;
    color: var(--text-secondary);
    font-size: 0.85rem;
    text-transform: uppercase;
}

.detail-section pre {
    background: var(--bg-secondary);
    padding: 15px;
    border-radius: 6px;
    overflow-x: auto;
    font-size: 0.85rem;
    max-height: 300px;
    overflow-y: auto;
}

/* Filters */
.filters {
    display: flex;
    gap: 15px;
    margin-bottom: 20px;
    flex-wrap: wrap;
}

.filters select {
    padding: 8px 15px;
    background: var(--bg-secondary);
    border: 1px solid var(--bg-tertiary);
    border-radius: 6px;
    color: var(--text-primary);
}

/* Empty State */
.empty-state {
    text-align: center;
    padding: 60px 20px;
    color: var(--text-secondary);
}

.empty-state h3 {
    margin-bottom: 10px;
}

/* Loading */
.loading {
    text-align: center;
    padding: 40px;
    color: var(--text-secondary);
}

/* Clickable rows */
tr.clickable {
    cursor: pointer;
}

tr.clickable:hover {
    background: rgba(233, 69, 96, 0.1);
}

/* Responsive */
@media (max-width: 768px) {
    .sidebar {
        width: 60px;
        padding: 10px;
    }
    
    .logo h1,
    .nav-links a span,
    .nav-footer {
        display: none;
    }
    
    .nav-links a {
        text-align: center;
        padding: 15px 5px;
    }
}
```

### Task 3.2.4: Create app.js

Create `src/ui/app.js`:

```javascript
// SparkQ Web UI Application

const API_BASE = '/api';

// === Utility Functions ===

async function api(endpoint, options = {}) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
        },
        ...options,
    });
    
    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(error.detail || error.error || 'Request failed');
    }
    
    return response.json();
}

function formatDate(isoString) {
    if (!isoString) return '-';
    const date = new Date(isoString);
    return date.toLocaleString();
}

function formatDuration(seconds) {
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
    return `${(seconds / 3600).toFixed(1)}h`;
}

function isStale(task) {
    if (task.status !== 'running' || !task.started_at) return false;
    const started = new Date(task.started_at);
    const elapsed = (Date.now() - started.getTime()) / 1000;
    return elapsed > task.timeout;
}

// === Page Rendering ===

async function renderDashboard() {
    const content = document.getElementById('page-content');
    content.innerHTML = '<div class="loading">Loading...</div>';
    
    try {
        const status = await api('/status');
        const tasks = await api('/tasks');
        const streams = await api('/streams?status=active');
        
        // Count tasks by status
        const taskCounts = {
            queued: tasks.filter(t => t.status === 'queued').length,
            running: tasks.filter(t => t.status === 'running').length,
            succeeded: tasks.filter(t => t.status === 'succeeded').length,
            failed: tasks.filter(t => t.status === 'failed').length,
        };
        
        // Recent tasks
        const recentTasks = tasks.slice(0, 10);
        
        content.innerHTML = `
            <div class="page-header">
                <h2>Dashboard</h2>
                <p>Overview of your task queue</p>
            </div>
            
            <div class="stats-grid">
                <div class="stat-card queued">
                    <div class="stat-value">${taskCounts.queued}</div>
                    <div class="stat-label">Queued</div>
                </div>
                <div class="stat-card running">
                    <div class="stat-value">${taskCounts.running}</div>
                    <div class="stat-label">Running</div>
                </div>
                <div class="stat-card succeeded">
                    <div class="stat-value">${taskCounts.succeeded}</div>
                    <div class="stat-label">Succeeded</div>
                </div>
                <div class="stat-card failed">
                    <div class="stat-value">${taskCounts.failed}</div>
                    <div class="stat-label">Failed</div>
                </div>
            </div>
            
            <div class="card">
                <div class="card-header">
                    <span class="card-title">Active Streams</span>
                </div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Queued</th>
                                <th>Running</th>
                                <th>Instructions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${streams.length === 0 ? `
                                <tr><td colspan="4" class="empty-state">No active streams</td></tr>
                            ` : streams.map(s => `
                                <tr>
                                    <td><strong>${s.name}</strong></td>
                                    <td><span class="status-badge queued">${s.tasks_queued}</span></td>
                                    <td><span class="status-badge running">${s.tasks_running}</span></td>
                                    <td>${s.instructions ? s.instructions.substring(0, 50) + '...' : '-'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
            
            <div class="card">
                <div class="card-header">
                    <span class="card-title">Recent Tasks</span>
                </div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Tool</th>
                                <th>Stream</th>
                                <th>Status</th>
                                <th>Created</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${recentTasks.length === 0 ? `
                                <tr><td colspan="5" class="empty-state">No tasks yet</td></tr>
                            ` : recentTasks.map(t => `
                                <tr class="clickable" onclick="showTaskDetail('${t.id}')">
                                    <td><code>${t.id}</code></td>
                                    <td>${t.tool_name}</td>
                                    <td>${t.stream_name}</td>
                                    <td>
                                        <span class="status-badge ${t.status}">${t.status}</span>
                                        ${isStale(t) ? '<span class="stale-indicator">⚠️</span>' : ''}
                                    </td>
                                    <td>${formatDate(t.created_at)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    } catch (error) {
        content.innerHTML = `<div class="empty-state"><h3>Error loading dashboard</h3><p>${error.message}</p></div>`;
    }
}

async function renderSessions() {
    const content = document.getElementById('page-content');
    content.innerHTML = '<div class="loading">Loading...</div>';
    
    try {
        const sessions = await api('/sessions');
        
        content.innerHTML = `
            <div class="page-header">
                <h2>Sessions</h2>
                <p>Work sessions group related streams</p>
            </div>
            
            <div class="card">
                <div class="card-header">
                    <span class="card-title">Create Session</span>
                </div>
                <form id="create-session-form" onsubmit="createSession(event)">
                    <div class="form-group">
                        <label>Name</label>
                        <input type="text" name="name" required placeholder="e.g., api-v2">
                    </div>
                    <div class="form-group">
                        <label>Description (optional)</label>
                        <input type="text" name="description" placeholder="What is this session for?">
                    </div>
                    <button type="submit" class="btn btn-primary">Create Session</button>
                </form>
            </div>
            
            <div class="card">
                <div class="card-header">
                    <span class="card-title">All Sessions</span>
                </div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Status</th>
                                <th>Streams</th>
                                <th>Started</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${sessions.length === 0 ? `
                                <tr><td colspan="5" class="empty-state">No sessions yet</td></tr>
                            ` : sessions.map(s => `
                                <tr>
                                    <td><strong>${s.name}</strong>${s.description ? `<br><small>${s.description}</small>` : ''}</td>
                                    <td><span class="status-badge ${s.status}">${s.status}</span></td>
                                    <td>${s.stream_count || 0}</td>
                                    <td>${formatDate(s.started_at)}</td>
                                    <td>
                                        ${s.status === 'active' ? `
                                            <button class="btn btn-small btn-secondary" onclick="endSession('${s.id}')">End</button>
                                        ` : ''}
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    } catch (error) {
        content.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${error.message}</p></div>`;
    }
}

async function renderStreams() {
    const content = document.getElementById('page-content');
    content.innerHTML = '<div class="loading">Loading...</div>';
    
    try {
        const [streams, sessions] = await Promise.all([
            api('/streams'),
            api('/sessions?status=active'),
        ]);
        
        content.innerHTML = `
            <div class="page-header">
                <h2>Streams</h2>
                <p>Feature lanes within sessions</p>
            </div>
            
            <div class="card">
                <div class="card-header">
                    <span class="card-title">Create Stream</span>
                </div>
                <form id="create-stream-form" onsubmit="createStream(event)">
                    <div class="form-group">
                        <label>Name (globally unique)</label>
                        <input type="text" name="name" required placeholder="e.g., auth">
                    </div>
                    <div class="form-group">
                        <label>Session</label>
                        <select name="session_id" required>
                            <option value="">Select a session...</option>
                            ${sessions.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Instructions (mini-FRD)</label>
                        <textarea name="instructions" placeholder="What should workers know about this stream?"></textarea>
                    </div>
                    <button type="submit" class="btn btn-primary">Create Stream</button>
                </form>
            </div>
            
            <div class="card">
                <div class="card-header">
                    <span class="card-title">All Streams</span>
                </div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Status</th>
                                <th>Queued</th>
                                <th>Running</th>
                                <th>Succeeded</th>
                                <th>Failed</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${streams.length === 0 ? `
                                <tr><td colspan="7" class="empty-state">No streams yet</td></tr>
                            ` : streams.map(s => `
                                <tr>
                                    <td>
                                        <strong>${s.name}</strong>
                                        ${s.instructions ? `<br><small>${s.instructions.substring(0, 40)}...</small>` : ''}
                                    </td>
                                    <td><span class="status-badge ${s.status}">${s.status}</span></td>
                                    <td><span class="status-badge queued">${s.tasks_queued || 0}</span></td>
                                    <td><span class="status-badge running">${s.tasks_running || 0}</span></td>
                                    <td><span class="status-badge succeeded">${s.tasks_succeeded || 0}</span></td>
                                    <td><span class="status-badge failed">${s.tasks_failed || 0}</span></td>
                                    <td>
                                        ${s.status === 'active' ? `
                                            <button class="btn btn-small btn-secondary" onclick="endStream('${s.id}')">End</button>
                                        ` : ''}
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    } catch (error) {
        content.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${error.message}</p></div>`;
    }
}

async function renderTasks() {
    const content = document.getElementById('page-content');
    content.innerHTML = '<div class="loading">Loading...</div>';
    
    try {
        const [tasks, streams] = await Promise.all([
            api('/tasks'),
            api('/streams'),
        ]);
        
        content.innerHTML = `
            <div class="page-header">
                <h2>Tasks</h2>
                <p>All queued and completed work</p>
            </div>
            
            <div class="filters">
                <select id="filter-status" onchange="filterTasks()">
                    <option value="">All Statuses</option>
                    <option value="queued">Queued</option>
                    <option value="running">Running</option>
                    <option value="succeeded">Succeeded</option>
                    <option value="failed">Failed</option>
                </select>
                <select id="filter-stream" onchange="filterTasks()">
                    <option value="">All Streams</option>
                    ${streams.map(s => `<option value="${s.name}">${s.name}</option>`).join('')}
                </select>
                <label style="display: flex; align-items: center; gap: 5px;">
                    <input type="checkbox" id="filter-stale" onchange="filterTasks()">
                    Show only stale
                </label>
            </div>
            
            <div class="card">
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Tool</th>
                                <th>Stream</th>
                                <th>Status</th>
                                <th>Created</th>
                                <th>Duration</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="tasks-tbody">
                            ${renderTaskRows(tasks)}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        
        // Store tasks for filtering
        window.allTasks = tasks;
    } catch (error) {
        content.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${error.message}</p></div>`;
    }
}

function renderTaskRows(tasks) {
    if (tasks.length === 0) {
        return '<tr><td colspan="7" class="empty-state">No tasks found</td></tr>';
    }
    
    return tasks.map(t => {
        let duration = '-';
        if (t.started_at && t.finished_at) {
            const started = new Date(t.started_at);
            const finished = new Date(t.finished_at);
            duration = formatDuration((finished - started) / 1000);
        } else if (t.started_at && t.status === 'running') {
            const started = new Date(t.started_at);
            duration = formatDuration((Date.now() - started) / 1000) + ' (running)';
        }
        
        return `
            <tr class="clickable" onclick="showTaskDetail('${t.id}')">
                <td><code>${t.id}</code></td>
                <td>${t.tool_name}</td>
                <td>${t.stream_name}</td>
                <td>
                    <span class="status-badge ${t.status}">${t.status}</span>
                    ${isStale(t) ? '<span class="stale-indicator">⚠️</span>' : ''}
                </td>
                <td>${formatDate(t.created_at)}</td>
                <td>${duration}</td>
                <td>
                    ${t.status === 'failed' ? `
                        <button class="btn btn-small btn-secondary" onclick="event.stopPropagation(); requeueTask('${t.id}')">Requeue</button>
                    ` : ''}
                </td>
            </tr>
        `;
    }).join('');
}

function filterTasks() {
    const status = document.getElementById('filter-status').value;
    const stream = document.getElementById('filter-stream').value;
    const stale = document.getElementById('filter-stale').checked;
    
    let filtered = window.allTasks || [];
    
    if (status) {
        filtered = filtered.filter(t => t.status === status);
    }
    if (stream) {
        filtered = filtered.filter(t => t.stream_name === stream);
    }
    if (stale) {
        filtered = filtered.filter(t => isStale(t));
    }
    
    document.getElementById('tasks-tbody').innerHTML = renderTaskRows(filtered);
}

async function showTaskDetail(taskId) {
    const content = document.getElementById('page-content');
    content.innerHTML = '<div class="loading">Loading...</div>';
    
    try {
        const task = await api(`/tasks/${taskId}`);
        
        content.innerHTML = `
            <div class="page-header">
                <h2>Task: ${task.id}</h2>
                <p>
                    <span class="status-badge ${task.status}">${task.status}</span>
                    ${isStale(task) ? '<span class="stale-indicator">⚠️ STALE</span>' : ''}
                </p>
            </div>
            
            <button class="btn btn-secondary" onclick="renderTasks()" style="margin-bottom: 20px;">← Back to Tasks</button>
            ${task.status === 'failed' ? `<button class="btn btn-primary" onclick="requeueTask('${task.id}')" style="margin-left: 10px;">Requeue</button>` : ''}
            
            <div class="task-detail">
                <div class="card">
                    <div class="card-header">
                        <span class="card-title">Basic Info</span>
                    </div>
                    <table>
                        <tr><td><strong>Tool</strong></td><td>${task.tool_name}</td></tr>
                        <tr><td><strong>Task Class</strong></td><td>${task.task_class}</td></tr>
                        <tr><td><strong>Stream</strong></td><td>${task.stream_name}</td></tr>
                        <tr><td><strong>Timeout</strong></td><td>${task.timeout}s</td></tr>
                        <tr><td><strong>Attempts</strong></td><td>${task.attempts}</td></tr>
                    </table>
                </div>
                
                <div class="card">
                    <div class="card-header">
                        <span class="card-title">Timing</span>
                    </div>
                    <table>
                        <tr><td><strong>Created</strong></td><td>${formatDate(task.created_at)}</td></tr>
                        <tr><td><strong>Started</strong></td><td>${formatDate(task.started_at)}</td></tr>
                        <tr><td><strong>Finished</strong></td><td>${formatDate(task.finished_at)}</td></tr>
                    </table>
                </div>
                
                <div class="card">
                    <div class="card-header">
                        <span class="card-title">Payload</span>
                    </div>
                    <div class="detail-section">
                        <pre>${JSON.stringify(task.payload_parsed || task.payload, null, 2)}</pre>
                    </div>
                </div>
                
                ${task.result ? `
                    <div class="card">
                        <div class="card-header">
                            <span class="card-title">Result</span>
                        </div>
                        <div class="detail-section">
                            <pre>${JSON.stringify(task.result_parsed || task.result, null, 2)}</pre>
                        </div>
                    </div>
                ` : ''}
                
                ${task.error ? `
                    <div class="card">
                        <div class="card-header">
                            <span class="card-title">Error</span>
                        </div>
                        <div class="detail-section">
                            <pre style="color: var(--error);">${task.error}</pre>
                        </div>
                    </div>
                ` : ''}
                
                ${task.stdout ? `
                    <div class="card">
                        <div class="card-header">
                            <span class="card-title">Stdout</span>
                        </div>
                        <div class="detail-section">
                            <pre>${task.stdout}</pre>
                        </div>
                    </div>
                ` : ''}
                
                ${task.stderr ? `
                    <div class="card">
                        <div class="card-header">
                            <span class="card-title">Stderr</span>
                        </div>
                        <div class="detail-section">
                            <pre style="color: var(--warning);">${task.stderr}</pre>
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    } catch (error) {
        content.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${error.message}</p></div>`;
    }
}

async function renderEnqueue() {
    const content = document.getElementById('page-content');
    content.innerHTML = '<div class="loading">Loading...</div>';
    
    try {
        const [tools, streams] = await Promise.all([
            api('/tools'),
            api('/streams?status=active'),
        ]);
        
        content.innerHTML = `
            <div class="page-header">
                <h2>Enqueue Task</h2>
                <p>Add a new task to the queue</p>
            </div>
            
            <div class="card">
                <form id="enqueue-form" onsubmit="enqueueTask(event)">
                    <div class="form-group">
                        <label>Tool</label>
                        <select name="tool_name" required onchange="updateToolInfo(this.value)">
                            <option value="">Select a tool...</option>
                            ${tools.map(t => `<option value="${t.name}">${t.name} - ${t.description}</option>`).join('')}
                        </select>
                        <div id="tool-info" style="margin-top: 8px; color: var(--text-secondary); font-size: 0.85rem;"></div>
                    </div>
                    <div class="form-group">
                        <label>Stream</label>
                        <select name="stream_id" required>
                            <option value="">Select a stream...</option>
                            ${streams.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Payload (JSON)</label>
                        <textarea name="payload" required placeholder='{"script_path": "scripts/my-script.sh"}'>{}</textarea>
                    </div>
                    <div class="form-group">
                        <label>Timeout Override (optional, seconds)</label>
                        <input type="number" name="timeout" placeholder="Leave empty for default">
                    </div>
                    <button type="submit" class="btn btn-primary">Enqueue Task</button>
                </form>
            </div>
        `;
        
        // Store tools for info display
        window.toolsInfo = tools;
    } catch (error) {
        content.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${error.message}</p></div>`;
    }
}

function updateToolInfo(toolName) {
    const info = document.getElementById('tool-info');
    const tool = (window.toolsInfo || []).find(t => t.name === toolName);
    if (tool) {
        info.innerHTML = `Task class: <strong>${tool.task_class}</strong> | Default timeout: <strong>${tool.timeout}s</strong>`;
    } else {
        info.innerHTML = '';
    }
}

// === Action Functions ===

async function createSession(event) {
    event.preventDefault();
    const form = event.target;
    const data = {
        name: form.name.value,
        description: form.description.value || null,
    };
    
    try {
        await api('/sessions', { method: 'POST', body: JSON.stringify(data) });
        renderSessions();
    } catch (error) {
        alert('Error creating session: ' + error.message);
    }
}

async function endSession(sessionId) {
    if (!confirm('End this session?')) return;
    
    try {
        await api(`/sessions/${sessionId}`, {
            method: 'PUT',
            body: JSON.stringify({ status: 'ended' }),
        });
        renderSessions();
    } catch (error) {
        alert('Error ending session: ' + error.message);
    }
}

async function createStream(event) {
    event.preventDefault();
    const form = event.target;
    const data = {
        name: form.name.value,
        session_id: form.session_id.value,
        instructions: form.instructions.value || null,
    };
    
    try {
        await api('/streams', { method: 'POST', body: JSON.stringify(data) });
        renderStreams();
    } catch (error) {
        alert('Error creating stream: ' + error.message);
    }
}

async function endStream(streamId) {
    if (!confirm('End this stream?')) return;
    
    try {
        await api(`/streams/${streamId}`, {
            method: 'PUT',
            body: JSON.stringify({ status: 'ended' }),
        });
        renderStreams();
    } catch (error) {
        alert('Error ending stream: ' + error.message);
    }
}

async function enqueueTask(event) {
    event.preventDefault();
    const form = event.target;
    
    let payload;
    try {
        payload = JSON.parse(form.payload.value);
    } catch (e) {
        alert('Invalid JSON in payload');
        return;
    }
    
    const data = {
        tool_name: form.tool_name.value,
        stream_id: form.stream_id.value,
        payload: payload,
        timeout: form.timeout.value ? parseInt(form.timeout.value) : null,
    };
    
    try {
        const task = await api('/tasks', { method: 'POST', body: JSON.stringify(data) });
        alert(`Task enqueued: ${task.id}`);
        form.reset();
    } catch (error) {
        alert('Error enqueuing task: ' + error.message);
    }
}

async function requeueTask(taskId) {
    if (!confirm('Requeue this failed task?')) return;
    
    try {
        const result = await api(`/tasks/${taskId}/requeue`, { method: 'POST' });
        alert(`Requeued as: ${result.new_task.id}`);
        renderTasks();
    } catch (error) {
        alert('Error requeuing task: ' + error.message);
    }
}

// === Navigation ===

function navigateTo(page) {
    // Update active nav
    document.querySelectorAll('.nav-links a').forEach(a => {
        a.classList.toggle('active', a.dataset.page === page);
    });
    
    // Render page
    switch (page) {
        case 'dashboard':
            renderDashboard();
            break;
        case 'sessions':
            renderSessions();
            break;
        case 'streams':
            renderStreams();
            break;
        case 'tasks':
            renderTasks();
            break;
        case 'enqueue':
            renderEnqueue();
            break;
        default:
            renderDashboard();
    }
}

// === Server Status ===

async function updateServerStatus() {
    const indicator = document.getElementById('server-status');
    const dot = indicator.querySelector('.status-dot');
    const text = indicator.querySelector('.status-text');
    
    try {
        const status = await api('/health');
        dot.className = 'status-dot running';
        text.textContent = 'Server running';
    } catch (error) {
        dot.className = 'status-dot stopped';
        text.textContent = 'Server error';
    }
}

// === Initialization ===

document.addEventListener('DOMContentLoaded', () => {
    // Set up navigation
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            navigateTo(link.dataset.page);
        });
    });
    
    // Initial page load
    navigateTo('dashboard');
    
    // Update server status periodically
    updateServerStatus();
    setInterval(updateServerStatus, 30000);
});
```

---

## Phase 3 Completion Criteria

After Phase 3, all these should work:

```bash
# Server commands
sparkq run                                # Interactive mode
sparkq run --session api-v2               # Direct mode
sparkq stop                               # Stop server
sparkq status                             # Show status

# Web UI at http://localhost:8420
# - Dashboard shows stats and recent tasks
# - Can create sessions and streams
# - Can view/filter tasks
# - Can view task detail with payload/result/stdout/stderr
# - Can enqueue tasks via form
# - Can requeue failed tasks

# API endpoints
curl http://localhost:8420/api/health
curl http://localhost:8420/api/status
curl http://localhost:8420/api/sessions
curl http://localhost:8420/api/streams
curl http://localhost:8420/api/tasks
curl http://localhost:8420/api/tools
```

---

## Validation Checklist

Before moving to Phase 4, verify:

- [ ] `sparkq run` starts server on port 8420
- [ ] `sparkq run` refuses if already running (lockfile)
- [ ] `sparkq stop` stops the server gracefully
- [ ] `sparkq status` shows server state and queue stats
- [ ] `sparkq reload` reloads tools from sparkq.yml
- [ ] Auto-purge runs on startup (check logs)
- [ ] All API endpoints return correct data
- [ ] Web UI loads and shows dashboard
- [ ] Can create sessions via UI
- [ ] Can create streams via UI
- [ ] Can enqueue tasks via UI
- [ ] Can view task detail via UI
- [ ] Can requeue failed tasks via UI
- [ ] Stale indicators show for running tasks past timeout

---

## File Changes Summary

**New files:**
- `src/server.py` - Uvicorn server wrapper with lockfile handling
- `src/api.py` - FastAPI application with all endpoints
- `src/ui/index.html` - Web UI shell
- `src/ui/style.css` - Dark theme styling
- `src/ui/app.js` - Dashboard and page logic

**Modified files:**
- `src/cli.py` - Added run, stop, status, reload implementations

---

## Next Phase Preview

**Phase 4** will implement:
- `sparkq-watcher.sh` - Background bash watcher script
- Full WORKER_PLAYBOOK.md with all patterns
- Stale task detection (1x timeout warning)
- Auto-fail logic (2x timeout)
- Watcher integration with `sparkq run`
