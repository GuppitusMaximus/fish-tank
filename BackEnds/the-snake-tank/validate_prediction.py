#!/usr/bin/env python3
"""Validate the previous prediction against the actual reading that arrived.

Compares predictions from the predictions directory with the most recent reading
in weather.db, and appends the results to prediction-history.json.
Handles multiple model types, validating each independently.

Usage:
    python validate_prediction.py --prediction <path> --history <path>
    python validate_prediction.py --predictions-dir <path> --history <path>
"""

import argparse
import json
import os
import re
import sqlite3
import sys
from collections import defaultdict
from datetime import datetime, timezone, timedelta

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(SCRIPT_DIR, "data", "weather.db")
MAX_HISTORY_PER_MODEL = 168  # 1 week of hourly predictions per model

PREDICTION_HISTORY_TABLE_SQL = """CREATE TABLE IF NOT EXISTS prediction_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    predicted_at TEXT NOT NULL,
    for_hour TEXT NOT NULL,
    model_type TEXT NOT NULL,
    model_version INTEGER,
    predicted_indoor REAL,
    predicted_outdoor REAL,
    actual_indoor REAL,
    actual_outdoor REAL,
    error_indoor REAL,
    error_outdoor REAL,
    UNIQUE(model_type, for_hour)
)"""

PREDICTIONS_TABLE_SQL = """CREATE TABLE IF NOT EXISTS predictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    generated_at TEXT NOT NULL,
    model_type TEXT NOT NULL,
    model_version INTEGER,
    for_hour TEXT NOT NULL,
    temp_indoor_predicted REAL,
    temp_outdoor_predicted REAL,
    last_reading_ts INTEGER,
    last_reading_temp_indoor REAL,
    last_reading_temp_outdoor REAL
)"""


def _find_best_predictions_from_db():
    """Try to find best predictions from the DB predictions table.
    Returns list of prediction dicts, or None if table doesn't exist or is empty."""
    if not os.path.exists(DB_PATH):
        return None
    try:
        now = datetime.now(timezone.utc)
        min_time = (now - timedelta(minutes=90)).strftime("%Y-%m-%dT%H:%M:%SZ")
        max_time = (now - timedelta(minutes=30)).strftime("%Y-%m-%dT%H:%M:%SZ")

        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """SELECT generated_at, model_type, model_version, for_hour,
                      temp_indoor_predicted, temp_outdoor_predicted,
                      last_reading_ts, last_reading_temp_indoor, last_reading_temp_outdoor
               FROM predictions
               WHERE generated_at > ? AND generated_at < ?""",
            (min_time, max_time)).fetchall()
        conn.close()

        if not rows:
            return None

        # Group by model_type, keep closest to 60 minutes old
        best_by_model = {}
        for row in rows:
            row = dict(row)
            generated_at = datetime.strptime(row["generated_at"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
            age_minutes = (now - generated_at).total_seconds() / 60
            diff = abs(age_minutes - 60)
            mt = row["model_type"]
            if mt not in best_by_model or diff < best_by_model[mt][1]:
                best_by_model[mt] = (row, diff)

        # Convert DB rows to prediction data format matching JSON files
        results = []
        for row, _ in best_by_model.values():
            pred_data = {
                "generated_at": row["generated_at"],
                "model_type": row["model_type"],
                "model_version": row["model_version"],
                "last_reading": {
                    "timestamp": row["last_reading_ts"],
                    "temp_indoor": row["last_reading_temp_indoor"],
                    "temp_outdoor": row["last_reading_temp_outdoor"],
                },
                "prediction": {
                    "prediction_for": row["for_hour"],
                    "temp_indoor": row["temp_indoor_predicted"],
                    "temp_outdoor": row["temp_outdoor_predicted"],
                },
            }
            results.append(pred_data)
        return results
    except Exception:
        return None


def find_best_predictions(predictions_dir):
    """Find predictions that best match the current reading, one per model type.

    Looks for predictions whose 'generated_at' time is 30-90 minutes before now,
    grouped by model type, keeping the one closest to 60 minutes old per model.
    """
    # Try DB first
    db_results = _find_best_predictions_from_db()
    if db_results:
        print(f"Found {len(db_results)} prediction(s) from DB")
        return db_results

    # Fall back to file scanning
    if not os.path.isdir(predictions_dir):
        return []

    now = datetime.now(timezone.utc)
    best_by_model = {}  # model_type -> (path, diff)

    date_dirs = sorted(
        [d for d in os.listdir(predictions_dir)
         if os.path.isdir(os.path.join(predictions_dir, d))],
        reverse=True,
    )

    for date_dir in date_dirs[:2]:
        full_dir = os.path.join(predictions_dir, date_dir)
        files = sorted(
            [f for f in os.listdir(full_dir) if f.endswith(".json")],
            reverse=True,
        )
        for fname in files:
            fpath = os.path.join(full_dir, fname)
            try:
                with open(fpath) as f:
                    data = json.load(f)
                generated_at = datetime.strptime(
                    data["generated_at"], "%Y-%m-%dT%H:%M:%SZ"
                ).replace(tzinfo=timezone.utc)

                age_minutes = (now - generated_at).total_seconds() / 60
                if age_minutes < 30 or age_minutes > 90:
                    continue

                # Determine model type from data or filename
                model_type = data.get("model_type")
                if not model_type:
                    match = re.match(r'^\d{4,6}_(\w+)\.json$', fname)
                    model_type = match.group(1) if match else "simple"

                diff = abs(age_minutes - 60)
                if model_type not in best_by_model or diff < best_by_model[model_type][1]:
                    best_by_model[model_type] = (fpath, diff)
            except (json.JSONDecodeError, KeyError, ValueError):
                continue

    return [load_prediction(path) for path, _ in best_by_model.values()]


def load_prediction(path):
    if not os.path.exists(path):
        return None
    with open(path) as f:
        return json.load(f)


def load_history(path):
    if not os.path.exists(path):
        return []
    try:
        with open(path) as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except (json.JSONDecodeError, ValueError):
        return []


def get_latest_reading():
    if not os.path.exists(DB_PATH):
        return None
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    row = conn.execute(
        "SELECT timestamp, temp_indoor, temp_outdoor FROM readings ORDER BY timestamp DESC LIMIT 1"
    ).fetchone()
    conn.close()
    if row is None:
        return None
    return dict(row)


def trim_history(history):
    """Trim history to MAX_HISTORY_PER_MODEL entries per model type."""
    by_model = defaultdict(list)
    for entry in history:
        by_model[entry.get("model_type", "simple")].append(entry)
    trimmed = []
    for model_type, entries in by_model.items():
        entries.sort(key=lambda e: e.get("for_hour", ""), reverse=True)
        trimmed.extend(entries[:MAX_HISTORY_PER_MODEL])
    trimmed.sort(key=lambda e: e.get("for_hour", ""), reverse=True)
    return trimmed


def validate_single(prediction_data, actual, history):
    """Validate a single prediction against actual reading. Returns updated history or None."""
    predicted_at_str = prediction_data.get("generated_at")
    predicted = prediction_data.get("prediction")
    if not predicted_at_str or not predicted:
        print("Prediction file missing required fields, skipping.")
        return None

    predicted_at = datetime.strptime(predicted_at_str, "%Y-%m-%dT%H:%M:%SZ").replace(
        tzinfo=timezone.utc
    )

    actual_dt = datetime.fromtimestamp(actual["timestamp"], tz=timezone.utc)
    diff = actual_dt - predicted_at
    diff_minutes = diff.total_seconds() / 60

    if diff_minutes < 30 or diff_minutes > 90:
        print(
            f"Actual reading is {diff_minutes:.0f} min after prediction "
            f"(need 30-90 min window). Skipping validation."
        )
        return None

    model_type = prediction_data.get("model_type", "simple")
    model_version = prediction_data.get("model_version")

    for_hour = predicted_at + timedelta(hours=1)
    for_hour_str = for_hour.strftime("%Y-%m-%dT%H:%M:%SZ")

    # Check for duplicate — skip if we already have this model+hour
    for entry in history:
        if (entry.get("model_type", "simple") == model_type and
                entry.get("for_hour") == for_hour_str):
            print(f"Already validated {model_type} for {for_hour_str}, skipping.")
            return None

    error_indoor = abs(actual["temp_indoor"] - predicted["temp_indoor"])
    error_outdoor = abs(actual["temp_outdoor"] - predicted["temp_outdoor"])

    comparison = {
        "predicted_at": predicted_at_str,
        "for_hour": for_hour_str,
        "model_type": model_type,
        "predicted": {
            "temp_indoor": predicted["temp_indoor"],
            "temp_outdoor": predicted["temp_outdoor"],
        },
        "actual": {
            "temp_indoor": round(actual["temp_indoor"], 1),
            "temp_outdoor": round(actual["temp_outdoor"], 1),
        },
        "error": {
            "temp_indoor": round(error_indoor, 1),
            "temp_outdoor": round(error_outdoor, 1),
        },
    }

    if model_version is not None:
        comparison["model_version"] = model_version

    print(f"Validation result ({model_type}):")
    print(f"  Predicted at:  {predicted_at_str}")
    print(f"  For hour:      {for_hour_str}")
    print(f"  Indoor:  predicted {predicted['temp_indoor']:.1f}, "
          f"actual {actual['temp_indoor']:.1f}, "
          f"error {error_indoor:.1f}")
    print(f"  Outdoor: predicted {predicted['temp_outdoor']:.1f}, "
          f"actual {actual['temp_outdoor']:.1f}, "
          f"error {error_outdoor:.1f}")

    return comparison


def validate(prediction_paths, history_path):
    actual = get_latest_reading()
    if actual is None:
        print("No readings in database, skipping validation.")
        return

    history = load_history(history_path)
    new_entries = []

    for prediction_data in prediction_paths:
        if prediction_data is None:
            continue

        # If it's a string path (legacy), load it
        if isinstance(prediction_data, str):
            print(f"Validating: {prediction_data}")
            prediction_data = load_prediction(prediction_data)
            if prediction_data is None:
                continue
        else:
            print(f"Validating: {prediction_data.get('model_type', 'unknown')} from DB")

        comparison = validate_single(prediction_data, actual, history)
        if comparison:
            new_entries.append(comparison)
            history.insert(0, comparison)

    if not new_entries:
        print("No new validations to record.")
        return

    history = trim_history(history)

    os.makedirs(os.path.dirname(os.path.abspath(history_path)), exist_ok=True)
    with open(history_path, "w") as f:
        json.dump(history, f, indent=2)
        f.write("\n")

    print(f"History written to {history_path} ({len(new_entries)} new entries, {len(history)} total)")

    # Write new entries to prediction_history table
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.execute(PREDICTION_HISTORY_TABLE_SQL)
        for entry in new_entries:
            conn.execute(
                """INSERT OR IGNORE INTO prediction_history
                (predicted_at, for_hour, model_type, model_version,
                 predicted_indoor, predicted_outdoor,
                 actual_indoor, actual_outdoor,
                 error_indoor, error_outdoor)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (entry["predicted_at"], entry["for_hour"],
                 entry.get("model_type", "simple"), entry.get("model_version"),
                 entry["predicted"]["temp_indoor"], entry["predicted"]["temp_outdoor"],
                 entry["actual"]["temp_indoor"], entry["actual"]["temp_outdoor"],
                 entry["error"]["temp_indoor"], entry["error"]["temp_outdoor"]))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Warning: failed to write history to DB: {e}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Validate prediction against actual reading"
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--prediction", help="Path to a specific prediction file")
    group.add_argument("--predictions-dir", help="Auto-find latest predictions in this directory")
    parser.add_argument(
        "--history", required=True, help="Path to prediction-history.json"
    )
    args = parser.parse_args()

    if args.predictions_dir:
        prediction_paths = find_best_predictions(args.predictions_dir)
        if not prediction_paths:
            print("No suitable predictions found (need ones 30-90 min old), skipping.")
            sys.exit(0)
        print(f"Found {len(prediction_paths)} prediction(s) to validate")
    else:
        prediction_paths = [args.prediction]

    validate(prediction_paths, args.history)
