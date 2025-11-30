import json
import re
from datetime import datetime

import pytest

try:
    from src.models import (
        Project,
        Session,
        Stream,
        Task,
        TaskClass,
        TaskStatus,
        SessionStatus,
        StreamStatus,
        gen_project_id,
        gen_session_id,
        gen_stream_id,
        gen_task_id,
    )
except ImportError:
    from src.models import Project, Session, Stream, Task, TaskClass, TaskStatus, SessionStatus, StreamStatus
    from src.storage import gen_project_id, gen_session_id, gen_stream_id, gen_task_id

pytestmark = pytest.mark.unit


def _assert_id_format(value: str, prefix: str) -> None:
    assert value.startswith(prefix)
    assert len(value) == len(prefix) + 12  # prefix + 12 hex chars = 16 total
    assert re.match(rf"^{re.escape(prefix)}[0-9a-f]{{12}}$", value)


class TestIDGeneration:
    def test_gen_project_id_format(self):
        _assert_id_format(gen_project_id(), "prj_")

    def test_gen_session_id_format(self):
        _assert_id_format(gen_session_id(), "ses_")

    def test_gen_stream_id_format(self):
        _assert_id_format(gen_stream_id(), "str_")

    def test_gen_task_id_format(self):
        _assert_id_format(gen_task_id(), "tsk_")

    def test_id_generators_produce_unique_values(self):
        generators = [gen_project_id, gen_session_id, gen_stream_id, gen_task_id]
        for generator in generators:
            ids = {generator() for _ in range(100)}
            assert len(ids) == 100


class TestProjectModel:
    def test_project_creation_without_prd_path(self):
        timestamp = datetime.utcnow()
        project = Project(
            id="prj_deadbeef",
            name="Test Project",
            created_at=timestamp,
            updated_at=timestamp,
        )

        assert project.repo_path is None
        assert project.prd_path is None
        assert project.id == "prj_deadbeef"

    def test_project_creation_with_prd_path(self):
        timestamp = datetime.utcnow()
        project = Project(
            id="prj_feedbabe",
            name="Project With PRD",
            repo_path="/repo/path",
            prd_path="/prd/path",
            created_at=timestamp,
            updated_at=timestamp,
        )

        assert project.repo_path == "/repo/path"
        assert project.prd_path == "/prd/path"

    def test_project_json_serialization(self):
        timestamp = datetime(2024, 1, 1, 12, 30, 0)
        project = Project(
            id="prj_cafed00d",
            name="Serializable Project",
            repo_path="/repo",
            prd_path=None,
            created_at=timestamp,
            updated_at=timestamp,
        )

        to_json = project.model_dump_json if hasattr(project, "model_dump_json") else project.json
        serialized = json.loads(to_json())

        assert serialized["id"] == "prj_cafed00d"
        assert serialized["name"] == "Serializable Project"
        assert serialized["created_at"] == timestamp.isoformat()
        assert serialized["updated_at"] == timestamp.isoformat()


class TestSessionModel:
    def test_session_default_status_active(self):
        timestamp = datetime.utcnow()
        session = Session(
            id="ses_deadbeef",
            project_id="prj_deadbeef",
            name="Default Session",
            started_at=timestamp,
            created_at=timestamp,
            updated_at=timestamp,
        )

        assert session.status == SessionStatus.ACTIVE
        assert session.ended_at is None

    def test_session_accepts_enum_status_values(self):
        timestamp = datetime.utcnow()
        session = Session(
            id="ses_feedbabe",
            project_id="prj_feedbabe",
            name="Ended Session",
            status=SessionStatus.ENDED,
            started_at=timestamp,
            ended_at=timestamp,
            created_at=timestamp,
            updated_at=timestamp,
        )

        assert session.status == SessionStatus.ENDED
        assert session.ended_at == timestamp


class TestStreamModel:
    def test_stream_creation_with_instructions(self):
        timestamp = datetime.utcnow()
        queue = Stream(
            id="str_deadbeef",
            session_id="ses_deadbeef",
            name="Stream With Instructions",
            instructions="Be thorough and concise.",
            created_at=timestamp,
            updated_at=timestamp,
        )

        assert queue.instructions == "Be thorough and concise."
        assert queue.status == StreamStatus.ACTIVE

    def test_stream_allows_optional_instructions(self):
        timestamp = datetime.utcnow()
        queue = Stream(
            id="str_feedbabe",
            session_id="ses_feedbabe",
            name="Instructionless Stream",
            created_at=timestamp,
            updated_at=timestamp,
        )

        assert queue.instructions is None
        assert queue.status == StreamStatus.ACTIVE


class TestTaskModel:
    def test_task_creation_defaults(self):
        timestamp = datetime.utcnow()
        task = Task(
            id="tsk_deadbeef",
            queue_id="str_deadbeef",
            tool_name="echo",
            task_class=TaskClass.FAST_SCRIPT,
            payload='{"echo": "hello"}',
            timeout=30,
            created_at=timestamp,
            updated_at=timestamp,
        )

        assert task.status == TaskStatus.QUEUED
        assert task.attempts == 0
        assert task.result is None
        assert task.error is None
        assert task.started_at is None

    def test_task_status_transitions(self):
        timestamp = datetime.utcnow()
        task = Task(
            id="tsk_feedbabe",
            queue_id="str_feedbabe",
            tool_name="echo",
            task_class=TaskClass.MEDIUM_SCRIPT,
            payload="{}",
            timeout=60,
            created_at=timestamp,
            updated_at=timestamp,
        )

        task.status = TaskStatus.RUNNING
        assert task.status == TaskStatus.RUNNING

        task.status = TaskStatus.SUCCEEDED
        task.result = '{"status": "ok"}'
        assert task.status == TaskStatus.SUCCEEDED
        assert task.result == '{"status": "ok"}'

        task.status = TaskStatus.FAILED
        task.error = "Something went wrong"
        assert task.status == TaskStatus.FAILED
        assert task.error == "Something went wrong"

    def test_task_payload_serialization(self):
        timestamp = datetime.utcnow()
        payload = {"query": "SELECT * FROM table"}
        payload_json = json.dumps(payload)
        task = Task(
            id="tsk_cafed00d",
            queue_id="str_cafed00d",
            tool_name="sql_runner",
            task_class=TaskClass.LLM_LITE,
            payload=payload_json,
            timeout=120,
            created_at=timestamp,
            updated_at=timestamp,
        )

        to_dict = task.model_dump if hasattr(task, "model_dump") else task.dict
        serialized = to_dict()
        assert serialized["payload"] == payload_json
        assert json.loads(serialized["payload"]) == payload

        to_json = task.model_dump_json if hasattr(task, "model_dump_json") else task.json
        serialized_json = json.loads(to_json())
        assert serialized_json["payload"] == payload_json
