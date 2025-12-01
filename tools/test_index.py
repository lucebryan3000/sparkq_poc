"""
Test indexer for SparkQ.

Scans public surfaces (API routes, CLI commands, Storage methods, UI pages)
and reports whether matching tests exist in the expected locations.
"""

from __future__ import annotations

import argparse
import ast
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Set, Tuple

REPO_ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = REPO_ROOT / "sparkq" / "src"
TESTS_DIR = REPO_ROOT / "sparkq" / "tests"
UI_PAGES_DIR = REPO_ROOT / "sparkq" / "ui" / "pages"


# === Data types ===

@dataclass(frozen=True)
class ApiRoute:
    verb: str
    path: str
    func: str

    @property
    def key(self) -> str:
        return f"{self.verb.upper()} {self.path}"


@dataclass(frozen=True)
class CliCommand:
    """CLI command path without the root binary name."""

    tokens: Tuple[str, ...]

    @property
    def key(self) -> str:
        return " ".join(self.tokens)

    @property
    def display(self) -> str:
        return f"sparkq {self.key}".strip()


@dataclass(frozen=True)
class StorageMethod:
    name: str


@dataclass(frozen=True)
class UiPage:
    name: str

    @property
    def slug(self) -> str:
        return self.name.lower()


@dataclass
class CoverageRecord:
    target: str
    covered_by: Optional[str] = None

    @property
    def is_missing(self) -> bool:
        return self.covered_by is None


# === Parsing helpers ===


def _read(path: Path) -> str:
    try:
        return path.read_text()
    except FileNotFoundError:
        return ""


def parse_api_routes(path: Path) -> List[ApiRoute]:
    verbs = {"get", "post", "put", "delete", "patch", "options", "head"}
    routes: List[ApiRoute] = []
    source = _read(path)
    if not source:
        return routes
    tree = ast.parse(source)
    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        for dec in node.decorator_list:
            if not (isinstance(dec, ast.Call) and isinstance(dec.func, ast.Attribute)):
                continue
            if dec.func.attr not in verbs:
                continue
            # Require @app.<verb>()
            if not (isinstance(dec.func.value, ast.Name) and dec.func.value.id == "app"):
                continue
            if not dec.args:
                continue
            arg0 = dec.args[0]
            if isinstance(arg0, ast.Constant) and isinstance(arg0.value, str):
                routes.append(ApiRoute(verb=dec.func.attr.upper(), path=arg0.value, func=node.name))
    return dedup_by_key(routes, key=lambda r: r.key)


def parse_typer_hierarchy(tree: ast.AST) -> Dict[str, List[str]]:
    """Map Typer variable names to their command prefixes."""
    prefixes: Dict[str, List[str]] = {"app": []}  # root app has no prefix for matching tests
    typer_vars: Set[str] = set()

    def is_typer_ctor(call: ast.Call) -> bool:
        if isinstance(call.func, ast.Attribute):
            return call.func.attr == "Typer"
        if isinstance(call.func, ast.Name):
            return call.func.id == "Typer"
        return False

    for node in ast.walk(tree):
        if isinstance(node, ast.Assign) and isinstance(node.value, ast.Call) and is_typer_ctor(node.value):
            for target in node.targets:
                if isinstance(target, ast.Name):
                    typer_vars.add(target.id)

    for node in ast.walk(tree):
        if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)):
            continue
        if node.func.attr != "add_typer":
            continue
        parent = node.func.value
        if not isinstance(parent, ast.Name):
            continue
        parent_prefix = prefixes.get(parent.id)
        if parent_prefix is None:
            continue
        if not node.args:
            continue
        sub_var = node.args[0]
        if not isinstance(sub_var, ast.Name):
            continue
        sub_name = None
        if len(node.args) > 1 and isinstance(node.args[1], ast.Constant) and isinstance(node.args[1].value, str):
            sub_name = node.args[1].value
        if sub_name is None:
            for kw in node.keywords:
                if kw.arg == "name" and isinstance(kw.value, ast.Constant) and isinstance(kw.value.value, str):
                    sub_name = kw.value.value
                    break
        if sub_name is None:
            guessed = sub_var.id
            sub_name = guessed[:-4] if guessed.endswith("_app") else guessed
        prefixes[sub_var.id] = parent_prefix + [sub_name]
    # Ensure discovered Typer vars have an entry even if not mounted (fallback to empty)
    for var in typer_vars:
        prefixes.setdefault(var, [])
    return prefixes


def parse_cli_commands(path: Path) -> List[CliCommand]:
    source = _read(path)
    if not source:
        return []
    tree = ast.parse(source)
    prefixes = parse_typer_hierarchy(tree)
    commands: List[CliCommand] = []
    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        for dec in node.decorator_list:
            if not (isinstance(dec, ast.Call) and isinstance(dec.func, ast.Attribute)):
                continue
            if dec.func.attr != "command":
                continue
            target = dec.func.value
            if not isinstance(target, ast.Name):
                continue
            cmd_name: Optional[str] = None
            if dec.args and isinstance(dec.args[0], ast.Constant) and isinstance(dec.args[0].value, str):
                cmd_name = dec.args[0].value
            if cmd_name is None:
                for kw in dec.keywords:
                    if kw.arg == "name" and isinstance(kw.value, ast.Constant) and isinstance(kw.value.value, str):
                        cmd_name = kw.value.value
                        break
            if cmd_name is None:
                cmd_name = node.name.replace("_", "-")
            prefix_tokens = prefixes.get(target.id, [])
            tokens = tuple(prefix_tokens + [cmd_name])
            commands.append(CliCommand(tokens=tokens))
    return dedup_by_key(commands, key=lambda c: c.key)


def parse_storage_methods(path: Path) -> List[StorageMethod]:
    methods: List[StorageMethod] = []
    source = _read(path)
    if not source:
        return methods
    tree = ast.parse(source)
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef) and node.name == "Storage":
            for item in node.body:
                if isinstance(item, ast.FunctionDef) and not item.name.startswith("_"):
                    methods.append(StorageMethod(name=item.name))
    return dedup_by_key(methods, key=lambda m: m.name)


def parse_ui_pages(pages_dir: Path) -> List[UiPage]:
    pages: Set[str] = set()
    for path in sorted(pages_dir.glob("*.js")):
        content = _read(path)
        for match in re.finditer(r"Pages\.([A-Za-z0-9_]+)\s*=", content):
            pages.add(match.group(1))
    return [UiPage(name=name) for name in sorted(pages)]


# === Coverage detection ===


def load_browser_matrix(pages: List[UiPage]) -> Set[str]:
    """
    Optionally load a page matrix helper to mark coverage.
    Expects an array of { name } objects exported from helpers/page_matrix.js.
    """
    matrix_path = TESTS_DIR / "browser" / "helpers" / "page_matrix.js"
    content = _read(matrix_path)
    found: Set[str] = set()
    if not content:
        return found
    for match in re.finditer(r"name:\s*['\"]([A-Za-z0-9_-]+)['\"]", content):
        found.add(match.group(1).lower())
    for page in pages:
        if page.slug in found:
            found.add(page.slug)
    return found


def cli_invocations_from_tests(path: Path) -> Set[str]:
    invocations: Set[str] = set()
    source = _read(path)
    if not source:
        return invocations
    tree = ast.parse(source)

    for node in ast.walk(tree):
        if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)):
            continue
        if node.func.attr != "invoke":
            continue
        if len(node.args) < 2:
            continue
        arg = node.args[1]
        tokens: List[str] = []
        if isinstance(arg, (ast.List, ast.Tuple)):
            for elt in arg.elts:
                if isinstance(elt, ast.Constant) and isinstance(elt.value, str):
                    tokens.append(elt.value)
        cmd_tokens: List[str] = []
        for tok in tokens:
            if tok.startswith("-") and cmd_tokens:
                break
            if tok.startswith("-") and not cmd_tokens:
                break
            if len(cmd_tokens) >= 2:
                break
            cmd_tokens.append(tok)
        if cmd_tokens:
            invocations.add(" ".join(cmd_tokens))
    return invocations


def coverage_for_api(routes: Iterable[ApiRoute], test_path: Path) -> List[CoverageRecord]:
    test_content = _read(test_path)
    records: List[CoverageRecord] = []
    for route in routes:
        covered = route.path in test_content
        records.append(CoverageRecord(target=route.key, covered_by=test_path.name if covered else None))
    return records


def coverage_for_cli(commands: Iterable[CliCommand], test_path: Path) -> List[CoverageRecord]:
    invocations = cli_invocations_from_tests(test_path)
    records: List[CoverageRecord] = []
    for cmd in commands:
        covered = cmd.key in invocations
        records.append(CoverageRecord(target=cmd.display, covered_by=test_path.name if covered else None))
    return records


def coverage_for_storage(methods: Iterable[StorageMethod], test_path: Path) -> List[CoverageRecord]:
    test_content = _read(test_path)
    records: List[CoverageRecord] = []
    for method in methods:
        covered = method.name in test_content
        records.append(CoverageRecord(target=f"Storage.{method.name}", covered_by=test_path.name if covered else None))
    return records


def coverage_for_ui(pages: Iterable[UiPage], tests_dir: Path) -> List[CoverageRecord]:
    records: List[CoverageRecord] = []
    matrix_entries = load_browser_matrix(list(pages))
    browser_tests = list((tests_dir / "browser").glob("**/*.test.js"))

    for page in pages:
        expected_file = f"test_{page.slug}_page.test.js"
        covered_by: Optional[str] = None
        # Matrix-driven coverage
        if page.slug in matrix_entries:
            covered_by = "page_matrix"
        # File-based coverage
        if covered_by is None:
            for test_file in browser_tests:
                if test_file.name.lower() == expected_file:
                    covered_by = test_file.name
                    break
                if page.name in _read(test_file):
                    covered_by = test_file.name
                    break
        records.append(CoverageRecord(target=f"{page.name} page", covered_by=covered_by))
    return records


# === Reporting ===


def dedup_by_key(items, key):
    seen = set()
    result = []
    for item in items:
        k = key(item)
        if k in seen:
            continue
        seen.add(k)
        result.append(item)
    return result


def report_to_text(section: str, records: List[CoverageRecord]) -> str:
    lines = [f"[{section}]"]
    for rec in sorted(records, key=lambda r: r.target):
        status = rec.covered_by or "MISSING"
        lines.append(f"  {rec.target:30} -> {status}")
    return "\n".join(lines)


def build_report() -> Dict[str, List[CoverageRecord]]:
    api_routes = parse_api_routes(SRC_DIR / "api.py")
    cli_commands = parse_cli_commands(SRC_DIR / "cli.py")
    storage_methods = parse_storage_methods(SRC_DIR / "storage.py")
    ui_pages = parse_ui_pages(UI_PAGES_DIR)

    report = {
        "API": coverage_for_api(api_routes, TESTS_DIR / "integration" / "test_api_validation.py"),
        "CLI": coverage_for_cli(cli_commands, TESTS_DIR / "integration" / "test_cli.py"),
        "Storage": coverage_for_storage(storage_methods, TESTS_DIR / "unit" / "test_storage.py"),
        "UI": coverage_for_ui(ui_pages, TESTS_DIR),
    }
    return report


def any_missing(report: Dict[str, List[CoverageRecord]]) -> bool:
    return any(rec.is_missing for records in report.values() for rec in records)


def to_json(report: Dict[str, List[CoverageRecord]]) -> Dict[str, List[Dict[str, str]]]:
    return {
        section: [
            {"target": rec.target, "status": rec.covered_by or "MISSING", "covered_by": rec.covered_by}
            for rec in records
        ]
        for section, records in report.items()
    }


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Index SparkQ surfaces and verify test coverage.")
    parser.add_argument("--json", action="store_true", help="Output JSON instead of text")
    parser.add_argument("--fail-on-missing", action="store_true", help="Exit with non-zero status if gaps exist")
    args = parser.parse_args(argv)

    report = build_report()

    if args.json:
        print(json.dumps(to_json(report), indent=2))
    else:
        sections = [report_to_text(section, records) for section, records in report.items()]
        print("\n\n".join(sections))

    if args.fail_on_missing and any_missing(report):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
