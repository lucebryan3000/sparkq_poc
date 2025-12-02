"""SparkQ Pydantic Models"""

from enum import Enum
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel


class TaskStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class TaskClass(str, Enum):
    FAST_SCRIPT = "FAST_SCRIPT"
    MEDIUM_SCRIPT = "MEDIUM_SCRIPT"
    LLM_LITE = "LLM_LITE"
    LLM_HEAVY = "LLM_HEAVY"


class SessionStatus(str, Enum):
    ACTIVE = "active"
    ENDED = "ended"


class QueueStatus(str, Enum):
    ACTIVE = "active"
    ENDED = "ended"


class Project(BaseModel):
    id: str
    name: str
    repo_path: Optional[str] = None
    prd_path: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class Session(BaseModel):
    id: str
    project_id: str
    name: str
    description: Optional[str] = None
    status: SessionStatus = SessionStatus.ACTIVE
    started_at: datetime
    ended_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class Queue(BaseModel):
    id: str
    session_id: str
    name: str
    instructions: Optional[str] = None
    codex_session_id: Optional[str] = None  # Codex CLI session for context continuity
    default_agent_role_key: Optional[str] = None
    status: QueueStatus = QueueStatus.ACTIVE
    created_at: datetime
    updated_at: datetime


class Task(BaseModel):
    id: str
    queue_id: str
    tool_name: str
    task_class: TaskClass
    payload: str  # JSON string
    agent_role_key: Optional[str] = None
    status: TaskStatus = TaskStatus.QUEUED
    timeout: int
    attempts: int = 0
    result: Optional[str] = None  # JSON string
    error: Optional[str] = None
    stdout: Optional[str] = None
    stderr: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None


class TaskClassDefaults(BaseModel):
    """Default timeouts by task class"""
    FAST_SCRIPT: int = 120
    MEDIUM_SCRIPT: int = 600
    LLM_LITE: int = 480
    LLM_HEAVY: int = 1200
