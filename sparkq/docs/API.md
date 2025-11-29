# SparkQ REST API

- **Base URL:** `http://127.0.0.1:8420/api`
- **Authentication:** None (API is bound to localhost only)
- **Content-Type:** `application/json`
- **Time format:** ISO 8601 strings (UTC)

## Response Format
- **Success:** JSON objects keyed by the resource, e.g. `{"sessions": [...]}`, `{"task": {...}}`.
- **Errors:** JSON with a prefixed message and HTTP status code:
  ```json
  {
    "error": "Error: Session not found",
    "status": 404
  }
  ```
  Validation errors also use `400 Bad Request` with messages like `Error: Missing field name`. Unhandled server errors return `500`.

## Health
### GET /health
- **Description:** Liveness check for the service (not under the `/api` base path).
- **Response:**
  ```json
  {
    "status": "ok",
    "timestamp": "2024-05-05T12:00:00+00:00"
  }
  ```
- **Status codes:** `200` on success; `500` on unexpected failure.

## Sessions
### GET /sessions
- **Description:** List sessions with optional pagination.
- **Query params:** `limit` (int, default `100`, min `0`), `offset` (int, default `0`, min `0`).
- **Response:**
  ```json
  {
    "sessions": [
      {
        "id": "ses_4fbc7c9c8b12",
        "project_id": "prj_12ab45cd67ef",
        "name": "demo-session",
        "description": "Working through tickets",
        "status": "active",
        "started_at": "2024-05-05T11:58:12Z",
        "ended_at": null,
        "created_at": "2024-05-05T11:58:12Z",
        "updated_at": "2024-05-05T11:58:12Z"
      }
    ]
  }
  ```
- **Status codes:** `200` on success; `400` for negative pagination values; `500` on server error.

### POST /sessions
- **Description:** Create a new session.
- **Body:**
  ```json
  {
    "name": "demo-session",
    "description": "Optional text"
  }
  ```
- **Response:**
  ```json
  {
    "session": {
      "id": "ses_4fbc7c9c8b12",
      "project_id": "prj_12ab45cd67ef",
      "name": "demo-session",
      "description": "Optional text",
      "status": "active",
      "started_at": "2024-05-05T11:58:12Z",
      "ended_at": null,
      "created_at": "2024-05-05T11:58:12Z",
      "updated_at": "2024-05-05T11:58:12Z"
    }
  }
  ```
- **Status codes:** `200` on success; `400` if `name` is missing/blank or project is not initialized; `500` on server error.

### GET /sessions/{session_id}
- **Description:** Fetch a single session by ID.
- **Response:**
  ```json
  {
    "session": {
      "id": "ses_4fbc7c9c8b12",
      "project_id": "prj_12ab45cd67ef",
      "name": "demo-session",
      "description": "Optional text",
      "status": "active",
      "started_at": "2024-05-05T11:58:12Z",
      "ended_at": null,
      "created_at": "2024-05-05T11:58:12Z",
      "updated_at": "2024-05-05T11:58:12Z"
    }
  }
  ```
- **Status codes:** `200` on success; `404` if the session is not found; `500` on server error.

### PUT /sessions/{session_id}
- **Description:** Update a session name and/or description.
- **Body:** One or both fields required.
  ```json
  {
    "name": "renamed-session",
    "description": "New description"
  }
  ```
- **Response:** Same shape as GET.
- **Status codes:** `200` on success; `400` if no updatable fields are provided or `name` is blank; `404` if the session is not found; `500` on server error.

### PUT /sessions/{session_id}/end
- **Description:** Mark a session as ended.
- **Response:**
  ```json
  {
    "message": "Session ended",
    "session": {
      "id": "ses_4fbc7c9c8b12",
      "project_id": "prj_12ab45cd67ef",
      "name": "demo-session",
      "description": "Optional text",
      "status": "ended",
      "started_at": "2024-05-05T11:58:12Z",
      "ended_at": "2024-05-05T12:30:45Z",
      "created_at": "2024-05-05T11:58:12Z",
      "updated_at": "2024-05-05T12:30:45Z"
    }
  }
  ```
- **Status codes:** `200` on success; `404` if the session is not found; `500` on server error.

## Streams
### GET /streams
- **Description:** List streams, optionally filtered by session, with pagination.
- **Query params:** `session_id` (string, optional), `limit` (int, default `100`, min `0`), `offset` (int, default `0`, min `0`).
- **Response:**
  ```json
  {
    "streams": [
      {
        "id": "str_18ae9e3a7c44",
        "session_id": "ses_4fbc7c9c8b12",
        "name": "default",
        "instructions": "Run bash utilities",
        "status": "active",
        "created_at": "2024-05-05T11:59:12Z",
        "updated_at": "2024-05-05T11:59:12Z"
      }
    ]
  }
  ```
- **Status codes:** `200` on success; `400` for invalid pagination values; `500` on server error.

### POST /streams
- **Description:** Create a stream under a session.
- **Body:**
  ```json
  {
    "session_id": "ses_4fbc7c9c8b12",
    "name": "default",
    "instructions": "Run bash utilities"
  }
  ```
- **Response:** *(201 Created)*
  ```json
  {
    "stream": {
      "id": "str_18ae9e3a7c44",
      "session_id": "ses_4fbc7c9c8b12",
      "name": "default",
      "instructions": "Run bash utilities",
      "status": "active",
      "created_at": "2024-05-05T11:59:12Z",
      "updated_at": "2024-05-05T11:59:12Z"
    }
  }
  ```
- **Status codes:** `201` on success; `400` if `name` is missing/blank or duplicate; `404` if the session is not found; `500` on server error.

### GET /streams/{stream_id}
- **Description:** Fetch a single stream by ID.
- **Response:** Same shape as POST.
- **Status codes:** `200` on success; `404` if the stream is not found; `500` on server error.

### PUT /streams/{stream_id}
- **Description:** Update a stream name and/or instructions.
- **Body:** One or both fields required.
  ```json
  {
    "name": "renamed-stream",
    "instructions": "Refined instructions"
  }
  ```
- **Response:** Same shape as POST, with updated values.
- **Status codes:** `200` on success; `400` if no updatable fields are provided, `name` is blank, or the new name is duplicate; `404` if the stream is not found; `500` on server error.

### PUT /streams/{stream_id}/end
- **Description:** Mark a stream as ended.
- **Response:**
  ```json
  {
    "message": "Stream ended",
    "stream": {
      "id": "str_18ae9e3a7c44",
      "session_id": "ses_4fbc7c9c8b12",
      "name": "default",
      "instructions": "Run bash utilities",
      "status": "ended",
      "created_at": "2024-05-05T11:59:12Z",
      "updated_at": "2024-05-05T12:40:02Z"
    }
  }
  ```
- **Status codes:** `200` on success; `404` if the stream is not found; `500` on server error.

## Tasks
Task statuses: `queued`, `running`, `succeeded`, `failed`.

### GET /tasks
- **Description:** List tasks, filtered by stream and/or status, with pagination.
- **Query params:** `stream_id` (string, optional), `status` (one of the statuses above), `limit` (int, default `100`, min `1`), `offset` (int, default `0`, min `0`).
- **Response:**
  ```json
  {
    "tasks": [
      {
        "id": "tsk_9c2d74e0cabc",
        "stream_id": "str_18ae9e3a7c44",
        "tool_name": "run-bash",
        "task_class": "MEDIUM_SCRIPT",
        "payload": "{\"prompt_path\": \"scripts/hello.sh\", \"metadata\": {\"env\": \"dev\"}}",
        "status": "queued",
        "timeout": 300,
        "attempts": 0,
        "result": null,
        "error": null,
        "stdout": null,
        "stderr": null,
        "created_at": "2024-05-05T12:02:33Z",
        "updated_at": "2024-05-05T12:02:33Z",
        "started_at": null,
        "finished_at": null,
        "claimed_at": null,
        "completed_at": null,
        "failed_at": null
      }
    ]
  }
  ```
- **Status codes:** `200` on success; `400` if `status` is invalid; `500` on server error.

### POST /tasks
- **Description:** Create a task for a stream. If `timeout` is omitted, defaults are applied by `task_class` (`FAST_SCRIPT:30s`, `MEDIUM_SCRIPT:300s`, `LLM_LITE:300s`, `LLM_HEAVY:900s`, otherwise `300s`).
- **Body:**
  ```json
  {
    "stream_id": "str_18ae9e3a7c44",
    "tool_name": "run-bash",
    "task_class": "MEDIUM_SCRIPT",
    "timeout": 300,
    "prompt_path": "scripts/hello.sh",
    "metadata": { "env": "dev" }
  }
  ```
- **Response:**
  ```json
  {
    "task": {
      "id": "tsk_9c2d74e0cabc",
      "stream_id": "str_18ae9e3a7c44",
      "tool_name": "run-bash",
      "task_class": "MEDIUM_SCRIPT",
      "payload": "{\"prompt_path\": \"scripts/hello.sh\", \"metadata\": {\"env\": \"dev\"}}",
      "status": "queued",
      "timeout": 300,
      "attempts": 0,
      "result": null,
      "error": null,
      "stdout": null,
      "stderr": null,
      "created_at": "2024-05-05T12:02:33Z",
      "updated_at": "2024-05-05T12:02:33Z",
      "started_at": null,
      "finished_at": null,
      "claimed_at": null,
      "completed_at": null,
      "failed_at": null
    }
  }
  ```
- **Status codes:** `200` on success; `404` if the stream is not found; `500` on server error.

### GET /tasks/{task_id}
- **Description:** Fetch a single task by ID.
- **Response:** Same shape as POST.
- **Status codes:** `200` on success; `404` if the task is not found; `500` on server error.

### POST /tasks/{task_id}/claim
- **Description:** Move a queued task to running. Optional `worker_id` is echoed in the response; the storage backend does not currently persist `worker_id` for later reads.
- **Body (optional):**
  ```json
  { "worker_id": "worker-1" }
  ```
- **Response:**
  ```json
  {
    "task": {
      "id": "tsk_9c2d74e0cabc",
      "stream_id": "str_18ae9e3a7c44",
      "tool_name": "run-bash",
      "task_class": "MEDIUM_SCRIPT",
      "payload": "{\"prompt_path\": \"scripts/hello.sh\", \"metadata\": {\"env\": \"dev\"}}",
      "status": "running",
      "timeout": 300,
      "attempts": 1,
      "result": null,
      "error": null,
      "stdout": null,
      "stderr": null,
      "created_at": "2024-05-05T12:02:33Z",
      "updated_at": "2024-05-05T12:03:10Z",
      "started_at": "2024-05-05T12:03:10Z",
      "finished_at": null,
      "claimed_at": "2024-05-05T12:03:10Z",
      "completed_at": null,
      "failed_at": null,
      "worker_id": "worker-1"
    }
  }
  ```
- **Status codes:** `200` on success; `404` if the task is not found; `409` if the task is not `queued`; `500` on server error.

### POST /tasks/{task_id}/complete
- **Description:** Mark a running task as succeeded.
- **Body:**
  ```json
  {
    "result_summary": "Ran script successfully",
    "result_data": "Full stdout or structured data (optional)"
  }
  ```
- **Response:**
  ```json
  {
    "task": {
      "id": "tsk_9c2d74e0cabc",
      "stream_id": "str_18ae9e3a7c44",
      "tool_name": "run-bash",
      "task_class": "MEDIUM_SCRIPT",
      "payload": "{\"prompt_path\": \"scripts/hello.sh\", \"metadata\": {\"env\": \"dev\"}}",
      "status": "succeeded",
      "timeout": 300,
      "attempts": 1,
      "result": "Full stdout or structured data (optional)",
      "result_summary": "Ran script successfully",
      "error": null,
      "stdout": null,
      "stderr": null,
      "created_at": "2024-05-05T12:02:33Z",
      "updated_at": "2024-05-05T12:05:00Z",
      "started_at": "2024-05-05T12:03:10Z",
      "finished_at": "2024-05-05T12:05:00Z",
      "claimed_at": "2024-05-05T12:03:10Z",
      "completed_at": "2024-05-05T12:05:00Z",
      "failed_at": null
    }
  }
  ```
- **Status codes:** `200` on success; `400` if `result_summary` is blank; `404` if the task is not found; `409` if the task is not `running`; `500` on server error.

### POST /tasks/{task_id}/fail
- **Description:** Mark a task as failed with error details.
- **Body:**
  ```json
  {
    "error_message": "Timeout waiting for script",
    "error_type": "TIMEOUT"
  }
  ```
- **Response:**
  ```json
  {
    "task": {
      "id": "tsk_9c2d74e0cabc",
      "stream_id": "str_18ae9e3a7c44",
      "tool_name": "run-bash",
      "task_class": "MEDIUM_SCRIPT",
      "payload": "{\"prompt_path\": \"scripts/hello.sh\", \"metadata\": {\"env\": \"dev\"}}",
      "status": "failed",
      "timeout": 300,
      "attempts": 1,
      "result": null,
      "error": "TIMEOUT: Timeout waiting for script",
      "error_message": "Timeout waiting for script",
      "stdout": null,
      "stderr": null,
      "created_at": "2024-05-05T12:02:33Z",
      "updated_at": "2024-05-05T12:05:00Z",
      "started_at": "2024-05-05T12:03:10Z",
      "finished_at": "2024-05-05T12:05:00Z",
      "claimed_at": "2024-05-05T12:03:10Z",
      "completed_at": null,
      "failed_at": "2024-05-05T12:05:00Z"
    }
  }
  ```
- **Status codes:** `200` on success; `400` if `error_message` is blank; `404` if the task is not found; `500` on server error.

### POST /tasks/{task_id}/requeue
- **Description:** Clone a succeeded or failed task back to the queue with a new ID.
- **Response:**
  ```json
  {
    "task": {
      "id": "tsk_1f2e3d4c5b6a",
      "stream_id": "str_18ae9e3a7c44",
      "tool_name": "run-bash",
      "task_class": "MEDIUM_SCRIPT",
      "payload": "{\"prompt_path\": \"scripts/hello.sh\", \"metadata\": {\"env\": \"dev\"}}",
      "status": "queued",
      "timeout": 300,
      "attempts": 0,
      "result": null,
      "error": null,
      "stdout": null,
      "stderr": null,
      "created_at": "2024-05-05T12:06:10Z",
      "updated_at": "2024-05-05T12:06:10Z",
      "started_at": null,
      "finished_at": null,
      "claimed_at": null,
      "completed_at": null,
      "failed_at": null
    }
  }
  ```
- **Status codes:** `200` on success; `404` if the original task is not found; `409` if the task is not in `failed` or `succeeded` state; `500` on server error.

## Scripts
### GET /scripts/index
- **Description:** Returns the indexed scripts discovered by the server (`script_dirs` in `sparkq.yml`, default `scripts/`). Each entry comes from parsing script file headers via `ScriptIndex`. This route is planned per FRD v7.5; confirm it is enabled in the running build.
- **Response:**
  ```json
  {
    "scripts": [
      {
        "path": "/home/luce/apps/sparkqueue/scripts/hello.sh",
        "name": "hello",
        "description": "Prints Hello World",
        "inputs": null,
        "outputs": null,
        "tags": ["example"],
        "timeout": 30,
        "task_class": "FAST_SCRIPT"
      }
    ]
  }
  ```
- **Status codes:** `200` on success; `500` on server error.
