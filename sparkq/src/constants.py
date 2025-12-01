"""Shared constants for SparkQ."""

# Default timeouts (seconds)
DEFAULT_TASK_TIMEOUT_SECONDS = 300
DEFAULT_TOOL_TIMEOUT_SECONDS = DEFAULT_TASK_TIMEOUT_SECONDS
# Align defaults with sparkq.yml so UI/config are consistent with code.
TASK_CLASS_TIMEOUTS = {
    "FAST_SCRIPT": 120,
    "MEDIUM_SCRIPT": 600,
    "LLM_LITE": 480,
    "LLM_HEAVY": 1200,
}

# Database defaults
DB_LOCK_TIMEOUT_SECONDS = 5.0
MAX_TASK_LIST_LIMIT = 1000

# Stale task handling
STALE_WARNING_MULTIPLIER = 1.0
STALE_FAIL_MULTIPLIER = 2.0

# Config and server defaults
CONFIG_CACHE_TTL_SECONDS = 60
DEFAULT_PURGE_OLDER_THAN_DAYS = 3
DEFAULT_AUTO_FAIL_INTERVAL_SECONDS = 30
