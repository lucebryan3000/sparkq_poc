"""SparkQ Tool Registry"""

import yaml
from pathlib import Path
from typing import Optional

# Helper imports inside functions to avoid circular dependencies


class ToolRegistry:
    """Manages tool definitions and task class timeouts from config."""

    def __init__(self, config_path: str = "sparkq.yml", config_dict: dict | None = None, source: str = "yaml"):
        self.config_path = config_path
        self.tools: dict = {}
        self.task_classes: dict = {}
        self.source: str = source
        if config_dict is not None:
            self.tools = config_dict.get("tools", {}) or {}
            self.task_classes = config_dict.get("task_classes", {}) or {}
        else:
            self._load_config()

    def _load_config(self):
        """Load tools and task_classes from YAML config"""
        try:
            with open(self.config_path, 'r') as f:
                config = yaml.safe_load(f) or {}
                self.tools = config.get('tools', {}) or {}
                self.task_classes = config.get('task_classes', {}) or {}
        except FileNotFoundError:
            # Config doesn't exist yet - return empty dicts
            self.tools = {}
            self.task_classes = {}
    
    def get_tool(self, name: str) -> dict | None:
        """Get tool config by name"""
        return self.tools.get(name)
    
    def list_tools(self) -> list[str]:
        """Get list of all tool names"""
        return list(self.tools.keys())
    
    def get_timeout(self, tool_name: str, override: int | None = None) -> int:
        """
        Resolve timeout for a tool.
        Priority: override > task_class timeout > default 300
        """
        if override is not None:
            return override
        
        tool = self.get_tool(tool_name)
        if not tool:
            return 300  # Default fallback
        
        task_class_name = tool.get('task_class')
        if not task_class_name:
            return 300  # Default fallback
        
        task_class = self.task_classes.get(task_class_name, {})
        return task_class.get('timeout', 300)
    
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
    db_config = _load_tools_from_db_config()
    if db_config:
        return ToolRegistry(config_dict=db_config, source="db")
    return ToolRegistry()


def _load_tools_from_db_config() -> Optional[dict]:
    """Load tools/task_classes from config table if available."""
    try:
        from .storage import Storage
        import yaml
        # Determine DB path from YAML bootstrap
        db_path = "sparkq/data/sparkq.db"
        config_path = Path("sparkq.yml")
        if config_path.exists():
            with open(config_path) as f:
                cfg = yaml.safe_load(f) or {}
                db_path = cfg.get("database", {}).get("path", db_path)
        st = Storage(db_path)
        st.init_db()
        # Prefer dedicated tables (Phase 20.1)
        task_class_rows = st.list_task_classes()
        tool_rows = st.list_tools_table()
        if task_class_rows or tool_rows:
            tc_dict = {row["name"]: {"timeout": row.get("timeout"), "description": row.get("description")} for row in task_class_rows}
            tool_dict = {row["name"]: {"description": row.get("description"), "task_class": row.get("task_class")} for row in tool_rows}
            return {"tools": tool_dict, "task_classes": tc_dict}

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
