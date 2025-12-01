"""Lightweight metrics hooks (no-op except structured logging).

These helpers are designed to be swapped for a real metrics backend later.
For now, they emit structured log lines so operators can grep/collect counts.
"""

import logging
from typing import Dict, Optional

logger = logging.getLogger("sparkq.metrics")


def _format_tags(tags: Optional[Dict[str, str]]) -> str:
    if not tags:
        return ""
    return " ".join(f"{k}={v}" for k, v in tags.items())


def incr(metric: str, value: int = 1, tags: Optional[Dict[str, str]] = None) -> None:
    """Increment a counter metric (logged)."""
    logger.info("metric=count name=%s value=%s %s", metric, value, _format_tags(tags))


def observe(metric: str, value: float, tags: Optional[Dict[str, str]] = None) -> None:
    """Record a distribution/latency metric (logged)."""
    logger.info("metric=distribution name=%s value=%s %s", metric, value, _format_tags(tags))
