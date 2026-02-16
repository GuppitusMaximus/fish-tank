#!/usr/bin/env python3
"""Export combined weather data for the frontend dashboard.

Assembles current readings, next prediction, and recent history into a
single JSON file for the frontend to fetch and render.

Usage:
    python export_weather.py --output ../FrontEnds/the-fish-tank/data/weather.json
    python export_weather.py --output path/to/weather.json --hours 48
"""

import argparse
import json
import os
import re
import sqlite3
import sys
import tempfile
from datetime import datetime, timedelta, timezone

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, "data")
PREDICTIONS_DIR = os.path.join(DATA_DIR, "predictions")
DB_PATH = os.path.join(SCRIPT_DIR, "data", "weather.db")

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

PROPERTY_META = {
    "temp_indoor": {"label": "Indoor Temp", "unit": "°C", "format": "temperature"},
    "temp_outdoor": {"label": "Outdoor Temp", "unit": "°C", "format": "temperature"},
}


def read_json(path):
    """Read and parse a JSON file, returning None on any error."""
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return None


def _find_latest_path_for_hour(directory, hour):
    """Find the latest JSON file for a given hour in a directory.
    Matches both old HH00.json and new HHMMSS.json formats."""
    if not os.path.isdir(directory):
        return None
    prefix = f"{hour:02d}"
    candidates = sorted(
        [f for f in os.listdir(directory)
         if f.startswith(prefix) and f.endswith(".json")
         and re.match(r"^\d{4,6}\.json$", f)],
        reverse=True,
    )
    return os.path.join(directory, candidates[0]) if candidates else None


def _find_latest_for_hour(directory, hour):
    """Find and read the latest JSON file for a given hour."""
    path = _find_latest_path_for_hour(directory, hour)
    return read_json(path) if path else None


def _find_predictions_for_hour_from_db(date_str, target_hour):
    """Try to find predictions from DB for a given date and hour.
    Returns list of prediction dicts, or None if unavailable."""
    if not os.path.exists(DB_PATH):
        return None
    try:
        # Build the hour pattern: predictions generated at this hour predict for hour+1
        hour_prefix = f"{date_str}T{target_hour:02d}"

        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """SELECT model_type, model_version, for_hour,
                      temp_indoor_predicted, temp_outdoor_predicted,
                      generated_at
               FROM predictions
               WHERE generated_at LIKE ?
               GROUP BY model_type
               HAVING MAX(generated_at)""",
            (f"{hour_prefix}%",)).fetchall()
        conn.close()

        if not rows:
            return None

        results = []
        for row in rows:
            row = dict(row)
            results.append({
                "model_type": row["model_type"],
                "model_version": row["model_version"],
                "generated_at": row["generated_at"],
                "prediction": {
                    "prediction_for": row["for_hour"],
                    "temp_indoor": row["temp_indoor_predicted"],
                    "temp_outdoor": row["temp_outdoor_predicted"],
                },
            })
        return results
    except Exception:
        return None


def _find_predictions_for_hour(predictions_dir, date_str, target_hour):
    """Find all prediction files for a given hour, grouped by model type."""
    # Try DB first
    db_results = _find_predictions_for_hour_from_db(date_str, target_hour)
    if db_results:
        return db_results

    # Fall back to file scanning
    day_dir = os.path.join(predictions_dir, date_str)
    if not os.path.isdir(day_dir):
        return []

    results = []
    for fname in sorted(os.listdir(day_dir)):
        if not fname.endswith(".json"):
            continue

        # Match new format: HHMMSS_modeltype.json
        match = re.match(r'^(\d{4,6})_(\w+)\.json$', fname)
        if match:
            file_hour = int(match.group(1)[:2])
            model_type = match.group(2)
        else:
            # Match old format: HHMMSS.json (treat as "simple")
            match = re.match(r'^(\d{4,6})\.json$', fname)
            if not match:
                continue
            file_hour = int(match.group(1)[:2])
            model_type = "simple"

        if file_hour == target_hour:
            path = os.path.join(day_dir, fname)
            data = read_json(path)
            if data:
                data.setdefault("model_type", model_type)
                results.append(data)

    # Deduplicate: keep latest prediction per model_type
    latest_by_model = {}
    for pred in results:
        mt = pred.get("model_type", "simple")
        latest_by_model[mt] = pred  # sorted order means last is latest
    return list(latest_by_model.values())


def extract_temps(weather_data):
    """Extract indoor and outdoor temps and timestamp from a raw weather JSON.

    Returns (indoor, outdoor, time_utc) or None if temp data is missing/malformed.
    time_utc may be None if the timestamp field is missing.
    """
    try:
        device = weather_data["body"]["devices"][0]
        indoor = device["dashboard_data"]["Temperature"]
        time_utc = device["dashboard_data"].get("time_utc")
        outdoor = None
        for module in device.get("modules", []):
            if module.get("type") == "NAModule1":
                outdoor = module["dashboard_data"]["Temperature"]
                break
        if outdoor is None:
            return None
        return (indoor, outdoor, time_utc)
    except (KeyError, IndexError, TypeError):
        return None


def read_prediction(date_str, hour):
    """Read a prediction file for the given date and hour.

    The prediction file at hour H was generated at hour H and predicts H+1.
    Returns the parsed prediction dict or None.
    """
    date_dir = os.path.join(PREDICTIONS_DIR, date_str)
    return _find_latest_for_hour(date_dir, hour)


def read_predictions_all(date_str, hour):
    """Read all model prediction files for the given date and hour.

    Returns a list of prediction dicts, one per model.
    """
    return _find_predictions_for_hour(PREDICTIONS_DIR, date_str, hour)


def get_prediction_for_hour(date_str, hour):
    """Find the prediction that targets the given hour.

    A prediction FOR hour H was generated at hour H-1.
    Handle midnight crossover: if H=0, look at hour 23 of previous day.
    """
    if hour == 0:
        prev_date = (datetime.strptime(date_str, "%Y-%m-%d") - timedelta(days=1)).strftime("%Y-%m-%d")
        pred = read_prediction(prev_date, 23)
    else:
        pred = read_prediction(date_str, hour - 1)
    return pred


def get_predictions_for_hour_all(date_str, hour):
    """Find all model predictions that target the given hour.

    A prediction FOR hour H was generated at hour H-1.
    Handle midnight crossover: if H=0, look at hour 23 of previous day.
    """
    if hour == 0:
        prev_date = (datetime.strptime(date_str, "%Y-%m-%d") - timedelta(days=1)).strftime("%Y-%m-%d")
        return read_predictions_all(prev_date, 23)
    else:
        return read_predictions_all(date_str, hour - 1)


def _load_validated_history_from_db(hours):
    """Try to load prediction history from DB.
    Returns list of history records, or None if unavailable."""
    if not os.path.exists(DB_PATH):
        return None
    try:
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=hours)).strftime("%Y-%m-%dT%H:%M:%SZ")

        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """SELECT predicted_at, for_hour, model_type, model_version,
                      predicted_indoor, predicted_outdoor,
                      actual_indoor, actual_outdoor
               FROM prediction_history
               WHERE for_hour > ?
               ORDER BY for_hour DESC""",
            (cutoff,)).fetchall()
        conn.close()

        if not rows:
            return None

        history = []
        for row in rows:
            row = dict(row)
            for_hour_dt = datetime.strptime(row["for_hour"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
            record = {
                "date": for_hour_dt.strftime("%Y-%m-%d"),
                "hour": for_hour_dt.hour,
                "actual_indoor": row["actual_indoor"],
                "actual_outdoor": row["actual_outdoor"],
                "predicted_indoor": row["predicted_indoor"],
                "predicted_outdoor": row["predicted_outdoor"],
                "delta_indoor": round(row["actual_indoor"] - row["predicted_indoor"], 1),
                "delta_outdoor": round(row["actual_outdoor"] - row["predicted_outdoor"], 1),
                "timestamp": row["for_hour"],
            }
            if row["model_version"] is not None:
                record["model_version"] = row["model_version"]
            if row["model_type"] is not None:
                record["model_type"] = row["model_type"]
            history.append(record)
        return history
    except Exception:
        return None


def load_validated_history(history_path, hours):
    """Load prediction history from validated prediction-history.json."""
    # Try JSON file first (committed, persistent source of truth)
    data = read_json(history_path)
    if data:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
        history = []
        for entry in data:
            for_hour_str = entry.get("for_hour")
            if not for_hour_str:
                continue
            try:
                for_hour_dt = datetime.strptime(for_hour_str, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
            except ValueError:
                continue
            if for_hour_dt < cutoff:
                continue

            record = {
                "date": for_hour_dt.strftime("%Y-%m-%d"),
                "hour": for_hour_dt.hour,
                "actual_indoor": entry["actual"]["temp_indoor"],
                "actual_outdoor": entry["actual"]["temp_outdoor"],
                "predicted_indoor": entry["predicted"]["temp_indoor"],
                "predicted_outdoor": entry["predicted"]["temp_outdoor"],
                "delta_indoor": round(entry["actual"]["temp_indoor"] - entry["predicted"]["temp_indoor"], 1),
                "delta_outdoor": round(entry["actual"]["temp_outdoor"] - entry["predicted"]["temp_outdoor"], 1),
            }
            if entry.get("model_version") is not None:
                record["model_version"] = entry["model_version"]
            if entry.get("model_type") is not None:
                record["model_type"] = entry["model_type"]
            record["timestamp"] = for_hour_str
            history.append(record)

        if history:
            return history

    # Fall back to DB (local development when JSON not available)
    db_history = _load_validated_history_from_db(hours)
    if db_history:
        return db_history

    return None


def generate_manifest(output_dir):
    """Generate data-index.json listing all available readings and predictions."""
    date_re = re.compile(r"^\d{4}-\d{2}-\d{2}$")
    hour_re = re.compile(r"^(\d{4,6})\.json$")

    def scan_dir(base_dir):
        index = {}
        if not os.path.isdir(base_dir):
            return index
        for date_dir in sorted(os.listdir(base_dir), reverse=True):
            full_path = os.path.join(base_dir, date_dir)
            if not os.path.isdir(full_path) or not date_re.match(date_dir):
                continue
            hours = []
            for f in sorted(os.listdir(full_path)):
                m = hour_re.match(f)
                if m:
                    hours.append(m.group(1))
            if hours:
                index[date_dir] = hours
        return index

    manifest = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "readings": scan_dir(DATA_DIR),
        "predictions": scan_dir(PREDICTIONS_DIR),
    }

    manifest_path = os.path.join(output_dir, "data-index.json")
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")
    print(f"  Manifest: {manifest_path} ({sum(len(v) for v in manifest['readings'].values())} readings, {sum(len(v) for v in manifest['predictions'].values())} predictions)")


def export(output_path, hours, history_path=None):
    now = datetime.now(timezone.utc)
    result = {
        "generated_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "schema_version": 2,
        "property_meta": PROPERTY_META,
        "current": None,
        "predictions": [],
        "history": [],
        "next_prediction": None,
    }

    # Scan backwards from current hour to find readings and build history
    current_found = False
    for i in range(hours):
        dt = now - timedelta(hours=i)
        date_str = dt.strftime("%Y-%m-%d")
        hour = dt.hour
        weather_path = _find_latest_path_for_hour(os.path.join(DATA_DIR, date_str), hour)
        if weather_path is None:
            continue
        weather = read_json(weather_path)

        temps = extract_temps(weather)
        if temps is None:
            continue

        indoor, outdoor, time_utc = temps

        # Set current to the most recent reading
        if not current_found:
            current_obj = {
                "readings": {
                    "temp_indoor": round(indoor, 1),
                    "temp_outdoor": round(outdoor, 1),
                },
            }
            if time_utc:
                current_obj["timestamp"] = datetime.fromtimestamp(time_utc, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            result["current"] = current_obj
            current_found = True

            # Build predictions array from all available models
            all_preds = read_predictions_all(date_str, hour)
            for pred_data in all_preds:
                if "prediction" not in pred_data:
                    continue
                pred = pred_data["prediction"]
                prediction_for = pred.get("prediction_for")
                if not prediction_for:
                    next_hour = dt + timedelta(hours=1)
                    prediction_for = next_hour.strftime("%Y-%m-%dT%H:00:00Z")
                pred_entry = {
                    "model_type": pred_data.get("model_type", "simple"),
                    "model_version": pred_data.get("model_version", 0),
                    "prediction_for": prediction_for,
                    "values": {
                        "temp_indoor": round(pred["temp_indoor"], 1),
                        "temp_outdoor": round(pred["temp_outdoor"], 1),
                    },
                }
                result["predictions"].append(pred_entry)

            # Backwards compat: next_prediction from first prediction (simple preferred)
            if result["predictions"]:
                first = result["predictions"][0]
                result["next_prediction"] = {
                    "prediction_for": first["prediction_for"],
                    "temp_indoor": first["values"]["temp_indoor"],
                    "temp_outdoor": first["values"]["temp_outdoor"],
                    "model_version": first["model_version"],
                    "model_type": first["model_type"],
                }

        # Build history: find prediction FOR this hour (made at hour-1)
        if not history_path:
            pred_data = get_prediction_for_hour(date_str, hour)
            if pred_data and "prediction" in pred_data:
                pred = pred_data["prediction"]
                entry = {
                    "date": date_str,
                    "hour": hour,
                    "actual_indoor": round(indoor, 1),
                    "actual_outdoor": round(outdoor, 1),
                    "predicted_indoor": round(pred["temp_indoor"], 1),
                    "predicted_outdoor": round(pred["temp_outdoor"], 1),
                    "delta_indoor": round(indoor - pred["temp_indoor"], 1),
                    "delta_outdoor": round(outdoor - pred["temp_outdoor"], 1),
                }
                if pred_data.get("model_version") is not None:
                    entry["model_version"] = pred_data["model_version"]
                if pred_data.get("model_type") is not None:
                    entry["model_type"] = pred_data["model_type"]
                if time_utc:
                    entry["timestamp"] = datetime.fromtimestamp(time_utc, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
                result["history"].append(entry)

    # Use validated history if available
    if history_path:
        validated = load_validated_history(history_path, hours)
        if validated is not None:
            result["history"] = validated

    # Write output atomically
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    tmp_fd, tmp_path = tempfile.mkstemp(dir=os.path.dirname(os.path.abspath(output_path)), suffix='.json')
    try:
        with os.fdopen(tmp_fd, 'w') as f:
            json.dump(result, f, indent=2)
            f.write("\n")
        os.replace(tmp_path, output_path)
    except:
        os.unlink(tmp_path)
        raise

    print(f"Exported weather dashboard data to {output_path}")
    if result["current"]:
        print(f"  Current: indoor {result['current']['readings']['temp_indoor']}°C, outdoor {result['current']['readings']['temp_outdoor']}°C")
    print(f"  Predictions: {len(result['predictions'])} model(s)")
    print(f"  History entries: {len(result['history'])}")

    manifest_dir = os.path.dirname(os.path.abspath(output_path))
    generate_manifest(manifest_dir)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Export weather dashboard data")
    parser.add_argument("--output", required=True, help="Output path for weather.json")
    parser.add_argument("--hours", type=int, default=24, help="Hours of history to scan (default: 24)")
    parser.add_argument("--history", help="Path to prediction-history.json for validated history")
    args = parser.parse_args()
    export(args.output, args.hours, args.history)
