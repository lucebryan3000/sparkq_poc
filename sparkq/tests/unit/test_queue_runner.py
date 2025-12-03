import types
from datetime import datetime
from pathlib import Path

import pytest

from sparkq import queue_runner
from sparkq.queue_runner import process_one


class MockResponse:
    def __init__(self, status_code=200, json_data=None):
        self.status_code = status_code
        self._json = json_data or {}

    def json(self):
        return self._json

    def raise_for_status(self):
        if 400 <= self.status_code:
            raise RuntimeError(f"HTTP {self.status_code}")


@pytest.fixture
def mock_requests(monkeypatch):
    """Mock requests.get/post to simulate API calls."""
    history = {"get": [], "post": []}

    def fake_get(url, *args, **kwargs):
        history["get"].append((url, kwargs))
        if url.endswith("/api/queues"):
            return MockResponse(json_data={"queues": []})
        if url.endswith("/api/tasks"):
            tasks = kwargs.get("params", {}).get("tasks_data", [])
            # Not used; we'll inject via closure below
        return MockResponse(json_data={})

    def fake_post(url, *args, **kwargs):
        history["post"].append((url, kwargs))
        # Claim endpoint returns task
        if "/claim" in url:
            task_id = url.split("/")[-2]
            return MockResponse(json_data={"task": {"id": task_id}})
        # Complete/fail endpoints
        return MockResponse(json_data={"task": {}})

    def fake_request(method, url, **kwargs):
        if method.upper() == "GET":
            return fake_get(url, **kwargs)
        return fake_post(url, **kwargs)

    monkeypatch.setattr("sparkq.queue_runner.requests.get", fake_get)
    monkeypatch.setattr("sparkq.queue_runner.requests.post", fake_post)
    monkeypatch.setattr("sparkq.queue_runner._http_request", fake_request)
    return history


def test_request_with_retry_recovers_on_5xx(monkeypatch):
    calls = []
    responses = [
        MockResponse(status_code=500),
        MockResponse(status_code=200, json_data={"ok": True}),
    ]

    def fake_request(method, url, **kwargs):
        calls.append((method, url, kwargs))
        return responses.pop(0)

    monkeypatch.setattr(queue_runner, "_http_request", fake_request)
    monkeypatch.setattr(queue_runner.time, "sleep", lambda *args, **kwargs: None)

    resp = queue_runner._request_with_retry(
        "GET",
        "http://localhost/api/test",
        retries=1,
        backoff_seconds=0,
        context={"case": "recover"},
    )

    assert resp.status_code == 200
    assert len(calls) == 2


def test_request_with_retry_allows_status(monkeypatch):
    calls = []

    def fake_request(method, url, **kwargs):
        calls.append((method, url, kwargs))
        return MockResponse(status_code=409, json_data={"status": "conflict"})

    monkeypatch.setattr(queue_runner, "_http_request", fake_request)
    monkeypatch.setattr(queue_runner.time, "sleep", lambda *args, **kwargs: None)

    resp = queue_runner._request_with_retry(
        "POST",
        "http://localhost/api/claim",
        retries=0,
        backoff_seconds=0,
        context={"case": "allowed_status"},
        allowed_statuses={409},
        raise_for_status=False,
    )

    assert resp.status_code == 409
    assert len(calls) == 1


def test_request_with_retry_raises_after_retries(monkeypatch):
    def fake_request(method, url, **kwargs):
        raise queue_runner.requests.RequestException("network down")

    monkeypatch.setattr(queue_runner, "_http_request", fake_request)
    monkeypatch.setattr(queue_runner.time, "sleep", lambda *args, **kwargs: None)

    with pytest.raises(queue_runner.requests.RequestException):
        queue_runner._request_with_retry(
            "GET",
            "http://localhost/api/test",
            retries=1,
            backoff_seconds=0,
            context={"case": "fail"},
        )


def test_process_one_picks_oldest_and_completes(monkeypatch, mock_requests):
    # Prepare two tasks, ensure oldest (created_at) is selected
    tasks = [
        {"id": "tsk_new", "status": "queued", "created_at": "2025-11-30T12:00:00Z", "payload": {"prompt": "newer"}},
        {"id": "tsk_old", "status": "queued", "created_at": "2025-11-30T10:00:00Z", "payload": {"prompt": "older"}},
    ]

    def fake_get(url, *args, **kwargs):
        mock_requests["get"].append((url, kwargs))
        if url.endswith("/api/tasks"):
            return MockResponse(json_data={"tasks": tasks})
        return MockResponse(json_data={"queues": []})

    def fake_post(url, *args, **kwargs):
        mock_requests["post"].append((url, kwargs))
        if "/claim" in url:
            task_id = url.split("/")[-2]
            return MockResponse(json_data={"task": {"id": task_id}})
        return MockResponse(json_data={"task": {}})

    monkeypatch.setattr("sparkq.queue_runner.requests.get", fake_get)
    monkeypatch.setattr("sparkq.queue_runner.requests.post", fake_post)
    monkeypatch.setattr("sparkq.queue_runner._http_request", lambda method, url, **kwargs: fake_get(url, **kwargs) if method.upper() == "GET" else fake_post(url, **kwargs))

    queue = {"id": "que_123", "name": "TestQ"}
    did_work = process_one("http://localhost:5005", queue, "worker-1", execute=False)

    assert did_work is True
    # First post after claim should be to complete the oldest task
    claim_calls = [u for u, _ in mock_requests["post"] if "/claim" in u]
    complete_calls = [u for u, _ in mock_requests["post"] if "/complete" in u]
    assert claim_calls[0].endswith("/tsk_old/claim")
    assert complete_calls[0].endswith("/tsk_old/complete")


def test_acquire_lock_uses_env_dir_and_blocks_duplicate(tmp_path, monkeypatch):
    monkeypatch.setenv("SPARKQ_RUNNER_LOCK_DIR", str(tmp_path))
    queue_runner.LOCK_FILE = None

    queue_runner.acquire_lock("que_abc")
    lock_path = Path(queue_runner.LOCK_FILE)

    assert lock_path.parent == tmp_path
    assert lock_path.exists()

    with pytest.raises(SystemExit):
        queue_runner.acquire_lock("que_abc")

    queue_runner.release_lock()
    assert not lock_path.exists()


def test_acquire_lock_cleans_stale_lock(tmp_path, monkeypatch):
    monkeypatch.setenv("SPARKQ_RUNNER_LOCK_DIR", str(tmp_path))
    queue_runner.LOCK_FILE = None

    stale_path = Path(tmp_path) / "sparkq-runner-que_stale.lock"
    stale_path.write_text("999999")

    def fake_kill(pid, sig):
        raise OSError("not running")

    monkeypatch.setattr(queue_runner.os, "kill", fake_kill)

    queue_runner.acquire_lock("que_stale")

    assert stale_path.exists()
    assert stale_path.read_text().strip() == str(queue_runner.os.getpid())

    queue_runner.release_lock()
    assert not stale_path.exists()


def test_get_lock_dir_prefers_config(monkeypatch, tmp_path):
    monkeypatch.delenv("SPARKQ_RUNNER_LOCK_DIR", raising=False)
    monkeypatch.setattr(queue_runner, "load_queue_runner_config", lambda: {"lock_dir": str(tmp_path)})
    queue_runner.LOCK_FILE = None

    queue_runner.acquire_lock("que_cfg")
    lock_path = Path(queue_runner.LOCK_FILE)

    assert lock_path.parent == tmp_path

    queue_runner.release_lock()
