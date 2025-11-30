"""Phase 8.3: System Integration Tests

Comprehensive integration tests for complete workflows, data consistency,
and error recovery across the entire system.
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


class TestCompleteSessionWorkflow:
    """Test complete session lifecycle workflows"""

    def test_complete_session_workflow(self, client):
        """
        Complete workflow:
        1. Create session
        2. Create queue under session
        3. Create task under queue
        4. Claim task
        5. Complete task
        6. Verify task marked as succeeded
        7. End session
        """
        # Step 1: Create session
        session_resp = client.post(
            "/api/sessions", json={"name": "workflow-session"}
        )
        assert session_resp.status_code == 200
        session_id = session_resp.json()["session"]["id"]
        assert session_resp.json()["session"]["status"] == "active"

        # Step 2: Create queue under session
        stream_resp = client.post(
            "/api/streams",
            json={"session_id": session_id, "name": "workflow-queue"},
        )
        assert stream_resp.status_code == 201
        queue_id = stream_resp.json()["queue"]["id"]
        assert stream_resp.json()["queue"]["session_id"] == session_id

        # Step 3: Create task under queue
        task_resp = client.post(
            "/api/tasks",
            json={
                "queue_id": queue_id,
                "tool_name": "workflow-tool",
                "task_class": "workflow-class",
                "timeout": 300,
            },
        )
        assert task_resp.status_code == 200
        task_id = task_resp.json()["task"]["id"]
        assert task_resp.json()["task"]["status"] == "queued"

        # Step 4: Claim task
        claim_resp = client.post(f"/api/tasks/{task_id}/claim")
        assert claim_resp.status_code == 200
        assert claim_resp.json()["task"]["status"] == "running"
        assert claim_resp.json()["task"]["started_at"]

        # Step 5: Complete task
        complete_resp = client.post(
            f"/api/tasks/{task_id}/complete",
            json={"result_summary": "Completed successfully"},
        )
        assert complete_resp.status_code == 200
        assert complete_resp.json()["task"]["status"] == "succeeded"

        # Step 6: Verify task marked as succeeded
        get_task_resp = client.get(f"/api/tasks/{task_id}")
        assert get_task_resp.status_code == 200
        assert get_task_resp.json()["task"]["status"] == "succeeded"

        # Step 7: End session
        end_session_resp = client.put(f"/api/sessions/{session_id}/end")
        assert end_session_resp.status_code == 200
        assert end_session_resp.json()["session"]["status"] == "ended"

    def test_task_failure_workflow(self, client):
        """
        Test failure and requeue workflow:
        1. Create session/queue/task
        2. Claim task
        3. Fail task with error message
        4. Verify task marked as failed
        5. Requeue task (creates new task)
        6. Verify new task is in queued state
        """
        # Setup: Create session, queue, task
        session_resp = client.post(
            "/api/sessions", json={"name": "failure-session"}
        )
        session_id = session_resp.json()["session"]["id"]

        stream_resp = client.post(
            "/api/streams",
            json={"session_id": session_id, "name": "failure-queue"},
        )
        queue_id = stream_resp.json()["queue"]["id"]

        task_resp = client.post(
            "/api/tasks",
            json={
                "queue_id": queue_id,
                "tool_name": "failure-tool",
                "task_class": "failure-class",
                "timeout": 300,
            },
        )
        task_id = task_resp.json()["task"]["id"]

        # Step 1: Claim task
        client.post(f"/api/tasks/{task_id}/claim")

        # Step 2: Fail task with error message
        fail_resp = client.post(
            f"/api/tasks/{task_id}/fail",
            json={"error_message": "Test failure for requeue"},
        )
        assert fail_resp.status_code == 200

        # Step 3: Verify task marked as failed
        assert fail_resp.json()["task"]["status"] == "failed"
        assert fail_resp.json()["task"]["error_message"] == "Test failure for requeue"

        # Step 4: Requeue task (creates NEW task with NEW ID)
        requeue_resp = client.post(f"/api/tasks/{task_id}/requeue")
        assert requeue_resp.status_code == 200

        # Step 5: Verify NEW task is in queued state
        new_task_id = requeue_resp.json()["task"]["id"]
        assert new_task_id != task_id
        assert requeue_resp.json()["task"]["status"] == "queued"

        # Verify original task still shows failed
        get_resp = client.get(f"/api/tasks/{task_id}")
        assert get_resp.json()["task"]["status"] == "failed"

        # Verify new task is queued
        new_get_resp = client.get(f"/api/tasks/{new_task_id}")
        assert new_get_resp.json()["task"]["status"] == "queued"

    def test_multiple_task_completion_in_stream(self, client):
        """
        Test multiple tasks within single queue:
        1. Create queue
        2. Create 3 tasks
        3. Complete tasks with different results
        4. Verify task states
        """
        # Step 1: Create session and queue
        session_resp = client.post(
            "/api/sessions", json={"name": "multi-task-session"}
        )
        session_id = session_resp.json()["session"]["id"]

        stream_resp = client.post(
            "/api/streams",
            json={"session_id": session_id, "name": "multi-queue"},
        )
        queue_id = stream_resp.json()["queue"]["id"]

        # Step 2: Create 3 tasks
        task_ids = []
        for i in range(3):
            task_resp = client.post(
                "/api/tasks",
                json={
                    "queue_id": queue_id,
                    "tool_name": f"tool-{i}",
                    "task_class": f"class-{i}",
                    "timeout": 300,
                },
            )
            task_ids.append(task_resp.json()["task"]["id"])

        # Step 3: Process tasks with different outcomes
        # Task 0: Complete successfully
        client.post(f"/api/tasks/{task_ids[0]}/claim")
        client.post(f"/api/tasks/{task_ids[0]}/complete", json={"result_summary": "Success"})

        # Task 1: Fail then requeue (creates new task)
        client.post(f"/api/tasks/{task_ids[1]}/claim")
        client.post(f"/api/tasks/{task_ids[1]}/fail", json={"error_message": "Failed"})
        requeue_resp = client.post(f"/api/tasks/{task_ids[1]}/requeue")
        new_requeued_task_id = requeue_resp.json()["task"]["id"]

        # Task 2: Still queued (not claimed)

        # Step 4: Verify task states
        tasks_resp = client.get(f"/api/tasks?queue_id={queue_id}")
        tasks = {t["id"]: t for t in tasks_resp.json()["tasks"]}

        assert tasks[task_ids[0]]["status"] == "succeeded"
        assert tasks[task_ids[1]]["status"] == "failed"  # Original task stays failed
        assert tasks[task_ids[2]]["status"] == "queued"
        assert tasks[new_requeued_task_id]["status"] == "queued"  # New requeued task


class TestMultiStreamIsolation:
    """Test that streams and their tasks are properly isolated"""

    def test_multi_stream_isolation(self, client):
        """
        Test queue isolation:
        1. Create session with multiple streams
        2. Create tasks in each queue
        3. Filter tasks by queue
        4. Verify tasks are isolated per queue
        """
        # Step 1: Create session
        session_resp = client.post(
            "/api/sessions", json={"name": "isolation-session"}
        )
        session_id = session_resp.json()["session"]["id"]

        # Step 2: Create multiple streams
        stream_ids = []
        for i in range(3):
            stream_resp = client.post(
                "/api/streams",
                json={"session_id": session_id, "name": f"queue-{i}"},
            )
            stream_ids.append(stream_resp.json()["queue"]["id"])

        # Step 3: Create tasks in each queue
        stream_task_map = {}
        for stream_idx, queue_id in enumerate(stream_ids):
            task_ids = []
            for task_idx in range(2):
                task_resp = client.post(
                    "/api/tasks",
                    json={
                        "queue_id": queue_id,
                        "tool_name": f"queue-{stream_idx}-task-{task_idx}",
                        "task_class": "test-class",
                        "timeout": 300,
                    },
                )
                task_ids.append(task_resp.json()["task"]["id"])
            stream_task_map[queue_id] = task_ids

        # Step 4: Filter tasks by queue and verify isolation
        for queue_id, expected_task_ids in stream_task_map.items():
            tasks_resp = client.get(f"/api/tasks?queue_id={queue_id}")
            tasks = tasks_resp.json()["tasks"]

            # Verify correct number of tasks
            assert len(tasks) == 2

            # Verify all tasks belong to this queue
            assert all(t["queue_id"] == queue_id for t in tasks)

            # Verify task IDs match
            actual_task_ids = {t["id"] for t in tasks}
            expected_set = set(expected_task_ids)
            assert actual_task_ids == expected_set

    def test_streams_isolated_across_sessions(self, client):
        """
        Test that streams from different sessions are properly isolated:
        1. Create 2 sessions
        2. Create streams in each
        3. Verify streams are isolated
        """
        # Step 1: Create 2 sessions
        session_ids = []
        for i in range(2):
            resp = client.post("/api/sessions", json={"name": f"session-{i}"})
            session_ids.append(resp.json()["session"]["id"])

        # Step 2: Create streams in each session
        session_stream_map = {}
        for session_id in session_ids:
            stream_resp = client.post(
                "/api/streams",
                json={"session_id": session_id, "name": f"queue-for-{session_id}"},
            )
            queue_id = stream_resp.json()["queue"]["id"]
            session_stream_map[session_id] = queue_id

        # Step 3: Verify streams are isolated by session
        for session_id, expected_stream_id in session_stream_map.items():
            streams_resp = client.get(f"/api/streams?session_id={session_id}")
            streams = streams_resp.json()["streams"]

            # All streams should belong to this session
            assert all(s["session_id"] == session_id for s in streams)

            # Should find our queue
            assert any(s["id"] == expected_stream_id for s in streams)


class TestDataConsistency:
    """Test data consistency and integrity across operations"""

    def test_data_persistence_after_api_calls(self, client):
        """
        Test that data persists correctly after API operations:
        1. Create session, queue, task via API
        2. Modify task status through lifecycle
        3. Verify data persists correctly
        """
        # Step 1: Create entities
        session_resp = client.post(
            "/api/sessions", json={"name": "persist-session"}
        )
        session_id = session_resp.json()["session"]["id"]

        stream_resp = client.post(
            "/api/streams",
            json={"session_id": session_id, "name": "persist-queue"},
        )
        queue_id = stream_resp.json()["queue"]["id"]

        task_resp = client.post(
            "/api/tasks",
            json={
                "queue_id": queue_id,
                "tool_name": "persist-tool",
                "task_class": "persist-class",
                "timeout": 300,
            },
        )
        task_id = task_resp.json()["task"]["id"]

        # Step 2: Modify through lifecycle
        client.post(f"/api/tasks/{task_id}/claim")
        client.post(f"/api/tasks/{task_id}/complete", json={"result_summary": "Done"})

        # Step 3: Verify data persists
        # Re-fetch all entities and verify they exist with correct data
        session_check = client.get(f"/api/sessions/{session_id}")
        assert session_check.status_code == 200
        assert session_check.json()["session"]["name"] == "persist-session"

        stream_check = client.get(f"/api/streams/{queue_id}")
        assert stream_check.status_code == 200
        assert stream_check.json()["queue"]["name"] == "persist-queue"

        task_check = client.get(f"/api/tasks/{task_id}")
        assert task_check.status_code == 200
        task = task_check.json()["task"]
        assert task["status"] == "succeeded"
        assert task["result_summary"] == "Done"

    def test_task_status_transitions(self, client):
        """
        Verify valid task status transitions:
        - queued → running (claim)
        - running → succeeded (complete)
        - running → failed (fail)
        - failed → queued (requeue)
        - succeeded → queued (requeue)
        """
        # Setup
        session_resp = client.post(
            "/api/sessions", json={"name": "transition-session"}
        )
        session_id = session_resp.json()["session"]["id"]

        stream_resp = client.post(
            "/api/streams",
            json={"session_id": session_id, "name": "transition-queue"},
        )
        queue_id = stream_resp.json()["queue"]["id"]

        # Test path 1: queued → running → succeeded
        task1_resp = client.post(
            "/api/tasks",
            json={
                "queue_id": queue_id,
                "tool_name": "tool1",
                "task_class": "class1",
                "timeout": 300,
            },
        )
        task1_id = task1_resp.json()["task"]["id"]
        assert task1_resp.json()["task"]["status"] == "queued"

        claim1 = client.post(f"/api/tasks/{task1_id}/claim")
        assert claim1.json()["task"]["status"] == "running"

        complete1 = client.post(
            f"/api/tasks/{task1_id}/complete", json={"result_summary": "Success"}
        )
        assert complete1.json()["task"]["status"] == "succeeded"

        # Test requeue from succeeded
        requeue1 = client.post(f"/api/tasks/{task1_id}/requeue")
        assert requeue1.json()["task"]["status"] == "queued"

        # Test path 2: queued → running → failed → queued
        task2_resp = client.post(
            "/api/tasks",
            json={
                "queue_id": queue_id,
                "tool_name": "tool2",
                "task_class": "class2",
                "timeout": 300,
            },
        )
        task2_id = task2_resp.json()["task"]["id"]

        client.post(f"/api/tasks/{task2_id}/claim")

        fail2 = client.post(
            f"/api/tasks/{task2_id}/fail", json={"error_message": "Failed"}
        )
        assert fail2.json()["task"]["status"] == "failed"

        requeue2 = client.post(f"/api/tasks/{task2_id}/requeue")
        assert requeue2.json()["task"]["status"] == "queued"

    def test_stream_with_tasks_query(self, client):
        """
        Test that queue and task queries show correct relationships:
        1. Create session with queue and tasks
        2. Query queue and verify it exists
        3. Query tasks and verify they belong to queue
        """
        # Step 1: Create session with queue and tasks
        session_resp = client.post(
            "/api/sessions", json={"name": "query-test-session"}
        )
        session_id = session_resp.json()["session"]["id"]

        stream_resp = client.post(
            "/api/streams",
            json={"session_id": session_id, "name": "query-test-queue"},
        )
        queue_id = stream_resp.json()["queue"]["id"]

        task_resp = client.post(
            "/api/tasks",
            json={
                "queue_id": queue_id,
                "tool_name": "query-tool",
                "task_class": "query-class",
                "timeout": 300,
            },
        )
        task_id = task_resp.json()["task"]["id"]

        # Step 2: Verify all exist
        assert client.get(f"/api/sessions/{session_id}").status_code == 200
        assert client.get(f"/api/streams/{queue_id}").status_code == 200
        assert client.get(f"/api/tasks/{task_id}").status_code == 200

        # Step 3: Query queue and verify it has correct session_id
        stream_get = client.get(f"/api/streams/{queue_id}")
        assert stream_get.json()["queue"]["session_id"] == session_id

        # Step 4: Query tasks and verify they belong to queue
        task_get = client.get(f"/api/tasks/{task_id}")
        assert task_get.json()["task"]["queue_id"] == queue_id

        # Query by queue_id and verify we get it
        tasks_resp = client.get(f"/api/tasks?queue_id={queue_id}")
        tasks = tasks_resp.json()["tasks"]
        assert any(t["id"] == task_id for t in tasks)


class TestErrorRecovery:
    """Test error handling and recovery scenarios"""

    def test_invalid_stream_id_returns_404(self, client):
        """
        Test that accessing invalid queue returns 404
        """
        response = client.get("/api/streams/invalid-id")
        assert response.status_code == 404

    def test_invalid_task_id_returns_404(self, client):
        """
        Test that accessing invalid task returns 404
        """
        response = client.get("/api/tasks/invalid-id")
        assert response.status_code == 404

    def test_claim_invalid_task_returns_404(self, client):
        """
        Test that claiming invalid task returns 404
        """
        response = client.post("/api/tasks/invalid-id/claim")
        assert response.status_code == 404

    def test_complete_task_without_claiming(self, client):
        """
        Test completing a task that hasn't been claimed:
        Should fail since task must be in 'running' state
        """
        # Setup
        session_resp = client.post(
            "/api/sessions", json={"name": "unclaimed-session"}
        )
        session_id = session_resp.json()["session"]["id"]

        stream_resp = client.post(
            "/api/streams",
            json={"session_id": session_id, "name": "unclaimed-queue"},
        )
        queue_id = stream_resp.json()["queue"]["id"]

        task_resp = client.post(
            "/api/tasks",
            json={
                "queue_id": queue_id,
                "tool_name": "unclaimed-tool",
                "task_class": "unclaimed-class",
                "timeout": 300,
            },
        )
        task_id = task_resp.json()["task"]["id"]

        # Try to complete without claiming
        complete_resp = client.post(
            f"/api/tasks/{task_id}/complete",
            json={"result_summary": "Should fail"},
        )

        # Should fail with 400 or similar error (task not in running state)
        assert complete_resp.status_code in (400, 409, 500)

    def test_fail_task_allows_any_status(self, client):
        """
        Test that failing a task is allowed regardless of status
        (API doesn't enforce task must be in 'running' state)
        """
        # Setup
        session_resp = client.post(
            "/api/sessions", json={"name": "fail-test-session"}
        )
        session_id = session_resp.json()["session"]["id"]

        stream_resp = client.post(
            "/api/streams",
            json={"session_id": session_id, "name": "fail-test-queue"},
        )
        queue_id = stream_resp.json()["queue"]["id"]

        task_resp = client.post(
            "/api/tasks",
            json={
                "queue_id": queue_id,
                "tool_name": "fail-test-tool",
                "task_class": "fail-test-class",
                "timeout": 300,
            },
        )
        task_id = task_resp.json()["task"]["id"]

        # Fail without claiming (task is in 'queued' state)
        fail_resp = client.post(
            f"/api/tasks/{task_id}/fail",
            json={"error_message": "Failed in queued state"},
        )

        # API allows this (returns 200)
        assert fail_resp.status_code == 200
        assert fail_resp.json()["task"]["status"] == "failed"
        assert fail_resp.json()["task"]["error_message"] == "Failed in queued state"

    def test_create_task_with_missing_stream_id(self, client):
        """
        Test creating task with missing queue_id returns 400
        """
        response = client.post(
            "/api/tasks",
            json={
                "tool_name": "test-tool",
                "task_class": "test-class",
                "timeout": 300,
            },
        )
        assert response.status_code == 400

    def test_create_stream_with_missing_session_id(self, client):
        """
        Test creating queue with missing session_id returns 400
        """
        response = client.post(
            "/api/streams",
            json={"name": "test-queue"},
        )
        assert response.status_code == 400

    def test_create_session_with_missing_name(self, client):
        """
        Test creating session with missing name returns 400
        """
        response = client.post("/api/sessions", json={})
        assert response.status_code == 400
