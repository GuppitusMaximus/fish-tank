#!/usr/bin/env python3
"""Fetch weather data from a Netatmo station and save the raw JSON response."""

import argparse
import csv
import glob
import json
import os
import sqlite3
import sys
import urllib.request
import urllib.error
import urllib.parse
from datetime import datetime, timezone, timedelta

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, "data")
DB_PATH = os.path.join(SCRIPT_DIR, "data", "weather.db")

PUBLIC_STATIONS_TABLE_SQL = """CREATE TABLE IF NOT EXISTS public_stations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fetched_at TEXT NOT NULL,
    station_id TEXT NOT NULL,
    lat REAL,
    lon REAL,
    temperature REAL,
    humidity INTEGER,
    pressure REAL,
    rain_60min REAL,
    rain_24h REAL,
    wind_strength INTEGER,
    wind_angle INTEGER,
    gust_strength INTEGER,
    gust_angle INTEGER
)"""


def scrub_pii(data):
    """Remove personally identifiable information from Netatmo API response."""
    if "body" not in data:
        return data

    user = data["body"].get("user")
    if user and "mail" in user:
        user["mail"] = "redacted"

    for device in data["body"].get("devices", []):
        if "_id" in device:
            device["_id"] = "redacted"
        if "home_id" in device:
            device["home_id"] = "redacted"
        if "home_name" in device:
            device["home_name"] = "redacted"

        place = device.get("place")
        if place:
            tz = place.get("timezone")
            device["place"] = {"timezone": tz} if tz else {}

        for module in device.get("modules", []):
            if "_id" in module:
                module["_id"] = "redacted"

    return data


def scrub_existing():
    """Scrub PII from all existing data files."""
    pattern = os.path.join(DATA_DIR, "*", "*.json")
    for path in sorted(glob.glob(pattern)):
        try:
            with open(path) as f:
                data = json.load(f)
            data = scrub_pii(data)
            with open(path, "w") as f:
                json.dump(data, f, indent=2)
                f.write("\n")
            print(f"Scrubbed: {path}")
        except (json.JSONDecodeError, KeyError):
            print(f"Skipped: {path}")


def refresh_access_token(client_id, client_secret, refresh_token):
    """Exchange a refresh token for a new access + refresh token pair."""
    data = urllib.parse.urlencode({
        "grant_type": "refresh_token",
        "client_id": client_id,
        "client_secret": client_secret,
        "refresh_token": refresh_token,
    }).encode()

    req = urllib.request.Request("https://api.netatmo.com/oauth2/token", data=data)
    with urllib.request.urlopen(req) as resp:
        body = json.loads(resp.read())

    return body["access_token"], body["refresh_token"]


def get_stations_data(access_token):
    """Call getstationsdata and return the parsed JSON response."""
    req = urllib.request.Request("https://api.netatmo.com/api/getstationsdata")
    req.add_header("Authorization", f"Bearer {access_token}")
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def get_public_data(access_token, lat_ne, lon_ne, lat_sw, lon_sw):
    """Fetch public station data within the bounding box from Netatmo API."""
    params = urllib.parse.urlencode({
        "lat_ne": lat_ne,
        "lon_ne": lon_ne,
        "lat_sw": lat_sw,
        "lon_sw": lon_sw,
    })
    url = f"https://api.netatmo.com/api/getpublicdata?{params}"
    req = urllib.request.Request(url)
    req.add_header("Authorization", f"Bearer {access_token}")
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def store_public_stations(data, db_path, fetched_at):
    """Parse getpublicdata response and store station readings in SQLite."""
    conn = sqlite3.connect(db_path)
    conn.execute(PUBLIC_STATIONS_TABLE_SQL)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_public_stations_time ON public_stations(fetched_at)")

    count = 0
    rows_written = []
    for station in data.get("body", []):
        station_id = station.get("_id", "unknown")

        # Location: place.location is [lon, lat]
        place = station.get("place", {})
        location = place.get("location", [None, None])
        lon = location[0] if len(location) > 0 else None
        lat = location[1] if len(location) > 1 else None

        # Parse measures from different module types
        temp, humidity, pressure = None, None, None
        rain_60min, rain_24h = None, None
        wind_strength, wind_angle, gust_strength, gust_angle = None, None, None, None

        for module_mac, module_data in station.get("measures", {}).items():
            if "type" in module_data:
                # Temperature, humidity, pressure modules use type/res format
                types = module_data["type"]
                for ts_str, values in module_data.get("res", {}).items():
                    for i, t in enumerate(types):
                        if i < len(values):
                            if t == "temperature":
                                temp = values[i]
                            elif t == "humidity":
                                humidity = values[i]
                            elif t == "pressure":
                                pressure = values[i]
            elif "rain_60min" in module_data:
                rain_60min = module_data.get("rain_60min")
                rain_24h = module_data.get("rain_24h")
            elif "wind_strength" in module_data:
                wind_strength = module_data.get("wind_strength")
                wind_angle = module_data.get("wind_angle")
                gust_strength = module_data.get("gust_strength")
                gust_angle = module_data.get("gust_angle")

        conn.execute(
            """INSERT INTO public_stations
            (fetched_at, station_id, lat, lon, temperature, humidity, pressure,
             rain_60min, rain_24h, wind_strength, wind_angle, gust_strength, gust_angle)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (fetched_at, station_id, lat, lon, temp, humidity, pressure,
             rain_60min, rain_24h, wind_strength, wind_angle, gust_strength, gust_angle))
        rows_written.append((fetched_at, station_id, lat, lon, temp, humidity, pressure,
                             rain_60min, rain_24h, wind_strength, wind_angle, gust_strength, gust_angle))
        count += 1

    # Clean up data older than 30 days
    conn.execute("DELETE FROM public_stations WHERE fetched_at < datetime('now', '-30 days')")

    # Also save as CSV for persistence across runs
    if count > 0:
        now_str = fetched_at
        csv_dir = os.path.join(DATA_DIR, "public-stations", now_str[:10])
        os.makedirs(csv_dir, exist_ok=True)
        csv_path = os.path.join(csv_dir, now_str[11:19].replace(":", "") + ".csv")
        with open(csv_path, "w", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(["fetched_at", "station_id", "lat", "lon", "temperature",
                             "humidity", "pressure", "rain_60min", "rain_24h",
                             "wind_strength", "wind_angle", "gust_strength", "gust_angle"])
            for row in rows_written:
                writer.writerow(row)

    conn.commit()
    conn.close()
    print(f"Stored {count} public station readings")

    # Clean up CSV files older than 30 days
    public_dir = os.path.join(DATA_DIR, "public-stations")
    if os.path.isdir(public_dir):
        cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%d")
        for dirname in os.listdir(public_dir):
            if dirname < cutoff:
                dir_path = os.path.join(public_dir, dirname)
                if os.path.isdir(dir_path):
                    import shutil
                    shutil.rmtree(dir_path)


def main():
    client_id = os.environ["NETATMO_CLIENT_ID"]
    client_secret = os.environ["NETATMO_CLIENT_SECRET"]
    refresh_token = os.environ["NETATMO_REFRESH_TOKEN"]

    # --- Token refresh ---
    print("Refreshing access token...")
    access_token, new_refresh_token = refresh_access_token(
        client_id, client_secret, refresh_token
    )
    print("Token refreshed successfully.")

    # Persist the new refresh token so the workflow can update the secret.
    with open("new_refresh_token.txt", "w") as f:
        f.write(new_refresh_token)

    # --- Fetch weather data ---
    print("Fetching station data...")
    data = get_stations_data(access_token)
    print("Station data received.")

    # --- Scrub PII before saving ---
    data = scrub_pii(data)

    # --- Save to the-snake-tank/data/{YYYY-MM-DD}/{HHMMSS}.json ---
    now = datetime.now(timezone.utc)
    date_dir = now.strftime("%Y-%m-%d")
    filename = now.strftime("%H%M%S") + ".json"

    out_dir = os.path.join(DATA_DIR, date_dir)
    os.makedirs(out_dir, exist_ok=True)

    out_path = os.path.join(out_dir, filename)
    with open(out_path, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")

    print(f"Saved weather data to {out_path}")

    # --- Fetch public station data (optional) ---
    lat_ne = os.environ.get("NETATMO_PUBLIC_LAT_NE")
    lon_ne = os.environ.get("NETATMO_PUBLIC_LON_NE")
    lat_sw = os.environ.get("NETATMO_PUBLIC_LAT_SW")
    lon_sw = os.environ.get("NETATMO_PUBLIC_LON_SW")

    if all([lat_ne, lon_ne, lat_sw, lon_sw]):
        try:
            print("Fetching public station data...")
            public_data = get_public_data(access_token, lat_ne, lon_ne, lat_sw, lon_sw)
            fetched_at = now.strftime("%Y-%m-%dT%H:%M:%SZ")
            store_public_stations(public_data, DB_PATH, fetched_at)
        except Exception as e:
            print(f"Warning: public station fetch failed: {e}")
    else:
        print("Public station fetch skipped — bounding box not configured")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fetch Netatmo weather data")
    parser.add_argument("--scrub-existing", action="store_true",
                        help="Scrub PII from all existing data files and exit")
    args = parser.parse_args()

    if args.scrub_existing:
        scrub_existing()
    else:
        try:
            main()
        except Exception as e:
            print(f"Error: {e}", file=sys.stderr)
            sys.exit(1)
