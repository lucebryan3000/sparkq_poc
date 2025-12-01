import pytest
from fastapi.testclient import TestClient

from src.storage import Storage


@pytest.fixture
def dev_client(tmp_path, monkeypatch):
    """FastAPI test client scoped to a temp DB to avoid mutating real data."""
    db_path = tmp_path / "cache_test.db"
    storage = Storage(str(db_path))
    storage.init_db()

    from src import api
    from src import env as env_module

    env_module.reset_env_cache()
    monkeypatch.setenv("SPARKQ_ENV", "dev")
    api.APP_ENV = env_module.get_app_env()

    api.storage = storage
    return TestClient(api.app)


def test_static_files_send_no_cache_headers_in_dev(dev_client):
    response = dev_client.get("/ui/style.css")

    assert response.status_code == 200
    assert response.headers.get("Cache-Control") == "no-cache, no-store, must-revalidate, max-age=0"
    assert response.headers.get("Pragma") == "no-cache"
    assert response.headers.get("Expires") == "0"


def test_cache_buster_endpoint_exposes_env_and_cache_buster(dev_client):
    response = dev_client.get("/ui-cache-buster.js")

    assert response.status_code == 200
    assert "application/javascript" in response.headers.get("content-type", "")

    body = response.text
    assert 'window.__SPARKQ_ENV__ = "dev";' in body
    assert "window.__SPARKQ_CACHE_BUSTER__" in body
    assert "window.__SPARKQ_BUILD_ID__" in body

    # Dev endpoint should also enforce no-cache headers
    assert response.headers.get("Cache-Control") == "no-cache, no-store, must-revalidate, max-age=0"
    assert response.headers.get("Pragma") == "no-cache"
    assert response.headers.get("Expires") == "0"
