#!/usr/bin/env bash
# Compatibility wrapper - use sparkq/scripts/teardown/teardown.sh
"$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/scripts/teardown/teardown.sh" "$@"
