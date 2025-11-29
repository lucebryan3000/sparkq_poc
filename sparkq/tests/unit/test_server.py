"""Unit tests for server.py lockfile and utility functions"""

import os
import tempfile
from pathlib import Path
from unittest import mock

import pytest

from src.server import (
    create_lockfile,
    get_pid_from_lockfile,
    is_process_running,
    remove_lockfile,
    check_server_running,
    LOCKFILE_PATH,
)


@pytest.fixture
def temp_lockfile(tmp_path, monkeypatch):
    """Use a temporary lockfile for testing"""
    lockfile = tmp_path / "test.lock"
    monkeypatch.setattr("src.server.LOCKFILE_PATH", lockfile)
    yield lockfile
    if lockfile.exists():
        lockfile.unlink()


class TestLockfileOperations:
    """Test lockfile creation, reading, and removal"""

    def test_create_lockfile_writes_current_pid(self, temp_lockfile, monkeypatch):
        monkeypatch.setattr("src.server.LOCKFILE_PATH", temp_lockfile)
        create_lockfile()

        assert temp_lockfile.exists()
        content = temp_lockfile.read_text().strip()
        assert content == str(os.getpid())

    def test_get_pid_from_lockfile_returns_pid(self, temp_lockfile, monkeypatch):
        monkeypatch.setattr("src.server.LOCKFILE_PATH", temp_lockfile)
        test_pid = 12345
        temp_lockfile.write_text(str(test_pid))

        pid = get_pid_from_lockfile()
        assert pid == test_pid

    def test_get_pid_from_lockfile_returns_none_when_missing(self, temp_lockfile, monkeypatch):
        monkeypatch.setattr("src.server.LOCKFILE_PATH", temp_lockfile)
        pid = get_pid_from_lockfile()
        assert pid is None

    def test_get_pid_from_lockfile_returns_none_for_empty_file(self, temp_lockfile, monkeypatch):
        monkeypatch.setattr("src.server.LOCKFILE_PATH", temp_lockfile)
        temp_lockfile.write_text("")

        pid = get_pid_from_lockfile()
        assert pid is None

    def test_get_pid_from_lockfile_returns_none_for_invalid_content(self, temp_lockfile, monkeypatch):
        monkeypatch.setattr("src.server.LOCKFILE_PATH", temp_lockfile)
        temp_lockfile.write_text("not-a-number")

        pid = get_pid_from_lockfile()
        assert pid is None

    def test_remove_lockfile_deletes_file(self, temp_lockfile, monkeypatch):
        monkeypatch.setattr("src.server.LOCKFILE_PATH", temp_lockfile)
        temp_lockfile.write_text("12345")

        remove_lockfile()
        assert not temp_lockfile.exists()

    def test_remove_lockfile_handles_missing_file(self, temp_lockfile, monkeypatch):
        monkeypatch.setattr("src.server.LOCKFILE_PATH", temp_lockfile)
        remove_lockfile()
        assert not temp_lockfile.exists()


class TestProcessChecking:
    """Test process running checks"""

    def test_is_process_running_returns_true_for_current_process(self):
        current_pid = os.getpid()
        assert is_process_running(current_pid) is True

    def test_is_process_running_returns_false_for_nonexistent_pid(self):
        assert is_process_running(999999) is False

    def test_check_server_running_returns_none_without_lockfile(self, temp_lockfile, monkeypatch):
        monkeypatch.setattr("src.server.LOCKFILE_PATH", temp_lockfile)
        pid = check_server_running()
        assert pid is None

    def test_check_server_running_returns_pid_for_running_process(self, temp_lockfile, monkeypatch):
        monkeypatch.setattr("src.server.LOCKFILE_PATH", temp_lockfile)
        current_pid = os.getpid()
        temp_lockfile.write_text(str(current_pid))

        pid = check_server_running()
        assert pid == current_pid

    def test_check_server_running_cleans_stale_lockfile(self, temp_lockfile, monkeypatch):
        monkeypatch.setattr("src.server.LOCKFILE_PATH", temp_lockfile)
        temp_lockfile.write_text("999999")

        pid = check_server_running()
        assert pid is None
        assert not temp_lockfile.exists()
