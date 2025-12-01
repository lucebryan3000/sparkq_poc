"""SparkQ SQLite Storage Layer"""

import json
import logging
import sqlite3
import time
import uuid
from datetime import datetime
from pathlib import Path
from contextlib import contextmanager
from typing import Optional, List, Dict, Any

try:
    from typing import TypedDict, NotRequired
except ImportError:
    from typing_extensions import TypedDict, NotRequired

from .constants import (
    DB_LOCK_TIMEOUT_SECONDS,
    DEFAULT_TASK_TIMEOUT_SECONDS,
    MAX_TASK_LIST_LIMIT,
    STALE_FAIL_MULTIPLIER,
    STALE_WARNING_MULTIPLIER,
)
from .metrics import incr, observe
from .errors import ConflictError, NotFoundError, ValidationError


class ProjectRow(TypedDict):
    id: str
    name: str
    repo_path: NotRequired[str]
    prd_path: NotRequired[str]
    created_at: str
    updated_at: str


class SessionRow(TypedDict):
    id: str
    project_id: str
    name: str
    description: NotRequired[str]
    status: str
    started_at: str
    ended_at: NotRequired[str]
    created_at: str
    updated_at: str


class QueueRow(TypedDict):
    id: str
    session_id: str
    name: str
    instructions: NotRequired[str]
    status: str
    created_at: str
    updated_at: str


class TaskRow(TypedDict):
    id: str
    queue_id: str
    tool_name: str
    task_class: str
    payload: str
    status: str
    timeout: int
    attempts: int
    result: NotRequired[str]
    error: NotRequired[str]
    stdout: NotRequired[str]
    stderr: NotRequired[str]
    created_at: str
    updated_at: str
    started_at: NotRequired[str]
    finished_at: NotRequired[str]
    claimed_at: NotRequired[str]
    stale_warned_at: NotRequired[str]


# ID generation helpers
def gen_project_id() -> str:
    return f"prj_{uuid.uuid4().hex[:12]}"


def gen_session_id() -> str:
    return f"ses_{uuid.uuid4().hex[:12]}"


def gen_queue_id() -> str:
    return f"que_{uuid.uuid4().hex[:12]}"


def gen_task_id() -> str:
    return f"tsk_{uuid.uuid4().hex[:12]}"


def gen_prompt_id() -> str:
    return f"prm_{uuid.uuid4().hex[:12]}"


def now_iso() -> str:
    return datetime.utcnow().isoformat() + "Z"


class Storage:
    def __init__(self, db_path: str = "sparkq/data/sparkq.db"):
        resolved = Path(db_path).expanduser().resolve()
        try:
            resolved.parent.mkdir(parents=True, exist_ok=True)
        except Exception:
            # If we cannot create the directory, surface the original path resolution
            raise
        self.db_path = str(resolved)
        self.logger = logging.getLogger(__name__)
        self.max_task_list_limit = MAX_TASK_LIST_LIMIT

    @contextmanager
    def connection(self, timeout: float = DB_LOCK_TIMEOUT_SECONDS):
        conn = sqlite3.connect(self.db_path, timeout=timeout)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def init_db(self):
        """Create tables if they don't exist"""
        with self.connection() as conn:
            cursor = conn.cursor()

            def _ensure_column(table: str, column: str, ddl_type: str):
                """Add missing column to a table if it is absent."""
                info = cursor.execute(f"PRAGMA table_info({table})").fetchall()
                if not any(row["name"] == column for row in info):
                    cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl_type}")

            # Enable WAL mode
            cursor.execute("PRAGMA journal_mode=WAL")

            # Create tables (exact DDL from Phase 1 prompt)
            cursor.execute(
                """
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                repo_path TEXT,
                prd_path TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
            )

            cursor.execute(
                """
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL REFERENCES projects(id),
                name TEXT NOT NULL,
                description TEXT,
                status TEXT NOT NULL DEFAULT 'active',
                started_at TEXT NOT NULL,
                ended_at TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
            )

            cursor.execute(
                """
            CREATE TABLE IF NOT EXISTS queues (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL REFERENCES sessions(id),
                name TEXT NOT NULL UNIQUE,
                instructions TEXT,
                status TEXT NOT NULL DEFAULT 'active',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
            )

            cursor.execute(
                """
            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                queue_id TEXT NOT NULL REFERENCES queues(id),
                tool_name TEXT NOT NULL,
                task_class TEXT NOT NULL,
                payload TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'queued',
                timeout INTEGER NOT NULL,
                attempts INTEGER NOT NULL DEFAULT 0,
                result TEXT,
                error TEXT,
                stdout TEXT,
                stderr TEXT,
                claimed_at TEXT,
                stale_warned_at TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                started_at TEXT,
                finished_at TEXT
            )
            """
            )
            _ensure_column("tasks", "claimed_at", "TEXT")
            _ensure_column("tasks", "stale_warned_at", "TEXT")

            # Create prompts table for text expanders (Phase 14A)
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS prompts (
                    id TEXT PRIMARY KEY,
                    command TEXT NOT NULL UNIQUE,
                    label TEXT NOT NULL,
                    template_text TEXT NOT NULL,
                    description TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )

            # Create prompt index
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_prompts_command ON prompts(command)"
            )

            # Create indexes
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_tasks_queue_status ON tasks(queue_id, status)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_tasks_queue_created ON tasks(queue_id, created_at DESC)"
            )
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)")
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_tasks_started_at ON tasks(started_at)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_queues_session ON queues(session_id)"
            )
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_queues_status ON queues(status)")
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status)"
            )

            now = now_iso()

            # Seed default prompts (Phase 14A)
            cursor.execute("SELECT COUNT(*) FROM prompts")
            prompt_count = cursor.fetchone()[0]
            if prompt_count == 0:
                cursor.execute(
                    """INSERT INTO prompts (id, command, label, template_text, description, created_at, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (
                        gen_prompt_id(),
                        "code-review",
                        "Code Review",
                        "Review the following code for best practices, potential bugs, and security issues. Provide specific recommendations for improvement.\n\n",
                        "Review code for best practices and bugs",
                        now,
                        now,
                    ),
                )
                cursor.execute(
                    """INSERT INTO prompts (id, command, label, template_text, description, created_at, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (
                        gen_prompt_id(),
                        "write-tests",
                        "Write Tests",
                        "Generate comprehensive test cases for the following code. Include unit tests, edge cases, and integration test scenarios using pytest.\n\n",
                        "Generate comprehensive test cases",
                        now,
                        now,
                    ),
                )
                cursor.execute(
                    """INSERT INTO prompts (id, command, label, template_text, description, created_at, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (
                        gen_prompt_id(),
                        "refactor",
                        "Refactor Code",
                        "Refactor the following code to improve performance, readability, and maintainability. Follow SOLID principles and current best practices.\n\n",
                        "Refactor code for better quality",
                        now,
                        now,
                    ),
                )

            # Create default project for single-project mode (Phase 12)
            cursor.execute(
                """INSERT OR IGNORE INTO projects (id, name, repo_path, prd_path, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                ("prj_default", "default", None, None, now, now)
            )

            # Config and audit tables (Phase 20)
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS config (
                    namespace TEXT NOT NULL,
                    key TEXT NOT NULL,
                    value TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    updated_by TEXT,
                    PRIMARY KEY (namespace, key)
                )
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS audit_log (
                    id TEXT PRIMARY KEY,
                    actor TEXT,
                    action TEXT NOT NULL,
                    details TEXT,
                    created_at TEXT NOT NULL
                )
                """
            )

            # Granular config tables for tools and task classes (Phase 20.1)
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS task_classes (
                    name TEXT PRIMARY KEY,
                    timeout INTEGER NOT NULL,
                    description TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS tools (
                    name TEXT PRIMARY KEY,
                    description TEXT,
                    task_class TEXT NOT NULL REFERENCES task_classes(name),
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_tools_task_class ON tools(task_class)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_config_namespace ON config(namespace)")

    # === Project CRUD ===
    def create_project(self, name: str, repo_path: str = None, prd_path: str = None) -> ProjectRow:
        project_id = gen_project_id()
        now = now_iso()

        with self.connection() as conn:
            conn.execute(
                """INSERT INTO projects (id, name, repo_path, prd_path, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (project_id, name, repo_path, prd_path, now, now),
            )

        return {
            "id": project_id,
            "name": name,
            "repo_path": repo_path,
            "prd_path": prd_path,
            "created_at": now,
            "updated_at": now,
        }

    def get_project(self) -> Optional[ProjectRow]:
        """Get the single project (v1: single project only)"""
        with self.connection() as conn:
            cursor = conn.execute("SELECT * FROM projects LIMIT 1")
            row = cursor.fetchone()
            return dict(row) if row else None

    # === Session CRUD ===
    def create_session(self, name: str, description: str = None) -> SessionRow:
        session_id = gen_session_id()
        now = now_iso()

        # Get project (assumes single project exists)
        project = self.get_project()
        if not project:
            raise NotFoundError("No project found. Run 'sparkq setup' first.")

        with self.connection() as conn:
            conn.execute(
                """INSERT INTO sessions (id, project_id, name, description, status, started_at, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (session_id, project["id"], name, description, "active", now, now, now),
            )

        return {
            "id": session_id,
            "project_id": project["id"],
            "name": name,
            "description": description,
            "status": "active",
            "started_at": now,
            "ended_at": None,
            "created_at": now,
            "updated_at": now,
        }

    def get_session(self, session_id: str) -> Optional[SessionRow]:
        with self.connection() as conn:
            cursor = conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

    def get_session_by_name(self, name: str) -> Optional[SessionRow]:
        with self.connection() as conn:
            cursor = conn.execute("SELECT * FROM sessions WHERE name = ?", (name,))
            row = cursor.fetchone()
            return dict(row) if row else None

    def list_sessions(self, status: str = None) -> List[SessionRow]:
        with self.connection() as conn:
            if status:
                cursor = conn.execute(
                    "SELECT * FROM sessions WHERE status = ? ORDER BY started_at DESC",
                    (status,),
                )
            else:
                cursor = conn.execute(
                    "SELECT * FROM sessions ORDER BY started_at DESC"
                )
            return [dict(row) for row in cursor.fetchall()]

    def end_session(self, session_id: str) -> bool:
        now = now_iso()
        with self.connection() as conn:
            cursor = conn.execute(
                "UPDATE sessions SET status = 'ended', ended_at = ?, updated_at = ? WHERE id = ?",
                (now, now, session_id),
            )
            return cursor.rowcount > 0

    def delete_session(self, session_id: str) -> bool:
        with self.connection() as conn:
            # Get all queues for this session to cascade delete their tasks
            cursor = conn.execute(
                "SELECT id FROM queues WHERE session_id = ?", (session_id,)
            )
            queue_ids = [row[0] for row in cursor.fetchall()]

            # Delete tasks for all queues in this session (cascade)
            for queue_id in queue_ids:
                conn.execute("DELETE FROM tasks WHERE queue_id = ?", (queue_id,))

            # Delete all queues in this session
            conn.execute("DELETE FROM queues WHERE session_id = ?", (session_id,))

            # Finally delete the session itself
            cursor = conn.execute(
                "DELETE FROM sessions WHERE id = ?", (session_id,)
            )
            return cursor.rowcount > 0

    # === Queue CRUD ===
    def create_queue(self, session_id: str, name: str, instructions: str = None) -> QueueRow:
        queue_id = gen_queue_id()
        now = now_iso()

        with self.connection() as conn:
            conn.execute(
                """INSERT INTO queues (id, session_id, name, instructions, status, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (queue_id, session_id, name, instructions, 'active', now, now)
            )

        return {
            'id': queue_id,
            'session_id': session_id,
            'name': name,
            'instructions': instructions,
            'status': 'active',
            'created_at': now,
            'updated_at': now
        }

    def get_queue(self, queue_id: str) -> Optional[QueueRow]:
        with self.connection() as conn:
            cursor = conn.execute("SELECT * FROM queues WHERE id = ?", (queue_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

    def get_queue_by_name(self, name: str) -> Optional[QueueRow]:
        with self.connection() as conn:
            cursor = conn.execute("SELECT * FROM queues WHERE name = ?", (name,))
            row = cursor.fetchone()
            return dict(row) if row else None

    def get_queue_names(self, queue_ids: List[str]) -> Dict[str, str]:
        """Return a mapping of queue_id -> name for provided IDs."""
        unique_ids = [qid for qid in dict.fromkeys(queue_ids) if qid]
        if not unique_ids:
            return {}

        placeholders = ",".join("?" for _ in unique_ids)
        with self.connection() as conn:
            rows = conn.execute(
                f"SELECT id, name FROM queues WHERE id IN ({placeholders})", tuple(unique_ids)
            ).fetchall()

        return {row["id"]: row["name"] for row in rows}

    def list_queues(self, session_id: str = None, status: str = None) -> List[QueueRow]:
        with self.connection() as conn:
            query = "SELECT * FROM queues WHERE 1=1"
            params = []

            if session_id:
                query += " AND session_id = ?"
                params.append(session_id)

            if status:
                query += " AND status = ?"
                params.append(status)

            query += " ORDER BY created_at DESC"

            cursor = conn.execute(query, params)
            return [dict(row) for row in cursor.fetchall()]

    def end_queue(self, queue_id: str) -> bool:
        now = now_iso()
        with self.connection() as conn:
            cursor = conn.execute(
                "UPDATE queues SET status = 'ended', updated_at = ? WHERE id = ?",
                (now, queue_id)
            )
            return cursor.rowcount > 0

    def archive_queue(self, queue_id: str) -> bool:
        now = now_iso()
        with self.connection() as conn:
            cursor = conn.execute(
                "UPDATE queues SET status = 'archived', updated_at = ? WHERE id = ?",
                (now, queue_id)
            )
            return cursor.rowcount > 0

    def unarchive_queue(self, queue_id: str) -> bool:
        now = now_iso()
        with self.connection() as conn:
            cursor = conn.execute(
                "UPDATE queues SET status = 'idle', updated_at = ? WHERE id = ?",
                (now, queue_id)
            )
            return cursor.rowcount > 0

    def delete_queue(self, queue_id: str) -> bool:
        with self.connection() as conn:
            # Delete tasks associated with this queue first (cascade)
            conn.execute("DELETE FROM tasks WHERE queue_id = ?", (queue_id,))
            # Then delete the queue itself
            cursor = conn.execute(
                "DELETE FROM queues WHERE id = ?",
                (queue_id,)
            )
            return cursor.rowcount > 0

    # === Task CRUD ===
    def create_task(
        self, queue_id: str, tool_name: str, task_class: str, payload: str, timeout: int,
        prompt_path: str = None, metadata: str = None
    ) -> TaskRow:
        task_id = gen_task_id()
        now = now_iso()

        with self.connection() as conn:
            conn.execute(
                """INSERT INTO tasks (id, queue_id, tool_name, task_class, payload, status, timeout, attempts,
                                      claimed_at, stale_warned_at, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    task_id,
                    queue_id,
                    tool_name,
                    task_class,
                    payload,
                    'queued',
                    timeout,
                    0,
                    None,
                    None,
                    now,
                    now,
                )
            )

        return {
            'id': task_id,
            'queue_id': queue_id,
            'tool_name': tool_name,
            'task_class': task_class,
            'payload': payload,
            'status': 'queued',
            'timeout': timeout,
            'attempts': 0,
            'result': None,
            'error': None,
            'stdout': None,
            'stderr': None,
            'claimed_at': None,
            'stale_warned_at': None,
            'created_at': now,
            'updated_at': now,
            'started_at': None,
            'finished_at': None
        }

    def get_task(self, task_id: str) -> Optional[TaskRow]:
        with self.connection() as conn:
            cursor = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

    def list_tasks(self, queue_id: str = None, status: str = None, limit: int = None, offset: int = 0) -> List[TaskRow]:
        with self.connection() as conn:
            query = "SELECT * FROM tasks WHERE 1=1"
            params = []

            if queue_id:
                query += " AND queue_id = ?"
                params.append(queue_id)

            if status:
                query += " AND status = ?"
                params.append(status)

            query += " ORDER BY created_at DESC"

            # Enforce an upper bound to avoid unbounded result sets
            effective_limit = self.max_task_list_limit
            if limit is not None:
                effective_limit = min(limit, self.max_task_list_limit)

            query += " LIMIT ? OFFSET ?"
            params.extend([effective_limit, offset])

            cursor = conn.execute(query, params)
            return [dict(row) for row in cursor.fetchall()]

    def get_queue_stats(self, queue_ids: List[str]) -> Dict[str, Dict[str, int]]:
        """
        Return aggregated task counts per queue to avoid N+1 fetching.
        """
        if not queue_ids:
            return {}

        placeholders = ",".join(["?"] * len(queue_ids))
        query = f"""
            SELECT
                queue_id,
                COUNT(*) as total,
                SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END) as done,
                SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running,
                SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) as queued
            FROM tasks
            WHERE queue_id IN ({placeholders})
            GROUP BY queue_id
        """
        with self.connection() as conn:
            cursor = conn.execute(query, queue_ids)
            rows = cursor.fetchall()

        stats_map: Dict[str, Dict[str, int]] = {}
        for row in rows:
            stats_map[row["queue_id"]] = {
                "total": row["total"] or 0,
                "done": row["done"] or 0,
                "running": row["running"] or 0,
                "queued": row["queued"] or 0,
            }

        return stats_map

    def get_queue_names(self, queue_ids: List[str]) -> Dict[str, str]:
        """
        Return a mapping of queue_id -> queue name for display without per-task lookups.
        """
        if not queue_ids:
            return {}
        placeholders = ",".join(["?"] * len(queue_ids))
        query = f"SELECT id, name FROM queues WHERE id IN ({placeholders})"
        with self.connection() as conn:
            rows = conn.execute(query, queue_ids).fetchall()
        return {row["id"]: row["name"] for row in rows}

    def get_oldest_queued_task(self, queue_id: str) -> Optional[TaskRow]:
        """Get oldest queued task for a queue (FIFO ordering)"""
        with self.connection() as conn:
            cursor = conn.execute(
                """
                SELECT
                    *,
                    json_extract(payload, '$.prompt') AS prompt_text
                FROM tasks
                WHERE queue_id = ? AND status = 'queued'
                ORDER BY created_at ASC
                LIMIT 1
                """,
                (queue_id,),
            )
            row = cursor.fetchone()
            return dict(row) if row else None

    def claim_task(self, task_id: str) -> TaskRow:
        """Claim a task by setting status to 'running' and claimed_at/started_at timestamps."""
        now = now_iso()
        with self.connection(timeout=10.0) as conn:
            # Enable explicit transaction control for serialized claims
            conn.isolation_level = None
            try:
                conn.execute("BEGIN EXCLUSIVE")

                cursor = conn.execute(
                    """UPDATE tasks
                       SET status = 'running',
                           started_at = COALESCE(started_at, ?),
                           claimed_at = COALESCE(claimed_at, ?),
                           updated_at = ?,
                           attempts = attempts + 1
                       WHERE id = ? AND status = 'queued'""",
                    (now, now, now, task_id),
                )

                if cursor.rowcount == 0:
                    conn.execute("ROLLBACK")
                    raise ConflictError(f"Task {task_id} not found or already claimed")

                cursor = conn.execute(
                    """
                    SELECT
                        *,
                        json_extract(payload, '$.prompt') AS prompt_text
                    FROM tasks
                    WHERE id = ?
                    """,
                    (task_id,),
                )
                row = cursor.fetchone()
                return dict(row) if row else None
            except Exception:
                try:
                    conn.execute("ROLLBACK")
                except Exception:
                    self.logger.exception("Failed to rollback claim for task %s", task_id)
                raise

    # === Config helpers (Phase 20) ===
    def _serialize_value(self, value: Any) -> str:
        return json.dumps(value)

    def _deserialize_value(self, value: str) -> Any:
        try:
            return json.loads(value)
        except Exception:
            return value

    def list_config_entries(self) -> List[dict]:
        with self.connection() as conn:
            rows = conn.execute(
                "SELECT namespace, key, value, updated_at, updated_by FROM config"
            ).fetchall()
            return [
                {
                    "namespace": row["namespace"],
                    "key": row["key"],
                    "value": self._deserialize_value(row["value"]),
                    "updated_at": row["updated_at"],
                    "updated_by": row["updated_by"],
                }
                for row in rows
            ]

    def get_config_entry(self, namespace: str, key: str) -> Optional[dict]:
        with self.connection() as conn:
            row = conn.execute(
                "SELECT namespace, key, value, updated_at, updated_by FROM config WHERE namespace = ? AND key = ?",
                (namespace, key),
            ).fetchone()
            if not row:
                return None
            return {
                "namespace": row["namespace"],
                "key": row["key"],
                "value": self._deserialize_value(row["value"]),
                "updated_at": row["updated_at"],
                "updated_by": row["updated_by"],
            }

    def upsert_config_entry(self, namespace: str, key: str, value: Any, updated_by: str = "system"):
        now = now_iso()
        serialized = self._serialize_value(value)
        with self.connection() as conn:
            conn.execute(
                """
                INSERT INTO config (namespace, key, value, updated_at, updated_by)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(namespace, key)
                DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at, updated_by=excluded.updated_by
                """,
                (namespace, key, serialized, now, updated_by),
            )

    def delete_config_entry(self, namespace: str, key: str):
        with self.connection() as conn:
            conn.execute("DELETE FROM config WHERE namespace = ? AND key = ?", (namespace, key))

    def count_config_entries(self) -> int:
        with self.connection() as conn:
            row = conn.execute("SELECT COUNT(*) as cnt FROM config").fetchone()
            return row["cnt"] if row else 0

    def export_config(self) -> Dict[str, Dict[str, Any]]:
        """Return config as nested dict {namespace: {key: value}}."""
        entries = self.list_config_entries()
        output: Dict[str, Dict[str, Any]] = {}
        for entry in entries:
            ns = entry["namespace"]
            output.setdefault(ns, {})
            output[ns][entry["key"]] = entry["value"]
        return output

    def log_audit(self, actor: Optional[str], action: str, details: Optional[dict] = None):
        now = now_iso()
        audit_id = f"audit_{uuid.uuid4().hex[:12]}"
        details_str = json.dumps(details) if details is not None else None
        with self.connection() as conn:
            conn.execute(
                """
                INSERT INTO audit_log (id, actor, action, details, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (audit_id, actor, action, details_str, now),
            )

    # === Task classes & tools (Phase 20.1) ===
    def list_task_classes(self) -> List[dict]:
        with self.connection() as conn:
            rows = conn.execute(
                "SELECT name, timeout, description, created_at, updated_at FROM task_classes ORDER BY name"
            ).fetchall()
            return [dict(row) for row in rows]

    def get_task_class_record(self, name: str) -> Optional[dict]:
        with self.connection() as conn:
            row = conn.execute(
                "SELECT name, timeout, description, created_at, updated_at FROM task_classes WHERE name = ?",
                (name,),
            ).fetchone()
            return dict(row) if row else None

    def upsert_task_class(self, name: str, timeout: int, description: Optional[str] = None):
        if not name or not isinstance(name, str):
            raise ValidationError("task_class name required")
        if not isinstance(timeout, int) or timeout <= 0:
            raise ValidationError("timeout must be a positive integer")
        now = now_iso()
        with self.connection() as conn:
            conn.execute(
                """
                INSERT INTO task_classes (name, timeout, description, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(name)
                DO UPDATE SET timeout=excluded.timeout, description=excluded.description, updated_at=excluded.updated_at
                """,
                (name, timeout, description, now, now),
            )

    def delete_task_class(self, name: str):
        with self.connection() as conn:
            # Prevent delete if referenced by any tool
            ref = conn.execute("SELECT 1 FROM tools WHERE task_class = ? LIMIT 1", (name,)).fetchone()
            if ref:
                raise ConflictError("Cannot delete task_class in use by tools")
            conn.execute("DELETE FROM task_classes WHERE name = ?", (name,))

    def list_tools_table(self) -> List[dict]:
        with self.connection() as conn:
            rows = conn.execute(
                "SELECT name, description, task_class, created_at, updated_at FROM tools ORDER BY name"
            ).fetchall()
            return [dict(row) for row in rows]

    def get_tool_record(self, name: str) -> Optional[dict]:
        with self.connection() as conn:
            row = conn.execute(
                "SELECT name, description, task_class, created_at, updated_at FROM tools WHERE name = ?",
                (name,),
            ).fetchone()
            return dict(row) if row else None

    def upsert_tool_record(self, name: str, task_class: str, description: Optional[str] = None):
        if not name or not isinstance(name, str):
            raise ValidationError("tool name required")
        if not task_class or not isinstance(task_class, str):
            raise ValidationError("task_class required for tool")
        now = now_iso()
        with self.connection() as conn:
            # Ensure task_class exists
            tc = conn.execute("SELECT 1 FROM task_classes WHERE name = ?", (task_class,)).fetchone()
            if not tc:
                raise NotFoundError(f"task_class '{task_class}' does not exist")
            conn.execute(
                """
                INSERT INTO tools (name, description, task_class, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(name)
                DO UPDATE SET description=excluded.description, task_class=excluded.task_class, updated_at=excluded.updated_at
                """,
                (name, description, task_class, now, now),
            )

    def delete_tool_record(self, name: str):
        with self.connection() as conn:
            conn.execute("DELETE FROM tools WHERE name = ?", (name,))

    def complete_task(self, task_id: str, result_summary: str, result_data: str = None,
                     stdout: str = None, stderr: str = None) -> TaskRow:
        """Mark task as succeeded with result data"""
        now = now_iso()
        with self.connection() as conn:
            cursor = conn.execute(
                """UPDATE tasks SET status = 'succeeded', result = ?, stdout = ?, stderr = ?,
                   finished_at = ?, updated_at = ? WHERE id = ?""",
                (result_data or result_summary, stdout, stderr, now, now, task_id)
            )

            if cursor.rowcount == 0:
                raise NotFoundError(f"Task {task_id} not found")

            # Fetch and return the updated task
            cursor = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

    def fail_task(self, task_id: str, error_message: str, error_type: str = None,
                  stdout: str = None, stderr: str = None) -> TaskRow:
        """Mark task as failed with error information"""
        now = now_iso()
        error_data = error_message if not error_type else f"{error_type}: {error_message}"

        with self.connection() as conn:
            cursor = conn.execute(
                """UPDATE tasks SET status = 'failed', error = ?, stdout = ?, stderr = ?,
                   finished_at = ?, updated_at = ? WHERE id = ?""",
                (error_data, stdout, stderr, now, now, task_id)
            )

            if cursor.rowcount == 0:
                raise NotFoundError(f"Task {task_id} not found")

            # Fetch and return the updated task
            cursor = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

    def requeue_task(self, task_id: str) -> TaskRow:
        """Reset a failed task to queued status (clone as new task with new ID)"""
        # Get the original task
        original_task = self.get_task(task_id)
        if not original_task:
            raise NotFoundError(f"Task {task_id} not found")

        # Create a new task with same parameters but fresh state
        new_task_id = gen_task_id()
        now = now_iso()

        with self.connection() as conn:
            conn.execute(
                """INSERT INTO tasks (id, queue_id, tool_name, task_class, payload, status, timeout, attempts,
                                      claimed_at, stale_warned_at, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    new_task_id,
                    original_task['queue_id'],
                    original_task['tool_name'],
                    original_task['task_class'],
                    original_task['payload'],
                    'queued',
                    original_task['timeout'],
                    0,
                    None,
                    None,
                    now,
                    now,
                )
            )

            # Fetch and return the new task
            cursor = conn.execute("SELECT * FROM tasks WHERE id = ?", (new_task_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

    def update_task(self, task_id: str, **updates) -> Optional[TaskRow]:
        """Update task fields. Allowed fields: tool_name, payload, timeout, status. Returns updated task or None if not found."""
        existing = self.get_task(task_id)
        if not existing:
            return None

        allowed = {'tool_name', 'payload', 'timeout', 'status'}
        allowed_updates = {k: v for k, v in updates.items() if k in allowed}

        if not allowed_updates:
            return existing

        allowed_updates['updated_at'] = now_iso()
        set_clause = ', '.join([f"{k} = ?" for k in allowed_updates.keys()])
        values = list(allowed_updates.values()) + [task_id]

        with self.connection() as conn:
            conn.execute(
                f"UPDATE tasks SET {set_clause} WHERE id = ?",
                values
            )

        return self.get_task(task_id)

    def delete_task(self, task_id: str) -> bool:
        """Delete a task. Returns True if successful, False if not found."""
        with self.connection() as conn:
            cursor = conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
            return cursor.rowcount > 0

    def purge_old_tasks(self, older_than_days: int = 3) -> int:
        """Delete old succeeded/failed tasks older than specified days"""
        from datetime import datetime, timedelta

        cutoff_date = (datetime.utcnow() - timedelta(days=older_than_days)).isoformat() + "Z"

        with self.connection() as conn:
            cursor = conn.execute(
                """DELETE FROM tasks WHERE status IN ('succeeded', 'failed')
                   AND finished_at < ?""",
                (cutoff_date,)
            )
            return cursor.rowcount

    def get_timeout_for_task(self, task_id: str) -> int:
        """
        Resolve timeout for a task using explicit value or tool registry fallback.

        Returns timeout in seconds, defaulting to task-class defaults on errors.
        """
        from .constants import TASK_CLASS_TIMEOUTS

        default_timeouts = TASK_CLASS_TIMEOUTS
        fallback_default = default_timeouts.get("MEDIUM_SCRIPT", DEFAULT_TASK_TIMEOUT_SECONDS)
        task_class = None
        try:
            task = self.get_task(task_id)
            if not task:
                return fallback_default

            timeout_value = task.get("timeout")
            if timeout_value is not None:
                try:
                    timeout_int = int(timeout_value)
                except (TypeError, ValueError):
                    timeout_int = None

                if timeout_int is not None and timeout_int > 0:
                    return timeout_int
            task_class = task.get("task_class")

            tool_name = task.get("tool_name")
            registry = getattr(self, "registry", None)
            if registry is None:
                try:
                    from .tools import get_registry

                    registry = get_registry()
                except Exception:
                    registry = None

            if registry:
                try:
                    registry_timeout = registry.get_timeout(tool_name) if tool_name else None
                except Exception:
                    registry_timeout = None

                if registry_timeout is not None and registry_timeout > 0:
                    return registry_timeout

            return default_timeouts.get(task_class, fallback_default)
        except Exception:
            return default_timeouts.get(task_class, fallback_default)

    def get_stale_tasks(self, timeout_multiplier: float = STALE_WARNING_MULTIPLIER) -> List[TaskRow]:
        """
        Return running tasks that have exceeded their claimed timeout threshold.

        A task is stale if status is 'running', it has a claimed_at/started_at timestamp,
        and now > claimed_at + (timeout * timeout_multiplier).
        """
        stale_tasks: List[TaskRow] = []

        now_ts = datetime.utcnow().timestamp()
        try:
            with self.connection() as conn:
                cursor = conn.execute(
                    "SELECT * FROM tasks WHERE status='running' AND (claimed_at IS NOT NULL OR started_at IS NOT NULL)"
                )
                rows = cursor.fetchall()
        except sqlite3.Error as exc:
            self.logger.exception("Failed to query running tasks for stale detection: %s", exc)
            incr("sparkq.stale_tasks.runs", tags={"status": "error"})
            raise
        except Exception:
            incr("sparkq.stale_tasks.runs", tags={"status": "error"})
            raise

        for row in rows:
            task: TaskRow = dict(row)
            claimed_at = task.get("claimed_at") or task.get("started_at")
            if not claimed_at:
                continue

            timeout_seconds = self.get_timeout_for_task(task["id"])

            try:
                claimed_dt = datetime.fromisoformat(str(claimed_at).replace("Z", "+00:00"))
                claimed_ts = claimed_dt.timestamp()
            except Exception:
                # Skip tasks with invalid timestamps instead of crashing
                continue

            deadline_ts = claimed_ts + (timeout_seconds * timeout_multiplier)
            if now_ts > deadline_ts:
                stale_tasks.append(task)

        status_tag = "empty" if not stale_tasks else "ok"
        incr("sparkq.stale_tasks.runs", tags={"status": status_tag})
        incr("sparkq.stale_tasks.found", len(stale_tasks))
        return stale_tasks

    def mark_stale_warning(self, task_id: str) -> TaskRow:
        """
        Mark a task with a stale warning timestamp.
        """
        task = self.get_task(task_id)
        if not task:
            raise NotFoundError(f"Task {task_id} not found")
        if task.get("stale_warned_at"):
            return task

        now = now_iso()
        with self.connection() as conn:
            conn.execute(
                "UPDATE tasks SET stale_warned_at = ? WHERE id = ?",
                (now, task_id),
            )
            cursor = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,))
            row = cursor.fetchone()

        updated_task: TaskRow = dict(row) if row else task
        updated_task["stale_warned_at"] = updated_task.get("stale_warned_at") or now

        self.logger.info("Marked task %s with stale warning", task_id)
        return updated_task

    def warn_stale_tasks(self, timeout_multiplier: float = STALE_WARNING_MULTIPLIER) -> List[TaskRow]:
        """
        Mark running tasks that have crossed the warning threshold.
        """
        start = time.time()
        try:
            stale_tasks = self.get_stale_tasks(timeout_multiplier=timeout_multiplier)
        except Exception:
            incr("sparkq.stale_warn.runs", tags={"status": "error"})
            raise

        warned: List[TaskRow] = []
        for task in stale_tasks:
            if task.get("stale_warned_at"):
                continue

            try:
                warned_task = self.mark_stale_warning(task["id"])
                warned.append(warned_task)
            except Exception:
                self.logger.exception("Failed to mark stale warning for task %s", task.get("id"))
                continue

        duration_ms = (time.time() - start) * 1000
        status_tag = "empty" if not warned else "ok"
        self.logger.info("Stale warnings marked for %s tasks (%.1fms)", len(warned), duration_ms)
        incr("sparkq.stale_warn.runs", tags={"status": status_tag})
        observe("sparkq.stale_warn.duration_ms", duration_ms, tags={"status": status_tag})
        incr("sparkq.stale_warn.marked", len(warned))
        return warned

    def auto_fail_stale_tasks(self, timeout_multiplier: float = STALE_FAIL_MULTIPLIER) -> List[TaskRow]:
        """
        Auto-fail tasks that are stale using the provided timeout multiplier.
        """
        auto_failed: List[dict] = []

        start = time.time()
        try:
            stale_tasks = self.get_stale_tasks(timeout_multiplier=timeout_multiplier)
        except Exception:
            incr("sparkq.auto_fail.runs", tags={"status": "error"})
            raise

        for task in stale_tasks:
            try:
                failed_task = self.fail_task(
                    task["id"],
                    "Task timeout (auto-failed)",
                    error_type="TIMEOUT",
                )
                auto_failed.append(failed_task)
            except Exception:
                # Continue processing other tasks even if one fails, but log it
                self.logger.exception("Failed to auto-fail stale task %s", task.get("id"))
                continue

        duration_ms = (time.time() - start) * 1000
        self.logger.info("Auto-failed %s stale tasks (%.1fms)", len(auto_failed), duration_ms)
        status_tag = "empty" if not auto_failed else "ok"
        incr("sparkq.auto_fail.runs", tags={"status": status_tag})
        observe("sparkq.auto_fail.duration_ms", duration_ms, tags={"status": status_tag})
        incr("sparkq.auto_fail.failed", len(auto_failed))
        return auto_failed

    # === Prompt CRUD ===
    def create_prompt(
        self, command: str, label: str, template_text: str, description: str = None
    ) -> dict:
        import re

        if not re.match(r"^[a-z0-9][a-z0-9-]*$", command):
            raise ValidationError("Command must match pattern ^[a-z0-9][a-z0-9-]*$")

        with self.connection() as conn:
            cursor = conn.execute(
                "SELECT 1 FROM prompts WHERE command = ?",
                (command,),
            )
            if cursor.fetchone():
                raise ConflictError(f"Prompt command '{command}' already exists")

            prompt_id = gen_prompt_id()
            now = now_iso()
            conn.execute(
                """INSERT INTO prompts (id, command, label, template_text, description, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (prompt_id, command, label, template_text, description, now, now),
            )

        return {
            "id": prompt_id,
            "command": command,
            "label": label,
            "template_text": template_text,
            "description": description,
            "created_at": now,
            "updated_at": now,
        }

    def get_prompt(self, prompt_id: str) -> Optional[dict]:
        with self.connection() as conn:
            cursor = conn.execute("SELECT * FROM prompts WHERE id = ?", (prompt_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

    def get_prompt_by_command(self, command: str) -> Optional[dict]:
        with self.connection() as conn:
            cursor = conn.execute("SELECT * FROM prompts WHERE command = ?", (command,))
            row = cursor.fetchone()
            return dict(row) if row else None

    def list_prompts(self) -> List[dict]:
        with self.connection() as conn:
            cursor = conn.execute("SELECT * FROM prompts ORDER BY command ASC")
            return [dict(row) for row in cursor.fetchall()]

    def update_prompt(
        self,
        prompt_id: str,
        command: str = None,
        label: str = None,
        template_text: str = None,
        description: str = None,
    ) -> dict:
        import re

        existing_prompt = self.get_prompt(prompt_id)
        if not existing_prompt:
            raise NotFoundError(f"Prompt {prompt_id} not found")

        updates = []
        params = []

        with self.connection() as conn:
            if command is not None:
                if not re.match(r"^[a-z0-9][a-z0-9-]*$", command):
                    raise ValidationError("Command must match pattern ^[a-z0-9][a-z0-9-]*$")

                cursor = conn.execute(
                    "SELECT 1 FROM prompts WHERE command = ? AND id != ?",
                    (command, prompt_id),
                )
                if cursor.fetchone():
                    raise ConflictError(f"Prompt command '{command}' already exists")

                updates.append("command = ?")
                params.append(command)

            if label is not None:
                updates.append("label = ?")
                params.append(label)

            if template_text is not None:
                updates.append("template_text = ?")
                params.append(template_text)

            if description is not None:
                updates.append("description = ?")
                params.append(description)

            now = now_iso()
            updates.append("updated_at = ?")
            params.append(now)
            params.append(prompt_id)

            set_clause = ", ".join(updates)
            conn.execute(f"UPDATE prompts SET {set_clause} WHERE id = ?", params)

        return self.get_prompt(prompt_id)

    def delete_prompt(self, prompt_id: str) -> None:
        with self.connection() as conn:
            cursor = conn.execute("DELETE FROM prompts WHERE id = ?", (prompt_id,))
            if cursor.rowcount == 0:
                raise NotFoundError(f"Prompt {prompt_id} not found")
