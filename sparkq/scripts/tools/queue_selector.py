#!/usr/bin/env python3
"""
Interactive queue selector for SparkQueue runner.

Prompts user to select a queue from the database and runs queue_runner.py.
"""

import sqlite3
import sys
import subprocess
from pathlib import Path


def get_queues_from_db(db_path: str) -> list[dict]:
    """Fetch all queues from the database."""
    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # Query queues table
        cursor.execute("""
            SELECT id, name
            FROM queues
            ORDER BY created_at DESC
        """)

        queues = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return queues
    except sqlite3.Error as e:
        print(f"Error querying database: {e}", file=sys.stderr)
        return []


def main() -> None:
    """Main entry point."""
    # Determine database path
    project_root = Path(__file__).parent.parent
    db_path = str(project_root / "sparkq" / "data" / "sparkq.db")

    # Fetch available queues
    print("[queue-selector] Fetching queues from database...", file=sys.stderr)
    queues = get_queues_from_db(db_path)

    if not queues:
        print("[queue-selector] No queues found in database.", file=sys.stderr)
        sys.exit(1)

    # Display queues to user
    print("\n[queue-selector] Available Queues:", file=sys.stderr)
    for idx, queue in enumerate(queues, 1):
        queue_name = queue.get("name") or queue.get("id")
        print(f"  {idx}. {queue_name}", file=sys.stderr)

    # Prompt user to select
    print("\n[queue-selector] Select a queue (enter number or queue name):", file=sys.stderr, end=" ")
    sys.stderr.flush()

    user_input = input().strip()

    # Parse user input
    selected_queue = None

    # Try parsing as number first
    try:
        idx = int(user_input) - 1
        if 0 <= idx < len(queues):
            selected_queue = queues[idx]
    except ValueError:
        # Try matching by name (case-insensitive)
        for queue in queues:
            if (queue.get("name") or "").lower() == user_input.lower():
                selected_queue = queue
                break

    if not selected_queue:
        print("[queue-selector] Invalid selection.", file=sys.stderr)
        sys.exit(1)

    queue_id = selected_queue.get("id")
    queue_name = selected_queue.get("name") or queue_id

    print(f"\n[queue-selector] Selected queue: {queue_name}", file=sys.stderr)
    print(f"[queue-selector] Starting queue runner in dry-run mode...\n", file=sys.stderr)

    # Run queue_runner.py with selected queue
    runner_script = project_root / "sparkq" / "queue_runner.py"
    cmd = [
        sys.executable,
        str(runner_script),
        "--queue", queue_name,
        "--drain",
        "--base-url", "http://localhost:5005",
    ]

    try:
        result = subprocess.run(cmd, check=False)
        sys.exit(result.returncode)
    except FileNotFoundError:
        print(f"[queue-selector] Error: queue_runner.py not found at {runner_script}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"[queue-selector] Error running queue_runner: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
