import sys
from pathlib import Path

import pytest

# Ensure the repository root is on sys.path for imports when running tests directly
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.storage import Storage


@pytest.fixture
def temp_db_path(tmp_path):
    return tmp_path / "sparkq_test.db"


@pytest.fixture
def storage(temp_db_path):
    store = Storage(str(temp_db_path))
    store.init_db()
    yield store

    # Cleanup database artifacts created during tests
    for suffix in ("", "-wal", "-shm"):
        db_file = temp_db_path.with_name(temp_db_path.name + suffix)
        if db_file.exists():
            db_file.unlink()


@pytest.fixture
def project(storage):
    return storage.create_project(
        name="unit-test-project",
        repo_path="/tmp/repo",
        prd_path="/tmp/prd",
    )


@pytest.fixture
def session(storage, project):
    return storage.create_session(
        name="unit-test-session",
        description="Session for storage unit tests",
    )


@pytest.fixture
def stream(storage, session):
    return storage.create_stream(
        session_id=session["id"],
        name="unit-test-stream",
        instructions="Stream used in storage unit tests",
    )
