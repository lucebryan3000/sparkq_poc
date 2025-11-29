"""SparkQ Pydantic Models"""

from enum import Enum
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field


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


class StreamStatus(str, Enum):
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


class Stream(BaseModel):
    id: str
    session_id: str
    name: str
    instructions: Optional[str] = None
    status: StreamStatus = StreamStatus.ACTIVE
    created_at: datetime
    updated_at: datetime


class Task(BaseModel):
    id: str
    stream_id: str
    tool_name: str
    task_class: TaskClass
    payload: str  # JSON string
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
    FAST_SCRIPT: int = 30
    MEDIUM_SCRIPT: int = 300
    LLM_LITE: int = 300
    LLM_HEAVY: int = 900
