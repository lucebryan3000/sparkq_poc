"""SparkQ Tool Registry"""

import yaml
from pathlib import Path
from typing import Optional


class ToolRegistry:
    """Manages tool definitions and task class timeouts from sparkq.yml"""
    
    def __init__(self, config_path: str = "sparkq.yml"):
        self.config_path = config_path
        self.tools: dict = {}
        self.task_classes: dict = {}
        self._load_config()
    
    def _load_config(self):
        """Load tools and task_classes from YAML config"""
        try:
            with open(self.config_path, 'r') as f:
                config = yaml.safe_load(f) or {}
                self.tools = config.get('tools', {})
                self.task_classes = config.get('task_classes', {})
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
    """Get or create singleton ToolRegistry instance"""
    global _registry
    if _registry is None:
        _registry = ToolRegistry()
    return _registry


def reload_registry() -> ToolRegistry:
    """Force reload config and return new ToolRegistry instance"""
    global _registry
    _registry = ToolRegistry()
    return _registry
