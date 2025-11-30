#!/usr/bin/env python3
"""
SparkQ CLI wrapper (Python version of sparkq.sh).

Usage:
  python sparkq_cli.py [command] [args...]

Convenience commands:
  start        -> run --background
  restart      -> stop; wait 5s; run --background
  run ...      -> pass through to sparkq CLI
  stop/status  -> pass through to sparkq CLI
  help         -> show underlying sparkq CLI help

Notes:
  - Prefers .venv/bin/python if present; falls back to current interpreter.
  - Mirrors the bash wrapper behavior without requiring a shell.
"""

from __future__ import annotations

import subprocess
import sys
import time
from pathlib import Path
from typing import List


PROJECT_ROOT = Path(__file__).resolve().parent
VENV_DIR = PROJECT_ROOT / ".venv"
VENV_PY = VENV_DIR / "bin" / "python"


def ensure_venv() -> Path:
    """
    Return the python executable to use. Prefer .venv/bin/python.
    Raise SystemExit with a helpful message if venv is missing.
    """
    if VENV_PY.exists():
        return VENV_PY
    if not VENV_DIR.exists():
        sys.stderr.write(f"Error: Virtual environment not found at {VENV_DIR}\n")
        sys.stderr.write("Run ./python-bootstrap/bootstrap.sh to set it up.\n")
        raise SystemExit(1)
    # Venv directory exists but python is missing; fall back to current interpreter.
    return Path(sys.executable)


def run_cli(python_exe: Path, args: List[str]) -> int:
    """Invoke sparkq CLI with the provided args."""
    cmd = [str(python_exe), "-m", "sparkq.src.cli", *args]
    result = subprocess.run(cmd, cwd=str(PROJECT_ROOT))
    return result.returncode


def main(argv: List[str]) -> int:
    if len(argv) == 0 or argv[0] in {"-h", "--help", "help"}:
        # Defer help to underlying CLI
        exe = ensure_venv()
        return run_cli(exe, ["--help"] + argv[1:])

    # Convenience aliases
    if argv[0] == "start":
        argv = ["run", "--background"]
    elif argv[0] == "restart":
        exe = ensure_venv()
        # stop
        code = run_cli(exe, ["stop"])
        if code != 0:
            return code
        time.sleep(5)
        argv = ["run", "--background"]

    exe = ensure_venv()
    return run_cli(exe, argv)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
