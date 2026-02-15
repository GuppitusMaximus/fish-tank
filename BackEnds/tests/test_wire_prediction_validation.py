"""QA tests for the wire-prediction-validation plan.

Verifies that prediction validation is correctly wired into the pipeline:
- validate_prediction.py accepts --predictions-dir and --history flags
- History is capped at MAX_HISTORY (168)
- Model metadata (model_version, model_type) is passed through
- export_weather.py accepts --history flag and produces correct output
- export_weather.py works without --history (fallback)
- GitHub Actions workflow has the validation step in the right place
- find_latest_prediction handles edge cases
"""

import json
import os
import subprocess
import sys
import tempfile

import pytest

SCRIPT_DIR = os.path.join(os.path.dirname(__file__), "..", "the-snake-tank")
VALIDATE_SCRIPT = os.path.join(SCRIPT_DIR, "validate_prediction.py")
EXPORT_SCRIPT = os.path.join(SCRIPT_DIR, "export_weather.py")
DATA_DIR = os.path.join(SCRIPT_DIR, "data")
WORKFLOW_PATH = os.path.join(os.path.dirname(__file__), "..", "..", ".github", "workflows", "netatmo.yml")


# --- Test 1: validate_prediction.py accepts --predictions-dir ---

def test_validate_accepts_predictions_dir():
    """validate_prediction.py should accept --predictions-dir and find latest prediction."""
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as f:
        history_path = f.name

    try:
        result = subprocess.run(
            [sys.executable, VALIDATE_SCRIPT,
             "--predictions-dir", os.path.join(DATA_DIR, "predictions"),
             "--history", history_path],
            capture_output=True, text=True, timeout=30,
        )
        assert result.returncode == 0, f"Script failed: {result.stderr}"
        assert "Found latest prediction:" in result.stdout
    finally:
        os.unlink(history_path)


# --- Test 2: MAX_HISTORY is 168 and history is trimmed ---

def test_max_history_constant():
    """validate_prediction.py should have MAX_HISTORY = 168."""
    sys.path.insert(0, SCRIPT_DIR)
    try:
        import validate_prediction
        assert hasattr(validate_prediction, "MAX_HISTORY")
        assert validate_prediction.MAX_HISTORY == 168
    finally:
        sys.path.pop(0)


def test_history_trimmed_to_max():
    """History list should be trimmed to MAX_HISTORY after insertion."""
    with open(VALIDATE_SCRIPT) as f:
        source = f.read()
    assert "history = history[:MAX_HISTORY]" in source


# --- Test 3: Model metadata passed through ---

def test_model_metadata_in_comparison():
    """Comparison records should include model_version and model_type when present."""
    with open(VALIDATE_SCRIPT) as f:
        source = f.read()
    assert 'comparison["model_version"]' in source
    assert 'comparison["model_type"]' in source


# --- Test 4: export_weather.py accepts --history ---

def test_export_accepts_history_flag():
    """export_weather.py should accept --history and produce output with history array."""
    history_path = os.path.join(DATA_DIR, "prediction-history.json")
    if not os.path.exists(history_path):
        pytest.skip("No prediction-history.json available")

    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as f:
        output_path = f.name

    try:
        result = subprocess.run(
            [sys.executable, EXPORT_SCRIPT,
             "--output", output_path,
             "--history", history_path],
            capture_output=True, text=True, timeout=30,
        )
        assert result.returncode == 0, f"Script failed: {result.stderr}"

        with open(output_path) as f:
            data = json.load(f)

        assert "history" in data
        assert isinstance(data["history"], list)

        # Check required fields in history entries
        required_fields = [
            "date", "hour", "actual_indoor", "actual_outdoor",
            "predicted_indoor", "predicted_outdoor", "delta_indoor", "delta_outdoor",
        ]
        for entry in data["history"]:
            for field in required_fields:
                assert field in entry, f"Missing field '{field}' in history entry"
    finally:
        os.unlink(output_path)


# --- Test 5: export_weather.py fallback without --history ---

def test_export_fallback_without_history():
    """export_weather.py should work without --history using file-matching logic."""
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as f:
        output_path = f.name

    try:
        result = subprocess.run(
            [sys.executable, EXPORT_SCRIPT, "--output", output_path],
            capture_output=True, text=True, timeout=30,
        )
        assert result.returncode == 0, f"Script failed: {result.stderr}"

        with open(output_path) as f:
            data = json.load(f)

        assert "generated_at" in data
        assert "current" in data
        assert "next_prediction" in data
        assert "history" in data
        assert isinstance(data["history"], list)
    finally:
        os.unlink(output_path)


# --- Test 6: Workflow updated ---

def test_workflow_has_validation_step():
    """netatmo.yml should have validation step in correct position."""
    if not os.path.exists(WORKFLOW_PATH):
        pytest.skip("Workflow file not found")

    with open(WORKFLOW_PATH) as f:
        content = f.read()

    assert "Validate previous prediction" in content
    assert "--predictions-dir" in content
    assert "--history" in content

    lines = content.split("\n")
    rebuild_line = None
    validate_line = None
    train_line = None
    export_line = None

    for i, line in enumerate(lines):
        if "Rebuild dataset" in line:
            rebuild_line = i
        if "Validate previous prediction" in line:
            validate_line = i
        if "Train prediction model" in line:
            train_line = i
        if "Export weather dashboard" in line:
            export_line = i

    assert rebuild_line is not None, "Missing 'Rebuild dataset' step"
    assert validate_line is not None, "Missing 'Validate previous prediction' step"
    assert train_line is not None, "Missing 'Train prediction model' step"
    assert export_line is not None, "Missing 'Export weather dashboard' step"

    assert rebuild_line < validate_line < train_line, \
        "Validation step should be after Rebuild and before Train"

    # Export step should include --history
    export_section = "\n".join(lines[export_line:export_line + 3])
    assert "--history" in export_section, "Export step should include --history flag"


def test_workflow_graceful_failure():
    """Validation and export steps should have || true for graceful failure."""
    if not os.path.exists(WORKFLOW_PATH):
        pytest.skip("Workflow file not found")

    with open(WORKFLOW_PATH) as f:
        content = f.read()

    # Find the validate line and check it has || true
    lines = content.split("\n")
    for i, line in enumerate(lines):
        if "validate_prediction.py" in line:
            assert "|| true" in line, "Validation step should have || true"


# --- Test 7: find_latest_prediction edge cases ---

def test_find_latest_prediction_nonexistent_dir():
    """find_latest_prediction should return None for nonexistent directory."""
    sys.path.insert(0, SCRIPT_DIR)
    try:
        from validate_prediction import find_latest_prediction
        assert find_latest_prediction("/nonexistent/dir") is None
    finally:
        sys.path.pop(0)


def test_find_latest_prediction_empty_dir():
    """find_latest_prediction should return None for empty directory."""
    sys.path.insert(0, SCRIPT_DIR)
    try:
        from validate_prediction import find_latest_prediction
        with tempfile.TemporaryDirectory() as tmpdir:
            assert find_latest_prediction(tmpdir) is None
    finally:
        sys.path.pop(0)


def test_find_latest_prediction_sorts_descending():
    """find_latest_prediction should return the newest prediction file."""
    sys.path.insert(0, SCRIPT_DIR)
    try:
        from validate_prediction import find_latest_prediction
        with tempfile.TemporaryDirectory() as tmpdir:
            # Create two date dirs with prediction files
            old_dir = os.path.join(tmpdir, "2026-02-13")
            new_dir = os.path.join(tmpdir, "2026-02-14")
            os.makedirs(old_dir)
            os.makedirs(new_dir)

            with open(os.path.join(old_dir, "1000.json"), "w") as f:
                json.dump({}, f)
            with open(os.path.join(new_dir, "0800.json"), "w") as f:
                json.dump({}, f)
            with open(os.path.join(new_dir, "1200.json"), "w") as f:
                json.dump({}, f)

            result = find_latest_prediction(tmpdir)
            # Should return newest date (2026-02-14), latest hour (1200)
            assert result == os.path.join(new_dir, "1200.json")
    finally:
        sys.path.pop(0)
