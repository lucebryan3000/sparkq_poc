"""SparkQ Tool Registry"""

from typing import Optional

from .constants import DEFAULT_TOOL_TIMEOUT_SECONDS, TASK_CLASS_TIMEOUTS
from .config import get_database_path, load_config
from .paths import get_config_path
from .models import TaskClassDefaults

# Helper imports inside functions to avoid circular dependencies


TASK_CLASS_DEFAULT_TIMEOUTS = TaskClassDefaults().dict()


def default_timeout_for_task_class(task_class: str | None) -> int:
    """Return default timeout for a task class (fallback to configured defaults)."""
    if not task_class:
        return DEFAULT_TOOL_TIMEOUT_SECONDS
    if task_class in TASK_CLASS_TIMEOUTS:
        return TASK_CLASS_TIMEOUTS[task_class]
    return TASK_CLASS_DEFAULT_TIMEOUTS.get(task_class, DEFAULT_TOOL_TIMEOUT_SECONDS)


class ToolRegistry:
    """Manages tool definitions and task class timeouts from config."""

    def __init__(self, config_path: str | None = None, config_dict: dict | None = None, source: str = "yaml"):
        self.config_path = str(config_path) if config_path is not None else str(get_config_path())
        self.tools: dict = {}
        self.task_classes: dict = {}
        self.source: str = source
        if config_dict is not None:
            self.tools = _seed_default_tools(config_dict.get("tools", {}) or {})
            self.task_classes = config_dict.get("task_classes", {}) or {}
        else:
            self._load_config()

    def _load_config(self):
        """Load tools and task_classes from YAML config"""
        try:
            config = load_config(self.config_path)
            self.tools = _seed_default_tools(config.get('tools', {}) or {})
            self.task_classes = config.get('task_classes', {}) or {}
        except (FileNotFoundError, ValueError):
            # Config doesn't exist or is invalid - return empty dicts
            self.tools = _seed_default_tools({})
            self.task_classes = {}
    
    def get_tool(self, name: str) -> dict | None:
        """Get tool config by name"""
        return self.tools.get(name)
    
    def list_tools(self) -> list[str]:
        """Get list of all tool names"""
        return list(self.tools.keys())

    def get_timeout(self, tool_name: str | None, override: int | None = None, task_class: str | None = None) -> int:
        """
        Resolve timeout for a tool or task class.

        Priority: override > configured task_class timeout > default per task_class.
        """
        if override is not None:
            return override

        tool_cfg = self.get_tool(tool_name) if tool_name else None
        task_class_name = task_class or (tool_cfg.get("task_class") if tool_cfg else None)

        if task_class_name:
            task_class_cfg = self.task_classes.get(task_class_name, {}) if isinstance(self.task_classes, dict) else {}
            timeout_value = task_class_cfg.get("timeout") if isinstance(task_class_cfg, dict) else None
            if timeout_value is not None:
                return timeout_value

        return default_timeout_for_task_class(task_class_name)
    
    def get_task_class(self, tool_name: str) -> str | None:
        """Get task class name for a tool"""
        tool = self.get_tool(tool_name)
        return tool.get('task_class') if tool else None

    def list_llm_tools(self) -> list[dict]:
        """
        List tools whose task_class starts with LLM_.
        Returns list of dicts: {name, description, task_class}
        """
        llm_tools = []
        for name, cfg in (self.tools or {}).items():
            task_class = cfg.get("task_class", "")
            if isinstance(task_class, str) and task_class.upper().startswith("LLM_"):
                llm_tools.append({
                    "name": name,
                    "description": cfg.get("description") or name,
                    "task_class": task_class,
                })
        return llm_tools

    def get_tool_display(self, name: str) -> str:
        """Return a human-friendly label (description fallback to name)."""
        tool = self.get_tool(name)
        return tool.get("description") if tool else name


# Module-level singleton
_registry: ToolRegistry | None = None


def get_registry() -> ToolRegistry:
    """Get or create singleton ToolRegistry instance.

    Prefer DB-backed config if available; fallback to YAML.
    """
    global _registry
    if _registry is None:
        _registry = _load_registry_from_db_or_yaml()
    return _registry


def reload_registry(config: dict | None = None) -> ToolRegistry:
    """Force reload config and return new ToolRegistry instance"""
    global _registry
    if config is not None:
        _registry = ToolRegistry(config_dict=config, source="db")
    else:
        _registry = _load_registry_from_db_or_yaml()
    return _registry


def _load_registry_from_db_or_yaml() -> ToolRegistry:
    """Attempt to build registry from DB config; fallback to YAML."""
    cfg = load_config()
    yaml_tools = cfg.get("tools") or {}
    yaml_task_classes = cfg.get("task_classes") or {}

    if yaml_tools or yaml_task_classes:
        return ToolRegistry(config_dict={"tools": yaml_tools, "task_classes": yaml_task_classes}, source="yaml")

    db_config = _load_tools_from_db_config(cfg)
    if db_config:
        return ToolRegistry(config_dict=db_config, source="db")
    return ToolRegistry(config_dict={"tools": _seed_default_tools({}), "task_classes": {}}, source="default")


def _load_tools_from_db_config(cfg: Optional[dict] = None) -> Optional[dict]:
    """Load tools/task_classes from config table if available."""
    try:
        from .storage import Storage
        # Determine DB path from YAML bootstrap
        config_payload = cfg or load_config()
        db_path = get_database_path(config_payload)
        st = Storage(db_path)
        st.init_db()
        # Prefer dedicated tables (Phase 20.1)
        task_class_rows = st.list_task_classes()
        tool_rows = st.list_tools_table()
        if task_class_rows or tool_rows:
            tc_dict = {row["name"]: {"timeout": row.get("timeout"), "description": row.get("description")} for row in task_class_rows}
            tool_dict = {row["name"]: {"description": row.get("description"), "task_class": row.get("task_class")} for row in tool_rows}
            return {"tools": _seed_default_tools(tool_dict), "task_classes": tc_dict}

        # Fallback to config table if tables not populated yet
        entries = st.list_config_entries()
        if not entries:
            return None
        tools_cfg = None
        task_classes_cfg = None
        for entry in entries:
            if entry.get("namespace") == "tools":
                tools_cfg = entry.get("value")
            if entry.get("namespace") == "task_classes":
                task_classes_cfg = entry.get("value")
        if tools_cfg is None and task_classes_cfg is None:
            return None
        return {
            "tools": tools_cfg or {},
            "task_classes": task_classes_cfg or {},
        }
    except Exception:
        return None


def _seed_default_tools(existing: dict) -> dict:
    """
    Ensure baseline tools exist when config is empty.

    If caller provides tools, respect them as-is to avoid surprising additions.
    """
    if existing:
        return existing
    return {
        "run-bash": {"description": "Bash script", "task_class": "MEDIUM_SCRIPT"},
        "run-python": {"description": "Python script", "task_class": "MEDIUM_SCRIPT"},
        "llm-haiku": {"description": "Haiku", "task_class": "LLM_LITE"},
        "llm-sonnet": {"description": "Sonnet", "task_class": "LLM_HEAVY"},
        "llm-codex": {"description": "Codex", "task_class": "LLM_HEAVY"},
        "quick-check": {"description": "Quick validation check", "task_class": "FAST_SCRIPT"},
        "script-index": {"description": "Index project scripts", "task_class": "MEDIUM_SCRIPT"},
    }
