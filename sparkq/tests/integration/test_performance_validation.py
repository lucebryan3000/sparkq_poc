"""Phase 8.4: Performance Validation Tests

Performance and load testing for throughput, query efficiency, and system behavior
under typical operational conditions.
"""

import time
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


class TestThroughput:
    """Test system throughput and bulk operations"""

    def test_create_tasks_bulk(self, client):
        """
        Test creating 50+ tasks and verify persistence
        """
        # Setup
        session_resp = client.post(
            "/api/sessions", json={"name": "bulk-session"}
        )
        session_id = session_resp.json()["session"]["id"]

        stream_resp = client.post(
            "/api/streams",
            json={"session_id": session_id, "name": "bulk-queue"},
        )
        queue_id = stream_resp.json()["queue"]["id"]

        # Create 50 tasks
        task_ids = []
        start_time = time.time()
        for i in range(50):
            task_resp = client.post(
                "/api/tasks",
                json={
                    "queue_id": queue_id,
                    "tool_name": f"tool-{i}",
                    "task_class": f"class-{i}",
                    "timeout": 300,
                },
            )
            assert task_resp.status_code == 200
            task_ids.append(task_resp.json()["task"]["id"])

        creation_time = time.time() - start_time

        # Verify all tasks exist
        list_resp = client.get(f"/api/tasks?queue_id={queue_id}")
        tasks = list_resp.json()["tasks"]
        assert len(tasks) == 50

        # Verify creation completed in reasonable time (<5 seconds)
        assert creation_time < 5.0

    def test_claim_tasks_under_load(self, client):
        """
        Test claiming multiple tasks in rapid succession
        """
        # Setup
        session_resp = client.post(
            "/api/sessions", json={"name": "load-session"}
        )
        session_id = session_resp.json()["session"]["id"]

        stream_resp = client.post(
            "/api/streams",
            json={"session_id": session_id, "name": "load-queue"},
        )
        queue_id = stream_resp.json()["queue"]["id"]

        # Create 20 tasks
        task_ids = []
        for i in range(20):
            task_resp = client.post(
                "/api/tasks",
                json={
                    "queue_id": queue_id,
                    "tool_name": f"load-tool-{i}",
                    "task_class": f"load-class-{i}",
                    "timeout": 300,
                },
            )
            task_ids.append(task_resp.json()["task"]["id"])

        # Claim all tasks rapidly
        start_time = time.time()
        for task_id in task_ids:
            claim_resp = client.post(f"/api/tasks/{task_id}/claim")
            assert claim_resp.status_code == 200
            assert claim_resp.json()["task"]["status"] == "running"

        claim_time = time.time() - start_time

        # Verify all claimed
        list_resp = client.get(f"/api/tasks?queue_id={queue_id}")
        tasks = list_resp.json()["tasks"]
        running_count = sum(1 for t in tasks if t["status"] == "running")
        assert running_count == 20

        # Verify claiming completed in reasonable time (<2 seconds)
        assert claim_time < 2.0

    def test_complete_tasks_under_load(self, client):
        """
        Test completing multiple tasks in rapid succession
        """
        # Setup
        session_resp = client.post(
            "/api/sessions", json={"name": "complete-load-session"}
        )
        session_id = session_resp.json()["session"]["id"]

        stream_resp = client.post(
            "/api/streams",
            json={"session_id": session_id, "name": "complete-load-queue"},
        )
        queue_id = stream_resp.json()["queue"]["id"]

        # Create and claim 15 tasks
        task_ids = []
        for i in range(15):
            task_resp = client.post(
                "/api/tasks",
                json={
                    "queue_id": queue_id,
                    "tool_name": f"complete-tool-{i}",
                    "task_class": f"complete-class-{i}",
                    "timeout": 300,
                },
            )
            task_id = task_resp.json()["task"]["id"]
            task_ids.append(task_id)
            client.post(f"/api/tasks/{task_id}/claim")

        # Complete all tasks
        start_time = time.time()
        for i, task_id in enumerate(task_ids):
            complete_resp = client.post(
                f"/api/tasks/{task_id}/complete",
                json={"result_summary": f"Result {i}"},
            )
            assert complete_resp.status_code == 200
            assert complete_resp.json()["task"]["status"] == "succeeded"

        complete_time = time.time() - start_time

        # Verify all completed
        list_resp = client.get(f"/api/tasks?queue_id={queue_id}")
        tasks = list_resp.json()["tasks"]
        succeeded_count = sum(1 for t in tasks if t["status"] == "succeeded")
        assert succeeded_count == 15

        # Verify completion completed in reasonable time (<1.5 seconds)
        assert complete_time < 1.5


class TestQueryPerformance:
    """Test query performance and response times"""

    def test_list_tasks_performance(self, client):
        """
        Test listing tasks with pagination - verify reasonable response time
        """
        # Setup with moderate data set
        session_resp = client.post(
            "/api/sessions", json={"name": "query-perf-session"}
        )
        session_id = session_resp.json()["session"]["id"]

        stream_resp = client.post(
            "/api/streams",
            json={"session_id": session_id, "name": "query-perf-queue"},
        )
        queue_id = stream_resp.json()["queue"]["id"]

        # Create 30 tasks
        for i in range(30):
            client.post(
                "/api/tasks",
                json={
                    "queue_id": queue_id,
                    "tool_name": f"perf-tool-{i}",
                    "task_class": f"perf-class-{i}",
                    "timeout": 300,
                },
            )

        # Test list performance
        start_time = time.time()
        list_resp = client.get(f"/api/tasks?queue_id={queue_id}")
        query_time = time.time() - start_time

        assert list_resp.status_code == 200
        assert len(list_resp.json()["tasks"]) == 30

        # Query should complete in < 200ms
        assert query_time < 0.2

    def test_get_single_task_performance(self, client):
        """
        Test getting a single task - verify sub-50ms response time
        """
        # Setup
        session_resp = client.post(
            "/api/sessions", json={"name": "single-task-session"}
        )
        session_id = session_resp.json()["session"]["id"]

        stream_resp = client.post(
            "/api/streams",
            json={"session_id": session_id, "name": "single-task-queue"},
        )
        queue_id = stream_resp.json()["queue"]["id"]

        task_resp = client.post(
            "/api/tasks",
            json={
                "queue_id": queue_id,
                "tool_name": "single-tool",
                "task_class": "single-class",
                "timeout": 300,
            },
        )
        task_id = task_resp.json()["task"]["id"]

        # Test get performance
        start_time = time.time()
        get_resp = client.get(f"/api/tasks/{task_id}")
        query_time = time.time() - start_time

        assert get_resp.status_code == 200
        assert get_resp.json()["task"]["id"] == task_id

        # Single get should complete in < 50ms
        assert query_time < 0.05

    def test_filter_tasks_by_status_performance(self, client):
        """
        Test filtering tasks by status - verify reasonable response time
        """
        # Setup with mixed status tasks
        session_resp = client.post(
            "/api/sessions", json={"name": "filter-session"}
        )
        session_id = session_resp.json()["session"]["id"]

        stream_resp = client.post(
            "/api/streams",
            json={"session_id": session_id, "name": "filter-queue"},
        )
        queue_id = stream_resp.json()["queue"]["id"]

        # Create tasks with different statuses
        for i in range(10):
            task_resp = client.post(
                "/api/tasks",
                json={
                    "queue_id": queue_id,
                    "tool_name": f"filter-tool-{i}",
                    "task_class": f"filter-class-{i}",
                    "timeout": 300,
                },
            )
            task_id = task_resp.json()["task"]["id"]

            # Mark some as running
            if i % 2 == 0:
                client.post(f"/api/tasks/{task_id}/claim")

        # Test filter by status performance
        start_time = time.time()
        queued_resp = client.get("/api/tasks?status=queued")
        query_time = time.time() - start_time

        assert queued_resp.status_code == 200
        queued_tasks = queued_resp.json()["tasks"]
        assert all(t["status"] == "queued" for t in queued_tasks)

        # Filter should complete in < 200ms
        assert query_time < 0.2

    def test_list_sessions_performance(self, client):
        """
        Test listing sessions - verify reasonable response time with multiple sessions
        """
        # Create 20 sessions
        for i in range(20):
            client.post("/api/sessions", json={"name": f"perf-session-{i}"})

        # Test list performance
        start_time = time.time()
        list_resp = client.get("/api/sessions")
        query_time = time.time() - start_time

        assert list_resp.status_code == 200
        assert len(list_resp.json()["sessions"]) >= 20

        # List should complete in < 100ms
        assert query_time < 0.1


class TestConcurrentOperations:
    """Test behavior under concurrent load"""

    def test_sequential_task_claims_success(self, client):
        """
        Test that sequential task claims don't interfere with each other
        """
        # Setup
        session_resp = client.post(
            "/api/sessions", json={"name": "concurrent-session"}
        )
        session_id = session_resp.json()["session"]["id"]

        stream_resp = client.post(
            "/api/streams",
            json={"session_id": session_id, "name": "concurrent-queue"},
        )
        queue_id = stream_resp.json()["queue"]["id"]

        # Create multiple tasks
        task_ids = []
        for i in range(5):
            task_resp = client.post(
                "/api/tasks",
                json={
                    "queue_id": queue_id,
                    "tool_name": f"concurrent-tool-{i}",
                    "task_class": f"concurrent-class-{i}",
                    "timeout": 300,
                },
            )
            task_ids.append(task_resp.json()["task"]["id"])

        # Claim tasks sequentially
        for task_id in task_ids:
            claim_resp = client.post(f"/api/tasks/{task_id}/claim")
            assert claim_resp.status_code == 200
            assert claim_resp.json()["task"]["status"] == "running"

        # Verify all are running
        list_resp = client.get(f"/api/tasks?queue_id={queue_id}")
        tasks = list_resp.json()["tasks"]
        assert all(t["status"] == "running" for t in tasks)

    def test_mixed_operations_sequence(self, client):
        """
        Test mixed sequence of create, claim, complete operations
        """
        # Setup
        session_resp = client.post(
            "/api/sessions", json={"name": "mixed-session"}
        )
        session_id = session_resp.json()["session"]["id"]

        stream_resp = client.post(
            "/api/streams",
            json={"session_id": session_id, "name": "mixed-queue"},
        )
        queue_id = stream_resp.json()["queue"]["id"]

        # Create first task
        task1_resp = client.post(
            "/api/tasks",
            json={
                "queue_id": queue_id,
                "tool_name": "mixed-tool-1",
                "task_class": "mixed-class",
                "timeout": 300,
            },
        )
        task1_id = task1_resp.json()["task"]["id"]

        # Claim first task
        client.post(f"/api/tasks/{task1_id}/claim")

        # Create second task while first is running
        task2_resp = client.post(
            "/api/tasks",
            json={
                "queue_id": queue_id,
                "tool_name": "mixed-tool-2",
                "task_class": "mixed-class",
                "timeout": 300,
            },
        )
        task2_id = task2_resp.json()["task"]["id"]

        # Complete first task
        client.post(
            f"/api/tasks/{task1_id}/complete", json={"result_summary": "Done"}
        )

        # Claim second task
        client.post(f"/api/tasks/{task2_id}/claim")

        # Verify states
        task1_get = client.get(f"/api/tasks/{task1_id}")
        task2_get = client.get(f"/api/tasks/{task2_id}")

        assert task1_get.json()["task"]["status"] == "succeeded"
        assert task2_get.json()["task"]["status"] == "running"


class TestDataIntegrityUnderLoad:
    """Test data integrity under load conditions"""

    def test_task_attempt_tracking_under_load(self, client):
        """
        Test that task attempts are tracked correctly under load
        """
        # Setup
        session_resp = client.post(
            "/api/sessions", json={"name": "attempt-session"}
        )
        session_id = session_resp.json()["session"]["id"]

        stream_resp = client.post(
            "/api/streams",
            json={"session_id": session_id, "name": "attempt-queue"},
        )
        queue_id = stream_resp.json()["queue"]["id"]

        # Create task
        task_resp = client.post(
            "/api/tasks",
            json={
                "queue_id": queue_id,
                "tool_name": "attempt-tool",
                "task_class": "attempt-class",
                "timeout": 300,
            },
        )
        task_id = task_resp.json()["task"]["id"]

        # Claim and fail multiple times
        for i in range(3):
            client.post(f"/api/tasks/{task_id}/claim")
            client.post(
                f"/api/tasks/{task_id}/fail",
                json={"error_message": f"Attempt {i+1} failed"},
            )
            if i < 2:  # Requeue for next attempt
                client.post(f"/api/tasks/{task_id}/requeue")

        # Get final task state
        final_resp = client.get(f"/api/tasks/{task_id}")
        task = final_resp.json()["task"]

        assert task["status"] == "failed"

    def test_stream_task_count_consistency(self, client):
        """
        Test that task counts are consistent for streams
        """
        # Setup
        session_resp = client.post(
            "/api/sessions", json={"name": "count-session"}
        )
        session_id = session_resp.json()["session"]["id"]

        stream_resp = client.post(
            "/api/streams",
            json={"session_id": session_id, "name": "count-queue"},
        )
        queue_id = stream_resp.json()["queue"]["id"]

        # Create tasks in batches
        total_created = 0
        for batch in range(3):
            for i in range(10):
                client.post(
                    "/api/tasks",
                    json={
                        "queue_id": queue_id,
                        "tool_name": f"count-tool-{batch}-{i}",
                        "task_class": "count-class",
                        "timeout": 300,
                    },
                )
                total_created += 1

            # Verify count after each batch
            list_resp = client.get(f"/api/tasks?queue_id={queue_id}")
            tasks = list_resp.json()["tasks"]
            assert len(tasks) == total_created
            assert all(t["queue_id"] == queue_id for t in tasks)
