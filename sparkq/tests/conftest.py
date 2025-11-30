import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

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
def queue(storage, session):
    return storage.create_queue(
        session_id=session["id"],
        name="unit-test-queue",
        instructions="Stream used in storage unit tests",
    )


@pytest.fixture
def task(storage, queue):
    return storage.create_task(
        queue_id=queue["id"],
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


# Global variable to store log directory path
_current_log_dir = None


def pytest_configure(config):
    """Configure pytest at startup to set logging paths."""
    global _current_log_dir

    TEST_LOGS_DIR.mkdir(exist_ok=True)
    cleanup_old_test_logs(keep_last=3)

    timestamp = datetime.now(ZoneInfo("America/Chicago")).strftime("%m-%d-%Y_%I-%M%p")
    log_dir = TEST_LOGS_DIR / timestamp
    log_dir.mkdir(exist_ok=True)
    _current_log_dir = log_dir

    # Create 'latest' symlink
    latest_dir = TEST_LOGS_DIR / "latest"
    if latest_dir.exists() or latest_dir.is_symlink():
        if latest_dir.is_symlink():
            latest_dir.unlink()
        elif latest_dir.is_dir():
            for file in latest_dir.iterdir():
                file.unlink()
            latest_dir.rmdir()

    if not latest_dir.exists():
        latest_dir.symlink_to(timestamp, target_is_directory=True)

    # Set log file path
    log_file = log_dir / "pytest.log"
    config.option.log_file = str(log_file)
    config.option.log_file_level = "INFO"

    # Set junit XML path
    junit_file = log_dir / "junit_report.xml"
    config.option.xmlpath = str(junit_file)


def pytest_sessionfinish(session, exitstatus):
    """Save a human-readable test summary after session ends."""
    global _current_log_dir

    if _current_log_dir is None or not _current_log_dir.exists():
        return

    log_dir = _current_log_dir
    summary_file = log_dir / "test_summary.txt"

    # Get test statistics
    stats = session.testscollected
    passed = len([x for x in session.items if hasattr(x, 'rep_call') and x.rep_call.passed])

    with open(summary_file, "w") as f:
        f.write(f"Test Run Summary\n")
        f.write(f"{'='*80}\n")
        f.write(f"Timestamp: {datetime.now(ZoneInfo('America/Chicago')).strftime('%m-%d-%Y %I:%M:%S %p CST')}\n")
        f.write(f"Total Tests Collected: {stats}\n")
        f.write(f"Exit Status: {exitstatus}\n")
        f.write(f"{'='*80}\n\n")
        f.write(f"Exit codes:\n")
        f.write(f"  0 = All tests passed\n")
        f.write(f"  1 = Tests failed\n")
        f.write(f"  2 = Test execution interrupted\n")
        f.write(f"  3 = Internal error\n")
        f.write(f"  4 = Command line usage error\n")
        f.write(f"  5 = No tests collected\n\n")
        f.write(f"Detailed results available in:\n")
        f.write(f"  {log_dir / 'junit_report.xml'}\n")
        f.write(f"  {log_dir / 'pytest.log'}\n")
