"""Run the spatial lookup against real PostgreSQL, including its index plan."""

from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "the-snake-tank"))
from public_features import _get_features_for_timestamp, _has_public_stations


@pytest.mark.parametrize("instant", [
    "2026-01-01T00:00:00+00:00",  # year boundary
    "2024-03-01T00:00:00+00:00",  # leap-day boundary
    "2026-03-08T07:00:00+00:00",  # US spring DST transition
    "2026-11-01T06:00:00+00:00",  # US autumn DST transition
])
@pytest.mark.parametrize("session_timezone", ["UTC", "America/New_York"])
def test_exclusive_window_and_features(public_station_db, instant, session_timezone):
    target = datetime.fromisoformat(instant)
    with public_station_db.cursor() as cur:
        cur.execute("SELECT set_config('TimeZone', %s, true)", (session_timezone,))
        for seconds, temperature in [
            (-1801, 900), (-1800, 900), (-1799, 10),
            (0, 20), (1799, 30), (1800, 900), (1801, 900),
        ]:
            cur.execute("""
                INSERT INTO public_stations VALUES (%s, %s, 60, 1000, 2, 4, 6, 8)
            """, ((target + timedelta(seconds=seconds)).strftime("%Y-%m-%dT%H:%M:%SZ"),
                  temperature))
        # Missing temperature excludes the entire row; other missing measures
        # are excluded only from their own averages.
        cur.execute("""
            INSERT INTO public_stations VALUES
                (%s, NULL, 900, 900, 900, 900, 900, 900),
                (%s, 40, NULL, NULL, NULL, NULL, NULL, NULL)
        """, (target.strftime("%Y-%m-%dT%H:%M:%SZ"),) * 2)

        # Fractional input seconds must retain the previous int(timestamp)
        # behavior, including exclusion of the exact +/-1800-second bounds.
        result = _get_features_for_timestamp(cur, target.timestamp() + 0.9, 28)
        assert result == pytest.approx({
            "regional_avg_temp": 25,
            "regional_temp_delta": 3,
            "regional_temp_spread": 30,
            "regional_avg_humidity": 60,
            "regional_avg_pressure": 1000,
            "regional_station_count": 4,
            "regional_avg_rain_60min": 2,
            "regional_avg_rain_24h": 4,
            "regional_avg_wind_strength": 6,
            "regional_avg_gust_strength": 8,
        })


def test_presence_check_handles_missing_empty_and_populated_table(public_station_db):
    with public_station_db.cursor() as cur:
        assert not _has_public_stations(cur)
        cur.execute("INSERT INTO public_stations (fetched_at) VALUES ('2026-09-11T00:00:00Z')")
        assert _has_public_stations(cur)
        cur.execute("DROP TABLE public_stations")
        assert not _has_public_stations(cur)


def test_selective_lookup_uses_timestamp_index(public_station_db):
    with public_station_db.cursor() as cur:
        cur.execute("""
            INSERT INTO public_stations (fetched_at, temperature)
            SELECT to_char(t AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 20
            FROM generate_series('2026-08-01 00:00:00+00'::timestamptz,
                                 '2026-08-30 23:59:00+00'::timestamptz,
                                 interval '1 minute') t;
            ANALYZE public_stations
        """)
        target = datetime(2026, 8, 15, 12, tzinfo=timezone.utc)
        result = _get_features_for_timestamp(cur, target.timestamp(), 22)
        assert result["regional_station_count"] == 59
        # EXPLAIN the actual query executed by the application, with the
        # planner's normal settings rather than forcing an index scan.
        lookup = cur.query.decode()
        cur.execute("EXPLAIN (FORMAT JSON) " + lookup)
        plan = cur.fetchone()[0][0]["Plan"]

    def nodes(node):
        yield node
        for child in node.get("Plans", []):
            yield from nodes(child)

    assert any(node.get("Index Name") == "idx_public_stations_time"
               for node in nodes(plan)), plan
    assert not any(node["Node Type"] == "Seq Scan" for node in nodes(plan)), plan
