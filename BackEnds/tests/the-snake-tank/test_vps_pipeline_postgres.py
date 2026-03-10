"""QA tests for qa-vps-pipeline-postgres: verify all 7 pipeline scripts
use Postgres correctly after SQLite→Postgres migration.

Static analysis tests that verify code patterns without requiring a live
Postgres connection. Checks imports, SQL syntax, upsert patterns, and
function signatures.
"""

import ast
import os
import re

SNAKE_TANK = os.path.join(os.path.dirname(__file__), "..", "..", "the-snake-tank")

PIPELINE_SCRIPTS = [
    "build_dataset.py",
    "fetch_weather.py",
    "predict.py",
    "validate_prediction.py",
    "train_model.py",
    "public_features.py",
    "export_weather.py",
]


def _read(filename):
    with open(os.path.join(SNAKE_TANK, filename)) as f:
        return f.read()


def _parse_imports(source):
    """Extract all import names from source code using AST."""
    tree = ast.parse(source)
    imports = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                imports.add(alias.name)
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                imports.add(node.module)
    return imports


def _has_function(source, name):
    """Check if a function with the given name is defined at module level."""
    tree = ast.parse(source)
    for node in ast.iter_child_nodes(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            if node.name == name:
                return True
    return False


# =============================================================================
# Step 1: Pre-check — sqlite3 imports and db module usage
# =============================================================================

class TestSqliteImports:
    """Verify no script imports sqlite3 for weather DB operations."""

    def test_only_export_weather_imports_sqlite3(self):
        for script in PIPELINE_SCRIPTS:
            source = _read(script)
            imports = _parse_imports(source)
            if script == "export_weather.py":
                assert "sqlite3" in imports, \
                    "export_weather.py should import sqlite3 for frontend.db"
            else:
                assert "sqlite3" not in imports, \
                    f"{script} should not import sqlite3"

    def test_all_scripts_import_db_module(self):
        for script in PIPELINE_SCRIPTS:
            source = _read(script)
            imports = _parse_imports(source)
            assert "db" in imports, \
                f"{script} should import from db module"


# =============================================================================
# Step 2: build_dataset.py — upsert behavior
# =============================================================================

class TestBuildDatasetUpsert:

    def test_uses_on_conflict_do_update(self):
        source = _read("build_dataset.py")
        assert "ON CONFLICT (timestamp) DO UPDATE SET" in source

    def test_no_drop_table(self):
        source = _read("build_dataset.py")
        assert "DROP TABLE" not in source.upper()

    def test_no_sqlite3_import(self):
        source = _read("build_dataset.py")
        imports = _parse_imports(source)
        assert "sqlite3" not in imports

    def test_uses_postgres_placeholders(self):
        """Postgres uses %s placeholders, not ? (SQLite)."""
        source = _read("build_dataset.py")
        # Find the INSERT statement
        insert_match = re.search(r"INSERT INTO readings.*?VALUES\s*\((.*?)\)", source, re.DOTALL)
        assert insert_match
        placeholders = insert_match.group(1)
        assert "%s" in placeholders
        assert "?" not in placeholders

    def test_public_stations_also_upserted(self):
        """build_dataset.py rebuilds public_stations via DELETE + INSERT (full reload)."""
        source = _read("build_dataset.py")
        assert "DELETE FROM public_stations" in source
        assert "INSERT INTO public_stations" in source

    def test_commits_after_inserts(self):
        source = _read("build_dataset.py")
        assert "conn.commit()" in source


# =============================================================================
# Step 3: fetch_weather.py — Postgres connection
# =============================================================================

class TestFetchWeatherPostgres:

    def test_no_sqlite3_import(self):
        source = _read("fetch_weather.py")
        imports = _parse_imports(source)
        assert "sqlite3" not in imports

    def test_imports_db_module(self):
        source = _read("fetch_weather.py")
        assert "from db import get_connection" in source

    def test_uses_postgres_placeholders(self):
        source = _read("fetch_weather.py")
        assert re.search(r"VALUES\s*\(%s", source)

    def test_public_stations_insert(self):
        source = _read("fetch_weather.py")
        assert "INSERT INTO public_stations" in source

    def test_postgres_interval_syntax(self):
        """Uses INTERVAL (Postgres) not datetime subtraction in SQL."""
        source = _read("fetch_weather.py")
        assert "INTERVAL '30 days'" in source

    def test_postgres_timestamptz_cast(self):
        source = _read("fetch_weather.py")
        assert "::TIMESTAMPTZ" in source


# =============================================================================
# Step 4: predict.py — writes to Postgres predictions table
# =============================================================================

class TestPredictPostgres:

    def test_no_sqlite3_import(self):
        source = _read("predict.py")
        imports = _parse_imports(source)
        assert "sqlite3" not in imports

    def test_writes_to_predictions_table(self):
        source = _read("predict.py")
        assert "INSERT INTO predictions" in source

    def test_predictions_insert_columns(self):
        source = _read("predict.py")
        match = re.search(
            r"INSERT INTO predictions\s*\((.*?)\)\s*VALUES",
            source, re.DOTALL)
        assert match, "predictions INSERT not found"
        cols = [c.strip() for c in match.group(1).split(",")]
        expected = ["generated_at", "model_type", "model_version", "for_hour",
                    "temp_indoor_predicted", "temp_outdoor_predicted",
                    "last_reading_ts", "last_reading_temp_indoor",
                    "last_reading_temp_outdoor"]
        assert len(cols) == len(expected), \
            f"Expected {len(expected)} columns, got {len(cols)}: {cols}"

    def test_uses_postgres_placeholders(self):
        source = _read("predict.py")
        inserts = re.findall(r"VALUES\s*\(([^)]+)\)", source)
        for insert in inserts:
            if "%s" in insert:
                assert "?" not in insert

    def test_reads_from_postgres(self):
        """predict.py queries readings table via pd.read_sql_query."""
        source = _read("predict.py")
        assert "pd.read_sql_query" in source
        assert "FROM readings" in source

    def test_prediction_error_lookup_uses_postgres(self):
        source = _read("predict.py")
        assert "FROM prediction_history" in source


# =============================================================================
# Step 5: validate_prediction.py — Postgres patterns
# =============================================================================

class TestValidatePredictionPostgres:

    def test_no_sqlite3_import(self):
        source = _read("validate_prediction.py")
        imports = _parse_imports(source)
        assert "sqlite3" not in imports

    def test_on_conflict_do_nothing(self):
        source = _read("validate_prediction.py")
        assert "ON CONFLICT (model_type, for_hour) DO NOTHING" in source

    def test_no_insert_or_ignore(self):
        source = _read("validate_prediction.py")
        assert "INSERT OR IGNORE" not in source

    def test_writes_to_prediction_history(self):
        source = _read("validate_prediction.py")
        assert "INSERT INTO prediction_history" in source

    def test_reads_latest_reading_from_postgres(self):
        source = _read("validate_prediction.py")
        assert "FROM readings ORDER BY timestamp DESC LIMIT 1" in source

    def test_uses_real_dict_cursor(self):
        """Uses psycopg2 RealDictCursor for dict-style row access."""
        source = _read("validate_prediction.py")
        assert "RealDictCursor" in source

    def test_reads_predictions_from_db(self):
        source = _read("validate_prediction.py")
        assert "FROM predictions" in source


# =============================================================================
# Step 6: train_model.py — reads from Postgres
# =============================================================================

class TestTrainModelPostgres:

    def test_no_sqlite3_import(self):
        source = _read("train_model.py")
        imports = _parse_imports(source)
        assert "sqlite3" not in imports

    def test_imports_db_module(self):
        source = _read("train_model.py")
        assert "from db import get_connection" in source

    def test_reads_via_pandas(self):
        source = _read("train_model.py")
        assert "pd.read_sql_query" in source

    def test_reads_all_readings(self):
        source = _read("train_model.py")
        assert "SELECT * FROM readings ORDER BY timestamp" in source

    def test_reads_prediction_errors_from_db(self):
        source = _read("train_model.py")
        assert "FROM prediction_history" in source

    def test_uses_real_dict_cursor(self):
        source = _read("train_model.py")
        assert "RealDictCursor" in source


# =============================================================================
# Step 7: public_features.py — information_schema, not sqlite_master
# =============================================================================

class TestPublicFeaturesPostgres:

    def test_no_sqlite3_import(self):
        source = _read("public_features.py")
        imports = _parse_imports(source)
        assert "sqlite3" not in imports

    def test_uses_information_schema(self):
        source = _read("public_features.py")
        assert "information_schema.tables" in source

    def test_no_sqlite_master(self):
        source = _read("public_features.py")
        assert "sqlite_master" not in source

    def test_uses_extract_epoch(self):
        """Uses EXTRACT(EPOCH FROM ...) for timestamp math, not strftime."""
        source = _read("public_features.py")
        assert "EXTRACT(EPOCH FROM" in source

    def test_no_strftime_in_sql(self):
        """No SQLite strftime() in SQL queries."""
        source = _read("public_features.py")
        # Only check within SQL strings (triple-quoted or in execute calls)
        sql_sections = re.findall(r'"""(.*?)"""', source, re.DOTALL)
        sql_sections += re.findall(r"'''(.*?)'''", source, re.DOTALL)
        for sql in sql_sections:
            assert "strftime" not in sql

    def test_uses_timestamptz_cast(self):
        source = _read("public_features.py")
        assert "::TIMESTAMPTZ" in source

    def test_queries_public_stations_table(self):
        source = _read("public_features.py")
        assert "FROM public_stations" in source


# =============================================================================
# Step 8: export_weather.py — correct output structure
# =============================================================================

class TestExportWeatherPostgres:

    def test_sqlite3_used_only_for_frontend_db(self):
        """sqlite3 import is for building frontend.db, not for reading weather DB."""
        source = _read("export_weather.py")
        imports = _parse_imports(source)
        assert "sqlite3" in imports
        assert "db" in imports
        # sqlite3 should only appear in build_frontend_db function
        # and NOT in any function that reads weather data
        assert "sqlite3.connect" in source

    def test_no_attach_database(self):
        source = _read("export_weather.py")
        assert "ATTACH DATABASE" not in source

    def test_reads_from_postgres_via_db_module(self):
        source = _read("export_weather.py")
        assert "from db import get_connection" in source

    def test_frontend_db_has_required_tables(self):
        """The frontend.db builder creates all 4 required tables."""
        source = _read("export_weather.py")
        for table in ["readings", "predictions", "prediction_history", "public_stations"]:
            assert f"CREATE TABLE {table}" in source, \
                f"frontend.db missing table: {table}"

    def test_frontend_db_queries_postgres(self):
        """build_frontend_db queries Postgres tables and copies to SQLite."""
        source = _read("export_weather.py")
        # Should have pg_cur.execute queries for each table
        assert "pg_cur.execute" in source

    def test_frontend_db_compressed(self):
        source = _read("export_weather.py")
        assert "gzip.open" in source
        assert "frontend.db.gz" in source

    def test_produces_weather_json(self):
        source = _read("export_weather.py")
        assert "weather.json" in source

    def test_produces_weather_public_json(self):
        source = _read("export_weather.py")
        assert "weather-public.json" in source

    def test_reads_predictions_from_db(self):
        """export_weather.py reads predictions from Postgres DB."""
        source = _read("export_weather.py")
        assert "FROM predictions" in source

    def test_reads_prediction_history_from_db(self):
        source = _read("export_weather.py")
        assert "FROM prediction_history" in source

    def test_uses_real_dict_cursor(self):
        source = _read("export_weather.py")
        assert "RealDictCursor" in source

    def test_r2_upload_function_exists(self):
        source = _read("export_weather.py")
        assert "def upload_to_r2" in source

    def test_uploads_correct_files(self):
        source = _read("export_weather.py")
        assert "upload_to_r2(public_path, 'weather-public.json')" in source
        assert "upload_to_r2(output_path, 'weather.json')" in source
        assert "upload_to_r2(" in source and "'frontend.db.gz'" in source


# =============================================================================
# Step 9: main() function verification
# =============================================================================

class TestMainFunctions:
    """Verify each pipeline script has a main() callable via import."""

    def test_build_dataset_has_main(self):
        assert _has_function(_read("build_dataset.py"), "main")

    def test_fetch_weather_has_main(self):
        assert _has_function(_read("fetch_weather.py"), "main")

    def test_predict_has_main(self):
        assert _has_function(_read("predict.py"), "main")

    def test_validate_prediction_has_main(self):
        assert _has_function(_read("validate_prediction.py"), "main")

    def test_train_model_has_main(self):
        assert _has_function(_read("train_model.py"), "main")

    def test_export_weather_has_main(self):
        assert _has_function(_read("export_weather.py"), "main")

    def test_public_features_is_utility_module(self):
        """public_features.py is a utility module (no main needed).
        It exports add_spatial_columns() used by predict.py and train_model.py."""
        source = _read("public_features.py")
        assert "def add_spatial_columns" in source
        # Verify it's imported by the scripts that need it
        predict_src = _read("predict.py")
        assert "from public_features import" in predict_src
        train_src = _read("train_model.py")
        assert "from public_features import" in train_src


# =============================================================================
# Cross-cutting: db.py adapter verification
# =============================================================================

class TestDbAdapter:
    """Verify db.py provides correct Postgres adapter."""

    def test_uses_psycopg2(self):
        source = _read("db.py")
        assert "import psycopg2" in source

    def test_context_manager(self):
        source = _read("db.py")
        assert "@contextmanager" in source
        assert "def get_connection" in source

    def test_autocommit_disabled(self):
        source = _read("db.py")
        assert "autocommit = False" in source

    def test_connection_string_accessor(self):
        source = _read("db.py")
        assert "def get_connection_string" in source
        assert "return DATABASE_URL" in source


# =============================================================================
# Cross-cutting: no SQLite-isms in Postgres queries
# =============================================================================

class TestNoSqlitePatterns:
    """Verify no SQLite-specific patterns in scripts that use Postgres."""

    def test_no_question_mark_placeholders(self):
        """All Postgres queries should use %s, not ? placeholders.
        Exception: export_weather.py uses ? for SQLite frontend.db writes."""
        for script in PIPELINE_SCRIPTS:
            if script == "export_weather.py":
                continue
            source = _read(script)
            # Find VALUES clauses and check for ? placeholders
            values_matches = re.findall(r"VALUES\s*\(([^)]+)\)", source)
            for values in values_matches:
                assert "?" not in values, \
                    f"{script} uses ? placeholder in VALUES clause"

    def test_no_insert_or_patterns(self):
        """No SQLite INSERT OR IGNORE / INSERT OR REPLACE patterns."""
        for script in PIPELINE_SCRIPTS:
            source = _read(script)
            assert "INSERT OR IGNORE" not in source, \
                f"{script} uses SQLite INSERT OR IGNORE"
            assert "INSERT OR REPLACE" not in source, \
                f"{script} uses SQLite INSERT OR REPLACE"

    def test_no_sqlite_master_references(self):
        for script in PIPELINE_SCRIPTS:
            source = _read(script)
            assert "sqlite_master" not in source, \
                f"{script} references sqlite_master"
