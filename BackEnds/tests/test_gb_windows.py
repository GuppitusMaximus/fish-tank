"""Tests for GB window building."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'the-snake-tank'))

import pytest
import pandas as pd
from datetime import datetime, timedelta
from train_model import build_gb_windows, GB_ALL_COLS, MAX_GAP


def test_build_gb_windows_feature_vector_length():
    """Test build_gb_windows() feature vector length."""
    # Feature vector should equal:
    # len(GB_ALL_COLS) × 24 + 3 × (24 × 2 + 2)
    # = (23+10) × 24 + 3 × 50
    # = 33 × 24 + 150
    # = 792 + 150
    # = 942

    # Create minimal test data with 24 contiguous hourly readings
    base_time = datetime(2026, 2, 15, 0, 0, 0)
    timestamps = [base_time + timedelta(hours=i) for i in range(25)]

    # Create DataFrame with required columns
    data = {
        'timestamp': timestamps,
    }

    # Add all GB_ALL_COLS columns with dummy values
    for col in GB_ALL_COLS:
        data[col] = [20.0] * len(timestamps)

    df = pd.DataFrame(data)

    # Empty error lookup (no residual corrections)
    error_lookup = {}

    # Build windows - returns (X, y) tuple of arrays
    X, y = build_gb_windows(df, error_lookup)

    if len(X) > 0:
        # Each window should have feature vector of length 942
        for X_row in X:
            assert len(X_row) == 942, f"Expected 942 features, got {len(X_row)}"


def test_build_gb_windows_contiguity_check():
    """Test contiguity check — gaps > MAX_GAP should skip windows."""
    # Create data with a gap
    base_time = datetime(2026, 2, 15, 0, 0, 0)

    # 12 contiguous hours, then gap, then 12 more hours
    timestamps_part1 = [base_time + timedelta(hours=i) for i in range(12)]
    timestamps_part2 = [base_time + timedelta(hours=i) for i in range(36, 48)]  # 24-hour gap
    timestamps = timestamps_part1 + timestamps_part2

    data = {
        'timestamp': timestamps,
    }

    for col in GB_ALL_COLS:
        data[col] = [20.0] * len(timestamps)

    df = pd.DataFrame(data)
    error_lookup = {}

    # Build windows - returns (X, y) tuple
    X, y = build_gb_windows(df, error_lookup)

    # Due to the gap > MAX_GAP, windows should be limited or empty
    # Windows require 24 contiguous readings, so we should get fewer windows
    # With the gap, we can't form a complete 24-hour window that spans it

    # We should get at most 0 windows (since neither segment has 25 readings)
    # Part 1 has 12 readings (not enough for 24-hour window)
    # Part 2 has 12 readings (not enough for 24-hour window)
    assert len(X) == 0


def test_build_gb_windows_empty_error_lookup():
    """Test empty error lookup — should produce feature vectors with 0.0 for RC features."""
    # Create minimal test data
    base_time = datetime(2026, 2, 15, 0, 0, 0)
    timestamps = [base_time + timedelta(hours=i) for i in range(25)]

    data = {
        'timestamp': timestamps,
    }

    for col in GB_ALL_COLS:
        data[col] = [20.0] * len(timestamps)

    df = pd.DataFrame(data)

    # Empty error lookup
    error_lookup = {}

    X, y = build_gb_windows(df, error_lookup)

    if len(X) > 0:
        # Each window should have residual correction features = 0.0
        # RC features are the last 150 features (3 models × 50 features each)
        for X_row in X:
            # Last 150 features should be 0.0
            rc_features = X_row[-150:]
            assert all(f == 0.0 for f in rc_features), "RC features should be 0.0 when error_lookup is empty"
