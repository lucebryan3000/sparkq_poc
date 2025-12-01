"""Small math helpers used across the project."""

from typing import Union


Number = Union[int, float]


def add_numbers(a: Number, b: Number) -> Number:
    """Return the sum of two numbers."""
    return a + b
