#!/usr/bin/env python3
"""Train a temperature prediction model from weather station data.

Loads readings from data/weather.db, builds 24-hour sliding window features
using all available Netatmo sensor data (22 features), and trains a
RandomForestRegressor to predict the next hour's indoor and outdoor temperatures.

Usage:
    python train_model.py
"""

import json
import os
import sqlite3
import sys
from datetime import datetime, timezone

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error
from sklearn.model_selection import LeaveOneOut, cross_val_predict, train_test_split
from sklearn.multioutput import MultiOutputRegressor

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(SCRIPT_DIR, "data", "weather.db")
MODEL_DIR = os.path.join(SCRIPT_DIR, "models")
MODEL_PATH = os.path.join(MODEL_DIR, "temp_predictor.joblib")
META_PATH = os.path.join(MODEL_DIR, "model_meta.json")
PREV_MODEL_PATH = os.path.join(MODEL_DIR, "temp_predictor_prev.joblib")

SIMPLE_LOOKBACK = 3
SIMPLE_MODEL_PATH = os.path.join(MODEL_DIR, "temp_predictor_simple.joblib")
SIMPLE_META_PATH = os.path.join(MODEL_DIR, "simple_meta.json")

SIMPLE_FEATURE_COLS = [
    "temp_indoor", "temp_outdoor", "co2", "humidity_indoor",
    "humidity_outdoor", "noise", "pressure",
    "temp_trend", "pressure_trend",
]

LOOKBACK = 24  # hours of history
MAX_GAP = 5400  # max seconds between consecutive readings (1.5h, allows for timing drift)

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

TARGET_COLS = ["temp_indoor", "temp_outdoor"]


def load_readings():
    conn = sqlite3.connect(DB_PATH)
    df = pd.read_sql_query("SELECT * FROM readings ORDER BY timestamp", conn)
    conn.close()
    return df


def encode_trends(df):
    for col in ("temp_trend", "pressure_trend", "temp_outdoor_trend"):
        df[col] = df[col].map(TREND_MAP).fillna(0).astype(int)
    return df


def engineer_features(df):
    """Convert absolute timestamps to relative hours-since features."""
    for prefix, src_col in [
        ("hours_since_min_temp_indoor", "date_min_temp_indoor"),
        ("hours_since_max_temp_indoor", "date_max_temp_indoor"),
        ("hours_since_min_temp_outdoor", "date_min_temp_outdoor"),
        ("hours_since_max_temp_outdoor", "date_max_temp_outdoor"),
    ]:
        df[prefix] = (df["timestamp"] - df[src_col].fillna(df["timestamp"])) / 3600.0
    return df


def build_windows(df):
    timestamps = df["timestamp"].values
    features_matrix = df[FEATURE_COLS].values

    X, y = [], []

    for i in range(LOOKBACK, len(df)):
        # Check that the window is contiguous (no gaps > MAX_GAP)
        window_start = i - LOOKBACK
        contiguous = True
        for j in range(window_start, i):
            if timestamps[j + 1] - timestamps[j] > MAX_GAP:
                contiguous = False
                break
        if not contiguous:
            continue

        # Flatten the lookback window into a single feature vector
        feature_vector = features_matrix[window_start:i].flatten()
        target = df[TARGET_COLS].values[i]
        X.append(feature_vector)
        y.append(target)

    return np.array(X), np.array(y)


def build_simple_windows(df):
    """Build sliding windows for the simple 3-hour model."""
    timestamps = df["timestamp"].values
    features_matrix = df[SIMPLE_FEATURE_COLS].values

    X, y = [], []

    for i in range(SIMPLE_LOOKBACK, len(df)):
        window_start = i - SIMPLE_LOOKBACK
        contiguous = True
        for j in range(window_start, i):
            if timestamps[j + 1] - timestamps[j] > MAX_GAP:
                contiguous = False
                break
        if not contiguous:
            continue

        feature_vector = features_matrix[window_start:i].flatten()
        target = df[TARGET_COLS].values[i]
        X.append(feature_vector)
        y.append(target)

    return np.array(X), np.array(y)


def read_meta():
    """Read existing model metadata, returning defaults if not found."""
    try:
        with open(META_PATH) as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return {"version": 0}


def read_simple_meta():
    """Read existing simple model metadata, returning defaults if not found."""
    try:
        with open(SIMPLE_META_PATH) as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return {"version": 0}


def train():
    if not os.path.exists(DB_PATH):
        print(f"Error: database not found at {DB_PATH}")
        print("Run build_dataset.py first.")
        sys.exit(1)

    df = load_readings()
    print(f"Loaded {len(df)} readings from database")

    df = encode_trends(df)
    df = engineer_features(df)

    # Fill missing device health values with sensible defaults
    df["wifi_status"] = df["wifi_status"].fillna(0)
    df["battery_percent"] = df["battery_percent"].fillna(100)
    df["rf_status"] = df["rf_status"].fillna(0)

    X, y = build_windows(df)

    print(f"Built {len(X)} sliding windows (lookback={LOOKBACK}h)")

    if len(X) == 0:
        print("Not enough data: No valid training windows. Need at least 25 consecutive hourly readings.")
        print(f"Database has {len(df)} readings. Collect more data and retrain later.")
        return

    if len(X) < 2:
        print("Not enough data: Need at least 2 training windows. Collect more data and retrain later.")
        return

    if len(X) < 10:
        print(f"WARNING: Only {len(X)} samples available. Model quality will be poor.")
        print("As more hourly data accumulates, retrain for better results.")

    model = MultiOutputRegressor(RandomForestRegressor(n_estimators=100, random_state=42))

    if len(X) < 50:
        print("Using leave-one-out cross-validation (small dataset)")
        loo = LeaveOneOut()
        y_pred = cross_val_predict(model, X, y, cv=loo)
    else:
        print("Using 80/20 train/test split")
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42
        )
        model.fit(X_train, y_train)
        y_pred = model.predict(X_test)
        y = y_test

    mae_indoor = mean_absolute_error(y[:, 0], y_pred[:, 0])
    mae_outdoor = mean_absolute_error(y[:, 1], y_pred[:, 1])

    print(f"\nEvaluation:")
    print(f"  MAE indoor:  {mae_indoor:.2f}°C")
    print(f"  MAE outdoor: {mae_outdoor:.2f}°C")

    # Train final model on all data
    model.fit(X, y)

    os.makedirs(MODEL_DIR, exist_ok=True)

    # Preserve previous model for fallback
    if os.path.exists(MODEL_PATH):
        import shutil
        shutil.copy2(MODEL_PATH, PREV_MODEL_PATH)
        print(f"Previous model backed up to {PREV_MODEL_PATH}")

    # Save new model
    joblib.dump(model, MODEL_PATH)
    print(f"Model saved to {MODEL_PATH}")

    # Write model metadata with incremented version
    meta = read_meta()
    new_version = meta.get("version", 0) + 1
    new_meta = {
        "version": new_version,
        "trained_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sample_count": len(X),
        "mae_indoor": round(mae_indoor, 4),
        "mae_outdoor": round(mae_outdoor, 4),
    }
    with open(META_PATH, "w") as f:
        json.dump(new_meta, f, indent=2)
        f.write("\n")
    print(f"Model metadata written (version {new_version})")


def train_simple():
    """Train the simple 3-hour fallback model."""
    print("\n--- Simple Model (3h fallback) ---")

    if not os.path.exists(DB_PATH):
        print("Skipping simple model: no database")
        return

    df = load_readings()
    df = encode_trends(df)

    X, y = build_simple_windows(df)

    print(f"Built {len(X)} simple sliding windows (lookback={SIMPLE_LOOKBACK}h)")

    if len(X) < 2:
        print("Not enough data for simple model. Need at least 4 consecutive hourly readings.")
        return

    model = MultiOutputRegressor(RandomForestRegressor(n_estimators=100, random_state=42))

    if len(X) < 50:
        loo = LeaveOneOut()
        y_pred = cross_val_predict(model, X, y, cv=loo)
    else:
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42
        )
        model.fit(X_train, y_train)
        y_pred = model.predict(X_test)
        y = y_test

    mae_indoor = mean_absolute_error(y[:, 0], y_pred[:, 0])
    mae_outdoor = mean_absolute_error(y[:, 1], y_pred[:, 1])

    print(f"  MAE indoor:  {mae_indoor:.2f}°C")
    print(f"  MAE outdoor: {mae_outdoor:.2f}°C")

    model.fit(X, y)

    os.makedirs(MODEL_DIR, exist_ok=True)
    joblib.dump(model, SIMPLE_MODEL_PATH)
    print(f"Simple model saved to {SIMPLE_MODEL_PATH}")

    meta = read_simple_meta()
    new_version = meta.get("version", 0) + 1
    new_meta = {
        "version": new_version,
        "trained_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sample_count": len(X),
        "mae_indoor": round(mae_indoor, 4),
        "mae_outdoor": round(mae_outdoor, 4),
    }
    with open(SIMPLE_META_PATH, "w") as f:
        json.dump(new_meta, f, indent=2)
        f.write("\n")
    print(f"Simple model metadata written (version {new_version})")


if __name__ == "__main__":
    train()
    train_simple()
