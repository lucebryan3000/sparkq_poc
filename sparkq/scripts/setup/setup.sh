#!/usr/bin/env bash
# Basic one-shot setup: venv + deps + config + db
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

# Allow overrides
PROJECT_NAME="${PROJECT_NAME:-sparkq-local}"
PROJECT_ROOT="${PROJECT_ROOT:-$ROOT}"
SERVER_PORT="${SERVER_PORT:-5005}"
DB_PATH="${DB_PATH:-sparkq/data/sparkq.db}"
UPDATE_EXAMPLES=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --update)
      UPDATE_EXAMPLES=true
      shift
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--update]"
      exit 1
      ;;
  esac
done

echo "[1/6] Ensuring virtualenv..."
if [[ ! -d "$ROOT/.venv" ]]; then
  python -m venv .venv
fi
source .venv/bin/activate

echo "[2/6] Installing runtime dependencies..."
pip install --upgrade pip
pip install -r sparkq/requirements.txt

echo "[3/6] Installing test dependencies (pytest)..."
pip install -r sparkq/requirements-test.txt

echo "[4/6] Seeding config..."
EXAMPLE_PATH="$SCRIPT_DIR/sparkq.yml.example"
if [[ "$UPDATE_EXAMPLES" == true ]]; then
  if [[ -f "$ROOT/sparkq.yml" ]]; then
    cp "$ROOT/sparkq.yml" "$EXAMPLE_PATH"
    echo "  Updated sparkq.yml.example from current sparkq.yml"
  else
    echo "  No sparkq.yml to update example from; skipping"
  fi
else
  if [[ ! -f "$ROOT/sparkq.yml" ]]; then
    cp "$EXAMPLE_PATH" sparkq.yml
    echo "  Created sparkq.yml from template."
  else
    echo "  sparkq.yml already present; leaving as is."
  fi
fi

echo "[5/6] Seeding .env (optional)..."
ENV_EXAMPLE="$SCRIPT_DIR/.env.example"
if [[ "$UPDATE_EXAMPLES" == true ]]; then
  if [[ -f "$ROOT/.env" ]]; then
    cp "$ROOT/.env" "$ENV_EXAMPLE"
    echo "  Updated .env.example from current .env"
  else
    echo "  No .env to update example from; skipping"
  fi
else
  if [[ -f "$ENV_EXAMPLE" && ! -f "$ROOT/.env" ]]; then
    cp "$ENV_EXAMPLE" "$ROOT/.env"
    echo "  Created .env from template."
  else
    echo "  .env already present or no template found; leaving as is."
  fi
fi

echo "[6/6] Ensuring data/log directories..."
mkdir -p sparkq/data sparkq/logs

echo "[init] Ensuring requirements example..."
REQ_EXAMPLE="$SCRIPT_DIR/requirements.txt.example"
if [[ "$UPDATE_EXAMPLES" == true ]]; then
  cp "$ROOT/sparkq/requirements.txt" "$REQ_EXAMPLE"
  echo "  Updated requirements.txt.example from sparkq/requirements.txt"
elif [[ ! -f "$REQ_EXAMPLE" ]]; then
  cp "$ROOT/sparkq/requirements.txt" "$REQ_EXAMPLE"
  echo "  Created requirements.txt.example from current requirements.txt"
fi

echo "[init] Initializing database and seeding config..."
python - <<'PY'
from pathlib import Path
from sparkq.src import api
from sparkq.src.config import get_database_path, load_config
from sparkq.src.storage import Storage, now_iso

cfg = load_config()
db_path = get_database_path(cfg)
storage = Storage(db_path)
storage.init_db()

# Ensure a project row exists
project_cfg = (cfg or {}).get("project", {}) if cfg else {}
desired_name = project_cfg.get("name", "sparkq-local")
desired_repo = project_cfg.get("repo_path") or str(Path.cwd())
desired_prd = project_cfg.get("prd_path")
existing_project = storage.get_project()
if existing_project:
    with storage.connection() as conn:
        conn.execute(
            "UPDATE projects SET name = ?, repo_path = ?, prd_path = ?, updated_at = ? WHERE id = ?",
            (desired_name, desired_repo, desired_prd, now_iso(), existing_project["id"]),
        )
else:
    storage.create_project(
        name=desired_name,
        repo_path=desired_repo,
        prd_path=desired_prd,
    )

# Seed config + tool tables if empty using YAML defaults
api.storage = storage
defaults = api._load_yaml_defaults()
api._seed_config_if_empty(defaults)
db_config = storage.export_config()
api._seed_tools_task_classes_if_empty(defaults, db_config)

print(f"Database initialized at {db_path}")
PY

echo "[done] SparkQ ready."
echo "Start server in dev: SPARKQ_ENV=dev ./sparkq.sh run"
echo "Start server in prod: SPARKQ_ENV=prod ./sparkq.sh run"
