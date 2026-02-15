"""QA tests for README accuracy against source code.

Verifies that the-snake-tank/README.md accurately documents the model
architecture, versioning, prediction cascade, and project structure
as implemented in train_model.py and predict.py.
"""

import os
import re
import sys

# Add parent dir so we can import from the-snake-tank
TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
BACKENDS_DIR = os.path.dirname(TESTS_DIR)
SNAKE_TANK_DIR = os.path.join(BACKENDS_DIR, "the-snake-tank")
README_PATH = os.path.join(SNAKE_TANK_DIR, "README.md")

sys.path.insert(0, SNAKE_TANK_DIR)


def read_readme():
    with open(README_PATH) as f:
        return f.read()


# --- Test 1: README exists and is valid markdown ---

def test_readme_exists():
    assert os.path.isfile(README_PATH), f"README not found at {README_PATH}"


def test_readme_no_unclosed_code_blocks():
    content = read_readme()
    fence_count = content.count("```")
    assert fence_count % 2 == 0, f"Odd number of ``` fences ({fence_count}), likely unclosed code block"


# --- Test 2: Two-tier model documented ---

def test_full_model_documented():
    content = read_readme()
    assert "22 features" in content, "README should mention 22 features for full model"
    assert "24" in content and "lookback" in content.lower(), "README should mention 24h lookback"


def test_simple_model_documented():
    content = read_readme()
    assert "9 features" in content, "README should mention 9 features for simple model"
    assert "3" in content and "fallback" in content.lower(), "README should mention 3h fallback"


def test_fallback_relationship_documented():
    content = read_readme()
    assert "fallback" in content.lower(), "README should describe the fallback relationship"


# --- Test 3: Model versioning documented ---

def test_model_meta_json_mentioned():
    content = read_readme()
    assert "model_meta.json" in content, "README should mention model_meta.json"


def test_simple_meta_json_mentioned():
    content = read_readme()
    assert "simple_meta.json" in content, "README should mention simple_meta.json"


def test_version_tracking_mentioned():
    content = read_readme()
    assert "version" in content.lower(), "README should mention version tracking"


def test_mae_metrics_mentioned():
    content = read_readme()
    assert "mae_indoor" in content, "README should mention mae_indoor metric"
    assert "mae_outdoor" in content, "README should mention mae_outdoor metric"


# --- Test 4: Prediction cascade documented ---

def test_prediction_cascade_section():
    content = read_readme()
    assert "Prediction Cascade" in content, "README should have a Prediction Cascade section"


def test_cascade_stages():
    content = read_readme()
    assert "full model" in content.lower(), "README should mention full model stage"
    assert "simple model" in content.lower(), "README should mention simple model stage"
    assert "error" in content.lower(), "README should mention error stage"


# --- Test 5: model_type field mentioned ---

def test_model_type_field():
    content = read_readme()
    assert "model_type" in content, "README should mention model_type field"
    assert '"full"' in content or "'full'" in content, "README should mention full model_type value"
    assert '"simple"' in content or "'simple'" in content, "README should mention simple model_type value"


# --- Test 6: Project structure updated ---

def test_structure_includes_simple_model():
    content = read_readme()
    assert "temp_predictor_simple.joblib" in content, "Project structure should list simple model file"


def test_structure_includes_simple_meta():
    content = read_readme()
    assert "simple_meta.json" in content, "Project structure should list simple_meta.json"


def test_structure_includes_predictions_dir():
    content = read_readme()
    assert "predictions/" in content or "predictions" in content, "Project structure should list predictions directory"


def test_structure_includes_tests_dir():
    content = read_readme()
    assert "tests/" in content or "BackEnds/tests" in content, "Project structure should list tests directory"


# --- Test 7: Cross-reference with source code ---

def test_feature_count_matches_code():
    import train_model
    assert len(train_model.FEATURE_COLS) == 22, f"Expected 22 features, got {len(train_model.FEATURE_COLS)}"
    content = read_readme()
    assert "22 features" in content, "README should say 22 features matching train_model.FEATURE_COLS"


def test_simple_feature_count_matches_code():
    import train_model
    assert len(train_model.SIMPLE_FEATURE_COLS) == 9, f"Expected 9 simple features, got {len(train_model.SIMPLE_FEATURE_COLS)}"
    content = read_readme()
    assert "9 features" in content, "README should say 9 features matching train_model.SIMPLE_FEATURE_COLS"


def test_lookback_matches_code():
    import train_model
    assert train_model.LOOKBACK == 24, f"Expected LOOKBACK=24, got {train_model.LOOKBACK}"


def test_simple_lookback_matches_code():
    import train_model
    assert train_model.SIMPLE_LOOKBACK == 3, f"Expected SIMPLE_LOOKBACK=3, got {train_model.SIMPLE_LOOKBACK}"


def test_simple_feature_names_match_code():
    import train_model
    content = read_readme()
    for feat in train_model.SIMPLE_FEATURE_COLS:
        assert feat in content, f"README should mention simple feature: {feat}"


def test_predict_model_type_values_match_code():
    with open(os.path.join(SNAKE_TANK_DIR, "predict.py")) as f:
        predict_code = f.read()
    assert '"full"' in predict_code, "predict.py should reference 'full' model type"
    assert '"simple"' in predict_code, "predict.py should reference 'simple' model type"
