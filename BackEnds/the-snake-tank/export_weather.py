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
import sys
from datetime import datetime, timedelta, timezone

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, "data")
PREDICTIONS_DIR = os.path.join(DATA_DIR, "predictions")


def read_json(path):
    """Read and parse a JSON file, returning None on any error."""
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return None


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
    path = os.path.join(PREDICTIONS_DIR, date_str, f"{hour:02d}00.json")
    return read_json(path)


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


def export(output_path, hours):
    now = datetime.now(timezone.utc)
    result = {
        "generated_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "current": None,
        "next_prediction": None,
        "history": [],
    }

    # Scan backwards from current hour to find readings and build history
    current_found = False
    for i in range(hours):
        dt = now - timedelta(hours=i)
        date_str = dt.strftime("%Y-%m-%d")
        hour = dt.hour
        weather_path = os.path.join(DATA_DIR, date_str, f"{hour:02d}00.json")
        weather = read_json(weather_path)

        if weather is None:
            continue

        temps = extract_temps(weather)
        if temps is None:
            continue

        indoor, outdoor, time_utc = temps

        # Set current to the most recent reading
        if not current_found:
            current_obj = {
                "date": date_str,
                "hour": hour,
                "temp_indoor": round(indoor, 1),
                "temp_outdoor": round(outdoor, 1),
            }
            if time_utc:
                current_obj["timestamp"] = datetime.fromtimestamp(time_utc, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            result["current"] = current_obj
            current_found = True

            # Next prediction: from the current hour's prediction file (predicts H+1)
            latest_pred = read_prediction(date_str, hour)
            if latest_pred and "prediction" in latest_pred:
                pred = latest_pred["prediction"]
                # Compute prediction_for if not present
                prediction_for = pred.get("prediction_for")
                if not prediction_for:
                    next_hour = dt + timedelta(hours=1)
                    prediction_for = next_hour.strftime("%Y-%m-%dT%H:00:00Z")
                result["next_prediction"] = {
                    "prediction_for": prediction_for,
                    "temp_indoor": round(pred["temp_indoor"], 1),
                    "temp_outdoor": round(pred["temp_outdoor"], 1),
                }

        # Build history: find prediction FOR this hour (made at hour-1)
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
            if time_utc:
                entry["timestamp"] = datetime.fromtimestamp(time_utc, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            result["history"].append(entry)

    # Write output
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(result, f, indent=2)
        f.write("\n")

    print(f"Exported weather dashboard data to {output_path}")
    if result["current"]:
        print(f"  Current: {result['current']['date']} hour {result['current']['hour']}")
    print(f"  History entries: {len(result['history'])}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Export weather dashboard data")
    parser.add_argument("--output", required=True, help="Output path for weather.json")
    parser.add_argument("--hours", type=int, default=24, help="Hours of history to scan (default: 24)")
    args = parser.parse_args()
    export(args.output, args.hours)
