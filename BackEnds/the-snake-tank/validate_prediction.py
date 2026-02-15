#!/usr/bin/env python3
"""Validate the previous prediction against the actual reading that arrived.

Compares the prediction from prediction.json with the most recent reading
in weather.db, and appends the result to prediction-history.json.

Usage:
    python validate_prediction.py --prediction <path> --history <path>
"""

import argparse
import json
import os
import sqlite3
import sys
from datetime import datetime, timezone, timedelta

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(SCRIPT_DIR, "data", "weather.db")
MAX_HISTORY = 168  # 1 week of hourly predictions


def find_latest_prediction(predictions_dir):
    """Find the most recent prediction file in the predictions directory."""
    if not os.path.isdir(predictions_dir):
        return None
    date_dirs = sorted(
        [d for d in os.listdir(predictions_dir)
         if os.path.isdir(os.path.join(predictions_dir, d))],
        reverse=True,
    )
    for date_dir in date_dirs:
        full_dir = os.path.join(predictions_dir, date_dir)
        files = sorted(
            [f for f in os.listdir(full_dir) if f.endswith(".json")],
            reverse=True,
        )
        if files:
            return os.path.join(full_dir, files[0])
    return None


def load_prediction(path):
    if not os.path.exists(path):
        return None
    with open(path) as f:
        return json.load(f)


def load_history(path):
    if not os.path.exists(path):
        return []
    with open(path) as f:
        return json.load(f)


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


def validate(prediction_path, history_path):
    prediction_data = load_prediction(prediction_path)
    if prediction_data is None:
        print("No prediction file found, skipping validation.")
        return

    predicted_at_str = prediction_data.get("generated_at")
    predicted = prediction_data.get("prediction")
    if not predicted_at_str or not predicted:
        print("Prediction file missing required fields, skipping.")
        return

    predicted_at = datetime.strptime(predicted_at_str, "%Y-%m-%dT%H:%M:%SZ").replace(
        tzinfo=timezone.utc
    )

    actual = get_latest_reading()
    if actual is None:
        print("No readings in database, skipping validation.")
        return

    actual_dt = datetime.fromtimestamp(actual["timestamp"], tz=timezone.utc)
    diff = actual_dt - predicted_at
    diff_minutes = diff.total_seconds() / 60

    if diff_minutes < 30 or diff_minutes > 90:
        print(
            f"Actual reading is {diff_minutes:.0f} min after prediction "
            f"(need 30–90 min). Skipping validation."
        )
        return

    for_hour = predicted_at + timedelta(hours=1)
    for_hour_str = for_hour.strftime("%Y-%m-%dT%H:%M:%SZ")

    error_indoor = abs(actual["temp_indoor"] - predicted["temp_indoor"])
    error_outdoor = abs(actual["temp_outdoor"] - predicted["temp_outdoor"])

    comparison = {
        "predicted_at": predicted_at_str,
        "for_hour": for_hour_str,
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

    if prediction_data.get("model_version") is not None:
        comparison["model_version"] = prediction_data["model_version"]
    if prediction_data.get("model_type") is not None:
        comparison["model_type"] = prediction_data["model_type"]

    history = load_history(history_path)

    # Check for duplicate — skip if we already have this prediction
    if history and history[0].get("predicted_at") == predicted_at_str:
        print("This prediction has already been validated, skipping.")
        return

    history.insert(0, comparison)
    history = history[:MAX_HISTORY]

    os.makedirs(os.path.dirname(os.path.abspath(history_path)), exist_ok=True)
    with open(history_path, "w") as f:
        json.dump(history, f, indent=2)
        f.write("\n")

    print("Validation result:")
    print(f"  Predicted at:  {predicted_at_str}")
    print(f"  For hour:      {for_hour_str}")
    print(f"  Indoor:  predicted {predicted['temp_indoor']:.1f}, "
          f"actual {actual['temp_indoor']:.1f}, "
          f"error {error_indoor:.1f}")
    print(f"  Outdoor: predicted {predicted['temp_outdoor']:.1f}, "
          f"actual {actual['temp_outdoor']:.1f}, "
          f"error {error_outdoor:.1f}")
    print(f"  History written to {history_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Validate prediction against actual reading"
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--prediction", help="Path to a specific prediction file")
    group.add_argument("--predictions-dir", help="Auto-find latest prediction in this directory")
    parser.add_argument(
        "--history", required=True, help="Path to prediction-history.json"
    )
    args = parser.parse_args()

    prediction_path = args.prediction
    if args.predictions_dir:
        prediction_path = find_latest_prediction(args.predictions_dir)
        if prediction_path is None:
            print("No prediction files found, skipping validation.")
            sys.exit(0)
        print(f"Found latest prediction: {prediction_path}")
    validate(prediction_path, args.history)
