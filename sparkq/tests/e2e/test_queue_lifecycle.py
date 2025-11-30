"""
E2E Queue Lifecycle Tests
Tests the complete lifecycle of tasks through SparkQ without browser
"""
import json
import re
import time
from pathlib import Path

import pytest
import yaml
from typer.testing import CliRunner

from src.cli import app
from src.storage import Storage
from src.tools import reload_registry


@pytest.fixture
def queue_runner(tmp_path):
    """Set up isolated environment for queue lifecycle tests"""
    runner = CliRunner()
    with runner.isolated_filesystem(temp_dir=tmp_path) as temp_dir:
        # Create minimal config
        config = {
            "project": {"name": "queue-test", "repo_path": str(temp_dir), "prd_path": None},
            "server": {"port": 8421},
            "database": {"path": "sparkq.db", "mode": "wal"},
            "purge": {"older_than_days": 3},
            "script_dirs": ["scripts"],
            "task_classes": {
                "FAST_SCRIPT": {"timeout": 30},
                "MEDIUM_SCRIPT": {"timeout": 300},
            },
            "tools": {
                "run-bash": {"description": "Execute bash", "task_class": "MEDIUM_SCRIPT"},
                "run-python": {"description": "Execute python", "task_class": "MEDIUM_SCRIPT"},
            },
        }

        Path("sparkq.yml").write_text(yaml.safe_dump(config, sort_keys=False))
        Path("scripts").mkdir(exist_ok=True)

        # Initialize storage
        storage = Storage("sparkq.db")
        storage.init_db()
        storage.create_project(name="queue-test", repo_path=str(temp_dir), prd_path=None)

        reload_registry()
        yield runner, storage


def run_cli(runner: CliRunner, args: list[str]) -> str:
    """Helper to run CLI commands"""
    result = runner.invoke(app, args, catch_exceptions=False)
    assert result.exit_code == 0, f"CLI failed: {result.stdout}"
    return result.stdout


def extract_task_id(output: str) -> str:
    """Extract task ID from CLI output"""
    match = re.search(r"(tsk_\w+)", output)
    assert match, f"Task ID not found in: {output}"
    return match.group(1)


@pytest.mark.e2e
class TestQueueLifecycle:
    """Complete queue lifecycle tests"""

    def test_enqueue_to_completion_flow(self, queue_runner):
        """Test full flow: enqueue → peek → claim → complete"""
        runner, storage = queue_runner

        # Create session and queue
        run_cli(runner, ["session", "create", "test-session"])
        run_cli(runner, ["queue", "create", "test-queue", "--session", "test-session"])

        # Enqueue task
        enqueue_output = run_cli(
            runner,
            [
                "enqueue",
                "--queue",
                "test-queue",
                "--tool",
                "run-bash",
                "--metadata",
                json.dumps({"test": "lifecycle", "order": 1}),
            ],
        )
        task_id = extract_task_id(enqueue_output)

        # Verify task is in database
        task = storage.get_task(task_id)
        assert task is not None
        assert task["status"] == "queued"
        assert task["tool_name"] == "run-bash"

        # Peek (should not change status)
        peek_output = run_cli(runner, ["peek", "--queue", "test-queue"])
        peek_id = extract_task_id(peek_output)
        assert peek_id == task_id

        task = storage.get_task(task_id)
        assert task["status"] == "queued", "Peek should not change status"

        # Claim (should mark as running)
        claim_output = run_cli(runner, ["claim", "--queue", "test-queue"])
        claim_id = extract_task_id(claim_output)
        assert claim_id == task_id

        task = storage.get_task(task_id)
        assert task["status"] == "running"
        assert task["started_at"] is not None

        # Complete with result
        result_data = {"summary": "Task completed", "details": {"steps": 5, "errors": 0}}
        run_cli(runner, ["complete", task_id, "--result", json.dumps(result_data)])

        task = storage.get_task(task_id)
        assert task["status"] == "succeeded"
        assert task["finished_at"] is not None

        result = json.loads(task["result"])
        assert result["summary"] == "Task completed"
        assert result["details"]["steps"] == 5

    def test_enqueue_to_failure_flow(self, queue_runner):
        """Test failure flow: enqueue → claim → fail"""
        runner, storage = queue_runner

        run_cli(runner, ["session", "create", "fail-session"])
        run_cli(runner, ["queue", "create", "fail-queue", "--session", "fail-session"])

        # Enqueue task
        enqueue_output = run_cli(
            runner,
            [
                "enqueue",
                "--queue",
                "fail-queue",
                "--tool",
                "run-bash",
                "--metadata",
                json.dumps({"test": "failure"}),
            ],
        )
        task_id = extract_task_id(enqueue_output)

        # Claim
        run_cli(runner, ["claim", "--queue", "fail-queue"])

        # Fail
        error_msg = "Simulated execution failure"
        run_cli(runner, ["fail", task_id, "--error", error_msg])

        task = storage.get_task(task_id)
        assert task["status"] == "failed"
        assert task["error"] == error_msg
        assert task["finished_at"] is not None

    def test_requeue_after_failure(self, queue_runner):
        """Test requeue flow: enqueue → claim → fail → requeue"""
        runner, storage = queue_runner

        run_cli(runner, ["session", "create", "requeue-session"])
        run_cli(runner, ["queue", "create", "requeue-queue", "--session", "requeue-session"])

        # Enqueue and fail
        enqueue_output = run_cli(
            runner,
            [
                "enqueue",
                "--queue",
                "requeue-queue",
                "--tool",
                "run-bash",
                "--metadata",
                json.dumps({"test": "requeue", "retry": 1}),
            ],
        )
        original_id = extract_task_id(enqueue_output)

        run_cli(runner, ["claim", "--queue", "requeue-queue"])
        run_cli(runner, ["fail", original_id, "--error", "Transient error"])

        # Requeue
        requeue_output = run_cli(runner, ["requeue", original_id])
        ids = re.findall(r"(tsk_\w+)", requeue_output)
        assert len(ids) == 2  # Original + new

        new_id = next(tid for tid in ids if tid != original_id)

        # Verify new task
        new_task = storage.get_task(new_id)
        assert new_task["status"] == "queued"
        assert new_task["queue_id"] == storage.get_task(original_id)["queue_id"]

        payload = json.loads(new_task["payload"])
        assert payload["metadata"]["test"] == "requeue"

        # Original should still be failed
        original_task = storage.get_task(original_id)
        assert original_task["status"] == "failed"

    def test_fifo_ordering_guarantee(self, queue_runner):
        """Test that tasks are claimed in FIFO order"""
        runner, storage = queue_runner

        run_cli(runner, ["session", "create", "fifo-session"])
        run_cli(runner, ["queue", "create", "fifo-queue", "--session", "fifo-session"])

        # Enqueue 5 tasks
        task_ids = []
        for i in range(5):
            output = run_cli(
                runner,
                [
                    "enqueue",
                    "--queue",
                    "fifo-queue",
                    "--tool",
                    "run-bash",
                    "--metadata",
                    json.dumps({"order": i}),
                ],
            )
            task_ids.append(extract_task_id(output))
            time.sleep(0.01)  # Ensure distinct timestamps

        # Claim all tasks
        claimed_ids = []
        for _ in range(5):
            output = run_cli(runner, ["claim", "--queue", "fifo-queue"])
            claimed_ids.append(extract_task_id(output))

        # Verify FIFO order
        assert claimed_ids == task_ids, "Tasks should be claimed in FIFO order"

    def test_stream_isolation(self, queue_runner):
        """Test that tasks are isolated by queue"""
        runner, storage = queue_runner

        run_cli(runner, ["session", "create", "isolation-session"])
        run_cli(runner, ["queue", "create", "queue-a", "--session", "isolation-session"])
        run_cli(runner, ["queue", "create", "queue-b", "--session", "isolation-session"])

        # Enqueue to queue A
        output_a = run_cli(
            runner,
            [
                "enqueue",
                "--queue",
                "queue-a",
                "--tool",
                "run-bash",
                "--metadata",
                json.dumps({"queue": "a"}),
            ],
        )
        task_a = extract_task_id(output_a)

        # Enqueue to queue B
        output_b = run_cli(
            runner,
            [
                "enqueue",
                "--queue",
                "queue-b",
                "--tool",
                "run-bash",
                "--metadata",
                json.dumps({"queue": "b"}),
            ],
        )
        task_b = extract_task_id(output_b)

        # Claim from each queue
        claim_a = extract_task_id(run_cli(runner, ["claim", "--queue", "queue-a"]))
        claim_b = extract_task_id(run_cli(runner, ["claim", "--queue", "queue-b"]))

        # Verify isolation
        assert claim_a == task_a
        assert claim_b == task_b

        # Verify they're in different streams
        task_a_data = storage.get_task(task_a)
        task_b_data = storage.get_task(task_b)
        assert task_a_data["queue_id"] != task_b_data["queue_id"]

    def test_empty_queue_behavior(self, queue_runner):
        """Test behavior when claiming from empty queue"""
        runner, storage = queue_runner

        run_cli(runner, ["session", "create", "empty-session"])
        run_cli(runner, ["queue", "create", "empty-queue", "--session", "empty-session"])

        # Try to claim from empty queue (should fail gracefully)
        result = runner.invoke(app, ["claim", "--queue", "empty-queue"])

        # Should contain "No tasks" message (exit code 0 is OK, it's a graceful message)
        assert "No" in result.stdout and "tasks" in result.stdout.lower()

    def test_task_metadata_preservation(self, queue_runner):
        """Test that task metadata is preserved through lifecycle"""
        runner, storage = queue_runner

        run_cli(runner, ["session", "create", "metadata-session"])
        run_cli(runner, ["queue", "create", "metadata-queue", "--session", "metadata-session"])

        # Enqueue with rich metadata
        metadata = {
            "user": "test-user",
            "priority": "high",
            "tags": ["critical", "production"],
            "context": {"repo": "sparkqueue", "branch": "main"},
        }

        output = run_cli(
            runner,
            [
                "enqueue",
                "--queue",
                "metadata-queue",
                "--tool",
                "run-bash",
                "--metadata",
                json.dumps(metadata),
            ],
        )
        task_id = extract_task_id(output)

        # Claim and complete
        run_cli(runner, ["claim", "--queue", "metadata-queue"])
        run_cli(runner, ["complete", task_id, "--result", json.dumps({"status": "ok"})])

        # Verify metadata preserved
        task = storage.get_task(task_id)
        payload = json.loads(task["payload"])

        assert payload["metadata"]["user"] == "test-user"
        assert payload["metadata"]["priority"] == "high"
        assert payload["metadata"]["tags"] == ["critical", "production"]
        assert payload["metadata"]["context"]["repo"] == "sparkqueue"
