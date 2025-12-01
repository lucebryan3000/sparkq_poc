import os
import re
import sys
from pathlib import Path

import pytest
from typer.testing import CliRunner

PROJECT_ROOT = Path(__file__).resolve().parents[3]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src import tools
from src.cli import app, get_storage

pytestmark = pytest.mark.integration

SESSION_ID_RE = re.compile(r"ses_[0-9a-f]{12}")
QUEUE_ID_RE = re.compile(r"que_[0-9a-f]{12}")
TASK_ID_RE = re.compile(r"tsk_[0-9a-f]{12}")


def write_default_config(script_dir: str = "scripts") -> None:
    config = f"""project:
  name: test-project
  repo_path: .
  prd_path: null
server:
  port: 8420
database:
  path: sparkq.db
  mode: wal
script_dirs:
  - {script_dir}
task_classes:
  FAST_SCRIPT: {{ timeout: 30 }}
  MEDIUM_SCRIPT: {{ timeout: 300 }}
  LLM_LITE: {{ timeout: 300 }}
  LLM_HEAVY: {{ timeout: 900 }}
tools:
  run-bash:
    description: Run bash script
    task_class: MEDIUM_SCRIPT
  run-python:
    description: Run python script
    task_class: MEDIUM_SCRIPT
"""
    Path("sparkq.yml").write_text(config)


@pytest.fixture
def cli_runner():
    runner = CliRunner(mix_stderr=False)
    with runner.isolated_filesystem():
        write_default_config()
        # Ensure this isolated config is picked up by path helpers
        from src import paths
        paths.reset_paths_cache()
        os.environ["SPARKQ_CONFIG"] = str(Path.cwd() / "sparkq.yml")
        if str(Path.cwd()) not in sys.path:
            sys.path.insert(0, str(Path.cwd()))
        # Create scripts directory with sample scripts
        Path("scripts").mkdir(parents=True, exist_ok=True)
        Path("scripts/hello.sh").write_text(
            "#!/bin/bash\n"
            "# name: hello-world\n"
            "# description: Says hello\n"
            "# tags: greeting, sample\n"
            "echo \"hello\"\n"
        )
        Path("scripts/cleanup.py").write_text(
            "#!/usr/bin/env python3\n"
            "# name: cleanup-db\n"
            "# description: Cleans the database\n"
            "# tags: maintenance\n"
            "print('cleanup')\n"
        )
        tools._registry = None
        tools.reload_registry()
        get_storage().db_path = "sparkq.db"
        get_storage().init_db()
        get_storage().create_project(name="test-project", repo_path=".", prd_path=None)
        yield runner
        tools._registry = None


def extract_task_id(text: str) -> str:
    match = TASK_ID_RE.search(text)
    assert match, "Task ID not found in output"
    return match.group(0)


def create_session_and_queue(runner: CliRunner, session_name: str, queue_name: str, instructions: str | None = None):
    session_result = runner.invoke(app, ["session", "create", session_name])
    assert session_result.exit_code == 0
    queue_args = ["queue", "create", queue_name, "--session", session_name]
    if instructions:
        queue_args.extend(["--instructions", instructions])
    queue_result = runner.invoke(app, queue_args)
    assert queue_result.exit_code == 0
    return session_result, queue_result


def create_sample_scripts():
    """Create sample scripts - note: cli_runner fixture already creates these"""
    # Scripts are now created by the cli_runner fixture for consistency
    pass


class TestSessionCommands:
    def test_session_create(self, cli_runner: CliRunner):
        result = cli_runner.invoke(app, ["session", "create", "dev-session"])

        assert result.exit_code == 0
        assert "Created session: dev-session" in result.stdout
        assert SESSION_ID_RE.search(result.stdout)

    def test_session_list(self, cli_runner: CliRunner):
        create_result = cli_runner.invoke(app, ["session", "create", "list-session"])
        assert create_result.exit_code == 0

        list_result = cli_runner.invoke(app, ["session", "list"])

        assert list_result.exit_code == 0
        assert "Name" in list_result.stdout
        assert "list-session" in list_result.stdout

    def test_session_end(self, cli_runner: CliRunner):
        create_result = cli_runner.invoke(app, ["session", "create", "end-session"])
        assert create_result.exit_code == 0

        end_result = cli_runner.invoke(app, ["session", "end", "end-session"])

        assert end_result.exit_code == 0
        assert "Ended session: end-session" in end_result.stdout
        ended = get_storage().get_session_by_name("end-session")
        assert ended and ended["status"] == "ended"


class TestQueueCommands:
    def test_queue_create(self, cli_runner: CliRunner):
        session_result = cli_runner.invoke(app, ["session", "create", "queue-session"])
        assert session_result.exit_code == 0

        stream_result = cli_runner.invoke(
            app,
            [
                "queue",
                "create",
                "api-queue",
                "--session",
                "queue-session",
                "--instructions",
                "Build API layer",
            ],
        )

        assert stream_result.exit_code == 0
        assert "Created queue: api-queue" in stream_result.stdout
        assert QUEUE_ID_RE.search(stream_result.stdout)
        assert "Instructions" in stream_result.stdout

    def test_queue_list(self, cli_runner: CliRunner):
        create_session_and_queue(cli_runner, "list-session", "list-queue")

        list_result = cli_runner.invoke(app, ["queue", "list"])

        assert list_result.exit_code == 0
        assert "list-queue" in list_result.stdout
        assert "list-session" in list_result.stdout


class TestTaskCommands:
    def test_enqueue_task(self, cli_runner: CliRunner):
        create_session_and_queue(cli_runner, "task-session", "task-queue")

        result = cli_runner.invoke(
            app,
            [
                "enqueue",
                "--queue",
                "task-queue",
                "--tool",
                "run-bash",
                "--metadata",
                '{"key": "value"}',
            ],
        )

        assert result.exit_code == 0
        task_id = extract_task_id(result.stdout)
        assert task_id.startswith("tsk_")
        assert "task-queue" in result.stdout

    def test_enqueue_invalid_tool(self, cli_runner: CliRunner):
        create_session_and_queue(cli_runner, "task-session", "task-queue")

        result = cli_runner.invoke(
            app,
            [
                "enqueue",
                "--queue",
                "task-queue",
                "--tool",
                "missing-tool",
            ],
        )

        assert result.exit_code == 1
        assert "Tool not found" in result.stderr
        assert "sparkq list tools" in result.stderr

    def test_enqueue_invalid_json(self, cli_runner: CliRunner):
        create_session_and_queue(cli_runner, "task-session", "task-queue")

        result = cli_runner.invoke(
            app,
            [
                "enqueue",
                "--queue",
                "task-queue",
                "--tool",
                "run-bash",
                "--metadata",
                '{"foo": "bar"',
            ],
        )

        assert result.exit_code == 1
        assert "Invalid metadata" in result.stderr
        assert "Provide valid JSON" in result.stderr

    def test_peek_task(self, cli_runner: CliRunner):
        create_session_and_queue(cli_runner, "task-session", "task-queue")
        enqueue_result = cli_runner.invoke(
            app,
            [
                "enqueue",
                "--queue",
                "task-queue",
                "--tool",
                "run-bash",
            ],
        )
        queued_id = extract_task_id(enqueue_result.stdout)

        peek_result = cli_runner.invoke(app, ["peek", "--queue", "task-queue"])

        assert peek_result.exit_code == 0
        peek_id = extract_task_id(peek_result.stdout)
        assert peek_id == queued_id
        assert "run-bash" in peek_result.stdout

    def test_claim_task(self, cli_runner: CliRunner):
        create_session_and_queue(cli_runner, "task-session", "task-queue")
        enqueue_result = cli_runner.invoke(
            app,
            [
                "enqueue",
                "--queue",
                "task-queue",
                "--tool",
                "run-bash",
            ],
        )
        queued_id = extract_task_id(enqueue_result.stdout)

        claim_result = cli_runner.invoke(app, ["claim", "--queue", "task-queue"])

        assert claim_result.exit_code == 0
        claimed_id = extract_task_id(claim_result.stdout)
        assert claimed_id == queued_id
        assert "Queue: task-queue" in claim_result.stdout

    def test_claim_without_stream_errors(self, cli_runner: CliRunner):
        result = cli_runner.invoke(app, ["claim"])

        assert result.exit_code == 1
        assert "Queue is required" in result.stderr
        assert "sparkq queue list" in result.stderr

    def test_complete_task(self, cli_runner: CliRunner):
        create_session_and_queue(cli_runner, "task-session", "task-queue")
        enqueue_result = cli_runner.invoke(
            app,
            [
                "enqueue",
                "--queue",
                "task-queue",
                "--tool",
                "run-bash",
            ],
        )
        task_id = extract_task_id(enqueue_result.stdout)
        claim_result = cli_runner.invoke(app, ["claim", "--queue", "task-queue"])
        assert claim_result.exit_code == 0

        complete_result = cli_runner.invoke(
            app,
            [
                "complete",
                task_id,
                "--result",
                "Work finished",
            ],
        )

        assert complete_result.exit_code == 0
        assert f"Task {task_id} marked as succeeded" in complete_result.stdout
        task = get_storage().get_task(task_id)
        assert task and task["status"] == "succeeded"

    def test_complete_missing_summary(self, cli_runner: CliRunner):
        create_session_and_queue(cli_runner, "task-session", "task-queue")
        enqueue_result = cli_runner.invoke(
            app,
            [
                "enqueue",
                "--queue",
                "task-queue",
                "--tool",
                "run-bash",
            ],
        )
        task_id = extract_task_id(enqueue_result.stdout)
        claim_result = cli_runner.invoke(app, ["claim", "--queue", "task-queue"])
        assert claim_result.exit_code == 0

        complete_result = cli_runner.invoke(
            app,
            [
                "complete",
                task_id,
                "--result",
                "   ",
            ],
        )

        assert complete_result.exit_code == 1
        assert "Result summary is required" in complete_result.stderr
        task = get_storage().get_task(task_id)
        assert task and task["status"] == "running"

    def test_fail_task(self, cli_runner: CliRunner):
        create_session_and_queue(cli_runner, "task-session", "task-queue")
        enqueue_result = cli_runner.invoke(
            app,
            [
                "enqueue",
                "--queue",
                "task-queue",
                "--tool",
                "run-bash",
            ],
        )
        task_id = extract_task_id(enqueue_result.stdout)
        claim_result = cli_runner.invoke(app, ["claim", "--queue", "task-queue"])
        assert claim_result.exit_code == 0

        fail_result = cli_runner.invoke(
            app,
            [
                "fail",
                task_id,
                "--error",
                "boom",
                "--error-type",
                "TEST",
            ],
        )

        assert fail_result.exit_code == 0
        assert f"Task {task_id} marked as failed" in fail_result.stdout
        task = get_storage().get_task(task_id)
        assert task and task["status"] == "failed"

    def test_requeue_task(self, cli_runner: CliRunner):
        create_session_and_queue(cli_runner, "task-session", "task-queue")
        enqueue_result = cli_runner.invoke(
            app,
            [
                "enqueue",
                "--queue",
                "task-queue",
                "--tool",
                "run-bash",
            ],
        )
        task_id = extract_task_id(enqueue_result.stdout)
        claim_result = cli_runner.invoke(app, ["claim", "--queue", "task-queue"])
        assert claim_result.exit_code == 0
        fail_result = cli_runner.invoke(
            app,
            [
                "fail",
                task_id,
                "--error",
                "needs retry",
            ],
        )
        assert fail_result.exit_code == 0

        requeue_result = cli_runner.invoke(app, ["requeue", task_id])

        assert requeue_result.exit_code == 0
        match = re.search(r"Task (tsk_[0-9a-f]{12}) requeued as (tsk_[0-9a-f]{12})", requeue_result.stdout)
        assert match
        assert match.group(1) == task_id
        new_task_id = match.group(2)
        new_task = get_storage().get_task(new_task_id)
        assert new_task and new_task["status"] == "queued"


class TestScriptCommands:
    def test_script_list(self, cli_runner: CliRunner):
        create_sample_scripts()

        result = cli_runner.invoke(app, ["scripts", "list"])

        assert result.exit_code == 0
        assert "hello-world" in result.stdout
        assert "cleanup-db" in result.stdout

    def test_script_search(self, cli_runner: CliRunner):
        create_sample_scripts()

        result = cli_runner.invoke(app, ["scripts", "search", "hello"])

        assert result.exit_code == 0
        assert "hello-world" in result.stdout
        assert "cleanup-db" not in result.stdout


class TestCliRegistration:
    def test_command_help_available(self, cli_runner: CliRunner):
        assert cli_runner.invoke(app, ["setup", "--help"]).exit_code == 0
        assert cli_runner.invoke(app, ["run", "--help"]).exit_code == 0
        assert cli_runner.invoke(app, ["stop", "--help"]).exit_code == 0
        assert cli_runner.invoke(app, ["status", "--help"]).exit_code == 0
        assert cli_runner.invoke(app, ["reload", "--help"]).exit_code == 0
        assert cli_runner.invoke(app, ["queue", "end", "--help"]).exit_code == 0
        assert cli_runner.invoke(app, ["tasks", "--help"]).exit_code == 0
        assert cli_runner.invoke(app, ["task", "--help"]).exit_code == 0
        assert cli_runner.invoke(app, ["purge", "--help"]).exit_code == 0
        assert cli_runner.invoke(app, ["config-export", "--help"]).exit_code == 0


class TestCliBehavior:
    def test_run_invokes_server_with_flags(self, cli_runner: CliRunner, monkeypatch):
        called = {}

        import types

        fake_server = types.SimpleNamespace()

        def fake_run_server(port=None, host=None, background=False):
            called["port"] = port
            called["host"] = host
            called["background"] = background

        fake_server.run_server = fake_run_server
        monkeypatch.setitem(sys.modules, "src.server", fake_server)
        result = cli_runner.invoke(app, ["run", "--port", "9000", "--host", "127.0.0.1", "--foreground"])
        assert result.exit_code == 0
        assert called["port"] == 9000
        assert called["host"] == "127.0.0.1"
        assert called["background"] is False

    def test_reload_reloads_registry(self, cli_runner: CliRunner, monkeypatch):
        called = {"reload": False}

        import types

        fake_tools = types.SimpleNamespace()

        def fake_reload_registry(*_args, **_kwargs):
            called["reload"] = True

        fake_tools.reload_registry = fake_reload_registry
        monkeypatch.setitem(sys.modules, "src.tools", fake_tools)
        result = cli_runner.invoke(app, ["reload"])
        assert result.exit_code == 0
        assert called["reload"] is True

    def test_queue_end_command(self, cli_runner: CliRunner):
        create_session_and_queue(cli_runner, "end-session", "end-queue")
        queue_id = get_storage().get_queue_by_name("end-queue")["id"]
        result = cli_runner.invoke(app, ["queue", "end", queue_id])
        assert result.exit_code == 0
        ended = get_storage().get_queue(queue_id)
        assert ended["status"] == "ended"

    def test_tasks_list_filters(self, cli_runner: CliRunner):
        create_session_and_queue(cli_runner, "tasks-session", "tasks-queue")
        cli_runner.invoke(
            app,
            [
                "enqueue",
                "--queue",
                "tasks-queue",
                "--tool",
                "run-bash",
            ],
        )
        result = cli_runner.invoke(app, ["tasks", "--queue", "tasks-queue"])
        assert result.exit_code == 0
        assert "tasks-queue" in result.stdout

    def test_task_command_placeholder(self, cli_runner: CliRunner):
        result = cli_runner.invoke(app, ["task", "tsk_fake"])
        assert result.exit_code != 0
        assert "not implemented" in result.stdout or "not implemented" in result.stderr

    def test_purge_removes_tasks(self, cli_runner: CliRunner):
        create_session_and_queue(cli_runner, "purge-session", "purge-queue")
        cli_runner.invoke(
            app,
            [
                "enqueue",
                "--queue",
                "purge-queue",
                "--tool",
                "run-bash",
            ],
        )
        tasks = get_storage().list_tasks()
        for t in tasks:
            get_storage().complete_task(t["id"], result_summary="done", result_data="done")

        result = cli_runner.invoke(app, ["purge", "--older-than-days", "1"])
        assert result.exit_code == 0
        assert "Deleted" in result.stdout

    def test_config_export_outputs_yaml(self, cli_runner: CliRunner, tmp_path):
        get_storage().upsert_config_entry("features", "flags", {"beta": True})
        output = tmp_path / "cfg.yaml"
        result = cli_runner.invoke(app, ["config-export", "--output", str(output)])
        assert result.exit_code == 0
        assert output.exists()
        contents = output.read_text()
        assert "features:" in contents
