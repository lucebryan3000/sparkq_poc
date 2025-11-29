"""SparkQ SQLite Storage Layer"""

import sqlite3
import uuid
from datetime import datetime
from pathlib import Path
from contextlib import contextmanager
from typing import Optional, List


# ID generation helpers
def gen_project_id() -> str:
    return f"prj_{uuid.uuid4().hex[:12]}"


def gen_session_id() -> str:
    return f"ses_{uuid.uuid4().hex[:12]}"


def gen_stream_id() -> str:
    return f"str_{uuid.uuid4().hex[:12]}"


def gen_task_id() -> str:
    return f"tsk_{uuid.uuid4().hex[:12]}"


def now_iso() -> str:
    return datetime.utcnow().isoformat() + "Z"


class Storage:
    def __init__(self, db_path: str = "sparkq.db"):
        self.db_path = db_path

    @contextmanager
    def connection(self):
        conn = sqlite3.connect(self.db_path)
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
            CREATE TABLE IF NOT EXISTS streams (
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
                stream_id TEXT NOT NULL REFERENCES streams(id),
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
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                started_at TEXT,
                finished_at TEXT
            )
            """
            )

            # Create indexes
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_tasks_stream_status ON tasks(stream_id, status)"
            )
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)")
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_tasks_started_at ON tasks(started_at)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_streams_session ON streams(session_id)"
            )
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_streams_status ON streams(status)")
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status)"
            )

    # === Project CRUD ===
    def create_project(self, name: str, repo_path: str = None, prd_path: str = None) -> dict:
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

    def get_project(self) -> Optional[dict]:
        """Get the single project (v1: single project only)"""
        with self.connection() as conn:
            cursor = conn.execute("SELECT * FROM projects LIMIT 1")
            row = cursor.fetchone()
            return dict(row) if row else None

    # === Session CRUD ===
    def create_session(self, name: str, description: str = None) -> dict:
        session_id = gen_session_id()
        now = now_iso()

        # Get project (assumes single project exists)
        project = self.get_project()
        if not project:
            raise ValueError("No project found. Run 'sparkq setup' first.")

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

    def get_session(self, session_id: str) -> Optional[dict]:
        with self.connection() as conn:
            cursor = conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

    def get_session_by_name(self, name: str) -> Optional[dict]:
        with self.connection() as conn:
            cursor = conn.execute("SELECT * FROM sessions WHERE name = ?", (name,))
            row = cursor.fetchone()
            return dict(row) if row else None

    def list_sessions(self, status: str = None) -> List[dict]:
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

    # === Stream CRUD ===
    def create_stream(self, session_id: str, name: str, instructions: str = None) -> dict:
        stream_id = gen_stream_id()
        now = now_iso()

        with self.connection() as conn:
            conn.execute(
                """INSERT INTO streams (id, session_id, name, instructions, status, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (stream_id, session_id, name, instructions, 'active', now, now)
            )

        return {
            'id': stream_id,
            'session_id': session_id,
            'name': name,
            'instructions': instructions,
            'status': 'active',
            'created_at': now,
            'updated_at': now
        }

    def get_stream(self, stream_id: str) -> Optional[dict]:
        with self.connection() as conn:
            cursor = conn.execute("SELECT * FROM streams WHERE id = ?", (stream_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

    def get_stream_by_name(self, name: str) -> Optional[dict]:
        with self.connection() as conn:
            cursor = conn.execute("SELECT * FROM streams WHERE name = ?", (name,))
            row = cursor.fetchone()
            return dict(row) if row else None

    def list_streams(self, session_id: str = None, status: str = None) -> List[dict]:
        with self.connection() as conn:
            query = "SELECT * FROM streams WHERE 1=1"
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

    def end_stream(self, stream_id: str) -> bool:
        now = now_iso()
        with self.connection() as conn:
            cursor = conn.execute(
                "UPDATE streams SET status = 'ended', updated_at = ? WHERE id = ?",
                (now, stream_id)
            )
            return cursor.rowcount > 0

    # === Task CRUD ===
    def create_task(
        self, stream_id: str, tool_name: str, task_class: str, payload: str, timeout: int,
        prompt_path: str = None, metadata: str = None
    ) -> dict:
        task_id = gen_task_id()
        now = now_iso()

        with self.connection() as conn:
            conn.execute(
                """INSERT INTO tasks (id, stream_id, tool_name, task_class, payload, status, timeout, attempts, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (task_id, stream_id, tool_name, task_class, payload, 'queued', timeout, 0, now, now)
            )

        return {
            'id': task_id,
            'stream_id': stream_id,
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
            'created_at': now,
            'updated_at': now,
            'started_at': None,
            'finished_at': None
        }

    def get_task(self, task_id: str) -> Optional[dict]:
        with self.connection() as conn:
            cursor = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

    def list_tasks(self, stream_id: str = None, status: str = None, limit: int = None) -> List[dict]:
        with self.connection() as conn:
            query = "SELECT * FROM tasks WHERE 1=1"
            params = []

            if stream_id:
                query += " AND stream_id = ?"
                params.append(stream_id)

            if status:
                query += " AND status = ?"
                params.append(status)

            query += " ORDER BY created_at DESC"

            if limit:
                query += " LIMIT ?"
                params.append(limit)

            cursor = conn.execute(query, params)
            return [dict(row) for row in cursor.fetchall()]

    def get_oldest_queued_task(self, stream_id: str) -> Optional[dict]:
        """Get oldest queued task for a stream (FIFO ordering)"""
        with self.connection() as conn:
            cursor = conn.execute(
                "SELECT * FROM tasks WHERE stream_id = ? AND status = 'queued' ORDER BY created_at ASC LIMIT 1",
                (stream_id,)
            )
            row = cursor.fetchone()
            return dict(row) if row else None

    def claim_task(self, task_id: str) -> dict:
        """Claim a task by setting status to 'running' and started_at timestamp"""
        now = now_iso()
        with self.connection() as conn:
            # Update status to running
            cursor = conn.execute(
                """UPDATE tasks SET status = 'running', started_at = ?, updated_at = ?, attempts = attempts + 1
                   WHERE id = ?""",
                (now, now, task_id)
            )

            if cursor.rowcount == 0:
                raise ValueError(f"Task {task_id} not found")

            # Fetch and return the updated task
            cursor = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

    def complete_task(self, task_id: str, result_summary: str, result_data: str = None,
                     stdout: str = None, stderr: str = None) -> dict:
        """Mark task as succeeded with result data"""
        now = now_iso()
        with self.connection() as conn:
            cursor = conn.execute(
                """UPDATE tasks SET status = 'succeeded', result = ?, stdout = ?, stderr = ?,
                   finished_at = ?, updated_at = ? WHERE id = ?""",
                (result_data or result_summary, stdout, stderr, now, now, task_id)
            )

            if cursor.rowcount == 0:
                raise ValueError(f"Task {task_id} not found")

            # Fetch and return the updated task
            cursor = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

    def fail_task(self, task_id: str, error_message: str, error_type: str = None,
                  stdout: str = None, stderr: str = None) -> dict:
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
                raise ValueError(f"Task {task_id} not found")

            # Fetch and return the updated task
            cursor = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

    def requeue_task(self, task_id: str) -> dict:
        """Reset a failed task to queued status (clone as new task with new ID)"""
        # Get the original task
        original_task = self.get_task(task_id)
        if not original_task:
            raise ValueError(f"Task {task_id} not found")

        # Create a new task with same parameters but fresh state
        new_task_id = gen_task_id()
        now = now_iso()

        with self.connection() as conn:
            conn.execute(
                """INSERT INTO tasks (id, stream_id, tool_name, task_class, payload, status, timeout, attempts, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (new_task_id, original_task['stream_id'], original_task['tool_name'],
                 original_task['task_class'], original_task['payload'], 'queued',
                 original_task['timeout'], 0, now, now)
            )

            # Fetch and return the new task
            cursor = conn.execute("SELECT * FROM tasks WHERE id = ?", (new_task_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

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
