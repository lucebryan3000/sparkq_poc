# Testing Guide

## Running Tests

### Activate Virtual Environment First
```bash
source .venv/bin/activate
```

### Run All Tests
```python
# If using pytest
pytest

# If using unittest
python -m unittest discover

# If using unittest with verbose output
python -m unittest discover -v
```

### Run Specific Test File
```bash
pytest tests/test_module.py
# or
python -m unittest tests.test_module
```

### Run Specific Test Class or Method
```bash
pytest tests/test_module.py::TestClass::test_method
# or
python -m unittest tests.test_module.TestClass.test_method
```

### Run Tests with Coverage
```bash
# Install coverage if not already installed
pip install coverage

# Run tests with coverage
coverage run -m pytest
coverage run -m unittest discover

# Generate coverage report
coverage report
coverage html  # Creates htmlcov/index.html
```

## Writing Tests

### Test Structure (unittest)
```python
import unittest

class TestFeature(unittest.TestCase):
    def setUp(self):
        """Set up test fixtures"""
        pass

    def tearDown(self):
        """Clean up after tests"""
        pass

    def test_specific_behavior(self):
        # Arrange
        expected = "result"

        # Act
        actual = function_under_test()

        # Assert
        self.assertEqual(expected, actual)
```

### Test Structure (pytest)
```python
import pytest

def test_feature():
    # Arrange
    expected = "result"

    # Act
    actual = function_under_test()

    # Assert
    assert actual == expected

class TestFeature:
    def setup_method(self):
        """Run before each test"""
        pass

    def test_behavior(self):
        assert True
```

### Common Patterns
- Use descriptive test names (describe what should happen)
- Keep tests focused on a single behavior
- Mock external dependencies (databases, APIs, etc.)
- Test both success and failure paths
- Use fixtures for shared test data

## Test Coverage Goals
- Aim for >80% coverage on critical paths
- 100% coverage on utilities and helpers
- Functional coverage more important than line coverage

## Debugging Tests

### Run with Verbose Output
```bash
pytest -v
# or
python -m unittest discover -v
```

### Drop into Debugger
```python
# Add to test code
import pdb; pdb.set_trace()
```

### Use pytest fixtures for debugging
```python
@pytest.fixture(autouse=True)
def debug_print(request):
    print(f"\n--- Running {request.node.name} ---")
```

### See print statements during test run
```bash
pytest -s  # Disable output capture
```

## Environment Variables in Tests
```bash
# Set env vars for test run
export TEST_MODE=true
pytest

# Or inline
TEST_MODE=true pytest
```
