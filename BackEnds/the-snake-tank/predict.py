#!/usr/bin/env python3
"""Predict next-hour temperatures using the trained model.

Loads the most recent 3 readings from data/weather.db, builds a feature
vector, and prints predicted indoor and outdoor temperatures.

Usage:
    python predict.py
    python predict.py --output prediction.json
    python predict.py --predictions-dir data/predictions
"""

import argparse
import json
import os
import sqlite3
import sys
from datetime import datetime, timezone

import joblib
import numpy as np
import pandas as pd

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(SCRIPT_DIR, "data", "weather.db")
MODEL_PATH = os.path.join(SCRIPT_DIR, "models", "temp_predictor.joblib")

LOOKBACK = 3

TREND_MAP = {"down": -1, "stable": 0, "up": 1}

FEATURE_COLS = [
    "temp_indoor", "temp_outdoor", "co2", "humidity_indoor",
    "humidity_outdoor", "noise", "pressure", "temp_trend", "pressure_trend",
]


def predict(output_path=None, predictions_dir=None):
    if not os.path.exists(MODEL_PATH):
        print(f"Error: model not found at {MODEL_PATH}")
        print("Run train_model.py first.")
        sys.exit(1)

    if not os.path.exists(DB_PATH):
        print(f"Error: database not found at {DB_PATH}")
        sys.exit(1)

    conn = sqlite3.connect(DB_PATH)
    df = pd.read_sql_query(
        f"SELECT * FROM readings ORDER BY timestamp DESC LIMIT {LOOKBACK}", conn
    )
    conn.close()

    if len(df) < LOOKBACK:
        print(f"Error: need at least {LOOKBACK} readings, found {len(df)}")
        sys.exit(1)

    # Reverse to chronological order
    df = df.iloc[::-1].reset_index(drop=True)

    # Encode trends
    for col in ("temp_trend", "pressure_trend"):
        df[col] = df[col].map(TREND_MAP).fillna(0).astype(int)

    # Build feature vector
    feature_vector = df[FEATURE_COLS].values.flatten().reshape(1, -1)

    model = joblib.load(MODEL_PATH)
    prediction = model.predict(feature_vector)[0]

    last_row = df.iloc[-1]
    last_ts = int(last_row["timestamp"])
    last_dt = datetime.fromtimestamp(last_ts, tz=timezone.utc)
    last_str = last_dt.strftime("%Y-%m-%d %H:%M UTC")

    print(f"Last reading: {last_str}")
    print(f"Predicted next hour:")
    print(f"  Indoor:  {prediction[0]:.1f}\u00b0C")
    print(f"  Outdoor: {prediction[1]:.1f}\u00b0C")

    result = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "last_reading": {
            "timestamp": last_ts,
            "date": last_dt.strftime("%Y-%m-%d"),
            "hour": last_dt.hour,
            "temp_indoor": round(float(last_row["temp_indoor"]), 1),
            "temp_outdoor": round(float(last_row["temp_outdoor"]), 1),
        },
        "prediction": {
            "temp_indoor": round(float(prediction[0]), 1),
            "temp_outdoor": round(float(prediction[1]), 1),
        },
    }

    if output_path:
        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        with open(output_path, "w") as f:
            json.dump(result, f, indent=2)
            f.write("\n")
        print(f"Prediction written to {output_path}")

    if predictions_dir:
        now = datetime.now(timezone.utc)
        date_dir = os.path.join(predictions_dir, now.strftime("%Y-%m-%d"))
        os.makedirs(date_dir, exist_ok=True)
        filename = now.strftime("%H") + "00.json"
        pred_path = os.path.join(date_dir, filename)
        with open(pred_path, "w") as f:
            json.dump(result, f, indent=2)
            f.write("\n")
        print(f"Prediction written to {pred_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Predict next-hour temperatures")
    parser.add_argument("--output", help="Path to write prediction JSON file")
    parser.add_argument("--predictions-dir", help="Directory to store timestamped prediction files")
    args = parser.parse_args()
    predict(output_path=args.output, predictions_dir=args.predictions_dir)
