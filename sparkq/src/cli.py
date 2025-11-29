"""SparkQ CLI Commands"""

import datetime
import functools
import os
import signal
import sqlite3
import sys
import threading
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from typing import Optional

import typer

from .storage import Storage
from .index import ScriptIndex

app = typer.Typer(
    name="sparkq",
    help="SparkQ - Dev-only task queue. Queue work, walk away, review results later.",
    no_args_is_help=True,
)

# Storage instance initialized lazily from config
_storage_instance = None

def get_storage():
    """Get storage instance, initializing from config if needed."""
    global _storage_instance
    if _storage_instance is None:
        import yaml
        config_path = Path("sparkq.yml")
        if config_path.exists():
            with open(config_path) as f:
                config = yaml.safe_load(f)
                db_path = config.get("database", {}).get("path", "sparkq/data/sparkq.db")
        else:
            db_path = "sparkq/data/sparkq.db"
        _storage_instance = Storage(db_path)
    return _storage_instance

def _requests_exceptions():
    try:
        import requests

        return {
            "http_error": requests.HTTPError,
            "connection_error": requests.ConnectionError,
            "timeout": requests.Timeout,
        }
    except Exception:
        return None


def _emit_error(message: str, suggestion: Optional[str] = None, valid_options=None):
    typer.echo(f"Error: {message}", err=True)
    if valid_options:
        typer.echo(f"Valid options: {', '.join(valid_options)}", err=True)
    if suggestion:
        typer.echo(f"Suggestion: {suggestion}", err=True)
    raise typer.Exit(1)


def _config_error(details: str):
    _emit_error(f"Configuration error: {details}", "Check sparkq.yml")


def _db_error(details: str):
    _emit_error(f"Database error: {details}", "Check database file and permissions")


def _server_error(details: str):
    _emit_error(f"Server error: {details}", "Check server status: sparkq status")


def _resource_missing(resource_type: str, identifier: str, list_command: str):
    _emit_error(
        f"{resource_type} not found: {identifier}",
        f"List available: {list_command}",
    )


def _state_error(action: str, state: str, suggested_action: str):
    _emit_error(f"{action} not allowed in {state} state", f"Try: {suggested_action}")


def _required_field(field: str, suggestion: Optional[str] = None):
    _emit_error(f"{field} is required", suggestion)


def _invalid_field(field: str, value: str, valid_options=None, suggestion: Optional[str] = None):
    _emit_error(f"Invalid {field}: {value}", suggestion, valid_options)


def _handle_exception(exc: Exception):
    requests_ex = _requests_exceptions()

    if isinstance(exc, sqlite3.Error):
        _db_error(str(exc))

    if requests_ex:
        if isinstance(exc, requests_ex["http_error"]):
            status_code = (
                exc.response.status_code if getattr(exc, "response", None) is not None else "unknown"
            )
            _server_error(status_code)
        if isinstance(exc, (requests_ex["connection_error"], requests_ex["timeout"])):
            _server_error("network request failed")

    if isinstance(exc, (FileNotFoundError, PermissionError, IsADirectoryError)):
        _config_error(str(exc))

    # TODO: add debug-level traceback logging when logging is available
    _emit_error(str(exc))


def cli_handler(func):
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except typer.Exit:
            raise
        except Exception as exc:
            _handle_exception(exc)

    return wrapper


# === Setup ===

@app.command(help="Initialize SparkQ environment")
@cli_handler
def setup():
    """Initialize SparkQ environment."""
    import yaml

    typer.echo("\nSparkQ Setup")
    typer.echo("=" * 40)

    # Project info
    project_name = typer.prompt("Project name", default="my-project")
    repo_path = typer.prompt("Repository path", default=str(Path.cwd()))
    prd_path = typer.prompt("PRD file path (for context, optional)", default="")

    # SparkQ script directory (internal scripts)
    sparkq_scripts_dir = typer.prompt("\nSparkQ script directory", default="sparkq/scripts")
    sparkq_scripts_path = Path(sparkq_scripts_dir)
    try:
        sparkq_scripts_path.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        typer.echo(f"Warning: Could not create {sparkq_scripts_dir}: {e}")

    # Project script directories
    typer.echo("\nProject script directories to index:")
    project_script_dirs = []
    while True:
        dir_path = typer.prompt("  Add directory (empty to finish)", default="scripts" if not project_script_dirs else "")
        if not dir_path:
            break
        project_script_dirs.append(dir_path)

    # Task class timeouts (minutes in UI, seconds in config)
    typer.echo("\nTask class default timeouts (minutes):")
    fast_timeout_minutes = typer.prompt("  FAST_SCRIPT", default="1", type=int)
    medium_timeout_minutes = typer.prompt("  MEDIUM_SCRIPT", default="5", type=int)
    llm_lite_timeout_minutes = typer.prompt("  LLM_LITE", default="5", type=int)
    llm_heavy_timeout_minutes = typer.prompt("  LLM_HEAVY", default="15", type=int)

    # Convert minutes to seconds for storage
    fast_timeout = fast_timeout_minutes * 60
    medium_timeout = medium_timeout_minutes * 60
    llm_lite_timeout = llm_lite_timeout_minutes * 60
    llm_heavy_timeout = llm_heavy_timeout_minutes * 60

    # Server port
    server_port = typer.prompt("\nServer port", default="5005", type=int)

    # Build config with new script directory structure
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
            "path": "sparkq/data/sparkq.db",
            "mode": "wal",
        },
        "purge": {
            "older_than_days": 3,
        },
        "sparkq_scripts_dir": sparkq_scripts_dir,
        "project_script_dirs": project_script_dirs if project_script_dirs else ["scripts"],
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
    get_storage().init_db()

    # Create project record
    get_storage().create_project(
        name=project_name,
        repo_path=repo_path,
        prd_path=prd_path or None,
    )

    typer.echo("Database initialized.")
    typer.echo("\nRun 'sparkq session create <name>' to start working.")


# === Server Commands ===


@app.command(help="Start HTTP server")
@cli_handler
def run(
    port: int = typer.Option(5005, help="Server port (default 5005)"),
    host: str = typer.Option("127.0.0.1", help="Bind host"),
    background: bool = typer.Option(False, "--background", help="Run server in background (daemonize)"),
    foreground: bool = typer.Option(False, "--foreground", help="Run server in foreground (default when no flag)"),
    session: Optional[str] = typer.Option(
        None, "--session", help="Default session for Web UI (optional)"
    ),
    e2e: bool = typer.Option(False, "--e2e", help="Run e2e tests and exit"),
):
    """Start HTTP server.

    By default, runs in background. Use --foreground for interactive/debugging mode.
    """
    if e2e:
        typer.echo("E2E mode enabled: running tests (pytest -v sparkq/tests/e2e/)")
        try:
            import pytest
        except ImportError:
            typer.echo(
                "Error: pytest is required to run e2e tests. Install it with `pip install pytest`.",
                err=True,
            )
            raise typer.Exit(1)

        timestamp = datetime.datetime.now().strftime("%m-%d-%Y_%H-%M")
        log_dir = Path("sparkq/tests/logs") / timestamp
        try:
            log_dir.mkdir(parents=True, exist_ok=True)
        except Exception as exc:
            typer.echo(f"Error creating log directory {log_dir}: {exc}", err=True)
            raise typer.Exit(1)

        log_file = log_dir / "e2e_results.txt"

        # Mirror pytest output to both console and log file.
        class _Tee:
            def __init__(self, *streams):
                self.streams = streams

            def write(self, data):
                for stream in self.streams:
                    stream.write(data)

            def flush(self):
                for stream in self.streams:
                    stream.flush()

            def isatty(self):
                return self.streams[0].isatty() if self.streams else False

        try:
            with open(log_file, "w") as log_handle:
                tee_out = _Tee(sys.stdout, log_handle)
                tee_err = _Tee(sys.stderr, log_handle)
                with redirect_stdout(tee_out), redirect_stderr(tee_err):
                    result_code = pytest.main(["-v", "sparkq/tests/e2e/"])
        except Exception as exc:
            typer.echo(f"Error running e2e tests: {exc}", err=True)
            raise typer.Exit(1)

        typer.echo(f"E2E test results saved to {log_file}")
        raise typer.Exit(result_code)

    from .server import run_server

    # session parameter is reserved for future UI defaults
    _ = session

    # Resolve background flag: explicit --foreground takes precedence
    should_background = background if not foreground else False
    run_server(port=port, host=host, background=should_background)


@app.command(help="Stop HTTP server")
@cli_handler
def stop():
    """Stop HTTP server."""
    from .server import check_server_running, remove_lockfile

    lockfile_path = Path("sparkq.lock")
    if not lockfile_path.exists():
        _state_error("Stop", "stopped", "sparkq status")

    pid = check_server_running()
    if pid is None:
        _state_error("Stop", "stopped", "sparkq status")

    try:
        os.kill(pid, signal.SIGTERM)
    except OSError:
        _state_error("Stop", "stopped", "sparkq status")

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


@app.command(help="Check server status")
@cli_handler
def status():
    """Check server status."""
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
        from urllib.request import urlopen
        from urllib.error import URLError
        import socket

        with urlopen("http://127.0.0.1:5005/health", timeout=2) as response:
            if response.status == 200:
                typer.echo(f"SparkQ server: running (PID {pid}, http://127.0.0.1:5005)")
                return
    except (URLError, socket.timeout, OSError):
        pass

    typer.echo(f"SparkQ server: running but API unreachable (PID {pid})")


@app.command(help="Reload configuration and script index")
@cli_handler
def reload():
    """Reload configuration and script index."""
    from yaml import YAMLError
    from .tools import reload_registry

    config_path = Path("sparkq.yml")
    if not config_path.exists():
        _config_error("sparkq.yml not found")

    try:
        reload_registry()
    except YAMLError as exc:
        _config_error(f"Failed to parse sparkq.yml ({exc})")

    typer.echo("Tool registry reloaded")


# === Session Commands ===

session_app = typer.Typer(help="Manage work sessions")
app.add_typer(session_app, name="session")


@session_app.command("create", help="Create new session for task execution")
@cli_handler
def session_create(
    name: str = typer.Argument(..., help="Session name (unique)"),
    instructions: Optional[str] = typer.Option(
        None,
        "--instructions",
        "-i",
        "--description",
        help="Optional instructions for workers",
    ),
):
    """Create new session for task execution."""
    if not name or not name.strip():
        _required_field("Session name")

    name = name.strip()

    # Check project exists
    project = get_storage().get_project()
    if not project:
        _config_error("Project not initialized. Run 'sparkq setup' first.")

    # Check name not taken
    existing = get_storage().get_session_by_name(name)
    if existing:
        _invalid_field("session name", name, suggestion="Try: choose a unique session name")

    session = get_storage().create_session(name=name, description=instructions)
    typer.echo(f"Created session: {session['name']} ({session['id']})")


@session_app.command("list", help="List all sessions")
@cli_handler
def session_list(
    status: Optional[str] = typer.Option(
        None, "--status", "-s", help="Filter by status (active, ended)"
    ),
):
    """List all sessions."""
    valid_status = {"active", "ended"}
    if status and status not in valid_status:
        _invalid_field("status", status, valid_options=sorted(valid_status))

    sessions = get_storage().list_sessions(status=status)

    if not sessions:
        typer.echo("No sessions found.")
        return

    typer.echo(f"\n{'Name':<20} {'Status':<10} {'Started':<20} {'Streams':<10}")
    typer.echo("-" * 60)

    for s in sessions:
        streams = get_storage().list_streams(session_id=s["id"])
        stream_count = len(streams)
        typer.echo(
            f"{s['name']:<20} {s['status']:<10} {s['started_at'][:19]:<20} {stream_count:<10}"
        )


@session_app.command("end", help="End an active session")
@cli_handler
def session_end(
    name: str = typer.Argument(..., help="Session name to end"),
):
    """End a session (marks it as ended, no new streams)."""
    if not name or not name.strip():
        _required_field("Session name")

    name = name.strip()

    session = get_storage().get_session_by_name(name)
    if not session:
        _resource_missing("Session", name, "sparkq session list")

    if session["status"] == "ended":
        _state_error("Ending session", "ended", "sparkq session list")

    get_storage().end_session(session["id"])
    typer.echo(f"Ended session: {name}")


# === Stream Commands ===

stream_app = typer.Typer(help="Manage feature streams within sessions")
app.add_typer(stream_app, name="stream")


@stream_app.command("create", help="Create new stream in session")
@cli_handler
def stream_create(
    name: str = typer.Argument(..., help="Stream name"),
    session: str = typer.Option(..., "--session", "-s", help="Session name or ID"),
    instructions: Optional[str] = typer.Option(
        None, "--instructions", "-i", help="Optional stream-specific instructions"
    ),
):
    """Create new stream in session."""
    if not name or not name.strip():
        _required_field("Stream name")

    if not session or not session.strip():
        _required_field("Session name", "Try: sparkq session list")

    name = name.strip()
    session = session.strip()

    # Find session
    sess = get_storage().get_session_by_name(session)
    if not sess:
        _resource_missing("Session", session, "sparkq session list")

    if sess["status"] == "ended":
        _state_error("Creating stream", "ended", "sparkq session create <name>")

    # Check name not taken
    existing = get_storage().get_stream_by_name(name)
    if existing:
        _invalid_field("stream name", name, suggestion="Try: choose a unique stream name")

    stream = get_storage().create_stream(
        session_id=sess["id"],
        name=name,
        instructions=instructions,
    )

    typer.echo(f"Created stream: {stream['name']} ({stream['id']})")
    if instructions:
        typer.echo(f"Instructions: {instructions[:50]}...")


@stream_app.command("list", help="List all streams")
@cli_handler
def stream_list(
    session: Optional[str] = typer.Option(
        None, "--session", "-s", help="Filter by session"
    ),
    status: Optional[str] = typer.Option(
        None, "--status", help="Filter by status (active, ended)"
    ),
):
    """List all streams."""
    valid_status = {"active", "ended"}
    if status and status not in valid_status:
        _invalid_field("status", status, valid_options=sorted(valid_status))

    session_id = None
    if session:
        if not session.strip():
            _required_field("Session name", "Try: sparkq session list")
        session = session.strip()
        sess = get_storage().get_session_by_name(session)
        if not sess:
            _resource_missing("Session", session, "sparkq session list")
        session_id = sess["id"]

    streams = get_storage().list_streams(session_id=session_id, status=status)

    if not streams:
        typer.echo("No streams found.")
        return

    typer.echo(f"\n{'Name':<20} {'Session':<15} {'Status':<10} {'Tasks':<10}")
    typer.echo("-" * 55)

    for st in streams:
        # Get session name
        sess = get_storage().get_session(st["session_id"])
        sess_name = sess["name"] if sess else "?"

        # Count tasks (stub - returns 0 until Phase 2)
        tasks = get_storage().list_tasks(stream_id=st["id"])
        task_count = len(tasks)

        typer.echo(
            f"{st['name']:<20} {sess_name:<15} {st['status']:<10} {task_count:<10}"
        )


@stream_app.command("end", help="End an active stream")
@cli_handler
def stream_end(
    stream_id: str = typer.Argument(..., help="Stream ID to end")
):
    """End an active stream."""
    if not stream_id or not stream_id.strip():
        _required_field("Stream ID")

    stream_id = stream_id.strip()
    stream = get_storage().get_stream(stream_id)
    if not stream:
        _resource_missing("Stream", stream_id, "sparkq stream list")

    if stream.get("status") == "ended":
        _state_error("Ending stream", "ended", "sparkq stream list")

    get_storage().end_stream(stream_id)
    typer.echo(f"Stream {stream_id} ended successfully")


# === Task Commands (Stubs for Phase 2) ===

@app.command(help="Enqueue task to stream")
@cli_handler
def enqueue(
    stream: str = typer.Option(..., "--stream", "-s", help="Target stream name"),
    tool: str = typer.Option(..., "--tool", "-t", help="Tool/script name"),
    task_class: str = typer.Option(
        "MEDIUM_SCRIPT",
        "--task-class",
        help="Task priority (FAST_SCRIPT, MEDIUM_SCRIPT, LLM_LITE, LLM_HEAVY)",
    ),
    timeout: Optional[int] = typer.Option(None, "--timeout", help="Timeout override in seconds"),
    prompt_file: Optional[str] = typer.Option(None, "--prompt-file", "-p", help="Path to prompt file"),
    metadata: Optional[str] = typer.Option(None, "--metadata", "-m", help="JSON metadata"),
):
    """Enqueue task to stream."""
    import json
    from pathlib import Path
    from .tools import get_registry

    if not stream or not stream.strip():
        _required_field("Stream", "Try: sparkq stream list")

    if not tool or not tool.strip():
        _required_field("Tool", "List available: sparkq list tools")

    stream = stream.strip()
    tool = tool.strip()
    task_class = task_class.strip() if task_class else task_class

    valid_task_classes = {"FAST_SCRIPT", "MEDIUM_SCRIPT", "LLM_LITE", "LLM_HEAVY"}
    if task_class not in valid_task_classes:
        _invalid_field("task_class", task_class, valid_options=sorted(valid_task_classes))

    # Validate stream exists
    st = get_storage().get_stream_by_name(stream)
    if not st:
        _resource_missing("Stream", stream, "sparkq stream list")

    if st.get("status") == "ended":
        _state_error("Enqueue", "ended", "sparkq stream create <name>")

    # Get tool registry
    registry = get_registry()

    # Validate tool exists
    if not registry.get_tool(tool):
        _resource_missing("Tool", tool, "sparkq list tools")

    # Resolve timeout: override > task_class timeout > default 300
    resolved_timeout = registry.get_timeout(tool, timeout)

    # Load prompt from file if provided
    prompt_content = ""
    if prompt_file:
        prompt_file = prompt_file.strip()
        prompt_path = Path(prompt_file)
        if not prompt_path.exists():
            _emit_error(
                f"Prompt file not found: {prompt_file}",
                "Provide a valid --prompt-file path",
            )
        prompt_content = prompt_path.read_text()

    # Parse metadata JSON if provided
    metadata_dict = {}
    if metadata:
        metadata = metadata.strip()
        try:
            metadata_dict = json.loads(metadata)
        except json.JSONDecodeError as exc:
            _invalid_field("metadata", metadata, suggestion=f"Provide valid JSON ({exc})")

    # Build payload (combine prompt and metadata)
    payload_data = {
        "prompt": prompt_content,
        "metadata": metadata_dict
    }
    payload_str = json.dumps(payload_data)

    # Create task
    task = get_storage().create_task(
        stream_id=st['id'],
        tool_name=tool,
        task_class=task_class,
        payload=payload_str,
        timeout=resolved_timeout,
        prompt_path=prompt_file,
        metadata=metadata
    )

    typer.echo(f"Task {task['id']} enqueued to stream '{stream}'")


@app.command(help="Check next task in queue")
@cli_handler
def peek(
    stream: str = typer.Option(..., "--stream", "-s", help="Stream name"),
):
    """Check next task in queue."""
    if not stream or not stream.strip():
        _required_field("Stream", "Try: sparkq stream list")

    stream = stream.strip()

    # Find stream by name
    st = get_storage().get_stream_by_name(stream)
    if not st:
        _resource_missing("Stream", stream, "sparkq stream list")

    # Get oldest queued task
    task = get_storage().get_oldest_queued_task(st['id'])

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


@app.command(help="Claim next task in stream")
@cli_handler
def claim(
    stream: Optional[str] = typer.Option(
        None, "--stream", "-s", help="Stream name (optional - shows available if omitted)"
    ),
):
    """Claim next task in stream."""
    if not stream or not stream.strip():
        available_streams = get_storage().list_streams(status="active")
        if not available_streams:
            _required_field("Stream", "Try: sparkq stream list")

        typer.echo("Available streams (specify with --stream):")
        for st in available_streams:
            typer.echo(f"- {st['name']} ({st['id']})")
        raise typer.Exit()

    stream = stream.strip()

    # Find stream by name
    st = get_storage().get_stream_by_name(stream)
    if not st:
        _resource_missing("Stream", stream, "sparkq stream list")

    if st.get("status") == "ended":
        _state_error("Claim", "ended", "sparkq stream create <name>")

    # Get oldest queued task
    task = get_storage().get_oldest_queued_task(st['id'])

    if not task:
        typer.echo(f"No queued tasks in stream '{stream}'")
        return

    # Claim the task
    claimed_task = get_storage().claim_task(task['id'])

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


@app.command(help="Mark task as completed")
@cli_handler
def complete(
    task_id: str = typer.Argument(..., help="Task ID"),
    result: str = typer.Option(
        ..., "--result", "-r", "--summary", help="Brief result summary (REQUIRED)"
    ),
    result_file: Optional[str] = typer.Option(
        None, "--result-file", "-f", help="Optional detailed result file"
    ),
    stdout: Optional[str] = typer.Option(None, "--stdout", help="Captured stdout"),
    stderr: Optional[str] = typer.Option(None, "--stderr", help="Captured stderr"),
):
    """Mark task as completed."""
    import json
    from pathlib import Path

    if not task_id or not task_id.strip():
        _required_field("Task ID")

    task_id = task_id.strip()

    # Get task
    task = get_storage().get_task(task_id)
    if not task:
        _resource_missing("Task", task_id, "sparkq tasks")

    # Verify task is claimed (running status)
    if task['status'] != 'running':
        _state_error("Complete task", task['status'], "sparkq claim --stream <name>")

    # Parse result (could be summary text, JSON, or file path)
    result_data = result
    result_summary = result

    if result_file:
        file_path = Path(result_file)
        if not file_path.exists() or not file_path.is_file():
            _emit_error(f"Result file not found: {result_file}")
        result_data = file_path.read_text()
        # Try to parse detailed result file for summary if not provided
        if not result_summary or not result_summary.strip():
            try:
                result_json = json.loads(result_data)
                if "summary" in result_json:
                    result_summary = result_json["summary"]
            except json.JSONDecodeError:
                result_summary = result_data[:200]
    else:
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
        _required_field("Result summary")

    # Complete the task
    get_storage().complete_task(task_id, result_summary, result_data, stdout, stderr)

    typer.echo(f"Task {task_id} marked as succeeded")


@app.command(help="Mark task as failed")
@cli_handler
def fail(
    task_id: str = typer.Argument(..., help="Task ID"),
    error: str = typer.Option(..., "--error", "-e", help="Error message"),
    error_type: Optional[str] = typer.Option(None, "--error-type", help="Error type (optional)"),
    stdout: Optional[str] = typer.Option(None, "--stdout", help="Captured stdout"),
    stderr: Optional[str] = typer.Option(None, "--stderr", help="Captured stderr"),
):
    """Mark task as failed."""
    if not task_id or not task_id.strip():
        _required_field("Task ID")

    task_id = task_id.strip()

    # Get task
    task = get_storage().get_task(task_id)
    if not task:
        _resource_missing("Task", task_id, "sparkq tasks")

    # Validate error message is not empty
    if not error or not error.strip():
        _required_field("Error message")

    if task['status'] != 'running':
        _state_error("Fail task", task['status'], "sparkq claim --stream <name>")

    get_storage().fail_task(task_id, error, error_type=error_type, stdout=stdout, stderr=stderr)

    typer.echo(f"Task {task_id} marked as failed")


@app.command(help="List tasks with optional filters")
@cli_handler
def tasks(
    status: Optional[str] = typer.Option(
        None, "--status", "-s", help="Filter by status (queued, claimed, succeeded, failed)"
    ),
    stream: Optional[str] = typer.Option(
        None, "--stream", help="Filter by stream"
    ),
    stale: bool = typer.Option(False, "--stale", help="Show only stale (past timeout) tasks"),
    limit: Optional[int] = typer.Option(None, "--limit", "-l", help="Limit number of results"),
):
    """List tasks with optional filters."""
    valid_status = {"queued", "running", "succeeded", "failed"}
    status_aliases = {"claimed": "running"}
    if status:
        normalized_status = status_aliases.get(status, status)
        if normalized_status not in valid_status:
            _invalid_field(
                "status",
                status,
                valid_options=sorted(valid_status.union(status_aliases.keys())),
            )
        status = normalized_status

    # Resolve stream name to ID if provided
    stream_id = None
    if stream:
        if not stream.strip():
            _required_field("Stream", "Try: sparkq stream list")
        stream = stream.strip()
        st = get_storage().get_stream_by_name(stream)
        if not st:
            _resource_missing("Stream", stream, "sparkq stream list")
        stream_id = st['id']

    # Get tasks with filters
    task_list = get_storage().list_tasks(stream_id=stream_id, status=status)

    if limit is not None:
        task_list = task_list[:limit]

    if not task_list:
        typer.echo("No tasks found")
        return

    # Display tasks as table
    typer.echo(f"\nFound {len(task_list)} task(s):\n")
    typer.echo(f"{'ID':<15} {'Stream':<20} {'Tool':<25} {'Status':<12} {'Created':<20}")
    typer.echo("-" * 95)

    for t in task_list:
        # Get stream name for display
        task_stream = get_storage().get_stream(t['stream_id'])
        stream_name = task_stream['name'] if task_stream else t['stream_id']

        # Truncate long tool names
        tool_display = t['tool_name'][:22] + "..." if len(t['tool_name']) > 25 else t['tool_name']

        typer.echo(f"{t['id']:<15} {stream_name:<20} {tool_display:<25} {t['status']:<12} {t['created_at']:<20}")

    typer.echo()


@app.command(help="Show detailed task information")
@cli_handler
def task(
    task_id: str = typer.Argument(..., help="Task ID to show"),
):
    """Show detailed task information."""
    _emit_error("Task command not implemented yet", "Try: sparkq tasks to list tasks")


@app.command(help="Move task back to queued status")
@cli_handler
def requeue(
    task_id: str = typer.Argument(..., help="Task ID"),
):
    """Move task back to queued status."""
    if not task_id or not task_id.strip():
        _required_field("Task ID")

    task_id = task_id.strip()

    # Get the task
    task = get_storage().get_task(task_id)
    if not task:
        _resource_missing("Task", task_id, "sparkq tasks")

    # Check task status - can only requeue if claimed, succeeded, or failed
    if task['status'] == 'queued':
        _state_error("Requeue", "queued", "run or fail the task first")

    # Requeue the task (creates new task with fresh ID)
    new_task = get_storage().requeue_task(task_id)

    typer.echo(f"Task {task_id} requeued as {new_task['id']}")


# === Utility Commands ===

@app.command(help="Delete old succeeded/failed tasks")
@cli_handler
def purge(
    older_than: str = typer.Option(
        "3d", "--older-than", help="Delete tasks older than (e.g., '3d', '1w')"
    ),
):
    """Delete old succeeded/failed tasks."""
    _emit_error("Purge command not implemented yet", "Check sparkq.yml purge settings")


# === Scripts Commands ===

scripts_app = typer.Typer(help="Manage and discover scripts")


@scripts_app.command("list", help="List all available scripts")
@cli_handler
def scripts_list():
    """Display all discovered scripts with metadata."""
    script_index = ScriptIndex(config_path="sparkq.yml")
    script_index.build()
    scripts = script_index.list_all()

    if not scripts:
        typer.echo("No scripts found.")
        return

    typer.echo(f"\nScripts ({len(scripts)} total):\n")
    for script in scripts:
        name = script.get("name", "—")
        desc = script.get("description") or "—"
        tags = ", ".join(script.get("tags", []))
        typer.echo(f"  {name:30} {desc:30} {tags}")
    typer.echo()


@scripts_app.command("search", help="Search for scripts by name, description, or tags")
@cli_handler
def scripts_search(query: str = typer.Argument(..., help="Search query")):
    """Search scripts by name, description, or tags."""
    script_index = ScriptIndex(config_path="sparkq.yml")
    script_index.build()
    results = script_index.search(query)

    if not results:
        typer.echo(f"No scripts found matching '{query}'.")
        return

    typer.echo(f"\nSearch results for '{query}' ({len(results)} match{'es' if len(results) != 1 else ''}):\n")
    for script in results:
        name = script.get("name", "—")
        desc = script.get("description") or "—"
        tags = ", ".join(script.get("tags", []))
        typer.echo(f"  {name:30} {desc:30} {tags}")
    typer.echo()


app.add_typer(scripts_app, name="scripts")


if __name__ == "__main__":
    app()
