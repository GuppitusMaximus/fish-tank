"""Spatial features from nearby public Netatmo weather stations.

Queries the public_stations table in weather.db and computes regional
statistics for each reading timestamp in a lookback window. Used by
both predict.py and train_model.py to ensure feature consistency.
"""

import sqlite3

# Full spatial features (used by 24hrRaw model)
SPATIAL_COLS_FULL = [
    "regional_avg_temp",
    "regional_temp_delta",
    "regional_temp_spread",
    "regional_avg_humidity",
    "regional_avg_pressure",
    "regional_station_count",
]

# Reduced spatial features (used by 3hrRaw and 6hrRC models)
SPATIAL_COLS_SIMPLE = [
    "regional_avg_temp",
    "regional_temp_delta",
    "regional_station_count",
]

# Enriched spatial features (used by GB model — includes rain and wind)
SPATIAL_COLS_ENRICHED = SPATIAL_COLS_FULL + [
    "regional_avg_rain_60min",
    "regional_avg_rain_24h",
    "regional_avg_wind_strength",
    "regional_avg_gust_strength",
]


def _has_public_stations(conn):
    """Check if the public_stations table exists and has data."""
    tables = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='public_stations'"
    ).fetchall()
    if not tables:
        return False
    count = conn.execute("SELECT COUNT(*) FROM public_stations").fetchone()[0]
    return count > 0


def _get_features_for_timestamp(conn, timestamp, temp_outdoor):
    """Compute spatial features for a single reading timestamp.

    Queries public stations within +/-30 minutes of the timestamp.
    Returns a dict with all SPATIAL_COLS_FULL keys.
    """
    rows = conn.execute("""
        SELECT temperature, humidity, pressure,
               rain_60min, rain_24h, wind_strength, gust_strength
        FROM public_stations
        WHERE abs(cast(strftime('%%s', fetched_at) as integer) - ?) < 1800
          AND temperature IS NOT NULL
    """, (int(timestamp),)).fetchall()

    if not rows:
        return {col: 0.0 for col in SPATIAL_COLS_ENRICHED}

    temps = [r[0] for r in rows]
    humids = [r[1] for r in rows if r[1] is not None]
    pressures = [r[2] for r in rows if r[2] is not None]
    rains_60 = [r[3] for r in rows if r[3] is not None]
    rains_24 = [r[4] for r in rows if r[4] is not None]
    winds = [r[5] for r in rows if r[5] is not None]
    gusts = [r[6] for r in rows if r[6] is not None]

    avg_temp = sum(temps) / len(temps)

    return {
        "regional_avg_temp": avg_temp,
        "regional_temp_delta": (temp_outdoor - avg_temp) if temp_outdoor else 0.0,
        "regional_temp_spread": max(temps) - min(temps) if len(temps) > 1 else 0.0,
        "regional_avg_humidity": sum(humids) / len(humids) if humids else 0.0,
        "regional_avg_pressure": sum(pressures) / len(pressures) if pressures else 0.0,
        "regional_station_count": float(len(rows)),
        "regional_avg_rain_60min": sum(rains_60) / len(rains_60) if rains_60 else 0.0,
        "regional_avg_rain_24h": sum(rains_24) / len(rains_24) if rains_24 else 0.0,
        "regional_avg_wind_strength": sum(winds) / len(winds) if winds else 0.0,
        "regional_avg_gust_strength": sum(gusts) / len(gusts) if gusts else 0.0,
    }


def add_spatial_columns(db_path, df):
    """Add spatial feature columns to a readings DataFrame.

    For each row, queries public_stations for readings within +/-30 minutes
    of the row's timestamp and computes regional statistics.

    If public_stations table doesn't exist or has no data, all spatial
    columns are filled with 0.0 (models learn to ignore zero features).

    Args:
        db_path: Path to weather.db
        df: pandas DataFrame with 'timestamp' and 'temp_outdoor' columns

    Returns:
        The same DataFrame with spatial columns added.
    """
    # Initialize all spatial columns to 0.0
    for col in SPATIAL_COLS_ENRICHED:
        if col not in df.columns:
            df[col] = 0.0

    conn = sqlite3.connect(db_path)

    if not _has_public_stations(conn):
        conn.close()
        return df

    for idx in range(len(df)):
        ts = df.iloc[idx]["timestamp"]
        temp_outdoor = df.iloc[idx].get("temp_outdoor")
        features = _get_features_for_timestamp(conn, ts, temp_outdoor)
        for col in SPATIAL_COLS_ENRICHED:
            if col in features:
                df.iat[idx, df.columns.get_loc(col)] = features[col]

    conn.close()
    return df
