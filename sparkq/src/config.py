"""Shared config loading helpers."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict, Optional
import socket

import yaml

from .paths import get_config_path, get_default_db_path, reset_paths_cache

logger = logging.getLogger(__name__)

CONFIG_PATH = get_config_path()
DEFAULT_DB_PATH = get_default_db_path()
DEFAULT_SERVER = {"host": "0.0.0.0", "port": 5005}


def load_config(path: Path | str | None = None) -> Dict[str, Any]:
    """
    Load sparkq.yml if present; return empty dict when missing.

    Parse/IO errors are logged and surfaced to callers to prevent silent fallbacks.
    """
    config_path = Path(path) if path is not None else get_config_path()
    if not config_path.exists():
        return {}
    try:
        with open(config_path) as f:
            return yaml.safe_load(f) or {}
    except Exception as exc:
        logger.error("Failed to load config from %s: %s", config_path, exc)
        raise ValueError(f"Failed to load config at {config_path}: {exc}") from exc


def get_database_path(config: Optional[Dict[str, Any]] = None) -> str:
    """Return configured database path or default, resolved to an absolute path."""
    cfg = config or load_config()
    raw_path = cfg.get("database", {}).get("path")
    if not raw_path:
        return str(DEFAULT_DB_PATH)

    path = Path(raw_path).expanduser()
    if not path.is_absolute():
        path = get_config_path().parent / path
    return str(path.resolve())


def get_queue_runner_config(config: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Return queue_runner section (empty dict if missing)."""
    cfg = config or load_config()
    return cfg.get("queue_runner", {}) or {}


def get_server_config(config: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Return server config merged with defaults."""
    cfg = config or load_config()
    server_cfg = cfg.get("server") or {}
    return {
        "host": server_cfg.get("host", DEFAULT_SERVER["host"]),
        "port": server_cfg.get("port", DEFAULT_SERVER["port"]),
    }


def resolve_base_url(config: Optional[Dict[str, Any]] = None) -> str:
    """
    Resolve the API base URL using queue_runner config or host/port defaults.

    Preference:
    1) queue_runner.base_url if provided
    2) http://{local_ip}:{server.port} (falls back to localhost on lookup failure)
    """
    cfg = config or load_config()
    qr_cfg = get_queue_runner_config(cfg)
    base_override = qr_cfg.get("base_url")
    if base_override:
        return base_override.rstrip("/")

    server_cfg = get_server_config(cfg)
    port = server_cfg.get("port", DEFAULT_SERVER["port"])

    try:
        hostname = socket.gethostname()
        local_ip = socket.gethostbyname(hostname)
    except (socket.error, Exception):
        local_ip = "localhost"

    return f"http://{local_ip}:{port}"
