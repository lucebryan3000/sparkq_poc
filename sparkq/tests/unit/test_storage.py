import sqlite3
import time

import pytest

from src.errors import ValidationError

class TestStorageInit:
    def test_creates_expected_tables(self, storage):
        with storage.connection() as conn:
            rows = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
        table_names = {row["name"] for row in rows}
        assert {"projects", "sessions", "queues", "tasks"}.issubset(table_names)

    def test_enables_wal_mode(self, storage):
        with storage.connection() as conn:
            row = conn.execute("PRAGMA journal_mode").fetchone()
        assert row[0].lower() == "wal"


class TestProjectOperations:
    def test_create_project_persists_record(self, storage):
        project = storage.create_project(
            name="alpha-project",
            repo_path="/tmp/repo",
            prd_path="/tmp/prd",
        )

        assert project["id"].startswith("prj_")
        assert project["name"] == "alpha-project"
        assert project["created_at"].endswith("Z")
        assert project["updated_at"].endswith("Z")

        with storage.connection() as conn:
            row = conn.execute("SELECT * FROM projects WHERE id = ?", (project["id"],)).fetchone()
        assert row is not None
        assert row["name"] == "alpha-project"
        assert row["repo_path"] == "/tmp/repo"
        assert row["prd_path"] == "/tmp/prd"

    def test_get_project_returns_created_project(self, storage):
        project = storage.create_project(name="primary")

        retrieved = storage.get_project()
        assert retrieved is not None
        assert retrieved["id"] == "prj_default"
        assert retrieved["name"] == "default"

    def test_get_project_prefers_first_when_multiple_exist(self, storage):
        first = storage.create_project(name="first")
        storage.create_project(name="second")

        retrieved = storage.get_project()
        assert retrieved is not None
        assert retrieved["id"] == "prj_default"

        with storage.connection() as conn:
            count = conn.execute("SELECT COUNT(*) AS total FROM projects").fetchone()["total"]
        assert count == 3


class TestSessionOperations:
    def test_create_session_adds_active_record(self, storage, project):
        session = storage.create_session(name="session-one", description="first session")

        assert session["id"].startswith("ses_")
        assert session["project_id"] == "prj_default"
        assert session["status"] == "active"
        assert session["started_at"].endswith("Z")
        assert session["ended_at"] is None

        with storage.connection() as conn:
            row = conn.execute("SELECT * FROM sessions WHERE id = ?", (session["id"],)).fetchone()
        assert row is not None
        assert row["name"] == "session-one"
        assert row["status"] == "active"

    def test_list_sessions_returns_newest_first(self, storage, project):
        first = storage.create_session(name="first")
        time.sleep(0.01)
        second = storage.create_session(name="second")

        sessions = storage.list_sessions()
        assert [s["id"] for s in sessions][:2] == [second["id"], first["id"]]

    def test_list_sessions_filters_by_status(self, storage, project):
        active = storage.create_session(name="active-session")
        ended = storage.create_session(name="ended-session")
        storage.end_session(ended["id"])

        ended_sessions = storage.list_sessions(status="ended")
        assert [s["id"] for s in ended_sessions] == [ended["id"]]

        active_sessions = storage.list_sessions(status="active")
        active_ids = {s["id"] for s in active_sessions}
        assert active["id"] in active_ids
        assert ended["id"] not in active_ids

    def test_get_session_by_name_returns_match(self, storage, project):
        session = storage.create_session(name="lookup-session")

        retrieved = storage.get_session_by_name("lookup-session")
        assert retrieved is not None
        assert retrieved["id"] == session["id"]
        assert retrieved["name"] == session["name"]

    def test_end_session_updates_status(self, storage, project):
        session = storage.create_session(name="to-end")

        ended = storage.end_session(session["id"])
        assert ended is True

        updated = storage.get_session(session["id"])
        assert updated["status"] == "ended"

    def test_end_session_sets_ended_timestamp(self, storage, project):
        session = storage.create_session(name="session-with-end")
        storage.end_session(session["id"])

        updated = storage.get_session(session["id"])
        assert updated["ended_at"] is not None
        assert updated["ended_at"].endswith("Z")


class TestQueueOperations:
    def test_create_queue_for_session(self, storage, session):
        queue = storage.create_queue(
            session_id=session["id"],
            name="queue-alpha",
            instructions="do something",
        )

        assert queue["id"].startswith("que_")
        assert queue["session_id"] == session["id"]
        assert queue["status"] == "active"

        with storage.connection() as conn:
            row = conn.execute("SELECT * FROM queues WHERE id = ?", (queue["id"],)).fetchone()
        assert row is not None
        assert row["name"] == "queue-alpha"
        assert row["session_id"] == session["id"]


class TestAgentRoles:
    def test_update_agent_role_updates_fields(self, storage):
        role = storage.get_agent_role_by_key("backend_architect", include_inactive=True)
        assert role is not None

        updated = storage.update_agent_role(
            "backend_architect",
            label="Backend Chief",
            description="Updated description",
            active=False,
        )

        assert updated["label"] == "Backend Chief"
        assert updated["description"] == "Updated description"
        assert updated["active"] is False

        reloaded = storage.get_agent_role_by_key("backend_architect", include_inactive=True)
        assert reloaded["label"] == "Backend Chief"
        assert reloaded["description"] == "Updated description"
        assert reloaded["active"] is False

    def test_update_agent_role_validates_non_empty_fields(self, storage):
        with pytest.raises(ValidationError):
            storage.update_agent_role("backend_architect", label="  ")
        with pytest.raises(ValidationError):
            storage.update_agent_role("backend_architect", description="")

    def test_queue_name_must_be_unique(self, storage, session):
        storage.create_queue(session_id=session["id"], name="unique-queue")
        with pytest.raises(sqlite3.IntegrityError):
            storage.create_queue(session_id=session["id"], name="unique-queue")

    def test_list_queues_filters_by_session(self, storage, project):
        session_one = storage.create_session(name="session-one")
        session_two = storage.create_session(name="session-two")

        first_queue = storage.create_queue(session_id=session_one["id"], name="s-one")
        storage.create_queue(session_id=session_two["id"], name="s-two")
        second_queue = storage.create_queue(session_id=session_one["id"], name="s-three")

        queues = storage.list_queues(session_id=session_one["id"])
        queue_ids = {s["id"] for s in queues}
        assert queue_ids == {first_queue["id"], second_queue["id"]}

    def test_get_queue_by_name(self, storage, session):
        queue = storage.create_queue(session_id=session["id"], name="lookup-queue")

        retrieved = storage.get_queue_by_name("lookup-queue")
        assert retrieved is not None
        assert retrieved["id"] == queue["id"]
        assert retrieved["name"] == "lookup-queue"

    def test_get_queue_names_returns_id_map(self, storage, session):
        queue_one = storage.create_queue(session_id=session["id"], name="queue-one")
        queue_two = storage.create_queue(session_id=session["id"], name="queue-two")

        names = storage.get_queue_names([queue_one["id"], queue_two["id"], queue_one["id"]])

        assert names == {
            queue_one["id"]: "queue-one",
            queue_two["id"]: "queue-two",
        }


class TestTaskOperations:
    def test_create_task_stores_defaults(self, storage, queue):
        task = storage.create_task(
            queue_id=queue["id"],
            tool_name="tool-a",
            task_class="CLASS_A",
            payload="{}",
            timeout=60,
        )

        assert task["id"].startswith("tsk_")
        assert task["status"] == "queued"
        assert task["attempts"] == 0

        with storage.connection() as conn:
            row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task["id"],)).fetchone()
        assert row is not None
        assert row["queue_id"] == queue["id"]
        assert row["task_class"] == "CLASS_A"
        assert row["status"] == "queued"
        assert row["attempts"] == 0

    def test_get_oldest_queued_task_respects_fifo(self, storage, queue):
        first = storage.create_task(
            queue_id=queue["id"],
            tool_name="tool-a",
            task_class="FIRST",
            payload="{}",
            timeout=30,
        )
        second = storage.create_task(
            queue_id=queue["id"],
            tool_name="tool-b",
            task_class="SECOND",
            payload="{}",
            timeout=30,
        )
        third = storage.create_task(
            queue_id=queue["id"],
            tool_name="tool-c",
            task_class="THIRD",
            payload="{}",
            timeout=30,
        )

        with storage.connection() as conn:
            conn.execute(
                "UPDATE tasks SET created_at = ? WHERE id = ?",
                ("2024-01-01T00:00:00Z", first["id"]),
            )
            conn.execute(
                "UPDATE tasks SET created_at = ? WHERE id = ?",
                ("2024-01-01T00:00:01Z", second["id"]),
            )
            conn.execute(
                "UPDATE tasks SET created_at = ? WHERE id = ?",
                ("2024-01-01T00:00:02Z", third["id"]),
            )

        oldest = storage.get_oldest_queued_task(queue["id"])
        assert oldest is not None
        assert oldest["id"] == first["id"]
        assert oldest["status"] == "queued"

    def test_claim_task_sets_running_status_and_attempts(self, storage, queue):
        task = storage.create_task(
            queue_id=queue["id"],
            tool_name="tool-a",
            task_class="CLAIM",
            payload="{}",
            timeout=90,
        )

        claimed = storage.claim_task(task["id"])
        assert claimed["status"] == "running"
        assert claimed["attempts"] == 1
        assert claimed["started_at"] is not None
        assert claimed["updated_at"] >= claimed["started_at"]

        with storage.connection() as conn:
            row = conn.execute("SELECT status, attempts FROM tasks WHERE id = ?", (task["id"],)).fetchone()
        assert row["status"] == "running"
        assert row["attempts"] == 1

    def test_get_oldest_queued_task_returns_none_when_empty(self, storage, queue):
        oldest = storage.get_oldest_queued_task(queue["id"])
        assert oldest is None

    def test_complete_task_transitions_to_succeeded(self, storage, queue):
        task = storage.create_task(
            queue_id=queue["id"],
            tool_name="tool-a",
            task_class="COMPLETE",
            payload="{}",
            timeout=45,
        )
        storage.claim_task(task["id"])

        completed = storage.complete_task(task["id"], result_summary="done", result_data="details")
        assert completed["status"] == "succeeded"
        assert completed["result"] == "details"
        assert completed["finished_at"] is not None

        with storage.connection() as conn:
            row = conn.execute("SELECT status, result FROM tasks WHERE id = ?", (task["id"],)).fetchone()
        assert row["status"] == "succeeded"
        assert row["result"] == "details"

    def test_fail_task_marks_failed_with_error(self, storage, queue):
        task = storage.create_task(
            queue_id=queue["id"],
            tool_name="tool-a",
            task_class="FAIL",
            payload="{}",
            timeout=45,
        )
        storage.claim_task(task["id"])

        failed = storage.fail_task(task["id"], error_message="boom", error_type="IOError")
        assert failed["status"] == "failed"
        assert "IOError" in failed["error"]
        assert failed["finished_at"] is not None

        with storage.connection() as conn:
            row = conn.execute("SELECT status, error FROM tasks WHERE id = ?", (task["id"],)).fetchone()
        assert row["status"] == "failed"
        assert "IOError" in row["error"]

    def test_requeue_task_clones_original(self, storage, queue):
        task = storage.create_task(
            queue_id=queue["id"],
            tool_name="tool-a",
            task_class="REQUEUE",
            payload="{}",
            timeout=30,
        )
        storage.claim_task(task["id"])
        storage.fail_task(task["id"], error_message="temporary issue")

        requeued = storage.requeue_task(task["id"])
        assert requeued["id"] != task["id"]
        assert requeued["status"] == "queued"
        assert requeued["attempts"] == 0
        assert requeued["queue_id"] == task["queue_id"]

        with storage.connection() as conn:
            rows = conn.execute(
                "SELECT status FROM tasks WHERE queue_id = ? ORDER BY created_at ASC",
                (queue["id"],),
            ).fetchall()
        statuses = [row["status"] for row in rows]
        assert statuses.count("queued") == 1
        assert "failed" in statuses

    def test_get_stale_tasks_detects_expired_claims(self, storage, queue):
        task = storage.create_task(
            queue_id=queue["id"],
            tool_name="tool-a",
            task_class="STALE",
            payload="{}",
            timeout=1,
        )

        # Mark task as running with an old claim timestamp
        with storage.connection() as conn:
            conn.execute(
                "UPDATE tasks SET status = 'running', claimed_at = ? WHERE id = ?",
                ("2000-01-01T00:00:00Z", task["id"]),
            )

        stale_tasks = storage.get_stale_tasks(timeout_multiplier=1.0)
        assert len(stale_tasks) == 1
        assert stale_tasks[0]["id"] == task["id"]

    def test_warn_stale_tasks_marks_once(self, storage, queue):
        task = storage.create_task(
            queue_id=queue["id"],
            tool_name="tool-a",
            task_class="STALE",
            payload="{}",
            timeout=1,
        )

        with storage.connection() as conn:
            conn.execute(
                "UPDATE tasks SET status = 'running', claimed_at = ? WHERE id = ?",
                ("2000-01-01T00:00:00Z", task["id"]),
            )

        warned = storage.warn_stale_tasks(timeout_multiplier=1.0)
        assert len(warned) == 1
        first_warning = warned[0]["stale_warned_at"]
        assert first_warning is not None

        warned_again = storage.warn_stale_tasks(timeout_multiplier=1.0)
        assert warned_again == []

        updated = storage.get_task(task["id"])
        assert updated["stale_warned_at"] == first_warning

    def test_get_stale_tasks_propagates_db_errors(self, storage, monkeypatch):
        def boom(*args, **kwargs):
            raise sqlite3.OperationalError("db locked")

        monkeypatch.setattr(storage, "connection", boom)

        with pytest.raises(sqlite3.OperationalError):
            storage.get_stale_tasks()

    def test_list_tasks_enforces_max_limit(self, storage, queue):
        storage.max_task_list_limit = 3
        for i in range(5):
            storage.create_task(
                queue_id=queue["id"],
                tool_name=f"tool-{i}",
                task_class="LIMIT",
                payload="{}",
                timeout=10,
            )

        tasks = storage.list_tasks(queue_id=queue["id"], status=None, limit=None)
        assert len(tasks) == 3

    def test_get_queue_stats_returns_counts(self, storage, queue):
        # create tasks with different statuses
        storage.create_task(queue_id=queue["id"], tool_name="t1", task_class="A", payload="{}", timeout=10)
        running = storage.create_task(queue_id=queue["id"], tool_name="t2", task_class="B", payload="{}", timeout=10)
        queued = storage.create_task(queue_id=queue["id"], tool_name="t3", task_class="C", payload="{}", timeout=10)
        storage.claim_task(running["id"])
        storage.claim_task(queued["id"])
        storage.fail_task(queued["id"], error_message="fail")
        stats = storage.get_queue_stats([queue["id"]])
        assert queue["id"] in stats
        assert stats[queue["id"]]["total"] == 3
        assert stats[queue["id"]]["running"] == 1
        # One task remains queued because only two were claimed above
        assert stats[queue["id"]]["queued"] == 1
        assert stats[queue["id"]]["done"] == 0


class TestTaskCounts:
    def test_count_tasks_by_status(self, storage, queue):
        queued = storage.create_task(
            queue_id=queue["id"],
            tool_name="tool-a",
            task_class="QUEUED",
            payload="{}",
            timeout=10,
        )
        running = storage.create_task(
            queue_id=queue["id"],
            tool_name="tool-b",
            task_class="RUNNING",
            payload="{}",
            timeout=10,
        )
        succeeded = storage.create_task(
            queue_id=queue["id"],
            tool_name="tool-c",
            task_class="SUCCEEDED",
            payload="{}",
            timeout=10,
        )
        failed = storage.create_task(
            queue_id=queue["id"],
            tool_name="tool-d",
            task_class="FAILED",
            payload="{}",
            timeout=10,
        )

        storage.claim_task(running["id"])

        storage.claim_task(succeeded["id"])
        storage.complete_task(succeeded["id"], result_summary="ok", result_data="ok")

        storage.claim_task(failed["id"])
        storage.fail_task(failed["id"], error_message="bad")

        with storage.connection() as conn:
            rows = conn.execute(
                "SELECT status, COUNT(*) AS total FROM tasks GROUP BY status"
            ).fetchall()

        counts = {row["status"]: row["total"] for row in rows}
        assert counts["queued"] == 1
        assert counts["running"] == 1
        assert counts["succeeded"] == 1
        assert counts["failed"] == 1


class TestStorageAdvanced:
    def test_config_entries_and_audit(self, storage, project):
        storage.upsert_config_entry("features", "flags", {"beta": True}, updated_by="tester")
        storage.upsert_config_entry("defaults", "queue", {"priority": "low"}, updated_by="tester")
        entries = storage.list_config_entries()
        assert any(e["namespace"] == "features" and e["key"] == "flags" for e in entries)
        assert storage.count_config_entries() >= 2
        fetched = storage.get_config_entry("features", "flags")
        assert fetched is not None and fetched["value"]["beta"] is True
        exported = storage.export_config()
        assert "features" in exported
        storage.log_audit(actor="tester", action="update.features.flags", details={"beta": True})
        storage.delete_config_entry("features", "flags")
        assert storage.get_config_entry("features", "flags") is None

    def test_task_class_and_tool_crud(self, storage, project):
        storage.upsert_task_class("FAST_TEST", timeout=5, description="fast")
        storage.upsert_task_class("FAST_TEST", timeout=7, description="faster")
        assert storage.get_task_class_record("FAST_TEST")["timeout"] == 7
        assert any(tc["name"] == "FAST_TEST" for tc in storage.list_task_classes())

        storage.upsert_tool_record("run-test", task_class="FAST_TEST", description="desc")
        storage.upsert_tool_record("run-test", task_class="FAST_TEST", description="desc2")
        assert storage.get_tool_record("run-test")["description"] == "desc2"
        assert any(t["name"] == "run-test" for t in storage.list_tools_table())

        storage.delete_tool_record("run-test")
        storage.delete_task_class("FAST_TEST")
        assert storage.get_tool_record("run-test") is None
        assert storage.get_task_class_record("FAST_TEST") is None

    def test_prompt_crud(self, storage, project):
        created = storage.create_prompt("demo-cmd", "Demo", "Template", "Desc")
        prompt_id = created["id"]
        assert storage.get_prompt(prompt_id)["command"] == "demo-cmd"
        assert storage.get_prompt_by_command("demo-cmd")["id"] == prompt_id

        storage.update_prompt(prompt_id, description="Updated")
        updated = storage.get_prompt(prompt_id)
        assert updated["description"] == "Updated"

        prompts = storage.list_prompts()
        assert any(p["id"] == prompt_id for p in prompts)

        storage.delete_prompt(prompt_id)
        assert storage.get_prompt(prompt_id) is None

    def test_queue_archive_unarchive_and_delete(self, storage, session):
        queue = storage.create_queue(session_id=session["id"], name="archive-me")
        storage.archive_queue(queue["id"])
        archived = storage.get_queue(queue["id"])
        assert archived["status"] == "archived"
        storage.unarchive_queue(queue["id"])
        unarchived = storage.get_queue(queue["id"])
        assert unarchived["status"] != "archived"
        storage.end_queue(queue["id"])
        assert storage.get_queue(queue["id"])["status"] == "ended"
        assert storage.delete_queue(queue["id"]) is True

    def test_task_update_and_delete(self, storage, queue):
        task = storage.create_task(
            queue_id=queue["id"],
            tool_name="run-bash",
            task_class="FAST",
            payload="{}",
            timeout=30,
        )
        updated = storage.update_task(task["id"], status="running")
        assert updated["status"] == "running"
        assert storage.delete_task(task["id"]) is True

    def test_stale_and_purge_helpers(self, storage, queue):
        task = storage.create_task(
            queue_id=queue["id"],
            tool_name="run-bash",
            task_class="FAST",
            payload="{}",
            timeout=1,
        )
        old_ts = "2000-01-01T00:00:00Z"
        with storage.connection() as conn:
            conn.execute(
                "UPDATE tasks SET status='running', claimed_at=?, started_at=? WHERE id=?",
                (old_ts, old_ts, task["id"]),
            )
        stale = storage.get_stale_tasks(timeout_multiplier=0.1)
        assert any(t["id"] == task["id"] for t in stale)

        warned = storage.warn_stale_tasks(timeout_multiplier=0.1)
        assert any(t["id"] == task["id"] for t in warned)

        auto_failed = storage.auto_fail_stale_tasks(timeout_multiplier=0.1)
        assert any(t["id"] == task["id"] for t in auto_failed)

        storage.fail_task(task["id"], error_message="failed")
        purged = storage.purge_old_tasks(older_than_days=0)
        assert purged >= 0

    def test_session_deletion_and_init(self, storage):
        storage.init_db()
        session = storage.create_session(name="to-delete")
        assert storage.delete_session(session["id"]) is True

    def test_timeout_and_stale_warning(self, storage, queue):
        task = storage.create_task(
            queue_id=queue["id"],
            tool_name="run-bash",
            task_class="FAST",
            payload="{}",
            timeout=5,
        )
        timeout = storage.get_timeout_for_task(task["id"])
        assert timeout > 0
        warned = storage.mark_stale_warning(task["id"])
        assert warned.get("stale_warned_at") is not None
