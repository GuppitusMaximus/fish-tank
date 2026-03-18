#!/usr/bin/env python3
"""Create Postgres schema for the Snake Tank weather pipeline.

Creates all tables (weather + PvP) with proper Postgres types and indexes.
Idempotent — safe to run multiple times.

Usage:
    python migrate.py
"""

import sys
from db import get_connection

SCHEMA_SQL = """
-- Weather readings from Netatmo personal station
CREATE TABLE IF NOT EXISTS readings (
    timestamp             BIGINT PRIMARY KEY,
    date                  TEXT NOT NULL,
    hour                  INTEGER NOT NULL,
    temp_indoor            DOUBLE PRECISION,
    co2                    INTEGER,
    humidity_indoor        INTEGER,
    noise                  INTEGER,
    pressure               DOUBLE PRECISION,
    pressure_absolute      DOUBLE PRECISION,
    temp_indoor_min        DOUBLE PRECISION,
    temp_indoor_max        DOUBLE PRECISION,
    date_min_temp_indoor   BIGINT,
    date_max_temp_indoor   BIGINT,
    temp_trend             TEXT,
    pressure_trend         TEXT,
    wifi_status            INTEGER,
    temp_outdoor           DOUBLE PRECISION,
    humidity_outdoor       INTEGER,
    temp_outdoor_min       DOUBLE PRECISION,
    temp_outdoor_max       DOUBLE PRECISION,
    date_min_temp_outdoor  BIGINT,
    date_max_temp_outdoor  BIGINT,
    temp_outdoor_trend     TEXT,
    battery_percent        INTEGER,
    rf_status              INTEGER,
    battery_vp             INTEGER
);

-- Nearby public Netatmo station readings
CREATE TABLE IF NOT EXISTS public_stations (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    fetched_at      TEXT NOT NULL,
    station_id      TEXT NOT NULL,
    lat             DOUBLE PRECISION,
    lon             DOUBLE PRECISION,
    temperature     DOUBLE PRECISION,
    humidity        INTEGER,
    pressure        DOUBLE PRECISION,
    rain_60min      DOUBLE PRECISION,
    rain_24h        DOUBLE PRECISION,
    wind_strength   INTEGER,
    wind_angle      INTEGER,
    gust_strength   INTEGER,
    gust_angle      INTEGER,
    UNIQUE(fetched_at, station_id)
);

-- ML model predictions
CREATE TABLE IF NOT EXISTS predictions (
    id                          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    generated_at                TEXT NOT NULL,
    model_type                  TEXT NOT NULL,
    model_version               INTEGER,
    for_hour                    TEXT NOT NULL,
    temp_indoor_predicted       DOUBLE PRECISION,
    temp_outdoor_predicted      DOUBLE PRECISION,
    last_reading_ts             BIGINT,
    last_reading_temp_indoor    DOUBLE PRECISION,
    last_reading_temp_outdoor   DOUBLE PRECISION,
    UNIQUE(generated_at, model_type, for_hour)
);

-- Prediction validation history
CREATE TABLE IF NOT EXISTS prediction_history (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    predicted_at        TEXT NOT NULL,
    for_hour            TEXT NOT NULL,
    model_type          TEXT NOT NULL,
    model_version       INTEGER,
    predicted_indoor    DOUBLE PRECISION,
    predicted_outdoor   DOUBLE PRECISION,
    actual_indoor       DOUBLE PRECISION,
    actual_outdoor      DOUBLE PRECISION,
    error_indoor        DOUBLE PRECISION,
    error_outdoor       DOUBLE PRECISION,
    UNIQUE(model_type, for_hour)
);

-- PvP party snapshots for matchmaking
CREATE TABLE IF NOT EXISTS party_snapshots (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    player_id           TEXT NOT NULL,
    character           TEXT,
    floor               INTEGER,
    fish                JSONB,
    equipment           JSONB,
    companion_level     INTEGER,
    power_level         DOUBLE PRECISION,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
);

-- Drop legacy UNIQUE(player_id, floor) so multiple snapshots per run are kept
ALTER TABLE party_snapshots DROP CONSTRAINT IF EXISTS party_snapshots_player_id_floor_key;

-- Players table for display names and identity
CREATE TABLE IF NOT EXISTS players (
    id              UUID PRIMARY KEY,
    display_name    TEXT NOT NULL DEFAULT 'Angler',
    platform        TEXT NOT NULL DEFAULT 'web',
    platform_id     TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_players_platform
    ON players(platform, platform_id) WHERE platform_id IS NOT NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_readings_timestamp ON readings (timestamp);
CREATE INDEX IF NOT EXISTS idx_predictions_model_time ON predictions (model_type, generated_at);
CREATE INDEX IF NOT EXISTS idx_pred_hist_model_hour ON prediction_history (model_type, for_hour);
CREATE INDEX IF NOT EXISTS idx_public_stations_time ON public_stations (fetched_at);
CREATE INDEX IF NOT EXISTS idx_snapshots_matchmaking ON party_snapshots (floor, power_level);
CREATE INDEX IF NOT EXISTS idx_snapshots_leaderboard ON party_snapshots (floor DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_retention ON party_snapshots (created_at);
"""


def migrate():
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(SCHEMA_SQL)
        conn.commit()
    print("Migration complete — all tables and indexes created.")


def cleanup_old_data():
    statements = [
        "DELETE FROM readings WHERE timestamp < EXTRACT(EPOCH FROM NOW() - INTERVAL '30 days')",
        "DELETE FROM predictions WHERE generated_at < (NOW() - INTERVAL '7 days')::TEXT",
        "DELETE FROM prediction_history WHERE predicted_at < (NOW() - INTERVAL '30 days')::TEXT",
        "DELETE FROM public_stations WHERE fetched_at < (NOW() - INTERVAL '30 days')::TEXT",
        """DELETE FROM party_snapshots
           WHERE created_at < NOW() - INTERVAL '30 days'
             AND id NOT IN (
                 SELECT id FROM (
                     SELECT id, ROW_NUMBER() OVER (
                         PARTITION BY floor ORDER BY created_at DESC
                     ) AS rn
                     FROM party_snapshots
                 ) ranked
                 WHERE rn <= 100
             )""",
    ]
    with get_connection() as conn:
        with conn.cursor() as cur:
            total = 0
            for stmt in statements:
                cur.execute(stmt)
                total += cur.rowcount
        conn.commit()
    print(f"Retention cleanup complete — {total} rows deleted.")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--cleanup":
        cleanup_old_data()
    else:
        migrate()
