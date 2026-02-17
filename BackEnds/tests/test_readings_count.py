#!/usr/bin/env python3
"""Test that removing hourly dedup increased readings count."""

import os
import sqlite3
import sys

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "the-snake-tank", "data", "weather.db")


def test_readings_count_increased():
    """Verify readings count is greater than 59 (previous hourly-deduped count)."""
    if not os.path.exists(DB_PATH):
        raise FileNotFoundError(f"Database not found: {DB_PATH}. Run build_dataset.py first.")

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) FROM readings")
    count = cursor.fetchone()[0]
    conn.close()

    # After removing dedup, we expect significantly more than 59 readings
    # Typical range is 150-160+ depending on data files available
    assert count > 100, f"Expected >100 readings after dedup removal (was 59), got {count}"
    print(f"✓ Readings count: {count} (>100, up from 59 with dedup)")


def test_no_duplicate_timestamps():
    """Verify no duplicate timestamps exist (timestamp is primary key)."""
    if not os.path.exists(DB_PATH):
        raise FileNotFoundError(f"Database not found: {DB_PATH}. Run build_dataset.py first.")

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) FROM readings")
    total_count = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(DISTINCT timestamp) FROM readings")
    distinct_count = cursor.fetchone()[0]

    conn.close()

    assert total_count == distinct_count, \
        f"Duplicate timestamps found: {total_count} total vs {distinct_count} distinct"
    print(f"✓ No duplicate timestamps: {total_count} = {distinct_count}")


def test_readings_date_range():
    """Verify readings span a reasonable date range."""
    if not os.path.exists(DB_PATH):
        raise FileNotFoundError(f"Database not found: {DB_PATH}. Run build_dataset.py first.")

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute("SELECT MIN(timestamp), MAX(timestamp) FROM readings")
    min_ts, max_ts = cursor.fetchone()
    conn.close()

    assert min_ts is not None and max_ts is not None, "No timestamp data found"
    assert max_ts > min_ts, f"Invalid date range: min={min_ts}, max={max_ts}"

    # Convert to human-readable for reporting
    from datetime import datetime
    min_date = datetime.fromtimestamp(min_ts).isoformat()
    max_date = datetime.fromtimestamp(max_ts).isoformat()

    print(f"✓ Date range: {min_date} to {max_date}")


if __name__ == "__main__":
    test_readings_count_increased()
    test_no_duplicate_timestamps()
    test_readings_date_range()
    print("\nAll readings count tests passed!")
