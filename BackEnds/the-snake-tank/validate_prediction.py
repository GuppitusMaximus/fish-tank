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

    history = load_history(history_path)

    # Check for duplicate — skip if we already have this prediction
    if history and history[0].get("predicted_at") == predicted_at_str:
        print("This prediction has already been validated, skipping.")
        return

    history.insert(0, comparison)

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
    parser.add_argument("--prediction", required=True, help="Path to prediction.json")
    parser.add_argument(
        "--history", required=True, help="Path to prediction-history.json"
    )
    args = parser.parse_args()
    validate(args.prediction, args.history)
