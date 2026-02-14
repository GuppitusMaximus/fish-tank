#!/usr/bin/env python3
"""Build a SQLite database from raw Netatmo JSON weather data files.

Scans data/{YYYY-MM-DD}/{HH}00.json files, extracts sensor readings,
and writes them to data/weather.db for ML training.

Usage:
    python build_dataset.py
"""

import glob
import json
import os
import sqlite3
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, "data")
DB_PATH = os.path.join(DATA_DIR, "weather.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS readings (
    timestamp             INTEGER PRIMARY KEY,
    date                  TEXT NOT NULL,
    hour                  INTEGER NOT NULL,
    temp_indoor            REAL,
    co2                    INTEGER,
    humidity_indoor        INTEGER,
    noise                  INTEGER,
    pressure               REAL,
    pressure_absolute      REAL,
    temp_indoor_min        REAL,
    temp_indoor_max        REAL,
    date_min_temp_indoor   INTEGER,
    date_max_temp_indoor   INTEGER,
    temp_trend             TEXT,
    pressure_trend         TEXT,
    wifi_status            INTEGER,
    temp_outdoor           REAL,
    humidity_outdoor       INTEGER,
    temp_outdoor_min       REAL,
    temp_outdoor_max       REAL,
    date_min_temp_outdoor  INTEGER,
    date_max_temp_outdoor  INTEGER,
    temp_outdoor_trend     TEXT,
    battery_percent        INTEGER,
    rf_status              INTEGER,
    battery_vp             INTEGER
);
"""


def parse_json_file(filepath):
    """Extract a flat reading dict from a Netatmo API response JSON file."""
    with open(filepath) as f:
        raw = json.load(f)

    devices = raw.get("body", {}).get("devices", [])
    if not devices:
        return None

    device = devices[0]
    indoor = device.get("dashboard_data", {})

    # Find the outdoor module (NAModule1)
    outdoor_dash = {}
    outdoor_meta = {}
    for module in device.get("modules", []):
        if module.get("type") == "NAModule1":
            outdoor_dash = module.get("dashboard_data", {})
            outdoor_meta = module
            break

    # Derive date and hour from the file path: data/YYYY-MM-DD/HH00.json
    parts = filepath.replace("\\", "/").split("/")
    date_str = parts[-2]  # YYYY-MM-DD
    hour = int(parts[-1][:2])  # HH from HH00.json

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


def build_database():
    """Scan all JSON files and build the SQLite database."""
    json_files = sorted(glob.glob(os.path.join(DATA_DIR, "*", "*.json")))

    if not json_files:
        print("No JSON data files found in", DATA_DIR)
        sys.exit(1)

    print(f"Found {len(json_files)} data files")

    conn = sqlite3.connect(DB_PATH)
    conn.execute("DROP TABLE IF EXISTS readings")
    conn.execute(SCHEMA)

    inserted = 0
    skipped = 0

    for filepath in json_files:
        try:
            row = parse_json_file(filepath)
            if row is None or row["timestamp"] is None:
                print(f"  SKIP (no data): {filepath}")
                skipped += 1
                continue

            conn.execute(
                """INSERT OR REPLACE INTO readings
                   (timestamp, date, hour, temp_indoor, co2, humidity_indoor,
                    noise, pressure, pressure_absolute, temp_indoor_min,
                    temp_indoor_max, date_min_temp_indoor, date_max_temp_indoor,
                    temp_trend, pressure_trend, wifi_status,
                    temp_outdoor, humidity_outdoor, temp_outdoor_min, temp_outdoor_max,
                    date_min_temp_outdoor, date_max_temp_outdoor, temp_outdoor_trend,
                    battery_percent, rf_status, battery_vp)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    row["timestamp"], row["date"], row["hour"],
                    row["temp_indoor"], row["co2"], row["humidity_indoor"],
                    row["noise"], row["pressure"], row["pressure_absolute"],
                    row["temp_indoor_min"], row["temp_indoor_max"],
                    row["date_min_temp_indoor"], row["date_max_temp_indoor"],
                    row["temp_trend"], row["pressure_trend"], row["wifi_status"],
                    row["temp_outdoor"], row["humidity_outdoor"],
                    row["temp_outdoor_min"], row["temp_outdoor_max"],
                    row["date_min_temp_outdoor"], row["date_max_temp_outdoor"],
                    row["temp_outdoor_trend"],
                    row["battery_percent"], row["rf_status"], row["battery_vp"],
                ),
            )
            inserted += 1
        except (json.JSONDecodeError, KeyError, ValueError) as e:
            print(f"  SKIP (error): {filepath} — {e}")
            skipped += 1

    conn.commit()
    conn.close()

    print(f"\nDone: {inserted} readings inserted, {skipped} skipped")
    print(f"Database: {DB_PATH}")


if __name__ == "__main__":
    build_database()
