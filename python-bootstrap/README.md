# Python Bootstrap

Self-contained folder to stand up a Python venv and run an entrypoint. Drop `scripts/python-bootstrap/` into any repo and run `./scripts/python-bootstrap/bootstrap.sh`.

## Quick start
- `./scripts/python-bootstrap/bootstrap.sh --dry-run` — show resolved paths/actions.
- `./scripts/python-bootstrap/bootstrap.sh --clean --dry-run` — preview what will be deleted.
- `./scripts/python-bootstrap/bootstrap.sh --clean` — remove old deployment and redeploy.
- `./scripts/python-bootstrap/bootstrap.sh --install-only` — create venv + install deps.
- `./scripts/python-bootstrap/bootstrap.sh --run-cmd "python app.py" --foreground` — launch custom command.

## Flags & Options

For a complete list of flags and examples, run:
```bash
./scripts/python-bootstrap/bootstrap.sh --help
```

Key flags:
- `--config <file>` override config (default: python-bootstrap.config).
- `--foreground|--background` choose launch mode.
- `--install-only` skip launching.
- `--run-cmd "<cmd>"` custom command after setup.
- `--dry-run` plan only; also works with `--clean` to preview deletions.
- `--clean` remove old venv, .env, logs, and hash; redeploy cleanly from scratch.
- `--clean-all` like `--clean` but also removes .gitignore entries; use if redoing project structure.
- `--no-env`, `--env-path <file>`, `--env-append` control env file writing.
- `--no-deps` skip installs; `--editable` install pyproject in editable mode.
- `--py-version <ver>` request a Python version for pyenv fallback (default 3.11).
- `--no-gitignore`, `--gitignore-path <file>` control .gitignore management.
- `--allow-external`, `--yes` allow APP_DIR/VENV_DIR outside project root (with optional prompt).
- `--foreground-wrapper` run foreground without exec so a summary/tail is shown afterward.
- `--verbose` show detailed output (including pip install logs); `--quiet` show phase status only.
- Interactive confirmations: defaults are auto-detected; press Enter to accept or type to override. Detected values are written back to `python-bootstrap.config` (skipped on `--dry-run`).

## Config keys (python-bootstrap.config)
- `PROJECT_ROOT`, `APP_DIR`, `CONFIG_FILE`, `MAIN_SCRIPT`, `VENV_DIR`/`VENV_NAME`, `RUN_MODE`, `PY_BIN`.
- Dependency inputs: `REQUIREMENTS_FILES`, `DEPS`, `PYPROJECT_TOML`, `EDITABLE_INSTALL`, `PRE_INSTALL_CMD`, `POST_INSTALL_CMD`, `INSTALL_DEPS`.
- Env controls: `WRITE_ENV`, `ENV_PATH`, `ENV_APPEND`.
- Python bootstrap: `PY_BIN`, `PY_VERSION`, `PYENV_ROOT`.
- Safety toggles: `ALLOW_ROOT` (default: false), `ALLOW_EXTERNAL_VENV` (default: false), `ALLOW_EXTERNAL_APP` (default: false).
- Behavior: `PROMPT_EXTERNAL` (default: true), `ASSUME_YES` (default: false), `ALLOW_EXTERNAL_ALL` (default: false).
- Logging: `LOG_MAX_SIZE_BYTES`, `LOG_MAX_FILES`.

## Behavior highlights
- Auto-detect project root (git), config/pyproject, app dir, and venv paths.
- Python version enforcement via `pyproject.toml` `requires-python` or `runtime.txt`.
- **Smart venv reuse**: Detects existing venvs and displays info (Python version, package count, age, size), with optional prompt to reuse, clean & recreate, or abort.
- Hash-based install skip (includes config, deps, pyproject, interpreter, pip version).
- Hooks: pre/post install commands; editable install for pyproject.
- Log rotation (`APP_DIR/logs/bootstrap.log` by default) with size cap and tail summary after background or wrapped foreground runs.
- Safety: refuse root (unless `ALLOW_ROOT=true`) and external venv/app dirs unless explicitly allowed.
- .gitignore management: ensures venv, env file, and logs are ignored by default.
- Python bootstrap: will try pyenv to install the requested Python version if none is available (or too old); dry-run shows the plan without installing.
- Detected paths/settings are persisted back into `python-bootstrap.config` after confirmation (non-dry runs).

## Existing Virtual Environment Handling

When an existing venv is detected, the script displays detailed information and prompts you to decide:

```
ℹ Existing virtual environment found:
  ○ Python version           3.11.5
  ○ Installed packages       45
  ○ Age                      5 days ago
  ○ Size                     328 MB

→ [R]euse, [C]lean & recreate, [A]bort? [R]: _
```

- **[R]euse** (default): Keep existing venv, reinstall dependencies only if config changed
- **[C]lean & recreate**: Remove venv and rebuild fresh (equivalent to selecting within the prompt, not `--clean`)
- **[A]bort**: Exit without proceeding

Prompts are automatically skipped in these cases:
- `--yes` flag: Reuse existing venv
- `--dry-run` flag: Skip prompt, no changes made
- Non-interactive mode (piped stdin): Reuse existing venv

## Recent Improvements (Refactoring)
- **Security**: Fixed command injection vulnerability in variable confirmation
- **Validation**: Added venv creation validation (checks activate script exists)
- **User Experience**: Smart venv reuse with visibility (Python version, package count, age, size) and optional prompt
- **Error Handling**: Enhanced pip install with detailed error reporting and `--verbose` support
- **Performance**: Eliminated Python subprocess overhead (50-100ms speedup) via bash-native path resolution
- **Code Quality**: Centralized path resolution logic, standardized boolean naming, consistent error handling
- **Robustness**: Added proper error logging for Python subprocesses with graceful fallbacks

## Cleanup & Redeploy
Use `--clean` when a previous deployment went wrong or needs to be reset:
- `./scripts/python-bootstrap/bootstrap.sh --clean --dry-run` — preview what will be deleted.
- `./scripts/python-bootstrap/bootstrap.sh --clean --yes` — auto-approve cleanup.
- `./scripts/python-bootstrap/bootstrap.sh --clean` — interactive cleanup + redeploy.

What `--clean` removes:
- `.venv/` (virtual environment)
- `.env` (environment file)
- `APP_DIR/logs/` (runtime logs)
- `.bootstrap.hash` (dependency hash)

What `--clean-all` also removes:
- `.gitignore` entries (useful if you're restructuring the project)

Preserved files (never deleted):
- Project source code
- `requirements.txt`, `pyproject.toml`, config files
- `.gitignore` file itself (only entries are removed with `--clean-all`)

## Notes
- No interactive menu: use flags for control. When APP_DIR/VENV_DIR are outside the project root, you'll be prompted unless you pass `--yes` or configure external allowances.
- For foreground runs that still print a summary/log tail, use `--foreground-wrapper`.
- The `--clean` flag is safe: always shows what will be deleted, and asks for confirmation (unless `--yes` or `--dry-run` is used).
