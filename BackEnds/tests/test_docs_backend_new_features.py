#!/usr/bin/env python3
"""QA tests for qa-docs-backend plan — new README content verification.

Verifies that the updated the-snake-tank/README.md accurately documents:
- Public station data fetching and storage
- 24hr_pubRA_RC3_GB gradient-boosted model
- Cloudflare R2 upload and auth lockdown
- Browse data exports (data-index.json, frontend.db.gz)
- Project structure accuracy against actual files
"""

import os
import re
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(SCRIPT_DIR, "..", "the-snake-tank")
README_PATH = os.path.join(BACKEND_DIR, "README.md")
DATA_DIR = os.path.join(BACKEND_DIR, "data")
MODELS_DIR = os.path.join(BACKEND_DIR, "models")


def read_readme():
    with open(README_PATH) as f:
        return f.read()


def test_public_stations_documented():
    """Public station data pipeline must be fully documented."""
    content = read_readme()

    # public_features.py must be mentioned as the spatial feature engineering module
    assert "public_features.py" in content, "public_features.py not mentioned in README"

    # data/public-stations/ directory must be in the project structure
    assert "public-stations/" in content, "data/public-stations/ not in project structure"

    # CSV storage format must be noted
    assert ".csv" in content.lower() or "csv" in content.lower(), \
        "CSV storage format not mentioned"

    # Public station fetching must be explained
    assert "getpublicdata" in content or "public station" in content.lower(), \
        "Public station API not mentioned"

    # Bounding box env vars must be documented
    assert "NETATMO_PUBLIC_LAT_NE" in content, "NETATMO_PUBLIC_LAT_NE env var not documented"
    assert "NETATMO_PUBLIC_LON_NE" in content, "NETATMO_PUBLIC_LON_NE env var not documented"
    assert "NETATMO_PUBLIC_LAT_SW" in content, "NETATMO_PUBLIC_LAT_SW env var not documented"
    assert "NETATMO_PUBLIC_LON_SW" in content, "NETATMO_PUBLIC_LON_SW env var not documented"

    # SQLite storage for public stations must be mentioned
    assert "public_stations" in content, "public_stations table not mentioned"

    print("✓ Public station data pipeline documented")


def test_public_stations_dir_exists():
    """data/public-stations/ directory must exist with CSV files."""
    public_dir = os.path.join(DATA_DIR, "public-stations")
    assert os.path.isdir(public_dir), "data/public-stations/ directory not found"

    # Should have at least one dated subdirectory
    subdirs = [d for d in os.listdir(public_dir) if os.path.isdir(os.path.join(public_dir, d))]
    assert subdirs, "No date directories found in data/public-stations/"

    print(f"✓ data/public-stations/ exists with {len(subdirs)} date directories")


def test_gb_model_documented():
    """24hr_pubRA_RC3_GB gradient-boosted model must be documented."""
    content = read_readme()

    # Model name must appear
    assert "24hr_pubRA_RC3_GB" in content, "24hr_pubRA_RC3_GB model name not in README"

    # Must list alongside other models
    assert "3hrRaw" in content, "3hrRaw not mentioned"
    assert "24hrRaw" in content, "24hrRaw not mentioned"
    assert "6hrRC" in content, "6hrRC not mentioned"

    # LightGBM must be mentioned
    assert "LightGBM" in content or "lightgbm" in content, "LightGBM not mentioned"

    # Model architecture description
    assert "gradient" in content.lower(), "Gradient boosting not described"

    # Model files must be in project structure
    assert "temp_predictor_gb.joblib" in content, "temp_predictor_gb.joblib not in structure"
    assert "gb_meta.json" in content, "gb_meta.json not in structure"

    print("✓ 24hr_pubRA_RC3_GB model documented")


def test_gb_model_min_readings_documented():
    """GB model must document the 336-reading minimum requirement."""
    content = read_readme()

    assert "336" in content, "336 minimum readings requirement not documented"

    print("✓ GB model 336-reading requirement documented")


def test_r2_upload_documented():
    """Cloudflare R2 upload must be documented as part of export pipeline."""
    content = read_readme()

    # R2 must be mentioned in the architecture or export section
    assert "R2" in content or "Cloudflare R2" in content, "Cloudflare R2 not mentioned"

    # weather-public.json must be described as public-safe
    assert "weather-public.json" in content, "weather-public.json not mentioned"
    assert "public" in content.lower(), "Public-safe export concept not mentioned"

    # Protected files not committed to git
    assert "not committed" in content.lower() or "gitignored" in content.lower() or \
        "no longer committed" in content.lower() or "protected" in content.lower(), \
        "Protected files / auth lockdown not mentioned"

    # R2 env vars must be documented
    assert "R2_ENDPOINT_URL" in content, "R2_ENDPOINT_URL not documented"
    assert "R2_ACCESS_KEY_ID" in content, "R2_ACCESS_KEY_ID not documented"
    assert "R2_SECRET_ACCESS_KEY" in content, "R2_SECRET_ACCESS_KEY not documented"
    assert "R2_BUCKET_NAME" in content, "R2_BUCKET_NAME not documented"

    print("✓ Cloudflare R2 upload documented")


def test_frontend_db_documented():
    """frontend.db.gz export must be documented."""
    content = read_readme()

    assert "frontend.db.gz" in content, "frontend.db.gz not mentioned"

    print("✓ frontend.db.gz export documented")


def test_data_index_documented():
    """data-index.json manifest must be documented."""
    content = read_readme()

    assert "data-index.json" in content, "data-index.json not mentioned"

    print("✓ data-index.json manifest documented")


def test_project_structure_key_files():
    """Key new files must appear in the project structure listing."""
    content = read_readme()

    # Extract project structure tree
    tree_match = re.search(r'```\s*\nthe-snake-tank/\n(.*?)```', content, re.DOTALL)
    assert tree_match, "Project structure tree not found in README"
    tree = tree_match.group(1)

    required_in_tree = [
        "public_features.py",
        "public-stations/",
        "temp_predictor_gb.joblib",
        "gb_meta.json",
    ]

    missing = [f for f in required_in_tree if f not in tree]
    assert not missing, f"Files missing from project structure tree: {missing}"

    print("✓ Project structure includes all new key files")


def test_actual_files_match_structure():
    """Documented files must exist; missing files noted as expected."""
    content = read_readme()

    # These files must actually exist
    must_exist = [
        os.path.join(BACKEND_DIR, "public_features.py"),
        os.path.join(BACKEND_DIR, "fetch_weather.py"),
        os.path.join(BACKEND_DIR, "export_weather.py"),
        os.path.join(DATA_DIR, "public-stations"),
    ]

    for path in must_exist:
        assert os.path.exists(path), f"Documented file/dir missing: {path}"

    # These are gitignored model files — README should note they appear after first train
    gb_model = os.path.join(MODELS_DIR, "temp_predictor_gb.joblib")
    gb_meta = os.path.join(MODELS_DIR, "gb_meta.json")
    if not os.path.exists(gb_model):
        # README must note these appear after first training
        assert "appears after first" in content or "after first" in content.lower() or \
            "gitignored" in content.lower(), \
            "README should note GB model files appear after first training run"

    print("✓ Actual files match documented structure")


def test_auth_lockdown_documented():
    """Auth lockdown section must describe protected vs public files."""
    content = read_readme()

    # Auth lockdown section exists
    assert "Auth Lockdown" in content or "auth lockdown" in content.lower() or \
        "Protected" in content, "Auth lockdown section not found"

    # weather.json listed as protected
    assert "weather.json" in content, "weather.json not mentioned"

    # workflow.json listed as protected
    assert "workflow.json" in content, "workflow.json not mentioned"

    # weather-public.json listed as public
    assert "weather-public.json" in content, "weather-public.json not mentioned"

    print("✓ Auth lockdown section documents protected vs public files")


def test_public_features_py_exists():
    """public_features.py must exist as documented."""
    path = os.path.join(BACKEND_DIR, "public_features.py")
    assert os.path.exists(path), "public_features.py not found in the-snake-tank/"
    print("✓ public_features.py exists")


if __name__ == "__main__":
    tests = [
        test_public_stations_documented,
        test_public_stations_dir_exists,
        test_gb_model_documented,
        test_gb_model_min_readings_documented,
        test_r2_upload_documented,
        test_frontend_db_documented,
        test_data_index_documented,
        test_project_structure_key_files,
        test_actual_files_match_structure,
        test_auth_lockdown_documented,
        test_public_features_py_exists,
    ]

    failed = []
    for test in tests:
        try:
            test()
        except AssertionError as e:
            print(f"✗ {test.__name__}: {e}")
            failed.append((test.__name__, str(e)))
        except Exception as e:
            print(f"✗ {test.__name__}: Unexpected error: {e}")
            failed.append((test.__name__, f"Unexpected error: {e}"))

    print()
    if failed:
        print(f"FAILED: {len(failed)} test(s) failed")
        for name, err in failed:
            print(f"  - {name}: {err}")
        sys.exit(1)
    else:
        print(f"PASSED: All {len(tests)} tests passed")
        sys.exit(0)
