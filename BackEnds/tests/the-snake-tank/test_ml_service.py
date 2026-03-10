"""QA tests for the FastAPI ML pipeline service (app_ml.py).

Tests health, trigger, status, auth, error resilience, CORS, and JSON logging.
"""

import json
import logging
import os
import sys
import time
from unittest.mock import patch, MagicMock

import pytest

# Add the-snake-tank to path so we can import app_ml
SNAKE_TANK_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "the-snake-tank")
sys.path.insert(0, os.path.abspath(SNAKE_TANK_DIR))

from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def _reset_app_state():
    """Reset module-level state between tests."""
    import app_ml
    app_ml._last_run = None
    yield


@pytest.fixture
def client():
    """Create a TestClient with DB check mocked (no real Postgres needed)."""
    with patch("app_ml._check_db", return_value="ok"):
        from app_ml import app
        with TestClient(app) as c:
            yield c


@pytest.fixture
def client_db_error():
    """TestClient where _check_db returns error."""
    with patch("app_ml._check_db", return_value="error"):
        from app_ml import app
        with TestClient(app) as c:
            yield c


# --- Step 2: Health endpoint ---

class TestHealth:
    def test_health_returns_200(self, client):
        resp = client.get("/ml/health")
        assert resp.status_code == 200

    def test_health_includes_service_field(self, client):
        data = client.get("/ml/health").json()
        assert data["service"] == "ml"

    def test_health_includes_version(self, client):
        data = client.get("/ml/health").json()
        assert "version" in data
        assert isinstance(data["version"], str)

    def test_health_includes_uptime(self, client):
        data = client.get("/ml/health").json()
        assert "uptime_seconds" in data
        assert isinstance(data["uptime_seconds"], int)
        assert data["uptime_seconds"] >= 0

    def test_health_database_ok(self, client):
        data = client.get("/ml/health").json()
        assert data["database"] == "ok"

    def test_health_database_error(self, client_db_error):
        data = client_db_error.get("/ml/health").json()
        assert data["database"] == "error"


# --- Step 3: Trigger endpoint auth ---

class TestTriggerAuth:
    def test_trigger_no_token_configured_allows_request(self, client):
        """When ML_TRIGGER_TOKEN is not set, trigger should not require auth."""
        with patch("app_ml.ML_TRIGGER_TOKEN", None), \
             patch("app_ml._execute_pipeline", return_value={"status": "ok", "steps": []}):
            resp = client.post("/ml/trigger")
            assert resp.status_code == 200

    def test_trigger_missing_auth_returns_401(self, client):
        """When token is configured, missing Authorization header → 401."""
        with patch("app_ml.ML_TRIGGER_TOKEN", "secret-token"):
            resp = client.post("/ml/trigger")
            assert resp.status_code == 401

    def test_trigger_wrong_token_returns_403(self, client):
        """When token is configured, wrong token → 403."""
        with patch("app_ml.ML_TRIGGER_TOKEN", "secret-token"):
            resp = client.post("/ml/trigger", headers={"Authorization": "Bearer wrong-token"})
            assert resp.status_code == 403

    def test_trigger_correct_token_succeeds(self, client):
        """When token is configured, correct token → 200."""
        with patch("app_ml.ML_TRIGGER_TOKEN", "secret-token"), \
             patch("app_ml._execute_pipeline", return_value={"status": "ok", "steps": []}):
            resp = client.post("/ml/trigger", headers={"Authorization": "Bearer secret-token"})
            assert resp.status_code == 200

    def test_trigger_response_has_status_and_steps(self, client):
        """Trigger response includes status and steps array."""
        with patch("app_ml.ML_TRIGGER_TOKEN", None), \
             patch("app_ml._execute_pipeline", return_value={
                 "status": "ok", "duration_seconds": 1.5,
                 "steps": [{"name": "fetch", "status": "ok", "duration_ms": 100}]}):
            data = client.post("/ml/trigger").json()
            assert "status" in data
            assert "steps" in data
            assert isinstance(data["steps"], list)


# --- Step 4: Error resilience ---

class TestErrorResilience:
    def test_service_survives_pipeline_failure(self, client):
        """After a failed pipeline run, the service should still respond."""
        with patch("app_ml.ML_TRIGGER_TOKEN", None), \
             patch("app_ml._execute_pipeline", side_effect=RuntimeError("boom")):
            client.app.state  # ensure app is alive
            try:
                client.post("/ml/trigger")
            except Exception:
                pass  # 500 is expected — we're testing the service stays up

        # Health should still work after
        resp = client.get("/ml/health")
        assert resp.status_code == 200

    def test_step_level_errors_reported(self, client):
        """Pipeline steps that fail should report error details, not crash."""
        step_results = {
            "status": "partial",
            "duration_seconds": 2.0,
            "steps": [
                {"name": "fetch_weather", "status": "ok", "duration_ms": 100},
                {"name": "build_dataset", "status": "ok", "duration_ms": 200},
                {"name": "train_model", "status": "error", "duration_ms": 50, "error": "No data"},
            ]
        }
        with patch("app_ml.ML_TRIGGER_TOKEN", None), \
             patch("app_ml._execute_pipeline", return_value=step_results):
            data = client.post("/ml/trigger").json()
            assert data["status"] == "partial"
            failed = [s for s in data["steps"] if s["status"] == "error"]
            assert len(failed) == 1
            assert "error" in failed[0]

    def test_health_after_failed_pipeline(self, client):
        """Health endpoint works after a pipeline that returned errors."""
        import app_ml
        app_ml._last_run = {
            "timestamp": "2026-03-09T00:00:00+00:00",
            "status": "error",
            "duration_seconds": 1.0,
            "steps": [],
        }
        resp = client.get("/ml/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["last_run"] is not None


# --- Step 5: Status endpoint ---

class TestStatus:
    def test_status_returns_200(self, client):
        resp = client.get("/ml/status")
        assert resp.status_code == 200

    def test_status_has_last_run_field(self, client):
        data = client.get("/ml/status").json()
        assert "last_run" in data

    def test_status_has_models_field(self, client):
        with patch("app_ml._read_model_meta", return_value={}):
            data = client.get("/ml/status").json()
            assert "models" in data

    def test_status_last_run_null_initially(self, client):
        data = client.get("/ml/status").json()
        assert data["last_run"] is None

    def test_status_reflects_last_run_after_trigger(self, client):
        """After a trigger, status should show the last run info."""
        import app_ml
        app_ml._last_run = {
            "timestamp": "2026-03-09T12:00:00+00:00",
            "status": "ok",
            "duration_seconds": 5.0,
            "steps": [{"name": "fetch_weather", "status": "ok", "duration_ms": 100}],
        }
        with patch("app_ml._read_model_meta", return_value={}), \
             patch("app_ml._get_last_prediction", return_value=None):
            data = client.get("/ml/status").json()
            assert data["last_run"] is not None
            assert data["last_run"]["status"] == "ok"


# --- Step 6: Structured JSON logging ---

class TestJSONLogging:
    def test_json_formatter_produces_valid_json(self):
        from app_ml import JSONFormatter
        formatter = JSONFormatter()
        record = logging.LogRecord(
            name="test", level=logging.INFO, pathname="", lineno=0,
            msg="test message", args=(), exc_info=None,
        )
        output = formatter.format(record)
        parsed = json.loads(output)
        assert parsed["level"] == "INFO"
        assert parsed["message"] == "test message"
        assert "timestamp" in parsed

    def test_json_formatter_includes_extra_fields(self):
        from app_ml import JSONFormatter
        formatter = JSONFormatter()
        record = logging.LogRecord(
            name="test", level=logging.INFO, pathname="", lineno=0,
            msg="step done", args=(), exc_info=None,
        )
        record.event = "step_complete"
        record.step = "fetch_weather"
        record.status = "ok"
        record.duration_ms = 150
        output = formatter.format(record)
        parsed = json.loads(output)
        assert parsed["event"] == "step_complete"
        assert parsed["step"] == "fetch_weather"
        assert parsed["duration_ms"] == 150

    def test_logger_uses_json_formatter(self):
        from app_ml import logger
        assert len(logger.handlers) > 0
        handler = logger.handlers[0]
        from app_ml import JSONFormatter
        assert isinstance(handler.formatter, JSONFormatter)


# --- Step 7: CORS headers ---

class TestCORS:
    def test_cors_preflight_returns_headers(self, client):
        resp = client.options(
            "/ml/trigger",
            headers={
                "Origin": "https://the-fish-tank.com",
                "Access-Control-Request-Method": "POST",
            },
        )
        assert resp.status_code == 200
        assert "access-control-allow-origin" in resp.headers

    def test_cors_allows_configured_origin(self, client):
        resp = client.options(
            "/ml/trigger",
            headers={
                "Origin": "https://the-fish-tank.com",
                "Access-Control-Request-Method": "POST",
            },
        )
        assert resp.headers.get("access-control-allow-origin") == "https://the-fish-tank.com"

    def test_cors_rejects_unknown_origin(self, client):
        resp = client.options(
            "/ml/trigger",
            headers={
                "Origin": "https://evil-site.com",
                "Access-Control-Request-Method": "POST",
            },
        )
        allow_origin = resp.headers.get("access-control-allow-origin")
        assert allow_origin != "https://evil-site.com"
