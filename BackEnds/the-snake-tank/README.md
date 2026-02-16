# the-snake-tank

Weather data collection and ML temperature prediction pipeline for a Netatmo weather station. Collects readings every 20 minutes via a Cloudflare Worker that triggers a GitHub Actions workflow, stores them in SQLite, and trains RandomForest models to predict next-hour indoor and outdoor temperatures.

## Architecture

```
Netatmo API → JSON files → SQLite → ML models → prediction JSON
                                                → weather.json (frontend)
GitHub API  → workflow.json (frontend)
```

1. `fetch_weather.py` pulls data from the Netatmo API, scrubs PII, and saves raw JSON
2. `build_dataset.py` parses all JSON files into a SQLite database
3. `train_model.py` trains temperature prediction models from the database
4. `predict.py` loads a model and outputs predicted temperatures
5. `validate_prediction.py` compares predictions against actual readings
6. `export_weather.py` assembles current readings, predictions, and history into `weather.json` for the frontend, and generates a `data-index.json` manifest
7. `export_workflow.py` fetches GitHub Actions run history and exports `workflow.json` for the frontend

The main GitHub Actions workflow (`/.github/workflows/netatmo.yml`) is triggered by `workflow_dispatch` from a **Cloudflare Worker** that runs every 20 minutes. It automates steps 1–6. Step 3 (training) runs on every invocation but tolerates failure.

A separate workflow (`/.github/workflows/workflow-status.yml`) triggers on completion of the main workflow and runs step 7.

## Project Structure

```
the-snake-tank/
├── fetch_weather.py        # Fetches data from Netatmo API, scrubs PII
├── build_dataset.py        # Builds SQLite DB from raw JSON
├── train_model.py          # Trains all three models (3hrRaw, 24hrRaw, 6hrRC)
├── predict.py              # Runs predictions for one or all models
├── validate_prediction.py  # Validates predictions against actual readings (multi-model)
├── export_weather.py       # Exports v2 weather.json + data-index.json for frontend
├── export_workflow.py      # Exports workflow.json for frontend
├── requirements.txt        # Python dependencies (pandas, scikit-learn)
├── data/
│   ├── YYYY-MM-DD/         # Raw JSON files, one per collection
│   │   ├── HHMMSS.json
│   │   └── ...
│   ├── predictions/        # Timestamped prediction output files
│   │   └── YYYY-MM-DD/
│   │       ├── HHMMSS_3hrRaw.json   # Model-typed prediction files
│   │       ├── HHMMSS_24hrRaw.json
│   │       ├── HHMMSS_6hrRC.json
│   │       └── HHMMSS.json          # Backwards-compat copy (3hrRaw model)
│   ├── prediction-history.json  # Validated prediction accuracy history (JSON + DB)
│   └── weather.db          # SQLite database (includes predictions + history tables)
├── models/
│   ├── temp_predictor.joblib        # 24hrRaw model (gitignored)
│   ├── temp_predictor_simple.joblib # 3hrRaw fallback model (gitignored)
│   ├── temp_predictor_6hr_rc.joblib # 6hrRC residual correction model (gitignored)
│   ├── temp_predictor_prev.joblib   # Previous 24hrRaw backup (gitignored)
│   ├── model_meta.json              # 24hrRaw model version metadata
│   ├── simple_meta.json             # 3hrRaw model version metadata
│   └── 6hr_rc_meta.json             # 6hrRC model version metadata
└── tests/                           # QA tests (in BackEnds/tests/)
```

## Workflow Trigger

The data pipeline runs on a 20-minute cycle:

1. A **Cloudflare Worker** fires a `workflow_dispatch` event against the GitHub API every 20 minutes (at :00, :20, :40 past the hour)
2. This triggers `netatmo.yml`, which runs fetch → build → validate → train → predict → export
3. On completion, `workflow-status.yml` triggers automatically (via `workflow_run`) to export workflow run metadata

There is no `schedule` trigger on the workflow — all scheduling is handled externally by the Cloudflare Worker.

## Data Collection

`fetch_weather.py` authenticates with the Netatmo API using OAuth2 (client ID, client secret, refresh token from environment variables), scrubs PII from the response, and saves the result to `data/{YYYY-MM-DD}/{HHMMSS}.json`.

### PII Scrubbing

Before saving, the script removes personally identifiable information:
- User email addresses → `"redacted"`
- Device IDs and home IDs → `"redacted"`
- Home names → `"redacted"`
- GPS coordinates and location data → stripped (only timezone preserved)

The `--scrub-existing` flag can retroactively scrub all previously saved data files.

## Data Retention

The GitHub Actions workflow includes automated cleanup of old data files:

- **Predictions**: Files older than 48 hours are removed (2880 minutes). Since predictions are also stored in SQLite, the JSON files are only needed for recent browsing and debugging.
- **Raw readings**: Files older than 7 days are removed (10080 minutes). All sensor data is preserved in the `readings` table in `weather.db`, so the raw JSON files are redundant after the database is built.
- **Empty directories**: Date directories that become empty after cleanup are automatically removed.

Model files (`.joblib`) are gitignored to prevent committing large binary files to the repository. Only model metadata JSON files are tracked in git.

## Data Pipeline

`build_dataset.py` scans all `data/*/*.json` files, extracts sensor readings, and writes them to the `readings` table in `data/weather.db`. The database is rebuilt from scratch on each run (drops and recreates the table). When multiple files exist for the same date/hour (from the 20-minute collection interval), only the latest is used.

The database also includes `predictions` and `prediction_history` tables, which are written incrementally by `predict.py` and `validate_prediction.py`. These tables provide DB-first reads for downstream scripts, with JSON files as fallback.

### `readings` Table Schema

| Column                   | Type    | Description                          |
|--------------------------|---------|--------------------------------------|
| `timestamp`              | INTEGER | Unix timestamp (primary key)         |
| `date`                   | TEXT    | Date string (YYYY-MM-DD)            |
| `hour`                   | INTEGER | Hour of reading (0-23)              |
| `temp_indoor`            | REAL    | Indoor temperature (°C)             |
| `co2`                    | INTEGER | CO2 level (ppm)                     |
| `humidity_indoor`        | INTEGER | Indoor humidity (%)                 |
| `noise`                  | INTEGER | Noise level (dB)                    |
| `pressure`               | REAL    | Pressure (mbar)                     |
| `pressure_absolute`      | REAL    | Absolute pressure (mbar)            |
| `temp_indoor_min`        | REAL    | Indoor temp daily min (°C)          |
| `temp_indoor_max`        | REAL    | Indoor temp daily max (°C)          |
| `date_min_temp_indoor`   | INTEGER | Timestamp of indoor daily min       |
| `date_max_temp_indoor`   | INTEGER | Timestamp of indoor daily max       |
| `temp_trend`             | TEXT    | Temperature trend (up/stable/down)  |
| `pressure_trend`         | TEXT    | Pressure trend (up/stable/down)     |
| `wifi_status`            | INTEGER | WiFi signal strength                |
| `temp_outdoor`           | REAL    | Outdoor temperature (°C)            |
| `humidity_outdoor`       | INTEGER | Outdoor humidity (%)                |
| `temp_outdoor_min`       | REAL    | Outdoor temp daily min (°C)         |
| `temp_outdoor_max`       | REAL    | Outdoor temp daily max (°C)         |
| `date_min_temp_outdoor`  | INTEGER | Timestamp of outdoor daily min      |
| `date_max_temp_outdoor`  | INTEGER | Timestamp of outdoor daily max      |
| `temp_outdoor_trend`     | TEXT    | Outdoor temp trend (up/stable/down) |
| `battery_percent`        | INTEGER | Outdoor module battery (%)          |
| `rf_status`              | INTEGER | Outdoor module RF signal strength   |
| `battery_vp`             | INTEGER | Outdoor module battery voltage      |

## Model Architecture

The system trains three RandomForest models. All three run on every training invocation.

### 3hrRaw Model (3h lookback, simple fallback)

- 9 features per hour × 3 hours = 27-dimensional input vector
- Features: `temp_indoor`, `temp_outdoor`, `co2`, `humidity_indoor`, `humidity_outdoor`, `noise`, `pressure`, `temp_trend`, `pressure_trend`
- Requires 4+ consecutive hourly readings (no gaps > 2h) to build training windows
- Uses leave-one-out CV when data is small (< 50 samples), 80/20 split otherwise

### 24hrRaw Model (24h lookback, full model)

- 22 features per hour × 24 hours = 528-dimensional input vector
- Features include all sensor readings, engineered time-since features, device health metrics, and encoded trends
- Requires 25+ consecutive hourly readings (no gaps > 2h) to build training windows
- Uses leave-one-out CV when data is small (< 50 samples), 80/20 split otherwise

### 6hrRC Model (6h lookback + residual correction)

- 68-dimensional input vector: (9 features × 6 hours) + (6 error lags × 2 temps) + 2 averages = 54 + 12 + 2
- Base features: same 9 features as 3hrRaw, over 6h lookback
- Error features: prediction errors from the 3hrRaw model for the past 6 hours (indoor + outdoor), plus rolling averages
- Requires 7+ consecutive hourly readings to build training windows
- Trains on prediction errors to apply residual correction on top of base predictions

All models use `MultiOutputRegressor(RandomForestRegressor)` to predict next-hour indoor and outdoor temperatures.

## Model Versioning

Each model tracks its version and training metrics in a metadata JSON file:

- `models/model_meta.json` — 24hrRaw model metadata
- `models/simple_meta.json` — 3hrRaw model metadata
- `models/6hr_rc_meta.json` — 6hrRC model metadata

Metadata fields:

| Field          | Description                                |
|----------------|--------------------------------------------|
| `version`      | Integer, increments on each training run   |
| `trained_at`   | UTC timestamp of training                  |
| `sample_count` | Number of training windows used            |
| `mae_indoor`   | Mean absolute error for indoor temp (°C)   |
| `mae_outdoor`  | Mean absolute error for outdoor temp (°C)  |

The 24hrRaw model also backs up the previous version to `temp_predictor_prev.joblib` before saving a new one.

## Prediction Cascade

`predict.py` supports running one or all models via the `--model-type` flag:

- `--model-type 3hrRaw` — Run only the 3hrRaw model
- `--model-type 24hrRaw` — Run only the 24hrRaw model
- `--model-type 6hrRC` — Run only the 6hrRC model
- `--model-type all` (default) — Run all three models sequentially

When `--model-type all` is used, all models run in sequence to avoid SQLite lock contention. Each model produces its own prediction file. If a model lacks sufficient data or fails, it is skipped and the other models still run.

Predictions are saved with model-typed filenames: `data/predictions/{YYYY-MM-DD}/{HHMMSS}_3hrRaw.json`, `HHMMSS_24hrRaw.json`, and `HHMMSS_6hrRC.json`. For backwards compatibility, the 3hrRaw model also writes an old-format `HHMMSS.json` copy.

### SQLite Dual-Write

Predictions are written to both JSON files (for backwards compatibility and easy browsing) and to the `predictions` table in `weather.db`. The table schema:

| Column                   | Type    | Description                          |
|--------------------------|---------|--------------------------------------|
| `id`                     | INTEGER | Primary key                          |
| `generated_at`           | TEXT    | When prediction was generated (UTC)  |
| `model_type`             | TEXT    | Model used (3hrRaw/24hrRaw/6hrRC)    |
| `model_version`          | INTEGER | Model version number                 |
| `for_hour`               | TEXT    | Hour being predicted (UTC)           |
| `temp_indoor_predicted`  | REAL    | Predicted indoor temp (°C)           |
| `temp_outdoor_predicted` | REAL    | Predicted outdoor temp (°C)          |
| `last_reading_ts`        | INTEGER | Timestamp of last sensor reading     |
| `last_reading_temp_indoor` | REAL  | Last reading indoor temp (°C)        |
| `last_reading_temp_outdoor` | REAL | Last reading outdoor temp (°C)       |

### Output Format

```json
{
  "generated_at": "2026-02-15T01:00:00Z",
  "model_version": 3,
  "model_type": "24hrRaw",
  "last_reading": {
    "timestamp": 1739581200,
    "date": "2026-02-15",
    "hour": 0,
    "temp_indoor": 21.5,
    "temp_outdoor": 3.2
  },
  "prediction": {
    "prediction_for": "2026-02-15T01:00:00Z",
    "temp_indoor": 21.3,
    "temp_outdoor": 2.8
  }
}
```

| Field           | Description                                        |
|-----------------|----------------------------------------------------|
| `generated_at`  | When the prediction was generated (UTC)            |
| `model_version` | Version number of the model used                   |
| `model_type`    | Which model produced the prediction (`"3hrRaw"`, `"24hrRaw"`, or `"6hrRC"`) |
| `last_reading`  | Most recent sensor data used as input              |
| `prediction`    | Predicted temperatures for the next hour           |

### Usage

```
python predict.py                                        # Run all models, print to stdout
python predict.py --model-type 3hrRaw                    # Run 3hrRaw model only
python predict.py --model-type all --predictions-dir data/predictions  # Run all, write timestamped files
python predict.py --output prediction.json               # Write JSON file
```

## Prediction Validation

`validate_prediction.py` compares predictions against the actual reading that arrived. It finds all predictions made 30–90 minutes ago (ideally ~60 minutes), grouped by model type, and validates each independently. All three models (3hrRaw, 24hrRaw, 6hrRC) are validated separately.

Duplicate detection keys on `(model_type, for_hour)` — a prediction is only validated once per model per hour.

### SQLite Dual-Write

Results are appended to both `data/prediction-history.json` (for backwards compatibility) and the `prediction_history` table in `weather.db`. JSON history holds up to 168 entries per model type (1 week of hourly predictions per model). The table schema:

| Column              | Type    | Description                          |
|---------------------|---------|--------------------------------------|
| `id`                | INTEGER | Primary key                          |
| `predicted_at`      | TEXT    | When prediction was generated (UTC)  |
| `for_hour`          | TEXT    | Hour being predicted (UTC)           |
| `model_type`        | TEXT    | Model used (3hrRaw/24hrRaw/6hrRC)    |
| `model_version`     | INTEGER | Model version number                 |
| `predicted_indoor`  | REAL    | Predicted indoor temp (°C)           |
| `predicted_outdoor` | REAL    | Predicted outdoor temp (°C)          |
| `actual_indoor`     | REAL    | Actual indoor temp (°C)              |
| `actual_outdoor`    | REAL    | Actual outdoor temp (°C)             |
| `error_indoor`      | REAL    | Absolute error indoor (°C)           |
| `error_outdoor`     | REAL    | Absolute error outdoor (°C)          |

The table has a `UNIQUE(model_type, for_hour)` constraint to prevent duplicate validations.

The history is used by `export_weather.py` to build the accuracy history shown on the frontend dashboard, and by `train_model.py` to load error features for the 6hrRC model.

### Usage

```
python validate_prediction.py --predictions-dir data/predictions --history data/prediction-history.json
python validate_prediction.py --prediction path/to/specific.json --history data/prediction-history.json
```

## Frontend Exports

### `export_weather.py`

Assembles a v2 `weather.json` for the frontend dashboard containing:
- `schema_version: 2` — format version identifier
- `property_meta` — labels, units, and format for each property (for dynamic frontend rendering)
- `current.readings` — nested object with current sensor values
- `predictions` — array of predictions, one per available model
- `history` — flat-format prediction accuracy history with `model_type` and `model_version`
- `next_prediction` — backwards-compatible flat prediction (from the first model in predictions)

The v2 format supports auto-discovery of new models: when a new model type starts producing prediction files, it appears automatically in the `predictions` array without code changes. Uses atomic writes (temp file + rename) to prevent partial reads.

Also generates a `data-index.json` manifest listing all available readings and prediction files by date, for use by the frontend data browser.

```
python export_weather.py --output ../FrontEnds/the-fish-tank/data/weather.json --history data/prediction-history.json
```

### `export_workflow.py`

Fetches recent GitHub Actions workflow runs from the API and exports a summary as `workflow.json` for the frontend Workflow tab. Includes run statuses, durations, success rates, and the next expected run time (based on the 20-minute Cloudflare Worker schedule).

Runs in its own workflow (`workflow-status.yml`) that triggers when the main `netatmo.yml` workflow completes.

```
GH_TOKEN=$(gh auth token) python export_workflow.py --output ../FrontEnds/the-fish-tank/data/workflow.json
```

## Setup

```bash
pip install -r requirements.txt   # pandas, scikit-learn
```

Run scripts individually:

```bash
python fetch_weather.py      # Requires NETATMO_CLIENT_ID, NETATMO_CLIENT_SECRET, NETATMO_REFRESH_TOKEN
python build_dataset.py      # Builds data/weather.db from data/*/*.json
python train_model.py        # Trains all three models → models/*.joblib
python predict.py --model-type all  # Run all models, print predicted temperatures
python validate_prediction.py --predictions-dir data/predictions --history data/prediction-history.json
python export_weather.py --output path/to/weather.json --history data/prediction-history.json
python export_workflow.py --output path/to/workflow.json   # Requires GH_TOKEN
```

<!-- Deploy flow test: 2026-02-16T13:27:00Z -->
