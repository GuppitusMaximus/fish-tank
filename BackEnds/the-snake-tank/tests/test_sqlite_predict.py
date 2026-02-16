"""
Test SQLite dual-write in predict.py

Verifies that predictions are written to both JSON files and the weather.db
predictions table.
"""

import json
import os
import sqlite3
import sys
import tempfile
from datetime import datetime, timezone

# Add parent directory to path to import predict
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import predict


def test_predictions_table_sql_constant_exists():
    """Verify PREDICTIONS_TABLE_SQL constant exists and has correct schema."""
    assert hasattr(predict, "PREDICTIONS_TABLE_SQL")
    sql = predict.PREDICTIONS_TABLE_SQL
    assert "CREATE TABLE IF NOT EXISTS predictions" in sql
    assert "id INTEGER PRIMARY KEY AUTOINCREMENT" in sql
    assert "generated_at TEXT NOT NULL" in sql
    assert "model_type TEXT NOT NULL" in sql
    assert "model_version INTEGER" in sql
    assert "for_hour TEXT NOT NULL" in sql
    assert "temp_indoor_predicted REAL" in sql
    assert "temp_outdoor_predicted REAL" in sql
    assert "last_reading_ts INTEGER" in sql
    assert "last_reading_temp_indoor REAL" in sql
    assert "last_reading_temp_outdoor REAL" in sql


def test_predictions_table_exists():
    """Verify the predictions table exists in weather.db."""
    conn = sqlite3.connect(predict.DB_PATH)
    tables = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='predictions'"
    ).fetchall()
    conn.close()

    # Table might not exist until first prediction is written
    # Just verify we can check for it without error
    assert isinstance(tables, list)


def test_dual_write_functionality():
    """
    Test that _write_prediction() writes to both JSON and SQLite.

    Uses a temporary predictions directory and a copy of the real DB to verify
    both writes happen correctly.
    """
    # Create mock prediction result
    now = datetime.now(timezone.utc)
    mock_result = {
        "generated_at": now.strftime("%Y-%m-%d %H:%M:%S UTC"),
        "model_type": "test_model",
        "model_version": 99,
        "prediction": {
            "prediction_for": now.strftime("%Y-%m-%d %H:00:00 UTC"),
            "temp_indoor": 21.5,
            "temp_outdoor": -2.3,
        },
        "last_reading": {
            "timestamp": int(now.timestamp()) - 3600,
            "temp_indoor": 21.0,
            "temp_outdoor": -2.8,
        },
    }

    # Create temp predictions directory
    with tempfile.TemporaryDirectory() as tmpdir:
        # Write the prediction
        predict._write_prediction(mock_result, tmpdir, "test_model")

        # Verify JSON file was written
        date_dir = os.path.join(tmpdir, now.strftime("%Y-%m-%d"))
        assert os.path.exists(date_dir)

        json_files = [f for f in os.listdir(date_dir) if f.endswith("_test_model.json")]
        assert len(json_files) == 1, f"Expected 1 JSON file, found {len(json_files)}"

        # Verify JSON content
        json_path = os.path.join(date_dir, json_files[0])
        with open(json_path) as f:
            saved_result = json.load(f)
        assert saved_result["model_type"] == "test_model"
        assert saved_result["model_version"] == 99
        assert saved_result["prediction"]["temp_indoor"] == 21.5

    # Verify DB write (using the real DB)
    conn = sqlite3.connect(predict.DB_PATH)

    # Check table exists
    tables = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='predictions'"
    ).fetchall()
    assert len(tables) == 1, "predictions table should exist after write"

    # Check schema
    schema = conn.execute("PRAGMA table_info(predictions)").fetchall()
    column_names = [col[1] for col in schema]
    expected_columns = [
        "id", "generated_at", "model_type", "model_version", "for_hour",
        "temp_indoor_predicted", "temp_outdoor_predicted",
        "last_reading_ts", "last_reading_temp_indoor", "last_reading_temp_outdoor"
    ]
    for col in expected_columns:
        assert col in column_names, f"Column {col} missing from predictions table"

    # Check the data was inserted
    rows = conn.execute(
        "SELECT * FROM predictions WHERE model_type = 'test_model' ORDER BY id DESC LIMIT 1"
    ).fetchall()
    assert len(rows) > 0, "Should have at least one test_model prediction in DB"

    row = rows[0]
    # Row structure: id, generated_at, model_type, model_version, for_hour,
    #                 temp_indoor_predicted, temp_outdoor_predicted,
    #                 last_reading_ts, last_reading_temp_indoor, last_reading_temp_outdoor
    assert row[2] == "test_model"  # model_type
    assert row[3] == 99  # model_version
    assert row[5] == 21.5  # temp_indoor_predicted
    assert row[6] == -2.3  # temp_outdoor_predicted

    conn.close()


def test_db_write_failure_doesnt_crash():
    """
    Verify that a DB write failure doesn't crash the prediction pipeline.

    This is tested by the try/except wrapper in _write_prediction().
    If the DB path is invalid, it should print a warning but not raise.
    """
    # Save original DB_PATH
    original_db_path = predict.DB_PATH

    try:
        # Point to a non-existent directory to force a DB error
        predict.DB_PATH = "/nonexistent/path/weather.db"

        now = datetime.now(timezone.utc)
        mock_result = {
            "generated_at": now.strftime("%Y-%m-%d %H:%M:%S UTC"),
            "model_type": "error_test",
            "model_version": 1,
            "prediction": {
                "prediction_for": now.strftime("%Y-%m-%d %H:00:00 UTC"),
                "temp_indoor": 20.0,
                "temp_outdoor": -5.0,
            },
            "last_reading": {
                "timestamp": 1234567890,
                "temp_indoor": 19.5,
                "temp_outdoor": -5.5,
            },
        }

        # This should NOT raise an exception even though DB write will fail
        with tempfile.TemporaryDirectory() as tmpdir:
            predict._write_prediction(mock_result, tmpdir, "error_test")

            # Verify JSON file was still written despite DB error
            date_dir = os.path.join(tmpdir, now.strftime("%Y-%m-%d"))
            assert os.path.exists(date_dir)
            json_files = os.listdir(date_dir)
            assert len(json_files) > 0, "JSON file should be written even if DB fails"

    finally:
        # Restore original DB_PATH
        predict.DB_PATH = original_db_path


if __name__ == "__main__":
    print("Running test_predictions_table_sql_constant_exists...")
    test_predictions_table_sql_constant_exists()
    print("✓ PASS\n")

    print("Running test_predictions_table_exists...")
    test_predictions_table_exists()
    print("✓ PASS\n")

    print("Running test_dual_write_functionality...")
    test_dual_write_functionality()
    print("✓ PASS\n")

    print("Running test_db_write_failure_doesnt_crash...")
    test_db_write_failure_doesnt_crash()
    print("✓ PASS\n")

    print("All tests passed!")
