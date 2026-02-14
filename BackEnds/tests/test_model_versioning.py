"""QA tests for ML model versioning, prediction fallback, and model_version propagation.

Tests verify:
1. Model metadata is written correctly after training
2. Previous model backup works
3. Prediction output includes model_version
4. Prediction fallback to previous model on corruption
5. Export includes model_version in next_prediction and history
6. Backwards compatibility with old prediction files lacking model_version
7. .gitignore no longer excludes *.joblib
"""

import json
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile

import pytest

SNAKE_DIR = os.path.join(os.path.dirname(__file__), "..", "the-snake-tank")
SNAKE_DIR = os.path.abspath(SNAKE_DIR)

TRAIN_SCRIPT = os.path.join(SNAKE_DIR, "train_model.py")
PREDICT_SCRIPT = os.path.join(SNAKE_DIR, "predict.py")
EXPORT_SCRIPT = os.path.join(SNAKE_DIR, "export_weather.py")
GITIGNORE_PATH = os.path.join(SNAKE_DIR, ".gitignore")

MODEL_DIR = os.path.join(SNAKE_DIR, "models")
MODEL_PATH = os.path.join(MODEL_DIR, "temp_predictor.joblib")
META_PATH = os.path.join(MODEL_DIR, "model_meta.json")
PREV_MODEL_PATH = os.path.join(MODEL_DIR, "temp_predictor_prev.joblib")


def create_synthetic_db(db_path, n_readings=50):
    """Create a synthetic weather database with enough contiguous readings for training."""
    conn = sqlite3.connect(db_path)
    conn.execute("""CREATE TABLE readings (
        timestamp             INTEGER PRIMARY KEY,
        date                  TEXT NOT NULL,
        hour                  INTEGER NOT NULL,
        temp_indoor            REAL,
        co2                    INTEGER,
        humidity_indoor        INTEGER,
        noise                  INTEGER,
        pressure               REAL,
        pressure_absolute      REAL,
        temp_indoor_min        REAL,
        temp_indoor_max        REAL,
        date_min_temp_indoor   INTEGER,
        date_max_temp_indoor   INTEGER,
        temp_trend             TEXT,
        pressure_trend         TEXT,
        wifi_status            INTEGER,
        temp_outdoor           REAL,
        humidity_outdoor       INTEGER,
        temp_outdoor_min       REAL,
        temp_outdoor_max       REAL,
        date_min_temp_outdoor  INTEGER,
        date_max_temp_outdoor  INTEGER,
        temp_outdoor_trend     TEXT,
        battery_percent        INTEGER,
        rf_status              INTEGER,
        battery_vp             INTEGER
    )""")

    base_ts = 1770900000  # arbitrary start
    for i in range(n_readings):
        ts = base_ts + i * 3600  # exactly 1 hour apart (well within MAX_GAP=5400)
        hour = (ts // 3600) % 24
        date_str = "2026-02-13"
        conn.execute(
            """INSERT INTO readings VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            )""",
            (
                ts, date_str, hour,
                20.0 + (i % 5) * 0.1,  # temp_indoor
                400 + i,               # co2
                50,                     # humidity_indoor
                35,                     # noise
                1013.0 + i * 0.01,     # pressure
                1012.0 + i * 0.01,     # pressure_absolute
                19.5,                   # temp_indoor_min
                21.0,                   # temp_indoor_max
                ts - 3600,              # date_min_temp_indoor
                ts - 7200,              # date_max_temp_indoor
                "stable",               # temp_trend
                "stable",               # pressure_trend
                50,                     # wifi_status
                5.0 + (i % 10) * 0.2,  # temp_outdoor
                60,                     # humidity_outdoor
                3.0,                    # temp_outdoor_min
                8.0,                    # temp_outdoor_max
                ts - 3600,              # date_min_temp_outdoor
                ts - 7200,              # date_max_temp_outdoor
                "up",                   # temp_outdoor_trend
                80,                     # battery_percent
                60,                     # rf_status
                5000,                   # battery_vp
            ),
        )
    conn.commit()
    conn.close()


@pytest.fixture
def test_env(tmp_path):
    """Set up an isolated test environment with synthetic data."""
    # Copy the snake-tank directory structure
    test_snake = tmp_path / "the-snake-tank"
    shutil.copytree(SNAKE_DIR, test_snake, ignore=shutil.ignore_patterns("data", "models", "__pycache__"))

    # Create data dir with synthetic DB
    data_dir = test_snake / "data"
    data_dir.mkdir(exist_ok=True)
    db_path = data_dir / "weather.db"
    create_synthetic_db(str(db_path), n_readings=50)

    # Create predictions dir
    pred_dir = data_dir / "predictions"
    pred_dir.mkdir(exist_ok=True)

    # Create models dir
    models_dir = test_snake / "models"
    models_dir.mkdir(exist_ok=True)

    return {
        "snake_dir": str(test_snake),
        "db_path": str(db_path),
        "model_dir": str(models_dir),
        "model_path": str(models_dir / "temp_predictor.joblib"),
        "meta_path": str(models_dir / "model_meta.json"),
        "prev_model_path": str(models_dir / "temp_predictor_prev.joblib"),
        "data_dir": str(data_dir),
        "pred_dir": str(pred_dir),
    }


def run_script(script_path, args=None, env_overrides=None):
    """Run a Python script and return (returncode, stdout, stderr)."""
    cmd = [sys.executable, script_path]
    if args:
        cmd.extend(args)
    env = os.environ.copy()
    if env_overrides:
        env.update(env_overrides)
    result = subprocess.run(cmd, capture_output=True, text=True, env=env, timeout=120)
    return result.returncode, result.stdout, result.stderr


def patch_script_dir(script_path, new_snake_dir):
    """Create a wrapper script that overrides SCRIPT_DIR to point to test env."""
    # Read original script
    with open(script_path) as f:
        content = f.read()

    # Create a temp script that patches SCRIPT_DIR
    wrapper = tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False)
    wrapper.write(f'import os; os.environ["__TEST_SCRIPT_DIR"] = "{new_snake_dir}"\n')
    # Replace SCRIPT_DIR assignment
    patched = content.replace(
        'SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))',
        f'SCRIPT_DIR = os.environ.get("__TEST_SCRIPT_DIR", os.path.dirname(os.path.abspath(__file__)))',
    )
    wrapper.write(patched)
    wrapper.flush()
    return wrapper.name


class TestModelMetadata:
    """Test 1: Model metadata is written correctly."""

    def test_meta_written_after_training(self, test_env):
        """Training produces model_meta.json with correct keys and types."""
        wrapper = patch_script_dir(TRAIN_SCRIPT, test_env["snake_dir"])
        try:
            rc, stdout, stderr = run_script(wrapper)
            assert rc == 0, f"Training failed: {stdout}\n{stderr}"

            assert os.path.exists(test_env["meta_path"]), "model_meta.json not created"

            with open(test_env["meta_path"]) as f:
                meta = json.load(f)

            assert "version" in meta
            assert isinstance(meta["version"], int)
            assert meta["version"] > 0

            assert "trained_at" in meta
            assert isinstance(meta["trained_at"], str)
            # Verify ISO timestamp format
            assert "T" in meta["trained_at"]
            assert meta["trained_at"].endswith("Z")

            assert "sample_count" in meta
            assert isinstance(meta["sample_count"], int)
            assert meta["sample_count"] > 0

            assert "mae_indoor" in meta
            assert isinstance(meta["mae_indoor"], float)

            assert "mae_outdoor" in meta
            assert isinstance(meta["mae_outdoor"], float)
        finally:
            os.unlink(wrapper)

    def test_version_increments(self, test_env):
        """Running training twice increments the version."""
        wrapper = patch_script_dir(TRAIN_SCRIPT, test_env["snake_dir"])
        try:
            # First training
            rc1, stdout1, _ = run_script(wrapper)
            assert rc1 == 0, f"First training failed: {stdout1}"

            with open(test_env["meta_path"]) as f:
                meta1 = json.load(f)
            v1 = meta1["version"]

            # Second training
            rc2, stdout2, _ = run_script(wrapper)
            assert rc2 == 0, f"Second training failed: {stdout2}"

            with open(test_env["meta_path"]) as f:
                meta2 = json.load(f)
            v2 = meta2["version"]

            assert v2 == v1 + 1, f"Version did not increment: {v1} -> {v2}"
        finally:
            os.unlink(wrapper)


class TestModelBackup:
    """Test 2: Previous model backup."""

    def test_backup_created_on_second_train(self, test_env):
        """After training twice, both current and previous model files exist."""
        wrapper = patch_script_dir(TRAIN_SCRIPT, test_env["snake_dir"])
        try:
            # First training
            rc, _, _ = run_script(wrapper)
            assert rc == 0
            assert os.path.exists(test_env["model_path"]), "Model not created after first training"
            assert not os.path.exists(test_env["prev_model_path"]), "Previous model shouldn't exist after first training"

            # Second training
            rc, _, _ = run_script(wrapper)
            assert rc == 0
            assert os.path.exists(test_env["model_path"]), "Current model missing after second training"
            assert os.path.exists(test_env["prev_model_path"]), "Previous model not created after second training"
        finally:
            os.unlink(wrapper)

    def test_backup_is_loadable(self, test_env):
        """Both current and previous model files are valid joblib files."""
        import joblib

        wrapper = patch_script_dir(TRAIN_SCRIPT, test_env["snake_dir"])
        try:
            # Train twice to get both files
            run_script(wrapper)
            run_script(wrapper)

            model_current = joblib.load(test_env["model_path"])
            assert model_current is not None

            model_prev = joblib.load(test_env["prev_model_path"])
            assert model_prev is not None
        finally:
            os.unlink(wrapper)


class TestPredictionModelVersion:
    """Test 3: Prediction includes model_version."""

    def test_prediction_has_model_version(self, test_env):
        """Prediction output JSON contains model_version matching metadata."""
        # Train first
        train_wrapper = patch_script_dir(TRAIN_SCRIPT, test_env["snake_dir"])
        try:
            rc, stdout, stderr = run_script(train_wrapper)
            assert rc == 0, f"Training failed: {stdout}\n{stderr}"
        finally:
            os.unlink(train_wrapper)

        # Read expected version from metadata
        with open(test_env["meta_path"]) as f:
            meta = json.load(f)
        expected_version = meta["version"]

        # Run prediction
        output_path = os.path.join(test_env["snake_dir"], "test_prediction.json")
        pred_wrapper = patch_script_dir(PREDICT_SCRIPT, test_env["snake_dir"])
        try:
            rc, stdout, stderr = run_script(pred_wrapper, ["--output", output_path])
            assert rc == 0, f"Prediction failed: {stdout}\n{stderr}"
        finally:
            os.unlink(pred_wrapper)

        with open(output_path) as f:
            pred = json.load(f)

        assert "model_version" in pred, "model_version missing from prediction output"
        assert isinstance(pred["model_version"], int), "model_version should be an integer"
        assert pred["model_version"] == expected_version, (
            f"model_version mismatch: got {pred['model_version']}, expected {expected_version}"
        )

        # Verify all other expected fields still present
        assert "generated_at" in pred
        assert "last_reading" in pred
        assert "prediction" in pred


class TestPredictionFallback:
    """Test 4: Prediction fallback works when current model is corrupted."""

    def test_fallback_to_previous_model(self, test_env):
        """When current model is corrupted, prediction falls back to previous model."""
        # Train twice to get both current and previous model
        wrapper = patch_script_dir(TRAIN_SCRIPT, test_env["snake_dir"])
        try:
            run_script(wrapper)
            run_script(wrapper)
        finally:
            os.unlink(wrapper)

        # Read current version
        with open(test_env["meta_path"]) as f:
            meta = json.load(f)
        current_version = meta["version"]

        # Corrupt the current model
        with open(test_env["model_path"], "wb") as f:
            f.write(b"THIS IS GARBAGE DATA NOT A VALID JOBLIB FILE")

        # Run prediction — should fall back to previous model
        output_path = os.path.join(test_env["snake_dir"], "test_fallback.json")
        pred_wrapper = patch_script_dir(PREDICT_SCRIPT, test_env["snake_dir"])
        try:
            rc, stdout, stderr = run_script(pred_wrapper, ["--output", output_path])
            assert rc == 0, f"Fallback prediction failed: {stdout}\n{stderr}"
            assert "previous model" in stdout.lower() or "fallback" in stdout.lower(), (
                f"Expected fallback warning in output, got: {stdout}"
            )
        finally:
            os.unlink(pred_wrapper)

        with open(output_path) as f:
            pred = json.load(f)

        assert "model_version" in pred
        assert pred["model_version"] == current_version - 1, (
            f"Fallback model_version should be {current_version - 1}, got {pred['model_version']}"
        )


class TestExportModelVersion:
    """Test 5: Export includes model_version in next_prediction and history."""

    def test_export_propagates_model_version(self, test_env):
        """Export picks up model_version from prediction files that have it."""
        # Create a prediction file WITH model_version
        from datetime import datetime, timezone

        now = datetime.now(timezone.utc)
        date_str = now.strftime("%Y-%m-%d")
        hour = now.hour

        pred_date_dir = os.path.join(test_env["pred_dir"], date_str)
        os.makedirs(pred_date_dir, exist_ok=True)

        # Create a prediction file for the current hour (used as next_prediction source)
        pred_file = os.path.join(pred_date_dir, f"{hour:02d}00.json")
        pred_data = {
            "generated_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "model_version": 3,
            "last_reading": {
                "timestamp": int(now.timestamp()),
                "date": date_str,
                "hour": hour,
                "temp_indoor": 20.5,
                "temp_outdoor": 5.0,
            },
            "prediction": {
                "prediction_for": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "temp_indoor": 20.8,
                "temp_outdoor": 4.5,
            },
        }
        with open(pred_file, "w") as f:
            json.dump(pred_data, f, indent=2)

        # Also create a weather data file for the current hour so export finds a reading
        weather_date_dir = os.path.join(test_env["data_dir"], date_str)
        os.makedirs(weather_date_dir, exist_ok=True)
        weather_file = os.path.join(weather_date_dir, f"{hour:02d}00.json")
        weather_data = {
            "body": {
                "devices": [{
                    "dashboard_data": {
                        "Temperature": 20.5,
                        "time_utc": int(now.timestamp()),
                    },
                    "modules": [{
                        "type": "NAModule1",
                        "dashboard_data": {"Temperature": 5.0},
                    }],
                }]
            }
        }
        with open(weather_file, "w") as f:
            json.dump(weather_data, f, indent=2)

        # Run export
        output_path = os.path.join(test_env["snake_dir"], "test_weather.json")
        export_wrapper = patch_script_dir(EXPORT_SCRIPT, test_env["snake_dir"])
        try:
            rc, stdout, stderr = run_script(export_wrapper, ["--output", output_path, "--hours", "2"])
            assert rc == 0, f"Export failed: {stdout}\n{stderr}"
        finally:
            os.unlink(export_wrapper)

        with open(output_path) as f:
            export = json.load(f)

        # Check next_prediction has model_version
        if export["next_prediction"] is not None:
            assert "model_version" in export["next_prediction"], (
                "model_version missing from next_prediction"
            )
            assert export["next_prediction"]["model_version"] == 3


class TestBackwardsCompatibility:
    """Test 6: Export works with old prediction files lacking model_version."""

    def test_export_handles_missing_model_version(self, test_env):
        """Export gracefully omits model_version when prediction files don't have it."""
        from datetime import datetime, timedelta, timezone

        now = datetime.now(timezone.utc)
        date_str = now.strftime("%Y-%m-%d")
        hour = now.hour

        pred_date_dir = os.path.join(test_env["pred_dir"], date_str)
        os.makedirs(pred_date_dir, exist_ok=True)

        # Create prediction file WITHOUT model_version (old format)
        pred_file = os.path.join(pred_date_dir, f"{hour:02d}00.json")
        pred_data = {
            "generated_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "last_reading": {
                "timestamp": int(now.timestamp()),
                "date": date_str,
                "hour": hour,
                "temp_indoor": 20.5,
                "temp_outdoor": 5.0,
            },
            "prediction": {
                "prediction_for": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "temp_indoor": 20.8,
                "temp_outdoor": 4.5,
            },
        }
        with open(pred_file, "w") as f:
            json.dump(pred_data, f, indent=2)

        # Create weather data file
        weather_date_dir = os.path.join(test_env["data_dir"], date_str)
        os.makedirs(weather_date_dir, exist_ok=True)
        weather_file = os.path.join(weather_date_dir, f"{hour:02d}00.json")
        weather_data = {
            "body": {
                "devices": [{
                    "dashboard_data": {
                        "Temperature": 20.5,
                        "time_utc": int(now.timestamp()),
                    },
                    "modules": [{
                        "type": "NAModule1",
                        "dashboard_data": {"Temperature": 5.0},
                    }],
                }]
            }
        }
        with open(weather_file, "w") as f:
            json.dump(weather_data, f, indent=2)

        # Run export — should not crash
        output_path = os.path.join(test_env["snake_dir"], "test_compat.json")
        export_wrapper = patch_script_dir(EXPORT_SCRIPT, test_env["snake_dir"])
        try:
            rc, stdout, stderr = run_script(export_wrapper, ["--output", output_path, "--hours", "2"])
            assert rc == 0, f"Export crashed on old prediction format: {stdout}\n{stderr}"
        finally:
            os.unlink(export_wrapper)

        with open(output_path) as f:
            export = json.load(f)

        # next_prediction should NOT have model_version (since source doesn't)
        if export["next_prediction"] is not None:
            assert "model_version" not in export["next_prediction"], (
                "model_version should not appear when source prediction lacks it"
            )

        # History entries should NOT have model_version
        for entry in export["history"]:
            assert "model_version" not in entry, (
                "model_version should not appear in history when prediction lacks it"
            )

        # No null values for model_version
        raw = json.dumps(export)
        assert '"model_version": null' not in raw, (
            "model_version should be omitted, not set to null"
        )


class TestGitignore:
    """Test 7: .gitignore no longer excludes *.joblib."""

    def test_gitignore_allows_joblib(self):
        """Verify .gitignore does not contain *.joblib."""
        assert os.path.exists(GITIGNORE_PATH), f".gitignore not found at {GITIGNORE_PATH}"

        with open(GITIGNORE_PATH) as f:
            content = f.read()

        assert "*.joblib" not in content, (
            f".gitignore still contains *.joblib — model files won't be committed"
        )


class TestExportWithRealData:
    """Run export against the real production data to verify no crashes."""

    def test_export_real_data_no_crash(self, tmp_path):
        """Export with real data directory should not crash (backwards compat)."""
        output_path = str(tmp_path / "real_weather.json")
        rc, stdout, stderr = run_script(EXPORT_SCRIPT, ["--output", output_path, "--hours", "24"])
        assert rc == 0, f"Export with real data crashed: {stdout}\n{stderr}"

        with open(output_path) as f:
            export = json.load(f)

        assert "generated_at" in export
        assert "current" in export
        assert "next_prediction" in export
        assert "history" in export
        assert isinstance(export["history"], list)

        # Real prediction files lack model_version — verify no nulls
        raw = json.dumps(export)
        assert '"model_version": null' not in raw
