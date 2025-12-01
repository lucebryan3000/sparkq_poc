#!/usr/bin/env bash
# Entrypoint for SparkQ setup
"$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/setup/setup.sh" "$@"
