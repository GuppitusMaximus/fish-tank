"""QA tests for public station data fetching (Postgres-era pipeline)."""

import ast
import inspect
import os
import sys

# Add the-snake-tank to path so we can import the module
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'the-snake-tank'))

from fetch_weather import (
    get_public_data,
    store_public_stations
)


def test_get_public_data_function_signature():
    """Verify get_public_data has correct parameters and calls correct API."""
    sig = inspect.signature(get_public_data)
    params = list(sig.parameters.keys())
    assert params == ['access_token', 'lat_ne', 'lon_ne', 'lat_sw', 'lon_sw'], \
        f"Unexpected parameters: {params}"

    source = inspect.getsource(get_public_data)
    assert "https://api.netatmo.com/api/getpublicdata" in source, \
        "Incorrect API URL in get_public_data"
    assert "Authorization" in source, \
        "Missing Authorization header in get_public_data"


def test_store_public_stations_function_signature():
    """Verify store_public_stations has correct parameters (Postgres, no db_path)."""
    sig = inspect.signature(store_public_stations)
    params = list(sig.parameters.keys())
    assert params == ['data', 'fetched_at'], \
        f"Unexpected parameters: {params}"


def test_store_public_stations_handles_api_format():
    """Verify store_public_stations parses the nested measures format correctly."""
    source = inspect.getsource(store_public_stations)

    # Check it handles nested type/res format
    assert '"type"' in source or "'type'" in source, \
        "Missing type check for measures format"
    assert '"res"' in source or "'res'" in source, \
        "Missing res extraction for measures format"

    # Check it extracts location correctly (lon first, then lat)
    assert 'place' in source, "Missing place extraction"
    assert 'location' in source, "Missing location extraction"

    # Writes to Postgres
    assert 'INSERT INTO public_stations' in source, \
        "Missing INSERT into public_stations"

    # Check for 30-day cleanup
    assert "DELETE FROM public_stations" in source, \
        "Missing cleanup of old data"
    assert "30 days" in source, "Missing 30-day retention period"


def test_conditional_execution_in_main():
    """Verify main() uses conditional execution based on env vars."""
    import fetch_weather

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
    source = inspect.getsource(store_public_stations)

    lines = source.split('\n')
    location_lines = [l for l in lines if 'location[0]' in l or 'location[1]' in l]

    lon_line = [l for l in location_lines if 'location[0]' in l]
    lat_line = [l for l in location_lines if 'location[1]' in l]

    assert len(lon_line) > 0, "Missing location[0] extraction"
    assert len(lat_line) > 0, "Missing location[1] extraction"

    assert 'lon' in lon_line[0], "location[0] should be assigned to lon"
    assert 'lat' in lat_line[0], "location[1] should be assigned to lat"


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
