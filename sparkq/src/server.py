"""SparkQ server wrapper with lockfile coordination and startup tasks."""

import atexit
import logging
import os
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Optional

import uvicorn

from .storage import Storage

LOCKFILE_PATH = Path("sparkq.lock")
HOST = "0.0.0.0"
PORT = 8420

_lockfile_lock = threading.Lock()
logger = logging.getLogger(__name__)


def get_pid_from_lockfile() -> Optional[int]:
    """Read and return PID stored in lockfile."""
    with _lockfile_lock:
        if not LOCKFILE_PATH.exists():
            return None

        try:
            pid_text = LOCKFILE_PATH.read_text().strip()
        except OSError as exc:
            logger.warning("Failed to read lockfile: %s", exc)
            return None

    if not pid_text:
        return None

    try:
        return int(pid_text)
    except ValueError:
        logger.warning("Invalid PID content in lockfile.")
        return None


def is_process_running(pid: int) -> bool:
    """Return True if a process with the PID exists."""
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def create_lockfile():
    """Write current PID to lockfile in a thread-safe manner."""
    pid = os.getpid()
    with _lockfile_lock:
        LOCKFILE_PATH.write_text(str(pid))


def remove_lockfile():
    """Delete lockfile if present."""
    with _lockfile_lock:
        try:
            LOCKFILE_PATH.unlink()
        except FileNotFoundError:
            return
        except OSError as exc:
            logger.warning("Failed to remove lockfile: %s", exc)


def check_server_running() -> Optional[int]:
    """Return PID if server lockfile points to a running process, else clean up stale lock."""
    pid = get_pid_from_lockfile()
    if pid is None:
        return None

    if is_process_running(pid):
        return pid

    remove_lockfile()
    return None


def start_auto_purge(storage: Storage, older_than_days: int = 3):
    """Start background purge of completed tasks."""

    def _purge():
        try:
            deleted = storage.purge_old_tasks(older_than_days=older_than_days)
            logger.info(
                "Auto-purge removed %s tasks older than %s days", deleted, older_than_days
            )
        except Exception as exc:  # noqa: BLE001 - background thread should log all failures
            logger.exception("Auto-purge failed: %s", exc)

    thread = threading.Thread(target=_purge, name="sparkq-auto-purge", daemon=True)
    thread.start()
    return thread


def start_auto_fail(storage, check_interval=30):
    """
    Background daemon thread that auto-fails stale tasks at 2x timeout.

    Args:
        storage: Storage instance
        check_interval: Seconds between checks (default 30)
    """

    import threading
    import time

    def auto_fail_loop():
        while True:
            try:
                # Run auto-fail check
                failed_tasks = storage.auto_fail_stale_tasks(timeout_multiplier=2.0)

                # Log results
                if failed_tasks:
                    log_msg = f"Auto-fail: {len(failed_tasks)} tasks auto-failed due to timeout"
                    print(f"[AUTO-FAIL] {log_msg}")
                    # Also log to server logs if available

                # Sleep until next check
                time.sleep(check_interval)

            except Exception as e:
                # Log error but don't crash
                print(f"[AUTO-FAIL ERROR] {str(e)}")
                time.sleep(check_interval)

    # Start daemon thread
    thread = threading.Thread(target=auto_fail_loop, daemon=True, name="auto-fail")
    thread.start()

    return thread


def run_server_background(port: int = PORT, host: str = HOST):
    """Start SparkQ server in background (daemonized)."""
    # Override any host/port arguments (SparkQ binds to fixed address)
    host = HOST
    port = PORT

    running_pid = check_server_running()
    if running_pid is not None:
        raise RuntimeError(
            f"Error: SparkQ server already running (PID {running_pid})\n"
            "Stop it first with: sparkq stop"
        )

    # Fork to background
    pid = os.fork()
    if pid > 0:
        # Parent process: wait for child to start and write lockfile
        max_wait = 5.0  # seconds
        elapsed = 0.0
        while elapsed < max_wait:
            time.sleep(0.1)
            elapsed += 0.1
            child_pid = check_server_running()
            if child_pid is not None:
                import typer
                typer.echo(f"SparkQ server started in background (PID {child_pid})")
                return

        raise RuntimeError("Failed to start server in background")

    # Child process continues below
    # Change to project root to ensure relative paths work
    from pathlib import Path
    project_root = Path(__file__).parent.parent.parent
    os.chdir(project_root)
    os.setsid()
    os.umask(0)

    # Redirect stdio to /dev/null
    sys.stdin = open("/dev/null", "r")
    sys.stdout = open("/dev/null", "w")
    sys.stderr = open("/dev/null", "w")

    # Continue with normal server startup
    create_lockfile()
    atexit.register(remove_lockfile)

    def handle_signal(signum, frame):
        logger.info("Received signal %s; shutting down SparkQ server", signum)
        remove_lockfile()
        raise SystemExit(0)

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    storage = Storage("sparkq/data/sparkq.db")
    start_auto_purge(storage)
    start_auto_fail(storage, check_interval=30)

    from .api import app

    try:
        uvicorn.run(app, host=host, port=port, log_level="critical")
    finally:
        remove_lockfile()


def run_server(port: int = PORT, host: str = HOST, background: bool = False):
    """Start SparkQ server with lockfile coordination and signal cleanup.

    Args:
        port: Server port (default 8420)
        host: Bind host (default 0.0.0.0)
        background: If True, daemonize and return immediately; if False, run in foreground
    """
    if background:
        return run_server_background(port=port, host=host)

    if host != HOST or port != PORT:
        logger.warning(
            "SparkQ server binds to %s:%s; overriding requested %s:%s",
            HOST,
            PORT,
            host,
            port,
        )
        host = HOST
        port = PORT

    running_pid = check_server_running()
    if running_pid is not None:
        message = (
            f"Error: SparkQ server already running (PID {running_pid})\n"
            "Stop it first with: sparkq stop"
        )
        raise RuntimeError(message)

    create_lockfile()
    atexit.register(remove_lockfile)

    def handle_signal(signum, frame):
        logger.info("Received signal %s; shutting down SparkQ server", signum)
        remove_lockfile()
        raise SystemExit(0)

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    storage = Storage("sparkq/data/sparkq.db")
    start_auto_purge(storage)
    start_auto_fail(storage, check_interval=30)

    from .api import app

    try:
        uvicorn.run(app, host=host, port=port)
    finally:
        remove_lockfile()
