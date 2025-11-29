"""SparkQ CLI Commands"""

import os
import signal
import threading
from pathlib import Path
from typing import Optional

import typer

from .storage import Storage

app = typer.Typer(
    name="sparkq",
    help="SparkQ - Dev-only task queue. Queue work, walk away, review results later.",
    no_args_is_help=True,
)

# Reuse a single storage instance for all commands
storage = Storage("sparkq.db")


# === Setup ===

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
    storage.init_db()

    # Create project record
    storage.create_project(
        name=project_name,
        repo_path=repo_path,
        prd_path=prd_path or None,
    )

    typer.echo("Database initialized.")
    typer.echo("\nRun 'sparkq session create <name>' to start working.")


# === Server Commands ===


@app.command()
def run(
    port: int = typer.Option(8420, help="Server port"),
    host: str = typer.Option("127.0.0.1", help="Bind host"),
):
    """Start SparkQ HTTP server"""
    from .server import run_server

    try:
        run_server(port=port, host=host)
    except Exception as exc:
        typer.echo(f"Error: {exc}", err=True)
        raise typer.Exit(1)


@app.command()
def stop():
    """Stop the running SparkQ server"""
    from .server import check_server_running, remove_lockfile

    lockfile_path = Path("sparkq.lock")
    if not lockfile_path.exists():
        typer.echo("Error: Server not running", err=True)
        raise typer.Exit(1)

    pid = check_server_running()
    if pid is None:
        typer.echo("Error: Server not running", err=True)
        raise typer.Exit(1)

    try:
        os.kill(pid, signal.SIGTERM)
    except OSError:
        typer.echo("Error: Server not running", err=True)
        raise typer.Exit(1)

    wait_event = threading.Event()

    def _is_running(target_pid: int) -> bool:
        try:
            os.kill(target_pid, 0)
            return True
        except OSError:
            return False

    elapsed = 0.0
    while elapsed < 5:
        if not _is_running(pid):
            break
        wait_event.wait(0.1)
        elapsed += 0.1

    if _is_running(pid):
        try:
            os.kill(pid, signal.SIGKILL)
        except OSError:
            pass

    remove_lockfile()
    typer.echo("SparkQ server stopped")


@app.command()
def status():
    """Check if SparkQ server is running"""
    lockfile_path = Path("sparkq.lock")
    if not lockfile_path.exists():
        typer.echo("SparkQ server: not running")
        return

    try:
        pid_text = lockfile_path.read_text().strip()
        pid = int(pid_text)
    except (OSError, ValueError):
        typer.echo("SparkQ server: not running")
        return

    try:
        os.kill(pid, 0)
    except OSError:
        typer.echo("SparkQ server: not running")
        return

    try:
        import requests

        response = requests.get("http://127.0.0.1:8420/health", timeout=2)
        if response.ok:
            typer.echo(f"SparkQ server: running (PID {pid}, http://127.0.0.1:8420)")
            return
    except Exception:
        pass

    typer.echo(f"SparkQ server: running but API unreachable (PID {pid})")


@app.command()
def reload():
    """Reload tool registry from config file"""
    from yaml import YAMLError
    from .tools import reload_registry

    config_path = Path("sparkq.yml")
    if not config_path.exists():
        typer.echo("Error: sparkq.yml not found", err=True)
        raise typer.Exit(1)

    try:
        reload_registry()
    except YAMLError as exc:
        typer.echo(f"Error: Failed to parse sparkq.yml ({exc})", err=True)
        raise typer.Exit(1)

    typer.echo("Tool registry reloaded")


# === Session Commands ===

session_app = typer.Typer(help="Manage work sessions")
app.add_typer(session_app, name="session")


@session_app.command("create")
def session_create(
    name: str = typer.Argument(..., help="Session name (e.g., 'api-v2')"),
    description: Optional[str] = typer.Option(
        None, "--description", "-d", help="Session description"
    ),
):
    """Create a new work session."""
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
    status: Optional[str] = typer.Option(
        None, "--status", "-s", help="Filter by status (active, ended)"
    ),
):
    """List all sessions."""
    sessions = storage.list_sessions(status=status)

    if not sessions:
        typer.echo("No sessions found.")
        return

    typer.echo(f"\n{'Name':<20} {'Status':<10} {'Started':<20} {'Streams':<10}")
    typer.echo("-" * 60)

    for s in sessions:
        streams = storage.list_streams(session_id=s["id"])
        stream_count = len(streams)
        typer.echo(
            f"{s['name']:<20} {s['status']:<10} {s['started_at'][:19]:<20} {stream_count:<10}"
        )


@session_app.command("end")
def session_end(
    name: str = typer.Argument(..., help="Session name to end"),
):
    """End a session (marks it as ended, no new streams)."""
    session = storage.get_session_by_name(name)
    if not session:
        typer.echo(f"Error: Session '{name}' not found.", err=True)
        raise typer.Exit(1)

    if session["status"] == "ended":
        typer.echo(f"Session '{name}' is already ended.")
        return

    storage.end_session(session["id"])
    typer.echo(f"Ended session: {name}")


# === Stream Commands ===

stream_app = typer.Typer(help="Manage feature streams within sessions")
app.add_typer(stream_app, name="stream")


@stream_app.command("create")
def stream_create(
    name: str = typer.Argument(..., help="Stream name (globally unique, e.g., 'auth')"),
    session: str = typer.Option(
        ..., "--session", "-s", help="Parent session name"
    ),
    instructions: Optional[str] = typer.Option(
        None, "--instructions", "-i", help="Stream instructions (mini-FRD)"
    ),
):
    """Create a new stream within a session."""
    # Find session
    sess = storage.get_session_by_name(session)
    if not sess:
        typer.echo(f"Error: Session '{session}' not found.", err=True)
        raise typer.Exit(1)

    if sess["status"] == "ended":
        typer.echo(f"Error: Session '{session}' is ended.", err=True)
        raise typer.Exit(1)

    # Check name not taken
    existing = storage.get_stream_by_name(name)
    if existing:
        typer.echo(f"Error: Stream '{name}' already exists.", err=True)
        raise typer.Exit(1)

    stream = storage.create_stream(
        session_id=sess["id"],
        name=name,
        instructions=instructions,
    )

    typer.echo(f"Created stream: {stream['name']} ({stream['id']})")
    if instructions:
        typer.echo(f"Instructions: {instructions[:50]}...")


@stream_app.command("list")
def stream_list(
    session: Optional[str] = typer.Option(
        None, "--session", "-s", help="Filter by session"
    ),
    status: Optional[str] = typer.Option(
        None, "--status", help="Filter by status (active, ended)"
    ),
):
    """List streams."""
    session_id = None
    if session:
        sess = storage.get_session_by_name(session)
        if not sess:
            typer.echo(f"Error: Session '{session}' not found.", err=True)
            raise typer.Exit(1)
        session_id = sess["id"]

    streams = storage.list_streams(session_id=session_id, status=status)

    if not streams:
        typer.echo("No streams found.")
        return

    typer.echo(f"\n{'Name':<20} {'Session':<15} {'Status':<10} {'Tasks':<10}")
    typer.echo("-" * 55)

    for st in streams:
        # Get session name
        sess = storage.get_session(st["session_id"])
        sess_name = sess["name"] if sess else "?"

        # Count tasks (stub - returns 0 until Phase 2)
        tasks = storage.list_tasks(stream_id=st["id"])
        task_count = len(tasks)

        typer.echo(
            f"{st['name']:<20} {sess_name:<15} {st['status']:<10} {task_count:<10}"
        )


@stream_app.command("end")
def stream_end(
    stream_id: str = typer.Argument(..., help="Stream ID to end")
):
    """End an active stream"""
    try:
        success = storage.end_stream(stream_id)

        if success:
            typer.echo(f"✓ Stream {stream_id} ended successfully")
        else:
            typer.echo(f"Error: Stream {stream_id} not found", err=True)
            raise typer.Exit(code=1)
    except Exception as e:
        typer.echo(f"Error: {e}", err=True)
        raise typer.Exit(code=1)


# === Task Commands (Stubs for Phase 2) ===

@app.command()
def enqueue(
    stream: str = typer.Option(..., "--stream", "-s", help="Stream name"),
    tool: str = typer.Option(..., "--tool", "-t", help="Tool name to execute"),
    task_class: str = typer.Option("MEDIUM_SCRIPT", "--task-class", help="Task class (FAST_SCRIPT, MEDIUM_SCRIPT, LLM_LITE, LLM_HEAVY)"),
    timeout: Optional[int] = typer.Option(None, "--timeout", help="Override timeout in seconds"),
    prompt_file: Optional[str] = typer.Option(None, "--prompt-file", "-p", help="Path to prompt file"),
    metadata: Optional[str] = typer.Option(None, "--metadata", "-m", help="JSON metadata"),
):
    """Queue a task for execution."""
    import json
    from pathlib import Path
    from sparkq.src.tools import get_registry

    try:
        # Validate stream exists
        st = storage.get_stream_by_name(stream)
        if not st:
            typer.echo(f"Error: Stream '{stream}' not found", err=True)
            raise typer.Exit(1)

        # Get tool registry
        registry = get_registry()

        # Validate tool exists
        if not registry.get_tool(tool):
            typer.echo(f"Error: Tool '{tool}' not registered", err=True)
            raise typer.Exit(1)

        # Resolve timeout: override > task_class timeout > default 300
        resolved_timeout = registry.get_timeout(tool, timeout)

        # Load prompt from file if provided
        prompt_content = ""
        if prompt_file:
            prompt_path = Path(prompt_file)
            if not prompt_path.exists():
                typer.echo(f"Error: Prompt file not found: {prompt_file}", err=True)
                raise typer.Exit(1)
            prompt_content = prompt_path.read_text()

        # Parse metadata JSON if provided
        metadata_dict = {}
        if metadata:
            try:
                metadata_dict = json.loads(metadata)
            except json.JSONDecodeError as e:
                typer.echo(f"Error: Invalid metadata JSON: {e}", err=True)
                raise typer.Exit(1)

        # Build payload (combine prompt and metadata)
        payload_data = {
            "prompt": prompt_content,
            "metadata": metadata_dict
        }
        payload_str = json.dumps(payload_data)

        # Create task
        task = storage.create_task(
            stream_id=st['id'],
            tool_name=tool,
            task_class=task_class,
            payload=payload_str,
            timeout=resolved_timeout,
            prompt_path=prompt_file,
            metadata=metadata
        )

        typer.echo(f"Task {task['id']} enqueued to stream '{stream}'")

    except Exception as e:
        typer.echo(f"Error: {e}", err=True)
        raise typer.Exit(1)


@app.command()
def peek(
    stream: str = typer.Option(..., "--stream", "-s", help="Stream to peek"),
):
    """Check for next queued task without claiming it."""
    try:
        # Find stream by name
        st = storage.get_stream_by_name(stream)
        if not st:
            typer.echo(f"Error: Stream '{stream}' not found", err=True)
            raise typer.Exit(1)

        # Get oldest queued task
        task = storage.get_oldest_queued_task(st['id'])

        if not task:
            typer.echo("No queued tasks")
            return

        # Output task details
        typer.echo(f"Task {task['id']}: {task['tool_name']} (task_class: {task['task_class']})")
        typer.echo(f"Queued: {task['created_at']}")

        # Show prompt if available in payload
        if task.get('payload'):
            import json
            try:
                payload_data = json.loads(task['payload'])
                if payload_data.get('prompt'):
                    typer.echo(f"Prompt: {payload_data['prompt'][:100]}...")
            except json.JSONDecodeError:
                pass

    except Exception as e:
        typer.echo(f"Error: {e}", err=True)
        raise typer.Exit(1)


@app.command()
def claim(
    stream: Optional[str] = typer.Option(
        None, "--stream", "-s", help="Stream to claim from"
    ),
):
    """Claim the next queued task. Returns full task + stream instructions."""
    try:
        # Find stream by name
        st = storage.get_stream_by_name(stream)
        if not st:
            typer.echo(f"Error: Stream '{stream}' not found", err=True)
            raise typer.Exit(1)

        # Get oldest queued task
        task = storage.get_oldest_queued_task(st['id'])

        if not task:
            typer.echo(f"No queued tasks in stream '{stream}'")
            return

        # Claim the task
        claimed_task = storage.claim_task(task['id'])

        # Output task details with stream instructions
        typer.echo(f"Task {claimed_task['id']}: {claimed_task['tool_name']}")
        typer.echo(f"Stream: {st['name']}")

        if st.get('instructions'):
            typer.echo(f"Instructions: {st['instructions']}")

        # Show prompt if available in payload
        if claimed_task.get('payload'):
            import json
            try:
                payload_data = json.loads(claimed_task['payload'])
                if payload_data.get('prompt'):
                    typer.echo(f"Prompt: {payload_data['prompt']}")
            except json.JSONDecodeError:
                pass

    except Exception as e:
        typer.echo(f"Error: {e}", err=True)
        raise typer.Exit(1)


@app.command()
def complete(
    task_id: str = typer.Argument(..., help="Task ID to complete"),
    result: str = typer.Option(
        ..., "--result", "-r", help="JSON result (must include 'summary' field)"
    ),
    stdout: Optional[str] = typer.Option(None, "--stdout", help="Captured stdout"),
    stderr: Optional[str] = typer.Option(None, "--stderr", help="Captured stderr"),
):
    """Mark a task as succeeded."""
    import json
    from pathlib import Path

    try:
        # Get task
        task = storage.get_task(task_id)
        if not task:
            typer.echo(f"Error: Task {task_id} not found", err=True)
            raise typer.Exit(1)

        # Verify task is claimed (running status)
        if task['status'] != 'running':
            typer.echo(f"Error: Task must be claimed first (current status: {task['status']})", err=True)
            raise typer.Exit(1)

        # Parse result (could be JSON string or file path)
        result_data = result
        result_summary = result

        # Check if result is a file path
        result_path = Path(result)
        if result_path.exists() and result_path.is_file():
            result_data = result_path.read_text()
            # Try to parse as JSON to extract summary
            try:
                result_json = json.loads(result_data)
                if 'summary' in result_json:
                    result_summary = result_json['summary']
            except json.JSONDecodeError:
                result_summary = result_data[:200]  # Use first 200 chars as summary
        else:
            # Assume it's a JSON string or plain summary
            try:
                result_json = json.loads(result)
                if 'summary' in result_json:
                    result_summary = result_json['summary']
                    result_data = result
            except json.JSONDecodeError:
                # Plain text summary
                result_summary = result
                result_data = result

        # Validate summary is not empty
        if not result_summary or not result_summary.strip():
            typer.echo("Error: Result summary is required", err=True)
            raise typer.Exit(1)

        # Complete the task
        storage.complete_task(task_id, result_summary, result_data, stdout, stderr)

        typer.echo(f"Task {task_id} marked as succeeded")

    except Exception as e:
        typer.echo(f"Error: {e}", err=True)
        raise typer.Exit(1)


@app.command()
def fail(
    task_id: str = typer.Argument(..., help="Task ID to fail"),
    error: str = typer.Option(..., "--error", "-e", help="Error message"),
    stdout: Optional[str] = typer.Option(None, "--stdout", help="Captured stdout"),
    stderr: Optional[str] = typer.Option(None, "--stderr", help="Captured stderr"),
):
    """Mark a task as failed."""
    try:
        # Get task
        task = storage.get_task(task_id)
        if not task:
            typer.echo(f"Error: Task {task_id} not found", err=True)
            raise typer.Exit(1)

        # Validate error message is not empty
        if not error or not error.strip():
            typer.echo("Error: Error message is required", err=True)
            raise typer.Exit(1)

        # Fail the task (no error_type for now, can be added later)
        storage.fail_task(task_id, error, error_type=None, stdout=stdout, stderr=stderr)

        typer.echo(f"Task {task_id} marked as failed")

    except Exception as e:
        typer.echo(f"Error: {e}", err=True)
        raise typer.Exit(1)


@app.command()
def tasks(
    status: Optional[str] = typer.Option(
        None, "--status", "-s", help="Filter by status"
    ),
    stream: Optional[str] = typer.Option(
        None, "--stream", help="Filter by stream"
    ),
    stale: bool = typer.Option(False, "--stale", help="Show only stale (past timeout) tasks"),
):
    """List tasks with optional filters."""
    try:
        # Resolve stream name to ID if provided
        stream_id = None
        if stream:
            st = storage.get_stream_by_name(stream)
            if not st:
                typer.echo(f"Error: Stream '{stream}' not found", err=True)
                raise typer.Exit(1)
            stream_id = st['id']

        # Get tasks with filters
        task_list = storage.list_tasks(stream_id=stream_id, status=status)

        if not task_list:
            typer.echo("No tasks found")
            return

        # Display tasks as table
        typer.echo(f"\nFound {len(task_list)} task(s):\n")
        typer.echo(f"{'ID':<15} {'Stream':<20} {'Tool':<25} {'Status':<12} {'Created':<20}")
        typer.echo("-" * 95)

        for t in task_list:
            # Get stream name for display
            task_stream = storage.get_stream(t['stream_id'])
            stream_name = task_stream['name'] if task_stream else t['stream_id']

            # Truncate long tool names
            tool_display = t['tool_name'][:22] + "..." if len(t['tool_name']) > 25 else t['tool_name']

            typer.echo(f"{t['id']:<15} {stream_name:<20} {tool_display:<25} {t['status']:<12} {t['created_at']:<20}")

        typer.echo()

    except Exception as e:
        typer.echo(f"Error: {e}", err=True)
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
    try:
        # Get the task
        task = storage.get_task(task_id)
        if not task:
            typer.echo("Error: Task not found", err=True)
            raise typer.Exit(1)

        # Check task status - can only requeue if claimed, succeeded, or failed
        if task['status'] == 'queued':
            typer.echo("Error: Task is already queued", err=True)
            raise typer.Exit(1)

        # Requeue the task (creates new task with fresh ID)
        new_task = storage.requeue_task(task_id)

        typer.echo(f"Task {task_id} requeued as {new_task['id']}")

    except Exception as e:
        typer.echo(f"Error: {e}", err=True)
        raise typer.Exit(1)


# === Utility Commands ===

@app.command()
def purge(
    older_than: str = typer.Option(
        "3d", "--older-than", help="Delete tasks older than (e.g., '3d', '1w')"
    ),
):
    """Manually purge old succeeded/failed tasks."""
    typer.echo("Purge: Not implemented yet")
    raise typer.Exit(1)


if __name__ == "__main__":
    app()
