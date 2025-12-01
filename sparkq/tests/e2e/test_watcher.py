import json
import time

import pytest
from fastapi.testclient import TestClient

import queue_runner
from src import api as api_module
from src.storage import Storage


@pytest.fixture
def queue_runner_env(tmp_path, monkeypatch):
    """Set up an API-backed environment for exercising queue_runner."""
    db_path = tmp_path / "queue_runner.db"
    storage = Storage(str(db_path))
    storage.init_db()
    storage.create_project(name="queue-runner", repo_path=str(tmp_path), prd_path=None)
    session = storage.create_session(name="runner-session")
    queue = storage.create_queue(
        session_id=session["id"],
        name="runner-queue",
        instructions="Queue for queue_runner e2e tests",
    )

    # Point the API at the temporary storage and route queue_runner HTTP calls through it.
    monkeypatch.setattr(api_module, "storage", storage)
    client = TestClient(api_module.app)
    monkeypatch.setattr("queue_runner.requests", client)

    yield {
        "storage": storage,
        "queue": queue,
        "base_url": str(client.base_url),
        "worker_id": queue_runner.resolve_worker_id(queue["name"]),
    }

    client.close()


@pytest.mark.e2e
class TestQueueRunnerBehavior:
    def test_processes_oldest_task_and_stops_when_empty(self, queue_runner_env):
        storage = queue_runner_env["storage"]
        queue = queue_runner_env["queue"]
        base_url = queue_runner_env["base_url"]
        worker_id = queue_runner_env["worker_id"]

        older_task = storage.create_task(
            queue_id=queue["id"],
            tool_name="run-bash",
            task_class="MEDIUM_SCRIPT",
            payload=json.dumps({"prompt": "older task"}),
            timeout=30,
        )
        time.sleep(0.01)  # Ensure created_at ordering
        newer_task = storage.create_task(
            queue_id=queue["id"],
            tool_name="run-bash",
            task_class="MEDIUM_SCRIPT",
            payload=json.dumps({"prompt": "newer task"}),
            timeout=30,
        )

        queue_from_api = queue_runner.resolve_queue(base_url, queue["name"])
        assert queue_from_api and queue_from_api["id"] == queue["id"]

        first_run = queue_runner.process_one(base_url, queue_from_api, worker_id, execute=False)
        assert first_run is True

        updated_older = storage.get_task(older_task["id"])
        updated_newer = storage.get_task(newer_task["id"])
        assert updated_older["status"] == "succeeded"
        assert updated_newer["status"] == "queued"
        result_payload = json.loads(updated_older["result"])
        assert result_payload["note"] == "Completed by queue_runner (dry-run)"

        second_run = queue_runner.process_one(base_url, queue_from_api, worker_id, execute=False)
        assert second_run is True
        assert storage.get_task(newer_task["id"])["status"] == "succeeded"

        third_run = queue_runner.process_one(base_url, queue_from_api, worker_id, execute=False)
        assert third_run is False

    def test_no_tasks_returns_false(self, queue_runner_env):
        queue = queue_runner_env["queue"]
        base_url = queue_runner_env["base_url"]
        worker_id = queue_runner_env["worker_id"]

        queue_from_api = queue_runner.resolve_queue(base_url, queue["name"])
        assert queue_from_api is not None

        assert queue_runner.process_one(base_url, queue_from_api, worker_id, execute=False) is False
