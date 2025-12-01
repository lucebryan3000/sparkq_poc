#!/usr/bin/env python3
"""Helper script to mark SparkQ tasks as complete from Claude-in-chat."""

import argparse
import json
import sys
from pathlib import Path

import requests

# Ensure we can import config
ROOT_DIR = Path(__file__).resolve().parent
SRC_DIR = ROOT_DIR / "src"
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from src.config import get_queue_runner_config, get_server_config, load_config


def get_base_url():
    """Get SparkQ API base URL from config."""
    cfg = load_config()
    qr_config = get_queue_runner_config(cfg)

    if "base_url" in qr_config:
        return qr_config["base_url"].rstrip("/")

    # Auto-detect using server port
    import socket
    server_config = get_server_config(cfg)
    port = server_config.get("port", 5005)

    try:
        hostname = socket.gethostname()
        local_ip = socket.gethostbyname(hostname)
    except (socket.error, Exception):
        local_ip = "localhost"

    return f"http://{local_ip}:{port}"


def complete_task(task_id: str, summary: str, result_data: str = None):
    """Mark a task as complete."""
    base_url = get_base_url()

    payload = {
        "result_summary": summary,
        "result_data": result_data or summary,
    }

    resp = requests.post(f"{base_url}/api/tasks/{task_id}/complete", json=payload, timeout=10)
    resp.raise_for_status()
    return resp.json()


def reset_task(task_id: str, target_status: str = "running"):
    """Reset an auto-failed task so it can be completed."""
    base_url = get_base_url()
    resp = requests.post(
        f"{base_url}/api/tasks/{task_id}/reset",
        json={"target_status": target_status},
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()


def main():
    parser = argparse.ArgumentParser(
        description="Mark a SparkQ task as complete"
    )
    parser.add_argument("task_id", help="Task ID (e.g., tsk_abc123)")
    parser.add_argument("summary", help="Result summary")
    parser.add_argument(
        "--data",
        help="Optional result data (JSON string or text)",
        default=None,
    )

    args = parser.parse_args()

    try:
        result = complete_task(args.task_id, args.summary, args.data)
        print(f"✅ Task {args.task_id} marked as succeeded")
        print(f"Result: {json.dumps(result, indent=2)}")
    except requests.HTTPError as e:
        if e.response is not None and e.response.status_code == 409 and "status is failed" in e.response.text:
            print("⚠️ Task is currently failed (likely auto-failed). Attempting reset and retry...")
            try:
                reset_task(args.task_id, target_status="running")
                result = complete_task(args.task_id, args.summary, args.data)
                print(f"✅ Task {args.task_id} reset and marked as succeeded")
                print(f"Result: {json.dumps(result, indent=2)}")
                return
            except Exception as inner:
                print(f"❌ Reset + retry failed: {inner}")
                if isinstance(inner, requests.HTTPError) and inner.response is not None:
                    print(f"Response: {inner.response.text}")
                sys.exit(1)

        print(f"❌ Error: {e}")
        if e.response is not None:
            print(f"Response: {e.response.text}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
