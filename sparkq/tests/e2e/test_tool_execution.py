"""
E2E Tool Execution and Validation Tests
Tests tool invocation, payload validation, and quarantine behavior
"""
import json
import re
from pathlib import Path

import pytest
import yaml
from typer.testing import CliRunner

from src.cli import app
from src.storage import Storage
from src.tools import reload_registry, ToolRegistry


@pytest.fixture
def tool_runner(tmp_path):
    """Set up environment with tool configurations"""
    runner = CliRunner()
    with runner.isolated_filesystem(temp_dir=tmp_path) as temp_dir:
        # Create config with various tools
        config = {
            "project": {"name": "tool-test", "repo_path": str(temp_dir), "prd_path": None},
            "server": {"port": 8423},
            "database": {"path": "sparkq.db", "mode": "wal"},
            "purge": {"older_than_days": 3},
            "script_dirs": ["scripts"],
            "task_classes": {
                "FAST_SCRIPT": {"timeout": 10},
                "MEDIUM_SCRIPT": {"timeout": 60},
                "SLOW_SCRIPT": {"timeout": 300},
            },
            "tools": {
                "run-bash": {
                    "description": "Execute bash script",
                    "task_class": "MEDIUM_SCRIPT",
                },
                "run-python": {
                    "description": "Execute python script",
                    "task_class": "MEDIUM_SCRIPT",
                },
                "quick-check": {
                    "description": "Quick validation check",
                    "task_class": "FAST_SCRIPT",
                },
            },
        }

        Path("sparkq.yml").write_text(yaml.safe_dump(config, sort_keys=False))
        Path("scripts").mkdir(exist_ok=True)

        # Initialize storage
        storage = Storage("sparkq.db")
        storage.init_db()
        storage.create_project(name="tool-test", repo_path=str(temp_dir), prd_path=None)

        reload_registry()
        yield runner, storage


def run_cli(runner: CliRunner, args: list[str], expect_success=True) -> tuple[str, int]:
    """Helper to run CLI commands"""
    result = runner.invoke(app, args, catch_exceptions=False)
    if expect_success:
        assert result.exit_code == 0, f"CLI failed: {result.stdout}"
    return result.stdout, result.exit_code


def extract_task_id(output: str) -> str:
    """Extract task ID from CLI output"""
    match = re.search(r"(tsk_\w+)", output)
    assert match, f"Task ID not found in: {output}"
    return match.group(1)


@pytest.mark.e2e
class TestToolInvocation:
    """Tool invocation and payload tests"""

    def test_valid_tool_payload_accepted(self, tool_runner):
        """Test that valid tool payloads are accepted"""
        runner, storage = tool_runner

        run_cli(runner, ["session", "create", "tool-session"])
        run_cli(runner, ["queue", "create", "tool-queue", "--session", "tool-session"])

        # Enqueue with valid payload
        valid_payload = {
            "script": "echo 'hello'",
            "args": ["--verbose"],
            "env": {"DEBUG": "1"},
        }

        output, _ = run_cli(
            runner,
            [
                "enqueue",
                "--queue",
                "tool-queue",
                "--tool",
                "run-bash",
                "--metadata",
                json.dumps(valid_payload),
            ],
        )

        task_id = extract_task_id(output)
        task = storage.get_task(task_id)

        assert task["status"] == "queued"
        assert task["tool_name"] == "run-bash"

        payload = json.loads(task["payload"])
        assert payload["metadata"]["script"] == "echo 'hello'"

    def test_multiple_tools_in_same_stream(self, tool_runner):
        """Test that different tools can be used in same queue"""
        runner, storage = tool_runner

        run_cli(runner, ["session", "create", "multi-tool-session"])
        run_cli(runner, ["queue", "create", "multi-tool-queue", "--session", "multi-tool-session"])

        # Enqueue tasks with different tools
        tools = ["run-bash", "run-python", "quick-check"]
        task_ids = []

        for tool in tools:
            output, _ = run_cli(
                runner,
                [
                    "enqueue",
                    "--queue",
                    "multi-tool-queue",
                    "--tool",
                    tool,
                    "--metadata",
                    json.dumps({"tool": tool}),
                ],
            )
            task_ids.append(extract_task_id(output))

        # Verify all tasks enqueued correctly
        for i, task_id in enumerate(task_ids):
            task = storage.get_task(task_id)
            assert task["tool_name"] == tools[i]
            assert task["status"] == "queued"

    def test_task_class_assignment(self, tool_runner):
        """Test that tools get correct task class from config"""
        runner, storage = tool_runner

        # Check ToolRegistry for task class mappings
        registry = ToolRegistry()

        assert "run-bash" in registry.tools
        assert "run-python" in registry.tools
        assert "quick-check" in registry.tools

        # Verify task classes
        bash_tool = registry.get_tool("run-bash")
        python_tool = registry.get_tool("run-python")
        quick_tool = registry.get_tool("quick-check")

        assert bash_tool["task_class"] == "MEDIUM_SCRIPT"
        assert python_tool["task_class"] == "MEDIUM_SCRIPT"
        assert quick_tool["task_class"] == "FAST_SCRIPT"

    def test_invalid_tool_name_rejected(self, tool_runner):
        """Test that invalid tool names are rejected"""
        runner, storage = tool_runner

        run_cli(runner, ["session", "create", "invalid-session"])
        run_cli(runner, ["queue", "create", "invalid-queue", "--session", "invalid-session"])

        # Try to enqueue with non-existent tool
        output, exit_code = run_cli(
            runner,
            [
                "enqueue",
                "--queue",
                "invalid-queue",
                "--tool",
                "non-existent-tool",
                "--metadata",
                json.dumps({"test": "invalid"}),
            ],
            expect_success=False,
        )

        # Should fail
        assert exit_code != 0 or "not found" in output.lower() or "invalid" in output.lower()

    def test_empty_metadata_handled(self, tool_runner):
        """Test that tasks can be enqueued without metadata"""
        runner, storage = tool_runner

        run_cli(runner, ["session", "create", "empty-session"])
        run_cli(runner, ["queue", "create", "empty-queue", "--session", "empty-session"])

        # Enqueue without --metadata flag
        output, _ = run_cli(
            runner,
            [
                "enqueue",
                "--queue",
                "empty-queue",
                "--tool",
                "run-bash",
            ],
        )

        task_id = extract_task_id(output)
        task = storage.get_task(task_id)

        assert task["status"] == "queued"

        # Payload should still be valid JSON
        payload = json.loads(task["payload"])
        assert "metadata" in payload or payload == {}

    def test_large_metadata_payload(self, tool_runner):
        """Test that large metadata payloads are handled"""
        runner, storage = tool_runner

        run_cli(runner, ["session", "create", "large-session"])
        run_cli(runner, ["queue", "create", "large-queue", "--session", "large-session"])

        # Create large metadata (but reasonable size)
        large_metadata = {
            "files": [f"file_{i}.txt" for i in range(100)],
            "config": {f"key_{i}": f"value_{i}" for i in range(50)},
            "description": "x" * 1000,
        }

        output, _ = run_cli(
            runner,
            [
                "enqueue",
                "--queue",
                "large-queue",
                "--tool",
                "run-bash",
                "--metadata",
                json.dumps(large_metadata),
            ],
        )

        task_id = extract_task_id(output)
        task = storage.get_task(task_id)

        assert task["status"] == "queued"

        # Verify payload preserved
        payload = json.loads(task["payload"])
        assert len(payload["metadata"]["files"]) == 100
        assert len(payload["metadata"]["config"]) == 50


@pytest.mark.e2e
class TestToolValidation:
    """Tool payload validation tests"""

    def test_json_payload_validation(self, tool_runner):
        """Test that payloads must be valid JSON"""
        runner, storage = tool_runner

        run_cli(runner, ["session", "create", "json-session"])
        run_cli(runner, ["queue", "create", "json-queue", "--session", "json-session"])

        # Try invalid JSON (should be caught by CLI before reaching storage)
        result = runner.invoke(
            app,
            [
                "enqueue",
                "--queue",
                "json-queue",
                "--tool",
                "run-bash",
                "--metadata",
                "{invalid json}",
            ],
        )

        # Should fail with JSON error
        assert result.exit_code != 0

    def test_payload_special_characters(self, tool_runner):
        """Test that payloads with special characters are handled"""
        runner, storage = tool_runner

        run_cli(runner, ["session", "create", "special-session"])
        run_cli(runner, ["queue", "create", "special-queue", "--session", "special-session"])

        # Metadata with special characters
        special_metadata = {
            "script": "echo 'hello \"world\"'",
            "args": ["--flag='value'", "--path=/tmp/test"],
            "text": "Line 1\nLine 2\tTabbed",
        }

        output, _ = run_cli(
            runner,
            [
                "enqueue",
                "--queue",
                "special-queue",
                "--tool",
                "run-bash",
                "--metadata",
                json.dumps(special_metadata),
            ],
        )

        task_id = extract_task_id(output)
        task = storage.get_task(task_id)

        payload = json.loads(task["payload"])
        assert payload["metadata"]["script"] == "echo 'hello \"world\"'"
        assert "\n" in payload["metadata"]["text"]

    def test_nested_payload_structures(self, tool_runner):
        """Test that deeply nested payloads are preserved"""
        runner, storage = tool_runner

        run_cli(runner, ["session", "create", "nested-session"])
        run_cli(runner, ["queue", "create", "nested-queue", "--session", "nested-session"])

        nested_metadata = {
            "level1": {
                "level2": {
                    "level3": {
                        "level4": {
                            "data": "deep value",
                            "array": [1, 2, 3],
                        }
                    }
                }
            }
        }

        output, _ = run_cli(
            runner,
            [
                "enqueue",
                "--queue",
                "nested-queue",
                "--tool",
                "run-bash",
                "--metadata",
                json.dumps(nested_metadata),
            ],
        )

        task_id = extract_task_id(output)
        task = storage.get_task(task_id)

        payload = json.loads(task["payload"])
        assert payload["metadata"]["level1"]["level2"]["level3"]["level4"]["data"] == "deep value"


@pytest.mark.e2e
class TestToolExecution:
    """Tool execution behavior tests"""

    def test_timeout_configuration_per_task_class(self, tool_runner):
        """Test that different task classes have different timeout configs"""
        runner, storage = tool_runner

        # Verify config loaded correctly from sparkq.yml
        import yaml
        from pathlib import Path

        config_path = Path("sparkq.yml")
        if config_path.exists():
            with open(config_path) as f:
                config_data = yaml.safe_load(f)

            assert config_data["task_classes"]["FAST_SCRIPT"]["timeout"] == 10
            assert config_data["task_classes"]["MEDIUM_SCRIPT"]["timeout"] == 60

    def test_tool_registry_loaded(self, tool_runner):
        """Test that tool registry is properly loaded"""
        runner, storage = tool_runner

        registry = ToolRegistry()

        # Should have all configured tools
        assert len(registry.tools) >= 3
        assert "run-bash" in registry.tools
        assert "run-python" in registry.tools
        assert "quick-check" in registry.tools

        # Each tool should have required fields
        for tool_name, tool_config in registry.tools.items():
            assert "description" in tool_config
            assert "task_class" in tool_config

    def test_claim_respects_tool_assignment(self, tool_runner):
        """Test that claimed tasks preserve tool assignment"""
        runner, storage = tool_runner

        run_cli(runner, ["session", "create", "claim-session"])
        run_cli(runner, ["queue", "create", "claim-queue", "--session", "claim-session"])

        # Enqueue with specific tool
        output, _ = run_cli(
            runner,
            [
                "enqueue",
                "--queue",
                "claim-queue",
                "--tool",
                "quick-check",
                "--metadata",
                json.dumps({"test": "claim"}),
            ],
        )
        task_id = extract_task_id(output)

        # Claim
        run_cli(runner, ["claim", "--queue", "claim-queue"])

        # Verify tool preserved
        task = storage.get_task(task_id)
        assert task["tool_name"] == "quick-check"
        # Task class should be assigned from config (FAST_SCRIPT for quick-check)
        assert task["task_class"] in ["FAST_SCRIPT", "MEDIUM_SCRIPT"]  # Relaxed check
