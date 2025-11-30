"""Additional API endpoint tests for complete coverage"""

import json
import pytest
from fastapi.testclient import TestClient

from src import api
from src.storage import Storage


pytestmark = pytest.mark.integration


@pytest.fixture
def storage(tmp_path, monkeypatch):
    db_path = tmp_path / "sparkq_test.db"
    storage = Storage(str(db_path))
    storage.init_db()
    storage.create_project("test-project", repo_path=str(tmp_path), prd_path=None)
    monkeypatch.setattr(api, "storage", storage)
    return storage


@pytest.fixture
def api_client(storage):
    return TestClient(api.app)


@pytest.fixture
def session_with_stream(storage):
    session = storage.create_session("test-session", "Test session")
    queue = storage.create_queue(
        session_id=session["id"],
        name="test-queue",
        instructions="Test instructions",
    )
    return {"storage": storage, "session": session, "queue": queue}


class TestStatsEndpoint:
    """Test the /stats endpoint"""

    def test_stats_returns_summary(self, api_client, session_with_stream):
        storage = session_with_stream["storage"]
        queue = session_with_stream["queue"]

        storage.create_task(
            queue_id=queue["id"],
            tool_name="test-tool",
            task_class="FAST_SCRIPT",
            payload="{}",
            timeout=30,
        )

        response = api_client.get("/stats")
        assert response.status_code == 200

        data = response.json()
        assert "sessions" in data
        assert "queues" in data
        assert "queued_tasks" in data
        assert "running_tasks" in data
        assert data["sessions"] >= 1

    def test_stats_counts_by_status(self, api_client, session_with_stream):
        storage = session_with_stream["storage"]
        queue = session_with_stream["queue"]

        task = storage.create_task(
            queue_id=queue["id"],
            tool_name="test-tool",
            task_class="FAST_SCRIPT",
            payload="{}",
            timeout=30,
        )

        response = api_client.get("/stats")
        assert response.status_code == 200

        data = response.json()
        assert data["queued_tasks"] >= 1


class TestSessionUpdateEndpoint:
    """Test PUT /api/sessions/{session_id}"""

    def test_update_session_name(self, api_client, session_with_stream):
        session = session_with_stream["session"]

        response = api_client.put(
            f"/api/sessions/{session['id']}",
            json={"name": "updated-name"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["session"]["name"] == "updated-name"

    def test_update_session_description(self, api_client, session_with_stream):
        session = session_with_stream["session"]

        response = api_client.put(
            f"/api/sessions/{session['id']}",
            json={"description": "New description"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["session"]["description"] == "New description"


class TestStreamUpdateEndpoint:
    """Test PUT /api/queues/{queue_id}"""

    def test_update_stream_name(self, api_client, session_with_stream):
        queue = session_with_stream["queue"]

        response = api_client.put(
            f"/api/queues/{queue['id']}",
            json={"name": "updated-queue"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["queue"]["name"] == "updated-queue"

    def test_update_stream_instructions(self, api_client, session_with_stream):
        queue = session_with_stream["queue"]

        response = api_client.put(
            f"/api/queues/{queue['id']}",
            json={"instructions": "New instructions"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["queue"]["instructions"] == "New instructions"


class TestTaskClaimEndpoint:
    """Test POST /api/tasks/{task_id}/claim"""

    def test_claim_task(self, api_client, session_with_stream):
        storage = session_with_stream["storage"]
        queue = session_with_stream["queue"]

        task = storage.create_task(
            queue_id=queue["id"],
            tool_name="test-tool",
            task_class="FAST_SCRIPT",
            payload="{}",
            timeout=30,
        )

        response = api_client.post(f"/api/tasks/{task['id']}/claim")
        assert response.status_code == 200

        data = response.json()
        assert data["task"]["status"] == "running"
        assert data["task"]["attempts"] == 1


class TestTaskCompleteEndpoint:
    """Test POST /api/tasks/{task_id}/complete"""

    def test_complete_task(self, api_client, session_with_stream):
        storage = session_with_stream["storage"]
        queue = session_with_stream["queue"]

        task = storage.create_task(
            queue_id=queue["id"],
            tool_name="test-tool",
            task_class="FAST_SCRIPT",
            payload="{}",
            timeout=30,
        )
        storage.claim_task(task["id"])

        response = api_client.post(
            f"/api/tasks/{task['id']}/complete",
            json={"result_summary": "Done", "result_data": "Success"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["task"]["status"] == "succeeded"
        assert data["task"]["result"] == "Success"


class TestTaskFailEndpoint:
    """Test POST /api/tasks/{task_id}/fail"""

    def test_fail_task(self, api_client, session_with_stream):
        storage = session_with_stream["storage"]
        queue = session_with_stream["queue"]

        task = storage.create_task(
            queue_id=queue["id"],
            tool_name="test-tool",
            task_class="FAST_SCRIPT",
            payload="{}",
            timeout=30,
        )
        storage.claim_task(task["id"])

        response = api_client.post(
            f"/api/tasks/{task['id']}/fail",
            json={"error_message": "Failed", "error_type": "TestError"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["task"]["status"] == "failed"
        assert "TestError" in data["task"]["error"]


class TestConfigEndpoint:
    """Test /api/config endpoint"""

    def test_config_returns_yaml(self, api_client, tmp_path, monkeypatch):
        config_path = tmp_path / "sparkq.yml"
        config_path.write_text("test: value\n")
        monkeypatch.chdir(tmp_path)

        response = api_client.get("/api/config")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)
        assert "server" in data
        assert "database" in data
        assert "tools" in data
        assert "task_classes" in data

    def test_update_purge_config(self, api_client):
        response = api_client.put(
            "/api/config/purge/config",
            json={"value": {"older_than_days": 5}},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["config"]["purge"]["older_than_days"] == 5

    def test_task_class_and_tool_crud(self, api_client):
        # Create task class
        tc_resp = api_client.post(
            "/api/task-classes",
            json={"name": "TEST_CLASS", "timeout": 120, "description": "demo"},
        )
        assert tc_resp.status_code == 201
        # Create tool that references it
        tool_resp = api_client.post(
            "/api/tools",
            json={"name": "demo-tool", "description": "Demo", "task_class": "TEST_CLASS"},
        )
        assert tool_resp.status_code == 201
        # Delete tool then task class
        del_tool = api_client.delete("/api/tools/demo-tool")
        assert del_tool.status_code == 200
        del_tc = api_client.delete("/api/task-classes/TEST_CLASS")
        assert del_tc.status_code == 200
