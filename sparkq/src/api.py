import inspect
import json
import logging
import os
import sqlite3
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import Body, FastAPI, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .constants import (
    CONFIG_CACHE_TTL_SECONDS,
    DEFAULT_AUTO_FAIL_INTERVAL_SECONDS,
    STALE_FAIL_MULTIPLIER,
    STALE_WARNING_MULTIPLIER,
    TASK_CLASS_TIMEOUTS,
)
from .config import get_database_path, load_config
from .agent_roles import build_prompt_with_role
from .errors import ConflictError, NotFoundError, SparkQError, ValidationError
from .index import ScriptIndex
from .models import TaskStatus
from .paths import get_build_prompts_dir, get_ui_dir, get_config_path
from .storage import Storage, now_iso
from .tools import get_registry, reload_registry
from .env import get_app_env, is_dev_env

logger = logging.getLogger(__name__)
CONFIG_PATH = get_config_path()
_config_boot = load_config(CONFIG_PATH)
storage = Storage(get_database_path(_config_boot))
SERVER_BUILD_ID = "b713"
APP_ENV = get_app_env()
DEV_CACHE_BUSTER = os.environ.get("SPARKQ_CACHE_BUSTER") or str(int(time.time()))
_DEV_NO_CACHE_HEADERS = {
    "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0",
}
_config_cache: Dict[str, Any] = {"data": None, "expires_at": 0.0}

@asynccontextmanager
async def lifespan(_: FastAPI):
    """App lifecycle hooks."""
    storage.init_db()
    yield


app = FastAPI(title="SparkQ API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_no_cache_headers(request: Request, call_next):
    """Add no-cache headers to static files to prevent browser caching during development."""
    response = await call_next(request)

    # Add aggressive no-cache headers to all static UI files when in dev mode
    if is_dev_env() and _is_ui_static_request(request.url.path):
        for header, value in _DEV_NO_CACHE_HEADERS.items():
            response.headers[header] = value
        # Remove ETag header if present (prevents 304 Not Modified)
        if "etag" in response.headers:
            del response.headers["etag"]

    return response


def _is_ui_static_request(path: str) -> bool:
    """Return True for UI asset paths that should bypass caching in dev."""
    return path == "/" or path.startswith("/ui") or path == "/ui-cache-buster.js"


def _list_build_prompt_files() -> list[str]:
    """Return non-recursive list of Markdown prompt filenames under _build/prompts."""
    prompts_dir = get_build_prompts_dir()
    if not prompts_dir.exists() or not prompts_dir.is_dir():
        return []

    prompt_files = []
    for entry in sorted(prompts_dir.iterdir()):
        if entry.is_file() and entry.suffix.lower() == ".md":
            prompt_files.append(entry.name)
    return prompt_files


def _read_build_prompt_file(filename: str) -> str:
    """Load a prompt file by name from _build/prompts with traversal protection."""
    if not filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=404, detail="Prompt file not found")

    prompts_dir = get_build_prompts_dir().resolve()
    try:
        target = (prompts_dir / filename).resolve()
    except Exception:
        raise HTTPException(status_code=404, detail="Prompt file not found")

    if target.parent != prompts_dir or target.suffix.lower() != ".md":
        raise HTTPException(status_code=404, detail="Prompt file not found")
    if not target.is_file():
        raise HTTPException(status_code=404, detail="Prompt file not found")

    try:
        return target.read_text(encoding="utf-8")
    except OSError:
        logger.exception("Failed to read prompt file: %s", target)
        raise HTTPException(status_code=500, detail="Failed to read prompt file")


@app.get("/")
async def root():
    """Redirect root to UI dashboard."""
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url="/ui/")

static_dir = get_ui_dir()
app.mount("/ui", StaticFiles(directory=static_dir, html=True, check_dir=False), name="ui")


def _serve_ui_index():
    index_path = Path(static_dir) / "index.html"
    if not index_path.is_file():
        raise HTTPException(status_code=404, detail="UI not built")
    return FileResponse(index_path)


@app.get("/dashboard", include_in_schema=False)
@app.get("/settings", include_in_schema=False)
async def serve_spa_routes():
    """Serve the UI index for SPA routes so front-end routing can handle them."""
    return _serve_ui_index()


def _cache_buster_value() -> str:
    """Return cache-buster token; stable during a single process."""
    if is_dev_env():
        return os.environ.get("SPARKQ_CACHE_BUSTER") or DEV_CACHE_BUSTER
    return os.environ.get("SPARKQ_CACHE_BUSTER") or _current_build_id()


@app.get("/ui-cache-buster.js")
async def ui_cache_buster():
    """Expose environment and cache-buster details to the UI."""
    env = APP_ENV
    cache_buster = _cache_buster_value()
    body_lines = [
        f"window.__SPARKQ_ENV__ = {json.dumps(env)};",
        f"window.__SPARKQ_CACHE_BUSTER__ = {json.dumps(cache_buster)};",
        f"window.__SPARKQ_BUILD_ID__ = {json.dumps(_current_build_id())};",
        "window.__BUILD_ID__ = window.__SPARKQ_BUILD_ID__;",
    ]
    headers = dict(_DEV_NO_CACHE_HEADERS) if env in {"dev", "test"} else {}
    return Response(content="\n".join(body_lines), media_type="application/javascript", headers=headers)


TASK_STATUS_VALUES = {status.value for status in TaskStatus}

_LIST_HAS_OFFSET = "offset" in inspect.signature(storage.list_tasks).parameters
_CREATE_HAS_PAYLOAD = "payload" in inspect.signature(storage.create_task).parameters
_CLAIM_HAS_WORKER = "worker_id" in inspect.signature(storage.claim_task).parameters


def _normalize_agent_role_key(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = str(value).strip()
    return cleaned or None


def _resolve_agent_role(role_key: Optional[str], allow_inactive: bool = False) -> Optional[dict]:
    normalized = _normalize_agent_role_key(role_key)
    if not normalized:
        return None
    role = storage.get_agent_role_by_key(normalized, include_inactive=allow_inactive)
    if not role:
        raise HTTPException(status_code=400, detail=f"Agent role not found: {normalized}")
    if not allow_inactive and not role.get("active"):
        raise HTTPException(status_code=400, detail=f"Agent role '{normalized}' is not active")
    return role


def _build_prompt_payload(prompt_text: str, queue: dict, agent_role: Optional[dict]) -> Dict[str, Any]:
    instructions = (queue.get("instructions") or "").strip()
    full_prompt = build_prompt_with_role(prompt_text, instructions, agent_role)
    payload: Dict[str, Any] = {
        "prompt": full_prompt,
        "raw_prompt": prompt_text,
        "mode": "chat",
    }
    if instructions:
        payload["queue_instructions"] = instructions
    if agent_role:
        payload["agent_role_key"] = agent_role.get("key")
        payload["agent_role_label"] = agent_role.get("label")
        payload["agent_role_description"] = agent_role.get("description")
    return payload


# === Config helpers (Phase 20) ===
def _load_yaml_defaults() -> Dict[str, Any]:
    """Load defaults from sparkq.yml; fallback to sane defaults."""
    defaults = {
        "server": {"port": 5005, "host": "0.0.0.0"},
        "database": {"path": "sparkq/data/sparkq.db", "mode": "wal"},
        "purge": {"older_than_days": 3},
        "queue_runner": {
            "poll_interval": 30,
            "auto_fail_interval_seconds": DEFAULT_AUTO_FAIL_INTERVAL_SECONDS,
            "base_url": None,
        },
        "tools": {},
        "task_classes": {},
        "ui": {"build_id": SERVER_BUILD_ID},
        "features": {"flags": {}},
        "defaults": {"queue": {}},
    }
    full = load_config(get_config_path())
    if not full:
        return defaults

    try:
        defaults["server"] = full.get("server", defaults["server"]) or defaults["server"]
        defaults["database"] = full.get("database", defaults["database"]) or defaults["database"]
        defaults["purge"] = full.get("purge", defaults["purge"]) or defaults["purge"]
        defaults["queue_runner"] = full.get("queue_runner", defaults["queue_runner"]) or defaults["queue_runner"]
        defaults["tools"] = full.get("tools", {}) or {}
        defaults["task_classes"] = full.get("task_classes", {}) or {}
        defaults["ui"] = {"build_id": SERVER_BUILD_ID}
        defaults["features"] = {"flags": {}}
        defaults["defaults"] = {"queue": {}}
    except Exception:
        logger.exception("Failed to load %s; using defaults", get_config_path())
    return defaults


def _invalidate_config_cache():
    _config_cache["data"] = None
    _config_cache["expires_at"] = 0.0


def _seed_config_if_empty(defaults: Dict[str, Any]):
    """Seed config table once from YAML defaults if empty."""
    try:
        storage.init_db()
        if storage.count_config_entries() > 0:
            return
        seed_payload = {
            "purge": {"config": defaults.get("purge", {})},
            "queue_runner": {"config": defaults.get("queue_runner", {})},
            "tools": {"all": defaults.get("tools", {})},
            "task_classes": {"all": defaults.get("task_classes", {})},
            "ui": {"build_id": defaults.get("ui", {}).get("build_id", SERVER_BUILD_ID)},
            "features": {"flags": defaults.get("features", {}).get("flags", {})},
            "defaults": {"queue": defaults.get("defaults", {}).get("queue", {})},
        }
        for namespace, kv in seed_payload.items():
            for key, value in kv.items():
                storage.upsert_config_entry(namespace, key, value, updated_by="seed")
    except Exception:
        logger.exception("Failed to seed config table; continuing with defaults")


def _seed_tools_task_classes_if_empty(defaults: Dict[str, Any], db_config: Dict[str, Dict[str, Any]]):
    """
    Seed tools/task_classes tables if empty using config table or YAML defaults.
    Config table values win over YAML if present.
    """
    try:
        existing_tcs = storage.list_task_classes()
        existing_tools = storage.list_tools_table()
        if existing_tcs or existing_tools:
            return

        source_task_classes = db_config.get("task_classes", {}).get("all") or defaults.get("task_classes", {})
        source_tools = db_config.get("tools", {}).get("all") or defaults.get("tools", {})

        for name, cfg in (source_task_classes or {}).items():
            timeout = cfg.get("timeout") if isinstance(cfg, dict) else None
            description = cfg.get("description") if isinstance(cfg, dict) else None
            if timeout is None:
                continue
            storage.upsert_task_class(name, int(timeout), description)

        for name, cfg in (source_tools or {}).items():
            task_class = cfg.get("task_class") if isinstance(cfg, dict) else None
            description = cfg.get("description") if isinstance(cfg, dict) else None
            if not task_class:
                continue
            try:
                storage.upsert_tool_record(name, task_class, description)
            except ValueError:
                # Skip tools with missing task_class if seed ordering was off
                continue
    except Exception:
        logger.exception("Failed to seed tools/task_classes tables; continuing with defaults")


def _task_classes_dict(rows: Any) -> Dict[str, Any]:
    mapping: Dict[str, Any] = {}
    for row in rows or []:
        mapping[row["name"]] = {
            "timeout": row.get("timeout"),
            "description": row.get("description"),
        }
    return mapping


def _tools_dict(rows: Any) -> Dict[str, Any]:
    mapping: Dict[str, Any] = {}
    for row in rows or []:
        mapping[row["name"]] = {
            "description": row.get("description"),
            "task_class": row.get("task_class"),
        }
    return mapping


def _sync_task_classes_payload(payload: Dict[str, Any]):
    existing = {tc["name"] for tc in storage.list_task_classes()}
    incoming = set(payload.keys())

    for name, cfg in payload.items():
        timeout = cfg.get("timeout")
        description = cfg.get("description")
        if timeout is None or not isinstance(timeout, int) or timeout <= 0:
            raise HTTPException(status_code=400, detail=f"task_class '{name}' timeout must be > 0")
        storage.upsert_task_class(name, int(timeout), description)

    stale = existing - incoming
    for name in stale:
        try:
            storage.delete_task_class(name)
        except SparkQError as exc:
            raise HTTPException(status_code=_status_code_for_error(exc), detail=str(exc)) from exc


def _sync_tools_payload(payload: Dict[str, Any]):
    existing = {tool["name"] for tool in storage.list_tools_table()}
    incoming = set(payload.keys())

    for name, cfg in payload.items():
        task_class = cfg.get("task_class")
        description = cfg.get("description")
        if not task_class or not isinstance(task_class, str):
            raise HTTPException(status_code=400, detail=f"tool '{name}' missing task_class")
        try:
            storage.upsert_tool_record(name, task_class, description)
        except SparkQError as exc:
            raise HTTPException(status_code=_status_code_for_error(exc), detail=str(exc)) from exc

    stale = existing - incoming
    for name in stale:
        storage.delete_tool_record(name)


def _build_config_response(include_cache: bool = True) -> Dict[str, Any]:
    now = time.time()
    if include_cache and _config_cache["data"] and now < _config_cache["expires_at"]:
        return _config_cache["data"]

    defaults = _load_yaml_defaults()
    _seed_config_if_empty(defaults)

    db_config = storage.export_config()
    _seed_tools_task_classes_if_empty(defaults, db_config)

    purge = db_config.get("purge", {}).get("config", defaults.get("purge"))
    raw_queue_runner = db_config.get("queue_runner", {}).get("config")
    queue_runner_cfg = raw_queue_runner if isinstance(raw_queue_runner, dict) else defaults.get("queue_runner", {}) or {}
    task_class_rows = storage.list_task_classes()
    tool_rows = storage.list_tools_table()
    task_classes = _task_classes_dict(task_class_rows) or defaults.get("task_classes")
    tools = _tools_dict(tool_rows) or defaults.get("tools")
    ui_cfg = db_config.get("ui", {})
    ui_build_id = ui_cfg.get("build_id", defaults.get("ui", {}).get("build_id", SERVER_BUILD_ID))
    feature_flags = db_config.get("features", {}).get("flags", {})
    defaults_cfg = db_config.get("defaults", {})
    queue_defaults = defaults_cfg.get("queue", {})
    default_model = defaults_cfg.get("model", defaults.get("defaults", {}).get("model", "llm-sonnet"))

    response = {
        "server": defaults.get("server"),
        "database": defaults.get("database"),
        "purge": purge,
        "queue_runner": queue_runner_cfg,
        "tools": tools,
        "task_classes": task_classes,
        "ui": {"build_id": ui_build_id},
        "features": {"flags": feature_flags},
        "defaults": {
            "queue": queue_defaults,
            "model": default_model
        },
        "stale_handling": {
            "warn_multiplier": STALE_WARNING_MULTIPLIER,
            "fail_multiplier": STALE_FAIL_MULTIPLIER,
            "auto_fail_interval_seconds": queue_runner_cfg.get(
                "auto_fail_interval_seconds", DEFAULT_AUTO_FAIL_INTERVAL_SECONDS
            ),
        },
    }

    _config_cache["data"] = response
    _config_cache["expires_at"] = now + CONFIG_CACHE_TTL_SECONDS
    return response


def _current_build_id() -> str:
    try:
        cfg = _build_config_response(include_cache=True)
        return cfg.get("ui", {}).get("build_id", SERVER_BUILD_ID)
    except Exception:
        return SERVER_BUILD_ID


def _validate_config_value(namespace: str, key: str, value: Any):
    """Enforce basic constraints for known config namespaces."""
    ns = namespace.lower()
    if ns == "purge" and key == "config":
        if not isinstance(value, dict):
            raise HTTPException(status_code=400, detail="purge config must be an object")
        days = value.get("older_than_days")
        if not isinstance(days, int) or days <= 0:
            raise HTTPException(status_code=400, detail="older_than_days must be a positive integer")
        return
    if ns == "queue_runner" and key == "config":
        if not isinstance(value, dict):
            raise HTTPException(status_code=400, detail="queue_runner config must be an object")
        poll = value.get("poll_interval")
        if poll is not None and (not isinstance(poll, int) or poll <= 0):
            raise HTTPException(status_code=400, detail="poll_interval must be a positive integer")
        auto_fail_interval = value.get("auto_fail_interval_seconds")
        if auto_fail_interval is not None and (not isinstance(auto_fail_interval, int) or auto_fail_interval <= 0):
            raise HTTPException(status_code=400, detail="auto_fail_interval_seconds must be a positive integer")
        base_url = value.get("base_url")
        if base_url is not None and (not isinstance(base_url, str) or not base_url.strip()):
            raise HTTPException(status_code=400, detail="base_url must be a non-empty string when provided")
        return
    if ns == "tools" and key == "all":
        if not isinstance(value, dict):
            raise HTTPException(status_code=400, detail="tools must be an object keyed by tool name")
        for tool_name, cfg in value.items():
            if not tool_name or not isinstance(tool_name, str):
                raise HTTPException(status_code=400, detail="tool names must be non-empty strings")
            if not isinstance(cfg, dict):
                raise HTTPException(status_code=400, detail=f"tool '{tool_name}' config must be an object")
            task_class = cfg.get("task_class")
            if not task_class or not isinstance(task_class, str):
                raise HTTPException(status_code=400, detail=f"tool '{tool_name}' missing task_class")
        return
    if ns == "task_classes" and key == "all":
        if not isinstance(value, dict):
            raise HTTPException(status_code=400, detail="task_classes must be an object keyed by class name")
        for name, cfg in value.items():
            if not name or not isinstance(name, str):
                raise HTTPException(status_code=400, detail="task_class names must be non-empty strings")
            if not isinstance(cfg, dict):
                raise HTTPException(status_code=400, detail=f"task_class '{name}' config must be an object")
            timeout = cfg.get("timeout")
            if not isinstance(timeout, int) or timeout <= 0:
                raise HTTPException(status_code=400, detail=f"task_class '{name}' timeout must be > 0")
        return
    if ns == "ui" and key == "build_id":
        if not isinstance(value, str) or not value.strip():
            raise HTTPException(status_code=400, detail="build_id must be a non-empty string")
        return
    if ns == "features" and key == "flags":
        if not isinstance(value, dict):
            raise HTTPException(status_code=400, detail="feature flags must be an object")
        return
    if ns == "defaults" and key == "queue":
        if not isinstance(value, dict):
            raise HTTPException(status_code=400, detail="queue defaults must be an object")
        return
    raise HTTPException(status_code=400, detail=f"Unsupported config namespace/key: {namespace}/{key}")


def _format_error(message: Optional[str]) -> str:
    if not message:
        return "Error: Internal server error"
    return message if str(message).startswith("Error:") else f"Error: {message}"


def _error_response(message: Optional[str], status_code: int) -> JSONResponse:
    return JSONResponse({"error": _format_error(message), "status": status_code}, status_code=status_code)


def _status_code_for_error(exc: Exception) -> int:
    if isinstance(exc, NotFoundError):
        return 404
    if isinstance(exc, ConflictError):
        return 409
    return 400


@app.exception_handler(SparkQError)
async def sparkq_exception_handler(request: Request, exc: SparkQError):
    return _error_response(str(exc), _status_code_for_error(exc))


@app.exception_handler(ValueError)
async def storage_exception_handler(request: Request, exc: ValueError):
    return _error_response(str(exc), 400)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    missing_field = None
    for error in exc.errors():
        if error.get("type") == "value_error.missing":
            loc = error.get("loc") or []
            if loc and loc[0] == "body":
                missing_field = str(loc[-1])
                break

    if missing_field:
        message = f"Missing field {missing_field}"
    else:
        message = "Invalid request parameters"

    return _error_response(message, 400)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    if exc.status_code >= 500:
        logger.exception("HTTPException encountered: %s", exc)
    return _error_response(str(exc.detail) if exc.detail else None, exc.status_code)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled server error")
    return _error_response("Internal server error", 500)


class SessionCreateRequest(BaseModel):
    name: str
    description: Optional[str] = None


class SessionUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class QueueCreateRequest(BaseModel):
    session_id: str
    name: str
    instructions: Optional[str] = None
    default_agent_role_key: Optional[str] = None


class QueueUpdateRequest(BaseModel):
    name: Optional[str] = None
    instructions: Optional[str] = None
    default_agent_role_key: Optional[str] = None


class CodexSessionRequest(BaseModel):
    session_id: str


class TaskCreateRequest(BaseModel):
    queue_id: str
    tool_name: str
    task_class: str
    timeout: Optional[int] = None
    prompt_path: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    agent_role_key: Optional[str] = None


class TaskClaimRequest(BaseModel):
    worker_id: Optional[str] = None


class TaskCompleteRequest(BaseModel):
    result_summary: str
    result_data: Optional[str] = None


class TaskFailRequest(BaseModel):
    error_message: str
    error_type: Optional[str] = None


class TaskResetRequest(BaseModel):
    target_status: Optional[str] = "running"


class QuickAddTaskRequest(BaseModel):
    queue_id: str
    mode: str  # 'llm' or 'script'

    # For LLM mode
    prompt: Optional[str] = None
    tool_name: Optional[str] = None

    # For script mode
    script_path: Optional[str] = None
    script_args: Optional[str] = None
    agent_role_key: Optional[str] = None


class ConfigUpdateRequest(BaseModel):
    value: Any


class TaskClassPayload(BaseModel):
    name: Optional[str] = None
    timeout: int
    description: Optional[str] = None


class ToolPayload(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    task_class: str


@app.post("/api/config/validate")
async def validate_config(payload: ConfigUpdateRequest):
    """Dry-run validation for config payload (expects {value}) without persisting."""
    value = payload.value
    if not isinstance(value, dict):
        raise HTTPException(status_code=400, detail="value must be an object with namespace->key maps")
    # Allow multiple namespace/key pairs in one call
    for namespace, items in value.items():
        if not isinstance(items, dict):
            raise HTTPException(status_code=400, detail=f"Namespace {namespace} must map to an object of key/value")
        for key, val in items.items():
            _validate_config_value(namespace, key, val)
    return {"status": "ok"}


class PromptCreateRequest(BaseModel):
    command: str
    label: str
    template_text: str
    description: Optional[str] = None


class PromptUpdateRequest(BaseModel):
    command: Optional[str] = None
    label: Optional[str] = None
    template_text: Optional[str] = None
    description: Optional[str] = None


class AgentRoleUpdateRequest(BaseModel):
    label: Optional[str] = None
    description: Optional[str] = None
    active: Optional[bool] = None


def _serialize_task(task: Dict[str, Any], queue_names: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    """Normalize task fields for API responses."""
    serialized = dict(task)

    # Friendly ID: <QUEUE>-<last4>
    queue_name = None
    queue_id = serialized.get("queue_id")
    if queue_id:
        if queue_names:
            queue_name = queue_names.get(queue_id)
        if queue_name is None:
            queue_obj = storage.get_queue(queue_id)
            queue_name = queue_obj["name"] if queue_obj else None
    friendly_prefix = (queue_name or queue_id or "TASK")
    friendly_prefix = friendly_prefix.upper()
    short_id = (str(serialized.get("id") or "")[-4:] or "0000")
    serialized["friendly_id"] = f"{friendly_prefix}-{short_id}"

    serialized.setdefault("claimed_at", serialized.get("started_at"))

    finished_at = serialized.get("finished_at")
    status = serialized.get("status")
    if status == "succeeded":
        serialized.setdefault("completed_at", finished_at)
        serialized.setdefault("failed_at", None)
    elif status == "failed":
        serialized.setdefault("failed_at", finished_at)
        serialized.setdefault("completed_at", None)
    else:
        serialized.setdefault("completed_at", None)
        serialized.setdefault("failed_at", None)

    if "result_summary" not in serialized and "result" in serialized:
        serialized["result_summary"] = serialized.get("result")
    if "error_message" not in serialized and "error" in serialized:
        serialized["error_message"] = serialized.get("error")
    payload_obj = None
    payload = serialized.get("payload")
    if isinstance(payload, str):
        try:
            payload_obj = json.loads(payload)
        except Exception:
            payload_obj = None

    if "prompt_preview" not in serialized:
        preview = None
        if payload_obj is not None:
            preview = payload_obj.get("prompt") or payload_obj.get("prompt_text") or payload_obj.get("prompt_path")
        elif isinstance(payload, str):
            preview = payload
        serialized["prompt_preview"] = preview

    if payload_obj:
        serialized.setdefault("prompt", payload_obj.get("prompt"))
        serialized.setdefault("raw_prompt", payload_obj.get("raw_prompt"))
        serialized.setdefault("agent_role_key", payload_obj.get("agent_role_key") or serialized.get("agent_role_key"))
        if payload_obj.get("agent_role_label"):
            serialized.setdefault("agent_role_label", payload_obj.get("agent_role_label"))
        if payload_obj.get("agent_role_description"):
            serialized.setdefault("agent_role_description", payload_obj.get("agent_role_description"))

    return serialized


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "build_id": _current_build_id(),
    }


@app.get("/api/version")
async def version():
    """Return the current UI/server build id for cache-busting or auto-reload."""
    return {"build_id": _current_build_id(), "timestamp": datetime.now(timezone.utc).isoformat()}


@app.get("/api/build-prompts")
async def list_build_prompts():
    """
    List Markdown prompts under _build/prompts (non-recursive).
    Returns relative paths from repo root for compatibility.
    """
    prompts_dir = get_build_prompts_dir()
    repo_root = prompts_dir.parent.parent
    prompts = []
    for name in _list_build_prompt_files():
        path = (prompts_dir / name).resolve()
        try:
            rel = path.relative_to(repo_root)
            rel_str = str(rel)
        except ValueError:
            rel_str = name
        prompts.append({"name": name, "path": rel_str})
    return {"prompts": prompts}


@app.get("/stats")
async def stats():
    """Get dashboard statistics."""
    try:
        sessions = storage.list_sessions()
        queues = storage.list_queues()
        tasks = storage.list_tasks()

        queued_count = sum(1 for t in tasks if t.get("status") == "queued")
        running_count = sum(1 for t in tasks if t.get("status") == "running")

        return {
            "sessions": len(sessions),
            "queues": len(queues),
            "queued_tasks": queued_count,
            "running_tasks": running_count,
        }
    except Exception as exc:
        logger.exception("Failed to compute stats: %s", exc)
        return {
            "sessions": 0,
            "queues": 0,
            "queued_tasks": 0,
            "running_tasks": 0,
        }


@app.get("/api/sessions")
async def list_sessions(limit: int = 100, offset: int = 0):
    if limit < 0 or offset < 0:
        raise HTTPException(
            status_code=400, detail="Invalid pagination parameters: limit and offset must be non-negative"
        )

    sessions = storage.list_sessions()
    paginated_sessions = sessions[offset : offset + limit] if limit is not None else sessions[offset:]
    return {"sessions": paginated_sessions}


@app.post("/api/sessions")
async def create_session(request: SessionCreateRequest):
    if not request.name or not request.name.strip():
        raise HTTPException(status_code=400, detail="Session name is required")

    session = storage.create_session(request.name.strip(), request.description)
    return {"session": session}


@app.get("/api/sessions/{session_id}")
async def get_session(session_id: str):
    session = storage.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"session": session}


@app.put("/api/sessions/{session_id}")
async def update_session(session_id: str, request: SessionUpdateRequest):
    if request.name is None and request.description is None:
        raise HTTPException(status_code=400, detail="No fields provided to update session")

    existing = storage.get_session(session_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Session not found")

    updates = []
    params = []

    if request.name is not None:
        if not request.name.strip():
            raise HTTPException(status_code=400, detail="Session name cannot be empty")
        updates.append("name = ?")
        params.append(request.name.strip())

    if request.description is not None:
        updates.append("description = ?")
        params.append(request.description)

    updates.append("updated_at = ?")
    params.append(now_iso())
    params.append(session_id)

    with storage.connection() as conn:
        cursor = conn.execute(
            f"UPDATE sessions SET {', '.join(updates)} WHERE id = ?",
            tuple(params),
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Session not found")

    updated_session = storage.get_session(session_id)
    return {"session": updated_session}


@app.put("/api/sessions/{session_id}/end")
async def end_session(session_id: str):
    ended = storage.end_session(session_id)
    if not ended:
        raise HTTPException(status_code=404, detail="Session not found")

    session = storage.get_session(session_id)
    return {"message": "Session ended", "session": session}


@app.delete("/api/sessions/{session_id}")
async def delete_session(session_id: str):
    deleted = storage.delete_session(session_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Session not found")

    return {"message": "Session deleted (cascade delete with all queues and tasks)"}


@app.get("/api/agent-roles")
async def list_agent_roles(active_only: bool = Query(True)):
    """List available agent roles for selection."""
    roles = storage.list_agent_roles(active_only=active_only)
    return {"roles": roles}


@app.put("/api/agent-roles/{role_key}")
async def update_agent_role(role_key: str, payload: AgentRoleUpdateRequest):
    """Update an agent role's label, description, or active flag."""
    if payload.label is None and payload.description is None and payload.active is None:
        raise HTTPException(status_code=400, detail="No fields provided to update agent role")

    try:
        updated = storage.update_agent_role(
            role_key=role_key,
            label=payload.label,
            description=payload.description,
            active=payload.active,
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {"role": updated}


@app.get("/api/queues")
async def list_queues(
    session_id: Optional[str] = None,
    limit: int = Query(100, ge=0),
    offset: int = Query(0, ge=0),
):
    queues = storage.list_queues(session_id=session_id)

    queue_ids = [q["id"] for q in queues]
    stats_map = storage.get_queue_stats(queue_ids)

    # Enhance with stats
    for queue in queues:
        queue_id = queue["id"]
        existing_status = str(queue.get("status") or "").lower()

        counts = stats_map.get(queue_id, {"total": 0, "done": 0, "running": 0, "queued": 0})
        total = counts["total"]
        done = counts["done"]
        running = counts["running"]
        queued = counts["queued"]

        queue["stats"] = {
            "total": total,
            "done": done,
            "running": running,
            "queued": queued,
            "progress": f"{done}/{total}" if total > 0 else "0/0"
        }

        # Determine status (preserve archived/ended)
        if existing_status == "archived":
            queue["status"] = "archived"
        elif existing_status == "ended":
            queue["status"] = "ended"
        elif running > 0:
            queue["status"] = "active"
        elif queued > 0:
            queue["status"] = "planned"
        else:
            queue["status"] = "idle"

    paginated_queues = queues[offset : offset + limit]
    return {"queues": paginated_queues}


@app.post("/api/queues", status_code=201)
async def create_queue(request: QueueCreateRequest):
    if not request.name or not request.name.strip():
        raise HTTPException(status_code=400, detail="Queue name is required")

    session = storage.get_session(request.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    role = _resolve_agent_role(request.default_agent_role_key)

    try:
        queue = storage.create_queue(
            session_id=request.session_id,
            name=request.name.strip(),
            instructions=request.instructions,
            default_agent_role_key=role["key"] if role else None,
        )
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=400, detail="Queue name must be unique") from exc

    return {"queue": queue}


@app.get("/api/queues/{queue_id}")
async def get_queue(queue_id: str):
    queue = storage.get_queue(queue_id)
    if not queue:
        raise HTTPException(status_code=404, detail="Queue not found")
    return {"queue": queue}


@app.put("/api/queues/{queue_id}")
async def update_queue(queue_id: str, request: QueueUpdateRequest):
    fields_set = request.__fields_set__ or set()
    role_provided = "default_agent_role_key" in fields_set

    if request.name is None and request.instructions is None and not role_provided:
        raise HTTPException(status_code=400, detail="No fields provided to update queue")

    existing = storage.get_queue(queue_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Queue not found")

    updates = []
    params = []

    if request.name is not None:
        if not request.name.strip():
            raise HTTPException(status_code=400, detail="Queue name cannot be empty")
        updates.append("name = ?")
        params.append(request.name.strip())

    if request.instructions is not None:
        updates.append("instructions = ?")
        params.append(request.instructions)

    if role_provided:
        normalized_key = _normalize_agent_role_key(request.default_agent_role_key)
        if normalized_key:
            role = _resolve_agent_role(normalized_key)
            params_key = role["key"]
        else:
            params_key = None
        updates.append("default_agent_role_key = ?")
        params.append(params_key)

    updates.append("updated_at = ?")
    params.append(now_iso())
    params.append(queue_id)

    try:
        with storage.connection() as conn:
            cursor = conn.execute(
                f"UPDATE queues SET {', '.join(updates)} WHERE id = ?",
                tuple(params),
            )
            if cursor.rowcount == 0:
                raise HTTPException(status_code=404, detail="Queue not found")
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=400, detail="Queue name must be unique") from exc

    updated_queue = storage.get_queue(queue_id)
    return {"queue": updated_queue}


@app.put("/api/queues/{queue_id}/end")
async def end_queue(queue_id: str):
    ended = storage.end_queue(queue_id)
    if not ended:
        raise HTTPException(status_code=404, detail="Queue not found")

    queue = storage.get_queue(queue_id)
    return {"message": "Queue ended", "queue": queue}


@app.put("/api/queues/{queue_id}/archive")
async def archive_queue(queue_id: str):
    archived = storage.archive_queue(queue_id)
    if not archived:
        raise HTTPException(status_code=404, detail="Queue not found")

    queue = storage.get_queue(queue_id)
    return {"message": "Queue archived", "queue": queue}


@app.put("/api/queues/{queue_id}/unarchive")
async def unarchive_queue(queue_id: str):
    success = storage.unarchive_queue(queue_id)
    if not success:
        raise HTTPException(status_code=404, detail="Queue not found")
    queue = storage.get_queue(queue_id)
    return {"message": "Queue unarchived", "queue": queue}


@app.post("/api/queues/{queue_id}/codex-session")
async def set_queue_codex_session_endpoint(queue_id: str, request: CodexSessionRequest) -> dict:
    """Store Codex CLI session ID for queue context continuity"""
    try:
        storage.set_queue_codex_session(queue_id, request.session_id)
        return {
            "status": "ok",
            "queue_id": queue_id,
            "codex_session_id": request.session_id
        }
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

@app.delete("/api/queues/{queue_id}")
async def delete_queue(queue_id: str):
    deleted = storage.delete_queue(queue_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Queue not found")

    return {"message": "Queue deleted"}


@app.get("/api/tasks")
async def list_tasks(
    queue_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(100, ge=1),
    offset: int = Query(0, ge=0),
):
    if status and status not in TASK_STATUS_VALUES:
        allowed_statuses = ", ".join(sorted(TASK_STATUS_VALUES))
        raise HTTPException(status_code=400, detail=f"Invalid status filter. Allowed values: {allowed_statuses}")

    effective_limit = min(limit, storage.max_task_list_limit)
    truncated = limit > storage.max_task_list_limit

    if _LIST_HAS_OFFSET:
        tasks = storage.list_tasks(queue_id=queue_id, status=status, limit=effective_limit, offset=offset)
    else:
        all_tasks = storage.list_tasks(queue_id=queue_id, status=status, limit=None)
        start = offset or 0
        end = start + effective_limit if effective_limit is not None else None
        tasks = all_tasks[start:end]
        truncated = truncated or (limit is None and len(all_tasks) > storage.max_task_list_limit)

    queue_ids = {task.get("queue_id") for task in tasks if task.get("queue_id")}
    queue_names = storage.get_queue_names(list(queue_ids)) if queue_ids else {}

    response = {
        "tasks": [_serialize_task(task, queue_names) for task in tasks],
        "truncated": truncated,
        "limit_applied": effective_limit,
    }
    if truncated:
        response["max_limit"] = storage.max_task_list_limit
    return response


@app.post("/api/tasks")
async def create_task(request: TaskCreateRequest):
    queue = storage.get_queue(request.queue_id)
    if not queue:
        raise HTTPException(status_code=404, detail="Queue not found")

    registry = get_registry()
    timeout = registry.get_timeout(request.tool_name, override=request.timeout, task_class=request.task_class)
    role = _resolve_agent_role(request.agent_role_key)

    if _CREATE_HAS_PAYLOAD:
        payload_data = {"prompt_path": request.prompt_path, "metadata": request.metadata}
        if role:
            payload_data["agent_role_key"] = role["key"]
            payload_data["agent_role_label"] = role.get("label")
        payload_json = json.dumps(payload_data)
        metadata_value: Optional[str] = None
        if request.metadata is not None:
            metadata_value = (
                request.metadata if isinstance(request.metadata, str) else json.dumps(request.metadata)
            )

        task = storage.create_task(
            queue_id=request.queue_id,
            tool_name=request.tool_name,
            task_class=request.task_class,
            payload=payload_json,
            timeout=timeout,
            prompt_path=request.prompt_path,
            metadata=metadata_value,
            agent_role_key=role["key"] if role else None,
        )
    else:
        task = storage.create_task(
            queue_id=request.queue_id,
            tool_name=request.tool_name,
            task_class=request.task_class,
            timeout=timeout,
            prompt_path=request.prompt_path,
            metadata=request.metadata,
            agent_role_key=role["key"] if role else None,
        )

    return {"task": _serialize_task(task)}


@app.get("/api/tasks/{task_id}")
async def get_task(task_id: str):
    task = storage.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"task": _serialize_task(task)}


@app.post("/api/tasks/{task_id}/claim")
async def claim_task(task_id: str, request: TaskClaimRequest = Body(default_factory=TaskClaimRequest)):
    task = storage.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    current_status = task.get("status") or "unknown"
    if current_status != "queued":
        raise HTTPException(status_code=409, detail=f"Cannot claim task while status is {current_status}")

    worker_id = request.worker_id or datetime.now(timezone.utc).isoformat()

    if _CLAIM_HAS_WORKER:
        updated_task = storage.claim_task(task_id, worker_id)
    else:
        updated_task = storage.claim_task(task_id)
        updated_task["worker_id"] = updated_task.get("worker_id") or worker_id

    updated_task.setdefault("claimed_at", updated_task.get("started_at") or datetime.now(timezone.utc).isoformat())
    return {"task": _serialize_task(updated_task)}


@app.post("/api/tasks/{task_id}/complete")
async def complete_task(task_id: str, request: TaskCompleteRequest):
    task = storage.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    current_status = task.get("status") or "unknown"
    if current_status != "running":
        if current_status == "failed" and storage.is_auto_failed(task):
            try:
                task = storage.reset_auto_failed_task(task_id, target_status="running")
                current_status = task.get("status") or "unknown"
            except ConflictError as err:
                raise HTTPException(status_code=409, detail=str(err)) from err
        else:
            raise HTTPException(status_code=409, detail=f"Cannot complete task while status is {current_status}")
    if not request.result_summary.strip():
        raise HTTPException(status_code=400, detail="Result summary is required")

    result_data = request.result_data or request.result_summary
    updated_task = storage.complete_task(task_id, request.result_summary, result_data)
    updated_task.setdefault("completed_at", updated_task.get("finished_at"))
    updated_task.setdefault("result_summary", request.result_summary)

    return {"task": _serialize_task(updated_task)}


@app.post("/api/tasks/{task_id}/fail")
async def fail_task(task_id: str, request: TaskFailRequest):
    task = storage.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if not request.error_message.strip():
        raise HTTPException(status_code=400, detail="Error message is required")

    updated_task = storage.fail_task(task_id, request.error_message, request.error_type)
    updated_task.setdefault("failed_at", updated_task.get("finished_at"))
    updated_task.setdefault("error_message", request.error_message)

    return {"task": _serialize_task(updated_task)}


@app.post("/api/tasks/{task_id}/reset")
async def reset_task(task_id: str, request: TaskResetRequest = Body(default_factory=TaskResetRequest)):
    task = storage.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    target_status = (request.target_status or "running").lower()
    if target_status not in {"running", "queued"}:
        raise HTTPException(status_code=400, detail="target_status must be 'running' or 'queued'")

    try:
        updated_task = storage.reset_auto_failed_task(task_id, target_status=target_status)
    except ConflictError as err:
        raise HTTPException(status_code=409, detail=str(err)) from err

    return {"task": _serialize_task(updated_task)}


@app.get("/api/audit")
async def list_audit(action_prefix: Optional[str] = Query(None), limit: int = Query(50, ge=1, le=200)):
    try:
        logs = storage.list_audit_logs(action_prefix=action_prefix, limit=limit)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {"logs": logs}


@app.post("/api/tasks/{task_id}/requeue")
async def requeue_task(task_id: str):
    task = storage.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    status = task.get("status") or "unknown"
    if status not in {"failed", "succeeded"}:
        raise HTTPException(status_code=409, detail=f"Cannot requeue task while status is {status}")

    new_task = storage.requeue_task(task_id)
    new_task["claimed_at"] = None
    new_task["completed_at"] = None
    new_task["failed_at"] = None

    return {"task": _serialize_task(new_task)}


@app.post("/api/tasks/{task_id}/rerun")
async def rerun_task(task_id: str):
    try:
        task = storage.rerun_task(task_id)
        return {"task": _serialize_task(task)}
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Task not found")
    except ConflictError as err:
        raise HTTPException(status_code=409, detail=str(err)) from err
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/tasks/{task_id}/retry")
async def retry_task(task_id: str):
    task = storage.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    status = task.get("status") or "unknown"
    if status not in {"failed", "succeeded"}:
        raise HTTPException(status_code=409, detail=f"Cannot retry task while status is {status}")

    try:
        new_task = storage.requeue_task(task_id)
    except ConflictError as err:
        raise HTTPException(status_code=409, detail=str(err)) from err

    new_task["claimed_at"] = None
    new_task["completed_at"] = None
    new_task["failed_at"] = None

    return {"task": _serialize_task(new_task)}


@app.put("/api/tasks/{task_id}")
async def update_task(task_id: str, request: Request):
    """Update a task with new values"""
    try:
        body = await request.json()
        if not isinstance(body, dict) or not body:
            raise HTTPException(status_code=400, detail="Update body must be a non-empty object")
        if "payload" in body and body["payload"] == "":
            raise HTTPException(status_code=400, detail="Payload cannot be empty")
        updated_task = storage.update_task(task_id, **body)
        if not updated_task:
            raise HTTPException(status_code=404, detail="Task not found")
        return {"task": _serialize_task(updated_task)}
    except Exception as err:
        if isinstance(err, HTTPException):
            raise
        raise HTTPException(status_code=400, detail=str(err))


@app.delete("/api/tasks/{task_id}")
async def delete_task_endpoint(task_id: str):
    """Delete a task"""
    success = storage.delete_task(task_id)
    if not success:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"deleted": True}


@app.post("/api/tasks/quick-add")
async def quick_add_task(request: QuickAddTaskRequest):
    """
    Smart task creation with auto-configuration.
    No JSON payload required from user - system builds it based on prompt/script.
    """

    # Verify queue exists
    queue = storage.get_queue(request.queue_id)
    if not queue:
        raise HTTPException(status_code=404, detail=f"Queue not found: {request.queue_id}")

    queue_default_role = _resolve_agent_role(queue.get("default_agent_role_key"), allow_inactive=True)
    override_role = _resolve_agent_role(request.agent_role_key) if request.agent_role_key is not None else None
    agent_role = override_role or queue_default_role

    registry = get_registry()

    if request.mode == 'llm':
        if not request.prompt:
            raise HTTPException(status_code=400, detail="Prompt required for LLM mode")
        prompt_text = request.prompt.strip()
        if not prompt_text:
            raise HTTPException(status_code=400, detail="Prompt must not be empty or whitespace")

        # If UI provided tool_name, honor it; otherwise auto-pick by word count.
        if request.tool_name:
            tool_name = request.tool_name
            task_class = registry.get_task_class(tool_name) or 'LLM_LITE'
            timeout = registry.get_timeout(tool_name, task_class=task_class)
        else:
            # Auto-determine tool and task class based on prompt length
            word_count = len(prompt_text.split())
            if word_count < 50:
                tool_name = 'llm-haiku'
                task_class = 'LLM_LITE'
            else:
                tool_name = 'llm-sonnet'
                task_class = 'LLM_HEAVY'
            timeout = registry.get_timeout(tool_name, task_class=task_class)

        payload = json.dumps(_build_prompt_payload(prompt_text, queue, agent_role))

    elif request.mode == 'script':
        if not request.script_path:
            raise HTTPException(status_code=400, detail="Script path required for script mode")
        script_path = request.script_path.strip()
        if not script_path:
            raise HTTPException(status_code=400, detail="Script path must not be empty or whitespace")

        # Determine tool from script extension
        if script_path.endswith('.py'):
            tool_name = 'run-python'
        else:
            tool_name = 'run-bash'

        task_class = 'MEDIUM_SCRIPT'
        timeout = registry.get_timeout(tool_name, task_class=task_class)

        # Parse args
        args = request.script_args.split() if request.script_args else []

        payload = json.dumps({
            "script_path": script_path,
            "args": args
        })
        agent_role = None  # Agent roles apply to LLM tasks only

    else:
        raise HTTPException(status_code=400, detail="Mode must be 'llm' or 'script'")

    # Create task using storage layer
    task_dict = storage.create_task(
        queue_id=request.queue_id,
        tool_name=tool_name,
        task_class=task_class,
        payload=payload,
        timeout=timeout,
        agent_role_key=agent_role.get("key") if agent_role else None,
    )

    task_id = task_dict['id']
    task = storage.get_task(task_id)

    return {
        "task_id": task_id,
        "friendly_id": _serialize_task(task).get("friendly_id") if task else None,
        "tool": tool_name,
        "task_class": task_class,
        "timeout": timeout,
        "task": _serialize_task(task) if task else None
    }


@app.get("/api/scripts/index")
async def build_script_index():
    script_index = ScriptIndex(config_path=str(get_config_path()))
    try:
        script_index.build()
    except Exception:
        logger.exception("Failed to build script index")
        return _error_response("Internal server error", 500)

    return script_index.list_all()


@app.get("/api/config")
async def get_config():
    """Get complete server configuration (DB-backed with YAML bootstrap)."""
    cfg = _build_config_response(include_cache=True)
    # Keep registry in sync with DB-backed tools/task_classes
    reload_registry({"tools": cfg.get("tools", {}), "task_classes": cfg.get("task_classes", {})})
    return cfg


@app.put("/api/config/{namespace}/{key}")
async def update_config(namespace: str, key: str, payload: ConfigUpdateRequest):
    """Create or update a config entry."""
    value = payload.value
    _validate_config_value(namespace, key, value)
    if namespace == "task_classes" and key == "all":
        _sync_task_classes_payload(value)
    elif namespace == "tools" and key == "all":
        _sync_tools_payload(value)
    storage.upsert_config_entry(namespace, key, value, updated_by="api")
    storage.log_audit(actor="api", action=f"config.update.{namespace}.{key}", details={"value": value})
    _invalidate_config_cache()

    cfg = _build_config_response(include_cache=False)
    if namespace in {"tools", "task_classes"}:
        reload_registry({"tools": cfg.get("tools", {}), "task_classes": cfg.get("task_classes", {})})

    return {"status": "ok", "config": cfg}


@app.delete("/api/config/{namespace}/{key}")
async def delete_config(namespace: str, key: str):
    """Delete a config entry (reverts to defaults on next read)."""
    defaults = _load_yaml_defaults()
    # Validate supported namespace/key by validating against defaults
    fallback_value = None
    if namespace == "purge" and key == "config":
        fallback_value = defaults.get("purge")
    elif namespace == "tools" and key == "all":
        fallback_value = defaults.get("tools")
    elif namespace == "task_classes" and key == "all":
        fallback_value = defaults.get("task_classes")
    elif namespace == "ui" and key == "build_id":
        fallback_value = defaults.get("ui", {}).get("build_id")
    elif namespace == "features" and key == "flags":
        fallback_value = defaults.get("features", {}).get("flags", {})
    elif namespace == "defaults" and key == "queue":
        fallback_value = defaults.get("defaults", {}).get("queue", {})
    elif namespace == "queue_runner" and key == "config":
        fallback_value = defaults.get("queue_runner")
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported config namespace/key: {namespace}/{key}")

    _validate_config_value(namespace, key, fallback_value)
    if namespace == "task_classes" and key == "all":
        _sync_task_classes_payload(fallback_value or {})
    elif namespace == "tools" and key == "all":
        _sync_tools_payload(fallback_value or {})
    storage.delete_config_entry(namespace, key)
    storage.log_audit(actor="api", action=f"config.delete.{namespace}.{key}", details=None)
    _invalidate_config_cache()

    cfg = _build_config_response(include_cache=False)
    if namespace in {"tools", "task_classes"}:
        reload_registry({"tools": cfg.get("tools", {}), "task_classes": cfg.get("task_classes", {})})

    return {"status": "ok", "config": cfg}


@app.get("/api/task-classes")
async def list_task_classes():
    _build_config_response(include_cache=False)  # ensure seeded
    return {"task_classes": storage.list_task_classes()}


@app.post("/api/task-classes", status_code=201)
async def create_task_class(payload: TaskClassPayload):
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    if payload.timeout <= 0:
        raise HTTPException(status_code=400, detail="timeout must be > 0")
    storage.upsert_task_class(name, payload.timeout, payload.description)
    storage.upsert_config_entry("task_classes", "all", _task_classes_dict(storage.list_task_classes()), updated_by="api")
    storage.log_audit(actor="api", action="task_class.create", details={"name": name})
    _invalidate_config_cache()
    cfg = _build_config_response(include_cache=False)
    reload_registry({"tools": cfg.get("tools", {}), "task_classes": cfg.get("task_classes", {})})
    return {"task_class": storage.get_task_class_record(name)}


@app.put("/api/task-classes/{name}")
async def update_task_class(name: str, payload: TaskClassPayload):
    target_name = (payload.name or name or "").strip()
    if not target_name:
        raise HTTPException(status_code=400, detail="name is required")
    if payload.timeout <= 0:
        raise HTTPException(status_code=400, detail="timeout must be > 0")
    storage.upsert_task_class(target_name, payload.timeout, payload.description)
    storage.upsert_config_entry("task_classes", "all", _task_classes_dict(storage.list_task_classes()), updated_by="api")
    storage.log_audit(actor="api", action="task_class.update", details={"name": target_name})
    _invalidate_config_cache()
    cfg = _build_config_response(include_cache=False)
    reload_registry({"tools": cfg.get("tools", {}), "task_classes": cfg.get("task_classes", {})})
    return {"task_class": storage.get_task_class_record(target_name)}


@app.delete("/api/task-classes/{name}")
async def delete_task_class(name: str):
    try:
        storage.delete_task_class(name)
    except SparkQError as exc:
        raise HTTPException(status_code=_status_code_for_error(exc), detail=str(exc)) from exc
    storage.upsert_config_entry("task_classes", "all", _task_classes_dict(storage.list_task_classes()), updated_by="api")
    storage.log_audit(actor="api", action="task_class.delete", details={"name": name})
    _invalidate_config_cache()
    cfg = _build_config_response(include_cache=False)
    reload_registry({"tools": cfg.get("tools", {}), "task_classes": cfg.get("task_classes", {})})
    return {"status": "ok"}


@app.get("/api/tools")
async def list_tools():
    _build_config_response(include_cache=False)  # ensure seeded
    return {"tools": storage.list_tools_table()}


@app.post("/api/tools", status_code=201)
async def create_tool(payload: ToolPayload):
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    if not payload.task_class or not isinstance(payload.task_class, str):
        raise HTTPException(status_code=400, detail="task_class is required")
    try:
        storage.upsert_tool_record(name, payload.task_class, payload.description)
    except SparkQError as exc:
        raise HTTPException(status_code=_status_code_for_error(exc), detail=str(exc)) from exc
    storage.upsert_config_entry("tools", "all", _tools_dict(storage.list_tools_table()), updated_by="api")
    storage.log_audit(actor="api", action="tool.create", details={"name": name})
    _invalidate_config_cache()
    cfg = _build_config_response(include_cache=False)
    reload_registry({"tools": cfg.get("tools", {}), "task_classes": cfg.get("task_classes", {})})
    return {"tool": storage.get_tool_record(name)}


@app.put("/api/tools/{name}")
async def update_tool(name: str, payload: ToolPayload):
    target_name = (payload.name or name or "").strip()
    if not target_name:
        raise HTTPException(status_code=400, detail="name is required")
    try:
        storage.upsert_tool_record(target_name, payload.task_class, payload.description)
    except SparkQError as exc:
        raise HTTPException(status_code=_status_code_for_error(exc), detail=str(exc)) from exc
    storage.upsert_config_entry("tools", "all", _tools_dict(storage.list_tools_table()), updated_by="api")
    storage.log_audit(actor="api", action="tool.update", details={"name": target_name})
    _invalidate_config_cache()
    cfg = _build_config_response(include_cache=False)
    reload_registry({"tools": cfg.get("tools", {}), "task_classes": cfg.get("task_classes", {})})
    return {"tool": storage.get_tool_record(target_name)}


@app.delete("/api/tools/{name}")
async def delete_tool(name: str):
    storage.delete_tool_record(name)
    storage.upsert_config_entry("tools", "all", _tools_dict(storage.list_tools_table()), updated_by="api")
    storage.log_audit(actor="api", action="tool.delete", details={"name": name})
    _invalidate_config_cache()
    cfg = _build_config_response(include_cache=False)
    reload_registry({"tools": cfg.get("tools", {}), "task_classes": cfg.get("task_classes", {})})
    return {"status": "ok"}


@app.get("/api/prompts")
async def list_prompts(source: str = Query("db", description="db (default) or build for filesystem prompts")):
    normalized_source = (source or "db").lower()
    if normalized_source in {"build", "file", "files"}:
        return {"prompts": _list_build_prompt_files()}

    prompts = storage.list_prompts()
    response_prompts = []
    for prompt in prompts:
        prompt_data = {k: v for k, v in prompt.items() if k != "template_text"}
        response_prompts.append(prompt_data)
    return {"prompts": response_prompts}


@app.get("/api/prompts/{prompt_id}")
async def get_prompt(prompt_id: str, source: str = Query("db", description="db (default) or build for filesystem prompts")):
    normalized_source = (source or "db").lower()
    should_try_file = normalized_source in {"build", "file", "files"} or prompt_id.lower().endswith(".md")

    if should_try_file:
        try:
            content = _read_build_prompt_file(prompt_id)
            return {"content": content, "filename": prompt_id}
        except HTTPException as exc:
            if normalized_source in {"build", "file", "files"} or exc.status_code != 404:
                raise
            # If not explicitly requesting a build prompt, fall back to DB lookup on 404

    prompt = storage.get_prompt(prompt_id)
    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")
    return {"prompt": prompt}


@app.post("/api/prompts", status_code=201)
async def create_prompt(request: PromptCreateRequest):
    if not request.command or not request.command.strip():
        raise HTTPException(status_code=400, detail="Command is required")
    if not request.label or not request.label.strip():
        raise HTTPException(status_code=400, detail="Label is required")
    if not request.template_text or not request.template_text.strip():
        raise HTTPException(status_code=400, detail="Template text is required")

    command = request.command.strip()
    label = request.label.strip()
    template_text = request.template_text.strip()
    description = request.description.strip() if request.description is not None else None

    try:
        prompt = storage.create_prompt(command, label, template_text, description)
    except SparkQError as exc:
        raise HTTPException(status_code=_status_code_for_error(exc), detail=str(exc)) from exc

    return {"prompt": prompt}


@app.put("/api/prompts/{prompt_id}")
async def update_prompt(prompt_id: str, request: PromptUpdateRequest):
    if (
        request.command is None
        and request.label is None
        and request.template_text is None
        and request.description is None
    ):
        raise HTTPException(status_code=400, detail="No fields provided to update prompt")

    command = request.command.strip() if request.command is not None else None
    if command is not None and not command:
        raise HTTPException(status_code=400, detail="Command cannot be empty")

    label = request.label.strip() if request.label is not None else None
    if label is not None and not label:
        raise HTTPException(status_code=400, detail="Label cannot be empty")

    template_text = request.template_text.strip() if request.template_text is not None else None
    if template_text is not None and not template_text:
        raise HTTPException(status_code=400, detail="Template text cannot be empty")

    description = request.description.strip() if request.description is not None else None

    try:
        prompt = storage.update_prompt(
            prompt_id,
            command=command,
            label=label,
            template_text=template_text,
            description=description,
        )
    except SparkQError as exc:
        raise HTTPException(status_code=_status_code_for_error(exc), detail=str(exc)) from exc

    return {"prompt": prompt}


@app.delete("/api/prompts/{prompt_id}")
async def delete_prompt(prompt_id: str):
    try:
        storage.delete_prompt(prompt_id)
    except SparkQError as exc:
        raise HTTPException(status_code=_status_code_for_error(exc), detail=str(exc)) from exc

    return {"message": "Prompt deleted successfully"}
