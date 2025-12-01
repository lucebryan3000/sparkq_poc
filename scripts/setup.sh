#!/usr/bin/env bash
# Basic one-shot setup: venv + deps + config + db
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Allow overrides
PROJECT_NAME="${PROJECT_NAME:-sparkq-local}"
PROJECT_ROOT="${PROJECT_ROOT:-$ROOT}"
SERVER_PORT="${SERVER_PORT:-5005}"
DB_PATH="${DB_PATH:-sparkq/data/sparkq.db}"

echo "[1/4] Ensuring virtualenv and deps..."
if [[ ! -d "$ROOT/.venv" ]]; then
  python -m venv .venv
fi
source .venv/bin/activate
pip install -r sparkq/requirements.txt

echo "[2/4] Seeding config..."
if [[ ! -f "$ROOT/sparkq.yml" ]]; then
  cp sparkq.yml.example sparkq.yml
  echo "  Created sparkq.yml from template."
else
  echo "  sparkq.yml already present; leaving as is."
fi

echo "[3/4] Initializing database..."
python -m sparkq.src.cli setup <<EOF
${PROJECT_NAME}
${PROJECT_ROOT}

sparkq/scripts
scripts

1
5
5
15
${SERVER_PORT}
EOF

echo "[4/4] Done."
echo "Start server in dev: SPARKQ_ENV=dev ./sparkq.sh run"
echo "Start server in prod: SPARKQ_ENV=prod ./sparkq.sh run"
