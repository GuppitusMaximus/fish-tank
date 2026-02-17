#!/usr/bin/env python3
"""Predict next-hour temperatures using the trained model.

Loads the most recent readings from data/weather.db, builds a feature
vector using available Netatmo sensor data, and outputs predicted indoor
and outdoor temperatures.

Usage:
    python predict.py
    python predict.py --model-type simple --predictions-dir data/predictions
    python predict.py --model-type all --predictions-dir data/predictions
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

from public_features import SPATIAL_COLS_FULL, SPATIAL_COLS_SIMPLE, SPATIAL_COLS_ENRICHED, add_spatial_columns

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(SCRIPT_DIR, "data", "weather.db")
MODEL_PATH = os.path.join(SCRIPT_DIR, "models", "temp_predictor.joblib")
META_PATH = os.path.join(SCRIPT_DIR, "models", "model_meta.json")
PREV_MODEL_PATH = os.path.join(SCRIPT_DIR, "models", "temp_predictor_prev.joblib")

SIMPLE_LOOKBACK = 3
SIMPLE_MODEL_PATH = os.path.join(SCRIPT_DIR, "models", "temp_predictor_simple.joblib")
SIMPLE_META_PATH = os.path.join(SCRIPT_DIR, "models", "simple_meta.json")

RC_LOOKBACK = 6
RC_MODEL_PATH = os.path.join(SCRIPT_DIR, "models", "temp_predictor_6hr_rc.joblib")
RC_META_PATH = os.path.join(SCRIPT_DIR, "models", "6hr_rc_meta.json")
HISTORY_PATH = os.path.join(SCRIPT_DIR, "data", "prediction-history.json")

GB_LOOKBACK = 24
GB_MODEL_PATH = os.path.join(SCRIPT_DIR, "models", "temp_predictor_gb.joblib")
GB_META_PATH = os.path.join(SCRIPT_DIR, "models", "gb_meta.json")

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

# Combined feature lists: base columns + spatial columns
SIMPLE_ALL_COLS = SIMPLE_FEATURE_COLS + SPATIAL_COLS_SIMPLE
FULL_ALL_COLS = FEATURE_COLS + SPATIAL_COLS_FULL
RC_ALL_COLS = SIMPLE_FEATURE_COLS + SPATIAL_COLS_SIMPLE  # 6hrRC uses simple base + spatial

GB_FEATURE_COLS = FEATURE_COLS + ["battery_vp"]
GB_ALL_COLS = GB_FEATURE_COLS + SPATIAL_COLS_ENRICHED
RC_MODEL_TYPES = ["3hrRaw", "24hrRaw", "6hrRC"]


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


def read_6hr_rc_meta():
    """Read 6hrRC model metadata, returning defaults if not found."""
    try:
        with open(RC_META_PATH) as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return {"version": 0}


def read_gb_meta():
    """Read GB model metadata, returning defaults if not found."""
    try:
        with open(GB_META_PATH) as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return {"version": 0}


def _load_recent_errors(history_path):
    """Load prediction errors from history for 3hrRaw/simple model.
    Returns dict: hour_str -> (error_indoor, error_outdoor)"""
    if not os.path.exists(history_path):
        return {}
    try:
        with open(history_path) as f:
            history = json.load(f)
    except (OSError, json.JSONDecodeError):
        return {}

    errors = {}
    for entry in history:
        mt = entry.get("model_type", "")
        if mt not in ("3hrRaw", "simple"):
            continue
        hour_str = entry.get("for_hour", "")
        err = entry.get("error", {})
        if hour_str and err:
            errors[hour_str] = (err.get("temp_indoor", 0.0), err.get("temp_outdoor", 0.0))
    return errors


def _run_full_model():
    """Run the full 24h model. Returns (prediction, model_version, last_row) or None."""
    if not os.path.exists(MODEL_PATH):
        return None
    try:
        conn = sqlite3.connect(DB_PATH)
        df = pd.read_sql_query(
            f"SELECT * FROM readings ORDER BY timestamp DESC LIMIT {LOOKBACK}", conn
        )
        conn.close()

        if len(df) < LOOKBACK:
            print("Full model: not enough data")
            return None

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

        # Add spatial features from public stations
        df = add_spatial_columns(DB_PATH, df)

        feature_vector = df[FULL_ALL_COLS].values.flatten().reshape(1, -1)

        meta = read_meta()
        model = joblib.load(MODEL_PATH)
        prediction = model.predict(feature_vector)[0]
        print("Using 24hrRaw model")
        return (prediction, meta.get("version", 0), df.iloc[-1])
    except Exception as e:
        print(f"Full model failed: {e}")
        return None


def _run_simple_model():
    """Run the simple 3h model. Returns (prediction, model_version, last_row) or None."""
    if not os.path.exists(SIMPLE_MODEL_PATH):
        return None
    try:
        conn = sqlite3.connect(DB_PATH)
        df = pd.read_sql_query(
            f"SELECT * FROM readings ORDER BY timestamp DESC LIMIT {SIMPLE_LOOKBACK}", conn
        )
        conn.close()

        if len(df) < SIMPLE_LOOKBACK:
            print("Simple model: not enough data")
            return None

        df = df.iloc[::-1].reset_index(drop=True)

        for col in ("temp_trend", "pressure_trend", "temp_outdoor_trend"):
            df[col] = df[col].map(TREND_MAP).fillna(0).astype(int)

        # Add spatial features from public stations
        df = add_spatial_columns(DB_PATH, df)

        feature_vector = df[SIMPLE_ALL_COLS].values.flatten().reshape(1, -1)

        meta = read_simple_meta()
        model = joblib.load(SIMPLE_MODEL_PATH)
        prediction = model.predict(feature_vector)[0]
        print("Using 3hrRaw model")
        return (prediction, meta.get("version", 0), df.iloc[-1])
    except Exception as e:
        print(f"Simple model failed: {e}")
        return None


def _run_6hr_rc_model():
    """Run the 6hrRC residual correction model. Returns (prediction, model_version, last_row) or None."""
    if not os.path.exists(RC_MODEL_PATH):
        return None
    try:
        conn = sqlite3.connect(DB_PATH)
        df = pd.read_sql_query(
            f"SELECT * FROM readings ORDER BY timestamp DESC LIMIT {RC_LOOKBACK}", conn
        )
        conn.close()

        if len(df) < RC_LOOKBACK:
            print("6hrRC model: not enough data")
            return None

        df = df.iloc[::-1].reset_index(drop=True)

        for col in ("temp_trend", "pressure_trend", "temp_outdoor_trend"):
            df[col] = df[col].map(TREND_MAP).fillna(0).astype(int)

        # Add spatial features from public stations
        df = add_spatial_columns(DB_PATH, df)

        # Base features: (9 + 3 spatial) x 6 = 72
        base_features = df[RC_ALL_COLS].values.flatten()

        # Error features from prediction history
        error_lookup = _load_recent_errors(HISTORY_PATH)
        timestamps = df["timestamp"].values
        error_indoor_lags = []
        error_outdoor_lags = []
        for lag in range(1, RC_LOOKBACK + 1):
            lag_ts = timestamps[RC_LOOKBACK - lag]
            lag_dt = datetime.fromtimestamp(float(lag_ts), tz=timezone.utc)
            lag_hour_str = lag_dt.strftime("%Y-%m-%dT%H:%M:%SZ")
            err = error_lookup.get(lag_hour_str, (0.0, 0.0))
            error_indoor_lags.append(err[0])
            error_outdoor_lags.append(err[1])

        nonzero_indoor = [e for e in error_indoor_lags if e != 0.0]
        nonzero_outdoor = [e for e in error_outdoor_lags if e != 0.0]
        avg_indoor = sum(nonzero_indoor) / len(nonzero_indoor) if nonzero_indoor else 0.0
        avg_outdoor = sum(nonzero_outdoor) / len(nonzero_outdoor) if nonzero_outdoor else 0.0

        error_features = error_indoor_lags + error_outdoor_lags + [avg_indoor, avg_outdoor]

        feature_vector = np.concatenate([base_features, error_features]).reshape(1, -1)

        meta = read_6hr_rc_meta()
        model = joblib.load(RC_MODEL_PATH)
        prediction = model.predict(feature_vector)[0]
        print("Using 6hrRC model")
        return (prediction, meta.get("version", 0), df.iloc[-1])
    except Exception as e:
        print(f"6hrRC model failed: {e}")
        return None


def _get_prediction_error(model_type, hour_str):
    """Look up prediction error for a specific model and hour from DB."""
    try:
        conn = sqlite3.connect(DB_PATH)
        row = conn.execute(
            "SELECT error_indoor, error_outdoor FROM prediction_history WHERE model_type = ? AND for_hour = ?",
            (model_type, hour_str),
        ).fetchone()
        conn.close()
        if row:
            return (row[0] or 0.0, row[1] or 0.0)
    except Exception:
        pass
    return (0.0, 0.0)


def _run_gb_model():
    """Run the 24hr_pubRA_RC3_GB gradient-boosted model."""
    if not os.path.exists(GB_MODEL_PATH):
        return None
    try:
        conn = sqlite3.connect(DB_PATH)
        df = pd.read_sql_query(
            f"SELECT * FROM readings ORDER BY timestamp DESC LIMIT {GB_LOOKBACK}",
            conn,
        )
        conn.close()

        if len(df) < GB_LOOKBACK:
            print("  GB model: not enough readings")
            return None

        df = df.sort_values("timestamp").reset_index(drop=True)

        for col in ("temp_trend", "pressure_trend", "temp_outdoor_trend"):
            df[col] = df[col].map(TREND_MAP).fillna(0).astype(int)
        for prefix, src in [
            ("hours_since_min_temp_indoor", "date_min_temp_indoor"),
            ("hours_since_max_temp_indoor", "date_max_temp_indoor"),
            ("hours_since_min_temp_outdoor", "date_min_temp_outdoor"),
            ("hours_since_max_temp_outdoor", "date_max_temp_outdoor"),
        ]:
            df[prefix] = (df["timestamp"] - df[src].fillna(df["timestamp"])) / 3600.0
        df["wifi_status"] = df["wifi_status"].fillna(0)
        df["battery_percent"] = df["battery_percent"].fillna(100)
        df["rf_status"] = df["rf_status"].fillna(0)
        df["battery_vp"] = df["battery_vp"].fillna(0)

        df = add_spatial_columns(DB_PATH, df)

        base_features = df[GB_ALL_COLS].values.flatten()

        error_features = []
        timestamps = df["timestamp"].values
        for model_type in RC_MODEL_TYPES:
            indoor_lags = []
            outdoor_lags = []
            for lag in range(1, GB_LOOKBACK + 1):
                lag_idx = GB_LOOKBACK - lag
                if lag_idx < 0 or lag_idx >= len(timestamps):
                    indoor_lags.append(0.0)
                    outdoor_lags.append(0.0)
                    continue
                lag_ts = timestamps[lag_idx]
                lag_dt = datetime.fromtimestamp(float(lag_ts), tz=timezone.utc)
                lag_hour = lag_dt.strftime("%Y-%m-%dT%H:%M:%SZ")
                err = _get_prediction_error(model_type, lag_hour)
                indoor_lags.append(err[0])
                outdoor_lags.append(err[1])

            nonzero_in = [e for e in indoor_lags if e != 0.0]
            nonzero_out = [e for e in outdoor_lags if e != 0.0]
            avg_in = sum(nonzero_in) / len(nonzero_in) if nonzero_in else 0.0
            avg_out = sum(nonzero_out) / len(nonzero_out) if nonzero_out else 0.0
            error_features.extend(indoor_lags + outdoor_lags + [avg_in, avg_out])

        feature_vector = np.concatenate([base_features, error_features]).reshape(1, -1)

        meta = read_gb_meta()
        model = joblib.load(GB_MODEL_PATH)
        prediction = model.predict(feature_vector)[0]
        print("  Using 24hr_pubRA_RC3_GB model")
        return (prediction, meta.get("version", 0), df.iloc[-1])
    except Exception as e:
        print(f"  GB model failed: {e}")
        return None


def _build_result(prediction, model_version, model_type, last_row):
    """Build a prediction result dict."""
    last_ts = int(last_row["timestamp"])
    last_dt = datetime.fromtimestamp(last_ts, tz=timezone.utc)
    return {
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


def _write_prediction(result, predictions_dir, model_type):
    """Write a prediction to the predictions directory with model-typed filename."""
    now = datetime.now(timezone.utc)
    date_dir = os.path.join(predictions_dir, now.strftime("%Y-%m-%d"))
    os.makedirs(date_dir, exist_ok=True)
    timestamp = now.strftime("%H%M%S")

    # Write model-typed file: HHMMSS_modeltype.json
    typed_filename = f"{timestamp}_{model_type}.json"
    typed_path = os.path.join(date_dir, typed_filename)
    with open(typed_path, "w") as f:
        json.dump(result, f, indent=2)
        f.write("\n")
    print(f"Prediction written to {typed_path}")

    # Backwards compat: also write old HHMMSS.json for simple model
    if model_type == "3hrRaw":
        compat_filename = f"{timestamp}.json"
        compat_path = os.path.join(date_dir, compat_filename)
        with open(compat_path, "w") as f:
            json.dump(result, f, indent=2)
            f.write("\n")
        print(f"Compat prediction written to {compat_path}")

    # Write to predictions table in weather.db
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.execute(PREDICTIONS_TABLE_SQL)
        conn.execute(
            """INSERT INTO predictions
            (generated_at, model_type, model_version, for_hour,
             temp_indoor_predicted, temp_outdoor_predicted,
             last_reading_ts, last_reading_temp_indoor, last_reading_temp_outdoor)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (result["generated_at"], model_type, result["model_version"],
             result["prediction"]["prediction_for"],
             result["prediction"]["temp_indoor"], result["prediction"]["temp_outdoor"],
             result["last_reading"]["timestamp"],
             result["last_reading"]["temp_indoor"], result["last_reading"]["temp_outdoor"]))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Warning: failed to write prediction to DB: {e}")


def predict(output_path=None, predictions_dir=None, model_type_filter="all"):
    if not os.path.exists(DB_PATH):
        print(f"Error: database not found at {DB_PATH}")
        sys.exit(1)

    models_to_run = []
    if model_type_filter == "all":
        models_to_run = ["3hrRaw", "24hrRaw", "6hrRC", "24hr_pubRA_RC3_GB"]
    elif model_type_filter == "3hrRaw":
        models_to_run = ["3hrRaw"]
    elif model_type_filter == "24hrRaw":
        models_to_run = ["24hrRaw"]
    elif model_type_filter == "24hr_pubRA_RC3_GB":
        models_to_run = ["24hr_pubRA_RC3_GB"]

    results = []

    for model_name in models_to_run:
        if model_name == "24hrRaw":
            out = _run_full_model()
        elif model_name == "3hrRaw":
            out = _run_simple_model()
        elif model_name == "6hrRC":
            out = _run_6hr_rc_model()
        elif model_name == "24hr_pubRA_RC3_GB":
            out = _run_gb_model()
        else:
            continue

        if out is None:
            print(f"  {model_name} model: no prediction produced")
            continue

        prediction, model_version, last_row = out
        result = _build_result(prediction, model_version, model_name, last_row)

        last_ts = int(last_row["timestamp"])
        last_dt = datetime.fromtimestamp(last_ts, tz=timezone.utc)
        print(f"  Last reading: {last_dt.strftime('%Y-%m-%d %H:%M UTC')}")
        print(f"  Predicted next hour ({model_name}):")
        print(f"    Indoor:  {prediction[0]:.1f}\u00b0C")
        print(f"    Outdoor: {prediction[1]:.1f}\u00b0C")

        if output_path:
            os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
            with open(output_path, "w") as f:
                json.dump(result, f, indent=2)
                f.write("\n")
            print(f"Prediction written to {output_path}")

        if predictions_dir:
            _write_prediction(result, predictions_dir, model_name)

        results.append(result)

    if not results:
        print("Error: no model could produce a prediction")
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Predict next-hour temperatures")
    parser.add_argument("--output", help="Path to write prediction JSON file")
    parser.add_argument("--predictions-dir", help="Directory to store timestamped prediction files")
    parser.add_argument("--model-type", choices=["3hrRaw", "24hrRaw", "6hrRC", "24hr_pubRA_RC3_GB", "all"], default="all",
                        help="Which model to run predictions for")
    args = parser.parse_args()
    predict(output_path=args.output, predictions_dir=args.predictions_dir,
            model_type_filter=args.model_type)
