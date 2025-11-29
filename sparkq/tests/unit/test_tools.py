import sys
from pathlib import Path

import pytest
import yaml

PROJECT_ROOT = Path(__file__).resolve().parents[3]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src import tools
from src.tools import ToolRegistry, reload_registry


DEFAULT_CONFIG = {
    "task_classes": {
        "FAST_SCRIPT": {"timeout": 30},
        "MEDIUM_SCRIPT": {"timeout": 300},
        "LLM_LITE": {"timeout": 300},
        "LLM_HEAVY": {"timeout": 900},
    },
    "tools": {
        "run-bash": {
            "description": "Execute a bash script",
            "task_class": "MEDIUM_SCRIPT",
        },
        "run-python": {
            "description": "Execute a python script",
            "task_class": "MEDIUM_SCRIPT",
        },
        "llm-haiku": {
            "description": "Call Claude Haiku",
            "task_class": "LLM_LITE",
        },
        "llm-sonnet": {
            "description": "Call Claude Sonnet",
            "task_class": "LLM_HEAVY",
        },
    },
}


@pytest.fixture
def temp_config(tmp_path):
    config_path = tmp_path / "sparkq.yml"
    config_path.write_text(yaml.safe_dump(DEFAULT_CONFIG))
    return config_path


@pytest.fixture
def tool_registry(temp_config, monkeypatch):
    monkeypatch.setattr(tools, "_registry", None)
    return ToolRegistry(config_path=str(temp_config))


@pytest.mark.unit
class TestToolRegistry:
    def test_load_tools(self, tool_registry):
        tool_names = set(tool_registry.list_tools())
        assert tool_names == set(DEFAULT_CONFIG["tools"])

    def test_get_tool(self, tool_registry):
        run_bash = tool_registry.get_tool("run-bash")
        assert run_bash is not None
        assert run_bash["description"] == DEFAULT_CONFIG["tools"]["run-bash"]["description"]
        assert run_bash["task_class"] == DEFAULT_CONFIG["tools"]["run-bash"]["task_class"]
        assert tool_registry.get_task_class("run-bash") == "MEDIUM_SCRIPT"

    def test_get_nonexistent_tool(self, tool_registry):
        assert tool_registry.get_tool("nonexistent-tool") is None
        assert tool_registry.get_task_class("nonexistent-tool") is None

    def test_tool_timeout_resolution(self, tool_registry):
        assert tool_registry.get_timeout("run-bash") == DEFAULT_CONFIG["task_classes"]["MEDIUM_SCRIPT"]["timeout"]
        assert tool_registry.get_timeout("llm-sonnet") == DEFAULT_CONFIG["task_classes"]["LLM_HEAVY"]["timeout"]

        override_timeout = 45
        assert tool_registry.get_timeout("run-bash", override=override_timeout) == override_timeout

    def test_reload_registry(self, tool_registry, temp_config, monkeypatch):
        monkeypatch.chdir(temp_config.parent)

        assert "script-index" not in tool_registry.list_tools()
        updated_config = yaml.safe_load(temp_config.read_text())
        updated_config["tools"]["script-index"] = {
            "description": "Index repository scripts",
            "task_class": "FAST_SCRIPT",
        }
        temp_config.write_text(yaml.safe_dump(updated_config))

        reloaded = reload_registry()
        assert "script-index" in reloaded.list_tools()

        script_index = reloaded.get_tool("script-index")
        assert script_index["description"] == "Index repository scripts"
        assert reloaded.get_task_class("script-index") == "FAST_SCRIPT"
        assert reloaded.get_timeout("script-index") == DEFAULT_CONFIG["task_classes"]["FAST_SCRIPT"]["timeout"]
