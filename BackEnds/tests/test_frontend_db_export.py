"""
Test suite for frontend database export functionality.

Verifies that export_weather.py correctly generates a compressed SQLite database
with proper schema, metadata, indexes, and data integrity for frontend consumption.
"""

import gzip
import json
import os
import sqlite3
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import pytest


# Path to the snake tank directory
SNAKE_TANK_DIR = Path(__file__).parent.parent / "the-snake-tank"
SOURCE_DB = SNAKE_TANK_DIR / "data" / "weather.db"


def decompress_db(gz_path: Path) -> Path:
    """Decompress a gzipped database to a temporary file."""
    temp_db = Path(tempfile.mktemp(suffix=".db"))
    with gzip.open(gz_path, 'rb') as f_in:
        with open(temp_db, 'wb') as f_out:
            f_out.write(f_in.read())
    return temp_db


def test_database_structure():
    """Verify that frontend.db has the expected tables and no extra tables."""
    # Run export to a temporary directory
    with tempfile.TemporaryDirectory() as tmpdir:
        output_path = Path(tmpdir) / "weather.json"
        history_path = SOURCE_DB.parent / "prediction-history.json"

        # Run export
        import subprocess
        result = subprocess.run(
            [
                "python3",
                str(SNAKE_TANK_DIR / "export_weather.py"),
                "--output", str(output_path),
                "--history", str(history_path)
            ],
            cwd=SNAKE_TANK_DIR,
            capture_output=True,
            text=True
        )

        assert result.returncode == 0, f"Export failed: {result.stderr}"

        # Verify frontend.db.gz exists
        db_gz_path = Path(tmpdir) / "frontend.db.gz"
        assert db_gz_path.exists(), "frontend.db.gz not created"

        # Decompress
        db_path = decompress_db(db_gz_path)

        try:
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()

            # Get all tables
            cursor.execute(
                "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
            )
            tables = [row[0] for row in cursor.fetchall()]

            expected_tables = [
                '_metadata',
                'prediction_history',
                'predictions',
                'public_stations',
                'readings'
            ]

            assert tables == expected_tables, f"Tables mismatch. Expected {expected_tables}, got {tables}"

        finally:
            conn.close()
            db_path.unlink()


def test_metadata():
    """Verify that _metadata table has correct schema_version and generated_at."""
    with tempfile.TemporaryDirectory() as tmpdir:
        output_path = Path(tmpdir) / "weather.json"
        history_path = SOURCE_DB.parent / "prediction-history.json"

        # Run export
        import subprocess
        result = subprocess.run(
            [
                "python3",
                str(SNAKE_TANK_DIR / "export_weather.py"),
                "--output", str(output_path),
                "--history", str(history_path)
            ],
            cwd=SNAKE_TANK_DIR,
            capture_output=True,
            text=True
        )

        assert result.returncode == 0, f"Export failed: {result.stderr}"

        db_gz_path = Path(tmpdir) / "frontend.db.gz"
        db_path = decompress_db(db_gz_path)

        try:
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()

            # Get metadata
            cursor.execute("SELECT key, value FROM _metadata")
            metadata = dict(cursor.fetchall())

            # Check schema_version
            assert 'schema_version' in metadata, "Missing schema_version in metadata"
            assert metadata['schema_version'] == '1', f"Expected schema_version '1', got '{metadata['schema_version']}'"

            # Check generated_at
            assert 'generated_at' in metadata, "Missing generated_at in metadata"
            generated_at = metadata['generated_at']

            # Verify it's a valid ISO 8601 timestamp
            try:
                dt = datetime.fromisoformat(generated_at.replace('Z', '+00:00'))
            except ValueError as e:
                pytest.fail(f"Invalid ISO 8601 timestamp: {generated_at} ({e})")

            # Verify it's recent (within last 5 minutes)
            now = datetime.now(timezone.utc)
            age_seconds = (now - dt).total_seconds()
            assert age_seconds < 300, f"Timestamp is {age_seconds}s old (more than 5 minutes)"

        finally:
            conn.close()
            db_path.unlink()


def test_indexes():
    """Verify that all expected indexes exist."""
    with tempfile.TemporaryDirectory() as tmpdir:
        output_path = Path(tmpdir) / "weather.json"
        history_path = SOURCE_DB.parent / "prediction-history.json"

        # Run export
        import subprocess
        result = subprocess.run(
            [
                "python3",
                str(SNAKE_TANK_DIR / "export_weather.py"),
                "--output", str(output_path),
                "--history", str(history_path)
            ],
            cwd=SNAKE_TANK_DIR,
            capture_output=True,
            text=True
        )

        assert result.returncode == 0, f"Export failed: {result.stderr}"

        db_gz_path = Path(tmpdir) / "frontend.db.gz"
        db_path = decompress_db(db_gz_path)

        try:
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()

            # Get all indexes (excluding SQLite internal indexes)
            cursor.execute(
                "SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name"
            )
            indexes = [row[0] for row in cursor.fetchall()]

            expected_indexes = [
                'idx_pred_hist_hour_model',
                'idx_predictions_model_ts',
                'idx_pub_stations_fetched',
                'idx_readings_date',
                'idx_readings_timestamp'
            ]

            assert indexes == expected_indexes, f"Indexes mismatch. Expected {expected_indexes}, got {indexes}"

        finally:
            conn.close()
            db_path.unlink()


def test_data_integrity():
    """Verify that row counts match between source and exported databases."""
    if not SOURCE_DB.exists():
        pytest.skip(f"Source database not found: {SOURCE_DB}")

    with tempfile.TemporaryDirectory() as tmpdir:
        output_path = Path(tmpdir) / "weather.json"
        history_path = SOURCE_DB.parent / "prediction-history.json"

        # Run export
        import subprocess
        result = subprocess.run(
            [
                "python3",
                str(SNAKE_TANK_DIR / "export_weather.py"),
                "--output", str(output_path),
                "--history", str(history_path)
            ],
            cwd=SNAKE_TANK_DIR,
            capture_output=True,
            text=True
        )

        assert result.returncode == 0, f"Export failed: {result.stderr}"

        db_gz_path = Path(tmpdir) / "frontend.db.gz"
        db_path = decompress_db(db_gz_path)

        try:
            source_conn = sqlite3.connect(SOURCE_DB)
            export_conn = sqlite3.connect(db_path)

            tables = ['readings', 'predictions', 'prediction_history', 'public_stations']

            for table in tables:
                src_count = source_conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
                dst_count = export_conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]

                assert src_count == dst_count, f"{table}: source has {src_count} rows, export has {dst_count} rows"

            source_conn.close()
            export_conn.close()

        finally:
            db_path.unlink()


def test_compression_effectiveness():
    """Verify that gzip compression achieves reasonable file size reduction."""
    with tempfile.TemporaryDirectory() as tmpdir:
        output_path = Path(tmpdir) / "weather.json"
        history_path = SOURCE_DB.parent / "prediction-history.json"

        # Run export
        import subprocess
        result = subprocess.run(
            [
                "python3",
                str(SNAKE_TANK_DIR / "export_weather.py"),
                "--output", str(output_path),
                "--history", str(history_path)
            ],
            cwd=SNAKE_TANK_DIR,
            capture_output=True,
            text=True
        )

        assert result.returncode == 0, f"Export failed: {result.stderr}"

        db_gz_path = Path(tmpdir) / "frontend.db.gz"
        db_path = decompress_db(db_gz_path)

        try:
            raw_size = db_path.stat().st_size
            gz_size = db_gz_path.stat().st_size
            ratio = gz_size / raw_size

            # Expect compression to at least 60% of original (40% reduction minimum)
            assert ratio < 0.6, f"Compression ratio {ratio:.1%} is worse than expected (should be < 60%)"

        finally:
            db_path.unlink()


def test_manifest_has_db_generated_at():
    """Verify that data-index.json includes db_generated_at field."""
    with tempfile.TemporaryDirectory() as tmpdir:
        output_path = Path(tmpdir) / "weather.json"
        history_path = SOURCE_DB.parent / "prediction-history.json"

        # Run export
        import subprocess
        result = subprocess.run(
            [
                "python3",
                str(SNAKE_TANK_DIR / "export_weather.py"),
                "--output", str(output_path),
                "--history", str(history_path)
            ],
            cwd=SNAKE_TANK_DIR,
            capture_output=True,
            text=True
        )

        assert result.returncode == 0, f"Export failed: {result.stderr}"

        manifest_path = Path(tmpdir) / "data-index.json"
        assert manifest_path.exists(), "data-index.json not created"

        with open(manifest_path) as f:
            manifest = json.load(f)

        assert 'db_generated_at' in manifest, "Missing db_generated_at in manifest"

        # Verify it's a valid ISO 8601 timestamp
        try:
            datetime.fromisoformat(manifest['db_generated_at'].replace('Z', '+00:00'))
        except ValueError as e:
            pytest.fail(f"Invalid ISO 8601 timestamp in manifest: {manifest['db_generated_at']} ({e})")


def test_backward_compatibility():
    """Verify that existing JSON exports still work and have expected structure."""
    with tempfile.TemporaryDirectory() as tmpdir:
        output_path = Path(tmpdir) / "weather.json"
        history_path = SOURCE_DB.parent / "prediction-history.json"

        # Run export
        import subprocess
        result = subprocess.run(
            [
                "python3",
                str(SNAKE_TANK_DIR / "export_weather.py"),
                "--output", str(output_path),
                "--history", str(history_path)
            ],
            cwd=SNAKE_TANK_DIR,
            capture_output=True,
            text=True
        )

        assert result.returncode == 0, f"Export failed: {result.stderr}"

        # Check weather.json
        weather_path = Path(tmpdir) / "weather.json"
        assert weather_path.exists(), "weather.json not created"

        with open(weather_path) as f:
            weather = json.load(f)

        assert 'schema_version' in weather, "Missing schema_version in weather.json"
        assert 'current' in weather, "Missing current in weather.json"
        assert 'predictions' in weather, "Missing predictions in weather.json"
        assert 'history' in weather, "Missing history in weather.json"

        # Check data-index.json
        manifest_path = Path(tmpdir) / "data-index.json"
        assert manifest_path.exists(), "data-index.json not created"

        with open(manifest_path) as f:
            manifest = json.load(f)

        assert 'readings' in manifest, "Missing readings in data-index.json"
        assert 'predictions' in manifest, "Missing predictions in data-index.json"
        assert 'public_stations' in manifest, "Missing public_stations in data-index.json"
        assert 'validation' in manifest, "Missing validation in data-index.json"
