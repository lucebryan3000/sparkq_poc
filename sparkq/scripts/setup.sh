#!/usr/bin/env bash
# Compatibility wrapper - use sparkq/scripts/setup/setup.sh
"$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/setup/setup.sh" "$@"
