"""Tests for GB model enriched spatial features."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'the-snake-tank'))

import pytest
from datetime import datetime, timezone
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


def test_get_features_for_timestamp_returns_enriched_columns(public_station_db):
    """Test _get_features_for_timestamp returns enriched columns."""
    timestamp = datetime(2020, 1, 1, 12, tzinfo=timezone.utc).timestamp()
    with public_station_db.cursor() as cur:
        result = _get_features_for_timestamp(cur, timestamp, 20.0)
    assert result == {col: 0.0 for col in SPATIAL_COLS_ENRICHED}


@pytest.mark.parametrize("has_table", [True, False])
def test_add_spatial_columns_adds_enriched_columns(public_station_db, has_table):
    """Test add_spatial_columns adds enriched columns."""
    import pandas as pd

    # Create minimal DataFrame
    df = pd.DataFrame({
        'timestamp': [datetime(2020, 1, 1, 12, tzinfo=timezone.utc).timestamp()],
        'temp_outdoor': [20.0]
    })

    if not has_table:
        with public_station_db.cursor() as cur:
            cur.execute("DROP TABLE public_stations")

    result = add_spatial_columns(df)
    for col in SPATIAL_COLS_ENRICHED:
        assert col in result.columns, f"Missing column: {col}"
        assert (result[col] == 0.0).all()


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
