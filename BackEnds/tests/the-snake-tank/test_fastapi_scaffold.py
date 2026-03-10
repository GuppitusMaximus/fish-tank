"""QA tests for vps-fastapi-scaffold: config, db, requirements, systemd."""
import importlib
import os
import sys

import pytest

SNAKE_TANK = os.path.join(os.path.dirname(__file__), "..", "..", "the-snake-tank")
sys.path.insert(0, SNAKE_TANK)


class TestConfig:
    def test_imports_all_constants(self):
        from config import (
            DATABASE_URL, R2_BUCKET_NAME, R2_ENDPOINT_URL,
            R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
            NETATMO_CLIENT_ID, NETATMO_CLIENT_SECRET, NETATMO_REFRESH_TOKEN,
            MODEL_DIR, DATA_DIR, SCRIPT_DIR,
        )
        assert isinstance(DATABASE_URL, str)
        assert os.path.isabs(MODEL_DIR)
        assert os.path.isabs(DATA_DIR)
        assert os.path.isabs(SCRIPT_DIR)

    def test_model_dir_points_to_models(self):
        from config import MODEL_DIR
        assert MODEL_DIR.endswith("models")

    def test_data_dir_points_to_data(self):
        from config import DATA_DIR
        assert DATA_DIR.endswith("data")


class TestDb:
    def test_get_connection_is_context_manager(self):
        from db import get_connection
        import contextlib
        assert hasattr(get_connection, '__call__')
        result = get_connection()
        assert hasattr(result, '__enter__') and hasattr(result, '__exit__')

    def test_get_connection_string_returns_str(self):
        from db import get_connection_string
        result = get_connection_string()
        assert isinstance(result, str)


class TestRequirements:
    def test_requirements_file_exists(self):
        req_path = os.path.join(SNAKE_TANK, "requirements.txt")
        assert os.path.isfile(req_path)

    def test_requirements_contains_expected_packages(self):
        req_path = os.path.join(SNAKE_TANK, "requirements.txt")
        with open(req_path) as f:
            content = f.read()
        for pkg in ["fastapi", "uvicorn", "psycopg2-binary", "python-dotenv", "joblib"]:
            assert pkg in content, f"Missing package: {pkg}"

    def test_key_packages_importable(self):
        for mod in ["fastapi", "psycopg2", "dotenv", "joblib"]:
            importlib.import_module(mod)


class TestSystemd:
    @pytest.fixture
    def ml_service(self):
        path = os.path.join(SNAKE_TANK, "systemd", "fishtank-ml.service")
        with open(path) as f:
            return f.read()

    @pytest.fixture
    def pvp_service(self):
        path = os.path.join(SNAKE_TANK, "systemd", "fishtank-pvp.service")
        with open(path) as f:
            return f.read()

    def test_ml_service_exists(self):
        assert os.path.isfile(os.path.join(SNAKE_TANK, "systemd", "fishtank-ml.service"))

    def test_pvp_service_exists(self):
        assert os.path.isfile(os.path.join(SNAKE_TANK, "systemd", "fishtank-pvp.service"))

    def test_ml_port_8001(self, ml_service):
        assert "--port 8001" in ml_service

    def test_pvp_port_8002(self, pvp_service):
        assert "--port 8002" in pvp_service

    def test_ml_restart_always(self, ml_service):
        assert "Restart=always" in ml_service

    def test_pvp_restart_always(self, pvp_service):
        assert "Restart=always" in pvp_service

    def test_ml_restart_sec(self, ml_service):
        assert "RestartSec=" in ml_service

    def test_pvp_restart_sec(self, pvp_service):
        assert "RestartSec=" in pvp_service

    def test_ml_environment_file(self, ml_service):
        assert "EnvironmentFile=" in ml_service
        assert ".env" in ml_service

    def test_pvp_environment_file(self, pvp_service):
        assert "EnvironmentFile=" in pvp_service
        assert ".env" in pvp_service

    def test_ml_references_app_ml(self, ml_service):
        assert "app_ml:app" in ml_service

    def test_pvp_references_app_pvp(self, pvp_service):
        assert "app_pvp:app" in pvp_service
