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
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                started_at TEXT,
                finished_at TEXT
            )
            """
            )

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
    def create_queue(self, session_id: str, name: str, instructions: str = None) -> dict:
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

    def get_queue(self, queue_id: str) -> Optional[dict]:
        with self.connection() as conn:
            cursor = conn.execute("SELECT * FROM queues WHERE id = ?", (queue_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

    def get_queue_by_name(self, name: str) -> Optional[dict]:
        with self.connection() as conn:
            cursor = conn.execute("SELECT * FROM queues WHERE name = ?", (name,))
            row = cursor.fetchone()
            return dict(row) if row else None

    def list_queues(self, session_id: str = None, status: str = None) -> List[dict]:
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
    ) -> dict:
        task_id = gen_task_id()
        now = now_iso()

        with self.connection() as conn:
            conn.execute(
                """INSERT INTO tasks (id, queue_id, tool_name, task_class, payload, status, timeout, attempts, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (task_id, queue_id, tool_name, task_class, payload, 'queued', timeout, 0, now, now)
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

    def list_tasks(self, queue_id: str = None, status: str = None, limit: int = None) -> List[dict]:
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

            if limit:
                query += " LIMIT ?"
                params.append(limit)

            cursor = conn.execute(query, params)
            return [dict(row) for row in cursor.fetchall()]

    def get_oldest_queued_task(self, queue_id: str) -> Optional[dict]:
        """Get oldest queued task for a queue (FIFO ordering)"""
        with self.connection() as conn:
            cursor = conn.execute(
                "SELECT * FROM tasks WHERE queue_id = ? AND status = 'queued' ORDER BY created_at ASC LIMIT 1",
                (queue_id,)
            )
            row = cursor.fetchone()
            return dict(row) if row else None

    def claim_task(self, task_id: str) -> dict:
        """Claim a task by setting status to 'running' and started_at timestamp"""
        now = now_iso()
        # Set isolation level to None (autocommit OFF) to use explicit transactions
        conn = sqlite3.connect(self.db_path, timeout=10.0)
        conn.isolation_level = None  # autocommit OFF for explicit transactions
        conn.row_factory = sqlite3.Row
        try:
            # Use EXCLUSIVE transaction to serialize all concurrent claims
            conn.execute("BEGIN EXCLUSIVE")

            # Update status to running (only if currently queued)
            cursor = conn.execute(
                """UPDATE tasks SET status = 'running', started_at = ?, updated_at = ?, attempts = attempts + 1
                   WHERE id = ? AND status = 'queued'""",
                (now, now, task_id)
            )

            if cursor.rowcount == 0:
                conn.execute("ROLLBACK")
                raise ValueError(f"Task {task_id} not found or already claimed")

            # Fetch and return the updated task
            cursor = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,))
            row = cursor.fetchone()
            conn.execute("COMMIT")
            return dict(row) if row else None
        except Exception:
            try:
                conn.execute("ROLLBACK")
            except Exception:
                pass
            raise
        finally:
            conn.close()

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
                """INSERT INTO tasks (id, queue_id, tool_name, task_class, payload, status, timeout, attempts, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (new_task_id, original_task['queue_id'], original_task['tool_name'],
                 original_task['task_class'], original_task['payload'], 'queued',
                 original_task['timeout'], 0, now, now)
            )

            # Fetch and return the new task
            cursor = conn.execute("SELECT * FROM tasks WHERE id = ?", (new_task_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

    def update_task(self, task_id: str, **updates) -> Optional[dict]:
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

        Returns timeout in seconds, defaulting to 3600 on errors.
        """
        try:
            task = self.get_task(task_id)
            if not task:
                return 3600

            timeout_value = task.get("timeout")
            if timeout_value is not None:
                try:
                    timeout_int = int(timeout_value)
                except (TypeError, ValueError):
                    timeout_int = None

                if timeout_int is not None and timeout_int > 0:
                    return timeout_int

            registry = getattr(self, "registry", None)
            if registry:
                tool_name = task.get("tool_name")
                try:
                    registry_timeout = registry.get_timeout(tool_name) if tool_name else None
                except Exception:
                    registry_timeout = None

                if registry_timeout is not None and registry_timeout > 0:
                    return registry_timeout

            return 3600
        except Exception:
            return 3600

    def get_stale_tasks(self, timeout_multiplier: float = 1.0) -> List[dict]:
        """
        Return tasks that have exceeded their claimed timeout threshold.

        A task is stale if status is 'claimed', it has a claimed_at timestamp,
        and now > claimed_at + (timeout * timeout_multiplier).
        """
        stale_tasks: List[dict] = []

        try:
            now_ts = datetime.utcnow().timestamp()
            with self.connection() as conn:
                cursor = conn.execute(
                    "SELECT * FROM tasks WHERE status='claimed' AND claimed_at IS NOT NULL"
                )
                rows = cursor.fetchall()

            for row in rows:
                task = dict(row)
                claimed_at = task.get("claimed_at")
                if not claimed_at:
                    continue

                timeout_seconds = self.get_timeout_for_task(task["id"])

                try:
                    claimed_dt = datetime.fromisoformat(claimed_at.replace("Z", "+00:00"))
                    claimed_ts = claimed_dt.timestamp()
                except Exception:
                    # Skip tasks with invalid timestamps instead of crashing
                    continue

                deadline_ts = claimed_ts + (timeout_seconds * timeout_multiplier)
                if now_ts > deadline_ts:
                    stale_tasks.append(task)

            return stale_tasks
        except Exception:
            return []

    def mark_stale_warning(self, task_id: str) -> dict:
        """
        Mark a task with a stale warning timestamp.
        """
        try:
            task = self.get_task(task_id)
            if not task:
                return {}

            now = now_iso()
            with self.connection() as conn:
                conn.execute(
                    "UPDATE tasks SET stale_warned_at = ? WHERE id = ?",
                    (now, task_id),
                )
                cursor = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,))
                row = cursor.fetchone()

            updated_task = dict(row) if row else task
            updated_task["stale_warned_at"] = updated_task.get("stale_warned_at") or now

            print(f"Marked task {task_id} with stale warning")
            return updated_task
        except Exception:
            return {}

    def auto_fail_stale_tasks(self, timeout_multiplier: float = 2.0) -> List[dict]:
        """
        Auto-fail tasks that are stale using the provided timeout multiplier.
        """
        auto_failed: List[dict] = []

        try:
            stale_tasks = self.get_stale_tasks(timeout_multiplier=timeout_multiplier)
            for task in stale_tasks:
                try:
                    failed_task = self.fail_task(
                        task["id"],
                        "Task timeout (auto-failed)",
                        error_type="TIMEOUT",
                    )
                    auto_failed.append(failed_task)
                except Exception:
                    # Continue processing other tasks even if one fails
                    continue

            print(f"Auto-failed {len(auto_failed)} stale tasks")
            return auto_failed
        except Exception:
            return []

    # === Prompt CRUD ===
    def create_prompt(
        self, command: str, label: str, template_text: str, description: str = None
    ) -> dict:
        import re

        if not re.match(r"^[a-z0-9][a-z0-9-]*$", command):
            raise ValueError("Command must match pattern ^[a-z0-9][a-z0-9-]*$")

        with self.connection() as conn:
            cursor = conn.execute(
                "SELECT 1 FROM prompts WHERE command = ?",
                (command,),
            )
            if cursor.fetchone():
                raise ValueError(f"Prompt command '{command}' already exists")

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
            raise ValueError(f"Prompt {prompt_id} not found")

        updates = []
        params = []

        with self.connection() as conn:
            if command is not None:
                if not re.match(r"^[a-z0-9][a-z0-9-]*$", command):
                    raise ValueError("Command must match pattern ^[a-z0-9][a-z0-9-]*$")

                cursor = conn.execute(
                    "SELECT 1 FROM prompts WHERE command = ? AND id != ?",
                    (command, prompt_id),
                )
                if cursor.fetchone():
                    raise ValueError(f"Prompt command '{command}' already exists")

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
                raise ValueError(f"Prompt {prompt_id} not found")
