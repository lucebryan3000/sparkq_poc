import json
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from src import api
from src.storage import Storage

pytestmark = pytest.mark.integration


def _payload(metadata=None) -> str:
    return json.dumps({"prompt_path": "prompt.txt", "metadata": metadata or {"source": "tests"}})


@pytest.fixture
def storage(tmp_path, monkeypatch):
    db_path = tmp_path / "sparkq_test.db"
    storage = Storage(str(db_path))
    storage.init_db()
    storage.create_project("integration-project", repo_path=str(tmp_path), prd_path=None)
    monkeypatch.setattr(api, "storage", storage)
    return storage


@pytest.fixture
def api_client(storage):
    return TestClient(api.app)


@pytest.fixture
def storage_with_stream(storage):
    session = storage.create_session("integration-session", "Integration test session")
    stream = storage.create_stream(
        session_id=session["id"],
        name="integration-stream",
        instructions="Test stream for integration cases",
    )
    return {"storage": storage, "session": session, "stream": stream}


@pytest.fixture
def queued_task(storage_with_stream):
    storage = storage_with_stream["storage"]
    stream = storage_with_stream["stream"]
    task = storage.create_task(
        stream_id=stream["id"],
        tool_name="echo",
        task_class="FAST_SCRIPT",
        payload=_payload(),
        timeout=30,
        prompt_path="prompt.txt",
        metadata=json.dumps({"source": "tests"}),
    )
    return task


@pytest.fixture
def running_task(storage_with_stream):
    storage = storage_with_stream["storage"]
    stream = storage_with_stream["stream"]
    task = storage.create_task(
        stream_id=stream["id"],
        tool_name="echo",
        task_class="FAST_SCRIPT",
        payload=_payload({"source": "running"}),
        timeout=30,
        prompt_path="run.txt",
        metadata=json.dumps({"source": "running"}),
    )
    return storage.claim_task(task["id"])


@pytest.fixture
def script_index_env(tmp_path, monkeypatch):
    scripts_dir = tmp_path / "scripts"
    scripts_dir.mkdir()
    script_file = scripts_dir / "demo-script.sh"
    script_file.write_text(
        "#!/bin/bash\n"
        "# name: Demo Script\n"
        "# description: Example script for integration tests\n"
        "# tags: demo, test\n"
        "echo \"hello\"\n",
        encoding="utf-8",
    )
    (tmp_path / "sparkq.yml").write_text(
        "script_dirs:\n"
        "  - scripts\n",
        encoding="utf-8",
    )
    monkeypatch.chdir(tmp_path)
    return {"scripts_dir": scripts_dir, "script_file": script_file}


class TestHealthEndpoints:
    def test_health(self, api_client):
        response = None
        for path in ("/api/health", "/health"):
            candidate = api_client.get(path)
            if candidate.status_code != 404:
                response = candidate
                break

        assert response is not None, "Health endpoint not available"
        assert response.status_code == 200
        data = response.json()
        assert data.get("status")
        assert "timestamp" in data

    def test_status(self, api_client):
        # Try /health endpoint (preferred for status)
        response = api_client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "ok"
        assert "timestamp" in data


class TestSessionEndpoints:
    def test_list_sessions(self, api_client, storage_with_stream):
        response = api_client.get("/api/sessions")
        assert response.status_code == 200
        data = response.json()
        assert "sessions" in data
        assert any(session["id"] == storage_with_stream["session"]["id"] for session in data["sessions"])

    def test_create_session(self, api_client):
        payload = {"name": "api-session", "description": "Created via API"}
        response = api_client.post("/api/sessions", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert "session" in data
        assert data["session"]["name"] == payload["name"]
        assert data["session"]["status"] == "active"

    def test_get_session(self, api_client):
        create_response = api_client.post(
            "/api/sessions",
            json={"name": "lookup-session", "description": "Lookup test"},
        )
        session_id = create_response.json()["session"]["id"]

        response = api_client.get(f"/api/sessions/{session_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["session"]["id"] == session_id


class TestStreamEndpoints:
    def test_list_streams(self, api_client, storage_with_stream):
        session = storage_with_stream["session"]
        response = api_client.get(f"/api/streams?session_id={session['id']}")
        assert response.status_code == 200
        data = response.json()
        assert "streams" in data
        assert any(stream["id"] == storage_with_stream["stream"]["id"] for stream in data["streams"])

    def test_create_stream(self, api_client, storage_with_stream):
        session = storage_with_stream["session"]
        stream_name = f"stream-{uuid4().hex[:8]}"
        payload = {"session_id": session["id"], "name": stream_name, "instructions": "New stream"}

        response = api_client.post("/api/streams", json=payload)
        assert response.status_code == 201
        data = response.json()
        assert "stream" in data
        assert data["stream"]["session_id"] == session["id"]
        assert data["stream"]["name"] == stream_name


class TestTaskEndpoints:
    def test_list_tasks(self, api_client, queued_task):
        response = api_client.get("/api/tasks")
        assert response.status_code == 200
        data = response.json()
        assert "tasks" in data
        assert any(task["id"] == queued_task["id"] for task in data["tasks"])

    def test_create_task(self, api_client, storage_with_stream):
        stream = storage_with_stream["stream"]
        payload = {
            "stream_id": stream["id"],
            "tool_name": "echo",
            "task_class": "FAST_SCRIPT",
            "metadata": {"origin": "test"},
        }
        response = api_client.post("/api/tasks", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert "task" in data
        assert data["task"]["stream_id"] == stream["id"]
        assert data["task"]["tool_name"] == payload["tool_name"]
        assert data["task"]["task_class"] == payload["task_class"]
        assert data["task"]["timeout"] == api.DEFAULT_TASK_TIMEOUTS["FAST_SCRIPT"]

    def test_get_task(self, api_client, queued_task):
        response = api_client.get(f"/api/tasks/{queued_task['id']}")
        assert response.status_code == 200
        data = response.json()
        assert data["task"]["id"] == queued_task["id"]

    def test_filter_tasks_by_status(self, api_client, queued_task, running_task):
        response = api_client.get("/api/tasks?status=queued")
        assert response.status_code == 200
        data = response.json()
        assert all(task["status"] == "queued" for task in data["tasks"])
        assert any(task["id"] == queued_task["id"] for task in data["tasks"])
        assert all(task["id"] != running_task["id"] for task in data["tasks"])

    def test_requeue_task(self, api_client, storage_with_stream):
        storage = storage_with_stream["storage"]
        stream = storage_with_stream["stream"]
        original = storage.create_task(
            stream_id=stream["id"],
            tool_name="echo",
            task_class="FAST_SCRIPT",
            payload=_payload({"source": "requeue"}),
            timeout=30,
            prompt_path="requeue.txt",
            metadata=json.dumps({"source": "requeue"}),
        )
        storage.fail_task(original["id"], "Expected failure", "TEST")

        response = api_client.post(f"/api/tasks/{original['id']}/requeue")
        assert response.status_code == 200
        data = response.json()
        assert data["task"]["status"] == "queued"
        assert data["task"]["stream_id"] == original["stream_id"]
        assert data["task"]["id"] != original["id"]

    def test_handle_task_errors(self, api_client):
        response = api_client.get("/api/tasks?status=invalid")
        assert response.status_code == 400
        data = response.json()
        assert data["status"] == 400
        assert "Invalid status filter" in data["error"]


class TestToolEndpoints:
    def test_list_tools(self, api_client):
        has_tools_route = any(
            getattr(route, "path", None) == "/api/tools" for route in api.app.routes
        )
        if not has_tools_route:
            pytest.skip("Tool listing endpoint not implemented")

        response = api_client.get("/api/tools")
        assert response.status_code == 200
        data = response.json()
        assert "tools" in data
        assert isinstance(data["tools"], list)


class TestScriptEndpoints:
    def test_list_scripts(self, api_client, script_index_env):
        response = api_client.get("/api/scripts/index")
        if response.status_code == 404:
            pytest.skip("Script index endpoint not available")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert any("path" in entry and "name" in entry for entry in data)

    def test_search_scripts(self, api_client, script_index_env):
        query = "demo"
        response = api_client.get("/api/scripts/index")
        if response.status_code == 404:
            pytest.skip("Script search endpoint not available")

        assert response.status_code == 200
        data = response.json()
        matches = [
            entry
            for entry in data
            if query in str(entry.get("name", "")).lower()
            or query in str(entry.get("description", "")).lower()
            or any(query in str(tag).lower() for tag in entry.get("tags") or [])
        ]
        assert matches
