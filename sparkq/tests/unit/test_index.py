"""Unit tests for the ScriptIndex helper."""

import logging
from pathlib import Path

import pytest

from src.index import ScriptIndex


@pytest.fixture
def script_index(tmp_path: Path) -> ScriptIndex:
    """Build a ScriptIndex against a temporary scripts directory."""
    scripts_dir = tmp_path / "scripts"
    scripts_dir.mkdir()

    config_path = tmp_path / "sparkq.yml"
    config_path.write_text(f"script_dirs:\n  - {scripts_dir}\n")

    (scripts_dir / "test.sh").write_text(
        "#!/bin/bash\n"
        "# name: test-script\n"
        "# description: Test script for indexing\n"
        "# tags: test, smoke\n"
        "echo 'hello world'\n"
    )

    (scripts_dir / "deploy.sh").write_text(
        "#!/bin/bash\n"
        "# name: deploy-staging\n"
        "# description: Deploy to staging\n"
        "# tags: deploy, staging\n"
        "echo 'deploying'\n"
    )

    (scripts_dir / "test-runner.py").write_text(
        "#!/usr/bin/env python\n"
        "# name: test-runner\n"
        "# description: Run the test suite\n"
        "# tags: test, python\n"
        "print('running tests')\n"
    )

    index = ScriptIndex(config_path=str(config_path))
    index.build()
    return index


class TestScriptIndex:
    """Test script indexing functionality."""

    def test_build_index(self, script_index: ScriptIndex):
        scripts = script_index.list_all()
        names = {entry["name"] for entry in scripts}

        assert len(scripts) == 3
        assert {"test-script", "deploy-staging", "test-runner"}.issubset(names)

        test_entry = script_index.get_script("test-script")
        assert test_entry is not None
        assert test_entry["path"].endswith("test.sh")

    def test_parse_metadata(self, script_index: ScriptIndex, tmp_path: Path):
        script_path = tmp_path / "scripts" / "test.sh"
        metadata = script_index.parse_script_header(script_path)

        assert metadata["name"] == "test-script"
        assert metadata["tags"] == ["test", "smoke"]
        assert metadata["description"] == "Test script for indexing"

    def test_search_by_name(self, script_index: ScriptIndex):
        results = script_index.search("deploy")
        names = {entry["name"] for entry in results}

        assert "deploy-staging" in names
        assert all("deploy" in name for name in names)

    def test_search_by_tag(self, script_index: ScriptIndex):
        results = script_index.search("python")

        assert any(entry["name"] == "test-runner" for entry in results)
        assert all("python" in [t.lower() for t in entry.get("tags", [])] or "python" in entry.get("description", "").lower() for entry in results)

    def test_search_by_directory(self, script_index: ScriptIndex, tmp_path: Path):
        scripts_dir = tmp_path / "scripts"
        results = [entry for entry in script_index.list_all() if Path(entry["path"]).parent == scripts_dir]

        assert results
        assert all(Path(entry["path"]).parent == scripts_dir for entry in results)

    def test_reload_index(self, script_index: ScriptIndex, tmp_path: Path):
        new_script = tmp_path / "scripts" / "new-task.sh"
        new_script.write_text(
            "#!/bin/bash\n"
            "# name: new-task\n"
            "# tags: new, smoke\n"
            "echo 'new task'\n"
        )

        script_index.rebuild()
        updated_scripts = script_index.list_all()

        assert len(updated_scripts) == 4
        assert script_index.get_script("new-task") is not None

    def test_parse_inputs_outputs(self, tmp_path: Path):
        """Test parsing inputs/outputs as structured data."""
        script = tmp_path / "deploy.sh"
        script.write_text(
            "#!/bin/bash\n"
            "# name: deploy\n"
            "# inputs: branch (optional), env_name (required)\n"
            "# outputs: deployment_url, commit_hash\n"
            "echo 'deploying'\n"
        )

        index = ScriptIndex(config_path=str(tmp_path / "sparkq.yml"))
        index._load_config = lambda: {"script_dirs": [tmp_path]}

        metadata = index.parse_script_header(script)

        assert metadata["inputs"] == [
            {"name": "branch", "required": False, "optional": True},
            {"name": "env_name", "required": True, "optional": False},
        ]
        assert metadata["outputs"] == [
            {"name": "deployment_url", "required": False, "optional": False},
            {"name": "commit_hash", "required": False, "optional": False},
        ]

    def test_multiline_description(self, tmp_path: Path):
        """Test parsing multi-line metadata values."""
        script = tmp_path / "task.sh"
        script.write_text(
            "#!/bin/bash\n"
            "# name: multi-task\n"
            "# description: This is a long description\n"
            "#              that spans multiple lines\n"
            "#              for better readability.\n"
            "# tags: test\n"
            "echo 'task'\n"
        )

        index = ScriptIndex(config_path=str(tmp_path / "sparkq.yml"))
        index._load_config = lambda: {"script_dirs": [tmp_path]}

        metadata = index.parse_script_header(script)

        expected = "This is a long description that spans multiple lines for better readability."
        assert metadata["description"] == expected

    def test_malformed_timeout_warning(self, tmp_path: Path, caplog):
        """Test that invalid timeout triggers a warning."""
        script = tmp_path / "bad.sh"
        script.write_text(
            "#!/bin/bash\n"
            "# name: bad-script\n"
            "# timeout: -10\n"
            "echo 'oops'\n"
        )

        index = ScriptIndex(config_path=str(tmp_path / "sparkq.yml"))
        index._load_config = lambda: {"script_dirs": [tmp_path]}

        with caplog.at_level(logging.WARNING):
            metadata = index.parse_script_header(script)

        assert "invalid timeout" in caplog.text.lower()
        assert metadata["timeout"] == -10  # Still parsed, but warned
