#!/usr/bin/env python3
"""One-time migration: rename HH00.json data files to HHMMSS.json using embedded timestamps."""

import json
import os
import glob
from datetime import datetime, timezone

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
PREDICTIONS_DIR = os.path.join(DATA_DIR, "predictions")


def get_reading_timestamp(data):
    """Extract UTC time from a Netatmo weather reading."""
    try:
        ts = data["body"]["devices"][0]["dashboard_data"]["time_utc"]
        dt = datetime.fromtimestamp(ts, tz=timezone.utc)
        return dt.strftime("%H%M%S")
    except (KeyError, IndexError, TypeError, ValueError):
        return None


def get_prediction_timestamp(data):
    """Extract UTC time from a prediction file."""
    try:
        gen = data["generated_at"]  # e.g., "2026-02-15T03:10:49Z"
        dt = datetime.strptime(gen, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        return dt.strftime("%H%M%S")
    except (KeyError, ValueError):
        return None


def rename_files(directory, timestamp_fn, label):
    """Rename JSON files in date subdirectories using the given timestamp extractor."""
    pattern = os.path.join(directory, "*", "*.json")
    files = sorted(glob.glob(pattern))
    renamed = 0
    skipped = 0
    for filepath in files:
        filename = os.path.basename(filepath)
        # Skip files already in HHMMSS format (6 digits)
        stem = filename.replace(".json", "")
        if len(stem) == 6 and stem.isdigit():
            skipped += 1
            continue
        try:
            with open(filepath) as f:
                data = json.load(f)
        except (json.JSONDecodeError, OSError):
            print(f"  Skip (unreadable): {filepath}")
            continue
        new_stem = timestamp_fn(data)
        if new_stem is None:
            print(f"  Skip (no timestamp): {filepath}")
            continue
        new_filename = new_stem + ".json"
        if new_filename == filename:
            skipped += 1
            continue
        new_path = os.path.join(os.path.dirname(filepath), new_filename)
        if os.path.exists(new_path):
            print(f"  Skip (target exists): {filepath} -> {new_filename}")
            continue
        os.rename(filepath, new_path)
        print(f"  {filename} -> {new_filename}")
        renamed += 1
    print(f"  {label}: {renamed} renamed, {skipped} skipped")


if __name__ == "__main__":
    print("Renaming weather readings...")
    rename_files(DATA_DIR, get_reading_timestamp, "Readings")
    print()
    print("Renaming predictions...")
    rename_files(PREDICTIONS_DIR, get_prediction_timestamp, "Predictions")
    print()
    print("Done.")
