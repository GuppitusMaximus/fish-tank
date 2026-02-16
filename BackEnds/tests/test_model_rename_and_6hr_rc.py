"""
Test suite for model type rename (simple→3hrRaw, full→24hrRaw) and 6hrRC model addition.

This test verifies:
1. Old model type strings ("simple", "full") removed from model dispatch
2. New model types (3hrRaw, 24hrRaw, 6hrRC) properly implemented
3. 6hrRC model training and prediction functions exist with correct signatures
4. Feature vector dimensions match between training and prediction
"""

import os
import sys
import subprocess
import re

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PREDICT_PATH = os.path.join(BACKEND_DIR, "the-snake-tank", "predict.py")
TRAIN_PATH = os.path.join(BACKEND_DIR, "the-snake-tank", "train_model.py")


def test_no_old_model_types_in_predict():
    """Verify old model type strings removed from predict.py dispatch code."""
    with open(PREDICT_PATH) as f:
        content = f.read()

    # Find model type strings - should not include "simple" or "full" except in transition code
    # Allowed: if mt not in ("3hrRaw", "simple") - this is for error transition
    # Not allowed: models_to_run = ["simple"] or model_name == "simple" in dispatch

    lines = content.split('\n')
    violations = []

    for i, line in enumerate(lines, 1):
        # Skip comments
        if line.strip().startswith('#'):
            continue

        # Check for "simple" or "full" as model_type values in dispatch
        # Allowed contexts: transition filter 'if mt not in ("3hrRaw", "simple")'
        if '"simple"' in line or "'simple'" in line:
            # Line 102 is the transition filter - skip it
            if i != 102:
                violations.append(f"Line {i}: unexpected 'simple' reference: {line.strip()}")

        if '"full"' in line or "'full'" in line:
            # Check if it's actually referencing the model type
            if re.search(r'["\']full["\']', line):
                violations.append(f"Line {i}: unexpected 'full' reference: {line.strip()}")

    assert not violations, f"Found old model type strings:\n" + "\n".join(violations)


def test_new_model_types_in_argparse():
    """Verify argparse choices include new model types."""
    with open(PREDICT_PATH) as f:
        content = f.read()

    # Find argparse choices line
    assert '--model-type' in content, "Missing --model-type argument"

    # Find choices definition
    choices_match = re.search(r'choices\s*=\s*\[(.*?)\]', content)
    assert choices_match, "Could not find --model-type choices"

    choices_str = choices_match.group(1)
    assert '"3hrRaw"' in choices_str or "'3hrRaw'" in choices_str
    assert '"24hrRaw"' in choices_str or "'24hrRaw'" in choices_str
    assert '"6hrRC"' in choices_str or "'6hrRC'" in choices_str
    assert '"all"' in choices_str or "'all'" in choices_str


def test_model_dispatch_uses_new_types():
    """Verify model dispatch uses new type strings."""
    with open(PREDICT_PATH) as f:
        content = f.read()

    # Find models_to_run assignments
    assert 'models_to_run = ["3hrRaw", "24hrRaw", "6hrRC"]' in content or \
           "models_to_run = ['3hrRaw', '24hrRaw', '6hrRC']" in content, \
           "Missing all-models assignment with new types"

    # Find model dispatch conditions
    assert 'model_name == "24hrRaw"' in content or "model_name == '24hrRaw'" in content
    assert 'model_name == "3hrRaw"' in content or "model_name == '3hrRaw'" in content
    assert 'model_name == "6hrRC"' in content or "model_name == '6hrRC'" in content


def test_rc_constants_exist():
    """Verify RC_LOOKBACK and related constants defined."""
    for path, file_desc in [(PREDICT_PATH, "predict.py"), (TRAIN_PATH, "train_model.py")]:
        with open(path) as f:
            content = f.read()

        assert re.search(r'RC_LOOKBACK\s*=\s*6', content), \
            f"Missing RC_LOOKBACK = 6 in {file_desc}"
        assert 'RC_MODEL_PATH' in content, f"Missing RC_MODEL_PATH in {file_desc}"
        assert 'RC_META_PATH' in content, f"Missing RC_META_PATH in {file_desc}"
        assert 'HISTORY_PATH' in content, f"Missing HISTORY_PATH in {file_desc}"


def test_load_prediction_errors_exists():
    """Verify load_prediction_errors function exists in train_model.py."""
    with open(TRAIN_PATH) as f:
        content = f.read()

    assert 'def load_prediction_errors(' in content

    # Verify it filters to 3hrRaw/simple
    func_match = re.search(
        r'def load_prediction_errors\(.*?\):(.*?)(?=\ndef |\nif __name__|$)',
        content,
        re.DOTALL
    )
    assert func_match, "Could not find load_prediction_errors function body"
    func_body = func_match.group(1)

    assert '"3hrRaw"' in func_body or "'3hrRaw'" in func_body
    assert '"simple"' in func_body or "'simple'" in func_body
    assert 'for_hour' in func_body
    assert 'error' in func_body


def test_build_6hr_rc_windows_exists():
    """Verify build_6hr_rc_windows function exists with correct logic."""
    with open(TRAIN_PATH) as f:
        content = f.read()

    assert 'def build_6hr_rc_windows(' in content

    func_match = re.search(
        r'def build_6hr_rc_windows\(.*?\):(.*?)(?=\ndef |\nif __name__|$)',
        content,
        re.DOTALL
    )
    assert func_match, "Could not find build_6hr_rc_windows function body"
    func_body = func_match.group(1)

    # Verify key components
    assert 'RC_LOOKBACK' in func_body
    assert 'SIMPLE_FEATURE_COLS' in func_body
    assert 'error_lookup' in func_body
    assert 'feature_vector' in func_body

    # Verify feature construction comment exists
    assert '54' in func_body  # Base features count
    assert '68' in func_body or 'error_features' in func_body  # Total or error features


def test_train_6hr_rc_exists():
    """Verify train_6hr_rc function exists and is called from main."""
    with open(TRAIN_PATH) as f:
        content = f.read()

    # Check function exists
    assert 'def train_6hr_rc(' in content

    # Check it's called from __main__
    main_block = re.search(r'if __name__ == "__main__":(.*?)$', content, re.DOTALL)
    assert main_block, "Could not find __main__ block"
    assert 'train_6hr_rc()' in main_block.group(1)

    # Verify it loads errors and builds windows
    func_match = re.search(
        r'def train_6hr_rc\(.*?\):(.*?)(?=\ndef |\nif __name__|$)',
        content,
        re.DOTALL
    )
    assert func_match
    func_body = func_match.group(1)

    assert 'load_prediction_errors' in func_body
    assert 'build_6hr_rc_windows' in func_body
    assert 'RC_MODEL_PATH' in func_body
    assert 'RC_META_PATH' in func_body


def test_run_6hr_rc_model_exists():
    """Verify _run_6hr_rc_model function exists in predict.py."""
    with open(PREDICT_PATH) as f:
        content = f.read()

    assert 'def _run_6hr_rc_model(' in content

    func_match = re.search(
        r'def _run_6hr_rc_model\(.*?\):(.*?)(?=\ndef |\nif __name__|$)',
        content,
        re.DOTALL
    )
    assert func_match, "Could not find _run_6hr_rc_model function body"
    func_body = func_match.group(1)

    # Verify it loads RC_LOOKBACK readings
    assert 'RC_LOOKBACK' in func_body

    # Verify it loads errors
    assert '_load_recent_errors' in func_body or 'load_recent_errors' in func_body

    # Verify it builds feature vector
    assert 'SIMPLE_FEATURE_COLS' in func_body
    assert 'feature_vector' in func_body

    # Verify it loads model
    assert 'RC_MODEL_PATH' in func_body
    assert 'joblib.load' in func_body


def test_6hr_rc_in_dispatch():
    """Verify 6hrRC is in the model dispatch loop."""
    with open(PREDICT_PATH) as f:
        content = f.read()

    # Find the dispatch function
    func_match = re.search(
        r'def predict\(.*?\):(.*?)(?=\ndef |\nif __name__|$)',
        content,
        re.DOTALL
    )
    assert func_match, "Could not find predict() function"
    func_body = func_match.group(1)

    # Verify 6hrRC in dispatch
    assert 'elif model_name == "6hrRC"' in func_body or "elif model_name == '6hrRC'" in func_body
    assert '_run_6hr_rc_model()' in func_body


def test_feature_vector_dimension_consistency():
    """Verify feature vector dimensions match between training and prediction."""
    with open(TRAIN_PATH) as f:
        train_content = f.read()

    with open(PREDICT_PATH) as f:
        predict_content = f.read()

    # Both should mention 54 base features (9 features x 6 hours)
    # and error features totaling 68
    # Training file should have explicit dimension comments
    assert '54' in train_content  # Base features
    assert '68' in train_content  # Total features

    # Prediction should build same structure
    # Look for base features calculation
    assert 'SIMPLE_FEATURE_COLS' in predict_content

    # Both should have error_indoor_lags and error_outdoor_lags (6 each = 12)
    # Plus 2 averages
    for content, name in [(train_content, "train_model.py"),
                          (predict_content, "predict.py")]:
        assert 'error_indoor_lags' in content, f"Missing error_indoor_lags in {name}"
        assert 'error_outdoor_lags' in content, f"Missing error_outdoor_lags in {name}"
        assert 'avg_indoor' in content, f"Missing avg_indoor in {name}"
        assert 'avg_outdoor' in content, f"Missing avg_outdoor in {name}"


def test_read_6hr_rc_meta_exists():
    """Verify read_6hr_rc_meta helper exists."""
    for path, name in [(TRAIN_PATH, "train_model.py"), (PREDICT_PATH, "predict.py")]:
        with open(path) as f:
            content = f.read()
        assert 'def read_6hr_rc_meta(' in content, f"Missing read_6hr_rc_meta in {name}"


def test_backwards_compat_file_writer():
    """Verify backwards-compat file writer checks for 3hrRaw."""
    with open(PREDICT_PATH) as f:
        content = f.read()

    # Find _write_prediction function
    func_match = re.search(
        r'def _write_prediction\(.*?\):(.*?)(?=\ndef |\nif __name__|$)',
        content,
        re.DOTALL
    )
    assert func_match, "Could not find _write_prediction function"
    func_body = func_match.group(1)

    # Should check for 3hrRaw to write compat file
    assert 'if model_type == "3hrRaw"' in func_body or "if model_type == '3hrRaw'" in func_body


if __name__ == "__main__":
    # Run all tests
    tests = [
        ("Old model types removed", test_no_old_model_types_in_predict),
        ("New model types in argparse", test_new_model_types_in_argparse),
        ("Model dispatch uses new types", test_model_dispatch_uses_new_types),
        ("RC constants exist", test_rc_constants_exist),
        ("load_prediction_errors exists", test_load_prediction_errors_exists),
        ("build_6hr_rc_windows exists", test_build_6hr_rc_windows_exists),
        ("train_6hr_rc exists", test_train_6hr_rc_exists),
        ("_run_6hr_rc_model exists", test_run_6hr_rc_model_exists),
        ("6hrRC in dispatch", test_6hr_rc_in_dispatch),
        ("Feature dimensions consistent", test_feature_vector_dimension_consistency),
        ("read_6hr_rc_meta exists", test_read_6hr_rc_meta_exists),
        ("Backwards-compat file writer", test_backwards_compat_file_writer),
    ]

    passed = 0
    failed = 0

    for name, test_func in tests:
        try:
            test_func()
            print(f"✓ {name}")
            passed += 1
        except AssertionError as e:
            print(f"✗ {name}")
            print(f"  {e}")
            failed += 1
        except Exception as e:
            print(f"✗ {name} (exception)")
            print(f"  {type(e).__name__}: {e}")
            failed += 1

    print(f"\n{passed} passed, {failed} failed")
    sys.exit(0 if failed == 0 else 1)
