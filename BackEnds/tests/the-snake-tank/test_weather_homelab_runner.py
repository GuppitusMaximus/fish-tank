"""QA for impl-weather-homelab-runner (plan qa-weather-homelab-runner).

Covers the one-shot runner (run_pipeline.py), the upload kill-switch and
result reporting (export_weather.upload_to_r2), the Netatmo token file
(fetch_weather.main) and the weather-only schema switch (migrate.py).

Nothing here touches a network, a database, R2 or a real .env file. Cases the
host cannot execute skip with a reason that starts "NEEDS DEV-VM RUN:" and
quotes the error measured on this host.

The schema cases use a recording fake connection. They show which statements
the code selects and in what order; they do not show that the SQL runs.
"""

import contextlib
import fcntl
import importlib
import json
import os
import re
import stat
import sys
import tempfile
import types

import pytest

# Add the-snake-tank to path the way test_ml_service.py does
SNAKE_TANK_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "the-snake-tank"))
sys.path.insert(0, SNAKE_TANK_DIR)


# --- What this host can do, measured, not presumed ---

def _import_error(name):
    try:
        importlib.import_module(name)
    except ImportError as exc:
        return f"{type(exc).__name__}: {exc}"
    return None


def _flock_error():
    with tempfile.NamedTemporaryFile() as f:
        try:
            fcntl.flock(f.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            return f"{type(exc).__name__}: {exc}"
    return None


FLOCK_ERROR = _flock_error()
needs_flock = pytest.mark.skipif(
    FLOCK_ERROR is not None,
    reason=f"NEEDS DEV-VM RUN: flock denied by AppArmor ({FLOCK_ERROR})")


def _need(name):
    error = _import_error(name)
    if error:
        pytest.skip(f"NEEDS DEV-VM RUN: {name} absent ({error})")


# --- Stand-ins, only for modules whose real import fails ---

def _psycopg2_stand_in():
    def connect(*args, **kwargs):
        raise AssertionError("a test reached psycopg2.connect")

    mod = types.ModuleType("psycopg2")
    extras = types.ModuleType("psycopg2.extras")
    extras.RealDictCursor = type("RealDictCursor", (), {})
    mod.connect = connect
    mod.extras = extras
    return {"psycopg2": mod, "psycopg2.extras": extras}


def _dotenv_stand_in():
    mod = types.ModuleType("dotenv")
    mod.load_dotenv = lambda *args, **kwargs: False
    return {"dotenv": mod}


STAND_INS = {"psycopg2": _psycopg2_stand_in, "dotenv": _dotenv_stand_in}
DOTENV_IS_REAL = _import_error("dotenv") is None


@pytest.fixture(autouse=True)
def _stand_ins():
    before = set(sys.modules)
    installed = []
    for name, factory in STAND_INS.items():
        if _import_error(name) is not None:
            for key, mod in factory().items():
                sys.modules[key] = mod
                installed.append(key)
    yield
    if installed:
        for key in installed:
            sys.modules.pop(key, None)
        # A the-snake-tank module imported under a stand-in keeps a reference
        # to it; drop those so no later test file inherits one.
        for key in set(sys.modules) - before:
            path = getattr(sys.modules[key], "__file__", None) or ""
            if os.path.abspath(path).startswith(SNAKE_TANK_DIR + os.sep):
                del sys.modules[key]


def _load(name):
    """Import a the-snake-tank module; config's import never reads a real .env."""
    if "config" not in sys.modules:
        import dotenv
        real = dotenv.load_dotenv
        dotenv.load_dotenv = lambda *args, **kwargs: False
        try:
            importlib.import_module("config")
        finally:
            dotenv.load_dotenv = real
    return importlib.import_module(name)


def _unset_env(monkeypatch, name):
    """Remove a variable so that the test's later writes to it are undone too."""
    monkeypatch.setenv(name, "placeholder")
    monkeypatch.delenv(name)


# --- Fakes shared by the runner and upload cases ---

R2_ENV = {
    "R2_ENDPOINT_URL": "https://r2.invalid",
    "R2_ACCESS_KEY_ID": "fake-access-key",
    "R2_SECRET_ACCESS_KEY": "fake-secret-key",
    "R2_BUCKET_NAME": "fake-bucket",
}


class FakeBoto3(types.ModuleType):
    """Stands in for boto3 in sys.modules and records every client() call."""

    def __init__(self, upload_error=None):
        super().__init__("boto3")
        self.client_calls = []
        self.uploads = []
        self.upload_error = upload_error

    def client(self, *args, **kwargs):
        self.client_calls.append((args, kwargs))
        outer = self

        class _S3:
            def upload_file(self, path, bucket, key, ExtraArgs=None):
                if outer.upload_error is not None:
                    raise outer.upload_error
                outer.uploads.append((path, bucket, key))

        return _S3()


def _result(status="ok", train="ok", steps=None):
    """The shape app_ml._execute_pipeline returns."""
    if steps is None:
        steps = [
            {"name": "fetch_weather", "status": "ok", "duration_ms": 3},
            {"name": "build_dataset", "status": "ok", "duration_ms": 4},
            {"name": "validate_prediction", "status": "ok", "duration_ms": 5},
            {"name": "train_model", "status": train, "duration_ms": 0},
            {"name": "predict", "status": "ok", "duration_ms": 6},
            {"name": "export_weather", "status": "ok", "duration_ms": 7},
        ]
    return {"status": status, "duration_seconds": 1.25, "steps": steps}


class FakeExecute:
    def __init__(self, result=None, raises=None, hook=None):
        self.result = _result() if result is None else result
        self.raises = raises
        self.hook = hook
        self.calls = []

    def __call__(self, *args, **kwargs):
        self.calls.append((args, kwargs))
        if self.hook is not None:
            self.hook()
        if self.raises is not None:
            raise self.raises
        return self.result


@pytest.fixture
def runner(tmp_path, monkeypatch):
    config = _load("config")
    export_weather = _load("export_weather")
    run_pipeline = _load("run_pipeline")

    data_dir = tmp_path / "data"
    monkeypatch.setattr(config, "DATA_DIR", str(data_dir))
    # --skip-fetch sets both of these for the life of the process; registering
    # them here is what stops a rehearsal case leaking into the next test.
    monkeypatch.setattr(export_weather, "UPLOADS_DISABLED", False)
    monkeypatch.setattr(export_weather, "UPLOAD_RESULTS", [])
    _unset_env(monkeypatch, "WEATHER_DISABLE_UPLOADS")

    if FLOCK_ERROR is not None:
        # flock(2) is refused on this host, so main() could not get past the
        # lock at all. Only then, give the runner a lock that always succeeds
        # so the cases that are not about the lock still execute. The cases
        # about the real lock are marked needs_flock and skip here.
        monkeypatch.setattr(run_pipeline, "fcntl", types.SimpleNamespace(
            flock=lambda *args: None,
            LOCK_EX=fcntl.LOCK_EX, LOCK_NB=fcntl.LOCK_NB))

    def summary():
        return json.loads((data_dir / "last_run.json").read_text())

    return types.SimpleNamespace(
        main=run_pipeline.main, module=run_pipeline, export_weather=export_weather,
        data_dir=data_dir, summary=summary)


# --- Runner: cases 1 to 9 ---

class TestRunnerExitAndSummary:

    @pytest.mark.parametrize("status, code", [("ok", 0), ("partial", 2), ("error", 1)])
    def test_exit_code_follows_status(self, runner, status, code):
        """Case 1."""
        assert runner.main([], execute=FakeExecute(_result(status=status))) == code
        assert runner.summary()["status"] == status

    def test_raising_run_exits_1_with_summary_and_leaks_nothing(self, runner, capsys):
        """Case 2: a driver's message can carry the connection string."""
        marker = "MARKERq7Zx41"

        class FakeOperationalError(Exception):
            pass

        execute = FakeExecute(raises=FakeOperationalError(
            f"could not connect to postgresql://u:{marker}@h/db"))

        assert runner.main([], execute=execute) == 1

        raw = (runner.data_dir / "last_run.json").read_text()
        assert json.loads(raw)["status"] == "error"
        captured = capsys.readouterr()
        assert "FakeOperationalError" in captured.err
        for text in (captured.out, captured.err, raw):
            assert marker not in text
            assert "postgresql://" not in text

    @pytest.mark.parametrize("raises", [None, RuntimeError("boom")])
    def test_summary_keys_and_no_temporary_file(self, runner, raises):
        """Case 3: the summary is the contract the host's metrics read."""
        runner.main([], execute=FakeExecute(raises=raises))

        assert set(runner.summary()) == {
            "started_at", "finished_at", "status", "duration_seconds",
            "trained", "steps", "uploads"}
        leftovers = set(os.listdir(runner.data_dir)) - {"last_run.json", ".pipeline.lock"}
        assert leftovers == set()

    def test_summary_carries_the_run_result(self, runner):
        result = _result(status="partial")
        runner.main([], execute=FakeExecute(result))

        summary = runner.summary()
        assert summary["steps"] == result["steps"]
        assert summary["duration_seconds"] == result["duration_seconds"]

    @pytest.mark.parametrize("train, trained", [
        ("ok", True), ("skipped", False), ("error", False)])
    def test_trained_only_when_train_step_ok(self, runner, train, trained):
        """Case 4."""
        runner.main([], execute=FakeExecute(_result(train=train)))
        assert runner.summary()["trained"] is trained

    def test_trained_false_when_run_stopped_before_training(self, runner):
        steps = [{"name": "fetch_weather", "status": "error", "duration_ms": 1}]
        runner.main([], execute=FakeExecute(_result(status="error", steps=steps)))
        assert runner.summary()["trained"] is False

    def test_uploads_mirror_upload_results(self, runner):
        """Case 5."""
        results = [
            {"key": "weather-public.json", "ok": True},
            {"key": "weather.json", "ok": False},
            {"key": "frontend.db.gz", "ok": None},
        ]

        def export_ran():
            runner.export_weather.UPLOAD_RESULTS[:] = results

        runner.main([], execute=FakeExecute(hook=export_ran))
        assert runner.summary()["uploads"] == results


def _check_held_lock_refuses_run(runner):
    """Case 6 body, shared with its control (case 9)."""
    runner.data_dir.mkdir(parents=True, exist_ok=True)
    execute = FakeExecute()
    with open(runner.data_dir / ".pipeline.lock", "a") as holder:
        fcntl.flock(holder, fcntl.LOCK_EX | fcntl.LOCK_NB)
        code = runner.main([], execute=execute)
    assert code == 3
    assert execute.calls == []


class TestRunnerLock:

    @needs_flock
    def test_held_lock_exits_3_without_running(self, runner):
        """Case 6: a second run must not reach Netatmo, the database or R2."""
        _check_held_lock_refuses_run(runner)

    @needs_flock
    def test_lock_is_released_when_the_run_ends(self, runner):
        assert runner.main([], execute=FakeExecute()) == 0
        assert runner.main([], execute=FakeExecute()) == 0

    @needs_flock
    def test_control_no_lock_acquisition_reddens_case_6(self, runner, monkeypatch):
        """Case 9. Defect spliced: the flock call does nothing. Reddens case 6."""
        monkeypatch.setattr(runner.module, "fcntl", types.SimpleNamespace(
            flock=lambda *args: None,
            LOCK_EX=fcntl.LOCK_EX, LOCK_NB=fcntl.LOCK_NB))
        with pytest.raises(AssertionError):
            _check_held_lock_refuses_run(runner)

    def test_refused_lock_exits_3_without_running(self, runner, monkeypatch):
        """The runner's own half of case 6, with the kernel's answer faked.

        Runs where flock(2) is denied. It does not replace case 6: it shows
        what the runner does when the lock is refused, not that a real lock
        is refused. Control: with a flock that succeeds (the fixture's
        stand-in, or the real one) every other runner case calls execute.
        """
        def refuse(*args):
            raise BlockingIOError("lock held")

        monkeypatch.setattr(runner.module, "fcntl", types.SimpleNamespace(
            flock=refuse, LOCK_EX=fcntl.LOCK_EX, LOCK_NB=fcntl.LOCK_NB))
        execute = FakeExecute()

        assert runner.main([], execute=execute) == 3
        assert execute.calls == []


class TestRunnerSkipFetch:

    def _observing_execute(self, runner):
        seen = {}

        def observe():
            seen["flag"] = runner.export_weather.UPLOADS_DISABLED
            seen["env"] = os.environ.get("WEATHER_DISABLE_UPLOADS")

        return FakeExecute(hook=observe), seen

    def test_skip_fetch_disables_uploads_before_execute(self, runner):
        """Case 7."""
        execute, seen = self._observing_execute(runner)

        assert runner.main(["--skip-fetch"], execute=execute) == 0

        assert execute.calls == [((), {"skip_fetch": True})]
        assert seen == {"flag": True, "env": "1"}

    def test_without_flag_uploads_are_untouched(self, runner):
        """Case 7, the production half: a normal run changes neither switch."""
        execute, seen = self._observing_execute(runner)

        assert runner.main([], execute=execute) == 0

        (args, kwargs), = execute.calls
        assert not (args[0] if args else kwargs.get("skip_fetch", False))
        assert seen == {"flag": False, "env": None}

    def _run_with_credentials_everywhere(self, runner, tmp_path, monkeypatch, argv, env_extra):
        boto3 = FakeBoto3()
        monkeypatch.setitem(sys.modules, "boto3", boto3)
        for name, value in R2_ENV.items():
            monkeypatch.setenv(name, value)
        file_values = dict(R2_ENV, **env_extra)
        env_file = tmp_path / "rehearsal.env"
        env_file.write_text("".join(f"{k}={v}\n" for k, v in file_values.items()))
        payload = tmp_path / "weather.json"
        payload.write_text("{}")
        returns = []

        def reload_credentials_then_upload():
            if DOTENV_IS_REAL:
                import dotenv
                dotenv.load_dotenv(str(env_file), override=True)
            else:
                os.environ.update(file_values)
            for key in ("weather-public.json", "weather.json", "frontend.db.gz"):
                returns.append(runner.export_weather.upload_to_r2(str(payload), key))

        runner.main(argv, execute=FakeExecute(hook=reload_credentials_then_upload))
        return boto3, returns

    # The second row re-enables uploads through the variable from the .env
    # load, which is the "variable alone could be undone" path the module flag
    # exists for.
    @pytest.mark.parametrize("env_extra", [{}, {"WEATHER_DISABLE_UPLOADS": "0"}])
    def test_no_upload_under_skip_fetch_whatever_the_environment(
            self, runner, tmp_path, monkeypatch, env_extra):
        """Case 8: credentials in os.environ and re-loaded from a .env mid-run."""
        boto3, returns = self._run_with_credentials_everywhere(
            runner, tmp_path, monkeypatch, ["--skip-fetch"], env_extra)

        assert boto3.client_calls == []
        assert returns == [None, None, None]

    @pytest.mark.parametrize("env_extra", [{}, {"WEATHER_DISABLE_UPLOADS": "0"}])
    def test_control_same_run_without_skip_fetch_uploads(
            self, runner, tmp_path, monkeypatch, env_extra):
        """Case 8 control: the same fake without the flag does reach boto3,
        so the case above is not passing because the fake cannot upload."""
        boto3, returns = self._run_with_credentials_everywhere(
            runner, tmp_path, monkeypatch, [], env_extra)

        assert boto3.client_calls
        assert returns == [True, True, True]
        assert [key for _, _, key in boto3.uploads] == [
            "weather-public.json", "weather.json", "frontend.db.gz"]


# --- Pipeline sequence: cases 10 and 11 (need fastapi) ---

@pytest.fixture
def app_ml(monkeypatch):
    _need("fastapi")
    module = _load("app_ml")
    monkeypatch.setattr(module, "_last_run", module._last_run)
    return module


@pytest.fixture
def pipeline(app_ml, monkeypatch):
    """_execute_pipeline with every step replaced by a recorder."""
    modules = {}
    for name in ("fetch_weather", "build_dataset", "validate_prediction",
                 "train_model", "predict", "export_weather", "migrate"):
        try:
            modules[name] = _load(name)
        except ImportError as exc:
            pytest.skip(f"NEEDS DEV-VM RUN: {name} not importable "
                        f"({type(exc).__name__}: {exc})")

    calls = []

    def recorder(label, value=None):
        def fake(*args, **kwargs):
            calls.append(label)
            return value
        return fake

    monkeypatch.setattr(modules["fetch_weather"], "main", recorder("fetch_weather"))
    monkeypatch.setattr(modules["build_dataset"], "main", recorder("build_dataset"))
    monkeypatch.setattr(modules["validate_prediction"], "find_best_predictions",
                        recorder("find_best_predictions", []))
    monkeypatch.setattr(modules["validate_prediction"], "validate",
                        recorder("validate_prediction"))
    monkeypatch.setattr(modules["train_model"], "main", recorder("train_model"))
    monkeypatch.setattr(modules["predict"], "predict", recorder("predict"))
    monkeypatch.setattr(modules["export_weather"], "export", recorder("export_weather"))
    monkeypatch.setattr(modules["migrate"], "cleanup_old_data", recorder("cleanup_old_data"))
    monkeypatch.setattr(app_ml, "_should_train", lambda: False)
    monkeypatch.setattr(app_ml, "_file_cleanup", lambda: None)
    return types.SimpleNamespace(app_ml=app_ml, calls=calls)


def _step(result, name):
    return next(s for s in result["steps"] if s["name"] == name)


class TestPipelineSequence:

    def test_default_call_runs_fetch(self, pipeline):
        """Case 10, the VPS path: no argument still fetches."""
        result = pipeline.app_ml._execute_pipeline()

        assert "fetch_weather" in pipeline.calls
        assert _step(result, "fetch_weather")["status"] == "ok"
        assert "build_dataset" in pipeline.calls

    def test_skip_fetch_skips_only_the_fetch(self, pipeline):
        """Case 10."""
        result = pipeline.app_ml._execute_pipeline(skip_fetch=True)

        assert "fetch_weather" not in pipeline.calls
        assert _step(result, "fetch_weather")["status"] == "skipped"
        assert "build_dataset" in pipeline.calls
        assert _step(result, "build_dataset")["status"] == "ok"

    def test_trigger_does_not_skip_fetch(self, app_ml, monkeypatch):
        """Case 11: the HTTP trigger keeps running the whole pipeline."""
        _need("httpx")
        from fastapi.testclient import TestClient

        seen = []

        def fake_pipeline(*args, **kwargs):
            seen.append((args, kwargs))
            return {"status": "ok", "duration_seconds": 0.0, "steps": []}

        monkeypatch.setattr(app_ml, "ML_TRIGGER_TOKEN", "trigger-token")
        monkeypatch.setattr(app_ml, "_execute_pipeline", fake_pipeline)
        with TestClient(app_ml.app) as client:
            response = client.post(
                "/ml/trigger", headers={"Authorization": "Bearer trigger-token"})

        assert response.status_code == 200
        (args, kwargs), = seen
        assert not (args[0] if args else kwargs.get("skip_fetch", False))


# --- Token file: cases 12 to 18 ---

ENV_TOKEN = "env-refresh-TOKEN-aa11"
FILE_TOKEN = "file-refresh-TOKEN-bb22"
NEW_TOKEN = "new-refresh-TOKEN-cc33"
ACCESS_TOKEN = "access-TOKEN-dd44"
CLIENT_SECRET = "client-SECRET-ee55"
SECRETS = (ENV_TOKEN, FILE_TOKEN, NEW_TOKEN, ACCESS_TOKEN, CLIENT_SECRET)


@pytest.fixture
def netatmo(tmp_path, monkeypatch, capsys):
    fetch_weather = _load("fetch_weather")
    data_dir = tmp_path / "data"
    monkeypatch.setattr(fetch_weather, "DATA_DIR", str(data_dir))
    monkeypatch.setenv("NETATMO_CLIENT_ID", "client-id")
    monkeypatch.setenv("NETATMO_CLIENT_SECRET", CLIENT_SECRET)
    monkeypatch.setenv("NETATMO_REFRESH_TOKEN", ENV_TOKEN)
    monkeypatch.delenv("NETATMO_TOKEN_FILE", raising=False)
    for corner in ("LAT_NE", "LON_NE", "LAT_SW", "LON_SW"):
        monkeypatch.delenv(f"NETATMO_PUBLIC_{corner}", raising=False)

    log = types.SimpleNamespace(
        refresh=[], stations=[], public=[], urlopen=[], token_file_at_stations=[])

    def refresh_access_token(client_id, client_secret, refresh_token):
        log.refresh.append((client_id, client_secret, refresh_token))
        return ACCESS_TOKEN, NEW_TOKEN

    def get_stations_data(access_token):
        log.stations.append((access_token,))
        token_file = os.environ.get("NETATMO_TOKEN_FILE")
        if token_file and os.path.exists(token_file):
            with open(token_file) as f:
                log.token_file_at_stations.append(f.read())
        else:
            log.token_file_at_stations.append(None)
        return {"body": {"devices": []}}

    def get_public_data(*args):
        log.public.append(args)
        return {"body": []}

    def urlopen(*args, **kwargs):
        log.urlopen.append(args)
        raise AssertionError("a token case reached urllib.request.urlopen")

    monkeypatch.setattr(fetch_weather, "refresh_access_token", refresh_access_token)
    monkeypatch.setattr(fetch_weather, "get_stations_data", get_stations_data)
    monkeypatch.setattr(fetch_weather, "get_public_data", get_public_data)
    monkeypatch.setattr(fetch_weather.urllib.request, "urlopen", urlopen)

    def finish():
        """Close a token case: no network, no URL handed to a fake, and
        (case 17) no token or secret on stdout or stderr."""
        assert log.urlopen == []
        for call in log.refresh + log.stations + log.public:
            assert not any("http" in str(arg) for arg in call)
        captured = capsys.readouterr()
        for secret in SECRETS:
            assert secret not in captured.out
            assert secret not in captured.err

    return types.SimpleNamespace(
        main=fetch_weather.main, module=fetch_weather, log=log,
        data_dir=data_dir, tmp_path=tmp_path, finish=finish)


def _files_containing(root, text):
    found = set()
    for folder, _, names in os.walk(root):
        for name in names:
            path = os.path.join(folder, name)
            with open(path, errors="replace") as f:
                if text in f.read():
                    found.add(os.path.relpath(path, root))
    return found


def _check_file_token_is_preferred(netatmo, monkeypatch):
    """Case 14 body, shared with its control (case 18)."""
    state = netatmo.tmp_path / "state"
    state.mkdir()
    token_file = state / "netatmo-token"
    token_file.write_text(FILE_TOKEN)
    monkeypatch.setenv("NETATMO_TOKEN_FILE", str(token_file))

    netatmo.main()

    assert [call[2] for call in netatmo.log.refresh] == [FILE_TOKEN]
    assert token_file.read_text() == NEW_TOKEN


class TestTokenFile:

    def test_unset_uses_environment_and_writes_only_the_legacy_file(self, netatmo):
        """Case 12, the VPS path."""
        netatmo.main()

        assert [call[2] for call in netatmo.log.refresh] == [ENV_TOKEN]
        assert _files_containing(netatmo.tmp_path, NEW_TOKEN) == {
            os.path.join("data", "new_refresh_token.txt")}
        assert (netatmo.data_dir / "new_refresh_token.txt").read_text() == NEW_TOKEN
        netatmo.finish()

    @pytest.mark.parametrize("existing", [None, "", "\n"])
    def test_set_but_absent_or_empty_seeds_from_environment(
            self, netatmo, monkeypatch, existing):
        """Case 13: the environment value is the first-run seed."""
        state = netatmo.tmp_path / "state"
        state.mkdir()
        token_file = state / "netatmo-token"
        if existing is not None:
            token_file.write_text(existing)
        monkeypatch.setenv("NETATMO_TOKEN_FILE", str(token_file))

        netatmo.main()

        assert [call[2] for call in netatmo.log.refresh] == [ENV_TOKEN]
        assert token_file.read_text() == NEW_TOKEN
        assert stat.S_IMODE(token_file.stat().st_mode) == 0o600
        assert os.listdir(state) == ["netatmo-token"]
        netatmo.finish()

    def test_set_and_present_uses_the_file_token(self, netatmo, monkeypatch):
        """Case 14: after the first run the environment value is stale."""
        _check_file_token_is_preferred(netatmo, monkeypatch)
        assert stat.S_IMODE(
            (netatmo.tmp_path / "state" / "netatmo-token").stat().st_mode) == 0o600
        netatmo.finish()

    def test_file_is_written_before_the_first_data_call(self, netatmo, monkeypatch):
        """Case 15: Netatmo has already rotated the token by then."""
        token_file = netatmo.tmp_path / "netatmo-token"
        token_file.write_text(FILE_TOKEN)
        monkeypatch.setenv("NETATMO_TOKEN_FILE", str(token_file))

        netatmo.main()

        assert netatmo.log.token_file_at_stations == [NEW_TOKEN]
        netatmo.finish()

    def test_failed_write_fails_the_run_before_any_data_call(self, netatmo, monkeypatch):
        """Case 16: a rotated token that was not saved must not look like success."""
        monkeypatch.setenv(
            "NETATMO_TOKEN_FILE", str(netatmo.tmp_path / "no-such-dir" / "netatmo-token"))

        with pytest.raises(Exception):
            netatmo.main()

        assert len(netatmo.log.refresh) == 1
        assert netatmo.log.stations == []
        netatmo.finish()

    def test_control_without_prefer_file_branch_case_14_reddens(self, netatmo, monkeypatch):
        """Case 18. Defect spliced: the token file is never read, so the
        environment token is sent. Reddens case 14."""
        monkeypatch.setattr(netatmo.module, "read_token_file", lambda path: None)
        with pytest.raises(AssertionError):
            _check_file_token_is_preferred(netatmo, monkeypatch)
        netatmo.finish()


# --- Schema switch: cases 19 to 23 (recording fake, no database) ---

WEATHER_TABLES = {"readings", "public_stations", "predictions", "prediction_history"}
LEGACY_TABLES = {"party_snapshots", "players"}


class RecordingCursor:
    rowcount = 0

    def __init__(self, executed):
        self._executed = executed

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, sql, params=None):
        self._executed.append(sql)


class RecordingConnection:
    def __init__(self):
        self.executed = []
        self.commits = 0

    def cursor(self, *args, **kwargs):
        return RecordingCursor(self.executed)

    def commit(self):
        self.commits += 1


@pytest.fixture
def schema(monkeypatch):
    migrate = _load("migrate")
    monkeypatch.delenv("WEATHER_SCHEMA", raising=False)

    def run(func):
        conn = RecordingConnection()

        @contextlib.contextmanager
        def get_connection():
            yield conn

        monkeypatch.setattr(migrate, "get_connection", get_connection)
        func()
        assert conn.commits == 1
        return conn.executed

    return types.SimpleNamespace(module=migrate, run=run)


def _created_tables(executed):
    return set(re.findall(r"CREATE TABLE IF NOT EXISTS (\w+)", "\n".join(executed)))


def _delete_targets(executed):
    return [re.match(r"\s*DELETE FROM (\w+)", sql).group(1)
            for sql in executed if sql.lstrip().upper().startswith("DELETE")]


def _statements(executed):
    """Each executed string split on ';', with a $$ body kept in one piece."""
    out = []
    for sql in executed:
        sql = re.sub(r"--[^\n]*", "", sql)
        bodies = []

        def stash(match):
            bodies.append(match.group(0))
            return f"\x00{len(bodies) - 1}\x00"

        sql = re.sub(r"\$\$.*?\$\$", stash, sql, flags=re.S)
        for part in sql.split(";"):
            part = re.sub(r"\x00(\d+)\x00", lambda m: bodies[int(m.group(1))], part)
            part = " ".join(part.split())
            if part:
                out.append(part)
    return out


def _order_problems(executed):
    problems = []
    created = set()
    for stmt in _statements(executed):
        if not re.search(r"\bIF (NOT )?EXISTS\b", stmt):
            problems.append(f"not idempotent: {stmt[:70]}")
        table = re.match(r"CREATE TABLE IF NOT EXISTS (\w+)", stmt)
        if table:
            created.add(table.group(1))
            continue
        used = (re.findall(r"CREATE (?:UNIQUE )?INDEX [^;]*? ON (\w+)", stmt)
                + re.findall(r"ALTER TABLE (?:IF EXISTS )?(\w+)", stmt))
        for name in used:
            if name not in created:
                problems.append(f"{name} used before its CREATE TABLE: {stmt[:70]}")
    return problems


def _check_weather_only_selection(schema, monkeypatch):
    """Case 20 body, shared with its control (case 23)."""
    monkeypatch.setenv("WEATHER_SCHEMA", "weather-only")

    migrated = schema.run(schema.module.migrate)
    sql = "\n".join(migrated)
    assert WEATHER_TABLES <= _created_tables(migrated)
    assert "party_snapshots" not in sql
    assert "players" not in sql

    targets = _delete_targets(schema.run(schema.module.cleanup_old_data))
    assert len(targets) == 4
    assert "party_snapshots" not in targets
    assert set(targets) == WEATHER_TABLES


class TestSchemaSwitch:

    def test_default_selects_all_six_tables_and_five_deletes(self, schema):
        """Case 19, the VPS path."""
        assert WEATHER_TABLES | LEGACY_TABLES <= _created_tables(
            schema.run(schema.module.migrate))

        targets = _delete_targets(schema.run(schema.module.cleanup_old_data))
        assert len(targets) == 5
        assert "party_snapshots" in targets
        assert WEATHER_TABLES <= set(targets)

    def test_weather_only_selects_the_four_weather_tables(self, schema, monkeypatch):
        """Case 20."""
        _check_weather_only_selection(schema, monkeypatch)

    def test_other_values_of_the_variable_keep_the_default(self, schema, monkeypatch):
        monkeypatch.setenv("WEATHER_SCHEMA", "")
        assert LEGACY_TABLES <= _created_tables(schema.run(schema.module.migrate))

    def test_schema_sql_still_names_every_table(self, schema):
        """Case 21: SCHEMA_SQL is imported by other code and tests."""
        migrate = schema.module
        named = _created_tables([migrate.SCHEMA_SQL])
        assert WEATHER_TABLES | LEGACY_TABLES <= named
        assert _created_tables(
            [migrate.WEATHER_SCHEMA_SQL, migrate.LEGACY_PVP_SCHEMA_SQL]) <= named

    def test_default_statement_order_is_safe(self, schema):
        """Case 22: statements moved across the weather/legacy boundary."""
        executed = schema.run(schema.module.migrate)
        statements = _statements(executed)
        assert any(s.startswith("ALTER TABLE") for s in statements)
        assert any(re.match(r"CREATE (UNIQUE )?INDEX", s) for s in statements)
        assert _order_problems(executed) == []

    def test_weather_only_statement_order_is_safe(self, schema, monkeypatch):
        monkeypatch.setenv("WEATHER_SCHEMA", "weather-only")
        assert _order_problems(schema.run(schema.module.migrate)) == []

    def test_control_index_before_its_table_reddens_case_22(self, schema, monkeypatch):
        """Defect spliced: the weather statements run in reverse, so every
        index precedes its table. Reddens case 22."""
        migrate = schema.module
        reversed_sql = ";\n".join(reversed(_statements([migrate.WEATHER_SCHEMA_SQL]))) + ";"
        monkeypatch.setattr(migrate, "WEATHER_SCHEMA_SQL", reversed_sql)
        problems = _order_problems(schema.run(migrate.migrate))
        assert any("before its CREATE TABLE" in p for p in problems)

    def test_control_non_idempotent_statement_reddens_case_22(self, schema, monkeypatch):
        """Defect spliced: one index loses IF NOT EXISTS. Reddens case 22."""
        migrate = schema.module
        spliced = migrate.WEATHER_SCHEMA_SQL.replace(
            "CREATE INDEX IF NOT EXISTS", "CREATE INDEX", 1)
        assert spliced != migrate.WEATHER_SCHEMA_SQL
        monkeypatch.setattr(migrate, "WEATHER_SCHEMA_SQL", spliced)
        problems = _order_problems(schema.run(migrate.migrate))
        assert any("not idempotent" in p for p in problems)

    def test_control_weather_only_always_false_reddens_case_20(self, schema, monkeypatch):
        """Case 23. Defect spliced: weather_only() ignores the variable.
        Reddens case 20."""
        monkeypatch.setattr(schema.module, "weather_only", lambda: False)
        with pytest.raises(AssertionError):
            _check_weather_only_selection(schema, monkeypatch)


# --- Uploads: case 24 ---

@pytest.fixture
def uploads(tmp_path, monkeypatch):
    export_weather = _load("export_weather")
    monkeypatch.setattr(export_weather, "UPLOADS_DISABLED", False)
    _unset_env(monkeypatch, "WEATHER_DISABLE_UPLOADS")
    for name, value in R2_ENV.items():
        monkeypatch.setenv(name, value)
    payload = tmp_path / "weather.json"
    payload.write_text("{}")

    def install(boto3):
        monkeypatch.setitem(sys.modules, "boto3", boto3)
        return boto3

    return types.SimpleNamespace(
        module=export_weather, payload=str(payload), install=install)


class TestUploadResult:

    @pytest.mark.parametrize("missing", sorted(R2_ENV))
    def test_missing_credential_returns_none_without_a_client(
            self, uploads, monkeypatch, missing):
        """Case 24: the VPS behaviour when R2 is not configured."""
        boto3 = uploads.install(FakeBoto3())
        monkeypatch.delenv(missing)

        assert uploads.module.upload_to_r2(uploads.payload, "weather.json") is None
        assert boto3.client_calls == []

    def test_successful_upload_returns_true(self, uploads):
        boto3 = uploads.install(FakeBoto3())

        assert uploads.module.upload_to_r2(uploads.payload, "weather.json") is True
        assert boto3.uploads == [
            (uploads.payload, R2_ENV["R2_BUCKET_NAME"], "weather.json")]

    def test_failed_upload_returns_false_and_does_not_raise(self, uploads):
        boto3 = uploads.install(FakeBoto3(upload_error=RuntimeError("upload refused")))

        assert uploads.module.upload_to_r2(uploads.payload, "weather.json") is False
        assert boto3.client_calls

    @pytest.mark.parametrize("switch", ["module flag", "variable"])
    def test_kill_switch_is_checked_before_boto3_is_imported(
            self, uploads, monkeypatch, switch):
        """With either switch on, upload_to_r2 returns None although importing
        boto3 would fail. Control: test_kill_switch_control_... below."""
        monkeypatch.setitem(sys.modules, "boto3", None)
        if switch == "module flag":
            monkeypatch.setattr(uploads.module, "UPLOADS_DISABLED", True)
        else:
            monkeypatch.setenv("WEATHER_DISABLE_UPLOADS", "1")

        assert uploads.module.upload_to_r2(uploads.payload, "weather.json") is None

    def test_kill_switch_control_import_is_attempted_when_enabled(self, uploads, monkeypatch):
        """Control for the case above: with both switches off the same call
        does try to import boto3, so the None above comes from the switch."""
        monkeypatch.setitem(sys.modules, "boto3", None)
        with pytest.raises(ImportError):
            uploads.module.upload_to_r2(uploads.payload, "weather.json")
