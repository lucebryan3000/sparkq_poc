"""Unit tests for the ScriptIndex helper."""

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
