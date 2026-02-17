#!/usr/bin/env python3
"""Test that existing models are unaffected by dedup removal."""

import os
import sys

# Add parent directory to path so we can import from the-snake-tank
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "the-snake-tank"))


def test_train_model_import():
    """Verify train_model can be imported without errors."""
    try:
        import train_model
        print("✓ train_model imported successfully")
    except ImportError as e:
        raise AssertionError(f"Failed to import train_model: {e}")


def test_feature_cols_unchanged():
    """Verify FEATURE_COLS and SIMPLE_FEATURE_COLS are unchanged."""
    import train_model

    # Expected feature columns (current implementation)
    expected_feature_cols = [
        "temp_indoor", "temp_outdoor", "co2", "humidity_indoor",
        "humidity_outdoor", "noise", "pressure", "pressure_absolute",
        "temp_indoor_min", "temp_indoor_max", "temp_outdoor_min", "temp_outdoor_max",
        "hours_since_min_temp_indoor", "hours_since_max_temp_indoor",
        "hours_since_min_temp_outdoor", "hours_since_max_temp_outdoor",
        "temp_trend", "pressure_trend", "temp_outdoor_trend",
        "wifi_status", "battery_percent", "rf_status",
    ]

    expected_simple_cols = [
        "temp_indoor", "temp_outdoor", "co2", "humidity_indoor",
        "humidity_outdoor", "noise", "pressure",
        "temp_trend", "pressure_trend",
    ]

    assert hasattr(train_model, 'FEATURE_COLS'), "FEATURE_COLS not found"
    assert hasattr(train_model, 'SIMPLE_FEATURE_COLS'), "SIMPLE_FEATURE_COLS not found"

    assert train_model.FEATURE_COLS == expected_feature_cols, \
        f"FEATURE_COLS changed: expected {expected_feature_cols}, got {train_model.FEATURE_COLS}"

    assert train_model.SIMPLE_FEATURE_COLS == expected_simple_cols, \
        f"SIMPLE_FEATURE_COLS changed: expected {expected_simple_cols}, got {train_model.SIMPLE_FEATURE_COLS}"

    print(f"✓ FEATURE_COLS unchanged: {len(train_model.FEATURE_COLS)} features")
    print(f"✓ SIMPLE_FEATURE_COLS unchanged: {len(train_model.SIMPLE_FEATURE_COLS)} features")


def test_max_gap_unchanged():
    """Verify MAX_GAP = 7200 (2-hour gaps allowed for 20-min intervals)."""
    import train_model

    assert hasattr(train_model, 'MAX_GAP'), "MAX_GAP not found"
    assert train_model.MAX_GAP == 7200, \
        f"MAX_GAP changed: expected 7200, got {train_model.MAX_GAP}"

    print(f"✓ MAX_GAP unchanged: {train_model.MAX_GAP} seconds (2 hours)")


if __name__ == "__main__":
    test_train_model_import()
    test_feature_cols_unchanged()
    test_max_gap_unchanged()
    print("\nAll model integrity tests passed!")
