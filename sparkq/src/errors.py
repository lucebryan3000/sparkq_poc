"""Domain exceptions for SparkQ."""

class SparkQError(ValueError):
    """Base class for expected domain errors (maps to HTTP 4xx/CLI exit)."""


class ValidationError(SparkQError):
    """Client input is invalid."""


class NotFoundError(SparkQError):
    """Requested resource does not exist."""


class ConflictError(SparkQError):
    """Operation conflicts with current state."""
