#!/usr/bin/env python3
"""Predict next-hour temperatures using the trained model.

Loads the most recent 3 readings from data/weather.db, builds a feature
vector, and prints predicted indoor and outdoor temperatures.

Usage:
    python predict.py
"""

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


def predict():
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

    last_ts = df["timestamp"].iloc[-1]
    last_dt = datetime.fromtimestamp(last_ts, tz=timezone.utc)
    last_str = last_dt.strftime("%Y-%m-%d %H:%M UTC")

    print(f"Last reading: {last_str}")
    print(f"Predicted next hour:")
    print(f"  Indoor:  {prediction[0]:.1f}\u00b0C")
    print(f"  Outdoor: {prediction[1]:.1f}\u00b0C")


if __name__ == "__main__":
    predict()
