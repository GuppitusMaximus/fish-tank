"""Tests for multi-model error loading."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'the-snake-tank'))

import pytest
from unittest.mock import patch, MagicMock
from train_model import load_prediction_errors_all_models


def test_load_prediction_errors_all_models_returns_correct_structure():
    """Test load_prediction_errors_all_models() returns errors keyed by (model_type, hour_str) tuples."""
    import sqlite3
    import tempfile

    # Create a temporary database with prediction_history table
    with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as tmp:
        db_path = tmp.name

    try:
        conn = sqlite3.connect(db_path)
        conn.execute("""
            CREATE TABLE prediction_history (
                model_type TEXT,
                for_hour TEXT,
                error_indoor REAL,
                error_outdoor REAL
            )
        """)
        conn.execute("INSERT INTO prediction_history VALUES ('3hrRaw', '2026-02-15T12:00:00Z', 0.5, 0.3)")
        conn.execute("INSERT INTO prediction_history VALUES ('24hrRaw', '2026-02-15T13:00:00Z', 0.2, 0.4)")
        conn.execute("INSERT INTO prediction_history VALUES ('6hrRC', '2026-02-15T14:00:00Z', 0.1, 0.2)")
        conn.commit()
        conn.close()

        # Temporarily set DB_PATH to our test database
        with patch('train_model.DB_PATH', db_path):
            result = load_prediction_errors_all_models()

            # Result should be a dict
            assert isinstance(result, dict)

            # Keys should be (model_type, hour_str) tuples
            assert all(isinstance(k, tuple) and len(k) == 2 for k in result.keys())

            # Should have entries for the mocked data
            assert ('3hrRaw', '2026-02-15T12:00:00Z') in result
            assert ('24hrRaw', '2026-02-15T13:00:00Z') in result
            assert ('6hrRC', '2026-02-15T14:00:00Z') in result
    finally:
        import os
        os.unlink(db_path)


def test_load_prediction_errors_loads_from_all_3_model_types():
    """Test it loads from all 3 model types — 3hrRaw, 24hrRaw, 6hrRC."""
    import sqlite3
    import tempfile

    with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as tmp:
        db_path = tmp.name

    try:
        conn = sqlite3.connect(db_path)
        conn.execute("""
            CREATE TABLE prediction_history (
                model_type TEXT,
                for_hour TEXT,
                error_indoor REAL,
                error_outdoor REAL
            )
        """)
        conn.execute("INSERT INTO prediction_history VALUES ('3hrRaw', '2026-02-15T10:00:00Z', 0.1, 0.2)")
        conn.execute("INSERT INTO prediction_history VALUES ('24hrRaw', '2026-02-15T11:00:00Z', 0.3, 0.4)")
        conn.execute("INSERT INTO prediction_history VALUES ('6hrRC', '2026-02-15T12:00:00Z', 0.5, 0.6)")
        conn.commit()
        conn.close()

        with patch('train_model.DB_PATH', db_path):
            result = load_prediction_errors_all_models()

            # Verify all 3 model types are represented
            model_types = set(k[0] for k in result.keys())
            assert '3hrRaw' in model_types
            assert '24hrRaw' in model_types
            assert '6hrRC' in model_types
    finally:
        import os
        os.unlink(db_path)


def test_load_prediction_errors_returns_empty_dict_when_db_unavailable():
    """Test it returns empty dict when DB unavailable — no crash."""
    # Point to a non-existent database
    with patch('train_model.DB_PATH', '/nonexistent/path/to/database.db'):
        result = load_prediction_errors_all_models()

        # Should return empty dict, not crash
        assert isinstance(result, dict)
        assert len(result) == 0
