"""SparkQ CLI Commands"""

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
    tool: str = typer.Argument(..., help="Tool name from registry"),
    payload: str = typer.Argument(..., help="JSON payload for the tool"),
    stream: str = typer.Option(..., "--stream", "-s", help="Target stream name"),
    timeout: Optional[int] = typer.Option(
        None, "--timeout", "-t", help="Timeout override (seconds)"
    ),
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
    stream: Optional[str] = typer.Option(
        None, "--stream", "-s", help="Stream to claim from"
    ),
):
    """Claim the next queued task. Returns full task + stream instructions."""
    typer.echo("Phase 2: Not implemented yet")
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
    status: Optional[str] = typer.Option(
        None, "--status", "-s", help="Filter by status"
    ),
    stream: Optional[str] = typer.Option(
        None, "--stream", help="Filter by stream"
    ),
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
    session: Optional[str] = typer.Option(
        None, "--session", "-s", help="Start all streams in this session"
    ),
):
    """Start SparkQ server. Interactive mode if no --session specified."""
    typer.echo("Phase 3: Not implemented yet")
    raise typer.Exit(1)


@app.command()
def stop(
    stream: Optional[str] = typer.Option(
        None, "--stream", "-s", help="Stop only this stream's watcher"
    ),
):
    """Stop SparkQ server (and all watchers, or just specified stream)."""
    typer.echo("Phase 3: Not implemented yet")
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
