# Backend Tests

Automated QA tests for the FishTank backend data pipeline. All executable tests use **pytest**.

## Running Tests

```bash
# Run all tests
python3 -m pytest tests/

# Run a specific test file
python3 -m pytest tests/test_model_versioning.py

# Run with verbose output
python3 -m pytest tests/ -v
```

Note: Some tests train ML models in isolated tmp directories and take a few seconds each.

## Test Files

### `test_code_quality.py`

**Plan:** `qa-model-versioning-backend`

Static checks on `the-snake-tank/` Python files (train_model.py, predict.py, export_weather.py):

- Syntax validity (compiles without errors)
- No hardcoded absolute paths
- All imports are stdlib or approved third-party (joblib, numpy, pandas, sklearn)

### `test_model_versioning.py`

**Plan:** `qa-model-versioning-backend`

End-to-end tests for ML model versioning, backup, and `model_version` propagation (7 test classes, 10 tests):

- Model metadata (`model_meta.json`) written with correct keys and types after training
- Version increments on retrain
- Previous model backup created on second training run and is loadable
- Prediction output includes `model_version` matching metadata
- Prediction fallback to simple model when full model is corrupted
- Export propagates `model_version` to `next_prediction`
- Backwards compatibility — export handles old prediction files lacking `model_version`
- `.gitignore` no longer excludes `*.joblib`
- Export runs against real production data without crashing

### `test_prediction_fallback.py`

**Plan:** `qa-prediction-fallback-simple-model`

Tests for the simple 3-hour fallback model (8 test classes, 11 tests):

- Simple model trains when full model can't (< 25 consecutive readings)
- Simple model version increments on retrain
- Prediction uses simple model when no full model exists
- Full model takes priority when both models are available
- Graceful exit (code 1) when no models exist at all
- Export passes `model_type` through to output JSON
- Export omits `model_type` when prediction file lacks it (no nulls)
- `train()` uses `return` instead of `sys.exit(0)`, allowing `train_simple()` to run
- Syntax check on all modified files

### `test_readme_accuracy.py`

**Plan:** `qa-readme-update-backend`

Verifies `the-snake-tank/README.md` is accurate against source code (18 tests):

- README exists with valid markdown (no unclosed code blocks)
- Two-tier model documented (22-feature full model, 9-feature simple model)
- Model versioning documented (`model_meta.json`, `simple_meta.json`, MAE metrics)
- Prediction cascade documented (full → simple → error)
- `model_type` field mentioned with "24hrRaw" and "3hrRaw" values
- Project structure includes simple model files, predictions dir, tests dir
- Cross-references with source code: feature counts, lookback values, feature names, model_type values

### `test_wire_prediction_validation.py`

**Plan:** `qa-wire-prediction-validation`

Tests for prediction validation wiring into the hourly pipeline (11 tests):

- `validate_prediction.py` accepts `--predictions-dir` and finds latest prediction
- `MAX_HISTORY` constant is 168 and history is trimmed
- Model metadata (`model_version`, `model_type`) passed through in comparison records
- `export_weather.py` accepts `--history` flag and produces correct output
- `export_weather.py` fallback works without `--history`
- GitHub Actions workflow has validation step in correct position (after Rebuild, before Train)
- Validation step has `|| true` for graceful failure
- `find_best_prediction` handles edge cases (nonexistent dir, empty dir, picks closest to 60 min)

### `test_multi_model_export.py`

**Plan:** `qa-multi-model-data-export`

Tests for v2 multi-model weather.json schema structure (6 test functions covering Tests 1-4):

- Schema version 2 in output
- `property_meta` structure with `temp_indoor` and `temp_outdoor` entries (label, unit, format)
- `current` object with `timestamp` (string) and `readings` (nested object with numeric temps)
- `predictions` array with `model_type`, `model_version`, `prediction_for`, and nested `values` object
- No duplicate model types in predictions array
- `next_prediction` backwards compatibility (flat fields, no nested `values`, matches first prediction)
- History entries include `model_type` and `model_version` with flat structure (no nested objects)

### `test_multi_model_code.py`

**Plan:** `qa-multi-model-data-export`

Code-level validation for multi-model implementation details (Tests 7-12):

- `_find_predictions_for_hour()` regex matches both old (`HHMMSS.json`) and new (`HHMMSS_modeltype.json`) formats
- File discovery deduplicates by model_type and defaults old format to "simple"
- Duplicate detection in `validate_prediction.py` keys on `(model_type, for_hour)` tuple
- History trimming is per-model with `MAX_HISTORY_PER_MODEL=168` (336 total for 2 models)
- `export_weather.py` uses atomic writes (`tempfile.mkstemp` + `os.replace`)
- `PROPERTY_META` constant defined at module level with correct structure
- All modified files (`export_weather.py`, `predict.py`, `validate_prediction.py`) pass syntax check

### `test_full_model_training.py`

**Plan:** `qa-full-model-backend`

Verifies full 24h model configuration and predictions after MAX_GAP=7200 change (7 tests):

- Simple model file exists and is loadable with joblib
- Simple model metadata is valid JSON with required fields (version, trained_at, sample_count, mae_indoor, mae_outdoor)
- Simple model metadata has reasonable MAE values (< 10°C)
- Full model loadable if it exists (gracefully skips if not yet trained due to insufficient data)
- Full model metadata valid if full model exists
- `MAX_GAP = 7200` correctly set in `train_model.py`
- `predict.py --model-type all` runs without error
- Simple prediction files (`*_simple.json`) produced with correct structure and model_type field

### `test_model_rename_and_6hr_rc.py`

**Plan:** `qa-rename-and-6hr-rc-backend`

Verifies model type rename (simple→3hrRaw, full→24hrRaw) and 6hrRC residual correction model (12 tests):

- Old model type strings ("simple", "full") removed from predict.py model dispatch (except transition code)
- Argparse `--model-type` choices include `3hrRaw`, `24hrRaw`, `6hrRC`, `all`
- Model dispatch loop uses new type strings (`model_name == "3hrRaw"`, etc.)
- RC_LOOKBACK=6 constant defined in both train_model.py and predict.py
- `load_prediction_errors()` function exists and filters to `3hrRaw`/`simple` for transition
- `build_6hr_rc_windows()` function exists with correct 68-dimensional feature construction (54 base + 12 error lags + 2 averages)
- `train_6hr_rc()` function exists and is called from `__main__` after `train_simple()`
- `_run_6hr_rc_model()` function exists in predict.py with matching 68-dimensional features
- `6hrRC` appears in predict.py model dispatch
- Feature vector dimensions consistent between training and prediction (68 features)
- `read_6hr_rc_meta()` helper exists in both files
- Backwards-compat file writer checks for `"3hrRaw"` to write legacy filename format

### `test_pages_workflow.py`

**Plan:** `qa-fix-pages-auto-deploy`

Verifies GitHub Pages workflow auto-deploys after Netatmo weather updates (6 tests):

- `workflow_run` trigger exists in `.github/workflows/pages.yml`
- Trigger configured for workflow `"Fetch Netatmo Weather Data"` with type `completed` on branch `main`
- Deploy job includes success condition: only deploy if workflow_run succeeded OR if triggered by push/workflow_dispatch
- Original `push` trigger preserved with `branches: [main]` and `paths: ['FrontEnds/the-fish-tank/**']`
- Original `workflow_dispatch` trigger preserved for manual runs
- YAML syntax is valid

### `test_data_storage_quick_wins.py`

**Plan:** `qa-data-storage-quick-wins`

Verifies git repo bloat reduction improvements (6 tests):

- `.gitignore` includes `BackEnds/the-snake-tank/models/*.joblib` pattern
- No `.joblib` files are tracked by git
- Model meta JSON files (`model_meta.json`, `simple_meta.json`, `6hr_rc_meta.json`) are still tracked
- `netatmo.yml` workflow includes "Clean up old data files" step with correct retention periods (48h for predictions, 7d for raw readings)
- All cleanup `find` commands include `|| true` or `2>/dev/null` for safety
- `git add` line uses `models/*.json` pattern (excludes binaries)
- Workflow YAML is syntactically valid

### `test_sqlite_export.py`

**Plan:** `qa-sqlite-export`

Verifies DB-first reads in `export_weather.py` with file-based fallback (10 tests):

- `sqlite3` module imported and `DB_PATH` constant defined
- Table SQL constants (`PREDICTIONS_TABLE_SQL`, `PREDICTION_HISTORY_TABLE_SQL`) exist
- DB helper functions exist and are callable (`_find_predictions_for_hour_from_db`, `_load_validated_history_from_db`)
- `_find_predictions_for_hour()` calls DB helper first before scanning files
- `load_validated_history()` calls DB helper first before reading JSON
- DB helpers return None gracefully when data doesn't exist
- Export output format unchanged (schema_version 2, predictions array, history array)
- DB prediction helper returns correct dict format with `model_type`, `model_version`, `generated_at`, and nested `prediction` object
- DB history helper returns correct dict format with `delta_indoor` and `delta_outdoor` computed from raw values
- Delta calculations are correct (actual - predicted, rounded to 1 decimal)

### `test_sqlite_validate.py`

**Plan:** `qa-sqlite-validate`

Verifies SQLite integration in validate_prediction.py for DB-first reads and dual-write validation history (7 tests):

- `PREDICTION_HISTORY_TABLE_SQL` and `PREDICTIONS_TABLE_SQL` schema constants exist
- `_find_best_predictions_from_db()` function exists and queries predictions table for 30-90 minute window
- DB helper returns prediction data dicts matching JSON file format
- `find_best_predictions()` tries DB first before falling back to file scanning
- `validate()` handles both file paths (str) and prediction data dicts
- Dual-write confirmed: both JSON file and prediction_history DB table receive validation results
- `INSERT OR IGNORE` with UNIQUE(model_type, for_hour) prevents duplicate entries
- `prediction_history` table exists with correct schema (11 columns including error_indoor, error_outdoor)

### `test_sqlite_predict.py`

**Plan:** `qa-sqlite-predict`

Verifies SQLite dual-write functionality in predict.py (4 tests):

- `PREDICTIONS_TABLE_SQL` constant exists with correct schema (10 columns: id, generated_at, model_type, model_version, for_hour, temp_indoor_predicted, temp_outdoor_predicted, last_reading_ts, last_reading_temp_indoor, last_reading_temp_outdoor)
- Predictions table can be queried in weather.db
- `_write_prediction()` writes to both JSON files and SQLite database with matching data
- DB write failures are caught and logged without crashing the prediction pipeline
- JSON files are always written even when DB fails (primary source of truth)
- Backwards-compatible `HHMMSS.json` files still created for 3hrRaw model type

### `spec_bdd_workflow_test.py`

**Plan:** `qa-bdd-test-workflow`

BDD-style specs written by the `qa-bdd-backend` agent to verify existing SQLite prediction behavior (5 specs):

- Predictions table exists in `weather.db`
- Predictions table has all required columns (id, generated_at, model_type, model_version, for_hour, temp_indoor_predicted, temp_outdoor_predicted, last_reading_ts, last_reading_temp_indoor, last_reading_temp_outdoor)
- `predict.py` defines `PREDICTIONS_TABLE_SQL` constant at module level
- `_write_prediction()` includes SQLite INSERT logic
- Actual table schema matches `PREDICTIONS_TABLE_SQL` definition (verified via pragma and source inspection)

This spec file uses the `spec_` prefix naming convention to distinguish BDD tests from traditional unit tests. All specs pass against the current implementation.

## Test Reports

### `qa-remove-github-cron.md`

**Plan:** `qa-remove-github-cron`

Manual verification report (not a pytest file). Documents that:

- `netatmo.yml` only uses `workflow_dispatch` trigger (no `schedule`)
- `export_workflow.py` uses 20-minute intervals (`0,20,40 * * * *`) consistently across all output paths
- No legacy 30-minute references remain

## Coverage Summary

| Area | Covered By |
|------|-----------|
| Code quality (syntax, imports, paths) | `test_code_quality.py`, `test_multi_model_code.py` |
| Model training & metadata | `test_model_versioning.py`, `test_prediction_fallback.py`, `test_full_model_training.py` |
| Model versioning & backup | `test_model_versioning.py` |
| Prediction cascade (full → simple → error) | `test_model_versioning.py`, `test_prediction_fallback.py` |
| `model_version` propagation | `test_model_versioning.py` |
| `model_type` propagation | `test_prediction_fallback.py`, `test_multi_model_export.py` |
| Multi-model prediction support (3hrRaw, 24hrRaw, 6hrRC) | `test_multi_model_export.py`, `test_multi_model_code.py`, `test_model_rename_and_6hr_rc.py` |
| Model type rename (simple→3hrRaw, full→24hrRaw) | `test_model_rename_and_6hr_rc.py` |
| 6hrRC residual correction model | `test_model_rename_and_6hr_rc.py` |
| Prediction validation pipeline | `test_wire_prediction_validation.py`, `test_multi_model_code.py` |
| Export v2 schema (property_meta, nested readings) | `test_multi_model_export.py` |
| File discovery (old & new formats) | `test_multi_model_code.py` |
| Atomic writes | `test_multi_model_code.py` |
| Export output format & backwards compat | `test_model_versioning.py`, `test_prediction_fallback.py`, `test_wire_prediction_validation.py`, `test_multi_model_export.py` |
| README accuracy | `test_readme_accuracy.py` |
| Workflow configuration | `test_wire_prediction_validation.py`, `test_pages_workflow.py`, `test_data_storage_quick_wins.py`, `qa-remove-github-cron.md` |
| Pages auto-deploy trigger | `test_pages_workflow.py` |
| MAX_GAP setting & full model readiness | `test_full_model_training.py` |
| Data retention & git repo bloat | `test_data_storage_quick_wins.py` |
| .gitignore coverage for ML binaries | `test_data_storage_quick_wins.py` |
| DB-first reads with JSON fallback (export) | `test_sqlite_export.py` |
| DB-first reads with JSON fallback (training) | `test_sqlite_train_errors.py` |
| Dual-write predictions (JSON + SQLite) | `test_sqlite_predict.py` |
| Dual-write prediction history (JSON + SQLite) | `test_sqlite_validate.py` |
| BDD workflow verification | `spec_bdd_workflow_test.py` |

### Not Yet Covered

- `export_workflow.py` — interval logic, cron string generation, workflow status output
- `rebuild_dataset.py` — database rebuild from raw JSON files
- Database schema and data integrity
- API authentication / Netatmo token refresh
- Performance and timing (prediction latency, export duration)
