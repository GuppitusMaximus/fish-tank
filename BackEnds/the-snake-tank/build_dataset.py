#!/usr/bin/env python3
"""Build a database from raw Netatmo JSON weather data files.

Scans data/{YYYY-MM-DD}/{HHMMSS}.json files, extracts sensor readings,
and upserts them to the Postgres database for ML training.

Usage:
    python build_dataset.py
"""

import csv
import glob
import json
import os
import sys

import psycopg2
import psycopg2.extras

from config import DATA_DIR, DATABASE_URL


def _num(val):
    if val is None or val == "":
        return None
    return float(val)


def _int(val):
    if val is None or val == "":
        return None
    return int(float(val))


def parse_json_file(filepath):
    """Extract a flat reading dict from a Netatmo API response JSON file."""
    with open(filepath) as f:
        raw = json.load(f)

    if not isinstance(raw, dict):
        return None

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


def _connect():
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False
    return conn


def _csv_fetched_at(csv_path):
    """Reconstruct the fetched_at timestamp from a CSV path: YYYY-MM-DD/HHMMSS.csv."""
    parts = csv_path.replace("\\", "/").split("/")
    date_str = parts[-2]
    t = parts[-1][:6]
    return f"{date_str}T{t[:2]}:{t[2:4]}:{t[4:6]}Z"


def load_public_csv(csv_path):
    """Load one public-stations CSV and return its rows as tuples."""
    rows = []
    with open(csv_path, "r") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append((row["fetched_at"], row["station_id"],
                         _num(row["lat"]), _num(row["lon"]),
                         _num(row["temperature"]), _int(row["humidity"]), _num(row["pressure"]),
                         _num(row["rain_60min"]), _num(row["rain_24h"]),
                         _int(row["wind_strength"]), _int(row["wind_angle"]),
                         _int(row["gust_strength"]), _int(row["gust_angle"])))
    return rows


def main():
    """Scan all JSON files and upsert readings into Postgres."""
    json_files = sorted(glob.glob(os.path.join(DATA_DIR, "*", "*.json")))

    if not json_files:
        print("No JSON data files found in", DATA_DIR)
        sys.exit(1)

    total_files = len(json_files)
    print(f"Found {total_files} data files")

    BATCH_SIZE = 50

    conn = _connect()
    cur = conn.cursor()

    inserted = 0
    skipped = 0
    batch_count = 0

    for i, filepath in enumerate(json_files, 1):
        try:
            row = parse_json_file(filepath)
            if row is None or row["timestamp"] is None:
                print(f"  SKIP (no data): {filepath}")
                skipped += 1
                continue

            cur.execute(
                """INSERT INTO readings
                   (timestamp, date, hour, temp_indoor, co2, humidity_indoor,
                    noise, pressure, pressure_absolute, temp_indoor_min,
                    temp_indoor_max, date_min_temp_indoor, date_max_temp_indoor,
                    temp_trend, pressure_trend, wifi_status,
                    temp_outdoor, humidity_outdoor, temp_outdoor_min, temp_outdoor_max,
                    date_min_temp_outdoor, date_max_temp_outdoor, temp_outdoor_trend,
                    battery_percent, rf_status, battery_vp)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                           %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                   ON CONFLICT (timestamp) DO UPDATE SET
                       date = EXCLUDED.date,
                       hour = EXCLUDED.hour,
                       temp_indoor = EXCLUDED.temp_indoor,
                       co2 = EXCLUDED.co2,
                       humidity_indoor = EXCLUDED.humidity_indoor,
                       noise = EXCLUDED.noise,
                       pressure = EXCLUDED.pressure,
                       pressure_absolute = EXCLUDED.pressure_absolute,
                       temp_indoor_min = EXCLUDED.temp_indoor_min,
                       temp_indoor_max = EXCLUDED.temp_indoor_max,
                       date_min_temp_indoor = EXCLUDED.date_min_temp_indoor,
                       date_max_temp_indoor = EXCLUDED.date_max_temp_indoor,
                       temp_trend = EXCLUDED.temp_trend,
                       pressure_trend = EXCLUDED.pressure_trend,
                       wifi_status = EXCLUDED.wifi_status,
                       temp_outdoor = EXCLUDED.temp_outdoor,
                       humidity_outdoor = EXCLUDED.humidity_outdoor,
                       temp_outdoor_min = EXCLUDED.temp_outdoor_min,
                       temp_outdoor_max = EXCLUDED.temp_outdoor_max,
                       date_min_temp_outdoor = EXCLUDED.date_min_temp_outdoor,
                       date_max_temp_outdoor = EXCLUDED.date_max_temp_outdoor,
                       temp_outdoor_trend = EXCLUDED.temp_outdoor_trend,
                       battery_percent = EXCLUDED.battery_percent,
                       rf_status = EXCLUDED.rf_status,
                       battery_vp = EXCLUDED.battery_vp""",
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
            batch_count += 1

            if batch_count >= BATCH_SIZE:
                conn.commit()
                print(f"Processed {i}/{total_files} files...")
                batch_count = 0

        except psycopg2.OperationalError as e:
            print(f"  Connection error at {filepath}: {e}")
            print("  Reconnecting...")
            try:
                conn.close()
            except Exception:
                pass
            conn = _connect()
            cur = conn.cursor()
            batch_count = 0
            skipped += 1

        except (json.JSONDecodeError, KeyError, ValueError, AttributeError) as e:
            print(f"  SKIP (error): {filepath} — {e}")
            skipped += 1

    if batch_count > 0:
        conn.commit()

    # --- Sync public_stations from CSVs ---
    ps_insert_sql = """INSERT INTO public_stations
        (fetched_at, station_id, lat, lon, temperature, humidity, pressure,
         rain_60min, rain_24h, wind_strength, wind_angle, gust_strength, gust_angle)
        VALUES %s ON CONFLICT (fetched_at, station_id) DO NOTHING"""

    public_csvs = sorted(glob.glob(os.path.join(DATA_DIR, "public-stations", "*", "*.csv")))
    full_rebuild = ("--rebuild-public-stations" in sys.argv
                    or os.environ.get("PUBLIC_STATIONS_FULL_REBUILD") == "1")

    if full_rebuild:
        print("Public stations: full rebuild")
        cur.execute("DELETE FROM public_stations")
        conn.commit()
    else:
        cur.execute("SELECT MAX(fetched_at) FROM public_stations")
        max_fetched = cur.fetchone()[0]
        if max_fetched is not None:
            # >= so a partially-committed boundary cycle self-heals;
            # ON CONFLICT makes re-inserts free.
            public_csvs = [p for p in public_csvs if _csv_fetched_at(p) >= max_fetched]

    ps_count = 0
    ps_files = 0
    ps_buffer = []
    PS_FLUSH_SIZE = 5000

    def flush_public_rows():
        nonlocal conn, cur
        if not ps_buffer:
            return
        try:
            psycopg2.extras.execute_values(cur, ps_insert_sql, ps_buffer, page_size=1000)
            conn.commit()
        except psycopg2.OperationalError as e:
            print(f"  Connection error during public_stations: {e}")
            print("  Reconnecting...")
            try:
                conn.close()
            except Exception:
                pass
            conn = _connect()
            cur = conn.cursor()
            psycopg2.extras.execute_values(cur, ps_insert_sql, ps_buffer, page_size=1000)
            conn.commit()
        ps_buffer.clear()

    for csv_path in public_csvs:
        try:
            rows = load_public_csv(csv_path)
        except (KeyError, ValueError) as e:
            print(f"  SKIP (error): {csv_path} — {e}")
            continue
        ps_buffer.extend(rows)
        ps_count += len(rows)
        ps_files += 1
        if len(ps_buffer) >= PS_FLUSH_SIZE:
            flush_public_rows()

    flush_public_rows()
    print(f"Public stations: {ps_count} rows inserted from {ps_files} files")

    conn.close()
    print(f"\nDone: {inserted} readings inserted, {skipped} skipped")


if __name__ == "__main__":
    main()
