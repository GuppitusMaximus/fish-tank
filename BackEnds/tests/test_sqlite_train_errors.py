#!/usr/bin/env python3
"""Test SQLite error reads in train_model.py.

Verifies that train_model.py can read prediction errors from the DB
prediction_history table and falls back to JSON when unavailable.
"""

import os
import sys
import json
import sqlite3
import tempfile
from datetime import datetime, timezone

# Add the-snake-tank to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "the-snake-tank"))

from train_model import (
    PREDICTION_HISTORY_TABLE_SQL,
    _load_prediction_errors_from_db,
    load_prediction_errors,
    DB_PATH,
)


def test_schema_constant_exists():
    """Verify PREDICTION_HISTORY_TABLE_SQL constant exists with correct schema."""
    assert PREDICTION_HISTORY_TABLE_SQL is not None
    assert "CREATE TABLE IF NOT EXISTS prediction_history" in PREDICTION_HISTORY_TABLE_SQL
    assert "predicted_at TEXT NOT NULL" in PREDICTION_HISTORY_TABLE_SQL
    assert "for_hour TEXT NOT NULL" in PREDICTION_HISTORY_TABLE_SQL
    assert "model_type TEXT NOT NULL" in PREDICTION_HISTORY_TABLE_SQL
    assert "error_indoor REAL" in PREDICTION_HISTORY_TABLE_SQL
    assert "error_outdoor REAL" in PREDICTION_HISTORY_TABLE_SQL
    assert "UNIQUE(model_type, for_hour)" in PREDICTION_HISTORY_TABLE_SQL
    print("✓ PREDICTION_HISTORY_TABLE_SQL constant has correct schema")


def test_db_helper_function_exists():
    """Verify _load_prediction_errors_from_db() function exists."""
    assert callable(_load_prediction_errors_from_db)
    print("✓ _load_prediction_errors_from_db() function exists")


def test_db_helper_returns_none_when_no_db():
    """Verify DB helper returns None when database doesn't exist."""
    # Save original DB_PATH
    original_db = DB_PATH

    # Temporarily point to nonexistent DB
    import train_model
    train_model.DB_PATH = "/tmp/nonexistent_db_12345.db"

    result = _load_prediction_errors_from_db()

    # Restore original
    train_model.DB_PATH = original_db

    assert result is None
    print("✓ _load_prediction_errors_from_db() returns None when DB doesn't exist")


def test_db_helper_returns_none_when_table_empty():
    """Verify DB helper returns None when prediction_history table is empty."""
    # Create a temporary database with empty table
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        temp_db = f.name

    try:
        conn = sqlite3.connect(temp_db)
        conn.execute(PREDICTION_HISTORY_TABLE_SQL)
        conn.commit()
        conn.close()

        # Point to temp DB
        import train_model
        original_db = train_model.DB_PATH
        train_model.DB_PATH = temp_db

        result = _load_prediction_errors_from_db()

        # Restore original
        train_model.DB_PATH = original_db

        assert result is None
        print("✓ _load_prediction_errors_from_db() returns None when table is empty")
    finally:
        os.unlink(temp_db)


def test_db_helper_filters_correct_model_types():
    """Verify DB helper queries only 3hrRaw and simple model types."""
    # Create a temporary database with test data
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        temp_db = f.name

    try:
        conn = sqlite3.connect(temp_db)
        conn.execute(PREDICTION_HISTORY_TABLE_SQL)

        # Insert test data with different model types
        test_data = [
            ("2026-02-15T10:00:00Z", "2026-02-15T11:00:00Z", "3hrRaw", 1, 20.0, 15.0, 20.5, 15.2, 0.5, 0.2),
            ("2026-02-15T11:00:00Z", "2026-02-15T12:00:00Z", "simple", 1, 21.0, 16.0, 21.3, 16.1, 0.3, 0.1),
            ("2026-02-15T12:00:00Z", "2026-02-15T13:00:00Z", "6hrRC", 1, 22.0, 17.0, 22.1, 17.0, 0.1, 0.0),
            ("2026-02-15T13:00:00Z", "2026-02-15T14:00:00Z", "24hrFull", 1, 23.0, 18.0, 23.0, 18.0, 0.0, 0.0),
        ]

        for row in test_data:
            conn.execute(
                """INSERT INTO prediction_history
                   (predicted_at, for_hour, model_type, model_version,
                    predicted_indoor, predicted_outdoor, actual_indoor, actual_outdoor,
                    error_indoor, error_outdoor)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                row
            )
        conn.commit()
        conn.close()

        # Point to temp DB
        import train_model
        original_db = train_model.DB_PATH
        train_model.DB_PATH = temp_db

        result = _load_prediction_errors_from_db()

        # Restore original
        train_model.DB_PATH = original_db

        assert result is not None
        assert len(result) == 2  # Only 3hrRaw and simple, not 6hrRC or 24hrFull
        assert "2026-02-15T11:00:00Z" in result
        assert "2026-02-15T12:00:00Z" in result
        assert "2026-02-15T13:00:00Z" not in result  # 6hrRC should be filtered out
        assert "2026-02-15T14:00:00Z" not in result  # 24hrFull should be filtered out
        print("✓ _load_prediction_errors_from_db() filters to only 3hrRaw and simple")
    finally:
        os.unlink(temp_db)


def test_error_dict_format():
    """Verify error dict has correct format: {hour_str: (error_indoor, error_outdoor)}."""
    # Create a temporary database with test data
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        temp_db = f.name

    try:
        conn = sqlite3.connect(temp_db)
        conn.execute(PREDICTION_HISTORY_TABLE_SQL)

        conn.execute(
            """INSERT INTO prediction_history
               (predicted_at, for_hour, model_type, model_version,
                predicted_indoor, predicted_outdoor, actual_indoor, actual_outdoor,
                error_indoor, error_outdoor)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            ("2026-02-15T10:00:00Z", "2026-02-15T11:00:00Z", "simple", 1,
             20.0, 15.0, 20.5, 15.2, 0.5, 0.2)
        )
        conn.commit()
        conn.close()

        # Point to temp DB
        import train_model
        original_db = train_model.DB_PATH
        train_model.DB_PATH = temp_db

        result = _load_prediction_errors_from_db()

        # Restore original
        train_model.DB_PATH = original_db

        assert result is not None
        assert "2026-02-15T11:00:00Z" in result
        errors = result["2026-02-15T11:00:00Z"]
        assert isinstance(errors, tuple)
        assert len(errors) == 2
        assert errors[0] == 0.5  # error_indoor
        assert errors[1] == 0.2  # error_outdoor
        print("✓ Error dict format is correct: {hour_str: (error_indoor, error_outdoor)}")
    finally:
        os.unlink(temp_db)


def test_load_prediction_errors_tries_db_first():
    """Verify load_prediction_errors() tries DB first before falling back to JSON."""
    # Create a temporary database with test data
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        temp_db = f.name

    # Create a temporary JSON file with different data
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
        json_file = f.name
        json.dump([
            {
                "predicted_at": "2026-02-15T10:00:00Z",
                "for_hour": "2026-02-15T11:00:00Z",
                "model_type": "simple",
                "error": {"temp_indoor": 0.8, "temp_outdoor": 0.4}
            }
        ], f)

    try:
        # Set up DB with different error values
        conn = sqlite3.connect(temp_db)
        conn.execute(PREDICTION_HISTORY_TABLE_SQL)
        conn.execute(
            """INSERT INTO prediction_history
               (predicted_at, for_hour, model_type, model_version,
                predicted_indoor, predicted_outdoor, actual_indoor, actual_outdoor,
                error_indoor, error_outdoor)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            ("2026-02-15T10:00:00Z", "2026-02-15T11:00:00Z", "simple", 1,
             20.0, 15.0, 20.5, 15.2, 0.5, 0.2)
        )
        conn.commit()
        conn.close()

        # Point to temp DB
        import train_model
        original_db = train_model.DB_PATH
        train_model.DB_PATH = temp_db

        # Call load_prediction_errors with JSON path
        result = load_prediction_errors(json_file)

        # Restore original
        train_model.DB_PATH = original_db

        # Should get DB values (0.5, 0.2), not JSON values (0.8, 0.4)
        assert result is not None
        assert "2026-02-15T11:00:00Z" in result
        errors = result["2026-02-15T11:00:00Z"]
        assert errors[0] == 0.5  # DB value, not 0.8 from JSON
        assert errors[1] == 0.2  # DB value, not 0.4 from JSON
        print("✓ load_prediction_errors() tries DB first and uses DB data when available")
    finally:
        os.unlink(temp_db)
        os.unlink(json_file)


def test_fallback_to_json_works():
    """Verify fallback to JSON works when DB returns None."""
    # Create a temporary JSON file
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
        json_file = f.name
        json.dump([
            {
                "predicted_at": "2026-02-15T10:00:00Z",
                "for_hour": "2026-02-15T11:00:00Z",
                "model_type": "simple",
                "error": {"temp_indoor": 0.8, "temp_outdoor": 0.4}
            },
            {
                "predicted_at": "2026-02-15T11:00:00Z",
                "for_hour": "2026-02-15T12:00:00Z",
                "model_type": "3hrRaw",
                "error": {"temp_indoor": 0.6, "temp_outdoor": 0.3}
            },
            {
                "predicted_at": "2026-02-15T12:00:00Z",
                "for_hour": "2026-02-15T13:00:00Z",
                "model_type": "6hrRC",
                "error": {"temp_indoor": 0.1, "temp_outdoor": 0.1}
            }
        ], f)

    try:
        # Point to nonexistent DB so DB helper returns None
        import train_model
        original_db = train_model.DB_PATH
        train_model.DB_PATH = "/tmp/nonexistent_db_12345.db"

        # Call load_prediction_errors with JSON path
        result = load_prediction_errors(json_file)

        # Restore original
        train_model.DB_PATH = original_db

        # Should fall back to JSON and get 2 entries (3hrRaw and simple, not 6hrRC)
        assert result is not None
        assert len(result) == 2
        assert "2026-02-15T11:00:00Z" in result
        assert "2026-02-15T12:00:00Z" in result
        assert "2026-02-15T13:00:00Z" not in result  # 6hrRC filtered out

        # Verify error values from JSON
        assert result["2026-02-15T11:00:00Z"] == (0.8, 0.4)
        assert result["2026-02-15T12:00:00Z"] == (0.6, 0.3)
        print("✓ Fallback to JSON works when DB returns None")
    finally:
        os.unlink(json_file)


if __name__ == "__main__":
    print("Testing SQLite error reads in train_model.py...\n")

    test_schema_constant_exists()
    test_db_helper_function_exists()
    test_db_helper_returns_none_when_no_db()
    test_db_helper_returns_none_when_table_empty()
    test_db_helper_filters_correct_model_types()
    test_error_dict_format()
    test_load_prediction_errors_tries_db_first()
    test_fallback_to_json_works()

    print("\n✅ All tests passed!")
