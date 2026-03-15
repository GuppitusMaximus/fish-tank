"""QA tests for web leaderboard backend features.

Covers: players table schema, lazy registration, set-name endpoint,
leaderboard displayName, player-name endpoint.
"""

import os
import sys
import uuid
from contextlib import contextmanager
from unittest.mock import MagicMock, patch

import pytest

SNAKE_TANK = os.path.join(os.path.dirname(__file__), "..", "..", "the-snake-tank")
sys.path.insert(0, SNAKE_TANK)

from fastapi.testclient import TestClient
from app_pvp import app
from migrate import SCHEMA_SQL


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


# --- Players Table Schema ---

class TestPlayersTable:

    def test_players_table_exists_in_migration(self):
        assert "CREATE TABLE IF NOT EXISTS players" in SCHEMA_SQL

    def test_id_is_uuid_primary_key(self):
        assert "UUID PRIMARY KEY" in SCHEMA_SQL

    def test_has_display_name_column(self):
        assert "display_name" in SCHEMA_SQL

    def test_has_platform_column(self):
        assert "platform" in SCHEMA_SQL

    def test_has_platform_id_column(self):
        assert "platform_id" in SCHEMA_SQL

    def test_has_created_at_column(self):
        assert "TIMESTAMPTZ DEFAULT NOW()" in SCHEMA_SQL

    def test_default_display_name_is_angler(self):
        assert "DEFAULT 'Angler'" in SCHEMA_SQL

    def test_default_platform_is_web(self):
        assert "DEFAULT 'web'" in SCHEMA_SQL


# --- Lazy Registration (POST /pvp/snapshot) ---

class TestLazyRegistration:

    def test_snapshot_creates_player_row(self, client, mock_db):
        mock_conn, mock_cursor = mock_db
        snap = _make_snapshot()
        resp = client.post("/pvp/snapshot", json=snap)
        assert resp.status_code == 200

        first_sql = mock_cursor.execute.call_args_list[0][0][0]
        assert "INSERT INTO players" in first_sql
        first_params = mock_cursor.execute.call_args_list[0][0][1]
        assert snap["playerId"] in first_params

    def test_duplicate_snapshot_no_duplicate_player(self, client, mock_db):
        mock_conn, mock_cursor = mock_db
        snap = _make_snapshot()
        client.post("/pvp/snapshot", json=snap)
        client.post("/pvp/snapshot", json=snap)

        player_inserts = [
            c for c in mock_cursor.execute.call_args_list
            if "INSERT INTO players" in c[0][0]
        ]
        for c in player_inserts:
            assert "ON CONFLICT" in c[0][0]
            assert "DO NOTHING" in c[0][0]

    def test_auto_created_player_has_default_name_and_platform(self, client, mock_db):
        mock_conn, mock_cursor = mock_db
        snap = _make_snapshot()
        client.post("/pvp/snapshot", json=snap)

        player_sql = mock_cursor.execute.call_args_list[0][0][0]
        assert "'Angler'" in player_sql
        assert "'web'" in player_sql


# --- Set Name (POST /pvp/set-name) ---

class TestSetName:

    def test_valid_name_returns_success(self, client, mock_db):
        player_id = str(uuid.uuid4())
        resp = client.post("/pvp/set-name", json={
            "playerId": player_id,
            "displayName": "FishKing"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["displayName"] == "FishKing"

    def test_empty_name_rejected(self, client):
        resp = client.post("/pvp/set-name", json={
            "playerId": str(uuid.uuid4()),
            "displayName": ""
        })
        assert resp.status_code == 422

    def test_name_over_20_chars_rejected(self, client):
        resp = client.post("/pvp/set-name", json={
            "playerId": str(uuid.uuid4()),
            "displayName": "A" * 21
        })
        assert resp.status_code == 422

    def test_whitespace_trimmed(self, client, mock_db):
        resp = client.post("/pvp/set-name", json={
            "playerId": str(uuid.uuid4()),
            "displayName": "  FishKing  "
        })
        assert resp.status_code == 200
        assert resp.json()["displayName"] == "FishKing"

    def test_nonexistent_player_creates_row(self, client, mock_db):
        mock_conn, mock_cursor = mock_db
        client.post("/pvp/set-name", json={
            "playerId": str(uuid.uuid4()),
            "displayName": "NewPlayer"
        })

        sql = mock_cursor.execute.call_args[0][0]
        assert "INSERT INTO players" in sql
        assert "ON CONFLICT" in sql
        assert "DO UPDATE" in sql

    def test_set_name_twice_updates_not_duplicates(self, client, mock_db):
        mock_conn, mock_cursor = mock_db
        player_id = str(uuid.uuid4())
        client.post("/pvp/set-name", json={
            "playerId": player_id,
            "displayName": "First"
        })
        client.post("/pvp/set-name", json={
            "playerId": player_id,
            "displayName": "Second"
        })

        for c in mock_cursor.execute.call_args_list:
            sql = c[0][0]
            assert "ON CONFLICT" in sql
            assert "DO UPDATE" in sql


# --- Leaderboard (GET /pvp/leaderboard) ---

class TestLeaderboardDisplayName:

    def test_response_includes_display_name(self, client, mock_db):
        mock_conn, mock_cursor = mock_db
        mock_cursor.fetchall.return_value = [
            ("p1", "andy", 50, 3, 1200.0, "FishKing"),
        ]

        data = client.get("/pvp/leaderboard?limit=1").json()
        entry = data["entries"][0]
        assert "displayName" in entry
        assert entry["displayName"] == "FishKing"

    def test_custom_name_shown(self, client, mock_db):
        mock_conn, mock_cursor = mock_db
        mock_cursor.fetchall.return_value = [
            ("p1", "andy", 50, 3, 1200.0, "CustomName"),
        ]

        data = client.get("/pvp/leaderboard").json()
        assert data["entries"][0]["displayName"] == "CustomName"

    def test_default_angler_when_no_player_row(self, client, mock_db):
        mock_conn, mock_cursor = mock_db
        mock_cursor.fetchall.return_value = [
            ("p1", "andy", 50, 3, 1200.0, "Angler"),
        ]

        data = client.get("/pvp/leaderboard").json()
        assert data["entries"][0]["displayName"] == "Angler"

    def test_sql_uses_coalesce_for_display_name(self, client, mock_db):
        mock_conn, mock_cursor = mock_db
        mock_cursor.fetchall.return_value = []

        client.get("/pvp/leaderboard")

        sql = mock_cursor.execute.call_args[0][0]
        assert "COALESCE" in sql
        assert "display_name" in sql
        assert "'Angler'" in sql

    def test_sorted_by_highest_floor_desc(self, client, mock_db):
        mock_conn, mock_cursor = mock_db
        mock_cursor.fetchall.return_value = []

        client.get("/pvp/leaderboard")

        sql = mock_cursor.execute.call_args[0][0]
        assert "ORDER BY highest_floor DESC" in sql


# --- Player Name (GET /pvp/player-name) ---

class TestPlayerName:

    def test_returns_name_for_existing_player(self, client, mock_db):
        mock_conn, mock_cursor = mock_db
        mock_cursor.fetchone.return_value = ("FishKing",)

        player_id = str(uuid.uuid4())
        resp = client.get(f"/pvp/player-name?playerId={player_id}")
        assert resp.status_code == 200
        assert resp.json()["displayName"] == "FishKing"

    def test_returns_angler_for_unknown_player(self, client, mock_db):
        mock_conn, mock_cursor = mock_db
        mock_cursor.fetchone.return_value = None

        player_id = str(uuid.uuid4())
        resp = client.get(f"/pvp/player-name?playerId={player_id}")
        assert resp.status_code == 200
        assert resp.json()["displayName"] == "Angler"
