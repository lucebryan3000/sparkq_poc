"""SparkQ server wrapper with lockfile coordination and startup tasks."""

import atexit
import fcntl
import logging
import os
import signal
import sys
import threading
import time
from pathlib import Path
from typing import Optional

import uvicorn

from .config import (
    get_database_path,
    get_queue_runner_config,
    get_server_config,
    load_config,
)
from .constants import (
    DEFAULT_AUTO_FAIL_INTERVAL_SECONDS,
    DEFAULT_PURGE_OLDER_THAN_DAYS,
    STALE_FAIL_MULTIPLIER,
    STALE_WARNING_MULTIPLIER,
)
from .metrics import incr, observe
from .paths import get_lockfile_path, get_config_path
from .storage import Storage

LOCKFILE_PATH = get_lockfile_path()
HOST = "0.0.0.0"
PORT = 5005

_lockfile_lock = threading.Lock()
logger = logging.getLogger(__name__)


def get_pid_from_lockfile() -> Optional[int]:
    """Read and return PID stored in lockfile."""
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
    lock_bytes = str(pid).encode()
    with _lockfile_lock:
        try:
            fd = os.open(LOCKFILE_PATH, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        except FileExistsError as exc:
            raise RuntimeError("SparkQ server lockfile already exists; is another server running?") from exc

        with os.fdopen(fd, "wb") as handle:
            try:
                fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except OSError:
                raise RuntimeError("Failed to lock SparkQ server lockfile; another instance may be starting")
            handle.write(lock_bytes)


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
    with _lockfile_lock:
        pid = get_pid_from_lockfile()
        if pid is None:
            return None

        if is_process_running(pid):
            return pid

        # Stale lock: remove atomically while we hold the lock to avoid TOCTOU
        try:
            LOCKFILE_PATH.unlink()
        except FileNotFoundError:
            return None
        except OSError as exc:
            logger.warning("Failed to remove stale lockfile: %s", exc)
            return None

    return None


def start_auto_purge(storage: Storage, older_than_days: int = DEFAULT_PURGE_OLDER_THAN_DAYS):
    """Start background purge of completed tasks."""

    def _purge():
        try:
            start = time.time()
            deleted = storage.purge_old_tasks(older_than_days=older_than_days)
            duration = (time.time() - start) * 1000
            logger.info(
                "Auto-purge removed %s tasks older than %s days (%.1fms)",
                deleted,
                older_than_days,
                duration,
            )
            incr("sparkq.purge.runs", tags={"status": "ok"})
            observe("sparkq.purge.duration_ms", duration, tags={"status": "ok"})
            incr("sparkq.purge.deleted", deleted)
        except Exception as exc:  # noqa: BLE001 - background thread should log all failures
            logger.exception("Auto-purge failed: %s", exc)
            incr("sparkq.purge.runs", tags={"status": "error"})

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
                warned_tasks = storage.warn_stale_tasks(timeout_multiplier=STALE_WARNING_MULTIPLIER)
                if warned_tasks:
                    logger.info("[AUTO-FAIL] %s tasks approaching timeout", len(warned_tasks))

                # Run auto-fail check
                failed_tasks = storage.auto_fail_stale_tasks(timeout_multiplier=STALE_FAIL_MULTIPLIER)

                # Log results
                if failed_tasks:
                    log_msg = f"Auto-fail: {len(failed_tasks)} tasks auto-failed due to timeout"
                    logger.info("[AUTO-FAIL] %s", log_msg)

                # Sleep until next check
                time.sleep(check_interval)

            except Exception as e:
                # Log error but don't crash
                logger.exception("[AUTO-FAIL ERROR] %s", str(e))
                time.sleep(check_interval)

    # Start daemon thread
    thread = threading.Thread(target=auto_fail_loop, daemon=True, name="auto-fail")
    thread.start()

    return thread


def _resolve_runtime_settings(host_override: Optional[str], port_override: Optional[int]):
    """
    Resolve runtime settings from config with optional CLI overrides.
    """
    cfg = load_config(get_config_path())
    server_cfg = get_server_config(cfg)
    resolved_host = host_override if host_override is not None else server_cfg.get("host", HOST)
    resolved_port = port_override if port_override is not None else server_cfg.get("port", PORT)
    try:
        resolved_port = int(resolved_port)
    except Exception:
        resolved_port = PORT
    db_path = get_database_path(cfg)
    purge_cfg = cfg.get("purge", {}) or {}
    older_than_days = purge_cfg.get("older_than_days", DEFAULT_PURGE_OLDER_THAN_DAYS)
    if not isinstance(older_than_days, int) or older_than_days <= 0:
        older_than_days = DEFAULT_PURGE_OLDER_THAN_DAYS
    queue_runner_cfg = get_queue_runner_config(cfg)
    auto_fail_interval = queue_runner_cfg.get("auto_fail_interval_seconds", DEFAULT_AUTO_FAIL_INTERVAL_SECONDS)
    if not isinstance(auto_fail_interval, (int, float)) or auto_fail_interval <= 0:
        auto_fail_interval = DEFAULT_AUTO_FAIL_INTERVAL_SECONDS
    try:
        # Prefer DB-backed queue_runner config when available
        temp_storage = Storage(db_path)
        temp_storage.init_db()
        qr_db = temp_storage.export_config().get("queue_runner", {}).get("config", {})
        if isinstance(qr_db, dict):
            db_interval = qr_db.get("auto_fail_interval_seconds")
            if isinstance(db_interval, (int, float)) and db_interval > 0:
                auto_fail_interval = db_interval
    except Exception:
        logger.exception("Failed to read queue_runner config from DB; using file/default values")
    return resolved_host, resolved_port, db_path, older_than_days, auto_fail_interval


def run_server_background(port: Optional[int] = None, host: Optional[str] = None):
    """Start SparkQ server in background (daemonized)."""
    host, port, db_path, purge_days, auto_fail_interval = _resolve_runtime_settings(host, port)

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
    os.setsid()
    os.umask(0)

    # Redirect stdio to /dev/null
    sys.stdin = open("/dev/null", "r")
    sys.stdout = open("/dev/null", "w")
    sys.stderr = open("/dev/null", "w")

    # Continue with normal server startup
    create_lockfile()
    atexit.register(remove_lockfile)

    def handle_signal(signum, _frame):
        logger.info("Received signal %s; shutting down SparkQ server", signum)
        remove_lockfile()
        raise SystemExit(0)

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    storage = Storage(db_path)
    start_auto_purge(storage, older_than_days=purge_days)
    start_auto_fail(storage, check_interval=auto_fail_interval)

    from .api import app

    try:
        uvicorn.run(app, host=host, port=port, log_level="critical")
    finally:
        remove_lockfile()


def run_server(port: Optional[int] = None, host: Optional[str] = None, background: bool = False):
    """Start SparkQ server with lockfile coordination and signal cleanup.

    Args:
        port: Server port (falls back to config or 5005)
        host: Bind host (falls back to config or 0.0.0.0)
        background: If True, daemonize and return immediately; if False, run in foreground
    """
    if background:
        return run_server_background(port=port, host=host)

    host, port, db_path, purge_days, auto_fail_interval = _resolve_runtime_settings(host, port)

    running_pid = check_server_running()
    if running_pid is not None:
        message = (
            f"Error: SparkQ server already running (PID {running_pid})\n"
            "Stop it first with: sparkq stop"
        )
        raise RuntimeError(message)

    create_lockfile()
    atexit.register(remove_lockfile)

    def handle_signal(signum, _frame):
        logger.info("Received signal %s; shutting down SparkQ server", signum)
        remove_lockfile()
        raise SystemExit(0)

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    storage = Storage(db_path)
    start_auto_purge(storage, older_than_days=purge_days)
    start_auto_fail(storage, check_interval=auto_fail_interval)

    from .api import app

    try:
        uvicorn.run(app, host=host, port=port)
    finally:
        remove_lockfile()
