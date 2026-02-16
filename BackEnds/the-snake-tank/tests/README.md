# BackEnds Test Suite

This directory contains automated tests for FishTank backend components.

## Overview

The test suite verifies data pipeline functionality, model predictions, database operations, and data integrity across the backend codebase.

## Running Tests

### Run all tests with pytest

```bash
cd /Users/guppy/FishTank/BackEnds/the-snake-tank
pytest tests/
```

### Run individual test files

```bash
# SQLite prediction storage tests
python3 tests/test_sqlite_predict.py

# Or with pytest
pytest tests/test_sqlite_predict.py -v
```

## Test Coverage

### test_sqlite_predict.py

**Plan:** `qa-sqlite-predict`
**Feature:** SQLite dual-write for predictions (JSON + database storage)

This test file verifies that the `predict.py` script correctly implements dual-write functionality:
- Predictions are written to both JSON files and SQLite database
- Database schema matches expected structure
- Database failures don't crash the prediction pipeline
- JSON output remains unchanged (backwards compatibility)

**Tests:**
1. `test_predictions_table_sql_constant_exists()` — Verifies the `PREDICTIONS_TABLE_SQL` constant exists with correct schema
2. `test_predictions_table_exists()` — Checks the predictions table can be queried in weather.db
3. `test_dual_write_functionality()` — Tests that both JSON and DB writes occur correctly with matching data
4. `test_db_write_failure_doesnt_crash()` — Verifies graceful error handling when DB write fails

**Database Schema:**
```sql
CREATE TABLE IF NOT EXISTS predictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    generated_at TEXT NOT NULL,
    model_type TEXT NOT NULL,
    model_version INTEGER,
    for_hour TEXT NOT NULL,
    temp_indoor_predicted REAL,
    temp_outdoor_predicted REAL,
    last_reading_ts INTEGER,
    last_reading_temp_indoor REAL,
    last_reading_temp_outdoor REAL
)
```

## Test Data

Tests use mock prediction data to avoid dependencies on:
- Trained model binaries (.joblib files)
- Sufficient historical readings data
- External API availability

Mock data follows the same schema as real predictions but uses hardcoded values for reproducibility.

## Expected Behavior

### Dual-Write Flow
1. Prediction is generated (or mocked for tests)
2. JSON file written to `data/predictions/YYYY-MM-DD/HHMMSS_modeltype.json`
3. Database write attempted to `predictions` table in `data/weather.db`
4. If DB write fails, warning printed but process continues
5. For `3hrRaw` model: backwards-compatible `HHMMSS.json` also written

### Error Handling
- Database write failures are caught and logged
- Pipeline continues even if DB is unavailable
- JSON files are always written (primary source of truth)

## Adding New Tests

When adding tests:
1. Use descriptive test function names: `test_<what_is_being_tested>()`
2. Include docstrings explaining what the test verifies
3. Use mock data when testing data pipeline functions
4. Clean up temporary files/tables after tests complete
5. Update this README with test descriptions and coverage info

## Dependencies

Tests use Python standard library only:
- `sqlite3` — Database operations
- `json` — JSON file validation
- `tempfile` — Temporary test directories
- `datetime` — Timestamp handling
- `os`, `sys` — File system operations

No external test frameworks are required, though tests are compatible with `pytest`.
