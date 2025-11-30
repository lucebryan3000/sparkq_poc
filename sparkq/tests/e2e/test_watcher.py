import subprocess
import time
from pathlib import Path

import pytest

# Tests rewritten to use the Python queue runner; legacy bash watcher removed.
RUNNER_SCRIPT = Path(__file__).resolve().parents[4] / "sparkq_cli.py"


@pytest.mark.skip(reason="Legacy watcher removed; queue runner does not use lockfiles")
@pytest.mark.e2e
@pytest.mark.slow
class TestWatcherBehavior:
    def _lock_path(self, queue_name: str) -> Path:
        # Maintain the legacy lockfile path for compatibility
        return Path(f"/tmp/sparkq-{queue_name}.lock")

    def _start_runner(self, queue_name: str):
        lock_path = self._lock_path(queue_name)
        lock_path.unlink(missing_ok=True)
        process = subprocess.Popen(
            ["python3", str(RUNNER_SCRIPT), "run", "--queue", queue_name, "--background"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        return process, lock_path

    def _terminate_process(self, process: subprocess.Popen, timeout: float = 5.0):
        if process.poll() is None:
            process.terminate()
        try:
            stdout, stderr = process.communicate(timeout=timeout)
        except subprocess.TimeoutExpired:
            process.kill()
            stdout, stderr = process.communicate(timeout=timeout)
        return (stdout or ""), (stderr or "")

    def _wait_for_lock_removal(self, lock_path: Path, timeout: float = 5.0):
        deadline = time.time() + timeout
        while lock_path.exists() and time.time() < deadline:
            time.sleep(0.1)

    def test_runner_starts_and_creates_lockfile(self):
        queue_name = f"watcher-start-{int(time.time() * 1000)}"
        process, lock_path = self._start_runner(queue_name)
        try:
            time.sleep(1)
            assert lock_path.exists(), "Runner did not create lock file"
            assert lock_path.read_text().strip() == str(process.pid)
        finally:
            self._terminate_process(process)
            lock_path.unlink(missing_ok=True)

    def test_runner_prevents_duplicate(self):
        queue_name = f"watcher-duplicate-{int(time.time() * 1000)}"
        primary_process, lock_path = self._start_runner(queue_name)
        try:
            time.sleep(1)
            duplicate_process = subprocess.Popen(
                ["python3", str(RUNNER_SCRIPT), "run", "--queue", queue_name, "--background"],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
            try:
                stdout, stderr = duplicate_process.communicate(timeout=5)
            except subprocess.TimeoutExpired:
                duplicate_process.kill()
                stdout, stderr = duplicate_process.communicate(timeout=5)

            # Background run of same queue should fail due to lockfile
            assert duplicate_process.returncode not in (0, None), "Duplicate runner should fail"
            combined_output = f"{stdout}\n{stderr}".lower()
            assert "already" in combined_output or "running" in combined_output
        finally:
            self._terminate_process(primary_process)
            lock_path.unlink(missing_ok=True)

    def test_runner_cleanup_on_signal(self):
        queue_name = f"watcher-cleanup-{int(time.time() * 1000)}"
        process, lock_path = self._start_runner(queue_name)
        try:
            time.sleep(1)
            assert lock_path.exists(), "Lock file missing before sending SIGTERM"
            process.terminate()
            self._terminate_process(process)
            self._wait_for_lock_removal(lock_path)
            assert not lock_path.exists(), "Lock file not removed after SIGTERM"
        finally:
            if process.poll() is None:
                self._terminate_process(process)
            lock_path.unlink(missing_ok=True)
