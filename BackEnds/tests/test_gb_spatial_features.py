"""Tests for GB model enriched spatial features."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'the-snake-tank'))

import pytest
from datetime import datetime
from public_features import (
    SPATIAL_COLS_ENRICHED,
    SPATIAL_COLS_FULL,
    SPATIAL_COLS_SIMPLE,
    _get_features_for_timestamp,
    add_spatial_columns
)


def test_spatial_cols_enriched_exists():
    """Test SPATIAL_COLS_ENRICHED exists and contains all 10 expected columns."""
    assert SPATIAL_COLS_ENRICHED is not None
    assert isinstance(SPATIAL_COLS_ENRICHED, list)
    assert len(SPATIAL_COLS_ENRICHED) == 10

    # Verify the 6 original columns from SPATIAL_COLS_FULL
    expected_full = [
        "regional_avg_temp",
        "regional_temp_delta",
        "regional_temp_spread",
        "regional_avg_humidity",
        "regional_avg_pressure",
        "regional_station_count",
    ]
    for col in expected_full:
        assert col in SPATIAL_COLS_ENRICHED, f"Missing original column: {col}"

    # Verify the 4 new enriched columns
    expected_enriched = [
        "regional_avg_rain_60min",
        "regional_avg_rain_24h",
        "regional_avg_wind_strength",
        "regional_avg_gust_strength",
    ]
    for col in expected_enriched:
        assert col in SPATIAL_COLS_ENRICHED, f"Missing enriched column: {col}"


def test_get_features_for_timestamp_returns_enriched_columns():
    """Test _get_features_for_timestamp returns enriched columns."""
    import sqlite3
    import tempfile

    # _get_features_for_timestamp requires a connection and temp_outdoor
    # Create a temporary database for testing
    with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as tmp:
        db_path = tmp.name

    try:
        conn = sqlite3.connect(db_path)
        # Create empty public_stations table
        conn.execute("""
            CREATE TABLE public_stations (
                temperature REAL, humidity REAL, pressure REAL,
                rain_60min REAL, rain_24h REAL, wind_strength REAL, gust_strength REAL,
                fetched_at TEXT
            )
        """)
        conn.commit()

        # Test with no data (should return defaults)
        timestamp = datetime(2020, 1, 1, 12, 0, 0).timestamp()
        result = _get_features_for_timestamp(conn, timestamp, 20.0)

        assert isinstance(result, dict)

        # Verify all enriched column keys are present
        assert "regional_avg_rain_60min" in result
        assert "regional_avg_rain_24h" in result
        assert "regional_avg_wind_strength" in result
        assert "regional_avg_gust_strength" in result

        # Verify original columns are still present
        assert "regional_avg_temp" in result
        assert "regional_avg_humidity" in result
        assert "regional_avg_pressure" in result

        conn.close()
    finally:
        import os
        os.unlink(db_path)


def test_add_spatial_columns_adds_enriched_columns():
    """Test add_spatial_columns adds enriched columns."""
    import pandas as pd
    import tempfile
    import sqlite3

    # Create minimal DataFrame
    df = pd.DataFrame({
        'timestamp': [datetime(2020, 1, 1, 12, 0, 0).timestamp()],
        'temp_outdoor': [20.0]
    })

    # Create a temporary database
    with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as tmp:
        db_path = tmp.name

    try:
        # Create empty database (no public_stations table)
        conn = sqlite3.connect(db_path)
        conn.close()

        # Add spatial columns
        result = add_spatial_columns(db_path, df)

        # Verify all SPATIAL_COLS_ENRICHED columns are present
        for col in SPATIAL_COLS_ENRICHED:
            assert col in result.columns, f"Missing column: {col}"

        # Verify values are present (even if zeros when no public station data)
        assert not result[SPATIAL_COLS_ENRICHED].isnull().all().all()
    finally:
        import os
        os.unlink(db_path)


def test_existing_spatial_column_lists_unchanged():
    """Test existing spatial column lists unchanged."""
    # SPATIAL_COLS_FULL should have exactly 6 items
    assert len(SPATIAL_COLS_FULL) == 6
    expected_full = [
        "regional_avg_temp",
        "regional_temp_delta",
        "regional_temp_spread",
        "regional_avg_humidity",
        "regional_avg_pressure",
        "regional_station_count",
    ]
    assert SPATIAL_COLS_FULL == expected_full

    # SPATIAL_COLS_SIMPLE should have exactly 3 items
    assert len(SPATIAL_COLS_SIMPLE) == 3
    expected_simple = [
        "regional_avg_temp",
        "regional_temp_delta",
        "regional_station_count",
    ]
    assert SPATIAL_COLS_SIMPLE == expected_simple
