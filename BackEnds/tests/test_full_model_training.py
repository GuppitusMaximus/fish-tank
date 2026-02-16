#!/usr/bin/env python3
"""Test suite for full 24h model training and predictions.

Verifies that:
1. Model files can be loaded
2. Metadata files are valid JSON with required fields
3. Predictions run without error
4. MAX_GAP is set correctly
"""

import json
import os
import subprocess
import sys

# Add parent directory to path for imports
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.join(SCRIPT_DIR, "..")
sys.path.insert(0, PARENT_DIR)

MODELS_DIR = os.path.join(PARENT_DIR, "the-snake-tank", "models")
SIMPLE_MODEL_PATH = os.path.join(MODELS_DIR, "temp_predictor_simple.joblib")
SIMPLE_META_PATH = os.path.join(MODELS_DIR, "simple_meta.json")
FULL_MODEL_PATH = os.path.join(MODELS_DIR, "temp_predictor.joblib")
FULL_META_PATH = os.path.join(MODELS_DIR, "model_meta.json")


def test_simple_model_exists():
    """Verify simple model file exists."""
    assert os.path.exists(SIMPLE_MODEL_PATH), f"Simple model not found at {SIMPLE_MODEL_PATH}"


def test_simple_model_loadable():
    """Verify simple model can be loaded with joblib."""
    import joblib

    model = joblib.load(SIMPLE_MODEL_PATH)
    assert model is not None, "Simple model loaded as None"
    # Check it's a MultiOutputRegressor
    assert hasattr(model, 'predict'), "Model does not have predict method"


def test_simple_metadata_valid():
    """Verify simple model metadata is valid JSON with required fields."""
    assert os.path.exists(SIMPLE_META_PATH), f"Simple metadata not found at {SIMPLE_META_PATH}"

    with open(SIMPLE_META_PATH) as f:
        meta = json.load(f)

    # Check required fields
    assert "version" in meta, "Missing 'version' in metadata"
    assert "trained_at" in meta, "Missing 'trained_at' in metadata"
    assert "sample_count" in meta, "Missing 'sample_count' in metadata"
    assert "mae_indoor" in meta, "Missing 'mae_indoor' in metadata"
    assert "mae_outdoor" in meta, "Missing 'mae_outdoor' in metadata"

    # Validate values
    assert isinstance(meta["version"], int), "version should be int"
    assert meta["version"] > 0, "version should be positive"
    assert isinstance(meta["sample_count"], int), "sample_count should be int"
    assert meta["sample_count"] > 0, "sample_count should be positive"
    assert isinstance(meta["mae_indoor"], (int, float)), "mae_indoor should be numeric"
    assert isinstance(meta["mae_outdoor"], (int, float)), "mae_outdoor should be numeric"
    assert 0 <= meta["mae_indoor"] < 10, f"mae_indoor seems unreasonable: {meta['mae_indoor']}"
    assert 0 <= meta["mae_outdoor"] < 10, f"mae_outdoor seems unreasonable: {meta['mae_outdoor']}"


def test_full_model_if_exists():
    """If full model exists, verify it's loadable and has valid metadata."""
    if not os.path.exists(FULL_MODEL_PATH):
        print("SKIP: Full model does not exist yet (waiting for sufficient data)")
        return

    # If full model exists, test it
    import joblib
    model = joblib.load(FULL_MODEL_PATH)
    assert model is not None, "Full model loaded as None"
    assert hasattr(model, 'predict'), "Full model does not have predict method"

    # Check metadata
    assert os.path.exists(FULL_META_PATH), f"Full model exists but metadata missing at {FULL_META_PATH}"
    with open(FULL_META_PATH) as f:
        meta = json.load(f)

    assert "version" in meta, "Missing 'version' in full model metadata"
    assert "sample_count" in meta, "Missing 'sample_count' in full model metadata"
    assert meta["version"] > 0, "Full model version should be positive"
    assert meta["sample_count"] > 0, "Full model sample_count should be positive"


def test_max_gap_setting():
    """Verify MAX_GAP is set to 7200 in train_model.py."""
    train_script = os.path.join(PARENT_DIR, "the-snake-tank", "train_model.py")
    assert os.path.exists(train_script), f"train_model.py not found at {train_script}"

    with open(train_script) as f:
        content = f.read()

    # Check for MAX_GAP = 7200
    assert "MAX_GAP = 7200" in content, "MAX_GAP should be set to 7200"
    # Ensure it's not commented out
    for line in content.split('\n'):
        if 'MAX_GAP = 7200' in line:
            assert not line.strip().startswith('#'), "MAX_GAP = 7200 line is commented out"
            break


def test_predict_runs_without_error():
    """Verify predict.py runs with --model-type all without crashing."""
    predict_script = os.path.join(PARENT_DIR, "the-snake-tank", "predict.py")
    predictions_dir = os.path.join(PARENT_DIR, "the-snake-tank", "data", "predictions")

    result = subprocess.run(
        ["python3", predict_script, "--model-type", "all", "--predictions-dir", predictions_dir],
        capture_output=True,
        text=True,
        cwd=os.path.join(PARENT_DIR, "the-snake-tank")
    )

    # Should exit 0 even if full model doesn't exist yet
    assert result.returncode == 0, f"predict.py failed with exit code {result.returncode}\nStderr: {result.stderr}"

    # Output should mention simple model
    assert "simple" in result.stdout.lower(), "predict.py output should mention simple model"


def test_simple_predictions_produced():
    """Verify that simple model produces prediction files."""
    predictions_base = os.path.join(PARENT_DIR, "the-snake-tank", "data", "predictions")

    # Find today's directory (could be UTC date)
    from datetime import datetime, timezone
    today_utc = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    today_dir = os.path.join(predictions_base, today_utc)

    if not os.path.exists(today_dir):
        print(f"SKIP: No predictions directory for {today_utc}")
        return

    # Check for *_simple.json files
    files = os.listdir(today_dir)
    simple_files = [f for f in files if f.endswith('_simple.json')]

    assert len(simple_files) > 0, f"No *_simple.json files found in {today_dir}"

    # Validate one prediction file structure
    test_file = os.path.join(today_dir, simple_files[0])
    with open(test_file) as f:
        pred = json.load(f)

    assert "model_type" in pred, "Prediction missing 'model_type'"
    assert pred["model_type"] == "simple", f"Expected model_type='simple', got '{pred['model_type']}'"
    assert "model_version" in pred, "Prediction missing 'model_version'"
    assert "prediction" in pred, "Prediction missing 'prediction' field"
    assert "temp_indoor" in pred["prediction"], "Prediction missing temp_indoor"
    assert "temp_outdoor" in pred["prediction"], "Prediction missing temp_outdoor"


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
