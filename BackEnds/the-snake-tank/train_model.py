#!/usr/bin/env python3
"""Train a temperature prediction model from weather station data.

Loads readings from the database, builds 24-hour sliding window features
using all available Netatmo sensor data (22 features), and trains a
RandomForestRegressor to predict the next hour's indoor and outdoor temperatures.

Usage:
    python train_model.py
"""

import json
import os
import sys
from datetime import datetime, timezone

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error
from sklearn.model_selection import LeaveOneOut, cross_val_predict, train_test_split
from sklearn.multioutput import MultiOutputRegressor

from db import get_connection
from psycopg2.extras import RealDictCursor
from public_features import SPATIAL_COLS_FULL, SPATIAL_COLS_SIMPLE, SPATIAL_COLS_ENRICHED, add_spatial_columns

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(SCRIPT_DIR, "models")
MODEL_PATH = os.path.join(MODEL_DIR, "temp_predictor.joblib")
META_PATH = os.path.join(MODEL_DIR, "model_meta.json")
PREV_MODEL_PATH = os.path.join(MODEL_DIR, "temp_predictor_prev.joblib")

SIMPLE_LOOKBACK = 3
SIMPLE_MODEL_PATH = os.path.join(MODEL_DIR, "temp_predictor_simple.joblib")
SIMPLE_META_PATH = os.path.join(MODEL_DIR, "simple_meta.json")

RC_LOOKBACK = 6
RC_MODEL_PATH = os.path.join(MODEL_DIR, "temp_predictor_6hr_rc.joblib")
RC_META_PATH = os.path.join(MODEL_DIR, "6hr_rc_meta.json")
HISTORY_PATH = os.path.join(SCRIPT_DIR, "data", "prediction-history.json")

GB_LOOKBACK = 24
GB_MIN_READINGS = 336
GB_MODEL_PATH = os.path.join(MODEL_DIR, "temp_predictor_gb.joblib")
GB_META_PATH = os.path.join(MODEL_DIR, "gb_meta.json")
GB_LASSO_PATH = os.path.join(MODEL_DIR, "lasso_rankings_24hr_pubRA_RC3_GB.json")

MULTI_HORIZONS = {
    '1h': 3,     # 3 steps × 20min = 1 hour
    '3h': 9,     # 9 steps × 20min = 3 hours
    '6h': 18,    # 18 steps × 20min = 6 hours
    '12h': 36,   # 36 steps × 20min = 12 hours
    '24h': 72,   # 72 steps × 20min = 24 hours
}

SIMPLE_FEATURE_COLS = [
    "temp_indoor", "temp_outdoor", "co2", "humidity_indoor",
    "humidity_outdoor", "noise", "pressure",
    "temp_trend", "pressure_trend",
]

LOOKBACK = 24  # hours of history
MAX_GAP = 7200  # max seconds between consecutive readings (2h, tolerates single missed hours)

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

# Combined feature lists: base columns + spatial columns
SIMPLE_ALL_COLS = SIMPLE_FEATURE_COLS + SPATIAL_COLS_SIMPLE
FULL_ALL_COLS = FEATURE_COLS + SPATIAL_COLS_FULL
RC_ALL_COLS = SIMPLE_FEATURE_COLS + SPATIAL_COLS_SIMPLE

GB_FEATURE_COLS = FEATURE_COLS + ["battery_vp"]
GB_ALL_COLS = GB_FEATURE_COLS + SPATIAL_COLS_ENRICHED
RC_MODEL_TYPES = ["3hrRaw", "24hrRaw", "6hrRC"]


def load_readings():
    with get_connection() as conn:
        df = pd.read_sql_query("SELECT * FROM readings ORDER BY timestamp", conn)
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


def build_windows(df, feature_cols=None):
    if feature_cols is None:
        feature_cols = FEATURE_COLS
    timestamps = df["timestamp"].values
    features_matrix = df[feature_cols].values

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


def build_simple_windows(df, feature_cols=None):
    """Build sliding windows for the simple 3-hour model."""
    if feature_cols is None:
        feature_cols = SIMPLE_FEATURE_COLS
    timestamps = df["timestamp"].values
    features_matrix = df[feature_cols].values

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


def _load_prediction_errors_from_db():
    """Try to load prediction errors from the DB prediction_history table.
    Returns dict: hour_str -> (error_indoor, error_outdoor), or None if unavailable."""
    try:
        with get_connection() as conn:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute(
                """SELECT for_hour, error_indoor, error_outdoor
                   FROM prediction_history
                   WHERE model_type IN ('3hrRaw', 'simple')""")
            rows = cur.fetchall()

        if not rows:
            return None

        errors = {}
        for row in rows:
            errors[row["for_hour"]] = (row["error_indoor"], row["error_outdoor"])
        return errors
    except Exception:
        return None


def load_prediction_errors(history_path):
    """Load prediction errors from history, filtered to 3hrRaw/simple model.
    Returns dict: hour_str -> (error_indoor, error_outdoor)"""
    # Try DB first
    db_errors = _load_prediction_errors_from_db()
    if db_errors:
        return db_errors

    # Fall back to JSON file
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


def load_prediction_errors_all_models():
    """Load prediction errors from all model types.
    Returns dict: (model_type, hour_str) -> (error_indoor, error_outdoor)"""
    try:
        with get_connection() as conn:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute(
                "SELECT model_type, for_hour, error_indoor, error_outdoor FROM prediction_history"
            )
            rows = cur.fetchall()
        errors = {}
        for row in rows:
            errors[(row["model_type"], row["for_hour"])] = (
                row["error_indoor"], row["error_outdoor"]
            )
        return errors
    except Exception:
        return {}


def build_gb_windows(df, error_lookup, feature_cols=None):
    """Build sliding windows for the GB model with multi-model error features."""
    if feature_cols is None:
        feature_cols = GB_ALL_COLS
    timestamps = df["timestamp"].values
    features_matrix = df[feature_cols].values

    X, y = [], []

    for i in range(GB_LOOKBACK, len(df)):
        window_start = i - GB_LOOKBACK
        contiguous = True
        for j in range(window_start, i):
            if timestamps[j + 1] - timestamps[j] > MAX_GAP:
                contiguous = False
                break
        if not contiguous:
            continue

        # Base features: (23 local + 10 spatial) x 24 hours
        base_features = features_matrix[window_start:i].flatten()

        # Error features from all 3 models
        error_features = []
        for model_type in RC_MODEL_TYPES:
            indoor_lags = []
            outdoor_lags = []
            for lag in range(1, GB_LOOKBACK + 1):
                lag_ts = timestamps[i - lag]
                lag_dt = datetime.fromtimestamp(float(lag_ts), tz=timezone.utc)
                lag_hour = lag_dt.strftime("%Y-%m-%dT%H:%M:%SZ")
                err = error_lookup.get((model_type, lag_hour), (0.0, 0.0))
                indoor_lags.append(err[0])
                outdoor_lags.append(err[1])

            nonzero_in = [e for e in indoor_lags if e != 0.0]
            nonzero_out = [e for e in outdoor_lags if e != 0.0]
            avg_in = sum(nonzero_in) / len(nonzero_in) if nonzero_in else 0.0
            avg_out = sum(nonzero_out) / len(nonzero_out) if nonzero_out else 0.0

            error_features.extend(indoor_lags + outdoor_lags + [avg_in, avg_out])

        feature_vector = np.concatenate([base_features, error_features])
        target = df[TARGET_COLS].values[i]
        X.append(feature_vector)
        y.append(target)

    return np.array(X) if X else np.array([]), np.array(y) if y else np.array([])


def build_6hr_rc_windows(df, error_lookup, feature_cols=None):
    """Build sliding windows for the 6hrRC model with error features."""
    if feature_cols is None:
        feature_cols = SIMPLE_FEATURE_COLS
    timestamps = df["timestamp"].values
    features_matrix = df[feature_cols].values

    X, y = [], []

    for i in range(RC_LOOKBACK, len(df)):
        window_start = i - RC_LOOKBACK
        contiguous = True
        for j in range(window_start, i):
            if timestamps[j + 1] - timestamps[j] > MAX_GAP:
                contiguous = False
                break
        if not contiguous:
            continue

        # Base features: 9 features x 6 hours = 54
        base_features = features_matrix[window_start:i].flatten()

        # Error features: look up prediction errors for each lag hour
        target_ts = timestamps[i]
        error_indoor_lags = []
        error_outdoor_lags = []
        for lag in range(1, RC_LOOKBACK + 1):
            lag_ts = timestamps[i - lag]
            lag_dt = datetime.fromtimestamp(float(lag_ts), tz=timezone.utc)
            lag_hour_str = lag_dt.strftime("%Y-%m-%dT%H:%M:%SZ")
            err = error_lookup.get(lag_hour_str, (0.0, 0.0))
            error_indoor_lags.append(err[0])
            error_outdoor_lags.append(err[1])

        # Average errors (over non-zero entries)
        nonzero_indoor = [e for e in error_indoor_lags if e != 0.0]
        nonzero_outdoor = [e for e in error_outdoor_lags if e != 0.0]
        avg_indoor = sum(nonzero_indoor) / len(nonzero_indoor) if nonzero_indoor else 0.0
        avg_outdoor = sum(nonzero_outdoor) / len(nonzero_outdoor) if nonzero_outdoor else 0.0

        error_features = error_indoor_lags + error_outdoor_lags + [avg_indoor, avg_outdoor]

        feature_vector = np.concatenate([base_features, error_features])
        target = df[TARGET_COLS].values[i]
        X.append(feature_vector)
        y.append(target)

    return np.array(X) if X else np.array([]), np.array(y) if y else np.array([])


def read_6hr_rc_meta():
    """Read 6hrRC model metadata, returning defaults if not found."""
    try:
        with open(RC_META_PATH) as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return {"version": 0}


def train():
    df = load_readings()
    print(f"Loaded {len(df)} readings from database")

    df = encode_trends(df)
    df = engineer_features(df)

    # Fill missing device health values with sensible defaults
    df["wifi_status"] = df["wifi_status"].fillna(0)
    df["battery_percent"] = df["battery_percent"].fillna(100)
    df["rf_status"] = df["rf_status"].fillna(0)

    # Add spatial features from public stations
    df = add_spatial_columns(df)

    X, y = build_windows(df, FULL_ALL_COLS)

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
        y_eval = y
    else:
        print("Using 80/20 train/test split")
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42
        )
        model.fit(X_train, y_train)
        y_pred = model.predict(X_test)
        y_eval = y_test

    mae_indoor = mean_absolute_error(y_eval[:, 0], y_pred[:, 0])
    mae_outdoor = mean_absolute_error(y_eval[:, 1], y_pred[:, 1])

    print(f"\nEvaluation:")
    print(f"  MAE indoor:  {mae_indoor:.2f}\u00b0C")
    print(f"  MAE outdoor: {mae_outdoor:.2f}\u00b0C")

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

    df = load_readings()
    df = encode_trends(df)

    # Add spatial features from public stations
    df = add_spatial_columns(df)

    X, y = build_simple_windows(df, SIMPLE_ALL_COLS)

    print(f"Built {len(X)} simple sliding windows (lookback={SIMPLE_LOOKBACK}h)")

    if len(X) < 2:
        print("Not enough data for simple model. Need at least 4 consecutive hourly readings.")
        return

    model = MultiOutputRegressor(RandomForestRegressor(n_estimators=100, random_state=42))

    if len(X) < 50:
        loo = LeaveOneOut()
        y_pred = cross_val_predict(model, X, y, cv=loo)
        y_eval = y
    else:
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42
        )
        model.fit(X_train, y_train)
        y_pred = model.predict(X_test)
        y_eval = y_test

    mae_indoor = mean_absolute_error(y_eval[:, 0], y_pred[:, 0])
    mae_outdoor = mean_absolute_error(y_eval[:, 1], y_pred[:, 1])

    print(f"  MAE indoor:  {mae_indoor:.2f}\u00b0C")
    print(f"  MAE outdoor: {mae_outdoor:.2f}\u00b0C")

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


def train_6hr_rc():
    """Train the 6hrRC residual correction model."""
    print("\n--- 6hrRC Model (6h + residual correction) ---")

    df = load_readings()
    df = encode_trends(df)

    # Add spatial features from public stations
    df = add_spatial_columns(df)

    error_lookup = load_prediction_errors(HISTORY_PATH)
    print(f"Loaded {len(error_lookup)} prediction error entries")

    X, y = build_6hr_rc_windows(df, error_lookup, RC_ALL_COLS)

    print(f"Built {len(X)} 6hrRC sliding windows (lookback={RC_LOOKBACK}h, features=86)")

    if len(X) < 2:
        print("Not enough data for 6hrRC model. Need at least 7 consecutive hourly readings.")
        return

    model = MultiOutputRegressor(RandomForestRegressor(n_estimators=100, random_state=42))

    if len(X) < 50:
        loo = LeaveOneOut()
        y_pred = cross_val_predict(model, X, y, cv=loo)
        y_eval = y
    else:
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42
        )
        model.fit(X_train, y_train)
        y_pred = model.predict(X_test)
        y_eval = y_test

    mae_indoor = mean_absolute_error(y_eval[:, 0], y_pred[:, 0])
    mae_outdoor = mean_absolute_error(y_eval[:, 1], y_pred[:, 1])

    print(f"  MAE indoor:  {mae_indoor:.2f}\u00b0C")
    print(f"  MAE outdoor: {mae_outdoor:.2f}\u00b0C")

    model.fit(X, y)

    os.makedirs(MODEL_DIR, exist_ok=True)
    joblib.dump(model, RC_MODEL_PATH)
    print(f"6hrRC model saved to {RC_MODEL_PATH}")

    meta = read_6hr_rc_meta()
    new_version = meta.get("version", 0) + 1
    new_meta = {
        "version": new_version,
        "trained_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sample_count": int(len(X)),
        "mae_indoor": round(mae_indoor, 4),
        "mae_outdoor": round(mae_outdoor, 4),
    }
    with open(RC_META_PATH, "w") as f:
        json.dump(new_meta, f, indent=2)
        f.write("\n")
    print(f"6hrRC model metadata written (version {new_version})")


def read_gb_meta():
    """Read GB model metadata, returning defaults if not found."""
    try:
        with open(GB_META_PATH) as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return {"version": 0}


def train_gb():
    """Train the 24hr_pubRA_RC3_GB gradient-boosted model with Lasso diagnostic."""
    print("\n--- 24hr_pubRA_RC3_GB Model (LightGBM + multi-model RC) ---")

    df = load_readings()
    if len(df) < GB_MIN_READINGS:
        print(f"Not enough data: {len(df)} readings (need {GB_MIN_READINGS}). Skipping GB model.")
        return

    df = encode_trends(df)
    df = engineer_features(df)
    df["wifi_status"] = df["wifi_status"].fillna(0)
    df["battery_percent"] = df["battery_percent"].fillna(100)
    df["rf_status"] = df["rf_status"].fillna(0)
    df["battery_vp"] = df["battery_vp"].fillna(0)

    df = add_spatial_columns(df)

    error_lookup = load_prediction_errors_all_models()
    X, y = build_gb_windows(df, error_lookup, GB_ALL_COLS)

    if len(X) == 0:
        print("No valid training windows. Skipping GB model.")
        return
    if len(X) < 2:
        print("Need at least 2 training windows. Skipping GB model.")
        return

    print(f"Training GB model with {len(X)} windows, {X.shape[1]} features")

    from lightgbm import LGBMRegressor

    if len(X) < 50:
        loo = LeaveOneOut()
        base = LGBMRegressor(
            n_estimators=200, max_depth=8, learning_rate=0.05,
            num_leaves=31, min_child_samples=5, verbosity=-1,
        )
        model = MultiOutputRegressor(base)
        preds = cross_val_predict(model, X, y, cv=loo)
        mae_indoor = mean_absolute_error(y[:, 0], preds[:, 0])
        mae_outdoor = mean_absolute_error(y[:, 1], preds[:, 1])
        model.fit(X, y)
    else:
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
        base = LGBMRegressor(
            n_estimators=200, max_depth=8, learning_rate=0.05,
            num_leaves=31, min_child_samples=10, verbosity=-1,
        )
        model = MultiOutputRegressor(base)
        model.fit(X_train, y_train)
        preds = model.predict(X_test)
        mae_indoor = mean_absolute_error(y_test[:, 0], preds[:, 0])
        mae_outdoor = mean_absolute_error(y_test[:, 1], preds[:, 1])

    print(f"  MAE indoor:  {mae_indoor:.4f}\u00b0C")
    print(f"  MAE outdoor: {mae_outdoor:.4f}\u00b0C")

    os.makedirs(MODEL_DIR, exist_ok=True)
    joblib.dump(model, GB_MODEL_PATH)

    meta = read_gb_meta()
    new_version = meta.get("version", 0) + 1
    new_meta = {
        "version": new_version,
        "trained_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sample_count": len(X),
        "feature_count": X.shape[1],
        "mae_indoor": round(mae_indoor, 4),
        "mae_outdoor": round(mae_outdoor, 4),
    }
    with open(GB_META_PATH, "w") as f:
        json.dump(new_meta, f, indent=2)
    print(f"  Saved GB model v{new_version}")

    try:
        _run_lasso_diagnostic(X, y)
    except Exception as e:
        print(f"  Lasso diagnostic skipped: {e}")


def _run_lasso_diagnostic(X, y):
    """Run Lasso regression and export feature rankings."""
    from sklearn.linear_model import Lasso
    from sklearn.preprocessing import StandardScaler

    print("  Running Lasso feature selection diagnostic...")

    mask = ~np.isnan(y).any(axis=1) if y.ndim > 1 else ~np.isnan(y)
    X = X[mask]
    y = y[mask]

    from sklearn.impute import SimpleImputer
    imputer = SimpleImputer(strategy='median')
    X = imputer.fit_transform(X)

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    lasso = MultiOutputRegressor(Lasso(alpha=0.01, max_iter=5000))
    lasso.fit(X_scaled, y)

    coefs = np.mean([est.coef_ for est in lasso.estimators_], axis=0)

    feature_names = _build_gb_feature_names()

    rankings = []
    for name, coef in zip(feature_names, coefs):
        if abs(coef) > 1e-8:
            rankings.append({"name": name, "coefficient": round(float(coef), 6)})

    rankings.sort(key=lambda r: abs(r["coefficient"]), reverse=True)

    result = {
        "model_type": "24hr_pubRA_RC3_GB",
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "feature_count": len(coefs),
        "nonzero_count": len(rankings),
        "features": rankings,
    }

    with open(GB_LASSO_PATH, "w") as f:
        json.dump(result, f, indent=2)
    print(f"  Lasso: {len(rankings)}/{len(coefs)} features with non-zero coefficients")


def _build_gb_feature_names():
    """Build ordered feature name list matching the GB feature vector layout."""
    names = []
    for lag in range(GB_LOOKBACK):
        for col in GB_ALL_COLS:
            names.append(f"{col}_lag_{lag}")
    for model_type in RC_MODEL_TYPES:
        for lag in range(1, GB_LOOKBACK + 1):
            names.append(f"rc_{model_type}_indoor_lag_{lag}")
        for lag in range(1, GB_LOOKBACK + 1):
            names.append(f"rc_{model_type}_outdoor_lag_{lag}")
        names.append(f"rc_{model_type}_avg_indoor")
        names.append(f"rc_{model_type}_avg_outdoor")
    return names


def build_multi_horizon_windows(df, horizon_steps, feature_cols=None):
    """Build sliding windows targeting horizon_steps readings into the future."""
    if feature_cols is None:
        feature_cols = GB_ALL_COLS
    timestamps = df["timestamp"].values
    features_matrix = df[feature_cols].values

    X, y = [], []

    for i in range(GB_LOOKBACK, len(df)):
        target_idx = i + horizon_steps
        if target_idx >= len(df):
            break

        # Check lookback window contiguity
        window_start = i - GB_LOOKBACK
        contiguous = True
        for j in range(window_start, i):
            if timestamps[j + 1] - timestamps[j] > MAX_GAP:
                contiguous = False
                break
        if not contiguous:
            continue

        # Check no gap > MAX_GAP between window end and target
        for j in range(i, target_idx):
            if timestamps[j + 1] - timestamps[j] > MAX_GAP:
                contiguous = False
                break
        if not contiguous:
            continue

        feature_vector = features_matrix[window_start:i].flatten()
        target = df[TARGET_COLS].values[target_idx]
        X.append(feature_vector)
        y.append(target)

    return np.array(X) if X else np.array([]), np.array(y) if y else np.array([])


def train_multi_horizon():
    """Train multi-horizon prediction models (1h, 3h, 6h, 12h, 24h)."""
    print("\n--- Multi-Horizon Models ---")

    df = load_readings()
    if len(df) < GB_MIN_READINGS:
        print(f"Not enough data: {len(df)} readings (need {GB_MIN_READINGS}). Skipping multi-horizon.")
        return

    df = encode_trends(df)
    df = engineer_features(df)
    df["wifi_status"] = df["wifi_status"].fillna(0)
    df["battery_percent"] = df["battery_percent"].fillna(100)
    df["rf_status"] = df["rf_status"].fillna(0)
    df["battery_vp"] = df["battery_vp"].fillna(0)

    df = add_spatial_columns(df)

    from lightgbm import LGBMRegressor

    for horizon_name, horizon_steps in MULTI_HORIZONS.items():
        print(f"\n  Training multiHorizon_{horizon_name} ({horizon_steps} steps ahead)...")

        X, y = build_multi_horizon_windows(df, horizon_steps, GB_ALL_COLS)

        if len(X) == 0:
            print(f"    No valid windows. Skipping {horizon_name}.")
            continue
        if len(X) < 2:
            print(f"    Only {len(X)} window(s). Skipping {horizon_name}.")
            continue

        print(f"    {len(X)} windows, {X.shape[1]} features")

        if len(X) < 50:
            loo = LeaveOneOut()
            base = LGBMRegressor(
                n_estimators=200, max_depth=8, learning_rate=0.05,
                num_leaves=31, min_child_samples=5, verbosity=-1,
            )
            model = MultiOutputRegressor(base)
            preds = cross_val_predict(model, X, y, cv=loo)
            mae_indoor = mean_absolute_error(y[:, 0], preds[:, 0])
            mae_outdoor = mean_absolute_error(y[:, 1], preds[:, 1])
            model.fit(X, y)
        else:
            X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
            base = LGBMRegressor(
                n_estimators=200, max_depth=8, learning_rate=0.05,
                num_leaves=31, min_child_samples=10, verbosity=-1,
            )
            model = MultiOutputRegressor(base)
            model.fit(X_train, y_train)
            preds = model.predict(X_test)
            mae_indoor = mean_absolute_error(y_test[:, 0], preds[:, 0])
            mae_outdoor = mean_absolute_error(y_test[:, 1], preds[:, 1])

        print(f"    MAE indoor:  {mae_indoor:.4f}°C")
        print(f"    MAE outdoor: {mae_outdoor:.4f}°C")

        # Train final model on all data (if we used train/test split)
        if len(X) >= 50:
            model.fit(X, y)

        model_path = os.path.join(MODEL_DIR, f"temp_predictor_mh_{horizon_name}.joblib")
        meta_path = os.path.join(MODEL_DIR, f"mh_{horizon_name}_meta.json")

        os.makedirs(MODEL_DIR, exist_ok=True)
        joblib.dump(model, model_path)

        meta = {
            "version": 1,
            "trained_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "sample_count": len(X),
            "feature_count": int(X.shape[1]),
            "mae_indoor": round(mae_indoor, 4),
            "mae_outdoor": round(mae_outdoor, 4),
            "horizon": horizon_name,
            "horizon_steps": horizon_steps,
        }

        # Increment version if meta already exists
        if os.path.exists(meta_path):
            try:
                with open(meta_path) as f:
                    old_meta = json.load(f)
                meta["version"] = old_meta.get("version", 0) + 1
            except (OSError, json.JSONDecodeError):
                pass

        with open(meta_path, "w") as f:
            json.dump(meta, f, indent=2)
        print(f"    Saved multiHorizon_{horizon_name} v{meta['version']}")

        # Lasso diagnostic
        try:
            _run_mh_lasso_diagnostic(X, y, horizon_name)
        except Exception as e:
            print(f"    Lasso diagnostic skipped: {e}")


def _run_mh_lasso_diagnostic(X, y, horizon_name):
    """Run Lasso regression for a multi-horizon model."""
    from sklearn.linear_model import Lasso
    from sklearn.preprocessing import StandardScaler
    from sklearn.impute import SimpleImputer

    mask = ~np.isnan(y).any(axis=1) if y.ndim > 1 else ~np.isnan(y)
    X = X[mask]
    y = y[mask]

    imputer = SimpleImputer(strategy='median')
    X = imputer.fit_transform(X)

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    lasso = MultiOutputRegressor(Lasso(alpha=0.01, max_iter=5000))
    lasso.fit(X_scaled, y)

    coefs = np.mean([est.coef_ for est in lasso.estimators_], axis=0)

    feature_names = _build_mh_feature_names()

    rankings = []
    for name, coef in zip(feature_names, coefs):
        if abs(coef) > 1e-8:
            rankings.append({"name": name, "coefficient": round(float(coef), 6)})

    rankings.sort(key=lambda r: abs(r["coefficient"]), reverse=True)

    result = {
        "model_type": f"multiHorizon_{horizon_name}",
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "feature_count": len(coefs),
        "nonzero_count": len(rankings),
        "features": rankings,
    }

    lasso_path = os.path.join(MODEL_DIR, f"lasso_rankings_mh_{horizon_name}.json")
    with open(lasso_path, "w") as f:
        json.dump(result, f, indent=2)
    print(f"    Lasso: {len(rankings)}/{len(coefs)} non-zero features")


def _build_mh_feature_names():
    """Build feature name list for multi-horizon models (same layout as GB base features)."""
    names = []
    for lag in range(GB_LOOKBACK):
        for col in GB_ALL_COLS:
            names.append(f"{col}_lag_{lag}")
    return names


def main():
    train()
    train_simple()
    train_6hr_rc()
    train_gb()
    train_multi_horizon()


if __name__ == "__main__":
    main()
