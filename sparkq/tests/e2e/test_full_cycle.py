import json
import re
from pathlib import Path

import pytest
import yaml
from typer.testing import CliRunner

from src.cli import app
from src.storage import Storage
from src.tools import reload_registry


@pytest.fixture()
def cli_runner(tmp_path):
    runner = CliRunner()
    with runner.isolated_filesystem(temp_dir=tmp_path) as temp_dir:
        config = {
            "project": {"name": "e2e-project", "repo_path": str(temp_dir), "prd_path": None},
            "server": {"port": 8420},
            "database": {"path": "sparkq.db", "mode": "wal"},
            "purge": {"older_than_days": 3},
            "script_dirs": ["scripts"],
            "task_classes": {
                "FAST_SCRIPT": {"timeout": 30},
                "MEDIUM_SCRIPT": {"timeout": 300},
                "LLM_LITE": {"timeout": 300},
                "LLM_HEAVY": {"timeout": 900},
            },
            "tools": {
                "run-bash": {"description": "Execute a bash script", "task_class": "MEDIUM_SCRIPT"},
                "run-python": {"description": "Execute a python script", "task_class": "MEDIUM_SCRIPT"},
            },
        }

        Path("sparkq.yml").write_text(yaml.safe_dump(config, sort_keys=False))
        Path("scripts").mkdir(exist_ok=True)

        storage = Storage("sparkq.db")
        storage.init_db()
        storage.create_project(name="e2e-project", repo_path=str(temp_dir), prd_path=None)

        reload_registry()
        yield runner


def run_cli(runner: CliRunner, args: list[str]) -> str:
    result = runner.invoke(app, args, catch_exceptions=False)
    assert result.exit_code == 0, result.stdout
    return result.stdout


def extract_task_id(output: str) -> str:
    match = re.search(r"(tsk_\w+)", output)
    assert match, f"Task ID not found in output: {output}"
    return match.group(1)


def get_task(task_id: str) -> dict:
    task = Storage("sparkq.db").get_task(task_id)
    assert task, f"Task {task_id} not found"
    return task


def create_session_and_stream(runner: CliRunner, session_name: str, stream_name: str) -> None:
    run_cli(runner, ["session", "create", session_name])
    run_cli(runner, ["stream", "create", stream_name, "--session", session_name])


@pytest.mark.e2e
class TestFullTaskLifecycle:
    def test_basic_lifecycle(self, cli_runner: CliRunner):
        session_name = "basic-session"
        stream_name = "basic-stream"
        create_session_and_stream(cli_runner, session_name, stream_name)

        enqueue_output = run_cli(
            cli_runner,
            [
                "enqueue",
                "--stream",
                stream_name,
                "--tool",
                "run-bash",
                "--metadata",
                json.dumps({"order": 1, "source": "basic"}),
            ],
        )
        task_id = extract_task_id(enqueue_output)
        payload = json.loads(get_task(task_id)["payload"])
        assert payload["metadata"]["order"] == 1

        peek_output = run_cli(cli_runner, ["peek", "--stream", stream_name])
        assert extract_task_id(peek_output) == task_id

        claim_output = run_cli(cli_runner, ["claim", "--stream", stream_name])
        assert extract_task_id(claim_output) == task_id
        assert get_task(task_id)["status"] == "running"

        result_body = {"summary": "completed in basic lifecycle", "details": {"step": "complete"}}
        run_cli(cli_runner, ["complete", task_id, "--result", json.dumps(result_body)])
        completed = get_task(task_id)

        assert completed["status"] == "succeeded"
        parsed_result = json.loads(completed["result"])
        assert parsed_result["summary"] == result_body["summary"]

    def test_failure_and_requeue_lifecycle(self, cli_runner: CliRunner):
        session_name = "fail-session"
        stream_name = "fail-stream"
        create_session_and_stream(cli_runner, session_name, stream_name)

        enqueue_output = run_cli(
            cli_runner,
            [
                "enqueue",
                "--stream",
                stream_name,
                "--tool",
                "run-bash",
                "--metadata",
                json.dumps({"reason": "retry"}),
            ],
        )
        task_id = extract_task_id(enqueue_output)

        run_cli(cli_runner, ["claim", "--stream", stream_name])
        assert get_task(task_id)["status"] == "running"

        run_cli(cli_runner, ["fail", task_id, "--error", "Injected failure"])
        assert get_task(task_id)["status"] == "failed"

        requeue_output = run_cli(cli_runner, ["requeue", task_id])
        ids = re.findall(r"(tsk_\w+)", requeue_output)
        assert task_id in ids
        assert len(ids) == 2
        new_task_id = next(tid for tid in ids if tid != task_id)

        cloned_task = get_task(new_task_id)
        assert cloned_task["status"] == "queued"

        cloned_payload = json.loads(cloned_task["payload"])
        assert cloned_payload["metadata"]["reason"] == "retry"
        assert get_task(task_id)["status"] == "failed"


@pytest.mark.e2e
class TestFIFOOrdering:
    def test_fifo_order(self, cli_runner: CliRunner):
        session_name = "fifo-session"
        stream_name = "fifo-stream"
        create_session_and_stream(cli_runner, session_name, stream_name)

        enqueued_ids: list[str] = []
        for order in [1, 2, 3]:
            output = run_cli(
                cli_runner,
                [
                    "enqueue",
                    "--stream",
                    stream_name,
                    "--tool",
                    "run-bash",
                    "--metadata",
                    json.dumps({"order": order}),
                ],
            )
            enqueued_ids.append(extract_task_id(output))

        claimed_ids = [
            extract_task_id(run_cli(cli_runner, ["claim", "--stream", stream_name]))
            for _ in enqueued_ids
        ]

        assert claimed_ids == enqueued_ids


@pytest.mark.e2e
class TestMultiStreamIsolation:
    def test_stream_isolation(self, cli_runner: CliRunner):
        session_name = "multi-session"
        primary_stream = "alpha-stream"
        secondary_stream = "beta-stream"
        create_session_and_stream(cli_runner, session_name, primary_stream)
        run_cli(cli_runner, ["stream", "create", secondary_stream, "--session", session_name])

        enqueue_primary = run_cli(
            cli_runner,
            [
                "enqueue",
                "--stream",
                primary_stream,
                "--tool",
                "run-bash",
                "--metadata",
                json.dumps({"stream": primary_stream}),
            ],
        )
        enqueue_secondary = run_cli(
            cli_runner,
            [
                "enqueue",
                "--stream",
                secondary_stream,
                "--tool",
                "run-bash",
                "--metadata",
                json.dumps({"stream": secondary_stream}),
            ],
        )

        primary_task_id = extract_task_id(enqueue_primary)
        secondary_task_id = extract_task_id(enqueue_secondary)

        claim_primary = extract_task_id(run_cli(cli_runner, ["claim", "--stream", primary_stream]))
        claim_secondary = extract_task_id(run_cli(cli_runner, ["claim", "--stream", secondary_stream]))

        assert claim_primary == primary_task_id
        assert claim_secondary == secondary_task_id

        primary_task = get_task(primary_task_id)
        secondary_task = get_task(secondary_task_id)
        assert primary_task["stream_id"] != secondary_task["stream_id"]
        assert primary_task["status"] == "running"
        assert secondary_task["status"] == "running"

        primary_payload = json.loads(primary_task["payload"])
        secondary_payload = json.loads(secondary_task["payload"])
        assert primary_payload["metadata"]["stream"] == primary_stream
        assert secondary_payload["metadata"]["stream"] == secondary_stream
