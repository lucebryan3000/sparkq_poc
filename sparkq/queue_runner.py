#!/usr/bin/env python3
"""
Queue runner for SparkQ - streams task prompts to Claude-in-chat for execution.

Execution Model:
  - Queue runner streams prompts to stdout
  - Claude (in chat) reads prompts and executes them
  - Queue runner auto-completes tasks via API
  - Context preserved across tasks (single chat thread)

For complete worker documentation, see: sparkq/WORKER_PLAYBOOK.md

Configuration (sparkq.yml):
  queue_runner:
    base_url: http://192.168.1.100:5005  # Optional override; auto-detected if omitted
    poll_interval: 30                      # Seconds between polls in --watch mode
    lock_dir: /tmp                         # Optional override for lockfile directory (default: system temp or env SPARKQ_RUNNER_LOCK_DIR)

Execution Modes:
  --once: Process one task then exit (testing/debugging)
  --watch: Continuous polling mode, run forever (poll every N seconds)
  (default/--run): Process all tasks until queue empty, then exit

Smart Defaults:
  - base_url: Auto-detected from local IP + server.port if not in config
  - worker_id: Derived from hostname + queue name (e.g., worker-mybox-Back_End)
  - poll_interval: 30 seconds (configurable via --poll or config file)

Usage Examples:
  # Process all tasks in queue, then exit (default)
  python3 sparkq/queue_runner.py --queue "Back End"

  # Test: process just one task
  python3 sparkq/queue_runner.py --queue "Back End" --once

  # Watch: run continuously, poll every 30s
  python3 sparkq/queue_runner.py --queue "Back End" --watch

  # Custom poll interval
  python3 sparkq/queue_runner.py --queue "Back End" --watch --poll 10
"""

import argparse
import atexit
import json
import os
import signal
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

import requests
import socket
import tempfile

# Ensure we import from the package when executed as a script
ROOT_DIR = Path(__file__).resolve().parent
SRC_DIR = ROOT_DIR / "src"
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from src.config import (  # type: ignore
    get_queue_runner_config as config_queue_runner_config,
    get_server_config as config_server_config,
    load_config,
    resolve_base_url,
)

def _timeout_kwargs(timeout: float) -> dict:
    """
    Return timeout kwargs for the current HTTP client.

    When tests monkeypatch requests to FastAPI's TestClient, passing timeout triggers
    a deprecation warning. Strip it in that case while keeping it for real HTTP calls.
    """
    client = requests
    module_name = getattr(client.__class__, "__module__", "")
    if module_name.startswith("starlette.testclient"):
        return {}
    return {"timeout": timeout}


def load_queue_runner_config():
    """
    Load queue_runner configuration from sparkq.yml.

    Returns dict with keys:
    - base_url (optional): Override for API URL
    - poll_interval (default 30): Seconds between polls in --watch mode

    Returns empty dict if config file doesn't exist (all defaults apply).
    """
    cfg = load_config()
    return config_queue_runner_config(cfg)


def get_server_config():
    """
    Get server configuration from sparkq.yml.

    Returns dict with:
    - port (default 5005): Server port

    Returns default if config file doesn't exist.
    """
    cfg = load_config()
    return config_server_config(cfg)


def get_default_base_url():
    """
    Get default base URL for SparkQ API.

    Priority:
    1. Config file queue_runner.base_url (if specified)
    2. Auto-detect: http://{local_ip}:{server.port}

    Auto-detection uses local IP (not localhost) so it works from other machines.
    Falls back to localhost if IP resolution fails.
    """
    return resolve_base_url(load_config())


def resolve_worker_id(queue_name: str) -> str:
    """
    Resolve a stable worker ID.

    Format: worker-{hostname}-{queue_name}
    - Hostname: from socket.gethostname()
    - Queue name: spaces replaced with underscores
    - No timestamps, no randomness (stable across restarts)

    Example: worker-mybox-Back_End
    """
    hostname = socket.gethostname()
    clean_queue_name = queue_name.replace(" ", "_")
    return f"worker-{hostname}-{clean_queue_name}"


# Global variable for lockfile path
LOCK_FILE = None


def get_lock_dir() -> str:
    """
    Determine lockfile directory.

    Priority:
    1. Env var SPARKQ_RUNNER_LOCK_DIR (if set)
    2. queue_runner.lock_dir from config
    3. System temp directory (default)
    """
    qr_config = load_queue_runner_config()
    lock_dir = os.environ.get("SPARKQ_RUNNER_LOCK_DIR") or qr_config.get("lock_dir")
    if not lock_dir:
        lock_dir = tempfile.gettempdir()

    path = Path(lock_dir).expanduser()
    path.mkdir(parents=True, exist_ok=True)
    return str(path)


def get_lock_path(queue_id: str) -> str:
    """Build the full path to the lockfile for a queue."""
    return str(Path(get_lock_dir()) / f"sparkq-runner-{queue_id}.lock")


def acquire_lock(queue_id: str) -> None:
    """
    Acquire lockfile or exit if already running.

    Creates /tmp/sparkq-runner-{queue_id}.lock containing the PID.
    Checks if another instance is running before proceeding.
    Registers cleanup handlers for graceful shutdown.
    """
    global LOCK_FILE
    LOCK_FILE = get_lock_path(queue_id)

    # Check if lockfile exists
    if os.path.exists(LOCK_FILE):
        try:
            with open(LOCK_FILE, 'r') as f:
                old_pid = int(f.read().strip())
        except (ValueError, FileNotFoundError):
            # Corrupt lockfile, remove it
            os.remove(LOCK_FILE)
        else:
            # Check if process is alive
            try:
                os.kill(old_pid, 0)  # Signal 0 = check if process exists
                # Process is alive - duplicate detected
                log(f"ERROR: queue_runner already running for queue (PID {old_pid})")
                log(f"Kill it first: kill {old_pid}")
                log(f"Or wait for it to finish")
                sys.exit(1)
            except OSError:
                # Process is dead, remove stale lock
                log(f"Removing stale lockfile (PID {old_pid} no longer exists)")
                os.remove(LOCK_FILE)

    # Create lockfile with current PID
    try:
        with open(LOCK_FILE, 'w') as f:
            f.write(str(os.getpid()))
        log(f"Acquired lock: {LOCK_FILE}")
    except IOError as e:
        log(f"ERROR: Failed to create lockfile: {e}")
        sys.exit(1)

    # Register cleanup handlers
    atexit.register(release_lock)
    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)


def release_lock() -> None:
    """Remove lockfile on exit."""
    global LOCK_FILE
    if LOCK_FILE and os.path.exists(LOCK_FILE):
        try:
            os.remove(LOCK_FILE)
            # Don't log here - might be called during shutdown
        except OSError:
            pass  # Best effort


def handle_signal(signum, _frame):
    """Handle termination signals gracefully."""
    log(f"Received signal {signum}, shutting down...")
    sys.exit(0)  # Triggers atexit handlers


def log(msg: str) -> None:
    """Log a message with [runner] prefix."""
    print(f"[runner] {msg}", flush=True)


def fetch_queues(base_url: str) -> list[dict]:
    """Fetch all queues from the API."""
    resp = requests.get(f"{base_url}/api/queues", **_timeout_kwargs(10))
    resp.raise_for_status()
    return resp.json().get("queues", [])


def resolve_queue(base_url: str, name_or_id: str) -> Optional[dict]:
    """
    Resolve a queue by name or ID.

    Args:
        base_url: SparkQ server URL
        name_or_id: Queue name or ID

    Returns:
        Queue dict or None if not found
    """
    queues = fetch_queues(base_url)
    for q in queues:
        if q.get("id") == name_or_id or q.get("name") == name_or_id:
            return q
    # case-insensitive match on name
    for q in queues:
        if q.get("name", "").lower() == name_or_id.lower():
            return q
    return None


def fetch_tasks(base_url: str, queue_id: str) -> list[dict]:
    """Fetch all tasks for a queue from the API."""
    resp = requests.get(f"{base_url}/api/tasks", params={"queue_id": queue_id}, **_timeout_kwargs(10))
    resp.raise_for_status()
    return resp.json().get("tasks", [])


def claim_task(base_url: str, task_id: str, worker_id: str) -> Optional[dict]:
    """
    Claim a task for execution.

    Args:
        base_url: SparkQ server URL
        task_id: Task ID to claim
        worker_id: Worker ID claiming the task

    Returns:
        Updated task dict or None if already claimed
    """
    resp = requests.post(
        f"{base_url}/api/tasks/{task_id}/claim",
        json={"worker_id": worker_id},
        **_timeout_kwargs(10),
    )
    if resp.status_code == 409:
        # Already claimed/running
        return None
    resp.raise_for_status()
    return resp.json().get("task")


def complete_task(
    base_url: str,
    task_id: str,
    summary: str,
    result: Any,
) -> None:
    """
    Mark a task as successfully completed.

    Args:
        base_url: SparkQ server URL
        task_id: Task ID to complete
        summary: Summary of execution (must not be empty)
        result: Result data (will be converted to JSON string if needed)
    """
    # Ensure summary is non-empty (API requirement)
    if not summary or not summary.strip():
        summary = "Task completed successfully"

    # Convert result to JSON string if it's a dict
    result_data_str = result if isinstance(result, str) else json.dumps(result) if result else summary

    payload = {
        "result_summary": summary,
        "result_data": result_data_str,
    }
    resp = requests.post(f"{base_url}/api/tasks/{task_id}/complete", json=payload, **_timeout_kwargs(10))
    resp.raise_for_status()


def fail_task(base_url: str, task_id: str, message: str, stderr_text: str = "") -> None:
    """
    Mark a task as failed.

    Args:
        base_url: SparkQ server URL
        task_id: Task ID to fail
        message: Error message
        stderr_text: Error output/stack trace
    """
    payload = {
        "error_message": message,
        "error_type": "runner_error",
        "stderr": stderr_text,
    }
    resp = requests.post(f"{base_url}/api/tasks/{task_id}/fail", json=payload, **_timeout_kwargs(10))
    resp.raise_for_status()


def fetch_queue_info(queue_id: str, base_url: str) -> dict:
    """Fetch queue information from API"""
    url = f"{base_url}/api/queues/{queue_id}"
    try:
        resp = requests.get(url, **_timeout_kwargs(10))
        resp.raise_for_status()
        return resp.json().get("queue", {})
    except requests.RequestException as e:
        raise RuntimeError(f"Failed to fetch queue {queue_id}: {e}")


def display_queue_instructions(queue: dict) -> None:
    """
    Display queue instructions once at the start of queue processing.

    Instructions provide context, guardrails, and scope boundaries for all tasks.
    Once displayed, they remain in LLM context for subsequent tasks.
    """
    instructions = queue.get("instructions") or ""
    instructions = instructions.strip()
    if not instructions:
        return

    print("\n" + "="*80)
    print("📋 QUEUE INSTRUCTIONS")
    print("="*80)
    print(instructions)
    print("="*80 + "\n")


def process_one(base_url: str, queue: dict, worker_id: str, execute: bool = True) -> bool:
    queue_id = queue["id"]
    tasks = fetch_tasks(base_url, queue_id)
    # Oldest-first: sort by created_at ascending
    tasks = sorted(tasks, key=lambda t: t.get("created_at") or "")
    queued = [t for t in tasks if (t.get("status") or "").lower() == "queued"]
    if not queued:
        return False

    task = queued[0]
    task_id = task["id"]
    tool_name = task.get("tool_name", "llm-haiku")

    claimed = claim_task(base_url, task_id, worker_id)
    if not claimed:
        log(f"Task {task_id} was not claimable (already running?)")
        return False

    prompt = ""
    payload = task.get("payload")
    agent_role_display = task.get("agent_role_key")
    if isinstance(payload, str):
        try:
            parsed = json.loads(payload)
            prompt = parsed.get("prompt") or payload
            agent_role_display = parsed.get("agent_role_label") or parsed.get("agent_role_key") or agent_role_display
        except json.JSONDecodeError:
            prompt = payload
    elif isinstance(payload, dict):
        prompt = payload.get("prompt") or json.dumps(payload)
        agent_role_display = payload.get("agent_role_label") or payload.get("agent_role_key") or agent_role_display

    friendly_id = task.get("friendly_id", task_id)
    log(f"Task: {friendly_id} ({task_id})")
    log(f"Tool: {tool_name}")
    if agent_role_display:
        log(f"Agent Role: {agent_role_display}")
    log(f"Prompt:\n{prompt}\n")

    # Generate explicit execution instruction based on tool_name
    if tool_name == "llm-haiku":
        log(f"🔧 EXECUTE WITH: /haiku {prompt}")
    elif tool_name == "llm-codex":
        # Fetch queue info to check for existing Codex session
        try:
            queue_info = fetch_queue_info(queue_id, base_url)
            codex_session = queue_info.get("codex_session_id")

            if codex_session:
                # Resume existing Codex session for context continuity
                log(f"🔧 EXECUTE WITH: codex exec --full-auto -C {os.getcwd()} \"{prompt}\" --resume {codex_session}")
            else:
                # First codex task in queue - create new session
                log(f"🔧 EXECUTE WITH: codex exec --full-auto -C {os.getcwd()} \"{prompt}\"")
                log("📝 CAPTURE SESSION ID from output (look for 'session id: 019...')")
                log(f"💾 STORE WITH: curl -X POST {base_url}/api/queues/{queue_id}/codex-session -H 'Content-Type: application/json' -d '{{\"session_id\": \"<captured_id>\"}}'")
        except Exception as e:
            # Fallback if queue fetch fails
            log(f"⚠️  Could not fetch queue info: {e}")
            log(f"🔧 EXECUTE WITH: codex exec --full-auto -C {os.getcwd()} \"{prompt}\" (no session resume)")
    elif tool_name == "llm-sonnet":
        log(f"🔧 EXECUTE WITH: Current Sonnet session (answer directly)")
    else:
        log(f"🔧 EXECUTE WITH: Unknown tool '{tool_name}' - use Sonnet as fallback")

    log(f"⏳ Status: Running (claimed by {worker_id})")
    log(f"✅ COMPLETE WITH: ./sparkq/task_complete.py {task_id} \"<summary>\" --data \"<result>\"\n")

    # If execute is False, immediately mark complete as a dry-run; otherwise let external execution handle it
    if not execute:
        complete_task(base_url, task_id, summary="Completed by queue_runner (dry-run)", result="Completed by queue_runner (dry-run)")
    # Task is now in 'running' status from claim_task() (or completed if dry-run)
    return True  # Made progress (task is now running or completed)


def main():
    parser = argparse.ArgumentParser(
        description="Run SparkQ tasks for a specified queue.",
        epilog="Example: python3 sparkq/queue_runner.py --queue 'Back End' --run"
    )

    parser.add_argument(
        "--queue",
        required=True,
        help="Queue name or ID to process"
    )

    parser.add_argument(
        "--poll",
        type=float,
        default=None,  # Will use config value if None
        help="Polling interval in seconds when idle (default: from config, typically 30s; used with --watch)"
    )

    parser.add_argument(
        "--once",
        action="store_true",
        help="Process exactly one task then exit (useful for testing)"
    )

    parser.add_argument(
        "--run",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Process all queued tasks until queue is empty, then exit (default mode, even without the flag)"
    )

    parser.add_argument(
        "--watch",
        action="store_true",
        help="Continuous polling mode: keep running and poll every N seconds (honors --poll/config)"
    )

    args = parser.parse_args()

    # Apply smart defaults (all from config)
    base_url = get_default_base_url()

    # Get poll interval from config if not specified via CLI
    if args.poll is None:
        qr_config = load_queue_runner_config()
        poll_interval = qr_config.get("poll_interval", 30.0)
    else:
        poll_interval = args.poll

    # Resolve queue first
    queue = resolve_queue(base_url, args.queue)
    if not queue:
        log(f"ERROR: Queue '{args.queue}' not found")
        sys.exit(1)

    queue_id = queue.get("id")
    queue_name = queue.get("name", args.queue)

    # ACQUIRE LOCK BEFORE ANY PROCESSING
    acquire_lock(queue_id)

    # Derive worker_id from hostname + queue name (stable, no config needed)
    worker_id = resolve_worker_id(queue_name)

    # Log startup info
    log(f"Starting worker for queue '{queue_name}' as {worker_id}")
    log(f"Server: {base_url}")
    log("Mode: Stream prompts to Claude-in-chat")

    # Display queue instructions once at the start (if present)
    display_queue_instructions(queue)

    # Determine execution mode (default: run once through queue, then exit)
    if args.once:
        log("Mode: Process one task then exit (--once)")
        did_work = process_one(base_url, queue, worker_id)
        if not did_work:
            log("No tasks available")
        sys.exit(0)

    if args.watch:
        log(f"Mode: Continuous polling (poll every {poll_interval}s) (--watch)")
        log("Press Ctrl+C to stop")
        try:
            while True:
                did_work = process_one(base_url, queue, worker_id)
                if not did_work:
                    time.sleep(poll_interval)
        except KeyboardInterrupt:
            log("Interrupted by user. Exiting.")
            sys.exit(0)

    if not args.run:
        log("ERROR: --no-run requires --watch or --once; default behavior is --run.")
        sys.exit(1)

    log("Mode: Process queue until empty then exit (--run, default)")
    tasks_processed = 0
    while True:
        did_work = process_one(base_url, queue, worker_id)
        if did_work:
            tasks_processed += 1
        else:
            log(f"Queue is empty. Processed {tasks_processed} tasks. Exiting.")
            break
    sys.exit(0)


if __name__ == "__main__":
    main()
