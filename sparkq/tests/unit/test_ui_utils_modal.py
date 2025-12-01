import importlib.util
import types
from pathlib import Path

import pytest


@pytest.fixture(scope="module")
def ui_utils():
    # Lightweight loader for the JS utility to assert it exports showPrompt
    utils_path = Path(__file__).resolve().parent.parent.parent / "ui" / "utils" / "ui-utils.js"
    assert utils_path.exists(), "ui-utils.js not found"
    # We don't execute JS here; just ensure file is present and has expected marker text
    text = utils_path.read_text()
    return {"path": utils_path, "text": text}


def test_show_prompt_exported(ui_utils):
    # Basic smoke check: the helper should expose showPrompt in the Utils namespace
    assert "showPrompt" in ui_utils["text"], "showPrompt helper not found in ui-utils.js"


def test_modal_styles_present(ui_utils):
    # Ensure modal CSS markers exist (guards accidental removal)
    assert "modal-content" in ui_utils["text"]
    assert "modal-overlay" in ui_utils["text"]
