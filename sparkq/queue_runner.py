#!/usr/bin/env python3
"""
Queue runner for SparkQ with smart defaults and multiple execution modes.

Configuration (sparkq.yml):
  queue_runner:
    base_url: http://192.168.1.100:5005  # Optional override; auto-detected if omitted
    poll_interval: 30                      # Seconds between polls in --watch mode

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
import json
import os
import sys
import time
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import requests
import yaml
import socket
from pathlib import Path

try:
    from anthropic import Anthropic, APIError
except ImportError:
    Anthropic = None
    APIError = Exception


def load_queue_runner_config():
    """
    Load queue_runner configuration from sparkq.yml.

    Returns dict with keys:
    - base_url (optional): Override for API URL
    - poll_interval (default 30): Seconds between polls in --watch mode

    Returns empty dict if config file doesn't exist (all defaults apply).
    """
    config_path = Path("sparkq.yml")
    if not config_path.exists():
        return {}

    with open(config_path) as f:
        full_config = yaml.safe_load(f) or {}

    return full_config.get("queue_runner", {})


def get_server_config():
    """
    Get server configuration from sparkq.yml.

    Returns dict with:
    - port (default 5005): Server port

    Returns default if config file doesn't exist.
    """
    config_path = Path("sparkq.yml")
    if not config_path.exists():
        return {"port": 5005}

    with open(config_path) as f:
        full_config = yaml.safe_load(f) or {}

    return full_config.get("server", {"port": 5005})


def get_default_base_url():
    """
    Get default base URL for SparkQ API.

    Priority:
    1. Config file queue_runner.base_url (if specified)
    2. Auto-detect: http://{local_ip}:{server.port}

    Auto-detection uses local IP (not localhost) so it works from other machines.
    Falls back to localhost if IP resolution fails.
    """
    qr_config = load_queue_runner_config()

    # Check if explicitly set in config
    if "base_url" in qr_config:
        return qr_config["base_url"].rstrip("/")

    # Auto-detect using local IP + server port
    server_config = get_server_config()
    port = server_config.get("port", 5005)

    # Get local IP address (not localhost)
    try:
        hostname = socket.gethostname()
        local_ip = socket.gethostbyname(hostname)
    except (socket.error, Exception):
        # Fallback to localhost if IP resolution fails
        local_ip = "localhost"

    return f"http://{local_ip}:{port}"


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


def log(msg: str) -> None:
    """Log a message with [runner] prefix."""
    print(f"[runner] {msg}", flush=True)


def fetch_queues(base_url: str) -> list[dict]:
    """Fetch all queues from the API."""
    resp = requests.get(f"{base_url}/api/queues", timeout=10)
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
    resp = requests.get(f"{base_url}/api/tasks", params={"queue_id": queue_id}, timeout=10)
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
        timeout=10,
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
    stdout_text: str = "",
) -> None:
    """
    Mark a task as successfully completed.

    Args:
        base_url: SparkQ server URL
        task_id: Task ID to complete
        summary: Summary of execution (must not be empty)
        result: Result data (will be converted to JSON string if needed)
        stdout_text: Execution output/log text
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
    resp = requests.post(f"{base_url}/api/tasks/{task_id}/complete", json=payload, timeout=10)
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
    resp = requests.post(f"{base_url}/api/tasks/{task_id}/fail", json=payload, timeout=10)
    resp.raise_for_status()


def execute_with_claude(
    prompt_text: str,
    timeout: int = 30,
    task_id: str = "",
) -> Dict[str, Any]:
    """
    Execute a prompt via Claude Haiku API.

    Args:
        prompt_text: The prompt to execute
        timeout: Execution timeout in seconds (default 30)
        task_id: Task ID for logging

    Returns:
        Dict with keys:
        - response: Claude's response text or None
        - input_tokens: Number of input tokens used
        - output_tokens: Number of output tokens used
        - error: Error message if failed, None otherwise
    """
    if Anthropic is None:
        return {
            "response": None,
            "input_tokens": 0,
            "output_tokens": 0,
            "error": "anthropic package not installed. Install with: pip install anthropic",
        }

    try:
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            return {
                "response": None,
                "input_tokens": 0,
                "output_tokens": 0,
                "error": "ANTHROPIC_API_KEY environment variable not set",
            }

        client = Anthropic(api_key=api_key)
        message = client.messages.create(
            model="claude-3-5-haiku-20241022",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt_text}],
            timeout=timeout,
        )

        response_text = message.content[0].text if message.content else ""

        return {
            "response": response_text,
            "input_tokens": getattr(message.usage, "input_tokens", 0),
            "output_tokens": getattr(message.usage, "output_tokens", 0),
            "error": None,
        }
    except APIError as exc:
        return {
            "response": None,
            "input_tokens": 0,
            "output_tokens": 0,
            "error": f"Claude API error: {exc}",
        }
    except Exception as exc:  # noqa: BLE001
        return {
            "response": None,
            "input_tokens": 0,
            "output_tokens": 0,
            "error": f"Unexpected error: {exc}",
        }


def process_one(base_url: str, queue: dict, worker_id: str, execute: bool = False) -> bool:
    tasks = fetch_tasks(base_url, queue["id"])
    # Oldest-first: sort by created_at ascending
    tasks = sorted(tasks, key=lambda t: t.get("created_at") or "")
    queued = [t for t in tasks if (t.get("status") or "").lower() == "queued"]
    if not queued:
        return False

    task = queued[0]
    task_id = task["id"]

    claimed = claim_task(base_url, task_id, worker_id)
    if not claimed:
        log(f"Task {task_id} was not claimable (already running?)")
        return False

    prompt = ""
    payload = task.get("payload")
    if isinstance(payload, str):
        try:
            parsed = json.loads(payload)
            prompt = parsed.get("prompt") or payload
        except json.JSONDecodeError:
            prompt = payload
    elif isinstance(payload, dict):
        prompt = payload.get("prompt") or json.dumps(payload)

    friendly_id = task.get("friendly_id", task_id)
    log(f"Task: {friendly_id}")
    log(f"Prompt:\n{prompt}\n")

    try:
        if execute:
            result = execute_with_claude(prompt, timeout=task.get("timeout") or 30, task_id=task_id)
            summary = result.get("error") or "Claude execution succeeded"
            complete_task(base_url, task_id, summary, result, stdout_text=result.get("response") or "")
        else:
            result_summary = "Executed externally"
            result_data = {"prompt": prompt, "note": "Completed by queue_runner (dry-run)"}
            complete_task(base_url, task_id, result_summary, result_data)
        log(f"✅ Completed: {friendly_id}")
        return True
    except Exception as exc:  # noqa: BLE001
        log(f"❌ Error executing task {friendly_id}: {exc}")
        try:
            fail_task(base_url, task_id, str(exc))
        except Exception as fail_exc:  # noqa: BLE001
            log(f"Failed to mark task {friendly_id} as failed: {fail_exc}")
        return True  # Made progress


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

    parser.add_argument(
        "--execute",
        action="store_true",
        help="Execute prompts via Claude Haiku (requires ANTHROPIC_API_KEY)"
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

    queue_name = queue.get("name", args.queue)

    # Derive worker_id from hostname + queue name (stable, no config needed)
    worker_id = resolve_worker_id(queue_name)

    # Log startup info
    log(f"Starting worker for queue '{queue_name}' as {worker_id}")
    log(f"Server: {base_url}")
    log("Mode: Dry-run (log prompts only)")

    # Determine execution mode (default: run once through queue, then exit)
    if args.once:
        log("Mode: Process one task then exit (--once)")
        did_work = process_one(base_url, queue, worker_id, execute=args.execute)
        if not did_work:
            log("No tasks available")
        sys.exit(0)

    if args.watch:
        log(f"Mode: Continuous polling (poll every {poll_interval}s) (--watch)")
        log("Press Ctrl+C to stop")
        try:
            while True:
                did_work = process_one(base_url, queue, worker_id, execute=args.execute)
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
        did_work = process_one(base_url, queue, worker_id, execute=args.execute)
        if did_work:
            tasks_processed += 1
        else:
            log(f"Queue is empty. Processed {tasks_processed} tasks. Exiting.")
            break
    sys.exit(0)


if __name__ == "__main__":
    main()
