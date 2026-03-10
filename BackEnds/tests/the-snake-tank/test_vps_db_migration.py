"""QA tests for vps-db-migration: schema, backfill, and retention cleanup.

Static analysis tests that verify migrate.py and backfill.py correctness
without requiring a live Postgres connection.
"""

import re
import os

SNAKE_TANK = os.path.join(os.path.dirname(__file__), "..", "..", "the-snake-tank")


def _read(filename):
    with open(os.path.join(SNAKE_TANK, filename)) as f:
        return f.read()


def _schema_sql():
    content = _read("migrate.py")
    match = re.search(r'SCHEMA_SQL\s*=\s*"""(.*?)"""', content, re.DOTALL)
    assert match, "SCHEMA_SQL not found in migrate.py"
    return match.group(1)


def _table_columns(sql, table_name):
    pattern = rf"CREATE TABLE IF NOT EXISTS {table_name}\s*\((.*?)\);"
    match = re.search(pattern, sql, re.DOTALL)
    assert match, f"Table {table_name} not found in schema"
    body = match.group(1)
    cols = []
    for line in body.strip().split("\n"):
        line = line.strip()
        if not line or line.startswith("--") or line.startswith("UNIQUE"):
            continue
        m = re.match(r"(\w+)\s+", line)
        if m:
            cols.append(m.group(1))
    return cols


# --- Schema tests ---

class TestSchemaCreation:

    def test_all_five_tables_exist(self):
        sql = _schema_sql()
        expected = ["readings", "public_stations", "predictions",
                    "prediction_history", "party_snapshots"]
        for table in expected:
            assert f"CREATE TABLE IF NOT EXISTS {table}" in sql

    def test_tables_are_idempotent(self):
        sql = _schema_sql()
        creates = re.findall(r"CREATE TABLE", sql)
        if_not_exists = re.findall(r"CREATE TABLE IF NOT EXISTS", sql)
        assert len(creates) == len(if_not_exists), \
            "All CREATE TABLE statements should use IF NOT EXISTS"

    def test_indexes_are_idempotent(self):
        sql = _schema_sql()
        creates = re.findall(r"CREATE INDEX", sql)
        if_not_exists = re.findall(r"CREATE INDEX IF NOT EXISTS", sql)
        assert len(creates) == len(if_not_exists), \
            "All CREATE INDEX statements should use IF NOT EXISTS"


class TestReadingsTable:

    def test_column_count(self):
        cols = _table_columns(_schema_sql(), "readings")
        assert len(cols) == 26

    def test_primary_key(self):
        sql = _schema_sql()
        assert "timestamp             BIGINT PRIMARY KEY" in sql

    def test_key_columns_present(self):
        cols = _table_columns(_schema_sql(), "readings")
        for expected in ["timestamp", "date", "hour", "temp_indoor",
                         "temp_outdoor", "co2", "humidity_indoor",
                         "pressure", "battery_percent"]:
            assert expected in cols, f"Missing column: {expected}"


class TestPublicStationsTable:

    def test_column_count(self):
        cols = _table_columns(_schema_sql(), "public_stations")
        assert len(cols) == 14

    def test_identity_pk(self):
        sql = _schema_sql()
        ps_match = re.search(
            r"CREATE TABLE IF NOT EXISTS public_stations\s*\((.*?)\);",
            sql, re.DOTALL)
        assert "BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY" in ps_match.group(1)


class TestPredictionsTable:

    def test_column_count(self):
        cols = _table_columns(_schema_sql(), "predictions")
        assert len(cols) == 10

    def test_identity_pk(self):
        sql = _schema_sql()
        match = re.search(
            r"CREATE TABLE IF NOT EXISTS predictions\s*\((.*?)\);",
            sql, re.DOTALL)
        assert "BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY" in match.group(1)


class TestPredictionHistoryTable:

    def test_column_count(self):
        cols = _table_columns(_schema_sql(), "prediction_history")
        assert len(cols) == 11

    def test_unique_constraint(self):
        sql = _schema_sql()
        match = re.search(
            r"CREATE TABLE IF NOT EXISTS prediction_history\s*\((.*?)\);",
            sql, re.DOTALL)
        assert "UNIQUE(model_type, for_hour)" in match.group(1)


class TestPartySnapshotsTable:

    def test_jsonb_columns(self):
        sql = _schema_sql()
        match = re.search(
            r"CREATE TABLE IF NOT EXISTS party_snapshots\s*\((.*?)\);",
            sql, re.DOTALL)
        body = match.group(1)
        assert "fish                JSONB" in body
        assert "equipment           JSONB" in body

    def test_unique_constraint(self):
        sql = _schema_sql()
        match = re.search(
            r"CREATE TABLE IF NOT EXISTS party_snapshots\s*\((.*?)\);",
            sql, re.DOTALL)
        assert "UNIQUE(player_id, floor)" in match.group(1)

    def test_timestamptz_default(self):
        sql = _schema_sql()
        assert "TIMESTAMPTZ DEFAULT NOW()" in sql


class TestIndexes:

    def test_expected_indexes(self):
        sql = _schema_sql()
        expected = [
            "idx_readings_timestamp",
            "idx_predictions_model_time",
            "idx_pred_hist_model_hour",
            "idx_public_stations_time",
            "idx_snapshots_matchmaking",
            "idx_snapshots_leaderboard",
            "idx_snapshots_retention",
        ]
        for idx in expected:
            assert f"CREATE INDEX IF NOT EXISTS {idx}" in sql, \
                f"Missing index: {idx}"

    def test_index_count(self):
        sql = _schema_sql()
        indexes = re.findall(r"CREATE INDEX IF NOT EXISTS (\w+)", sql)
        assert len(indexes) == 7


# --- Backfill tests ---

class TestBackfillColumnAlignment:

    def test_readings_cols_match_schema(self):
        sql = _schema_sql()
        schema_cols = _table_columns(sql, "readings")

        backfill = _read("backfill.py")
        match = re.search(r"READINGS_COLS\s*=\s*\[(.*?)\]", backfill, re.DOTALL)
        backfill_cols = re.findall(r'"(\w+)"', match.group(1))

        assert backfill_cols == schema_cols, \
            f"Backfill columns don't match schema: {set(backfill_cols) ^ set(schema_cols)}"

    def test_public_stations_cols_match_schema(self):
        sql = _schema_sql()
        schema_cols = _table_columns(sql, "public_stations")
        schema_no_id = [c for c in schema_cols if c != "id"]

        backfill = _read("backfill.py")
        match = re.search(r"PUBLIC_STATIONS_COLS\s*=\s*\[(.*?)\]", backfill, re.DOTALL)
        backfill_cols = re.findall(r'"(\w+)"', match.group(1))

        assert backfill_cols == schema_no_id

    def test_predictions_insert_columns(self):
        backfill = _read("backfill.py")
        match = re.search(
            r"INSERT INTO predictions\s*\((.*?)\)\s*VALUES",
            backfill, re.DOTALL)
        assert match, "predictions INSERT not found"
        cols = [c.strip() for c in match.group(1).split(",")]
        assert len(cols) == 9
        assert "generated_at" in cols
        assert "model_type" in cols

    def test_prediction_history_insert_columns(self):
        backfill = _read("backfill.py")
        match = re.search(
            r"INSERT INTO prediction_history\s*\((.*?)\)\s*VALUES",
            backfill, re.DOTALL)
        assert match, "prediction_history INSERT not found"
        cols = [c.strip() for c in match.group(1).split(",")]
        assert len(cols) == 10


class TestBackfillIdempotency:

    def test_readings_has_on_conflict(self):
        backfill = _read("backfill.py")
        section = backfill.split("def backfill_readings")[1].split("def ")[0]
        assert "ON CONFLICT" in section and "DO NOTHING" in section

    def test_prediction_history_has_on_conflict(self):
        backfill = _read("backfill.py")
        section = backfill.split("def backfill_prediction_history")[1].split("def ")[0]
        assert "ON CONFLICT" in section and "DO NOTHING" in section

    def test_public_stations_has_on_conflict(self):
        backfill = _read("backfill.py")
        section = backfill.split("def backfill_public_stations")[1].split("def ")[0]
        assert "ON CONFLICT (fetched_at, station_id) DO NOTHING" in section

    def test_predictions_has_on_conflict(self):
        backfill = _read("backfill.py")
        section = backfill.split("def backfill_predictions")[1].split("def ")[0]
        assert "ON CONFLICT (generated_at, model_type, for_hour) DO NOTHING" in section

    def test_public_stations_conflict_cols_match_unique(self):
        sql = _schema_sql()
        match = re.search(
            r"CREATE TABLE IF NOT EXISTS public_stations\s*\((.*?)\);",
            sql, re.DOTALL)
        assert "UNIQUE(fetched_at, station_id)" in match.group(1)
        backfill = _read("backfill.py")
        section = backfill.split("def backfill_public_stations")[1].split("def ")[0]
        assert "ON CONFLICT (fetched_at, station_id)" in section

    def test_predictions_conflict_cols_match_unique(self):
        sql = _schema_sql()
        match = re.search(
            r"CREATE TABLE IF NOT EXISTS predictions\s*\((.*?)\);",
            sql, re.DOTALL)
        assert "UNIQUE(generated_at, model_type, for_hour)" in match.group(1)
        backfill = _read("backfill.py")
        section = backfill.split("def backfill_predictions")[1].split("def ")[0]
        assert "ON CONFLICT (generated_at, model_type, for_hour)" in section


# --- Retention cleanup tests ---

class TestRetentionCleanup:

    def _cleanup_source(self):
        content = _read("migrate.py")
        return content.split("def cleanup_old_data")[1].split("\nif __name__")[0]

    def test_all_five_tables_cleaned(self):
        src = self._cleanup_source()
        for table in ["readings", "predictions", "prediction_history",
                       "public_stations", "party_snapshots"]:
            assert f"DELETE FROM {table}" in src, \
                f"Retention cleanup missing table: {table}"

    def test_readings_30_day_interval(self):
        src = self._cleanup_source()
        readings_line = [l for l in src.split("\n") if "readings" in l and "DELETE" in l][0]
        assert "30 days" in readings_line

    def test_predictions_7_day_interval(self):
        src = self._cleanup_source()
        predictions_line = [l for l in src.split("\n")
                            if "predictions" in l and "DELETE" in l
                            and "prediction_history" not in l][0]
        assert "7 days" in predictions_line

    def test_party_snapshots_retains_top_100_per_floor(self):
        src = self._cleanup_source()
        assert "rn <= 100" in src
        assert "PARTITION BY floor" in src
        assert "ORDER BY created_at DESC" in src

    def test_cleanup_invoked_via_flag(self):
        content = _read("migrate.py")
        assert '--cleanup' in content
        assert 'cleanup_old_data()' in content


# --- DB module tests ---

class TestDbModule:

    def test_uses_psycopg2(self):
        content = _read("db.py")
        assert "import psycopg2" in content

    def test_context_manager(self):
        content = _read("db.py")
        assert "@contextmanager" in content
        assert "def get_connection" in content

    def test_autocommit_disabled(self):
        content = _read("db.py")
        assert "autocommit = False" in content

    def test_connection_closed_in_finally(self):
        content = _read("db.py")
        assert "finally:" in content
        assert "conn.close()" in content
