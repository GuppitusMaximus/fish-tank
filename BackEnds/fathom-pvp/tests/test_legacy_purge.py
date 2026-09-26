"""Run only against a disposable PostgreSQL database, never production."""
import importlib.util
import os
from pathlib import Path

import psycopg
import pytest

spec = importlib.util.spec_from_file_location("purge_legacy", Path(__file__).parents[1] / "deploy/purge_legacy.py")
purge_legacy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(purge_legacy)


@pytest.fixture
def database():
    dsn = os.environ.get("TEST_DATABASE_URL")
    if not dsn:
        pytest.skip("TEST_DATABASE_URL must point at a disposable PostgreSQL database")
    with psycopg.connect(dsn) as connection:
        # Refuse existing names: even a misconfigured test cannot replace data.
        for table in ("players", "party_snapshots", "pvp_weather_control"):
            assert connection.execute("SELECT to_regclass(%s)", (f"public.{table}",)).fetchone()[0] is None
        connection.execute("CREATE TABLE public.players (id integer PRIMARY KEY)")
        connection.execute("CREATE TABLE public.party_snapshots (id integer PRIMARY KEY, player_id integer REFERENCES public.players)")
        connection.execute("CREATE TABLE public.pvp_weather_control (value text)")
        connection.execute("INSERT INTO public.players VALUES(1),(2)")
        connection.execute("INSERT INTO public.party_snapshots VALUES(1,1),(2,1),(3,2)")
        connection.execute("INSERT INTO public.pvp_weather_control VALUES('weather preserved')")
        yield connection
        connection.rollback()


def test_purge_deletes_only_expected_legacy_rows(database):
    assert purge_legacy.purge(database, 2, 3) == {"players": 2, "ghosts": 3}
    assert purge_legacy.counts(database) == {"players": 0, "ghosts": 0}
    assert database.execute("SELECT value FROM public.pvp_weather_control").fetchone()[0] == "weather preserved"


def test_count_mismatch_is_atomic(database):
    with pytest.raises(RuntimeError, match="counts changed"):
        purge_legacy.purge(database, 2, 2)
    assert purge_legacy.counts(database) == {"players": 2, "ghosts": 3}


def test_new_reference_blocks_deletion_without_cascade(database):
    database.execute("CREATE TABLE public.pvp_new_reference (player_id integer REFERENCES public.players)")
    database.execute("INSERT INTO public.pvp_new_reference VALUES(1)")
    with pytest.raises(psycopg.errors.ForeignKeyViolation):
        purge_legacy.purge(database, 2, 3)
    assert purge_legacy.counts(database) == {"players": 2, "ghosts": 3}
