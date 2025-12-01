#!/usr/bin/env python3
"""
Task executor for SparkQ - routes tasks to appropriate execution method.

Routes based on tool_name:
  - llm-haiku  → /haiku slash command (fast, cheap)
  - llm-codex  → codex exec CLI ($0 code generation)
  - llm-sonnet → Execute in current Sonnet session
"""

import argparse
import json
import subprocess
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


def execute_with_haiku(prompt: str) -> str:
    """Execute prompt using Haiku via slash command."""
    # NOTE: This would need to call the /haiku slash command
    # For now, return a placeholder showing it should use Haiku
    return f"[HAIKU RESPONSE PLACEHOLDER] Prompt: {prompt}"


def execute_with_codex(prompt: str) -> str:
    """Execute prompt using Codex CLI."""
    try:
        result = subprocess.run(
            ["codex", "exec", "--full-auto"],
            input=prompt,
            capture_output=True,
            text=True,
            timeout=300,
        )
        if result.returncode != 0:
            return f"Codex error: {result.stderr}"
        return result.stdout
    except subprocess.TimeoutExpired:
        return "Codex execution timed out"
    except Exception as e:
        return f"Codex execution failed: {e}"


def execute_with_sonnet(prompt: str) -> str:
    """Execute in current Sonnet session."""
    # NOTE: This can't be automated from a script - Sonnet execution happens in chat
    return f"[SONNET EXECUTION NEEDED] Prompt: {prompt}"


def complete_task(task_id: str, summary: str, result_data: str = None):
    """Mark a task as complete."""
    base_url = get_base_url()

    payload = {
        "result_summary": summary,
        "result_data": result_data or summary,
    }

    resp = requests.post(
        f"{base_url}/api/tasks/{task_id}/complete",
        json=payload,
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()


def main():
    parser = argparse.ArgumentParser(
        description="Execute a SparkQ task with appropriate model routing"
    )
    parser.add_argument("task_id", help="Task ID")
    parser.add_argument("tool_name", help="Tool name (llm-haiku, llm-sonnet, llm-codex)")
    parser.add_argument("prompt", help="Task prompt")
    parser.add_argument("--auto-complete", action="store_true", help="Auto-complete task after execution")

    args = parser.parse_args()

    # Route to appropriate executor
    if args.tool_name == "llm-haiku":
        result = execute_with_haiku(args.prompt)
        summary = "Executed with Haiku"
    elif args.tool_name == "llm-codex":
        result = execute_with_codex(args.prompt)
        summary = "Executed with Codex"
    elif args.tool_name == "llm-sonnet":
        result = execute_with_sonnet(args.prompt)
        summary = "Executed with Sonnet"
    else:
        print(f"Unknown tool: {args.tool_name}")
        sys.exit(1)

    print(f"Result: {result}")

    if args.auto_complete:
        complete_task(args.task_id, summary, result)
        print(f"✅ Task {args.task_id} marked as complete")


if __name__ == "__main__":
    main()
