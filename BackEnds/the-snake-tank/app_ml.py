#!/usr/bin/env python3
"""FastAPI ML pipeline service wrapping the weather prediction pipeline.

Triggered by Cloudflare Cron Worker every 20 minutes via POST /ml/trigger.
Run with: uvicorn app_ml:app --host 127.0.0.1 --port 8001
"""

import json
import logging
import os
import shutil
import sys
import threading
import time
from datetime import datetime, timezone, timedelta

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from config import DATA_DIR, MODEL_DIR


# --- App ---

app = FastAPI(title="FishTank ML Pipeline", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://the-fish-tank.com", "http://localhost:5173"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


# --- Structured JSON Logging ---

class JSONFormatter(logging.Formatter):
    EXTRA_FIELDS = ("event", "step", "status", "duration_ms", "duration_seconds", "error", "source")

    def format(self, record):
        entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "message": record.getMessage(),
        }
        for key in self.EXTRA_FIELDS:
            val = getattr(record, key, None)
            if val is not None:
                entry[key] = val
        return json.dumps(entry)


logger = logging.getLogger("ml_pipeline")
logger.setLevel(logging.INFO)
_handler = logging.StreamHandler()
_handler.setFormatter(JSONFormatter())
logger.addHandler(_handler)


# --- State ---

_start_time = time.time()
_last_run = None
_pipeline_lock = threading.Lock()

ML_TRIGGER_TOKEN = os.environ.get("ML_TRIGGER_TOKEN")

PREDICTIONS_DIR = os.path.join(DATA_DIR, "predictions")
HISTORY_PATH = os.path.join(DATA_DIR, "validation", "prediction-history.json")
OUTPUT_PATH = os.path.join(DATA_DIR, "weather.json")

META_FILES = {
    "24hrRaw": os.path.join(MODEL_DIR, "model_meta.json"),
    "3hrRaw": os.path.join(MODEL_DIR, "simple_meta.json"),
    "6hrRC": os.path.join(MODEL_DIR, "6hr_rc_meta.json"),
    "24hr_pubRA_RC3_GB": os.path.join(MODEL_DIR, "gb_meta.json"),
}

TRAIN_INTERVAL_HOURS = 3


# --- Helpers ---

def _check_db():
    from db import get_connection
    try:
        with get_connection() as conn:
            conn.cursor().execute("SELECT 1")
        return "ok"
    except Exception:
        return "error"


def _run_step(step_name, func):
    start = time.time()
    try:
        func()
        duration_ms = int((time.time() - start) * 1000)
        return {"name": step_name, "status": "ok", "duration_ms": duration_ms}
    except SystemExit as e:
        duration_ms = int((time.time() - start) * 1000)
        if e.code == 0 or e.code is None:
            return {"name": step_name, "status": "ok", "duration_ms": duration_ms}
        msg = f"Process exited with code {e.code}"
        logger.error(f"Step {step_name} failed: {msg}")
        return {"name": step_name, "status": "error", "duration_ms": duration_ms, "error": msg}
    except Exception as e:
        duration_ms = int((time.time() - start) * 1000)
        logger.error(f"Step {step_name} failed: {e}")
        return {"name": step_name, "status": "error", "duration_ms": duration_ms, "error": str(e)}


def _log_step(step_name, result):
    extra = {
        "event": "step_complete",
        "step": step_name,
        "status": result["status"],
        "duration_ms": result["duration_ms"],
    }
    if "error" in result:
        extra["error"] = result["error"]
    logger.info(f"Step {step_name}: {result['status']}", extra=extra)


def _file_cleanup():
    now = datetime.now(timezone.utc)
    pred_cutoff = (now - timedelta(hours=48)).strftime("%Y-%m-%d")
    if os.path.isdir(PREDICTIONS_DIR):
        for name in os.listdir(PREDICTIONS_DIR):
            path = os.path.join(PREDICTIONS_DIR, name)
            if os.path.isdir(path) and name < pred_cutoff:
                shutil.rmtree(path)
    reading_cutoff = (now - timedelta(days=7)).strftime("%Y-%m-%d")
    for name in os.listdir(DATA_DIR):
        path = os.path.join(DATA_DIR, name)
        if (os.path.isdir(path) and len(name) == 10
                and name[4] == "-" and name[7] == "-" and name < reading_cutoff):
            shutil.rmtree(path)


def _read_model_meta():
    models = {}
    for model_type, path in META_FILES.items():
        if os.path.exists(path):
            try:
                with open(path) as f:
                    meta = json.load(f)
                models[model_type] = {
                    "version": meta.get("version"),
                    "mae_indoor": meta.get("mae_indoor"),
                    "mae_outdoor": meta.get("mae_outdoor"),
                }
            except (json.JSONDecodeError, KeyError):
                pass
    return models


def _should_train():
    import train_model

    meta_paths = list(META_FILES.values())
    for name in train_model.MULTI_HORIZONS:
        meta_paths.append(os.path.join(MODEL_DIR, f"mh_{name}_meta.json"))

    newest = None
    for path in meta_paths:
        try:
            with open(path) as f:
                meta = json.load(f)
            trained_at = datetime.strptime(
                meta["trained_at"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        except (OSError, json.JSONDecodeError, KeyError, TypeError, ValueError):
            return True
        if newest is None or trained_at > newest:
            newest = trained_at

    return datetime.now(timezone.utc) - newest > timedelta(hours=TRAIN_INTERVAL_HOURS)


def _get_last_prediction():
    from db import get_connection
    try:
        with get_connection() as conn:
            cur = conn.cursor()
            cur.execute("""
                SELECT DISTINCT ON (model_type)
                    for_hour, model_type, temp_indoor_predicted, temp_outdoor_predicted
                FROM predictions
                ORDER BY model_type, generated_at DESC
            """)
            rows = cur.fetchall()
        if not rows:
            return None
        return {
            "for_hour": rows[0][0],
            "models": {row[1]: {"indoor": row[2], "outdoor": row[3]} for row in rows},
        }
    except Exception:
        return None


def _execute_pipeline():
    global _last_run

    import fetch_weather
    import build_dataset
    import validate_prediction
    import train_model
    import predict as predict_mod
    import export_weather
    from migrate import cleanup_old_data

    pipeline_start = time.time()
    logger.info("Pipeline triggered", extra={"event": "pipeline_trigger", "source": "http"})

    steps = []
    overall = "ok"

    # Fatal steps — abort on failure
    for sname, func in [
        ("fetch_weather", fetch_weather.main),
        ("build_dataset", build_dataset.main),
    ]:
        result = _run_step(sname, func)
        steps.append(result)
        _log_step(sname, result)
        if result["status"] == "error":
            overall = "error"
            break

    if overall != "error":
        # Optional steps — log error, continue
        for sname, func in [
            ("validate_prediction", lambda: validate_prediction.validate(
                validate_prediction.find_best_predictions(PREDICTIONS_DIR), HISTORY_PATH)),
            ("train_model", train_model.main),
            ("predict", lambda: predict_mod.predict(
                predictions_dir=PREDICTIONS_DIR, model_type_filter="all")),
        ]:
            if sname == "train_model" and not _should_train():
                result = {"name": "train_model", "status": "skipped", "duration_ms": 0}
            else:
                result = _run_step(sname, func)
            steps.append(result)
            _log_step(sname, result)
            if result["status"] == "error":
                overall = "partial"

        # Export is fatal
        result = _run_step("export_weather", lambda: export_weather.export(
            OUTPUT_PATH, 24, HISTORY_PATH))
        steps.append(result)
        _log_step("export_weather", result)
        if result["status"] == "error":
            overall = "error"

    # Cleanup (non-fatal)
    try:
        _file_cleanup()
        cleanup_old_data()
    except Exception as e:
        logger.warning(f"Cleanup failed: {e}")

    duration = round(time.time() - pipeline_start, 2)

    _last_run = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "status": overall,
        "duration_seconds": duration,
        "steps": steps,
    }

    logger.info("Pipeline complete", extra={
        "event": "pipeline_complete", "status": overall, "duration_seconds": duration})

    return {"status": overall, "duration_seconds": duration, "steps": steps}


# --- Endpoints ---

@app.get("/ml/health")
def health():
    uptime = int(time.time() - _start_time)
    last_ts = _last_run["timestamp"] if _last_run else None
    next_ts = None
    if last_ts:
        next_ts = (datetime.fromisoformat(last_ts) + timedelta(minutes=20)).isoformat()
    return {
        "service": "ml",
        "version": "1.0.0",
        "uptime_seconds": uptime,
        "database": _check_db(),
        "last_run": last_ts,
        "next_run": next_ts,
    }


@app.post("/ml/trigger")
def trigger(authorization: str = Header(default=None)):
    if ML_TRIGGER_TOKEN:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or invalid authorization")
        if authorization[7:] != ML_TRIGGER_TOKEN:
            raise HTTPException(status_code=403, detail="Invalid token")

    if not _pipeline_lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="Pipeline already running")

    try:
        return _execute_pipeline()
    finally:
        _pipeline_lock.release()


@app.get("/ml/status")
def status():
    return {
        "last_run": _last_run,
        "models": _read_model_meta(),
        "last_prediction": _get_last_prediction(),
    }
