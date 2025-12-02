import sys
import importlib.util
from pathlib import Path

import pytest

# Ensure repository root is importable to reach tools/
REPO_ROOT = Path(__file__).resolve().parents[3]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

TEST_INDEX_PATH = REPO_ROOT / "tools" / "test_index.py"
spec = importlib.util.spec_from_file_location("sparkqueue_tools_test_index", TEST_INDEX_PATH)
if spec is None or spec.loader is None:
    raise ImportError(f"Unable to load test_index from {TEST_INDEX_PATH}")
test_index = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = test_index
spec.loader.exec_module(test_index)


def test_parse_api_routes(tmp_path):
    api_file = tmp_path / "api.py"
    api_file.write_text(
        """
from fastapi import FastAPI
app = FastAPI()

@app.get("/foo")
def foo():
    return {}

@app.post("/bar/{item_id}")
async def bar(item_id: str):
    return {"id": item_id}
"""
    )

    routes = test_index.parse_api_routes(api_file)
    keys = sorted(route.key for route in routes)

    assert "GET /foo" in keys
    assert "POST /bar/{item_id}" in keys


def test_parse_cli_commands_with_sub_typer(tmp_path):
    cli_file = tmp_path / "cli.py"
    cli_file.write_text(
        """
import typer

app = typer.Typer()
sub = typer.Typer()
app.add_typer(sub, name="sub")

@app.command()
def setup():
    return None

@sub.command("do")
def do_stuff():
    return None
"""
    )

    commands = test_index.parse_cli_commands(cli_file)
    keys = sorted(cmd.key for cmd in commands)

    assert "setup" in keys
    assert "sub do" in keys


def test_cli_invocations_from_tests_extracts_command_prefix(tmp_path):
    test_file = tmp_path / "test_cli.py"
    test_file.write_text(
        """
def test_invokes(cli_runner):
    cli_runner.invoke(app, ["sub", "do", "positional", "--flag"])
    cli_runner.invoke(app, ["setup", "--verbose"])
"""
    )

    invocations = test_index.cli_invocations_from_tests(test_file)

    assert "sub do" in invocations
    assert "setup" in invocations


def test_parse_ui_pages_reads_page_names(tmp_path):
    pages_dir = tmp_path / "pages"
    pages_dir.mkdir()
    (pages_dir / "foo.js").write_text(
        """
(function(Pages) {
  Pages.Foo = {};
})(window.Pages);
"""
    )

    pages = test_index.parse_ui_pages(pages_dir)
    names = [page.name for page in pages]

    assert names == ["Foo"]
