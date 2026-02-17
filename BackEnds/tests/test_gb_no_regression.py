"""Tests for zero impact on existing models."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'the-snake-tank'))

import pytest
from train_model import (
    MODEL_PATH,
    SIMPLE_MODEL_PATH,
    RC_MODEL_PATH,
    FEATURE_COLS,
    FULL_ALL_COLS,
    SIMPLE_ALL_COLS
)
from public_features import SPATIAL_COLS_FULL, SPATIAL_COLS_SIMPLE


def test_existing_model_paths_unchanged():
    """Test existing model paths unchanged."""
    # Verify the paths are as expected
    assert MODEL_PATH is not None
    assert SIMPLE_MODEL_PATH is not None
    assert RC_MODEL_PATH is not None

    # Verify they point to the original model files
    assert 'temp_predictor.joblib' in MODEL_PATH
    assert 'temp_predictor_simple.joblib' in SIMPLE_MODEL_PATH
    assert 'temp_predictor_6hr_rc.joblib' in RC_MODEL_PATH

    # Verify GB model path is separate
    from train_model import GB_MODEL_PATH
    assert GB_MODEL_PATH is not None
    assert 'temp_predictor_gb.joblib' in GB_MODEL_PATH
    assert GB_MODEL_PATH != MODEL_PATH
    assert GB_MODEL_PATH != SIMPLE_MODEL_PATH
    assert GB_MODEL_PATH != RC_MODEL_PATH


def test_existing_feature_cols_unchanged():
    """Test existing FEATURE_COLS unchanged — exactly 22 items."""
    assert len(FEATURE_COLS) == 22

    # Verify the expected base feature columns (actual columns from implementation)
    expected_features = [
        "temp_indoor", "temp_outdoor", "co2", "humidity_indoor",
        "humidity_outdoor", "noise", "pressure", "pressure_absolute",
        "temp_indoor_min", "temp_indoor_max", "temp_outdoor_min", "temp_outdoor_max",
        "hours_since_min_temp_indoor", "hours_since_max_temp_indoor",
        "hours_since_min_temp_outdoor", "hours_since_max_temp_outdoor",
        "temp_trend", "pressure_trend", "temp_outdoor_trend",
        "wifi_status", "battery_percent", "rf_status",
    ]

    assert set(FEATURE_COLS) == set(expected_features)


def test_existing_spatial_cols_full_unchanged():
    """Test existing SPATIAL_COLS_FULL unchanged — exactly 6 items."""
    assert len(SPATIAL_COLS_FULL) == 6

    expected_spatial_full = [
        "regional_avg_temp",
        "regional_temp_delta",
        "regional_temp_spread",
        "regional_avg_humidity",
        "regional_avg_pressure",
        "regional_station_count",
    ]

    assert SPATIAL_COLS_FULL == expected_spatial_full


def test_existing_spatial_cols_simple_unchanged():
    """Test existing SPATIAL_COLS_SIMPLE unchanged — exactly 3 items."""
    assert len(SPATIAL_COLS_SIMPLE) == 3

    expected_spatial_simple = [
        "regional_avg_temp",
        "regional_temp_delta",
        "regional_station_count",
    ]

    assert SPATIAL_COLS_SIMPLE == expected_spatial_simple


def test_existing_combined_cols_unchanged():
    """Test FULL_ALL_COLS and SIMPLE_ALL_COLS unchanged."""
    # Import SIMPLE_FEATURE_COLS from train_model
    from train_model import SIMPLE_FEATURE_COLS

    # FULL_ALL_COLS should be FEATURE_COLS + SPATIAL_COLS_FULL
    assert len(FULL_ALL_COLS) == len(FEATURE_COLS) + len(SPATIAL_COLS_FULL)
    assert len(FULL_ALL_COLS) == 22 + 6
    assert len(FULL_ALL_COLS) == 28

    # SIMPLE_ALL_COLS should be SIMPLE_FEATURE_COLS + SPATIAL_COLS_SIMPLE
    assert len(SIMPLE_ALL_COLS) == len(SIMPLE_FEATURE_COLS) + len(SPATIAL_COLS_SIMPLE)
    assert len(SIMPLE_ALL_COLS) == 9 + 3
    assert len(SIMPLE_ALL_COLS) == 12

    # Verify FULL_ALL_COLS contains the expected columns
    for col in FEATURE_COLS:
        assert col in FULL_ALL_COLS

    for col in SPATIAL_COLS_FULL:
        assert col in FULL_ALL_COLS

    # Verify SIMPLE_ALL_COLS contains the expected columns
    for col in SIMPLE_FEATURE_COLS:
        assert col in SIMPLE_ALL_COLS

    for col in SPATIAL_COLS_SIMPLE:
        assert col in SIMPLE_ALL_COLS
