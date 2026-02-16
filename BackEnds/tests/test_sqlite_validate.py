#!/usr/bin/env python3
"""Tests for SQLite integration in validate_prediction.py

Verifies that:
1. prediction_history table schema is correct
2. DB-first prediction lookup works
3. validate() handles both file paths and data dicts
4. Dual-write: both JSON and DB receive validation results
5. INSERT OR IGNORE prevents duplicate (model_type, for_hour) pairs
"""

import json
import os
import sqlite3
import sys
import tempfile
from datetime import datetime, timezone, timedelta

# Add the-snake-tank directory to path to import validate_prediction
backend_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
snake_tank_dir = os.path.join(backend_root, 'the-snake-tank')
sys.path.insert(0, snake_tank_dir)
import validate_prediction


def test_table_schema_constants_exist():
    """Verify both table schema constants are defined."""
    assert hasattr(validate_prediction, 'PREDICTION_HISTORY_TABLE_SQL')
    assert hasattr(validate_prediction, 'PREDICTIONS_TABLE_SQL')
    assert 'CREATE TABLE' in validate_prediction.PREDICTION_HISTORY_TABLE_SQL
    assert 'CREATE TABLE' in validate_prediction.PREDICTIONS_TABLE_SQL


def test_db_first_prediction_lookup_function_exists():
    """Verify _find_best_predictions_from_db() function exists."""
    assert hasattr(validate_prediction, '_find_best_predictions_from_db')
    assert callable(validate_prediction._find_best_predictions_from_db)


def test_validate_handles_both_str_and_dict():
    """Verify validate() handles both file paths (str) and data dicts."""
    # This is a code inspection test - verify the isinstance check exists
    import inspect
    source = inspect.getsource(validate_prediction.validate)
    assert 'isinstance(prediction_data, str)' in source
    assert 'load_prediction' in source


def test_prediction_history_table_schema():
    """Verify prediction_history table exists with correct schema in real DB."""
    db_path = validate_prediction.DB_PATH

    # Table should exist after running validation at least once
    # If it doesn't exist yet, create it to verify the schema
    conn = sqlite3.connect(db_path)
    conn.execute(validate_prediction.PREDICTION_HISTORY_TABLE_SQL)
    conn.commit()

    # Check schema
    schema = conn.execute("PRAGMA table_info(prediction_history)").fetchall()
    column_names = [col[1] for col in schema]

    expected_columns = [
        'id', 'predicted_at', 'for_hour', 'model_type', 'model_version',
        'predicted_indoor', 'predicted_outdoor',
        'actual_indoor', 'actual_outdoor',
        'error_indoor', 'error_outdoor'
    ]

    for col in expected_columns:
        assert col in column_names, f"Column {col} missing from prediction_history table"

    # Check UNIQUE constraint exists
    table_sql = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='prediction_history'"
    ).fetchone()[0]
    assert 'UNIQUE(model_type, for_hour)' in table_sql or 'UNIQUE (model_type, for_hour)' in table_sql

    conn.close()
    print("✓ prediction_history table schema correct")


def test_dual_write_json_and_db():
    """Verify that validation writes to both JSON file and DB table."""
    with tempfile.TemporaryDirectory() as tmpdir:
        # Create test DB with readings and predictions tables
        test_db = os.path.join(tmpdir, 'test_weather.db')
        conn = sqlite3.connect(test_db)

        # Create readings table with a recent reading
        conn.execute("""CREATE TABLE readings (
            timestamp INTEGER PRIMARY KEY,
            temp_indoor REAL,
            temp_outdoor REAL
        )""")

        now_ts = int(datetime.now(timezone.utc).timestamp())
        conn.execute("INSERT INTO readings VALUES (?, 20.5, 15.2)", (now_ts,))

        # Create predictions table with a prediction ~60 min ago
        conn.execute(validate_prediction.PREDICTIONS_TABLE_SQL)
        past_time = (datetime.now(timezone.utc) - timedelta(minutes=60))
        for_hour = (past_time + timedelta(hours=1))

        conn.execute("""INSERT INTO predictions
            (generated_at, model_type, model_version, for_hour,
             temp_indoor_predicted, temp_outdoor_predicted,
             last_reading_ts, last_reading_temp_indoor, last_reading_temp_outdoor)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (past_time.strftime("%Y-%m-%dT%H:%M:%SZ"),
             'test_model', 1, for_hour.strftime("%Y-%m-%dT%H:%M:%SZ"),
             21.0, 16.0,
             now_ts - 3600, 20.0, 15.0))

        # Create prediction_history table
        conn.execute(validate_prediction.PREDICTION_HISTORY_TABLE_SQL)
        conn.commit()
        conn.close()

        # Temporarily override DB_PATH
        original_db_path = validate_prediction.DB_PATH
        validate_prediction.DB_PATH = test_db

        try:
            # Create test history JSON
            history_json = os.path.join(tmpdir, 'history.json')

            # Create prediction data dict (simulating DB lookup)
            prediction_data = {
                "generated_at": past_time.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "model_type": "test_model",
                "model_version": 1,
                "last_reading": {
                    "timestamp": now_ts - 3600,
                    "temp_indoor": 20.0,
                    "temp_outdoor": 15.0,
                },
                "prediction": {
                    "prediction_for": for_hour.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "temp_indoor": 21.0,
                    "temp_outdoor": 16.0,
                },
            }

            # Run validation
            validate_prediction.validate([prediction_data], history_json)

            # Check JSON file was written
            assert os.path.exists(history_json), "JSON history file not created"
            with open(history_json) as f:
                json_data = json.load(f)
            assert len(json_data) == 1, "JSON history should have 1 entry"
            assert json_data[0]['model_type'] == 'test_model'

            # Check DB table was written
            conn = sqlite3.connect(test_db)
            rows = conn.execute("SELECT * FROM prediction_history WHERE model_type='test_model'").fetchall()
            assert len(rows) == 1, "DB prediction_history should have 1 entry"
            conn.close()

            print("✓ Dual-write to JSON and DB works")

        finally:
            validate_prediction.DB_PATH = original_db_path


def test_insert_or_ignore_prevents_duplicates():
    """Verify INSERT OR IGNORE prevents duplicate (model_type, for_hour) pairs."""
    with tempfile.TemporaryDirectory() as tmpdir:
        test_db = os.path.join(tmpdir, 'test_weather.db')
        conn = sqlite3.connect(test_db)

        # Create table
        conn.execute(validate_prediction.PREDICTION_HISTORY_TABLE_SQL)

        # Insert first entry
        now = datetime.now(timezone.utc)
        for_hour = now.strftime("%Y-%m-%dT%H:%M:%SZ")

        conn.execute("""INSERT INTO prediction_history
            (predicted_at, for_hour, model_type, model_version,
             predicted_indoor, predicted_outdoor,
             actual_indoor, actual_outdoor,
             error_indoor, error_outdoor)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (now.strftime("%Y-%m-%dT%H:%M:%SZ"), for_hour, 'simple', 1,
             20.0, 15.0, 20.5, 15.2, 0.5, 0.2))

        # Try to insert duplicate (same model_type and for_hour)
        conn.execute("""INSERT OR IGNORE INTO prediction_history
            (predicted_at, for_hour, model_type, model_version,
             predicted_indoor, predicted_outdoor,
             actual_indoor, actual_outdoor,
             error_indoor, error_outdoor)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (now.strftime("%Y-%m-%dT%H:%M:%SZ"), for_hour, 'simple', 1,
             21.0, 16.0, 21.5, 16.2, 0.5, 0.2))

        conn.commit()

        # Should only have 1 row (duplicate ignored)
        rows = conn.execute("SELECT * FROM prediction_history").fetchall()
        assert len(rows) == 1, "Duplicate entry was not ignored"

        # First values should be preserved
        assert rows[0][5] == 20.0, "First entry was overwritten"

        conn.close()
        print("✓ INSERT OR IGNORE prevents duplicates")


def test_db_first_fallback_to_file_scanning():
    """Verify find_best_predictions() tries DB first, falls back to files."""
    # This is a code inspection test
    import inspect
    source = inspect.getsource(validate_prediction.find_best_predictions)
    assert '_find_best_predictions_from_db()' in source
    assert 'db_results' in source
    assert 'if db_results:' in source or 'if db_results' in source
    assert 'return db_results' in source
    print("✓ DB-first with file fallback verified in code")


if __name__ == '__main__':
    # Run tests
    test_table_schema_constants_exist()
    test_db_first_prediction_lookup_function_exists()
    test_validate_handles_both_str_and_dict()
    test_prediction_history_table_schema()
    test_dual_write_json_and_db()
    test_insert_or_ignore_prevents_duplicates()
    test_db_first_fallback_to_file_scanning()

    print("\n✅ All tests passed!")
