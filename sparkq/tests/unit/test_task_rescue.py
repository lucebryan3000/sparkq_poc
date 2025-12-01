from datetime import datetime, timedelta, timezone

import pytest

from src.storage import Storage


def _setup_task(storage: Storage, *, timeout: int = 1200):
    project = storage.get_project() or storage.create_project("rescue-project")
    session = storage.create_session("rescue-session", "rescue flow")
    queue = storage.create_queue(session_id=session["id"], name="rescue-queue")
    task = storage.create_task(
        queue_id=queue["id"],
        tool_name="llm-codex",
        task_class="LLM_HEAVY",
        payload="{}",
        timeout=timeout,
    )
    return task


def test_llm_heavy_not_stale_until_after_multiplier(storage):
    task = _setup_task(storage, timeout=1200)
    now = datetime.now(timezone.utc)
    almost_deadline = now - timedelta(seconds=(1200 * 2) - 5)

    with storage.connection() as conn:
        conn.execute(
            "UPDATE tasks SET status='running', claimed_at=?, started_at=? WHERE id=?",
            (almost_deadline.isoformat(), almost_deadline.isoformat(), task["id"]),
        )

    stale = storage.get_stale_tasks(timeout_multiplier=2.0)
    assert all(t["id"] != task["id"] for t in stale), "Task should not be stale before 2x timeout"

    past_deadline = now - timedelta(seconds=(1200 * 2) + 5)
    with storage.connection() as conn:
        conn.execute(
            "UPDATE tasks SET status='running', claimed_at=?, started_at=? WHERE id=?",
            (past_deadline.isoformat(), past_deadline.isoformat(), task["id"]),
        )

    stale_now = storage.get_stale_tasks(timeout_multiplier=2.0)
    assert any(t["id"] == task["id"] for t in stale_now), "Task should be stale after 2x timeout"


def test_reset_auto_failed_task_allows_completion(storage):
    task = _setup_task(storage, timeout=60)
    with storage.connection() as conn:
        conn.execute(
            "UPDATE tasks SET status='running', claimed_at=?, started_at=? WHERE id=?",
            (datetime.now(timezone.utc).isoformat(), datetime.now(timezone.utc).isoformat(), task["id"]),
        )

    storage.fail_task(task["id"], "Task timeout (auto-failed)", error_type="TIMEOUT")
    failed = storage.get_task(task["id"])
    assert storage.is_auto_failed(failed) is True

    reset = storage.reset_auto_failed_task(task["id"], target_status="running")
    assert reset["status"] == "running"
    assert reset.get("error") is None

    completed = storage.complete_task(task["id"], "all good", "all good")
    assert completed["status"] == "succeeded"
    assert completed.get("error") is None
