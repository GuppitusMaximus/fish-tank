#!/usr/bin/env python3
"""Test multi-model data export v2 schema.

Tests for the v2 weather.json format with multi-model predictions,
property metadata, and structured current readings.
"""

import json
import os
import subprocess
import sys
import tempfile

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(SCRIPT_DIR)
SNAKE_TANK_DIR = os.path.join(BACKEND_DIR, "the-snake-tank")


def run_export():
    """Run export_weather.py and return the parsed JSON output."""
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
        output_path = f.name

    try:
        subprocess.run(
            [sys.executable, "export_weather.py", "--output", output_path],
            cwd=SNAKE_TANK_DIR,
            check=True,
            capture_output=True,
        )
        with open(output_path) as f:
            return json.load(f)
    finally:
        if os.path.exists(output_path):
            os.unlink(output_path)


def test_schema_version():
    """Test 1: weather.json has schema_version = 2."""
    data = run_export()
    assert "schema_version" in data, "Missing schema_version field"
    assert data["schema_version"] == 2, f"Expected schema_version=2, got {data['schema_version']}"
    print("✓ Test 1: schema_version = 2")


def test_property_meta():
    """Test 1 (cont): property_meta structure."""
    data = run_export()
    assert "property_meta" in data, "Missing property_meta field"
    meta = data["property_meta"]

    for prop in ["temp_indoor", "temp_outdoor"]:
        assert prop in meta, f"Missing property_meta entry for {prop}"
        entry = meta[prop]
        assert "label" in entry, f"Missing 'label' in property_meta.{prop}"
        assert "unit" in entry, f"Missing 'unit' in property_meta.{prop}"
        assert "format" in entry, f"Missing 'format' in property_meta.{prop}"

    print("✓ Test 1: property_meta structure correct")


def test_current_structure():
    """Test 1 (cont): current object structure."""
    data = run_export()
    assert "current" in data, "Missing current field"
    current = data["current"]

    assert current is not None, "current is null"
    assert "timestamp" in current, "Missing timestamp in current"
    assert isinstance(current["timestamp"], str), "timestamp is not a string"
    assert "readings" in current, "Missing readings in current"
    assert isinstance(current["readings"], dict), "readings is not an object"

    readings = current["readings"]
    assert "temp_indoor" in readings, "Missing temp_indoor in current.readings"
    assert "temp_outdoor" in readings, "Missing temp_outdoor in current.readings"
    assert isinstance(readings["temp_indoor"], (int, float)), "temp_indoor is not numeric"
    assert isinstance(readings["temp_outdoor"], (int, float)), "temp_outdoor is not numeric"

    print("✓ Test 1: current structure correct")


def test_predictions_structure():
    """Test 2: Predictions array structure."""
    data = run_export()
    assert "predictions" in data, "Missing predictions field"
    assert isinstance(data["predictions"], list), "predictions is not an array"

    if data["predictions"]:
        seen_models = set()
        for pred in data["predictions"]:
            assert "model_type" in pred, "Missing model_type in prediction"
            assert isinstance(pred["model_type"], str), "model_type is not a string"
            assert "model_version" in pred, "Missing model_version in prediction"
            assert isinstance(pred["model_version"], int), "model_version is not an int"
            assert "prediction_for" in pred, "Missing prediction_for in prediction"
            assert isinstance(pred["prediction_for"], str), "prediction_for is not a string"
            assert "values" in pred, "Missing values in prediction"
            assert isinstance(pred["values"], dict), "values is not an object"

            values = pred["values"]
            assert "temp_indoor" in values, "Missing temp_indoor in prediction.values"
            assert "temp_outdoor" in values, "Missing temp_outdoor in prediction.values"
            assert isinstance(values["temp_indoor"], (int, float)), "temp_indoor not numeric"
            assert isinstance(values["temp_outdoor"], (int, float)), "temp_outdoor not numeric"

            # Check for duplicates
            model_type = pred["model_type"]
            assert model_type not in seen_models, f"Duplicate model_type '{model_type}' in predictions"
            seen_models.add(model_type)

    print("✓ Test 2: predictions array structure correct")


def test_next_prediction_compat():
    """Test 3: next_prediction backwards compatibility."""
    data = run_export()
    assert "next_prediction" in data, "Missing next_prediction field"

    if data["next_prediction"]:
        np = data["next_prediction"]
        assert "temp_indoor" in np, "Missing temp_indoor in next_prediction"
        assert "temp_outdoor" in np, "Missing temp_outdoor in next_prediction"
        assert "model_version" in np, "Missing model_version in next_prediction"
        assert "model_type" in np, "Missing model_type in next_prediction"
        assert "prediction_for" in np, "Missing prediction_for in next_prediction"

        # Must NOT have nested values object
        assert "values" not in np, "next_prediction should not have nested 'values' object"

        # Flat fields should be numeric
        assert isinstance(np["temp_indoor"], (int, float)), "temp_indoor not numeric"
        assert isinstance(np["temp_outdoor"], (int, float)), "temp_outdoor not numeric"

        # Values should match first prediction
        if data["predictions"]:
            first = data["predictions"][0]
            assert np["temp_indoor"] == first["values"]["temp_indoor"], \
                "next_prediction temp_indoor doesn't match first prediction"
            assert np["temp_outdoor"] == first["values"]["temp_outdoor"], \
                "next_prediction temp_outdoor doesn't match first prediction"
            assert np["prediction_for"] == first["prediction_for"], \
                "next_prediction prediction_for doesn't match first prediction"

    print("✓ Test 3: next_prediction backwards compatibility correct")


def test_history_model_metadata():
    """Test 4: History entries have model metadata."""
    data = run_export()
    assert "history" in data, "Missing history field"
    assert isinstance(data["history"], list), "history is not an array"

    if data["history"]:
        for entry in data["history"]:
            assert "model_type" in entry, "Missing model_type in history entry"
            assert "model_version" in entry, "Missing model_version in history entry"

            # Flat structure (no nested actual/predicted objects)
            assert "actual_indoor" in entry, "Missing actual_indoor"
            assert "predicted_indoor" in entry, "Missing predicted_indoor"
            assert "delta_indoor" in entry, "Missing delta_indoor"
            assert "actual_outdoor" in entry, "Missing actual_outdoor"
            assert "predicted_outdoor" in entry, "Missing predicted_outdoor"
            assert "delta_outdoor" in entry, "Missing delta_outdoor"

            # Should NOT use nested format
            assert "actual" not in entry or not isinstance(entry.get("actual"), dict), \
                "history should not have nested 'actual' object"
            assert "predicted" not in entry or not isinstance(entry.get("predicted"), dict), \
                "history should not have nested 'predicted' object"

    print("✓ Test 4: history entries have model metadata and flat structure")


if __name__ == "__main__":
    try:
        test_schema_version()
        test_property_meta()
        test_current_structure()
        test_predictions_structure()
        test_next_prediction_compat()
        test_history_model_metadata()
        print("\n✅ All export schema tests passed")
    except AssertionError as e:
        print(f"\n❌ Test failed: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        sys.exit(1)
