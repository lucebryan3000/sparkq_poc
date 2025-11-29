"""Phase 8.2: API Endpoint Validation Tests

Comprehensive validation of all REST API endpoints with real requests,
response validation, and error handling.
"""

import pytest
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
        """Get a session ID for stream tests"""
        resp = client.post("/api/sessions", json={"name": "stream-session"})
        return resp.json()["session"]["id"]

    def test_create_stream(self, client, session_id):
        """POST /api/streams - Create new stream"""
        response = client.post(
            "/api/streams",
            json={"session_id": session_id, "name": "test-stream"},
        )
        assert response.status_code == 201
        stream = response.json()["stream"]
        assert stream["session_id"] == session_id
        assert stream["name"] == "test-stream"

    def test_list_streams(self, client, session_id):
        """GET /api/streams - List streams"""
        # Create stream
        client.post("/api/streams", json={"session_id": session_id, "name": "stream1"})

        # List
        response = client.get("/api/streams")
        assert response.status_code == 200
        streams = response.json()["streams"]
        assert any(s["name"] == "stream1" for s in streams)

    def test_list_streams_by_session(self, client, session_id):
        """GET /api/streams?session_id=xxx - Filter by session"""
        client.post("/api/streams", json={"session_id": session_id, "name": "s1"})

        response = client.get(f"/api/streams?session_id={session_id}")
        assert response.status_code == 200
        streams = response.json()["streams"]
        assert all(s["session_id"] == session_id for s in streams)

    def test_get_stream(self, client, session_id):
        """GET /api/streams/{id} - Get specific stream"""
        create_resp = client.post(
            "/api/streams",
            json={"session_id": session_id, "name": "get-test"},
        )
        stream_id = create_resp.json()["stream"]["id"]

        response = client.get(f"/api/streams/{stream_id}")
        assert response.status_code == 200
        stream = response.json()["stream"]
        assert stream["id"] == stream_id

    def test_update_stream(self, client, session_id):
        """PUT /api/streams/{id} - Update stream"""
        create_resp = client.post(
            "/api/streams",
            json={"session_id": session_id, "name": "original"},
        )
        stream_id = create_resp.json()["stream"]["id"]

        response = client.put(
            f"/api/streams/{stream_id}",
            json={"name": "updated"},
        )
        assert response.status_code == 200
        stream = response.json()["stream"]
        assert stream["name"] == "updated"

    def test_end_stream(self, client, session_id):
        """PUT /api/streams/{id}/end - End stream"""
        create_resp = client.post(
            "/api/streams",
            json={"session_id": session_id, "name": "to-end"},
        )
        stream_id = create_resp.json()["stream"]["id"]

        response = client.put(f"/api/streams/{stream_id}/end")
        assert response.status_code == 200
        stream = response.json()["stream"]
        assert stream["status"] == "ended"


class TestTasksAPI:
    """Test Tasks REST endpoints"""

    @pytest.fixture
    def stream_id(self, client):
        """Get a stream ID for task tests"""
        session_resp = client.post("/api/sessions", json={"name": "task-session"})
        session_id = session_resp.json()["session"]["id"]

        stream_resp = client.post(
            "/api/streams",
            json={"session_id": session_id, "name": "task-stream"},
        )
        return stream_resp.json()["stream"]["id"]

    def test_create_task(self, client, stream_id):
        """POST /api/tasks - Create new task"""
        response = client.post(
            "/api/tasks",
            json={
                "stream_id": stream_id,
                "tool_name": "test-tool",
                "task_class": "test-class",
                "timeout": 300,
            },
        )
        assert response.status_code == 200
        task = response.json()["task"]
        assert task["stream_id"] == stream_id
        assert task["status"] == "queued"

    def test_list_tasks(self, client, stream_id):
        """GET /api/tasks - List tasks"""
        client.post(
            "/api/tasks",
            json={
                "stream_id": stream_id,
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

    def test_list_tasks_by_stream(self, client, stream_id):
        """GET /api/tasks?stream_id=xxx - Filter by stream"""
        client.post(
            "/api/tasks",
            json={
                "stream_id": stream_id,
                "tool_name": "tool",
                "task_class": "class",
                "timeout": 300,
            },
        )

        response = client.get(f"/api/tasks?stream_id={stream_id}")
        assert response.status_code == 200
        tasks = response.json()["tasks"]
        assert all(t["stream_id"] == stream_id for t in tasks)

    def test_list_tasks_by_status(self, client, stream_id):
        """GET /api/tasks?status=queued - Filter by status"""
        response = client.get("/api/tasks?status=queued")
        assert response.status_code == 200
        tasks = response.json()["tasks"]
        assert all(t["status"] == "queued" for t in tasks)

    def test_get_task(self, client, stream_id):
        """GET /api/tasks/{id} - Get specific task"""
        create_resp = client.post(
            "/api/tasks",
            json={
                "stream_id": stream_id,
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

    def test_claim_task(self, client, stream_id):
        """POST /api/tasks/{id}/claim - Claim task"""
        create_resp = client.post(
            "/api/tasks",
            json={
                "stream_id": stream_id,
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

    def test_complete_task(self, client, stream_id):
        """POST /api/tasks/{id}/complete - Complete task"""
        create_resp = client.post(
            "/api/tasks",
            json={
                "stream_id": stream_id,
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

    def test_fail_task(self, client, stream_id):
        """POST /api/tasks/{id}/fail - Fail task"""
        create_resp = client.post(
            "/api/tasks",
            json={
                "stream_id": stream_id,
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

    def test_requeue_task(self, client, stream_id):
        """POST /api/tasks/{id}/requeue - Requeue task"""
        create_resp = client.post(
            "/api/tasks",
            json={
                "stream_id": stream_id,
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

    def test_stream_has_required_fields(self, client):
        """Verify stream response has required fields"""
        # Create session
        session_resp = client.post("/api/sessions", json={"name": "test"})
        session_id = session_resp.json()["session"]["id"]

        # Create stream
        stream_resp = client.post(
            "/api/streams",
            json={"session_id": session_id, "name": "test"},
        )
        stream = stream_resp.json()["stream"]

        required = {"id", "session_id", "name", "status", "created_at"}
        assert required.issubset(set(stream.keys()))

    def test_task_has_required_fields(self, client):
        """Verify task response has required fields"""
        # Create session and stream
        session_resp = client.post("/api/sessions", json={"name": "test"})
        session_id = session_resp.json()["session"]["id"]
        stream_resp = client.post(
            "/api/streams",
            json={"session_id": session_id, "name": "test"},
        )
        stream_id = stream_resp.json()["stream"]["id"]

        # Create task
        task_resp = client.post(
            "/api/tasks",
            json={
                "stream_id": stream_id,
                "tool_name": "test",
                "task_class": "test",
                "timeout": 300,
            },
        )
        task = task_resp.json()["task"]

        required = {"id", "stream_id", "tool_name", "task_class", "status"}
        assert required.issubset(set(task.keys()))
