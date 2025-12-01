"""Phase 8.2: API Endpoint Validation Tests

Comprehensive validation of all REST API endpoints with real requests,
response validation, and error handling.
"""

import pytest
import time
from fastapi.testclient import TestClient

from src.api import app, storage as api_storage


@pytest.fixture
def client(temp_db_path):
    """Create a test client with isolated database"""
    api_storage.db_path = str(temp_db_path)
    api_storage.init_db()

    # Create default project
    api_storage.create_project(name="test-project")

    return TestClient(app)


class TestHealthEndpoints:
    """Test health check and status endpoints"""

    def test_health_endpoint(self, client):
        """GET /health - Health check endpoint"""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert "status" in data

    def test_stats_endpoint(self, client):
        """GET /stats - System statistics endpoint"""
        response = client.get("/stats")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)


class TestSessionsAPI:
    """Test Sessions REST endpoints"""

    def test_create_session(self, client):
        """POST /api/sessions - Create new session"""
        response = client.post(
            "/api/sessions",
            json={"name": "test-session", "description": "Test description"},
        )
        assert response.status_code == 200
        data = response.json()
        session = data["session"]
        assert session["id"]
        assert session["name"] == "test-session"
        assert session["status"] == "active"

    def test_create_session_minimal(self, client):
        """POST /api/sessions - Create with minimal fields"""
        response = client.post("/api/sessions", json={"name": "minimal"})
        assert response.status_code == 200
        session = response.json()["session"]
        assert session["name"] == "minimal"

    def test_list_sessions(self, client):
        """GET /api/sessions - List all sessions"""
        # Create a session
        client.post("/api/sessions", json={"name": "session1"})

        # List sessions
        response = client.get("/api/sessions")
        assert response.status_code == 200
        data = response.json()
        sessions = data["sessions"]
        assert len(sessions) > 0
        assert any(s["name"] == "session1" for s in sessions)

    def test_get_session(self, client):
        """GET /api/sessions/{id} - Get specific session"""
        # Create session
        create_resp = client.post("/api/sessions", json={"name": "get-test"})
        session_id = create_resp.json()["session"]["id"]

        # Get session
        response = client.get(f"/api/sessions/{session_id}")
        assert response.status_code == 200
        session = response.json()["session"]
        assert session["id"] == session_id

    def test_update_session(self, client):
        """PUT /api/sessions/{id} - Update session"""
        # Create session
        create_resp = client.post("/api/sessions", json={"name": "original"})
        session_id = create_resp.json()["session"]["id"]

        # Update
        response = client.put(
            f"/api/sessions/{session_id}",
            json={"name": "updated"},
        )
        assert response.status_code == 200
        session = response.json()["session"]
        assert session["name"] == "updated"

    def test_end_session(self, client):
        """PUT /api/sessions/{id}/end - End session"""
        create_resp = client.post("/api/sessions", json={"name": "to-end"})
        session_id = create_resp.json()["session"]["id"]

        response = client.put(f"/api/sessions/{session_id}/end")
        assert response.status_code == 200
        session = response.json()["session"]
        assert session["status"] == "ended"


class TestStreamsAPI:
    """Test Streams REST endpoints"""

    @pytest.fixture
    def session_id(self, client):
        """Get a session ID for queue tests"""
        resp = client.post("/api/sessions", json={"name": "queue-session"})
        return resp.json()["session"]["id"]

    def test_create_queue(self, client, session_id):
        """POST /api/queues - Create new queue"""
        response = client.post(
            "/api/queues",
            json={"session_id": session_id, "name": "test-queue"},
        )
        assert response.status_code == 201
        queue = response.json()["queue"]
        assert queue["session_id"] == session_id
        assert queue["name"] == "test-queue"

    def test_list_streams(self, client, session_id):
        """GET /api/queues - List queues"""
        # Create queue
        client.post("/api/queues", json={"session_id": session_id, "name": "stream1"})

        # List
        response = client.get("/api/queues")
        assert response.status_code == 200
        queues = response.json()["queues"]
        assert any(s["name"] == "stream1" for s in queues)

    def test_list_streams_by_session(self, client, session_id):
        """GET /api/queues?session_id=xxx - Filter by session"""
        client.post("/api/queues", json={"session_id": session_id, "name": "s1"})

        response = client.get(f"/api/queues?session_id={session_id}")
        assert response.status_code == 200
        queues = response.json()["queues"]
        assert all(s["session_id"] == session_id for s in queues)

    def test_get_stream(self, client, session_id):
        """GET /api/queues/{id} - Get specific queue"""
        create_resp = client.post(
            "/api/queues",
            json={"session_id": session_id, "name": "get-test"},
        )
        queue_id = create_resp.json()["queue"]["id"]

        response = client.get(f"/api/queues/{queue_id}")
        assert response.status_code == 200
        queue = response.json()["queue"]
        assert queue["id"] == queue_id

    def test_update_stream(self, client, session_id):
        """PUT /api/queues/{id} - Update queue"""
        create_resp = client.post(
            "/api/queues",
            json={"session_id": session_id, "name": "original"},
        )
        queue_id = create_resp.json()["queue"]["id"]

        response = client.put(
            f"/api/queues/{queue_id}",
            json={"name": "updated"},
        )
        assert response.status_code == 200
        queue = response.json()["queue"]
        assert queue["name"] == "updated"

    def test_end_stream(self, client, session_id):
        """PUT /api/queues/{id}/end - End queue"""
        create_resp = client.post(
            "/api/queues",
            json={"session_id": session_id, "name": "to-end"},
        )
        queue_id = create_resp.json()["queue"]["id"]

        response = client.put(f"/api/queues/{queue_id}/end")
        assert response.status_code == 200
        queue = response.json()["queue"]
        assert queue["status"] == "ended"


class TestTasksAPI:
    """Test Tasks REST endpoints"""

    @pytest.fixture
    def queue_id(self, client):
        """Get a queue ID for task tests"""
        # Use timestamp to ensure unique queue names
        unique_id = int(time.time() * 1000000) % 1000000
        session_resp = client.post("/api/sessions", json={"name": f"task-session-{unique_id}"})
        session_id = session_resp.json()["session"]["id"]

        stream_resp = client.post(
            "/api/queues",
            json={"session_id": session_id, "name": f"task-queue-{unique_id}"},
        )
        return stream_resp.json()["queue"]["id"]

    def test_create_task(self, client, queue_id):
        """POST /api/tasks - Create new task"""
        response = client.post(
            "/api/tasks",
            json={
                "queue_id": queue_id,
                "tool_name": "test-tool",
                "task_class": "test-class",
                "timeout": 300,
            },
        )
        assert response.status_code == 200
        task = response.json()["task"]
        assert task["queue_id"] == queue_id
        assert task["status"] == "queued"

    def test_list_tasks(self, client, queue_id):
        """GET /api/tasks - List tasks"""
        client.post(
            "/api/tasks",
            json={
                "queue_id": queue_id,
                "tool_name": "tool",
                "task_class": "class",
                "timeout": 300,
            },
        )

        response = client.get("/api/tasks")
        assert response.status_code == 200
        data = response.json()
        tasks = data.get("tasks", [])
        assert len(tasks) > 0

    def test_list_tasks_by_stream(self, client, queue_id):
        """GET /api/tasks?queue_id=xxx - Filter by queue"""
        client.post(
            "/api/tasks",
            json={
                "queue_id": queue_id,
                "tool_name": "tool",
                "task_class": "class",
                "timeout": 300,
            },
        )

        response = client.get(f"/api/tasks?queue_id={queue_id}")
        assert response.status_code == 200
        tasks = response.json()["tasks"]
        assert all(t["queue_id"] == queue_id for t in tasks)

    def test_list_tasks_by_status(self, client, queue_id):
        """GET /api/tasks?status=queued - Filter by status"""
        response = client.get("/api/tasks?status=queued")
        assert response.status_code == 200
        tasks = response.json()["tasks"]
        assert all(t["status"] == "queued" for t in tasks)

    def test_get_task(self, client, queue_id):
        """GET /api/tasks/{id} - Get specific task"""
        create_resp = client.post(
            "/api/tasks",
            json={
                "queue_id": queue_id,
                "tool_name": "tool",
                "task_class": "class",
                "timeout": 300,
            },
        )
        task_id = create_resp.json()["task"]["id"]

        response = client.get(f"/api/tasks/{task_id}")
        assert response.status_code == 200
        task = response.json()["task"]
        assert task["id"] == task_id

    def test_claim_task(self, client, queue_id):
        """POST /api/tasks/{id}/claim - Claim task"""
        create_resp = client.post(
            "/api/tasks",
            json={
                "queue_id": queue_id,
                "tool_name": "tool",
                "task_class": "class",
                "timeout": 300,
            },
        )
        task_id = create_resp.json()["task"]["id"]

        response = client.post(f"/api/tasks/{task_id}/claim")
        assert response.status_code == 200
        task = response.json()["task"]
        assert task["status"] == "running"
        assert task["started_at"]

    def test_complete_task(self, client, queue_id):
        """POST /api/tasks/{id}/complete - Complete task"""
        create_resp = client.post(
            "/api/tasks",
            json={
                "queue_id": queue_id,
                "tool_name": "tool",
                "task_class": "class",
                "timeout": 300,
            },
        )
        task_id = create_resp.json()["task"]["id"]

        # Claim first
        client.post(f"/api/tasks/{task_id}/claim")

        # Complete
        response = client.post(
            f"/api/tasks/{task_id}/complete",
            json={"result_summary": "Success"},
        )
        assert response.status_code == 200
        task = response.json()["task"]
        assert task["status"] == "succeeded"

    def test_fail_task(self, client, queue_id):
        """POST /api/tasks/{id}/fail - Fail task"""
        create_resp = client.post(
            "/api/tasks",
            json={
                "queue_id": queue_id,
                "tool_name": "tool",
                "task_class": "class",
                "timeout": 300,
            },
        )
        task_id = create_resp.json()["task"]["id"]

        # Claim first
        client.post(f"/api/tasks/{task_id}/claim")

        # Fail
        response = client.post(
            f"/api/tasks/{task_id}/fail",
            json={"error_message": "Test failure"},
        )
        assert response.status_code == 200
        task = response.json()["task"]
        assert task["status"] == "failed"

    def test_requeue_task(self, client, queue_id):
        """POST /api/tasks/{id}/requeue - Requeue task"""
        create_resp = client.post(
            "/api/tasks",
            json={
                "queue_id": queue_id,
                "tool_name": "tool",
                "task_class": "class",
                "timeout": 300,
            },
        )
        task_id = create_resp.json()["task"]["id"]

        # Claim and fail
        client.post(f"/api/tasks/{task_id}/claim")
        client.post(f"/api/tasks/{task_id}/fail", json={"error_message": "Fail"})

        # Requeue
        response = client.post(f"/api/tasks/{task_id}/requeue")
        assert response.status_code == 200
        task = response.json()["task"]
        assert task["status"] == "queued"


class TestErrorHandling:
    """Test error handling and validation"""

    def test_missing_required_field(self, client):
        """POST with missing field should return 400"""
        response = client.post("/api/sessions", json={})
        assert response.status_code == 400

    def test_not_found(self, client):
        """GET non-existent resource should return 404"""
        response = client.get("/api/sessions/nonexistent")
        assert response.status_code == 404

    def test_invalid_method(self, client):
        """Invalid HTTP method should fail"""
        response = client.post("/api/sessions/test/end")
        assert response.status_code == 405


class TestResponseConsistency:
    """Test response format consistency"""

    def test_session_has_required_fields(self, client):
        """Verify session response has required fields"""
        resp = client.post("/api/sessions", json={"name": "test"})
        session = resp.json()["session"]

        required = {"id", "name", "status", "created_at", "updated_at"}
        assert required.issubset(set(session.keys()))

    def test_queue_has_required_fields(self, client):
        """Verify queue response has required fields"""
        # Create session
        session_resp = client.post("/api/sessions", json={"name": "test"})
        session_id = session_resp.json()["session"]["id"]

        # Create queue
        stream_resp = client.post(
            "/api/queues",
            json={"session_id": session_id, "name": "test"},
        )
        queue = stream_resp.json()["queue"]

        required = {"id", "session_id", "name", "status", "created_at"}
        assert required.issubset(set(queue.keys()))

    def test_task_has_required_fields(self, client):
        """Verify task response has required fields"""
        # Create session and queue
        session_resp = client.post("/api/sessions", json={"name": "task-req-session"})
        session_id = session_resp.json()["session"]["id"]
        stream_resp = client.post(
            "/api/queues",
            json={"session_id": session_id, "name": "task-req-queue"},
        )
        queue_id = stream_resp.json()["queue"]["id"]

        # Create task
        task_resp = client.post(
            "/api/tasks",
            json={
                "queue_id": queue_id,
                "tool_name": "test",
                "task_class": "test",
                "timeout": 300,
            },
        )
        task = task_resp.json()["task"]

        required = {"id", "queue_id", "tool_name", "task_class", "status"}
        assert required.issubset(set(task.keys()))


class TestMetadataAndConfig:
    def test_version_and_build_prompts(self, client):
        version = client.get("/api/version")
        assert version.status_code == 200
        assert "build_id" in version.json()

        build_prompts = client.get("/api/build-prompts")
        assert build_prompts.status_code == 200
        assert "prompts" in build_prompts.json()

    def test_config_validate_and_crud(self, client, tmp_path, monkeypatch):
        cfg_path = tmp_path / "sparkq.yml"
        cfg_path.write_text(
            "project:\n  name: test\n  repo_path: .\n"
            "script_dirs:\n  - scripts\n"
        )
        monkeypatch.setenv("SPARKQ_CONFIG", str(cfg_path))

        validate = client.post(
            "/api/config/validate",
            json={"value": {"features": {"flags": {"alpha": True}}}},
        )
        assert validate.status_code == 200

        update = client.put(
            "/api/config/features/flags",
            json={"value": {"beta": False}},
        )
        assert update.status_code == 200

        config = client.get("/api/config")
        assert config.status_code == 200
        cfg = config.json()
        assert cfg.get("features", {}).get("flags") is not None

        delete = client.delete("/api/config/features/flags")
        assert delete.status_code == 200

    def test_task_class_crud(self, client):
        create = client.post(
            "/api/task-classes",
            json={"name": "TEST_CLASS", "timeout": 10, "description": "test tc"},
        )
        assert create.status_code == 201
        tc = create.json()["task_class"]
        assert tc["name"] == "TEST_CLASS"

        listed = client.get("/api/task-classes").json()["task_classes"]
        assert any(entry["name"] == "TEST_CLASS" for entry in listed)

        update = client.put(
            f"/api/task-classes/{tc['name']}",
            json={"name": "TEST_CLASS", "timeout": 20, "description": "updated"},
        )
        assert update.status_code == 200
        assert update.json()["task_class"]["timeout"] == 20

        delete = client.delete(f"/api/task-classes/{tc['name']}")
        assert delete.status_code == 200

    def test_tools_crud(self, client):
        client.post(
            "/api/task-classes",
            json={"name": "MEDIUM_SCRIPT", "timeout": 300, "description": "default"},
        )
        create = client.post(
            "/api/tools",
            json={"name": "run-test", "task_class": "MEDIUM_SCRIPT", "description": "test tool"},
        )
        assert create.status_code == 201
        tool = create.json()["tool"]
        assert tool["name"] == "run-test"

        listed = client.get("/api/tools").json()["tools"]
        assert any(entry["name"] == "run-test" for entry in listed)

        update = client.put(
            "/api/tools/run-test",
            json={"name": "run-test", "task_class": "MEDIUM_SCRIPT", "description": "updated"},
        )
        assert update.status_code == 200

        delete = client.delete("/api/tools/run-test")
        assert delete.status_code == 200

    def test_prompts_crud(self, client):
        create = client.post(
            "/api/prompts",
            json={
                "command": "test-cmd",
                "label": "Test Prompt",
                "template_text": "Do the thing",
                "description": "desc",
            },
        )
        assert create.status_code == 201
        prompt = create.json()["prompt"]

        fetched = client.get(f"/api/prompts/{prompt['id']}")
        assert fetched.status_code == 200
        assert fetched.json()["prompt"]["command"] == "test-cmd"

        listed = client.get("/api/prompts").json()["prompts"]
        assert any(p["id"] == prompt["id"] for p in listed)

        update = client.put(
            f"/api/prompts/{prompt['id']}",
            json={"label": "Updated Label"},
        )
        assert update.status_code == 200
        assert update.json()["prompt"]["label"] == "Updated Label"

        delete = client.delete(f"/api/prompts/{prompt['id']}")
        assert delete.status_code in {200, 405}

    def test_scripts_index_builds(self, client, tmp_path, monkeypatch):
        cfg_path = tmp_path / "sparkq.yml"
        scripts_dir = tmp_path / "scripts"
        scripts_dir.mkdir(parents=True, exist_ok=True)
        (scripts_dir / "hello.sh").write_text("#!/bin/bash\n# name: hello\n# description: hi\n echo hi\n")
        cfg_path.write_text(
            f"project:\n  name: test\n  repo_path: .\nscript_dirs:\n  - {scripts_dir}\n"
        )
        monkeypatch.setenv("SPARKQ_CONFIG", str(cfg_path))

        resp = client.get("/api/scripts/index")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)


class TestAdditionalRoutes:
    def test_docs_and_openapi_available(self, client):
        for path in ["/docs", "/docs/oauth2-redirect", "/openapi.json", "/redoc"]:
            resp = client.get(path)
            assert resp.status_code in {200, 307}

    def test_cache_buster_script(self, client):
        resp = client.get("/ui-cache-buster.js")
        assert resp.status_code == 200
        assert "SPARKQ" in resp.text

    def test_queue_archive_and_unarchive(self, client):
        session_resp = client.post("/api/sessions", json={"name": "archival-session"})
        session_id = session_resp.json()["session"]["id"]
        queue_resp = client.post(
            "/api/queues",
            json={"session_id": session_id, "name": "archival-queue"},
        )
        queue_id = queue_resp.json()["queue"]["id"]

        archive = client.put(f"/api/queues/{queue_id}/archive")
        assert archive.status_code == 200
        unarchive = client.put(f"/api/queues/{queue_id}/unarchive")
        assert unarchive.status_code == 200

    def test_quick_add_task_script_mode(self, client):
        session_resp = client.post("/api/sessions", json={"name": "qa-session"})
        session_id = session_resp.json()["session"]["id"]
        queue_resp = client.post(
            "/api/queues",
            json={"session_id": session_id, "name": "qa-queue"},
        )
        queue_id = queue_resp.json()["queue"]["id"]

        resp = client.post(
            "/api/tasks/quick-add",
            json={
                "queue_id": queue_id,
                "mode": "script",
                "script_path": "scripts/hello.sh",
                "script_args": "--dry-run",
            },
        )
        assert resp.status_code == 200
        payload = resp.json()
        assert payload["task_id"]
