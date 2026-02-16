#!/usr/bin/env python3
"""Test multi-model implementation code structure.

Tests for code-level implementation details: file discovery regex,
duplicate detection, history trimming, and atomic writes.
"""

import ast
import os
import re
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(SCRIPT_DIR)
SNAKE_TANK_DIR = os.path.join(BACKEND_DIR, "the-snake-tank")

EXPORT_PATH = os.path.join(SNAKE_TANK_DIR, "export_weather.py")
PREDICT_PATH = os.path.join(SNAKE_TANK_DIR, "predict.py")
VALIDATE_PATH = os.path.join(SNAKE_TANK_DIR, "validate_prediction.py")


def read_source(path):
    """Read Python source file."""
    with open(path) as f:
        return f.read()


def test_file_discovery_regex():
    """Test 7: _find_predictions_for_hour handles both filename formats."""
    source = read_source(EXPORT_PATH)

    # Check that _find_predictions_for_hour exists
    assert "_find_predictions_for_hour" in source, \
        "Missing _find_predictions_for_hour function in export_weather.py"

    # Look for regex patterns that match new format HHMMSS_modeltype.json
    # Check for the pattern with underscores in raw string format
    new_format_found = (r"(\d{4,6})_(\w+)\.json" in source or
                        r"\d{4,6}_\w+\.json" in source)
    assert new_format_found, "Missing regex pattern for new format HHMMSS_modeltype.json"

    # Look for regex patterns that match old format HHMMSS.json
    old_format_found = (r"(\d{4,6})\.json" in source or
                        r"\d{4,6}\.json" in source)
    assert old_format_found, "Missing regex pattern for old format HHMMSS.json"

    # Verify the function handles both formats
    func_start = source.find("def _find_predictions_for_hour(")
    func_end = source.find("\ndef ", func_start + 1)
    if func_end == -1:
        func_end = len(source)
    func_body = source[func_start:func_end]

    # Should have logic to extract model_type from filename or default to "3hrRaw"
    assert "model_type" in func_body, "Missing model_type extraction logic"
    assert '"3hrRaw"' in func_body or "'3hrRaw'" in func_body or '"simple"' in func_body or "'simple'" in func_body, \
        "Missing fallback to '3hrRaw' or 'simple' for old format"

    # Should deduplicate by model_type
    assert "latest_by_model" in func_body or "by_model" in func_body, \
        "Missing deduplication by model_type logic"

    # Should return empty list for missing directories
    assert "return []" in func_body, "Missing empty list return for missing directories"

    print("✓ Test 7: _find_predictions_for_hour handles both filename formats")


def test_duplicate_detection():
    """Test 8: validate_prediction.py checks duplicates by (model_type, for_hour)."""
    source = read_source(VALIDATE_PATH)

    # Find the duplicate check logic
    assert "model_type" in source, "Missing model_type in validation"
    assert "for_hour" in source, "Missing for_hour in validation"

    # Look for duplicate detection logic in validate_single or similar
    # Should check both model_type and for_hour
    validate_func = source[source.find("def validate_single("):] if "def validate_single(" in source else source

    # The duplicate check should compare both model_type and for_hour in a single condition
    # Look for the pattern where both are checked together with 'and'
    # Example: if (entry.get("model_type", ...) == model_type and entry.get("for_hour") == for_hour_str)

    # Check that the code has a condition checking both fields
    has_model_type_check = "model_type" in validate_func and "==" in validate_func
    has_for_hour_check = "for_hour" in validate_func and "==" in validate_func
    has_and_operator = " and " in validate_func or " and\n" in validate_func

    # Also verify the comment mentions checking for duplicates with model+hour
    has_duplicate_comment = "duplicate" in validate_func.lower() and "model" in validate_func.lower()

    assert has_model_type_check and has_for_hour_check and has_and_operator, \
        "Duplicate detection should check both model_type and for_hour together"

    print("✓ Test 8: Duplicate detection keys on (model_type, for_hour)")


def test_per_model_history_limit():
    """Test 9: validate_prediction.py trims history per model_type."""
    source = read_source(VALIDATE_PATH)

    # Check for MAX_HISTORY_PER_MODEL constant
    assert "MAX_HISTORY" in source, "Missing MAX_HISTORY constant"

    # Should have 168 as the per-model limit
    assert "168" in source, "Missing 168 value for per-model history limit"

    # Check for trim_history function that groups by model_type
    assert "def trim_history(" in source, "Missing trim_history function"

    trim_func_start = source.find("def trim_history(")
    trim_func_end = source.find("\ndef ", trim_func_start + 1)
    if trim_func_end == -1:
        trim_func_end = len(source)
    trim_func = source[trim_func_start:trim_func_end]

    # Should group entries by model_type
    assert "by_model" in trim_func or "defaultdict" in trim_func, \
        "trim_history should group entries by model_type"

    # Should use model_type as grouping key
    assert "model_type" in trim_func, "trim_history should use model_type for grouping"

    print("✓ Test 9: History trimming is per-model with MAX_HISTORY_PER_MODEL=168")


def test_atomic_writes():
    """Test 10: export_weather.py uses atomic writes."""
    source = read_source(EXPORT_PATH)

    # Check for tempfile.mkstemp usage
    assert "import tempfile" in source, "Missing tempfile import"
    assert "mkstemp" in source, "Missing tempfile.mkstemp call"

    # Check for os.replace usage
    assert "os.replace" in source, "Missing os.replace call for atomic write"

    # Find the export function
    export_func_start = source.find("def export(")
    export_func_end = source.find("\nif __name__", export_func_start)
    if export_func_end == -1:
        export_func_end = len(source)
    export_func = source[export_func_start:export_func_end]

    # Verify the atomic write pattern:
    # 1. Create temp file with mkstemp
    # 2. Write to temp file
    # 3. Replace target with os.replace
    assert "mkstemp" in export_func, "export should use mkstemp"
    assert "os.replace" in export_func, "export should use os.replace"
    assert "tmp" in export_func.lower(), "export should create temp file"

    print("✓ Test 10: Atomic writes using tempfile.mkstemp and os.replace")


def test_property_meta_constant():
    """Test 11: export_weather.py has PROPERTY_META constant."""
    source = read_source(EXPORT_PATH)

    # Check for PROPERTY_META constant at module level
    assert "PROPERTY_META" in source, "Missing PROPERTY_META constant"

    # Should be defined before any function (module level)
    property_meta_pos = source.find("PROPERTY_META")
    first_func_pos = source.find("def ")
    assert property_meta_pos < first_func_pos, \
        "PROPERTY_META should be defined at module level (before functions)"

    # Should contain temp_indoor and temp_outdoor
    # Extract the PROPERTY_META definition
    meta_start = source.find("PROPERTY_META")
    meta_end = source.find("\n}", meta_start) + 2  # Find closing brace
    meta_def = source[meta_start:meta_end]

    assert "temp_indoor" in meta_def, "PROPERTY_META missing temp_indoor"
    assert "temp_outdoor" in meta_def, "PROPERTY_META missing temp_outdoor"
    assert "label" in meta_def, "PROPERTY_META entries missing 'label' field"
    assert "unit" in meta_def, "PROPERTY_META entries missing 'unit' field"
    assert "format" in meta_def, "PROPERTY_META entries missing 'format' field"

    # Verify it's used in output (included as property_meta in weather.json)
    export_func = source[source.find("def export("):]
    assert "PROPERTY_META" in export_func, "PROPERTY_META should be used in export function"
    assert '"property_meta"' in export_func or "'property_meta'" in export_func, \
        "PROPERTY_META should be included in output as 'property_meta' key"

    print("✓ Test 11: PROPERTY_META constant defined and used")


def test_syntax_check():
    """Test 12: All modified files pass syntax check."""
    files_to_check = [
        (EXPORT_PATH, "export_weather.py"),
        (PREDICT_PATH, "predict.py"),
        (VALIDATE_PATH, "validate_prediction.py"),
    ]

    for path, name in files_to_check:
        try:
            with open(path) as f:
                source = f.read()
            ast.parse(source)
            print(f"  ✓ {name} syntax valid")
        except SyntaxError as e:
            raise AssertionError(f"{name} has syntax error: {e}")

    print("✓ Test 12: All files pass syntax check")


if __name__ == "__main__":
    try:
        test_file_discovery_regex()
        test_duplicate_detection()
        test_per_model_history_limit()
        test_atomic_writes()
        test_property_meta_constant()
        test_syntax_check()
        print("\n✅ All code structure tests passed")
    except AssertionError as e:
        print(f"\n❌ Test failed: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
