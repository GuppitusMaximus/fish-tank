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


def find_best_predictions(predictions_dir):
    """Find predictions that best match the current reading, one per model type.

    Looks for predictions whose 'generated_at' time is 30-90 minutes before now,
    grouped by model type, keeping the one closest to 60 minutes old per model.
    """
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

    return [path for path, _ in best_by_model.values()]


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

    for prediction_path in prediction_paths:
        prediction_data = load_prediction(prediction_path)
        if prediction_data is None:
            print(f"No prediction file at {prediction_path}, skipping.")
            continue

        print(f"Validating: {prediction_path}")
        comparison = validate_single(prediction_data, actual, history)
        if comparison:
            new_entries.append(comparison)
            # Add to history so subsequent checks see it for dedup
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
