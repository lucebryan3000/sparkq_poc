#!/usr/bin/env bash
set -euo pipefail

# Move to the script directory so paths resolve correctly.
cd "$(dirname "$0")"

python3 -m venv venv

# shellcheck disable=SC1091
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

echo "SparkQ setup complete. Activate the environment with 'source $(pwd)/venv/bin/activate'."
