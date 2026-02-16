#!/usr/bin/env python3
"""Test prediction history JSON-first loading behavior.

Verifies that load_validated_history() prioritizes the JSON file over the
ephemeral DB, ensuring the frontend shows the full committed history instead
of just the last few hours from the local DB.
"""

import json
import os
import sqlite3
import sys
import tempfile
from datetime import datetime, timedelta, timezone

# Add the-snake-tank to path so we can import export_weather
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../the-snake-tank"))
import export_weather


def test_json_preferred_over_db():
    """Verify JSON file is used when both JSON and DB have data."""
    # Create temp JSON file with 10 entries spanning multiple hours
    json_entries = []
    now = datetime.now(timezone.utc)
    for i in range(10):
        for_hour = now - timedelta(hours=i)
        json_entries.append({
            "for_hour": for_hour.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "predicted_at": (for_hour - timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "model_type": "simple",
            "model_version": 1,
            "predicted": {"temp_indoor": 20.0 + i, "temp_outdoor": 10.0 + i},
            "actual": {"temp_indoor": 20.5 + i, "temp_outdoor": 10.5 + i}
        })

    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as tmp_json:
        json.dump(json_entries, tmp_json)
        json_path = tmp_json.name

    # Create temp DB with only 3 entries
    with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as tmp_db:
        db_path = tmp_db.name

    try:
        conn = sqlite3.connect(db_path)
        conn.execute(export_weather.PREDICTION_HISTORY_TABLE_SQL)
        for i in range(3):
            for_hour = now - timedelta(hours=i)
            conn.execute(
                """INSERT INTO prediction_history
                   (predicted_at, for_hour, model_type, model_version,
                    predicted_indoor, predicted_outdoor, actual_indoor, actual_outdoor,
                    error_indoor, error_outdoor)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    (for_hour - timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%SZ"),
                    for_hour.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "simple", 1,
                    15.0, 5.0,  # Different values than JSON
                    15.5, 5.5,
                    0.5, 0.5
                )
            )
        conn.commit()
        conn.close()

        # Temporarily replace DB_PATH to use our test DB
        original_db_path = export_weather.DB_PATH
        export_weather.DB_PATH = db_path

        try:
            # Call load_validated_history
            result = export_weather.load_validated_history(json_path, hours=24)

            # Should return JSON entries, not DB entries
            assert result is not None, "load_validated_history returned None"
            assert len(result) == 10, f"Expected 10 entries from JSON, got {len(result)}"

            # Verify first entry matches JSON data, not DB data
            first = result[0]
            assert first['actual_indoor'] == 20.5, \
                f"Expected JSON value 20.5, got {first['actual_indoor']} (DB has 15.5)"
            assert first['actual_outdoor'] == 10.5, \
                f"Expected JSON value 10.5, got {first['actual_outdoor']} (DB has 5.5)"
        finally:
            export_weather.DB_PATH = original_db_path
    finally:
        os.unlink(json_path)
        os.unlink(db_path)


def test_db_fallback_when_json_empty():
    """Verify DB is used when JSON file is empty or missing."""
    # Create empty JSON file
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as tmp_json:
        json.dump([], tmp_json)
        json_path = tmp_json.name

    # Create temp DB with valid entries
    with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as tmp_db:
        db_path = tmp_db.name

    try:
        now = datetime.now(timezone.utc)
        conn = sqlite3.connect(db_path)
        conn.execute(export_weather.PREDICTION_HISTORY_TABLE_SQL)
        for i in range(5):
            for_hour = now - timedelta(hours=i)
            conn.execute(
                """INSERT INTO prediction_history
                   (predicted_at, for_hour, model_type, model_version,
                    predicted_indoor, predicted_outdoor, actual_indoor, actual_outdoor,
                    error_indoor, error_outdoor)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    (for_hour - timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%SZ"),
                    for_hour.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "simple", 1,
                    20.0, 10.0,
                    20.5, 10.5,
                    0.5, 0.5
                )
            )
        conn.commit()
        conn.close()

        # Temporarily replace DB_PATH
        original_db_path = export_weather.DB_PATH
        export_weather.DB_PATH = db_path

        try:
            # Call with empty JSON
            result = export_weather.load_validated_history(json_path, hours=24)

            # Should fall back to DB
            assert result is not None, "load_validated_history returned None"
            assert len(result) == 5, f"Expected 5 entries from DB fallback, got {len(result)}"

            # Verify it's DB data
            first = result[0]
            assert first['actual_indoor'] == 20.5, "DB fallback not working"
        finally:
            export_weather.DB_PATH = original_db_path
    finally:
        os.unlink(json_path)
        os.unlink(db_path)


def test_db_fallback_when_json_missing():
    """Verify DB is used when JSON file doesn't exist."""
    # Use a path that doesn't exist
    json_path = "/tmp/nonexistent_prediction_history_12345.json"

    # Create temp DB with valid entries
    with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as tmp_db:
        db_path = tmp_db.name

    try:
        now = datetime.now(timezone.utc)
        conn = sqlite3.connect(db_path)
        conn.execute(export_weather.PREDICTION_HISTORY_TABLE_SQL)
        for i in range(3):
            for_hour = now - timedelta(hours=i)
            conn.execute(
                """INSERT INTO prediction_history
                   (predicted_at, for_hour, model_type, model_version,
                    predicted_indoor, predicted_outdoor, actual_indoor, actual_outdoor,
                    error_indoor, error_outdoor)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    (for_hour - timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%SZ"),
                    for_hour.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "simple", 1,
                    20.0, 10.0,
                    20.5, 10.5,
                    0.5, 0.5
                )
            )
        conn.commit()
        conn.close()

        # Temporarily replace DB_PATH
        original_db_path = export_weather.DB_PATH
        export_weather.DB_PATH = db_path

        try:
            # Call with missing JSON
            result = export_weather.load_validated_history(json_path, hours=24)

            # Should fall back to DB
            assert result is not None, "load_validated_history returned None"
            assert len(result) == 3, f"Expected 3 entries from DB fallback, got {len(result)}"
        finally:
            export_weather.DB_PATH = original_db_path
    finally:
        os.unlink(db_path)


def test_cutoff_filtering():
    """Verify only entries within the hours window are returned from JSON."""
    # Create JSON file with entries spanning 48 hours
    json_entries = []
    now = datetime.now(timezone.utc)
    for i in range(48):
        for_hour = now - timedelta(hours=i)
        json_entries.append({
            "for_hour": for_hour.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "predicted_at": (for_hour - timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "model_type": "simple",
            "model_version": 1,
            "predicted": {"temp_indoor": 20.0, "temp_outdoor": 10.0},
            "actual": {"temp_indoor": 20.5, "temp_outdoor": 10.5}
        })

    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as tmp_json:
        json.dump(json_entries, tmp_json)
        json_path = tmp_json.name

    try:
        # Request only 24 hours
        result = export_weather.load_validated_history(json_path, hours=24)

        assert result is not None, "load_validated_history returned None"
        # Should return only entries within 24-hour window
        # Allow some tolerance for entries near the boundary
        assert 22 <= len(result) <= 25, \
            f"Expected ~24 entries (within 24h window), got {len(result)}"

        # Verify all returned entries are within the cutoff
        cutoff = now - timedelta(hours=24)
        for entry in result:
            entry_time = datetime.strptime(entry['timestamp'], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
            assert entry_time >= cutoff, \
                f"Entry {entry['timestamp']} is older than 24h cutoff {cutoff.isoformat()}"
    finally:
        os.unlink(json_path)


def test_cutoff_filtering_from_db():
    """Verify only entries within the hours window are returned from DB."""
    # Create temp DB with entries spanning 48 hours
    with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as tmp_db:
        db_path = tmp_db.name

    try:
        now = datetime.now(timezone.utc)
        conn = sqlite3.connect(db_path)
        conn.execute(export_weather.PREDICTION_HISTORY_TABLE_SQL)
        for i in range(48):
            for_hour = now - timedelta(hours=i)
            conn.execute(
                """INSERT INTO prediction_history
                   (predicted_at, for_hour, model_type, model_version,
                    predicted_indoor, predicted_outdoor, actual_indoor, actual_outdoor,
                    error_indoor, error_outdoor)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    (for_hour - timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%SZ"),
                    for_hour.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "simple", 1,
                    20.0, 10.0,
                    20.5, 10.5,
                    0.5, 0.5
                )
            )
        conn.commit()
        conn.close()

        # Temporarily replace DB_PATH
        original_db_path = export_weather.DB_PATH
        export_weather.DB_PATH = db_path

        try:
            # Request only 24 hours with empty JSON (to trigger DB fallback)
            result = export_weather.load_validated_history("/tmp/nonexistent.json", hours=24)

            assert result is not None, "load_validated_history returned None"
            # Should return only entries within 24-hour window
            assert 22 <= len(result) <= 25, \
                f"Expected ~24 entries (within 24h window), got {len(result)}"

            # Verify all returned entries are within the cutoff
            cutoff = now - timedelta(hours=24)
            for entry in result:
                entry_time = datetime.strptime(entry['timestamp'], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
                assert entry_time >= cutoff, \
                    f"Entry {entry['timestamp']} is older than 24h cutoff"
        finally:
            export_weather.DB_PATH = original_db_path
    finally:
        os.unlink(db_path)


if __name__ == "__main__":
    # Run tests manually
    import traceback

    tests = [
        test_json_preferred_over_db,
        test_db_fallback_when_json_empty,
        test_db_fallback_when_json_missing,
        test_cutoff_filtering,
        test_cutoff_filtering_from_db,
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
