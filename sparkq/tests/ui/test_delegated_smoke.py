import pytest
from fastapi.testclient import TestClient

from src.storage import Storage


@pytest.fixture
def ui_client(tmp_path, monkeypatch):
  """
  Minimal FastAPI TestClient for UI smoke checks.
  """
  db_path = tmp_path / "ui_smoke.db"
  monkeypatch.setenv("SPARKQ_DB", str(db_path))

  storage = Storage(str(db_path))
  storage.init_db()
  storage.create_project(name="ui-smoke", repo_path=str(tmp_path), prd_path=None)

  from src import api
  api.storage = storage

  yield TestClient(api.app)


@pytest.mark.e2e
def test_delegated_actions_present(ui_client):
  """
  Lightweight smoke: ensure core delegated actions render on key pages.
  """
  # Load dashboard
  resp = ui_client.get("/ui/")
  assert resp.status_code == 200
  html = resp.text
  # Basic presence checks
  assert ("data-action=\"nav-dashboard\"" in html) or ("data-action='nav-dashboard'" in html)
  assert ("data-action=\"nav-settings\"" in html) or ("data-action='nav-settings'" in html)
