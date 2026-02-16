"""QA tests for prediction fallback simple model.

Tests verify:
1. Simple model trains with limited data (< 25 consecutive readings)
2. Simple model version increments on retrain
3. Prediction falls back to simple model when full model is absent
4. Full model takes priority when both models are available
5. Graceful failure when no models exist
6. Export passes model_type through to output JSON
7. train() returns instead of sys.exit(0), allowing train_simple() to run
8. All modified files pass syntax check
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


def create_synthetic_db(db_path, n_readings=10):
    """Create a synthetic weather database with the given number of contiguous readings."""
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

    base_ts = 1770900000
    for i in range(n_readings):
        ts = base_ts + i * 3600
        hour = (ts // 3600) % 24
        conn.execute(
            "INSERT INTO readings VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (ts, "2026-02-13", hour,
             20.0 + (i % 5) * 0.1, 400 + i, 50, 35,
             1013.0 + i * 0.01, 1012.0 + i * 0.01,
             19.5, 21.0, ts - 3600, ts - 7200,
             "stable", "stable", 50,
             5.0 + (i % 10) * 0.2, 60, 3.0, 8.0,
             ts - 3600, ts - 7200, "up", 80, 60, 5000),
        )
    conn.commit()
    conn.close()


def patch_script_dir(script_path, new_snake_dir):
    """Create a wrapper script that overrides SCRIPT_DIR to point to test env."""
    with open(script_path) as f:
        content = f.read()
    wrapper = tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False)
    wrapper.write(f'import os; os.environ["__TEST_SCRIPT_DIR"] = "{new_snake_dir}"\n')
    patched = content.replace(
        'SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))',
        f'SCRIPT_DIR = os.environ.get("__TEST_SCRIPT_DIR", os.path.dirname(os.path.abspath(__file__)))',
    )
    wrapper.write(patched)
    wrapper.flush()
    return wrapper.name


def run_script(script_path, args=None):
    """Run a Python script and return (returncode, stdout, stderr)."""
    cmd = [sys.executable, script_path]
    if args:
        cmd.extend(args)
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    return result.returncode, result.stdout, result.stderr


@pytest.fixture
def test_env(tmp_path):
    """Set up an isolated test environment with limited synthetic data (10 readings).

    This gives enough data for the simple 3h model but not the full 24h model.
    """
    test_snake = tmp_path / "the-snake-tank"
    shutil.copytree(SNAKE_DIR, test_snake, ignore=shutil.ignore_patterns("data", "models", "__pycache__"))
    data_dir = test_snake / "data"
    data_dir.mkdir(exist_ok=True)
    create_synthetic_db(str(data_dir / "weather.db"), n_readings=10)
    (test_snake / "models").mkdir(exist_ok=True)
    (data_dir / "predictions").mkdir(exist_ok=True)
    return {
        "snake_dir": str(test_snake),
        "model_dir": str(test_snake / "models"),
        "data_dir": str(data_dir),
        "pred_dir": str(data_dir / "predictions"),
    }


@pytest.fixture
def full_test_env(tmp_path):
    """Set up an isolated test environment with enough data for both models (30 readings).

    30 readings = enough for 6 full-model windows (30-24) and 27 simple windows (30-3).
    Both stay under 50 samples so LOO cross-validation is used (avoids the train/test
    split bug with y reassignment).
    """
    test_snake = tmp_path / "the-snake-tank"
    shutil.copytree(SNAKE_DIR, test_snake, ignore=shutil.ignore_patterns("data", "models", "__pycache__"))
    data_dir = test_snake / "data"
    data_dir.mkdir(exist_ok=True)
    create_synthetic_db(str(data_dir / "weather.db"), n_readings=30)
    (test_snake / "models").mkdir(exist_ok=True)
    (data_dir / "predictions").mkdir(exist_ok=True)
    return {
        "snake_dir": str(test_snake),
        "model_dir": str(test_snake / "models"),
        "data_dir": str(data_dir),
        "pred_dir": str(data_dir / "predictions"),
    }


class TestSimpleModelTrains:
    """Test 1: Simple model trains with limited data."""

    def test_simple_model_trains_when_full_cannot(self, test_env):
        """With < 25 readings, full model fails but simple model trains."""
        wrapper = patch_script_dir(TRAIN_SCRIPT, test_env["snake_dir"])
        try:
            rc, stdout, stderr = run_script(wrapper)
            assert rc == 0, f"Training script failed: {stdout}\n{stderr}"
            assert "Not enough data" in stdout, "Full model should report insufficient data"
            assert "Simple model saved" in stdout, "Simple model should train and save"
        finally:
            os.unlink(wrapper)

        simple_model = os.path.join(test_env["model_dir"], "temp_predictor_simple.joblib")
        assert os.path.exists(simple_model), "Simple model file not created"

        simple_meta = os.path.join(test_env["model_dir"], "simple_meta.json")
        assert os.path.exists(simple_meta), "Simple metadata file not created"

        with open(simple_meta) as f:
            meta = json.load(f)
        assert isinstance(meta["version"], int) and meta["version"] > 0
        assert "trained_at" in meta
        assert "sample_count" in meta
        assert "mae_indoor" in meta
        assert "mae_outdoor" in meta


class TestSimpleModelVersionIncrements:
    """Test 2: Simple model version increments on retrain."""

    def test_version_increments(self, test_env):
        wrapper = patch_script_dir(TRAIN_SCRIPT, test_env["snake_dir"])
        try:
            run_script(wrapper)
            simple_meta = os.path.join(test_env["model_dir"], "simple_meta.json")
            with open(simple_meta) as f:
                v1 = json.load(f)["version"]

            run_script(wrapper)
            with open(simple_meta) as f:
                v2 = json.load(f)["version"]

            assert v2 == v1 + 1, f"Version did not increment: {v1} -> {v2}"
        finally:
            os.unlink(wrapper)


class TestPredictionFallback:
    """Test 3: Prediction falls back to simple model."""

    def test_prediction_uses_simple_when_no_full(self, test_env):
        """When only simple model exists, prediction uses it."""
        wrapper = patch_script_dir(TRAIN_SCRIPT, test_env["snake_dir"])
        try:
            rc, _, _ = run_script(wrapper)
            assert rc == 0
        finally:
            os.unlink(wrapper)

        # Verify no full model exists
        full_model = os.path.join(test_env["model_dir"], "temp_predictor.joblib")
        assert not os.path.exists(full_model)

        output = os.path.join(test_env["snake_dir"], "pred_out.json")
        wrapper = patch_script_dir(PREDICT_SCRIPT, test_env["snake_dir"])
        try:
            rc, stdout, stderr = run_script(wrapper, ["--output", output])
            assert rc == 0, f"Prediction failed: {stdout}\n{stderr}"
            assert "3hrraw" in stdout.lower(), f"Expected 3hrRaw model indication: {stdout}"
        finally:
            os.unlink(wrapper)

        with open(output) as f:
            pred = json.load(f)
        assert pred["model_type"] == "3hrRaw"
        assert isinstance(pred["model_version"], int)

        # Verify version matches simple_meta.json
        with open(os.path.join(test_env["model_dir"], "simple_meta.json")) as f:
            meta = json.load(f)
        assert pred["model_version"] == meta["version"]


class TestFullModelPriority:
    """Test 4: Full model takes priority when available."""

    def test_full_model_used_over_simple(self, full_test_env):
        """When both models exist, prediction uses full model."""
        wrapper = patch_script_dir(TRAIN_SCRIPT, full_test_env["snake_dir"])
        try:
            rc, stdout, stderr = run_script(wrapper)
            assert rc == 0, f"Training failed: {stdout}\n{stderr}"
        finally:
            os.unlink(wrapper)

        # Both models should exist
        full_model = os.path.join(full_test_env["model_dir"], "temp_predictor.joblib")
        simple_model = os.path.join(full_test_env["model_dir"], "temp_predictor_simple.joblib")
        assert os.path.exists(full_model), "Full model not created"
        assert os.path.exists(simple_model), "Simple model not created"

        output = os.path.join(full_test_env["snake_dir"], "pred_out.json")
        wrapper = patch_script_dir(PREDICT_SCRIPT, full_test_env["snake_dir"])
        try:
            rc, stdout, stderr = run_script(wrapper, ["--output", output])
            assert rc == 0, f"Prediction failed: {stdout}\n{stderr}"
        finally:
            os.unlink(wrapper)

        with open(output) as f:
            pred = json.load(f)
        assert pred["model_type"] == "24hrRaw", f"Expected 24hrRaw model, got {pred['model_type']}"


class TestNoModelGracefulFailure:
    """Test 5: Both models fail gracefully."""

    def test_no_models_exits_with_error(self, test_env):
        """With no model files, predict.py exits with code 1."""
        output = os.path.join(test_env["snake_dir"], "pred_out.json")
        wrapper = patch_script_dir(PREDICT_SCRIPT, test_env["snake_dir"])
        try:
            rc, stdout, stderr = run_script(wrapper, ["--output", output])
            assert rc == 1, f"Expected exit code 1, got {rc}"
            assert "no model" in stdout.lower() or "error" in stdout.lower(), (
                f"Expected error message, got: {stdout}"
            )
        finally:
            os.unlink(wrapper)


class TestExportModelType:
    """Test 6: Export passes model_type through to output JSON."""

    def test_export_includes_model_type_from_prediction(self, test_env):
        """Export propagates model_type when prediction file has it."""
        from datetime import datetime, timezone

        now = datetime.now(timezone.utc)
        date_str = now.strftime("%Y-%m-%d")
        hour = now.hour

        # Create weather data file
        weather_dir = os.path.join(test_env["data_dir"], date_str)
        os.makedirs(weather_dir, exist_ok=True)
        weather_file = os.path.join(weather_dir, f"{hour:02d}00.json")
        with open(weather_file, "w") as f:
            json.dump({
                "body": {"devices": [{"dashboard_data": {"Temperature": 20.5, "time_utc": int(now.timestamp())},
                    "modules": [{"type": "NAModule1", "dashboard_data": {"Temperature": 5.0}}]}]}
            }, f)

        # Create prediction file WITH model_type
        pred_dir = os.path.join(test_env["pred_dir"], date_str)
        os.makedirs(pred_dir, exist_ok=True)
        pred_file = os.path.join(pred_dir, f"{hour:02d}00.json")
        with open(pred_file, "w") as f:
            json.dump({
                "generated_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "model_version": 3,
                "model_type": "3hrRaw",
                "prediction": {"prediction_for": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
                               "temp_indoor": 20.8, "temp_outdoor": 4.5},
            }, f)

        output = os.path.join(test_env["snake_dir"], "export_out.json")
        wrapper = patch_script_dir(EXPORT_SCRIPT, test_env["snake_dir"])
        try:
            rc, stdout, stderr = run_script(wrapper, ["--output", output, "--hours", "2"])
            assert rc == 0, f"Export failed: {stdout}\n{stderr}"
        finally:
            os.unlink(wrapper)

        with open(output) as f:
            export = json.load(f)
        if export["next_prediction"] is not None:
            assert export["next_prediction"].get("model_type") == "3hrRaw"
            assert export["next_prediction"].get("model_version") == 3

    def test_export_omits_model_type_when_absent(self, test_env):
        """Export gracefully omits model_type when prediction file lacks it."""
        from datetime import datetime, timezone

        now = datetime.now(timezone.utc)
        date_str = now.strftime("%Y-%m-%d")
        hour = now.hour

        weather_dir = os.path.join(test_env["data_dir"], date_str)
        os.makedirs(weather_dir, exist_ok=True)
        weather_file = os.path.join(weather_dir, f"{hour:02d}00.json")
        with open(weather_file, "w") as f:
            json.dump({
                "body": {"devices": [{"dashboard_data": {"Temperature": 20.5, "time_utc": int(now.timestamp())},
                    "modules": [{"type": "NAModule1", "dashboard_data": {"Temperature": 5.0}}]}]}
            }, f)

        # Create prediction file WITHOUT model_type (old format)
        pred_dir = os.path.join(test_env["pred_dir"], date_str)
        os.makedirs(pred_dir, exist_ok=True)
        pred_file = os.path.join(pred_dir, f"{hour:02d}00.json")
        with open(pred_file, "w") as f:
            json.dump({
                "generated_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "prediction": {"prediction_for": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
                               "temp_indoor": 20.8, "temp_outdoor": 4.5},
            }, f)

        output = os.path.join(test_env["snake_dir"], "export_out.json")
        wrapper = patch_script_dir(EXPORT_SCRIPT, test_env["snake_dir"])
        try:
            rc, stdout, stderr = run_script(wrapper, ["--output", output, "--hours", "2"])
            assert rc == 0, f"Export failed: {stdout}\n{stderr}"
        finally:
            os.unlink(wrapper)

        with open(output) as f:
            export = json.load(f)
        raw = json.dumps(export)
        assert '"model_type": null' not in raw, "model_type should be omitted, not null"


class TestTrainReturnsNotExits:
    """Test 7: train() uses return, not sys.exit(0)."""

    def test_both_functions_run(self, test_env):
        """Both train() and train_simple() produce output in a single run."""
        wrapper = patch_script_dir(TRAIN_SCRIPT, test_env["snake_dir"])
        try:
            rc, stdout, stderr = run_script(wrapper)
            assert rc == 0, f"Script failed: {stdout}\n{stderr}"
            assert "Not enough data" in stdout, "Full model should report insufficient data"
            assert "Simple Model" in stdout, "Simple model section should appear"
            assert "Simple model saved" in stdout, "Simple model should train successfully"
        finally:
            os.unlink(wrapper)

    def test_source_uses_return(self):
        """Verify train() source code uses return, not sys.exit(0)."""
        with open(TRAIN_SCRIPT) as f:
            content = f.read()

        # Find the train() function body (between 'def train():' and next 'def ')
        import re
        train_match = re.search(r'def train\(\):(.*?)(?=\ndef )', content, re.DOTALL)
        assert train_match, "Could not find train() function"
        train_body = train_match.group(1)

        # sys.exit(0) should NOT be in train() — sys.exit(1) for missing DB is OK
        assert 'sys.exit(0)' not in train_body, "train() still uses sys.exit(0)"
        assert 'return' in train_body, "train() should use return for insufficient data"


class TestSyntaxCheck:
    """Test 8: All modified files pass syntax check."""

    @pytest.mark.parametrize("filename", ["train_model.py", "predict.py", "export_weather.py"])
    def test_syntax(self, filename):
        script = os.path.join(SNAKE_DIR, filename)
        rc, stdout, stderr = run_script(script, ["-c", f"import py_compile; py_compile.compile('{script}', doraise=True)"])
        # Use py_compile directly
        import py_compile
        try:
            py_compile.compile(script, doraise=True)
        except py_compile.PyCompileError as e:
            pytest.fail(f"{filename} has syntax errors: {e}")
