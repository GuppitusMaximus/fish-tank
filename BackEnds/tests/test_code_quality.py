"""QA tests for backend code quality: syntax, hardcoded paths, and imports."""

import ast
import os
import re
import sys

import pytest

SNAKE_TANK_DIR = os.path.join(os.path.dirname(__file__), "..", "the-snake-tank")

PYTHON_FILES = [
    os.path.join(SNAKE_TANK_DIR, f)
    for f in ("train_model.py", "predict.py", "export_weather.py")
]

HARDCODED_PATH_PATTERN = re.compile(
    r"""(?:/Users/|/home/|/tmp/|/var/|/opt/|[A-Z]:\\)"""
)

STDLIB_MODULES = set(sys.stdlib_module_names)

ALLOWED_THIRD_PARTY = {"joblib", "numpy", "pandas", "sklearn", "np", "pd"}


@pytest.mark.parametrize("filepath", PYTHON_FILES, ids=lambda p: os.path.basename(p))
def test_syntax_valid(filepath):
    """Each Python file should compile without syntax errors."""
    with open(filepath) as f:
        source = f.read()
    compile(source, filepath, "exec")


@pytest.mark.parametrize("filepath", PYTHON_FILES, ids=lambda p: os.path.basename(p))
def test_no_hardcoded_paths(filepath):
    """No Python file should contain hardcoded absolute paths."""
    with open(filepath) as f:
        for lineno, line in enumerate(f, 1):
            if line.lstrip().startswith("#"):
                continue
            assert not HARDCODED_PATH_PATTERN.search(line), (
                f"{os.path.basename(filepath)}:{lineno} has hardcoded path: {line.strip()}"
            )


def test_train_model_imports():
    """All imports in train_model.py should be stdlib or listed in requirements."""
    filepath = os.path.join(SNAKE_TANK_DIR, "train_model.py")
    with open(filepath) as f:
        tree = ast.parse(f.read(), filepath)

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                top = alias.name.split(".")[0]
                assert top in STDLIB_MODULES or top in ALLOWED_THIRD_PARTY, (
                    f"Unexpected import: {alias.name}"
                )
        elif isinstance(node, ast.ImportFrom) and node.module:
            top = node.module.split(".")[0]
            assert top in STDLIB_MODULES or top in ALLOWED_THIRD_PARTY, (
                f"Unexpected import: {node.module}"
            )
