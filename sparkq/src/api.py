import inspect
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import Body, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .storage import Storage, now_iso

storage = Storage()

app = FastAPI(title="SparkQ API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:8420",
        "http://localhost:8420",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

static_dir = Path(__file__).resolve().parent.parent / "ui"
app.mount("/ui", StaticFiles(directory=static_dir, html=True, check_dir=False), name="ui")

TASK_STATUS_VALUES = {"queued", "running", "succeeded", "failed"}
DEFAULT_TASK_TIMEOUTS = {
    "FAST_SCRIPT": 30,
    "MEDIUM_SCRIPT": 300,
    "LLM_LITE": 300,
    "LLM_HEAVY": 900,
}

_LIST_HAS_OFFSET = "offset" in inspect.signature(storage.list_tasks).parameters
_CREATE_HAS_PAYLOAD = "payload" in inspect.signature(storage.create_task).parameters
_CLAIM_HAS_WORKER = "worker_id" in inspect.signature(storage.claim_task).parameters


class SessionCreateRequest(BaseModel):
    name: str
    description: Optional[str] = None


class SessionUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class StreamCreateRequest(BaseModel):
    session_id: str
    name: str
    instructions: Optional[str] = None


class StreamUpdateRequest(BaseModel):
    name: Optional[str] = None
    instructions: Optional[str] = None


class TaskCreateRequest(BaseModel):
    stream_id: str
    tool_name: str
    task_class: str
    timeout: Optional[int] = None
    prompt_path: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class TaskClaimRequest(BaseModel):
    worker_id: Optional[str] = None


class TaskCompleteRequest(BaseModel):
    result_summary: str
    result_data: Optional[str] = None


class TaskFailRequest(BaseModel):
    error_message: str
    error_type: Optional[str] = None


def _serialize_task(task: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize task fields for API responses."""
    serialized = dict(task)
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

    return serialized


def _resolve_timeout(task_class: str, timeout: Optional[int]) -> int:
    if timeout is not None:
        return timeout
    return DEFAULT_TASK_TIMEOUTS.get(task_class, 300)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/sessions")
async def list_sessions(limit: int = 100, offset: int = 0):
    if limit < 0 or offset < 0:
        raise HTTPException(status_code=400, detail="Invalid pagination parameters")

    sessions = storage.list_sessions()
    paginated_sessions = sessions[offset : offset + limit] if limit is not None else sessions[offset:]
    return {"sessions": paginated_sessions}


@app.post("/api/sessions")
async def create_session(request: SessionCreateRequest):
    if not request.name or not request.name.strip():
        raise HTTPException(status_code=400, detail="Session name is required")

    try:
        session = storage.create_session(request.name.strip(), request.description)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

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
        raise HTTPException(status_code=400, detail="No fields to update")

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


@app.get("/api/streams")
async def list_streams(
    session_id: Optional[str] = None,
    limit: int = Query(100, ge=0),
    offset: int = Query(0, ge=0),
):
    streams = storage.list_streams(session_id=session_id)
    paginated_streams = streams[offset : offset + limit]
    return {"streams": paginated_streams}


@app.post("/api/streams", status_code=201)
async def create_stream(request: StreamCreateRequest):
    if not request.name or not request.name.strip():
        raise HTTPException(status_code=400, detail="Stream name is required")

    session = storage.get_session(request.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        stream = storage.create_stream(
            session_id=request.session_id,
            name=request.name.strip(),
            instructions=request.instructions,
        )
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=400, detail="Stream name must be unique") from exc

    return {"stream": stream}


@app.get("/api/streams/{stream_id}")
async def get_stream(stream_id: str):
    stream = storage.get_stream(stream_id)
    if not stream:
        raise HTTPException(status_code=404, detail="Stream not found")
    return {"stream": stream}


@app.put("/api/streams/{stream_id}")
async def update_stream(stream_id: str, request: StreamUpdateRequest):
    if request.name is None and request.instructions is None:
        raise HTTPException(status_code=400, detail="No fields to update")

    existing = storage.get_stream(stream_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Stream not found")

    updates = []
    params = []

    if request.name is not None:
        if not request.name.strip():
            raise HTTPException(status_code=400, detail="Stream name cannot be empty")
        updates.append("name = ?")
        params.append(request.name.strip())

    if request.instructions is not None:
        updates.append("instructions = ?")
        params.append(request.instructions)

    updates.append("updated_at = ?")
    params.append(now_iso())
    params.append(stream_id)

    try:
        with storage.connection() as conn:
            cursor = conn.execute(
                f"UPDATE streams SET {', '.join(updates)} WHERE id = ?",
                tuple(params),
            )
            if cursor.rowcount == 0:
                raise HTTPException(status_code=404, detail="Stream not found")
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=400, detail="Stream name must be unique") from exc

    updated_stream = storage.get_stream(stream_id)
    return {"stream": updated_stream}


@app.put("/api/streams/{stream_id}/end")
async def end_stream(stream_id: str):
    ended = storage.end_stream(stream_id)
    if not ended:
        raise HTTPException(status_code=404, detail="Stream not found")

    stream = storage.get_stream(stream_id)
    return {"message": "Stream ended", "stream": stream}


@app.get("/api/tasks")
async def list_tasks(
    stream_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(100, ge=1),
    offset: int = Query(0, ge=0),
):
    if status and status not in TASK_STATUS_VALUES:
        raise HTTPException(status_code=400, detail="Invalid status filter")

    if _LIST_HAS_OFFSET:
        tasks = storage.list_tasks(stream_id=stream_id, status=status, limit=limit, offset=offset)
    else:
        all_tasks = storage.list_tasks(stream_id=stream_id, status=status, limit=None)
        start = offset or 0
        end = start + limit if limit is not None else None
        tasks = all_tasks[start:end]

    return {"tasks": [_serialize_task(task) for task in tasks]}


@app.post("/api/tasks")
async def create_task(request: TaskCreateRequest):
    stream = storage.get_stream(request.stream_id)
    if not stream:
        raise HTTPException(status_code=404, detail="Stream not found")

    timeout = _resolve_timeout(request.task_class, request.timeout)

    if _CREATE_HAS_PAYLOAD:
        payload_data = {"prompt_path": request.prompt_path, "metadata": request.metadata}
        payload_json = json.dumps(payload_data)
        metadata_value: Optional[str] = None
        if request.metadata is not None:
            metadata_value = (
                request.metadata if isinstance(request.metadata, str) else json.dumps(request.metadata)
            )

        task = storage.create_task(
            stream_id=request.stream_id,
            tool_name=request.tool_name,
            task_class=request.task_class,
            payload=payload_json,
            timeout=timeout,
            prompt_path=request.prompt_path,
            metadata=metadata_value,
        )
    else:
        task = storage.create_task(
            stream_id=request.stream_id,
            tool_name=request.tool_name,
            task_class=request.task_class,
            timeout=timeout,
            prompt_path=request.prompt_path,
            metadata=request.metadata,
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
    if task.get("status") != "queued":
        raise HTTPException(status_code=409, detail="Task already claimed or not queued")

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
    if task.get("status") != "running":
        raise HTTPException(status_code=409, detail="Task not running")
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


@app.post("/api/tasks/{task_id}/requeue")
async def requeue_task(task_id: str):
    task = storage.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.get("status") not in {"failed", "succeeded"}:
        raise HTTPException(status_code=409, detail="Task must be failed or succeeded to requeue")

    new_task = storage.requeue_task(task_id)
    new_task["claimed_at"] = None
    new_task["completed_at"] = None
    new_task["failed_at"] = None

    return {"task": _serialize_task(new_task)}
