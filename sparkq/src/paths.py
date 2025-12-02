"""Centralized path resolution for SparkQ project.

This module provides dynamic path resolution to ensure portability.
All paths are resolved relative to the project structure, not hardcoded.
"""
import os
from functools import lru_cache
from pathlib import Path
from typing import Callable


def _cacheable(fn: Callable) -> Callable:
    """Decorator to cache path helpers when SPARKQ_CONFIG is not set."""

    cached = lru_cache(maxsize=None)(fn)

    def wrapper(*args, **kwargs):
        if os.environ.get("SPARKQ_CONFIG"):
            # Avoid caching when an explicit override is set; compute fresh
            return fn(*args, **kwargs)
        return cached(*args, **kwargs)

    wrapper.cache_clear = getattr(cached, "cache_clear", lambda: None)  # type: ignore[attr-defined]
    return wrapper


@_cacheable
def get_project_root() -> Path:
    """Get the project root directory (parent of sparkq/ folder)."""
    return Path(__file__).resolve().parent.parent.parent


@_cacheable
def get_sparkq_dir() -> Path:
    """Get the sparkq/ source directory."""
    return Path(__file__).resolve().parent.parent


@_cacheable
def get_config_path() -> Path:
    """Get the default sparkq.yml config file path with overrides.

    Resolution order:
      1) Environment variable SPARKQ_CONFIG (if set)
      2) Current working directory sparkq.yml (if exists)
      3) Project root sparkq.yml
    """
    env_path = os.environ.get("SPARKQ_CONFIG")
    if env_path:
        return Path(env_path).resolve()

    cwd_path = Path.cwd() / "sparkq.yml"
    if cwd_path.exists():
        return cwd_path.resolve()
    return (get_project_root() / "sparkq.yml").resolve()


@_cacheable
def get_default_db_path() -> str:
    """Get the default database path."""
    return str(get_project_root() / "sparkq" / "data" / "sparkq.db")


@_cacheable
def get_lockfile_path() -> Path:
    """Get the server lockfile path."""
    return (get_project_root() / "sparkq.lock").resolve()


@_cacheable
def get_test_logs_dir() -> Path:
    """Get the test logs directory."""
    return (get_sparkq_dir() / "tests" / "logs").resolve()


@_cacheable
def get_build_prompts_dir() -> Path:
    """Get the build prompts directory."""
    return (get_project_root() / "_build" / "prompts").resolve()


@_cacheable
def get_ui_dir() -> Path:
    """Get the UI static files directory."""
    return (get_sparkq_dir() / "ui").resolve()


def reset_paths_cache() -> None:
    """Clear cached path resolutions (useful for tests/fixtures)."""
    for fn in (
        get_project_root,
        get_sparkq_dir,
        get_config_path,
        get_default_db_path,
        get_lockfile_path,
        get_test_logs_dir,
        get_build_prompts_dir,
        get_ui_dir,
    ):
        if hasattr(fn, "cache_clear"):
            fn.cache_clear()  # type: ignore[attr-defined]
