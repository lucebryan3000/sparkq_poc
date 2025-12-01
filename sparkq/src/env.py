"""Environment helpers for SparkQ."""

from functools import lru_cache
import os
from typing import Literal

EnvName = Literal["dev", "prod", "test"]

_DEV_ALIASES = {"dev", "development", "local"}
_PROD_ALIASES = {"prod", "production", "live"}


@lru_cache(maxsize=1)
def get_app_env() -> EnvName:
    """Return normalized application environment."""
    raw = os.getenv("SPARKQ_ENV") or os.getenv("APP_ENV") or "dev"
    env = raw.strip().lower()

    if env in _DEV_ALIASES:
        return "dev"
    if env in _PROD_ALIASES:
        return "prod"
    if env == "test":
        return "test"
    return "dev"


def is_dev_env() -> bool:
    """True when running in development mode (or test)."""
    return get_app_env() in {"dev", "test"}


def is_prod_env() -> bool:
    """True when running in production mode."""
    return get_app_env() == "prod"


def reset_env_cache() -> None:
    """Clear cached environment detection (useful for tests)."""
    get_app_env.cache_clear()  # type: ignore[attr-defined]
