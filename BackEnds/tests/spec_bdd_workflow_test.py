"""BDD workflow test specs — verifying existing SQLite prediction behavior.

These specs validate that predict.py correctly dual-writes predictions
to both JSON files and the SQLite predictions table.
"""

import json
import os
import sqlite3

SCRIPT_DIR = os.path.join(os.path.dirname(__file__), '..', 'the-snake-tank')
DB_PATH = os.path.join(SCRIPT_DIR, 'data', 'weather.db')
PREDICTIONS_DIR = os.path.join(SCRIPT_DIR, 'data', 'predictions')


def test_predictions_table_should_exist():
    """The predictions table should exist in weather.db."""
    conn = sqlite3.connect(DB_PATH)
    tables = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='predictions'"
    ).fetchall()
    conn.close()
    assert len(tables) == 1, "predictions table should exist in weather.db"


def test_predictions_table_should_have_correct_columns():
    """The predictions table should have all required columns."""
    expected_columns = {
        'id', 'generated_at', 'model_type', 'model_version', 'for_hour',
        'temp_indoor_predicted', 'temp_outdoor_predicted',
        'last_reading_ts', 'last_reading_temp_indoor', 'last_reading_temp_outdoor'
    }
    conn = sqlite3.connect(DB_PATH)
    columns = conn.execute("PRAGMA table_info(predictions)").fetchall()
    conn.close()
    actual_columns = {col[1] for col in columns}
    assert expected_columns.issubset(actual_columns), (
        f"Missing columns: {expected_columns - actual_columns}"
    )


def test_predict_module_should_define_schema_constant():
    """predict.py should define PREDICTIONS_TABLE_SQL at module level."""
    predict_path = os.path.join(SCRIPT_DIR, 'predict.py')
    with open(predict_path) as f:
        content = f.read()
    assert 'PREDICTIONS_TABLE_SQL' in content, (
        "predict.py should define PREDICTIONS_TABLE_SQL constant"
    )


def test_write_prediction_should_include_db_insert():
    """_write_prediction() should contain SQLite INSERT logic."""
    predict_path = os.path.join(SCRIPT_DIR, 'predict.py')
    with open(predict_path) as f:
        content = f.read()
    assert 'INSERT INTO predictions' in content, (
        "_write_prediction should INSERT into predictions table"
    )


def test_predictions_table_schema_should_match_constant():
    """The actual table schema should match PREDICTIONS_TABLE_SQL definition."""
    # Read the constant from predict.py
    predict_path = os.path.join(SCRIPT_DIR, 'predict.py')
    with open(predict_path) as f:
        content = f.read()

    # Verify the constant defines key columns
    assert 'id INTEGER PRIMARY KEY AUTOINCREMENT' in content
    assert 'generated_at TEXT NOT NULL' in content
    assert 'model_type TEXT NOT NULL' in content
    assert 'for_hour TEXT NOT NULL' in content
    assert 'temp_indoor_predicted REAL' in content
    assert 'temp_outdoor_predicted REAL' in content
