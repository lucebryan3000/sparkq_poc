# SparkQ REST API

- **Base URL:** `http://localhost:5005`
- **API Prefix:** `/api` (most endpoints)
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

## System & Health

**Runtime configuration:** Server host/port and database path are read from `sparkq.yml` (resolution order: `SPARKQ_CONFIG` env → current working directory `sparkq.yml` → repo root). Use `sparkq run --config /path/to/sparkq.yml` to point the server at a specific config; `database.path` is resolved relative to that file.

### GET /
- **Description:** Redirects to `/ui/` (UI dashboard).
- **Response:** `302 Redirect` to `/ui/`

### GET /health
- **Description:** Liveness check for the service.
- **Response:**
  ```json
  {
    "status": "ok",
    "timestamp": "2025-11-30T12:00:00+00:00",
    "build_id": "b713"
  }
  ```
- **Status codes:** `200` on success; `500` on unexpected failure.

### GET /api/version
- **Description:** Returns the current UI/server build ID for cache-busting or auto-reload.
- **Response:**
  ```json
  {
    "build_id": "b713",
    "timestamp": "2025-11-30T12:00:00+00:00"
  }
  ```
- **Status codes:** `200` on success.

### GET /api/build-prompts
- **Description:** List Markdown prompts under `_build/prompts-build` (excluding archive folders). Returns relative paths from repo root.
- **Response:**
  ```json
  {
    "prompts": [
      {
        "name": "example.md",
        "path": "_build/prompts-build/example.md"
      }
    ]
  }
  ```
- **Status codes:** `200` on success.

### GET /stats
- **Description:** Get dashboard statistics.
- **Response:**
  ```json
  {
    "sessions": 2,
    "queues": 5,
    "queued_tasks": 3,
    "running_tasks": 1
  }
  ```
- **Status codes:** `200` on success; returns zeros on error.

## Configuration

### POST /api/config/validate
- **Description:** Dry-run validation for config payload without persisting. Expects `{value}` containing namespace->key maps.
- **Body:**
  ```json
  {
    "value": {
      "purge": {
        "config": {
          "older_than_days": 3
        }
      },
      "tools": {
        "all": {
          "llm-haiku": {
            "task_class": "LLM_LITE",
            "description": "Fast LLM"
          }
        }
      }
    }
  }
  ```
- **Response:**
  ```json
  {
    "status": "ok"
  }
  ```
- **Status codes:** `200` on success; `400` if validation fails.

### GET /api/config
- **Description:** Get complete server configuration (DB-backed with YAML bootstrap).
- **Response:**
  ```json
  {
    "server": {
      "port": 5005,
      "host": "0.0.0.0"
    },
    "database": {
      "path": "sparkq/data/sparkq.db",
      "mode": "wal"
    },
    "purge": {
      "older_than_days": 3
    },
    "tools": {
      "llm-haiku": {
        "task_class": "LLM_LITE",
        "description": "Fast LLM"
      }
    },
    "task_classes": {
      "LLM_LITE": {
        "timeout": 300,
        "description": "Lightweight LLM tasks"
      }
    },
    "ui": {
      "build_id": "b713"
    },
    "features": {
      "flags": {}
    },
    "defaults": {
      "queue": {}
    }
  }
  ```
- **Status codes:** `200` on success.

### PUT /api/config/{namespace}/{key}
- **Description:** Create or update a config entry.
- **Body:**
  ```json
  {
    "value": {
      "older_than_days": 7
    }
  }
  ```
- **Response:**
  ```json
  {
    "status": "ok",
    "config": { /* full config object */ }
  }
  ```
- **Status codes:** `200` on success; `400` if validation fails.

### DELETE /api/config/{namespace}/{key}
- **Description:** Delete a config entry (reverts to defaults on next read).
- **Response:**
  ```json
  {
    "status": "ok",
    "config": { /* full config object */ }
  }
  ```
- **Status codes:** `200` on success; `400` if unsupported namespace/key.

## Sessions
### GET /api/sessions
- **Description:** List sessions with optional pagination.
- **Query params:** `limit` (int, default `100`, min `0`), `offset` (int, default `0`, min `0`).
- **Response:**
  ```json
  {
    "sessions": [
      {
        "id": "ses_4fbc7c9c8b12",
        "name": "demo-session",
        "description": "Working through tickets",
        "status": "active",
        "started_at": "2025-11-30T11:58:12Z",
        "ended_at": null,
        "created_at": "2025-11-30T11:58:12Z",
        "updated_at": "2025-11-30T11:58:12Z"
      }
    ]
  }
  ```
- **Status codes:** `200` on success; `400` for negative pagination values; `500` on server error.

### POST /api/sessions
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
      "name": "demo-session",
      "description": "Optional text",
      "status": "active",
      "started_at": "2025-11-30T11:58:12Z",
      "ended_at": null,
      "created_at": "2025-11-30T11:58:12Z",
      "updated_at": "2025-11-30T11:58:12Z"
    }
  }
  ```
- **Status codes:** `200` on success; `400` if `name` is missing/blank or project is not initialized; `500` on server error.

### GET /api/sessions/{session_id}
- **Description:** Fetch a single session by ID.
- **Response:**
  ```json
  {
    "session": {
      "id": "ses_4fbc7c9c8b12",
      "name": "demo-session",
      "description": "Optional text",
      "status": "active",
      "started_at": "2025-11-30T11:58:12Z",
      "ended_at": null,
      "created_at": "2025-11-30T11:58:12Z",
      "updated_at": "2025-11-30T11:58:12Z"
    }
  }
  ```
- **Status codes:** `200` on success; `404` if the session is not found; `500` on server error.

### PUT /api/sessions/{session_id}
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

### PUT /api/sessions/{session_id}/end
- **Description:** Mark a session as ended.
- **Response:**
  ```json
  {
    "message": "Session ended",
    "session": {
      "id": "ses_4fbc7c9c8b12",
      "name": "demo-session",
      "description": "Optional text",
      "status": "ended",
      "started_at": "2025-11-30T11:58:12Z",
      "ended_at": "2025-11-30T12:30:45Z",
      "created_at": "2025-11-30T11:58:12Z",
      "updated_at": "2025-11-30T12:30:45Z"
    }
  }
  ```
- **Status codes:** `200` on success; `404` if the session is not found; `500` on server error.

### DELETE /api/sessions/{session_id}
- **Description:** Delete a session (cascade delete with all queues and tasks).
- **Response:**
  ```json
  {
    "message": "Session deleted (cascade delete with all queues and tasks)"
  }
  ```
- **Status codes:** `200` on success; `404` if the session is not found; `500` on server error.

## Queues
### GET /api/queues
- **Description:** List queues, optionally filtered by session, with pagination. Includes stats (total, done, running, queued).
- **Query params:** `session_id` (string, optional), `limit` (int, default `100`, min `0`), `offset` (int, default `0`, min `0`).
- **Response:**
  ```json
  {
    "queues": [
      {
        "id": "que_18ae9e3a7c44",
        "session_id": "ses_4fbc7c9c8b12",
        "name": "default",
        "instructions": "Run bash utilities",
        "status": "active",
        "stats": {
          "total": 10,
          "done": 7,
          "running": 1,
          "queued": 2,
          "progress": "7/10"
        },
        "created_at": "2025-11-30T11:59:12Z",
        "updated_at": "2025-11-30T11:59:12Z"
      }
    ]
  }
  ```
- **Status codes:** `200` on success; `400` for invalid pagination values; `500` on server error.

### POST /api/queues
- **Description:** Create a queue under a session.
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
    "queue": {
      "id": "que_18ae9e3a7c44",
      "session_id": "ses_4fbc7c9c8b12",
      "name": "default",
      "instructions": "Run bash utilities",
      "status": "active",
      "created_at": "2025-11-30T11:59:12Z",
      "updated_at": "2025-11-30T11:59:12Z"
    }
  }
  ```
- **Status codes:** `201` on success; `400` if `name` is missing/blank or duplicate; `404` if the session is not found; `500` on server error.

### GET /api/queues/{queue_id}
- **Description:** Fetch a single queue by ID.
- **Response:** Same shape as POST.
- **Status codes:** `200` on success; `404` if the queue is not found; `500` on server error.

### PUT /api/queues/{queue_id}
- **Description:** Update a queue name and/or instructions.
- **Body:** One or both fields required.
  ```json
  {
    "name": "renamed-queue",
    "instructions": "Refined instructions"
  }
  ```
- **Response:** Same shape as POST, with updated values.
- **Status codes:** `200` on success; `400` if no updatable fields are provided, `name` is blank, or the new name is duplicate; `404` if the queue is not found; `500` on server error.

### PUT /api/queues/{queue_id}/end
- **Description:** Mark a queue as ended.
- **Response:**
  ```json
  {
    "message": "Queue ended",
    "queue": {
      "id": "que_18ae9e3a7c44",
      "session_id": "ses_4fbc7c9c8b12",
      "name": "default",
      "instructions": "Run bash utilities",
      "status": "ended",
      "created_at": "2025-11-30T11:59:12Z",
      "updated_at": "2025-11-30T12:40:02Z"
    }
  }
  ```
- **Status codes:** `200` on success; `404` if the queue is not found; `500` on server error.

### PUT /api/queues/{queue_id}/archive
- **Description:** Mark a queue as archived.
- **Response:**
  ```json
  {
    "message": "Queue archived",
    "queue": {
      "id": "que_18ae9e3a7c44",
      "session_id": "ses_4fbc7c9c8b12",
      "name": "default",
      "instructions": "Run bash utilities",
      "status": "archived",
      "created_at": "2025-11-30T11:59:12Z",
      "updated_at": "2025-11-30T12:40:02Z"
    }
  }
  ```
- **Status codes:** `200` on success; `404` if the queue is not found; `500` on server error.

### PUT /api/queues/{queue_id}/unarchive
- **Description:** Unarchive a queue (restore from archived status).
- **Response:**
  ```json
  {
    "message": "Queue unarchived",
    "queue": {
      "id": "que_18ae9e3a7c44",
      "session_id": "ses_4fbc7c9c8b12",
      "name": "default",
      "instructions": "Run bash utilities",
      "status": "active",
      "created_at": "2025-11-30T11:59:12Z",
      "updated_at": "2025-11-30T12:40:02Z"
    }
  }
  ```
- **Status codes:** `200` on success; `404` if the queue is not found; `500` on server error.

### DELETE /api/queues/{queue_id}
- **Description:** Delete a queue.
- **Response:**
  ```json
  {
    "message": "Queue deleted"
  }
  ```
- **Status codes:** `200` on success; `404` if the queue is not found; `500` on server error.

## Tasks
Task statuses: `queued`, `running`, `succeeded`, `failed`.

### GET /api/tasks
- **Description:** List tasks, filtered by queue and/or status, with pagination.
- **Query params:** `queue_id` (string, optional), `status` (one of the statuses above), `limit` (int, default `100`, min `1`), `offset` (int, default `0`, min `0`).
- **Response:**
  ```json
  {
    "tasks": [
      {
        "id": "tsk_9c2d74e0cabc",
        "friendly_id": "DEFAULT-cabc",
        "queue_id": "que_18ae9e3a7c44",
        "tool_name": "run-bash",
        "task_class": "MEDIUM_SCRIPT",
        "payload": "{\"script_path\": \"scripts/hello.sh\", \"args\": []}",
        "status": "queued",
        "timeout": 300,
        "attempts": 0,
        "result": null,
        "result_summary": null,
        "error": null,
        "error_message": null,
        "created_at": "2025-11-30T12:02:33Z",
        "updated_at": "2025-11-30T12:02:33Z",
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

### POST /api/tasks
- **Description:** Create a task for a queue. If `timeout` is omitted, defaults are applied by `task_class` (`FAST_SCRIPT:30s`, `MEDIUM_SCRIPT:300s`, `LLM_LITE:300s`, `LLM_HEAVY:900s`, otherwise `300s`).
- **Body:**
  ```json
  {
    "queue_id": "que_18ae9e3a7c44",
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
      "friendly_id": "DEFAULT-cabc",
      "queue_id": "que_18ae9e3a7c44",
      "tool_name": "run-bash",
      "task_class": "MEDIUM_SCRIPT",
      "payload": "{\"script_path\": \"scripts/hello.sh\", \"args\": []}",
      "status": "queued",
      "timeout": 300,
      "attempts": 0,
      "result": null,
      "result_summary": null,
      "error": null,
      "error_message": null,
      "created_at": "2025-11-30T12:02:33Z",
      "updated_at": "2025-11-30T12:02:33Z",
      "started_at": null,
      "finished_at": null,
      "claimed_at": null,
      "completed_at": null,
      "failed_at": null
    }
  }
  ```
- **Status codes:** `200` on success; `404` if the queue is not found; `500` on server error.

### POST /api/tasks/quick-add
- **Description:** Smart task creation with auto-configuration. No JSON payload required from user - system builds it based on prompt/script.
- **Body (LLM mode):**
  ```json
  {
    "queue_id": "que_18ae9e3a7c44",
    "mode": "llm",
    "prompt": "Explain recursion",
    "tool_name": "llm-haiku"
  }
  ```
- **Body (Script mode):**
  ```json
  {
    "queue_id": "que_18ae9e3a7c44",
    "mode": "script",
    "script_path": "scripts/hello.sh",
    "script_args": "--verbose"
  }
  ```
- **Response:**
  ```json
  {
    "task_id": "tsk_9c2d74e0cabc",
    "friendly_id": "DEFAULT-cabc",
    "tool": "llm-haiku",
    "task_class": "LLM_LITE",
    "timeout": 300,
    "task": { /* full task object */ }
  }
  ```
- **Status codes:** `200` on success; `400` if validation fails; `404` if queue not found; `500` on server error.

### GET /api/tasks/{task_id}
- **Description:** Fetch a single task by ID.
- **Response:** Same shape as POST.
- **Status codes:** `200` on success; `404` if the task is not found; `500` on server error.

### PUT /api/tasks/{task_id}
- **Description:** Update a task with new values.
- **Body:**
  ```json
  {
    "status": "queued",
    "payload": "{\"updated\": \"data\"}"
  }
  ```
- **Response:**
  ```json
  {
    "task": { /* updated task object */ }
  }
  ```
- **Status codes:** `200` on success; `400` if validation fails; `404` if task not found; `500` on server error.

### DELETE /api/tasks/{task_id}
- **Description:** Delete a task.
- **Response:**
  ```json
  {
    "deleted": true
  }
  ```
- **Status codes:** `200` on success; `404` if task not found; `500` on server error.

### POST /api/tasks/{task_id}/claim
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
      "friendly_id": "DEFAULT-cabc",
      "queue_id": "que_18ae9e3a7c44",
      "tool_name": "run-bash",
      "task_class": "MEDIUM_SCRIPT",
      "payload": "{\"script_path\": \"scripts/hello.sh\", \"args\": []}",
      "status": "running",
      "timeout": 300,
      "attempts": 1,
      "result": null,
      "result_summary": null,
      "error": null,
      "error_message": null,
      "created_at": "2025-11-30T12:02:33Z",
      "updated_at": "2025-11-30T12:03:10Z",
      "started_at": "2025-11-30T12:03:10Z",
      "finished_at": null,
      "claimed_at": "2025-11-30T12:03:10Z",
      "completed_at": null,
      "failed_at": null,
      "worker_id": "worker-1"
    }
  }
  ```
- **Status codes:** `200` on success; `404` if the task is not found; `409` if the task is not `queued`; `500` on server error.

### POST /api/tasks/{task_id}/complete
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
      "friendly_id": "DEFAULT-cabc",
      "queue_id": "que_18ae9e3a7c44",
      "tool_name": "run-bash",
      "task_class": "MEDIUM_SCRIPT",
      "payload": "{\"script_path\": \"scripts/hello.sh\", \"args\": []}",
      "status": "succeeded",
      "timeout": 300,
      "attempts": 1,
      "result": "Full stdout or structured data (optional)",
      "result_summary": "Ran script successfully",
      "error": null,
      "error_message": null,
      "created_at": "2025-11-30T12:02:33Z",
      "updated_at": "2025-11-30T12:05:00Z",
      "started_at": "2025-11-30T12:03:10Z",
      "finished_at": "2025-11-30T12:05:00Z",
      "claimed_at": "2025-11-30T12:03:10Z",
      "completed_at": "2025-11-30T12:05:00Z",
      "failed_at": null
    }
  }
  ```
- **Status codes:** `200` on success; `400` if `result_summary` is blank; `404` if the task is not found; `409` if the task is not `running`; `500` on server error.

### POST /api/tasks/{task_id}/fail
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
      "friendly_id": "DEFAULT-cabc",
      "queue_id": "que_18ae9e3a7c44",
      "tool_name": "run-bash",
      "task_class": "MEDIUM_SCRIPT",
      "payload": "{\"script_path\": \"scripts/hello.sh\", \"args\": []}",
      "status": "failed",
      "timeout": 300,
      "attempts": 1,
      "result": null,
      "result_summary": null,
      "error": "TIMEOUT: Timeout waiting for script",
      "error_message": "Timeout waiting for script",
      "created_at": "2025-11-30T12:02:33Z",
      "updated_at": "2025-11-30T12:05:00Z",
      "started_at": "2025-11-30T12:03:10Z",
      "finished_at": "2025-11-30T12:05:00Z",
      "claimed_at": "2025-11-30T12:03:10Z",
      "completed_at": null,
      "failed_at": "2025-11-30T12:05:00Z"
    }
  }
  ```
- **Status codes:** `200` on success; `400` if `error_message` is blank; `404` if the task is not found; `500` on server error.

### POST /api/tasks/{task_id}/requeue
- **Description:** Clone a succeeded or failed task back to the queue with a new ID.
- **Response:**
  ```json
  {
    "task": {
      "id": "tsk_1f2e3d4c5b6a",
      "friendly_id": "DEFAULT-5b6a",
      "queue_id": "que_18ae9e3a7c44",
      "tool_name": "run-bash",
      "task_class": "MEDIUM_SCRIPT",
      "payload": "{\"script_path\": \"scripts/hello.sh\", \"args\": []}",
      "status": "queued",
      "timeout": 300,
      "attempts": 0,
      "result": null,
      "result_summary": null,
      "error": null,
      "error_message": null,
      "created_at": "2025-11-30T12:06:10Z",
      "updated_at": "2025-11-30T12:06:10Z",
      "started_at": null,
      "finished_at": null,
      "claimed_at": null,
      "completed_at": null,
      "failed_at": null
    }
  }
  ```
- **Status codes:** `200` on success; `404` if the original task is not found; `409` if the task is not in `failed` or `succeeded` state; `500` on server error.

## Task Classes

### GET /api/task-classes
- **Description:** List all task classes with their timeout and description.
- **Response:**
  ```json
  {
    "task_classes": [
      {
        "name": "LLM_LITE",
        "timeout": 300,
        "description": "Lightweight LLM tasks"
      }
    ]
  }
  ```
- **Status codes:** `200` on success.

### POST /api/task-classes
- **Description:** Create a new task class.
- **Body:**
  ```json
  {
    "name": "CUSTOM_CLASS",
    "timeout": 600,
    "description": "Custom task class"
  }
  ```
- **Response:** *(201 Created)*
  ```json
  {
    "task_class": {
      "name": "CUSTOM_CLASS",
      "timeout": 600,
      "description": "Custom task class"
    }
  }
  ```
- **Status codes:** `201` on success; `400` if validation fails.

### PUT /api/task-classes/{name}
- **Description:** Update an existing task class.
- **Body:**
  ```json
  {
    "timeout": 700,
    "description": "Updated description"
  }
  ```
- **Response:**
  ```json
  {
    "task_class": {
      "name": "CUSTOM_CLASS",
      "timeout": 700,
      "description": "Updated description"
    }
  }
  ```
- **Status codes:** `200` on success; `400` if validation fails.

### DELETE /api/task-classes/{name}
- **Description:** Delete a task class (only if not referenced by any tools).
- **Response:**
  ```json
  {
    "status": "ok"
  }
  ```
- **Status codes:** `200` on success; `400` if task class is in use.

## Tools

### GET /api/tools
- **Description:** List all tools with their task class and description.
- **Response:**
  ```json
  {
    "tools": [
      {
        "name": "llm-haiku",
        "task_class": "LLM_LITE",
        "description": "Fast LLM"
      }
    ]
  }
  ```
- **Status codes:** `200` on success.

### POST /api/tools
- **Description:** Create a new tool.
- **Body:**
  ```json
  {
    "name": "custom-tool",
    "task_class": "MEDIUM_SCRIPT",
    "description": "Custom tool"
  }
  ```
- **Response:** *(201 Created)*
  ```json
  {
    "tool": {
      "name": "custom-tool",
      "task_class": "MEDIUM_SCRIPT",
      "description": "Custom tool"
    }
  }
  ```
- **Status codes:** `201` on success; `400` if validation fails (e.g., task_class doesn't exist).

### PUT /api/tools/{name}
- **Description:** Update an existing tool.
- **Body:**
  ```json
  {
    "task_class": "LLM_LITE",
    "description": "Updated description"
  }
  ```
- **Response:**
  ```json
  {
    "tool": {
      "name": "custom-tool",
      "task_class": "LLM_LITE",
      "description": "Updated description"
    }
  }
  ```
- **Status codes:** `200` on success; `400` if validation fails.

### DELETE /api/tools/{name}
- **Description:** Delete a tool.
- **Response:**
  ```json
  {
    "status": "ok"
  }
  ```
- **Status codes:** `200` on success.

## Prompts

### GET /api/prompts
- **Description:** List all saved prompts (without template text).
- **Response:**
  ```json
  {
    "prompts": [
      {
        "id": "prm_abc123",
        "command": "analyze",
        "label": "Code Analysis",
        "description": "Analyze code quality",
        "created_at": "2025-11-30T12:00:00Z",
        "updated_at": "2025-11-30T12:00:00Z"
      }
    ]
  }
  ```
- **Status codes:** `200` on success.

### GET /api/prompts/{prompt_id}
- **Description:** Fetch a single prompt with template text.
- **Response:**
  ```json
  {
    "prompt": {
      "id": "prm_abc123",
      "command": "analyze",
      "label": "Code Analysis",
      "template_text": "Analyze the following code...",
      "description": "Analyze code quality",
      "created_at": "2025-11-30T12:00:00Z",
      "updated_at": "2025-11-30T12:00:00Z"
    }
  }
  ```
- **Status codes:** `200` on success; `404` if prompt not found.

### POST /api/prompts
- **Description:** Create a new prompt.
- **Body:**
  ```json
  {
    "command": "analyze",
    "label": "Code Analysis",
    "template_text": "Analyze the following code...",
    "description": "Analyze code quality"
  }
  ```
- **Response:** *(201 Created)*
  ```json
  {
    "prompt": { /* full prompt object */ }
  }
  ```
- **Status codes:** `201` on success; `400` if validation fails.

### PUT /api/prompts/{prompt_id}
- **Description:** Update a prompt.
- **Body:**
  ```json
  {
    "label": "Updated Label",
    "template_text": "Updated template..."
  }
  ```
- **Response:**
  ```json
  {
    "prompt": { /* updated prompt object */ }
  }
  ```
- **Status codes:** `200` on success; `400` if validation fails; `404` if prompt not found.

### DELETE /api/prompts/{prompt_id}
- **Description:** Delete a prompt.
- **Response:**
  ```json
  {
    "message": "Prompt deleted successfully"
  }
  ```
- **Status codes:** `200` on success; `404` if prompt not found.

## Scripts

### GET /api/scripts/index
- **Description:** Returns the indexed scripts discovered by the server (`script_dirs` in `sparkq.yml`, default `scripts/`). Each entry comes from parsing script file headers via `ScriptIndex`.
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

---

**API Documentation Updated:** 2025-11-30
**Server Build ID:** b713
**Base URL:** http://localhost:5005
