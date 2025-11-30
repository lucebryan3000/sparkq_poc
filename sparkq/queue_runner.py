#!/usr/bin/env python3
"""
Per-queue task runner for SparkQ with Claude Haiku integration.

Usage examples:
  python sparkq/queue_runner.py --queue "Back End" --run
  python sparkq/queue_runner.py --queue "Back End" --execute --run
  python sparkq/queue_runner.py --queue "APIs" --base-url http://localhost:5005 --worker-id cli-runner-1 --execute
  python sparkq/queue_runner.py --queue "Back End" --once

Behavior:
- Resolves the queue by name or ID.
- Runs the queue sequentially (oldest-first by created_at) until empty, then exits (--run flag).
- Can optionally execute prompts via Claude Haiku (--execute flag) or just log them (dry-run).
- Updates task status through the workflow: queued → running → succeeded/failed.
- Designed to run one worker per queue to avoid overlap.
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import requests

try:
    from anthropic import Anthropic, APIError
except ImportError:
    Anthropic = None
    APIError = Exception


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

    log(f"Claimed {task_id} from queue '{queue.get('name') or queue['id']}'")
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
        log(f"Completed {task_id}")
        return True
    except Exception as exc:  # noqa: BLE001
        log(f"Error executing task {task_id}: {exc}")
        try:
            fail_task(base_url, task_id, str(exc))
        except Exception as fail_exc:  # noqa: BLE001
            log(f"Failed to mark task {task_id} as failed: {fail_exc}")
        return True  # Made progress


def main():
    parser = argparse.ArgumentParser(description="Run SparkQ tasks for a specific queue (one worker per queue).")
    parser.add_argument("--queue", required=True, help="Queue name or ID to process")
    parser.add_argument("--base-url", default="http://localhost:5005", help="SparkQ base URL (default: http://localhost:5005)")
    parser.add_argument("--worker-id", default=None, help="Worker ID to tag claims (default: auto timestamp)")
    parser.add_argument("--poll", type=float, default=3.0, help="Polling interval when idle (seconds, default 3)")
    parser.add_argument("--once", action="store_true", help="Process at most one task then exit")
    parser.add_argument("--run", action="store_true", help="Run queue until empty, then exit (default behavior)")
    parser.add_argument("--execute", action="store_true", help="Execute prompts via Claude Haiku (requires ANTHROPIC_API_KEY)")
    args = parser.parse_args()

    base_url = args.base_url.rstrip("/")
    worker_id = args.worker_id or f"worker-{int(time.time())}"

    queue = resolve_queue(base_url, args.queue)
    if not queue:
        log(f"Queue '{args.queue}' not found.")
        sys.exit(1)

    log(f"Starting worker for queue '{queue.get('name') or queue['id']}' as {worker_id}")

    # Default behavior: run/until-empty unless --once is set. Ignore poll loop for now.
    while True:
        did_work = False
        try:
            did_work = process_one(base_url, queue, worker_id, execute=args.execute)
        except Exception as exc:  # noqa: BLE001
            log(f"Error: {exc}")

        if args.once:
            break
        if not did_work:
            if args.run:
                break
            time.sleep(max(args.poll, 0.5))


if __name__ == "__main__":
    main()
