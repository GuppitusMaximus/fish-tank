"""QA tests for PvP ghost service (app_pvp.py).

Tests use FastAPI TestClient with mocked database connections.
Covers: health, validation, upsert, matchmaking, leaderboard, metrics, CORS.
"""

import json
import os
import sys
import uuid
from contextlib import contextmanager
from unittest.mock import MagicMock, patch, call

import pytest

SNAKE_TANK = os.path.join(os.path.dirname(__file__), "..", "..", "the-snake-tank")
sys.path.insert(0, SNAKE_TANK)

from fastapi.testclient import TestClient
from app_pvp import app, _metrics, VALID_SPECIES, VALID_CHARACTERS


# --- Fixtures ---

def _make_snapshot(**overrides):
    base = {
        "playerId": str(uuid.uuid4()),
        "character": "andy",
        "floor": 10,
        "fish": [
            {"speciesId": "guppy", "level": 5, "moves": ["splash", "bite"]},
        ],
        "powerLevel": 200.0,
    }
    base.update(overrides)
    return base


@pytest.fixture
def mock_db():
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
    mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)

    @contextmanager
    def fake_get_connection():
        yield mock_conn

    with patch("db.get_connection", side_effect=fake_get_connection):
        yield mock_conn, mock_cursor


@pytest.fixture
def client():
    return TestClient(app)


# --- Step 2: Health Endpoint ---

class TestHealth:

    def test_health_returns_200(self, client, mock_db):
        mock_conn, mock_cursor = mock_db
        resp = client.get("/pvp/health")
        assert resp.status_code == 200

    def test_health_has_required_fields(self, client, mock_db):
        resp = client.get("/pvp/health")
        data = resp.json()
        for field in ("service", "version", "uptime_seconds", "database"):
            assert field in data, f"Missing field: {field}"

    def test_health_service_name(self, client, mock_db):
        data = client.get("/pvp/health").json()
        assert data["service"] == "pvp"

    def test_health_db_ok(self, client, mock_db):
        data = client.get("/pvp/health").json()
        assert data["database"] == "ok"

    def test_health_db_error_on_failure(self, client):
        with patch("db.get_connection", side_effect=Exception("no pg")):
            data = client.get("/pvp/health").json()
            assert data["database"] == "error"


# --- Step 3: Snapshot Upload Validation ---

class TestSnapshotValidation:

    def test_valid_snapshot_returns_ok(self, client, mock_db):
        resp = client.post("/pvp/snapshot", json=_make_snapshot())
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}

    def test_missing_player_id_422(self, client):
        snap = _make_snapshot()
        del snap["playerId"]
        resp = client.post("/pvp/snapshot", json=snap)
        assert resp.status_code == 422

    def test_too_many_fish_422(self, client):
        fish = [{"speciesId": "guppy", "level": 1, "moves": ["splash"]}] * 4
        resp = client.post("/pvp/snapshot", json=_make_snapshot(fish=fish))
        assert resp.status_code == 422

    def test_fish_level_over_20_422(self, client):
        fish = [{"speciesId": "guppy", "level": 21, "moves": ["splash"]}]
        resp = client.post("/pvp/snapshot", json=_make_snapshot(fish=fish))
        assert resp.status_code == 422

    def test_invalid_species_422(self, client):
        fish = [{"speciesId": "shark", "level": 5, "moves": ["bite"]}]
        resp = client.post("/pvp/snapshot", json=_make_snapshot(fish=fish))
        assert resp.status_code == 422

    def test_invalid_character_422(self, client):
        resp = client.post("/pvp/snapshot", json=_make_snapshot(character="zara"))
        assert resp.status_code == 422

    def test_power_level_over_5000_422(self, client):
        resp = client.post("/pvp/snapshot", json=_make_snapshot(powerLevel=5001))
        assert resp.status_code == 422

    def test_empty_fish_array_422(self, client):
        resp = client.post("/pvp/snapshot", json=_make_snapshot(fish=[]))
        assert resp.status_code == 422


# --- Step 4: Snapshot Upsert ---

class TestSnapshotUpsert:

    def test_upsert_uses_on_conflict(self, client, mock_db):
        mock_conn, mock_cursor = mock_db
        snap = _make_snapshot()

        client.post("/pvp/snapshot", json=snap)
        client.post("/pvp/snapshot", json=snap)

        # Each snapshot does 2 executes: players INSERT + snapshot INSERT
        assert mock_cursor.execute.call_count == 4
        for c in mock_cursor.execute.call_args_list:
            sql = c[0][0]
            assert "ON CONFLICT" in sql

    def test_upsert_passes_correct_params(self, client, mock_db):
        mock_conn, mock_cursor = mock_db
        snap = _make_snapshot()
        client.post("/pvp/snapshot", json=snap)

        # Last execute is the snapshot INSERT (second of two)
        args = mock_cursor.execute.call_args[0][1]
        assert args[0] == snap["playerId"]
        assert args[1] == snap["character"]
        assert args[2] == snap["floor"]


# --- Step 5: Matchmaking ---

class TestMatchmaking:

    def _setup_matchmaking_db(self, mock_cursor, return_row=None):
        mock_cursor.fetchone.return_value = return_row

    def test_matchmaking_returns_found(self, client, mock_db):
        mock_conn, mock_cursor = mock_db
        row = ("player-1", "andy", 10,
               [{"speciesId": "guppy", "level": 5, "moves": ["splash"]}],
               None, None, 100.0)
        self._setup_matchmaking_db(mock_cursor, row)

        resp = client.get("/pvp/opponent?floor=10&powerLevel=105")
        assert resp.status_code == 200
        data = resp.json()
        assert data["found"] is True
        assert data["snapshot"]["playerId"] == "player-1"

    def test_matchmaking_no_match_returns_not_found(self, client, mock_db):
        mock_conn, mock_cursor = mock_db
        self._setup_matchmaking_db(mock_cursor, None)

        resp = client.get("/pvp/opponent?floor=99&powerLevel=100")
        data = resp.json()
        assert data["found"] is False

    def test_matchmaking_self_exclusion(self, client, mock_db):
        mock_conn, mock_cursor = mock_db
        self._setup_matchmaking_db(mock_cursor, None)

        player_id = str(uuid.uuid4())
        client.get(f"/pvp/opponent?floor=10&powerLevel=105&playerId={player_id}")

        sql = mock_cursor.execute.call_args[0][0]
        assert "player_id !=" in sql or "player_id !=" in sql.replace("\n", " ")

    def test_matchmaking_bracket_range(self, client, mock_db):
        mock_conn, mock_cursor = mock_db
        self._setup_matchmaking_db(mock_cursor, None)

        client.get("/pvp/opponent?floor=10&powerLevel=100")

        first_call_args = mock_cursor.execute.call_args_list[0][0][1]
        floor_arg = first_call_args[0]
        low_arg = first_call_args[1]
        high_arg = first_call_args[2]
        assert floor_arg == 10
        assert low_arg == pytest.approx(85.0)
        assert high_arg == pytest.approx(115.0)

    def test_matchmaking_widens_bracket_on_miss(self, client, mock_db):
        mock_conn, mock_cursor = mock_db
        mock_cursor.fetchone.return_value = None

        client.get("/pvp/opponent?floor=10&powerLevel=100")

        assert mock_cursor.execute.call_count == 2
        second_call_args = mock_cursor.execute.call_args_list[1][0][1]
        low_wide = second_call_args[1]
        high_wide = second_call_args[2]
        assert low_wide == pytest.approx(70.0)
        assert high_wide == pytest.approx(130.0)


# --- Step 6: Leaderboard ---

class TestLeaderboard:

    def test_leaderboard_returns_entries(self, client, mock_db):
        mock_conn, mock_cursor = mock_db
        mock_cursor.fetchall.return_value = [
            ("p1", "andy", 50, 3, 1200.0, "Angler"),
            ("p2", "saba", 40, 2, 900.0, "Angler"),
            ("p3", "andy", 30, 1, 600.0, "Angler"),
        ]

        resp = client.get("/pvp/leaderboard?limit=3")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["entries"]) == 3

    def test_leaderboard_has_season(self, client, mock_db):
        mock_conn, mock_cursor = mock_db
        mock_cursor.fetchall.return_value = []

        data = client.get("/pvp/leaderboard").json()
        assert "season" in data
        assert len(data["season"]) == 7  # YYYY-MM format

    def test_leaderboard_entry_fields(self, client, mock_db):
        mock_conn, mock_cursor = mock_db
        mock_cursor.fetchall.return_value = [
            ("p1", "andy", 50, 3, 1200.0, "Angler"),
        ]

        data = client.get("/pvp/leaderboard?limit=1").json()
        entry = data["entries"][0]
        for field in ("playerId", "character", "highestFloor", "snapshots", "peakPower", "displayName"):
            assert field in entry, f"Missing leaderboard field: {field}"

    def test_leaderboard_sql_orders_by_floor_desc(self, client, mock_db):
        mock_conn, mock_cursor = mock_db
        mock_cursor.fetchall.return_value = []

        client.get("/pvp/leaderboard?limit=5")

        sql = mock_cursor.execute.call_args[0][0]
        assert "ORDER BY highest_floor DESC" in sql


# --- Step 7: Metrics ---

class TestMetrics:

    def test_metrics_requires_admin(self, client):
        # /pvp/metrics is admin-gated: it exposed upload and matchmaking
        # counters to anyone who asked.
        resp = client.get("/pvp/metrics")
        assert resp.status_code == 401

    def test_snapshot_upload_increments_counter(self, client, mock_db):
        before = _metrics["snapshot_upload_count"]
        client.post("/pvp/snapshot", json=_make_snapshot())
        after = _metrics["snapshot_upload_count"]
        assert after == before + 1

    def test_matchmaking_increments_counter(self, client, mock_db):
        mock_conn, mock_cursor = mock_db
        mock_cursor.fetchone.return_value = None
        before = _metrics["matchmaking_requests"]
        client.get("/pvp/opponent?floor=1&powerLevel=100")
        after = _metrics["matchmaking_requests"]
        assert after == before + 1


# --- Step 8: CORS ---

class TestCORS:

    def test_cors_headers_on_options(self, client):
        resp = client.options(
            "/pvp/snapshot",
            headers={
                "Origin": "http://example.com",
                "Access-Control-Request-Method": "POST",
            },
        )
        assert "access-control-allow-origin" in resp.headers
        assert resp.headers["access-control-allow-origin"] == "*"


# --- Static analysis: code quality ---

class TestCodeQuality:

    def test_valid_species_list(self):
        assert len(VALID_SPECIES) >= 4
        assert "guppy" in VALID_SPECIES

    def test_valid_characters_list(self):
        assert "andy" in VALID_CHARACTERS
        assert "saba" in VALID_CHARACTERS

    def test_player_id_must_be_uuid(self, client):
        resp = client.post("/pvp/snapshot", json=_make_snapshot(playerId="not-a-uuid"))
        assert resp.status_code == 422
