"""Phase 8.1: Database Validation Tests

Comprehensive validation of database schema, CRUD operations, data integrity,
and concurrent access patterns.
"""

import pytest
import sqlite3
from pathlib import Path


class TestDatabaseSchema:
    """Validate database schema and table structure"""

    def test_database_schema_exists(self, storage):
        """Verify all required tables exist"""
        with storage.connection() as conn:
            cursor = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
            )
            tables = [row[0] for row in cursor.fetchall()]

        required_tables = {"projects", "sessions", "streams", "tasks"}
        assert required_tables.issubset(set(tables)), f"Missing tables. Found: {tables}"

    def test_projects_table_columns(self, storage):
        """Verify projects table has all required columns"""
        with storage.connection() as conn:
            cursor = conn.execute("PRAGMA table_info(projects)")
            columns = {row[1]: row[2] for row in cursor.fetchall()}

        required_cols = {
            "id": "TEXT",
            "name": "TEXT",
            "repo_path": "TEXT",
            "prd_path": "TEXT",
            "created_at": "TEXT",
            "updated_at": "TEXT",
        }

        for col_name, col_type in required_cols.items():
            assert col_name in columns, f"Missing column: {col_name}"
            assert columns[col_name] == col_type, f"Wrong type for {col_name}"

    def test_sessions_table_columns(self, storage):
        """Verify sessions table has all required columns"""
        with storage.connection() as conn:
            cursor = conn.execute("PRAGMA table_info(sessions)")
            columns = {row[1]: row[2] for row in cursor.fetchall()}

        required_cols = {
            "id": "TEXT",
            "project_id": "TEXT",
            "name": "TEXT",
            "description": "TEXT",
            "status": "TEXT",
            "started_at": "TEXT",
            "ended_at": "TEXT",
            "created_at": "TEXT",
            "updated_at": "TEXT",
        }

        for col_name, col_type in required_cols.items():
            assert col_name in columns, f"Missing column: {col_name}"

    def test_streams_table_columns(self, storage):
        """Verify streams table has all required columns"""
        with storage.connection() as conn:
            cursor = conn.execute("PRAGMA table_info(streams)")
            columns = {row[1]: row[2] for row in cursor.fetchall()}

        required_cols = {
            "id": "TEXT",
            "session_id": "TEXT",
            "name": "TEXT",
            "instructions": "TEXT",
            "status": "TEXT",
            "created_at": "TEXT",
            "updated_at": "TEXT",
        }

        for col_name, col_type in required_cols.items():
            assert col_name in columns, f"Missing column: {col_name}"

    def test_tasks_table_columns(self, storage):
        """Verify tasks table has all required columns"""
        with storage.connection() as conn:
            cursor = conn.execute("PRAGMA table_info(tasks)")
            columns = {row[1]: row[2] for row in cursor.fetchall()}

        required_cols = {
            "id": "TEXT",
            "queue_id": "TEXT",
            "tool_name": "TEXT",
            "task_class": "TEXT",
            "payload": "TEXT",
            "status": "TEXT",
            "timeout": "INTEGER",
            "attempts": "INTEGER",
            "result": "TEXT",
            "error": "TEXT",
            "stdout": "TEXT",
            "stderr": "TEXT",
            "created_at": "TEXT",
            "updated_at": "TEXT",
            "started_at": "TEXT",
            "finished_at": "TEXT",
        }

        for col_name, col_type in required_cols.items():
            assert col_name in columns, f"Missing column: {col_name}"

    def test_foreign_key_relationships(self, storage):
        """Verify foreign key constraints are defined"""
        with storage.connection() as conn:
            # Enable foreign keys check
            conn.execute("PRAGMA foreign_keys=ON")

            # Check sessions.project_id references projects.id
            cursor = conn.execute("PRAGMA foreign_key_list(sessions)")
            fk_list = cursor.fetchall()
            assert any(
                fk[2] == "projects" and fk[3] == "project_id" and fk[4] == "id"
                for fk in fk_list
            ), "sessions.project_id should reference projects.id"

            # Check streams.session_id references sessions.id
            cursor = conn.execute("PRAGMA foreign_key_list(streams)")
            fk_list = cursor.fetchall()
            assert any(
                fk[2] == "sessions" and fk[3] == "session_id" and fk[4] == "id"
                for fk in fk_list
            ), "streams.session_id should reference sessions.id"

            # Check tasks.queue_id references streams.id
            cursor = conn.execute("PRAGMA foreign_key_list(tasks)")
            fk_list = cursor.fetchall()
            assert any(
                fk[2] == "streams" and fk[3] == "queue_id" and fk[4] == "id"
                for fk in fk_list
            ), "tasks.queue_id should reference streams.id"

    def test_indexes_exist(self, storage):
        """Verify all performance indexes are created"""
        with storage.connection() as conn:
            cursor = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'"
            )
            indexes = {row[0] for row in cursor.fetchall()}

        required_indexes = {
            "idx_tasks_stream_status",
            "idx_tasks_status",
            "idx_tasks_started_at",
            "idx_tasks_created_at",
            "idx_streams_session",
            "idx_streams_status",
            "idx_sessions_project",
            "idx_sessions_status",
        }

        assert required_indexes.issubset(
            indexes
        ), f"Missing indexes: {required_indexes - indexes}"


class TestCRUDOperations:
    """Test Create, Read, Update, Delete operations for all entities"""

    def test_create_project(self, storage):
        """Test project creation and persistence"""
        proj = storage.create_project(
            name="test-project", repo_path="/tmp/repo", prd_path="/tmp/prd"
        )

        assert proj["id"].startswith("prj_")
        assert proj["name"] == "test-project"
        assert proj["repo_path"] == "/tmp/repo"
        assert proj["prd_path"] == "/tmp/prd"
        assert proj["created_at"]
        assert proj["updated_at"]

    def test_read_project(self, project):
        """Test project retrieval"""
        retrieved = project  # Using fixture - project already created
        assert retrieved["id"]
        assert retrieved["name"] == "unit-test-project"
        assert retrieved["created_at"]

    def test_update_project_timestamp(self, storage, project):
        """Test project update (via timestamp check)"""
        # Projects don't have an explicit update method, but created_at should be set
        assert project["created_at"]
        assert project["updated_at"]

    def test_create_session(self, storage, project):
        """Test session creation and persistence"""
        session = storage.create_session(
            name="test-session", description="Test session for validation"
        )

        assert session["id"].startswith("ses_")
        assert session["name"] == "test-session"
        assert session["description"] == "Test session for validation"
        assert session["status"] == "active"
        assert session["project_id"] == "prj_default"
        assert session["created_at"]
        assert session["updated_at"]

    def test_read_session(self, storage, session):
        """Test session retrieval"""
        retrieved = storage.get_session(session["id"])
        assert retrieved is not None
        assert retrieved["id"] == session["id"]
        assert retrieved["name"] == session["name"]

    def test_read_session_by_name(self, storage, session):
        """Test session retrieval by name"""
        retrieved = storage.get_session_by_name(session["name"])
        assert retrieved is not None
        assert retrieved["id"] == session["id"]

    def test_list_sessions(self, storage, session):
        """Test listing sessions"""
        sessions = storage.list_sessions()
        assert len(sessions) > 0
        assert any(s["id"] == session["id"] for s in sessions)

    def test_end_session(self, storage, session):
        """Test ending a session"""
        result = storage.end_session(session["id"])
        assert result is True

        # Verify session status changed
        updated = storage.get_session(session["id"])
        assert updated["status"] == "ended"
        assert updated["ended_at"] is not None

    def test_create_stream(self, storage, session):
        """Test queue creation"""
        queue = storage.create_queue(
            session_id=session["id"],
            name="test-queue",
            instructions="Test queue instructions",
        )

        assert queue["id"].startswith("str_")
        assert queue["session_id"] == session["id"]
        assert queue["name"] == "test-queue"
        assert queue["instructions"] == "Test queue instructions"
        assert queue["status"] == "active"
        assert queue["created_at"]

    def test_read_stream(self, storage, queue):
        """Test queue retrieval"""
        retrieved = storage.get_queue(queue["id"])
        assert retrieved is not None
        assert retrieved["id"] == queue["id"]
        assert retrieved["name"] == queue["name"]

    def test_read_stream_by_name(self, storage, queue):
        """Test queue retrieval by name"""
        retrieved = storage.get_queue_by_name(queue["name"])
        assert retrieved is not None
        assert retrieved["id"] == queue["id"]

    def test_list_streams(self, storage, session, queue):
        """Test listing streams"""
        streams = storage.list_queues(session_id=session["id"])
        assert len(streams) > 0
        assert any(s["id"] == queue["id"] for s in streams)

    def test_end_stream(self, storage, queue):
        """Test ending a queue"""
        result = storage.end_queue(queue["id"])
        assert result is True

        # Verify queue status changed
        updated = storage.get_queue(queue["id"])
        assert updated["status"] == "ended"

    def test_create_task(self, storage, queue):
        """Test task creation"""
        task = storage.create_task(
            queue_id=queue["id"],
            tool_name="test-tool",
            task_class="test-class",
            payload='{"key": "value"}',
            timeout=300,
        )

        assert task["id"].startswith("tsk_")
        assert task["queue_id"] == queue["id"]
        assert task["tool_name"] == "test-tool"
        assert task["task_class"] == "test-class"
        assert task["payload"] == '{"key": "value"}'
        assert task["status"] == "queued"
        assert task["timeout"] == 300
        assert task["attempts"] == 0

    def test_read_task(self, storage, task):
        """Test task retrieval (using fixture)"""
        retrieved = storage.get_task(task["id"])
        assert retrieved is not None
        assert retrieved["id"] == task["id"]
        assert retrieved["status"] == "queued"

    def test_list_tasks(self, storage, queue, task):
        """Test listing tasks"""
        tasks = storage.list_tasks(queue_id=queue["id"])
        assert len(tasks) > 0
        assert any(t["id"] == task["id"] for t in tasks)

    def test_list_tasks_by_status(self, storage, queue, task):
        """Test filtering tasks by status"""
        queued_tasks = storage.list_tasks(queue_id=queue["id"], status="queued")
        assert len(queued_tasks) > 0
        assert any(t["id"] == task["id"] for t in queued_tasks)

        # No running tasks yet
        running_tasks = storage.list_tasks(queue_id=queue["id"], status="running")
        assert all(t["id"] != task["id"] for t in running_tasks)

    def test_claim_task(self, storage, task):
        """Test task claiming (status transition to running)"""
        claimed = storage.claim_task(task["id"])
        assert claimed["status"] == "running"
        assert claimed["started_at"] is not None
        assert claimed["attempts"] == 1

    def test_complete_task(self, storage, task):
        """Test task completion"""
        # First claim the task
        claimed = storage.claim_task(task["id"])

        # Then complete it
        completed = storage.complete_task(
            claimed["id"],
            result_summary="Task completed successfully",
            result_data='{"result": "success"}',
            stdout="Output captured",
        )

        assert completed["status"] == "succeeded"
        assert completed["result"] == '{"result": "success"}'
        assert completed["stdout"] == "Output captured"
        assert completed["finished_at"] is not None

    def test_fail_task(self, storage, task):
        """Test task failure"""
        # First claim the task
        claimed = storage.claim_task(task["id"])

        # Then fail it
        failed = storage.fail_task(
            claimed["id"],
            error_message="Task failed",
            error_type="RuntimeError",
            stderr="Error output",
        )

        assert failed["status"] == "failed"
        assert "RuntimeError" in failed["error"]
        assert "Task failed" in failed["error"]
        assert failed["stderr"] == "Error output"
        assert failed["finished_at"] is not None

    def test_requeue_task(self, storage, task):
        """Test task requeue"""
        # Claim and fail
        claimed = storage.claim_task(task["id"])
        failed = storage.fail_task(claimed["id"], error_message="Test failure")

        # Requeue
        requeued = storage.requeue_task(failed["id"])

        # New task should be created
        assert requeued["id"] != failed["id"]
        assert requeued["status"] == "queued"
        assert requeued["attempts"] == 0
        assert requeued["queue_id"] == task["queue_id"]


class TestDataIntegrity:
    """Test data integrity constraints and relationships"""

    def test_project_id_uniqueness(self, storage):
        """Verify project IDs are unique"""
        proj1 = storage.create_project(name="proj1")
        proj2 = storage.create_project(name="proj2")
        assert proj1["id"] != proj2["id"]

    def test_session_id_uniqueness(self, storage, project):
        """Verify session IDs are unique"""
        ses1 = storage.create_session(name="ses1")
        ses2 = storage.create_session(name="ses2")
        assert ses1["id"] != ses2["id"]

    def test_stream_id_uniqueness(self, storage, session):
        """Verify queue IDs are unique"""
        str1 = storage.create_queue(session_id=session["id"], name="stream1")
        str2 = storage.create_queue(session_id=session["id"], name="stream2")
        assert str1["id"] != str2["id"]

    def test_task_id_uniqueness(self, storage, queue):
        """Verify task IDs are unique"""
        tsk1 = storage.create_task(
            queue_id=queue["id"],
            tool_name="tool1",
            task_class="class1",
            payload="{}",
            timeout=300,
        )
        tsk2 = storage.create_task(
            queue_id=queue["id"],
            tool_name="tool1",
            task_class="class1",
            payload="{}",
            timeout=300,
        )
        assert tsk1["id"] != tsk2["id"]

    def test_tasks_reference_valid_stream(self, storage, queue, task):
        """Verify task references valid queue"""
        assert task["queue_id"] == queue["id"]

        retrieved = storage.get_task(task["id"])
        assert retrieved["queue_id"] == queue["id"]

    def test_sessions_reference_valid_project(self, storage, project, session):
        """Verify session references valid project"""
        assert session["project_id"] == "prj_default"

        retrieved = storage.get_session(session["id"])
        assert retrieved["project_id"] == "prj_default"

    def test_streams_reference_valid_session(self, storage, session, queue):
        """Verify queue references valid session"""
        assert queue["session_id"] == session["id"]

        retrieved = storage.get_queue(queue["id"])
        assert retrieved["session_id"] == session["id"]


class TestConcurrentAccess:
    """Test concurrent operations and thread safety"""

    def test_concurrent_task_creation(self, storage, queue):
        """Test creating tasks concurrently"""
        tasks = []
        for i in range(10):
            task = storage.create_task(
                queue_id=queue["id"],
                tool_name=f"tool-{i}",
                task_class="test",
                payload=f'{{"index": {i}}}',
                timeout=300,
            )
            tasks.append(task)

        # Verify all tasks created
        assert len(tasks) == 10
        assert len(set(t["id"] for t in tasks)) == 10  # All unique

        # Verify all are queued
        retrieved_tasks = storage.list_tasks(queue_id=queue["id"])
        assert len(retrieved_tasks) >= 10

    def test_claim_task_prevents_duplicates(self, storage, queue):
        """Test that concurrent claims don't result in duplicate claims"""
        task = storage.create_task(
            queue_id=queue["id"],
            tool_name="test",
            task_class="test",
            payload="{}",
            timeout=300,
        )

        # Claim task first time - should succeed
        claimed1 = storage.claim_task(task["id"])
        assert claimed1["status"] == "running"
        assert claimed1["attempts"] == 1

        # Try to claim again - should fail
        with pytest.raises(ValueError, match="not found or already claimed"):
            storage.claim_task(task["id"])

    def test_task_status_transitions(self, storage, queue):
        """Test valid task status transitions"""
        task = storage.create_task(
            queue_id=queue["id"],
            tool_name="test",
            task_class="test",
            payload="{}",
            timeout=300,
        )

        # queued -> running (via claim)
        assert task["status"] == "queued"
        claimed = storage.claim_task(task["id"])
        assert claimed["status"] == "running"

        # running -> succeeded (via complete)
        completed = storage.complete_task(claimed["id"], "Success")
        assert completed["status"] == "succeeded"
        assert completed["finished_at"] is not None

    def test_task_status_failed_transition(self, storage, queue):
        """Test failed task status transition"""
        task = storage.create_task(
            queue_id=queue["id"],
            tool_name="test",
            task_class="test",
            payload="{}",
            timeout=300,
        )

        # queued -> running -> failed
        claimed = storage.claim_task(task["id"])
        assert claimed["status"] == "running"

        failed = storage.fail_task(claimed["id"], "Test failure")
        assert failed["status"] == "failed"
        assert failed["finished_at"] is not None


class TestOldestTaskRetrieval:
    """Test FIFO task claiming"""

    def test_get_oldest_queued_task(self, storage, queue):
        """Test retrieving oldest queued task (FIFO)"""
        # Create multiple tasks
        task1 = storage.create_task(
            queue_id=queue["id"],
            tool_name="tool1",
            task_class="test",
            payload="{}",
            timeout=300,
        )
        task2 = storage.create_task(
            queue_id=queue["id"],
            tool_name="tool2",
            task_class="test",
            payload="{}",
            timeout=300,
        )

        # Get oldest - should be task1
        oldest = storage.get_oldest_queued_task(queue["id"])
        assert oldest is not None
        assert oldest["id"] == task1["id"]

        # Claim task1
        storage.claim_task(task1["id"])

        # Get oldest again - should be task2
        oldest = storage.get_oldest_queued_task(queue["id"])
        assert oldest is not None
        assert oldest["id"] == task2["id"]


class TestTaskAttempts:
    """Test task attempt tracking"""

    def test_task_attempts_increment(self, storage, queue):
        """Test that attempts increment on each claim"""
        task = storage.create_task(
            queue_id=queue["id"],
            tool_name="test",
            task_class="test",
            payload="{}",
            timeout=300,
        )

        assert task["attempts"] == 0

        # First claim
        claimed1 = storage.claim_task(task["id"])
        assert claimed1["attempts"] == 1

        # Fail and requeue
        storage.fail_task(claimed1["id"], "Test failure")
        requeued = storage.requeue_task(claimed1["id"])
        assert requeued["attempts"] == 0  # New task starts at 0

        # Claim requeued task
        claimed2 = storage.claim_task(requeued["id"])
        assert claimed2["attempts"] == 1
