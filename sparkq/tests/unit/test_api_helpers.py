"""Unit tests for API helper functions"""

import pytest
from src.api import _format_error, _error_response, _serialize_task, storage


class TestErrorFormatting:
    """Test error message formatting"""

    def test_format_error_adds_prefix_to_plain_message(self):
        result = _format_error("Something went wrong")
        assert result == "Error: Something went wrong"

    def test_format_error_preserves_existing_prefix(self):
        result = _format_error("Error: Already prefixed")
        assert result == "Error: Already prefixed"

    def test_format_error_handles_none(self):
        result = _format_error(None)
        assert result == "Error: Internal server error"

    def test_format_error_handles_empty_string(self):
        result = _format_error("")
        assert result == "Error: Internal server error"


class TestErrorResponse:
    """Test error response generation"""

    def test_error_response_structure(self):
        response = _error_response("Test error", 400)
        assert response.status_code == 400

        body = response.body.decode()
        assert "error" in body
        assert "status" in body
        assert "Test error" in body

    def test_error_response_with_none_message(self):
        response = _error_response(None, 500)
        assert response.status_code == 500

        body = response.body.decode()
        assert "Internal server error" in body

    def test_error_response_formats_status_codes(self):
        for code in [400, 404, 500]:
            response = _error_response("Test", code)
            assert response.status_code == code
            body = response.body.decode()
            assert str(code) in body


class TestSerializeTask:
    def test_serialize_task_prefers_prefetched_queue_names(self, monkeypatch):
        # If queue_names is provided, storage lookup should be skipped.
        monkeypatch.setattr(storage, "get_queue", lambda queue_id: (_ for _ in ()).throw(AssertionError("get_queue called")))
        task = {"id": "tsk_1234", "queue_id": "que_1", "status": "queued"}

        serialized = _serialize_task(task, {"que_1": "Inbox"})

        assert serialized["friendly_id"] == "INBOX-1234"
        assert serialized["claimed_at"] is None
