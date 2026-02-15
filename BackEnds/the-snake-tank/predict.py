#!/usr/bin/env python3
"""Predict next-hour temperatures using the trained model.

Loads the most recent 24 readings from data/weather.db, builds a feature
vector using all available Netatmo sensor data, and prints predicted indoor
and outdoor temperatures.

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
from datetime import datetime, timedelta, timezone

import joblib
import numpy as np
import pandas as pd

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(SCRIPT_DIR, "data", "weather.db")
MODEL_PATH = os.path.join(SCRIPT_DIR, "models", "temp_predictor.joblib")
META_PATH = os.path.join(SCRIPT_DIR, "models", "model_meta.json")
PREV_MODEL_PATH = os.path.join(SCRIPT_DIR, "models", "temp_predictor_prev.joblib")

SIMPLE_LOOKBACK = 3
SIMPLE_MODEL_PATH = os.path.join(SCRIPT_DIR, "models", "temp_predictor_simple.joblib")
SIMPLE_META_PATH = os.path.join(SCRIPT_DIR, "models", "simple_meta.json")

SIMPLE_FEATURE_COLS = [
    "temp_indoor", "temp_outdoor", "co2", "humidity_indoor",
    "humidity_outdoor", "noise", "pressure",
    "temp_trend", "pressure_trend",
]

LOOKBACK = 24

TREND_MAP = {"down": -1, "stable": 0, "up": 1}

FEATURE_COLS = [
    "temp_indoor", "temp_outdoor", "co2", "humidity_indoor",
    "humidity_outdoor", "noise", "pressure", "pressure_absolute",
    "temp_indoor_min", "temp_indoor_max", "temp_outdoor_min", "temp_outdoor_max",
    "hours_since_min_temp_indoor", "hours_since_max_temp_indoor",
    "hours_since_min_temp_outdoor", "hours_since_max_temp_outdoor",
    "temp_trend", "pressure_trend", "temp_outdoor_trend",
    "wifi_status", "battery_percent", "rf_status",
]


def read_meta():
    """Read model metadata, returning defaults if not found."""
    try:
        with open(META_PATH) as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return {"version": 0}


def read_simple_meta():
    """Read simple model metadata, returning defaults if not found."""
    try:
        with open(SIMPLE_META_PATH) as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return {"version": 0}


def predict(output_path=None, predictions_dir=None):
    if not os.path.exists(DB_PATH):
        print(f"Error: database not found at {DB_PATH}")
        sys.exit(1)

    prediction = None
    model_version = 0
    model_type = None
    last_row = None

    # Stage 1: Try full 24h model
    if os.path.exists(MODEL_PATH):
        try:
            conn = sqlite3.connect(DB_PATH)
            df = pd.read_sql_query(
                f"SELECT * FROM readings ORDER BY timestamp DESC LIMIT {LOOKBACK}", conn
            )
            conn.close()

            if len(df) >= LOOKBACK:
                df = df.iloc[::-1].reset_index(drop=True)

                for col in ("temp_trend", "pressure_trend", "temp_outdoor_trend"):
                    df[col] = df[col].map(TREND_MAP).fillna(0).astype(int)

                for prefix, src_col in [
                    ("hours_since_min_temp_indoor", "date_min_temp_indoor"),
                    ("hours_since_max_temp_indoor", "date_max_temp_indoor"),
                    ("hours_since_min_temp_outdoor", "date_min_temp_outdoor"),
                    ("hours_since_max_temp_outdoor", "date_max_temp_outdoor"),
                ]:
                    df[prefix] = (df["timestamp"] - df[src_col].fillna(df["timestamp"])) / 3600.0

                df["wifi_status"] = df["wifi_status"].fillna(0)
                df["battery_percent"] = df["battery_percent"].fillna(100)
                df["rf_status"] = df["rf_status"].fillna(0)

                feature_vector = df[FEATURE_COLS].values.flatten().reshape(1, -1)

                meta = read_meta()
                model = joblib.load(MODEL_PATH)
                prediction = model.predict(feature_vector)[0]
                model_version = meta.get("version", 0)
                model_type = "full"
                last_row = df.iloc[-1]
                print("Using full 24h model")
        except Exception as e:
            print(f"Full model failed: {e}")

    # Stage 2: Fall back to simple 3h model
    if prediction is None and os.path.exists(SIMPLE_MODEL_PATH):
        try:
            conn = sqlite3.connect(DB_PATH)
            df = pd.read_sql_query(
                f"SELECT * FROM readings ORDER BY timestamp DESC LIMIT {SIMPLE_LOOKBACK}", conn
            )
            conn.close()

            if len(df) >= SIMPLE_LOOKBACK:
                df = df.iloc[::-1].reset_index(drop=True)

                for col in ("temp_trend", "pressure_trend", "temp_outdoor_trend"):
                    df[col] = df[col].map(TREND_MAP).fillna(0).astype(int)

                feature_vector = df[SIMPLE_FEATURE_COLS].values.flatten().reshape(1, -1)

                meta = read_simple_meta()
                model = joblib.load(SIMPLE_MODEL_PATH)
                prediction = model.predict(feature_vector)[0]
                model_version = meta.get("version", 0)
                model_type = "simple"
                last_row = df.iloc[-1]
                print("Using simple 3h fallback model")
        except Exception as e:
            print(f"Simple model also failed: {e}")

    if prediction is None:
        print("Error: no model could produce a prediction")
        sys.exit(1)

    last_ts = int(last_row["timestamp"])
    last_dt = datetime.fromtimestamp(last_ts, tz=timezone.utc)
    last_str = last_dt.strftime("%Y-%m-%d %H:%M UTC")

    print(f"Last reading: {last_str}")
    print(f"Predicted next hour:")
    print(f"  Indoor:  {prediction[0]:.1f}\u00b0C")
    print(f"  Outdoor: {prediction[1]:.1f}\u00b0C")

    result = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "model_version": model_version,
        "model_type": model_type,
        "last_reading": {
            "timestamp": last_ts,
            "date": last_dt.strftime("%Y-%m-%d"),
            "hour": last_dt.hour,
            "temp_indoor": round(float(last_row["temp_indoor"]), 1),
            "temp_outdoor": round(float(last_row["temp_outdoor"]), 1),
        },
        "prediction": {
            "prediction_for": (last_dt + timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%SZ"),
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
        filename = now.strftime("%H%M%S") + ".json"
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
