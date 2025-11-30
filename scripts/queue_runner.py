#!/usr/bin/env python3
"""
Per-queue task runner for SparkQ with Claude Haiku integration.

Usage examples:
  python scripts/queue_runner.py --queue "Back End" --drain
  python scripts/queue_runner.py --queue "Back End" --execute --drain
  python scripts/queue_runner.py --queue "APIs" --base-url http://localhost:5005 --worker-id cli-runner-1 --execute
  python scripts/queue_runner.py --queue "Back End" --once

Behavior:
- Resolves the queue by name or ID.
- Drains the queue sequentially (oldest-first by created_at) until empty, then exits (--drain flag).
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
            "input_tokens": message.usage.input_tokens,
            "output_tokens": message.usage.output_tokens,
            "error": None,
        }
    except Exception as exc:  # noqa: BLE001
        return {
            "response": None,
            "input_tokens": 0,
            "output_tokens": 0,
            "error": str(exc),
        }


def get_iso_timestamp() -> str:
    """Get current time as ISO 8601 timestamp."""
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def process_one(
    base_url: str,
    queue: dict,
    worker_id: str,
    execute: bool = False,
    total_tasks: int = 0,
    completed_tasks: int = 0,
) -> tuple[bool, int]:
    """
    Process a single queued task.

    Args:
        base_url: SparkQ server URL
        queue: Queue dict
        worker_id: Worker ID
        execute: Whether to execute via Claude Haiku
        total_tasks: Total task count (for progress logging)
        completed_tasks: Number of completed tasks (for progress logging)

    Returns:
        Tuple of (success: bool, completed_count: int)
    """
    tasks = fetch_tasks(base_url, queue["id"])
    queued = [t for t in tasks if (t.get("status") or "").lower() == "queued"]
    if not queued:
        return False, completed_tasks

    # Sort by created_at to ensure oldest-first ordering (deterministic)
    queued_sorted = sorted(
        queued,
        key=lambda t: t.get("created_at", ""),
    )
    task = queued_sorted[0]
    task_id = task["id"]

    # Extract prompt from payload
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

    queue_name = queue.get("name") or queue["id"]
    log(f"Queue '{queue_name}': {completed_tasks}/{total_tasks} tasks completed")
    log(f"Processing: {task_id}")

    # Claim task
    claimed = claim_task(base_url, task_id, worker_id)
    if not claimed:
        log(f"Task {task_id} was not claimable (already running?)")
        return False, completed_tasks

    start_time = time.time()
    start_ts = get_iso_timestamp()

    # Execute or log
    try:
        if execute:
            timeout = task.get("timeout", 30)
            log(f"Executing via Claude Haiku (timeout: {timeout}s)...")
            result = execute_with_claude(prompt, timeout, task_id)

            if result["error"]:
                raise Exception(result["error"])

            execution_time = time.time() - start_time
            log(
                f"Task {task_id} succeeded (execution time: {execution_time:.1f}s, "
                f"tokens: {result['input_tokens']} input / {result['output_tokens']} output)"
            )

            # Prepare result data
            summary = "Executed via Claude Haiku"
            result_data = {
                "summary": summary,
                "result_type": "prompt_execution",
                "tokens_used": {
                    "input": result["input_tokens"],
                    "output": result["output_tokens"],
                },
                "execution_time": execution_time,
            }
            stdout_text = (
                f"Executed via Claude Haiku. Input: {result['input_tokens']} tokens, "
                f"Output: {result['output_tokens']} tokens. Time: {execution_time:.1f}s"
            )

            complete_task(base_url, task_id, summary, result_data, stdout_text)
        else:
            # Dry-run: just log the prompt
            log(f"Prompt:\n{prompt}\n")
            result_summary = "Logged (dry-run)"
            result_data = {"prompt": prompt, "note": "Completed by queue_runner (dry-run)"}
            stdout_text = f"Logged prompt: {len(prompt)} chars"
            complete_task(base_url, task_id, result_summary, result_data, stdout_text)
            log(f"Task {task_id} completed (dry-run)")

        return True, completed_tasks + 1

    except Exception as exc:  # noqa: BLE001
        execution_time = time.time() - start_time
        log(f"Error executing task {task_id}: {exc}")
        try:
            stderr_text = str(exc)
            fail_task(base_url, task_id, str(exc), stderr_text)
            log(f"Marked {task_id} as failed")
        except Exception as fail_exc:  # noqa: BLE001
            log(f"Failed to mark {task_id} as failed: {fail_exc}")
        return True, completed_tasks  # Made progress (task is done, even if failed)


def main() -> None:
    """Main entry point for queue runner."""
    parser = argparse.ArgumentParser(
        description="Run SparkQ tasks for a specific queue (one worker per queue)."
    )
    parser.add_argument("--queue", required=True, help="Queue name or ID to process")
    parser.add_argument(
        "--base-url",
        default="http://localhost:5005",
        help="SparkQ base URL (default: http://localhost:5005)",
    )
    parser.add_argument("--worker-id", default=None, help="Worker ID to tag claims (default: auto timestamp)")
    parser.add_argument("--poll", type=float, default=3.0, help="Polling interval when idle (seconds, default 3)")
    parser.add_argument("--once", action="store_true", help="Process at most one task then exit")
    parser.add_argument("--drain", action="store_true", default=True, help="Exit when queue is drained (default: True)")
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Execute prompts via Claude Haiku (default: dry-run, just log prompts)",
    )
    args = parser.parse_args()

    base_url = args.base_url.rstrip("/")
    worker_id = args.worker_id or f"worker-{int(time.time())}"

    queue = resolve_queue(base_url, args.queue)
    if not queue:
        log(f"Queue '{args.queue}' not found.")
        sys.exit(1)

    queue_name = queue.get("name") or queue["id"]
    log(f"Starting worker for queue '{queue_name}' as {worker_id}")
    if args.execute:
        log("Mode: Execute via Claude Haiku")
    else:
        log("Mode: Dry-run (log prompts only)")

    # Get total task count for progress reporting
    tasks = fetch_tasks(base_url, queue["id"])
    total_tasks = len([t for t in tasks if (t.get("status") or "").lower() == "queued"])

    completed_count = 0
    tasks_processed = 0

    while True:
        did_work = False
        try:
            did_work, completed_count = process_one(
                base_url,
                queue,
                worker_id,
                execute=args.execute,
                total_tasks=total_tasks,
                completed_tasks=completed_count,
            )
            if did_work:
                tasks_processed += 1
        except Exception as exc:  # noqa: BLE001
            log(f"Fatal error: {exc}")
            sys.exit(1)

        # Check exit conditions
        if args.once:
            log(f"--once flag: exiting after single task")
            sys.exit(0)

        if not did_work:
            if args.drain:
                # Queue is empty
                succeeded_count = completed_count
                failed_count = tasks_processed - completed_count
                log(f"Queue drained. Processed {tasks_processed} tasks ({succeeded_count} succeeded, {failed_count} failed). Exit code: 0")
                sys.exit(0)
            else:
                # Poll and wait (not implemented in this phase)
                log(f"No tasks available. Polling in {args.poll}s...")
                time.sleep(max(args.poll, 0.5))


if __name__ == "__main__":
    main()
