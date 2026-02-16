"""QA tests for public station data fetching feature."""

import ast
import os
import sys
import sqlite3

# Add the-snake-tank to path so we can import the module
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'the-snake-tank'))

from fetch_weather import (
    PUBLIC_STATIONS_TABLE_SQL,
    DB_PATH,
    get_public_data,
    store_public_stations
)


def test_public_stations_table_sql_schema():
    """Verify PUBLIC_STATIONS_TABLE_SQL has correct schema with 13 data columns."""
    # Parse the SQL to verify it creates the right columns
    assert "CREATE TABLE IF NOT EXISTS public_stations" in PUBLIC_STATIONS_TABLE_SQL

    # Expected columns: id + 13 data columns
    expected_columns = [
        'id',           # PRIMARY KEY AUTOINCREMENT
        'fetched_at',
        'station_id',
        'lat',
        'lon',
        'temperature',
        'humidity',
        'pressure',
        'rain_60min',
        'rain_24h',
        'wind_strength',
        'wind_angle',
        'gust_strength',
        'gust_angle'
    ]

    for col in expected_columns:
        assert col in PUBLIC_STATIONS_TABLE_SQL.lower(), f"Missing column: {col}"


def test_get_public_data_function_signature():
    """Verify get_public_data has correct parameters and calls correct API."""
    import inspect

    # Check function signature
    sig = inspect.signature(get_public_data)
    params = list(sig.parameters.keys())
    assert params == ['access_token', 'lat_ne', 'lon_ne', 'lat_sw', 'lon_sw'], \
        f"Unexpected parameters: {params}"

    # Check API URL is correct by reading source
    source = inspect.getsource(get_public_data)
    assert "https://api.netatmo.com/api/getpublicdata" in source, \
        "Incorrect API URL in get_public_data"
    assert "Authorization" in source, \
        "Missing Authorization header in get_public_data"


def test_store_public_stations_function_signature():
    """Verify store_public_stations has correct parameters."""
    import inspect

    sig = inspect.signature(store_public_stations)
    params = list(sig.parameters.keys())
    assert params == ['data', 'db_path', 'fetched_at'], \
        f"Unexpected parameters: {params}"


def test_store_public_stations_handles_api_format():
    """Verify store_public_stations parses the nested measures format correctly."""
    import inspect

    source = inspect.getsource(store_public_stations)

    # Check it handles nested type/res format
    assert '"type"' in source or "'type'" in source, \
        "Missing type check for measures format"
    assert '"res"' in source or "'res'" in source, \
        "Missing res extraction for measures format"

    # Check it extracts location correctly (lon first, then lat)
    assert 'place' in source, "Missing place extraction"
    assert 'location' in source, "Missing location extraction"

    # Check for table creation and index (table SQL is in PUBLIC_STATIONS_TABLE_SQL constant)
    assert 'PUBLIC_STATIONS_TABLE_SQL' in source, \
        "Missing table creation via PUBLIC_STATIONS_TABLE_SQL"
    assert 'CREATE INDEX IF NOT EXISTS' in source, \
        "Missing index creation on fetched_at"

    # Check for 30-day cleanup
    assert "DELETE FROM public_stations" in source, \
        "Missing cleanup of old data"
    assert "'-30 days'" in source or '"-30 days"' in source, \
        "Missing 30-day retention period"

    # Check for commit and close
    assert 'commit()' in source, "Missing commit"
    assert 'close()' in source, "Missing connection close"


def test_conditional_execution_in_main():
    """Verify main() uses conditional execution based on env vars."""
    import fetch_weather
    import inspect

    source = inspect.getsource(fetch_weather.main)

    # Check env vars are read with .get() (not crash-prone [])
    assert 'os.environ.get("NETATMO_PUBLIC_LAT_NE")' in source or \
           "os.environ.get('NETATMO_PUBLIC_LAT_NE')" in source, \
        "lat_ne not using safe os.environ.get()"
    assert 'os.environ.get("NETATMO_PUBLIC_LON_NE")' in source or \
           "os.environ.get('NETATMO_PUBLIC_LON_NE')" in source, \
        "lon_ne not using safe os.environ.get()"
    assert 'os.environ.get("NETATMO_PUBLIC_LAT_SW")' in source or \
           "os.environ.get('NETATMO_PUBLIC_LAT_SW')" in source, \
        "lat_sw not using safe os.environ.get()"
    assert 'os.environ.get("NETATMO_PUBLIC_LON_SW")' in source or \
           "os.environ.get('NETATMO_PUBLIC_LON_SW')" in source, \
        "lon_sw not using safe os.environ.get()"

    # Check for conditional execution with all()
    assert 'if all([' in source or 'if all(' in source, \
        "Missing all() check for env vars"

    # Check for try/except around public fetch
    assert 'try:' in source, "Missing try block for public fetch"
    assert 'except' in source, "Missing except block for public fetch"

    # Check for skipped message
    assert 'skipped' in source.lower() or 'not configured' in source.lower(), \
        "Missing message when public fetch is skipped"


def test_location_parsing_order():
    """Verify location is parsed as [lon, lat] not [lat, lon]."""
    import inspect

    source = inspect.getsource(store_public_stations)

    # Find the location parsing section
    lines = source.split('\n')
    location_lines = [l for l in lines if 'location[0]' in l or 'location[1]' in l]

    # Check that location[0] is assigned to lon and location[1] to lat
    lon_line = [l for l in location_lines if 'location[0]' in l]
    lat_line = [l for l in location_lines if 'location[1]' in l]

    assert len(lon_line) > 0, "Missing location[0] extraction"
    assert len(lat_line) > 0, "Missing location[1] extraction"

    # Verify assignment order (lon = location[0], lat = location[1])
    assert 'lon' in lon_line[0], "location[0] should be assigned to lon"
    assert 'lat' in lat_line[0], "location[1] should be assigned to lat"


def test_workflow_env_vars():
    """Verify GitHub workflow includes all 4 public station env vars."""
    workflow_path = os.path.join(
        os.path.dirname(__file__),
        '../../.github/workflows/netatmo.yml'
    )

    with open(workflow_path) as f:
        workflow = f.read()

    # Check all 4 env vars are present
    assert 'NETATMO_PUBLIC_LAT_NE: ${{ secrets.NETATMO_PUBLIC_LAT_NE }}' in workflow, \
        "Missing NETATMO_PUBLIC_LAT_NE in workflow"
    assert 'NETATMO_PUBLIC_LON_NE: ${{ secrets.NETATMO_PUBLIC_LON_NE }}' in workflow, \
        "Missing NETATMO_PUBLIC_LON_NE in workflow"
    assert 'NETATMO_PUBLIC_LAT_SW: ${{ secrets.NETATMO_PUBLIC_LAT_SW }}' in workflow, \
        "Missing NETATMO_PUBLIC_LAT_SW in workflow"
    assert 'NETATMO_PUBLIC_LON_SW: ${{ secrets.NETATMO_PUBLIC_LON_SW }}' in workflow, \
        "Missing NETATMO_PUBLIC_LON_SW in workflow"


def test_db_path_points_to_data_dir():
    """Verify DB_PATH points to data/weather.db."""
    assert 'data/weather.db' in DB_PATH or 'data\\weather.db' in DB_PATH, \
        f"DB_PATH should point to data/weather.db, got {DB_PATH}"


def test_table_can_be_created():
    """Verify public_stations table can actually be created in SQLite."""
    # Use a temporary database for testing
    import tempfile

    with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as tmp:
        tmp_db = tmp.name

    try:
        conn = sqlite3.connect(tmp_db)
        conn.execute(PUBLIC_STATIONS_TABLE_SQL)

        # Verify table exists and has correct columns
        cols = conn.execute('PRAGMA table_info(public_stations)').fetchall()
        assert len(cols) == 14, f"Expected 14 columns, got {len(cols)}"

        # Verify column names and types
        col_names = [c[1] for c in cols]
        assert col_names[0] == 'id'
        assert col_names[1] == 'fetched_at'
        assert col_names[2] == 'station_id'
        assert 'lat' in col_names
        assert 'lon' in col_names
        assert 'temperature' in col_names
        assert 'humidity' in col_names
        assert 'pressure' in col_names
        assert 'rain_60min' in col_names
        assert 'rain_24h' in col_names
        assert 'wind_strength' in col_names
        assert 'wind_angle' in col_names
        assert 'gust_strength' in col_names
        assert 'gust_angle' in col_names

        conn.close()
    finally:
        os.unlink(tmp_db)


def test_syntax_valid():
    """Verify Python syntax is valid in fetch_weather.py."""
    script_path = os.path.join(
        os.path.dirname(__file__),
        '../the-snake-tank/fetch_weather.py'
    )

    with open(script_path) as f:
        source = f.read()

    # This will raise SyntaxError if invalid
    ast.parse(source)
