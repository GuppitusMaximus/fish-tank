#!/usr/bin/env python3
"""Test browse data export: manifest, public stations, validation history."""

import json
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SNAKE_DIR = os.path.join(SCRIPT_DIR, "..", "the-snake-tank")
DATA_DIR = os.path.join(SNAKE_DIR, "data")


def read_json(path):
    """Read and parse JSON file."""
    with open(path) as f:
        return json.load(f)


def test_manifest_schema():
    """Step 1: Verify manifest schema."""
    manifest = read_json(os.path.join(DATA_DIR, "data-index.json"))

    # Check all 4 categories exist
    assert "readings" in manifest, "Missing readings category"
    assert "predictions" in manifest, "Missing predictions category"
    assert "public_stations" in manifest, "Missing public_stations category"
    assert "validation" in manifest, "Missing validation category"
    assert "generated_at" in manifest, "Missing generated_at timestamp"

    # Validate readings format (unchanged)
    assert isinstance(manifest["readings"], dict), "readings should be a dict"
    for date, hours in manifest["readings"].items():
        assert isinstance(hours, list), f"readings[{date}] should be a list"
        assert all(isinstance(h, str) for h in hours), f"readings[{date}] should contain strings"
        assert hours == sorted(hours), f"readings[{date}] should be sorted"

    # Validate predictions structure
    preds = manifest["predictions"]
    assert "models" in preds, "predictions.models missing"
    assert "dates" in preds, "predictions.dates missing"
    assert isinstance(preds["models"], list), "predictions.models should be a list"
    assert len(preds["models"]) > 0, "predictions.models should not be empty"
    assert isinstance(preds["dates"], dict), "predictions.dates should be a dict"

    # Check predictions.dates structure: date -> hour -> [models]
    for date, hours_map in preds["dates"].items():
        assert isinstance(hours_map, dict), f"predictions.dates[{date}] should be a dict"
        for hour, models in hours_map.items():
            assert isinstance(models, list), f"predictions.dates[{date}][{hour}] should be a list"
            assert all(isinstance(m, str) for m in models), f"predictions.dates[{date}][{hour}] should contain strings"

    # Validate public_stations format (same as readings)
    assert isinstance(manifest["public_stations"], dict), "public_stations should be a dict"
    for date, hours in manifest["public_stations"].items():
        assert isinstance(hours, list), f"public_stations[{date}] should be a list"
        assert all(isinstance(h, str) for h in hours), f"public_stations[{date}] should contain strings"

    # Validate validation format (flat list of dates)
    assert isinstance(manifest["validation"], list), "validation should be a list"
    assert len(manifest["validation"]) > 0, "validation should not be empty"
    assert all(isinstance(d, str) for d in manifest["validation"]), "validation should contain date strings"
    # Should be sorted newest first
    assert manifest["validation"] == sorted(manifest["validation"], reverse=True), "validation should be sorted newest first"

    print("✓ Manifest schema is correct")


def test_prediction_model_discovery():
    """Step 2: Verify prediction model auto-discovery."""
    manifest = read_json(os.path.join(DATA_DIR, "data-index.json"))

    # Check that models list is populated with known types
    models = manifest["predictions"]["models"]
    known_models = {"3hrRaw", "6hrRC", "24hrRaw", "simple", "full"}
    found_models = set(models)
    assert found_models.issubset(known_models), f"Unknown model types: {found_models - known_models}"
    assert len(found_models) > 0, "Should have found at least one model type"

    # Pick a date and hour from predictions.dates and verify files exist
    dates = manifest["predictions"]["dates"]
    if not dates:
        print("! No prediction dates to verify")
        return

    # Test first date
    date_str = next(iter(dates))
    hours_map = dates[date_str]
    hour = next(iter(hours_map))
    models_list = hours_map[hour]

    pred_dir = os.path.join(DATA_DIR, "predictions", date_str)
    assert os.path.isdir(pred_dir), f"Prediction directory missing: {pred_dir}"

    for model in models_list:
        # Check for new format: HHMMSS_modeltype.json
        expected_new = f"{hour}_{model}.json"
        path_new = os.path.join(pred_dir, expected_new)

        # For "simple" model, also accept legacy format: HHMMSS.json
        expected_legacy = f"{hour}.json"
        path_legacy = os.path.join(pred_dir, expected_legacy)

        if model == "simple":
            assert os.path.exists(path_new) or os.path.exists(path_legacy), \
                f"Missing prediction file for {date_str} {hour} {model}: expected {expected_new} or {expected_legacy}"
        else:
            assert os.path.exists(path_new), \
                f"Missing prediction file for {date_str} {hour} {model}: expected {expected_new}"

    print(f"✓ Model auto-discovery is correct (verified {date_str} {hour} with {len(models_list)} models)")


def test_public_station_json_export():
    """Step 3: Verify public station JSON export."""
    manifest = read_json(os.path.join(DATA_DIR, "data-index.json"))

    stations = manifest["public_stations"]
    if not stations:
        print("! No public station data to verify")
        return

    # Pick first date
    date_str = next(iter(stations))
    hours = stations[date_str]
    hour = hours[0]

    # Check JSON file exists
    json_path = os.path.join(DATA_DIR, "public-stations", date_str, f"{hour}.json")
    assert os.path.exists(json_path), f"Missing JSON file: {json_path}"

    # Check CSV exists alongside
    csv_path = os.path.join(DATA_DIR, "public-stations", date_str, f"{hour}.csv")
    assert os.path.exists(csv_path), f"Missing CSV file: {csv_path}"

    # Verify JSON structure
    data = read_json(json_path)
    assert "fetched_at" in data, "Missing fetched_at"
    assert "station_count" in data, "Missing station_count"
    assert "stations" in data, "Missing stations array"

    assert isinstance(data["fetched_at"], str), "fetched_at should be string"
    assert isinstance(data["station_count"], int), "station_count should be integer"
    assert isinstance(data["stations"], list), "stations should be array"
    assert len(data["stations"]) == data["station_count"], "station_count should match array length"

    # Check first station structure
    if data["stations"]:
        station = data["stations"][0]
        assert "station_id" in station, "Missing station_id"
        assert "lat" in station, "Missing lat"
        assert "lon" in station, "Missing lon"
        assert "temperature" in station, "Missing temperature"
        assert "humidity" in station, "Missing humidity"
        assert "pressure" in station, "Missing pressure"

        # Verify numeric types
        assert isinstance(station["lat"], (int, float)), "lat should be numeric"
        assert isinstance(station["lon"], (int, float)), "lon should be numeric"
        # Temperature can be null
        if station["temperature"] is not None:
            assert isinstance(station["temperature"], (int, float)), "temperature should be numeric or null"
        # Same for humidity/pressure
        if station["humidity"] is not None:
            assert isinstance(station["humidity"], (int, float)), "humidity should be numeric or null"
        if station["pressure"] is not None:
            assert isinstance(station["pressure"], (int, float)), "pressure should be numeric or null"

    # Compare station count with CSV
    with open(csv_path) as f:
        csv_lines = f.readlines()
        csv_data_rows = len(csv_lines) - 1  # Subtract header
        assert csv_data_rows == data["station_count"], \
            f"CSV has {csv_data_rows} data rows but JSON says station_count={data['station_count']}"

    print(f"✓ Public station JSON export is correct (verified {date_str} {hour} with {data['station_count']} stations)")


def test_validation_history_export():
    """Step 4: Verify validation history export."""
    manifest = read_json(os.path.join(DATA_DIR, "data-index.json"))

    val_dates = manifest["validation"]
    assert len(val_dates) > 0, "No validation dates found"

    # Read original prediction-history.json
    history_path = os.path.join(DATA_DIR, "prediction-history.json")
    assert os.path.exists(history_path), "prediction-history.json missing"
    original_data = read_json(history_path)
    original_count = len(original_data)

    # Read all validation date files
    val_dir = os.path.join(DATA_DIR, "validation")
    assert os.path.isdir(val_dir), "validation/ directory missing"

    total_entries = 0
    for date_str in val_dates:
        val_path = os.path.join(val_dir, f"{date_str}.json")
        assert os.path.exists(val_path), f"Missing validation file: {val_path}"

        data = read_json(val_path)
        assert "date" in data, f"{date_str}.json missing date field"
        assert "entry_count" in data, f"{date_str}.json missing entry_count"
        assert "models" in data, f"{date_str}.json missing models"
        assert "entries" in data, f"{date_str}.json missing entries"

        assert data["date"] == date_str, f"date field should match filename"
        assert isinstance(data["entry_count"], int), "entry_count should be integer"
        assert isinstance(data["models"], list), "models should be list"
        assert isinstance(data["entries"], list), "entries should be list"
        assert len(data["entries"]) == data["entry_count"], "entry_count should match entries length"

        # Verify entries are sorted by for_hour descending
        for_hours = [e.get("for_hour", "") for e in data["entries"]]
        assert for_hours == sorted(for_hours, reverse=True), f"{date_str}.json entries should be sorted by for_hour descending"

        # Verify each entry belongs to this date
        for entry in data["entries"]:
            entry_date = entry["for_hour"][:10]
            assert entry_date == date_str, f"Entry with for_hour={entry['for_hour']} in wrong date file {date_str}.json"

        total_entries += data["entry_count"]

    # Verify total matches original
    assert total_entries == original_count, \
        f"Total entries in validation files ({total_entries}) doesn't match original ({original_count})"

    print(f"✓ Validation history export is correct ({total_entries} entries split across {len(val_dates)} dates)")


def test_dashboard_unchanged():
    """Step 5: Verify weather.json dashboard is unaffected."""
    weather_path = os.path.join(DATA_DIR, "weather.json")
    assert os.path.exists(weather_path), "weather.json missing"

    data = read_json(weather_path)

    # Check expected schema
    assert "generated_at" in data, "Missing generated_at"
    assert "schema_version" in data, "Missing schema_version"
    assert "current" in data, "Missing current"
    assert "predictions" in data, "Missing predictions"
    assert "history" in data, "Missing history"
    assert "next_prediction" in data, "Missing next_prediction (backwards compat)"

    # Verify current has readings
    if data["current"]:
        assert "readings" in data["current"], "current.readings missing"
        readings = data["current"]["readings"]
        assert "temp_indoor" in readings, "temp_indoor missing"
        assert "temp_outdoor" in readings, "temp_outdoor missing"

    # Verify predictions is a list
    assert isinstance(data["predictions"], list), "predictions should be a list"

    # Verify history is a list
    assert isinstance(data["history"], list), "history should be a list"

    print("✓ Dashboard (weather.json) is intact")


def test_export_code_quality():
    """Step 6: Verify export_weather.py code quality."""
    export_path = os.path.join(SNAKE_DIR, "export_weather.py")
    with open(export_path) as f:
        source = f.read()

    # Verify functions exist
    assert "def export_public_stations(" in source, "export_public_stations function missing"
    assert "def export_validation_history(" in source, "export_validation_history function missing"
    assert "def generate_manifest(" in source, "generate_manifest function missing"

    # Check export_public_stations handles missing dir
    func_start = source.index("def export_public_stations(")
    next_def = source.find("\ndef ", func_start + 1)
    func_body = source[func_start:next_def if next_def != -1 else len(source)]
    assert "if not os.path.isdir(PUBLIC_STATIONS_DIR)" in func_body, \
        "export_public_stations should check if directory exists"

    # Check export_validation_history handles missing file
    func_start = source.index("def export_validation_history(")
    next_def = source.find("\ndef ", func_start + 1)
    func_body = source[func_start:next_def if next_def != -1 else len(source)]
    assert "read_json(HISTORY_JSON)" in func_body, \
        "export_validation_history should use read_json (which returns None on error)"
    assert "if not data:" in func_body, "export_validation_history should check if data is None"

    # Check generate_manifest handles missing dirs
    func_start = source.index("def generate_manifest(")
    next_def = source.find("\ndef ", func_start + 1)
    func_body = source[func_start:next_def if next_def != -1 else len(source)]
    assert "if os.path.isdir(" in func_body, "generate_manifest should check if directories exist"

    # Check export() calls functions in right order
    export_func_start = source.index("def export(")
    export_body = source[export_func_start:]
    # Should call export_public_stations before generate_manifest
    pub_idx = export_body.index("export_public_stations()")
    val_idx = export_body.index("export_validation_history()")
    manifest_idx = export_body.index("generate_manifest(")
    assert pub_idx < manifest_idx, "export_public_stations should be called before generate_manifest"
    assert val_idx < manifest_idx, "export_validation_history should be called before generate_manifest"

    print("✓ Export code handles edge cases gracefully")


if __name__ == "__main__":
    try:
        test_manifest_schema()
        test_prediction_model_discovery()
        test_public_station_json_export()
        test_validation_history_export()
        test_dashboard_unchanged()
        test_export_code_quality()
        print("\n✅ ALL TESTS PASSED")
        sys.exit(0)
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
