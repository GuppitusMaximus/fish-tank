#!/usr/bin/env python3
"""Test SQLite-first reads in export_weather.py

Verifies that export_weather.py correctly reads from DB first and falls back to
file-based scanning when DB data is unavailable.
"""

import json
import os
import sys
import tempfile

# Add the-snake-tank to path so we can import export_weather
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../the-snake-tank"))
import export_weather


def test_sqlite3_imported():
    """Verify that sqlite3 is imported."""
    assert hasattr(export_weather, 'sqlite3'), "sqlite3 not imported"


def test_db_path_defined():
    """Verify that DB_PATH constant is defined."""
    assert hasattr(export_weather, 'DB_PATH'), "DB_PATH not defined"
    assert export_weather.DB_PATH.endswith('weather.db'), f"DB_PATH unexpected: {export_weather.DB_PATH}"


def test_table_sql_constants_exist():
    """Verify that table SQL constants are defined."""
    assert hasattr(export_weather, 'PREDICTIONS_TABLE_SQL'), "PREDICTIONS_TABLE_SQL not defined"
    assert hasattr(export_weather, 'PREDICTION_HISTORY_TABLE_SQL'), "PREDICTION_HISTORY_TABLE_SQL not defined"
    assert 'CREATE TABLE IF NOT EXISTS predictions' in export_weather.PREDICTIONS_TABLE_SQL
    assert 'CREATE TABLE IF NOT EXISTS prediction_history' in export_weather.PREDICTION_HISTORY_TABLE_SQL


def test_db_helper_functions_exist():
    """Verify that DB helper functions exist."""
    assert hasattr(export_weather, '_find_predictions_for_hour_from_db'), "_find_predictions_for_hour_from_db missing"
    assert callable(export_weather._find_predictions_for_hour_from_db)
    assert hasattr(export_weather, '_load_validated_history_from_db'), "_load_validated_history_from_db missing"
    assert callable(export_weather._load_validated_history_from_db)


def test_predictions_db_first():
    """Verify _find_predictions_for_hour calls DB helper first."""
    # Read the function source to check that it calls the DB helper
    import inspect
    source = inspect.getsource(export_weather._find_predictions_for_hour)
    assert '_find_predictions_for_hour_from_db' in source, "_find_predictions_for_hour doesn't call DB helper"
    # Verify fallback behavior: if DB returns None, it should scan files
    assert 'if db_results:' in source or 'if not db_results:' in source, "DB fallback logic missing"


def test_history_db_first():
    """Verify load_validated_history calls DB helper first."""
    import inspect
    source = inspect.getsource(export_weather.load_validated_history)
    assert '_load_validated_history_from_db' in source, "load_validated_history doesn't call DB helper"
    assert 'if db_history:' in source or 'if not db_history:' in source, "DB fallback logic missing"


def test_db_fallback_returns_none_for_nonexistent_data():
    """Test that DB helpers return None when data doesn't exist."""
    # Test with a date that definitely doesn't exist
    result = export_weather._find_predictions_for_hour_from_db('2020-01-01', 0)
    assert result is None, f"Expected None for nonexistent date, got {result}"

    # Test with very old cutoff that should have no history
    result = export_weather._load_validated_history_from_db(24)
    # Should return None or an empty list if DB is empty
    assert result is None or result == [], f"Expected None or [], got {result}"


def test_export_output_format():
    """Verify that export() produces schema_version 2 with correct structure."""
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as tmp:
        tmp_path = tmp.name

    try:
        export_weather.export(tmp_path, hours=24)

        with open(tmp_path) as f:
            data = json.load(f)

        # Verify schema version unchanged
        assert data.get('schema_version') == 2, f"schema_version changed: {data.get('schema_version')}"

        # Verify required top-level keys
        assert 'generated_at' in data
        assert 'property_meta' in data
        assert 'current' in data
        assert 'predictions' in data
        assert 'history' in data
        assert 'next_prediction' in data

        # Verify predictions is a list
        assert isinstance(data['predictions'], list), "predictions not a list"

        # Verify history is a list
        assert isinstance(data['history'], list), "history not a list"

        # If predictions exist, verify structure
        if data['predictions']:
            pred = data['predictions'][0]
            assert 'model_type' in pred
            assert 'model_version' in pred
            assert 'prediction_for' in pred
            assert 'values' in pred
            assert 'temp_indoor' in pred['values']
            assert 'temp_outdoor' in pred['values']

        # If history exists, verify structure
        if data['history']:
            hist = data['history'][0]
            assert 'date' in hist
            assert 'hour' in hist
            assert 'actual_indoor' in hist
            assert 'actual_outdoor' in hist
            assert 'predicted_indoor' in hist
            assert 'predicted_outdoor' in hist
            assert 'delta_indoor' in hist
            assert 'delta_outdoor' in hist

    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
        # Clean up manifest if created
        manifest_path = os.path.join(os.path.dirname(tmp_path), "data-index.json")
        if os.path.exists(manifest_path):
            os.unlink(manifest_path)


def test_db_prediction_helper_returns_correct_format():
    """Verify _find_predictions_for_hour_from_db returns expected dict format."""
    # Test with current date to possibly get real data
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    date_str = now.strftime("%Y-%m-%d")
    hour = now.hour

    result = export_weather._find_predictions_for_hour_from_db(date_str, hour)

    # If DB has data, verify format
    if result is not None:
        assert isinstance(result, list), f"Expected list, got {type(result)}"
        if result:
            pred = result[0]
            assert 'model_type' in pred, "model_type missing from DB result"
            assert 'model_version' in pred, "model_version missing from DB result"
            assert 'generated_at' in pred, "generated_at missing from DB result"
            assert 'prediction' in pred, "prediction missing from DB result"
            assert 'prediction_for' in pred['prediction'], "prediction_for missing"
            assert 'temp_indoor' in pred['prediction'], "temp_indoor missing"
            assert 'temp_outdoor' in pred['prediction'], "temp_outdoor missing"


def test_db_history_helper_returns_correct_format():
    """Verify _load_validated_history_from_db returns expected dict format."""
    result = export_weather._load_validated_history_from_db(24)

    # If DB has data, verify format
    if result is not None and result:
        hist = result[0]
        assert 'date' in hist, "date missing from DB history"
        assert 'hour' in hist, "hour missing from DB history"
        assert 'actual_indoor' in hist, "actual_indoor missing"
        assert 'actual_outdoor' in hist, "actual_outdoor missing"
        assert 'predicted_indoor' in hist, "predicted_indoor missing"
        assert 'predicted_outdoor' in hist, "predicted_outdoor missing"
        assert 'delta_indoor' in hist, "delta_indoor missing"
        assert 'delta_outdoor' in hist, "delta_outdoor missing"
        assert 'timestamp' in hist, "timestamp missing"

        # Verify delta calculation is correct
        expected_delta_indoor = round(hist['actual_indoor'] - hist['predicted_indoor'], 1)
        expected_delta_outdoor = round(hist['actual_outdoor'] - hist['predicted_outdoor'], 1)
        assert hist['delta_indoor'] == expected_delta_indoor, \
            f"delta_indoor calculation wrong: {hist['delta_indoor']} != {expected_delta_indoor}"
        assert hist['delta_outdoor'] == expected_delta_outdoor, \
            f"delta_outdoor calculation wrong: {hist['delta_outdoor']} != {expected_delta_outdoor}"


if __name__ == "__main__":
    # Run tests manually
    import traceback

    tests = [
        test_sqlite3_imported,
        test_db_path_defined,
        test_table_sql_constants_exist,
        test_db_helper_functions_exist,
        test_predictions_db_first,
        test_history_db_first,
        test_db_fallback_returns_none_for_nonexistent_data,
        test_export_output_format,
        test_db_prediction_helper_returns_correct_format,
        test_db_history_helper_returns_correct_format,
    ]

    passed = 0
    failed = 0

    for test in tests:
        try:
            test()
            print(f"✓ {test.__name__}")
            passed += 1
        except AssertionError as e:
            print(f"✗ {test.__name__}: {e}")
            failed += 1
        except Exception as e:
            print(f"✗ {test.__name__}: {type(e).__name__}: {e}")
            traceback.print_exc()
            failed += 1

    print(f"\n{passed} passed, {failed} failed")
    sys.exit(0 if failed == 0 else 1)
