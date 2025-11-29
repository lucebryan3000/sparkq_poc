import sys
from datetime import datetime
from pathlib import Path

import pytest

# Ensure the repository root is on sys.path for imports when running tests directly
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.storage import Storage

# Test logs directory
TEST_LOGS_DIR = Path(__file__).resolve().parent / "logs"


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


@pytest.fixture
def task(storage, stream):
    return storage.create_task(
        stream_id=stream["id"],
        tool_name="unit-test-tool",
        task_class="unit-test-class",
        payload='{"test": true}',
        timeout=300,
    )


def cleanup_old_test_logs(keep_last: int = 3):
    """Remove old test log directories, keeping only the last N runs."""
    if not TEST_LOGS_DIR.exists():
        return

    log_dirs = sorted(
        [d for d in TEST_LOGS_DIR.iterdir() if d.is_dir()],
        key=lambda x: x.stat().st_mtime,
        reverse=True,
    )

    for old_dir in log_dirs[keep_last:]:
        for file in old_dir.iterdir():
            file.unlink()
        old_dir.rmdir()


@pytest.fixture(scope="session", autouse=True)
def setup_test_logging(request):
    """Setup test logging directory and cleanup old logs."""
    TEST_LOGS_DIR.mkdir(exist_ok=True)
    cleanup_old_test_logs(keep_last=3)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_dir = TEST_LOGS_DIR / timestamp
    log_dir.mkdir(exist_ok=True)

    log_file = log_dir / "pytest.log"
    request.config.option.log_file = str(log_file)
    request.config.option.log_file_level = "INFO"

    yield log_dir
