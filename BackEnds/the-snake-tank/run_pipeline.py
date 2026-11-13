#!/usr/bin/env python3
"""Run the weather pipeline once and exit.

The one-shot entry point for a timer: the same steps as POST /ml/trigger,
from the same function, with a status code the caller can act on.

Usage:
    python run_pipeline.py [--skip-fetch]

Exit codes:
    0  ok
    1  error (a fatal step failed, or the run raised)
    2  partial (an optional step failed)
    3  another run holds the lock
"""

import argparse
import fcntl
import json
import os
import sys
import tempfile
import time
from datetime import datetime, timezone

LOCK_NAME = ".pipeline.lock"
SUMMARY_NAME = "last_run.json"

EXIT_CODES = {"ok": 0, "partial": 2}


def _utc_now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _write_summary(data_dir, summary):
    fd, tmp_path = tempfile.mkstemp(dir=data_dir, prefix=".last_run-", suffix=".json")
    try:
        with os.fdopen(fd, "w") as f:
            json.dump(summary, f, indent=2)
            f.write("\n")
        os.replace(tmp_path, os.path.join(data_dir, SUMMARY_NAME))
    except BaseException:
        os.unlink(tmp_path)
        raise


def _run(args, execute, data_dir):
    started_at = _utc_now()
    start = time.time()
    status = "error"
    duration = None
    steps = []
    uploads = []

    try:
        import export_weather

        if args.skip_fetch:
            # A rehearsal must never overwrite the published objects. The
            # module flag is the guarantee; the variable alone could be undone.
            export_weather.UPLOADS_DISABLED = True
            os.environ["WEATHER_DISABLE_UPLOADS"] = "1"

        if execute is None:
            import app_ml
            execute = app_ml._execute_pipeline

        result = execute(skip_fetch=args.skip_fetch)
        status = result["status"]
        duration = result["duration_seconds"]
        steps = result["steps"]
        if any(s["name"] == "export_weather" for s in steps):
            uploads = list(export_weather.UPLOAD_RESULTS)
    except Exception as exc:
        # Class name only: a driver's message can carry the connection
        # string or a token, so no str(exc), repr(exc) or traceback.
        print(type(exc).__name__, file=sys.stderr)
        status = "error"
        steps = []
        uploads = []
        duration = None

    if duration is None:
        duration = round(time.time() - start, 2)

    _write_summary(data_dir, {
        "started_at": started_at,
        "finished_at": _utc_now(),
        "status": status,
        "duration_seconds": duration,
        "trained": any(
            s["name"] == "train_model" and s["status"] == "ok" for s in steps),
        "steps": steps,
        "uploads": uploads,
    })

    return EXIT_CODES.get(status, 1)


def main(argv=None, execute=None):
    parser = argparse.ArgumentParser(description="Run the weather pipeline once and exit")
    parser.add_argument("--skip-fetch", action="store_true",
                        help="Skip fetch_weather (no Netatmo call) and disable R2 uploads; for rehearsals")
    args = parser.parse_args(argv)

    import config
    os.makedirs(config.DATA_DIR, exist_ok=True)

    # Nothing that contacts Netatmo, the database or R2 runs before this lock
    # is held. It is released when the file is closed on the way out.
    lock_file = open(os.path.join(config.DATA_DIR, LOCK_NAME), "a")
    try:
        try:
            fcntl.flock(lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print("Pipeline already running (lock held); not starting a second run",
                  file=sys.stderr)
            return 3
        return _run(args, execute, config.DATA_DIR)
    finally:
        lock_file.close()


if __name__ == "__main__":
    sys.exit(main())
