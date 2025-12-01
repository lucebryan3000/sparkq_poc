from src.math_utils import add_numbers


def test_add_numbers_with_ints_and_floats():
    assert add_numbers(2, 3) == 5
    assert add_numbers(-1.5, 0.5) == -1.0
