"""Optional PostgreSQL fixtures for spatial-feature regression tests."""

from contextlib import contextmanager
import os
from pathlib import Path

import psycopg2
from psycopg2.extensions import parse_dsn
import pytest


@pytest.fixture
def public_station_db(monkeypatch):
    """Use only an explicitly configured, disposable local test database.

    Every test rolls back its schema and data, and the application connection
    is replaced so these tests never use DATABASE_URL or a production .env.
    """
    dsn = os.environ.get("SPATIAL_TEST_DATABASE_URL")
    if not dsn:
        pytest.skip("Set SPATIAL_TEST_DATABASE_URL to a disposable local PostgreSQL database")
    options = parse_dsn(dsn)
    if (options.get("host") not in {"127.0.0.1", "localhost", "::1"}
            or not options.get("dbname", "").startswith("test_")):
        pytest.fail("Spatial tests require a loopback host and a database named test_*")

    monkeypatch.syspath_prepend(str(Path(__file__).resolve().parents[1] / "the-snake-tank"))
    import public_features

    conn = psycopg2.connect(dsn, connect_timeout=5)
    try:
        with conn.cursor() as cur:
            cur.execute("SET LOCAL statement_timeout = '10s'")
            cur.execute("SET LOCAL search_path = public")
            cur.execute("""
                CREATE TABLE public_stations (
                    fetched_at TEXT NOT NULL,
                    temperature DOUBLE PRECISION,
                    humidity INTEGER,
                    pressure DOUBLE PRECISION,
                    rain_60min DOUBLE PRECISION,
                    rain_24h DOUBLE PRECISION,
                    wind_strength INTEGER,
                    gust_strength INTEGER
                );
                CREATE INDEX idx_public_stations_time ON public_stations (fetched_at)
            """)

        @contextmanager
        def get_test_connection():
            yield conn

        monkeypatch.setattr(public_features, "get_connection", get_test_connection)
        yield conn
    finally:
        conn.rollback()
        conn.close()
