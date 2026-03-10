#!/usr/bin/env python3
"""Backfill Postgres from historical JSON/CSV data files.

Reads weather readings from data/{YYYY-MM-DD}/*.json,
public station data from data/public-stations/{YYYY-MM-DD}/*.csv,
predictions from data/predictions/{YYYY-MM-DD}/*.json,
and prediction history from data/prediction-history.json.

Idempotent — uses ON CONFLICT DO NOTHING.

Usage:
    python backfill.py
"""

import csv
import glob
import json
import os
import sys

from db import get_connection

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, "data")

READINGS_COLS = [
    "timestamp", "date", "hour", "temp_indoor", "co2", "humidity_indoor",
    "noise", "pressure", "pressure_absolute", "temp_indoor_min",
    "temp_indoor_max", "date_min_temp_indoor", "date_max_temp_indoor",
    "temp_trend", "pressure_trend", "wifi_status",
    "temp_outdoor", "humidity_outdoor", "temp_outdoor_min", "temp_outdoor_max",
    "date_min_temp_outdoor", "date_max_temp_outdoor", "temp_outdoor_trend",
    "battery_percent", "rf_status", "battery_vp",
]

PUBLIC_STATIONS_COLS = [
    "fetched_at", "station_id", "lat", "lon", "temperature", "humidity",
    "pressure", "rain_60min", "rain_24h", "wind_strength", "wind_angle",
    "gust_strength", "gust_angle",
]


def _num(val):
    if val is None or val == "":
        return None
    return float(val)


def _int(val):
    if val is None or val == "":
        return None
    return int(float(val))


def parse_json_file(filepath):
    with open(filepath) as f:
        raw = json.load(f)

    devices = raw.get("body", {}).get("devices", [])
    if not devices:
        return None

    device = devices[0]
    indoor = device.get("dashboard_data", {})

    outdoor_dash = {}
    outdoor_meta = {}
    for module in device.get("modules", []):
        if module.get("type") == "NAModule1":
            outdoor_dash = module.get("dashboard_data", {})
            outdoor_meta = module
            break

    parts = filepath.replace("\\", "/").split("/")
    date_str = parts[-2]
    hour = int(parts[-1][:2])

    return {
        "timestamp": indoor.get("time_utc"),
        "date": date_str,
        "hour": hour,
        "temp_indoor": indoor.get("Temperature"),
        "co2": indoor.get("CO2"),
        "humidity_indoor": indoor.get("Humidity"),
        "noise": indoor.get("Noise"),
        "pressure": indoor.get("Pressure"),
        "pressure_absolute": indoor.get("AbsolutePressure"),
        "temp_indoor_min": indoor.get("min_temp"),
        "temp_indoor_max": indoor.get("max_temp"),
        "date_min_temp_indoor": indoor.get("date_min_temp"),
        "date_max_temp_indoor": indoor.get("date_max_temp"),
        "temp_trend": indoor.get("temp_trend"),
        "pressure_trend": indoor.get("pressure_trend"),
        "wifi_status": device.get("wifi_status"),
        "temp_outdoor": outdoor_dash.get("Temperature"),
        "humidity_outdoor": outdoor_dash.get("Humidity"),
        "temp_outdoor_min": outdoor_dash.get("min_temp"),
        "temp_outdoor_max": outdoor_dash.get("max_temp"),
        "date_min_temp_outdoor": outdoor_dash.get("date_min_temp"),
        "date_max_temp_outdoor": outdoor_dash.get("date_max_temp"),
        "temp_outdoor_trend": outdoor_dash.get("temp_trend"),
        "battery_percent": outdoor_meta.get("battery_percent"),
        "rf_status": outdoor_meta.get("rf_status"),
        "battery_vp": outdoor_meta.get("battery_vp"),
    }


def backfill_readings(cur):
    json_files = sorted(glob.glob(os.path.join(DATA_DIR, "*", "*.json")))
    if not json_files:
        print("No reading JSON files found")
        return 0

    placeholders = ", ".join(["%s"] * len(READINGS_COLS))
    cols = ", ".join(READINGS_COLS)
    sql = f"INSERT INTO readings ({cols}) VALUES ({placeholders}) ON CONFLICT (timestamp) DO NOTHING"

    inserted = 0
    skipped = 0
    for filepath in json_files:
        try:
            row = parse_json_file(filepath)
            if row is None or row["timestamp"] is None:
                skipped += 1
                continue
            cur.execute(sql, [row[c] for c in READINGS_COLS])
            if cur.rowcount > 0:
                inserted += 1
        except (json.JSONDecodeError, KeyError, ValueError):
            skipped += 1

    print(f"Readings: {inserted} inserted, {skipped} skipped ({len(json_files)} files)")
    return inserted


def backfill_public_stations(cur):
    csv_files = sorted(glob.glob(os.path.join(DATA_DIR, "public-stations", "*", "*.csv")))
    if not csv_files:
        print("No public station CSV files found")
        return 0

    cols = ", ".join(PUBLIC_STATIONS_COLS)
    placeholders = ", ".join(["%s"] * len(PUBLIC_STATIONS_COLS))
    sql = f"INSERT INTO public_stations ({cols}) VALUES ({placeholders}) ON CONFLICT (fetched_at, station_id) DO NOTHING"

    inserted = 0
    for csv_path in csv_files:
        with open(csv_path) as f:
            reader = csv.DictReader(f)
            for row in reader:
                cur.execute(sql, [
                    row["fetched_at"], row["station_id"],
                    _num(row["lat"]), _num(row["lon"]),
                    _num(row["temperature"]), _int(row["humidity"]),
                    _num(row["pressure"]),
                    _num(row["rain_60min"]), _num(row["rain_24h"]),
                    _int(row["wind_strength"]), _int(row["wind_angle"]),
                    _int(row["gust_strength"]), _int(row["gust_angle"]),
                ])
                if cur.rowcount > 0:
                    inserted += 1

    print(f"Public stations: {inserted} rows from {len(csv_files)} files")
    return inserted


def backfill_predictions(cur):
    pred_files = sorted(glob.glob(os.path.join(DATA_DIR, "predictions", "*", "*.json")))
    if not pred_files:
        print("No prediction JSON files found")
        return 0

    sql = """INSERT INTO predictions
             (generated_at, model_type, model_version, for_hour,
              temp_indoor_predicted, temp_outdoor_predicted,
              last_reading_ts, last_reading_temp_indoor, last_reading_temp_outdoor)
             VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
             ON CONFLICT (generated_at, model_type, for_hour) DO NOTHING"""

    inserted = 0
    skipped = 0
    for filepath in pred_files:
        try:
            with open(filepath) as f:
                p = json.load(f)
            pred = p.get("prediction", {})
            lr = p.get("last_reading", {})
            cur.execute(sql, (
                p.get("generated_at"),
                p.get("model_type"),
                p.get("model_version"),
                pred.get("prediction_for"),
                pred.get("temp_indoor"),
                pred.get("temp_outdoor"),
                lr.get("timestamp"),
                lr.get("temp_indoor"),
                lr.get("temp_outdoor"),
            ))
            if cur.rowcount > 0:
                inserted += 1
        except (json.JSONDecodeError, KeyError, ValueError):
            skipped += 1

    print(f"Predictions: {inserted} inserted, {skipped} skipped ({len(pred_files)} files)")
    return inserted


def backfill_prediction_history(cur):
    history_path = os.path.join(DATA_DIR, "prediction-history.json")
    if not os.path.exists(history_path):
        print("No prediction-history.json found")
        return 0

    with open(history_path) as f:
        history = json.load(f)

    sql = """INSERT INTO prediction_history
             (predicted_at, for_hour, model_type, model_version,
              predicted_indoor, predicted_outdoor,
              actual_indoor, actual_outdoor,
              error_indoor, error_outdoor)
             VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
             ON CONFLICT (model_type, for_hour) DO NOTHING"""

    inserted = 0
    for entry in history:
        predicted = entry.get("predicted", {})
        actual = entry.get("actual", {})
        error = entry.get("error", {})
        cur.execute(sql, (
            entry.get("predicted_at"),
            entry.get("for_hour"),
            entry.get("model_type"),
            entry.get("model_version"),
            predicted.get("temp_indoor"),
            predicted.get("temp_outdoor"),
            actual.get("temp_indoor"),
            actual.get("temp_outdoor"),
            error.get("temp_indoor"),
            error.get("temp_outdoor"),
        ))
        if cur.rowcount > 0:
            inserted += 1

    print(f"Prediction history: {inserted} of {len(history)} entries inserted")
    return inserted


def backfill():
    with get_connection() as conn:
        with conn.cursor() as cur:
            backfill_readings(cur)
            backfill_public_stations(cur)
            backfill_predictions(cur)
            backfill_prediction_history(cur)
        conn.commit()
    print("\nBackfill complete.")


if __name__ == "__main__":
    backfill()
