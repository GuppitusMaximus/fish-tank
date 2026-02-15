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
├── train_model.py          # Trains both full and simple models
├── predict.py              # Runs predictions using trained model
├── validate_prediction.py  # Validates predictions against actual readings
├── export_weather.py       # Exports weather.json + data-index.json for frontend
├── export_workflow.py      # Exports workflow.json for frontend
├── requirements.txt        # Python dependencies (pandas, scikit-learn)
├── data/
│   ├── YYYY-MM-DD/         # Raw JSON files, one per collection
│   │   ├── HHMMSS.json
│   │   └── ...
│   ├── predictions/        # Timestamped prediction output files
│   │   └── YYYY-MM-DD/
│   │       └── HHMMSS.json
│   ├── prediction-history.json  # Validated prediction accuracy history
│   └── weather.db          # SQLite database (gitignored)
└── models/
    ├── temp_predictor.joblib        # Full 24h model (gitignored)
    ├── temp_predictor_simple.joblib # Simple 3h fallback model
    ├── temp_predictor_prev.joblib   # Previous full model backup (gitignored)
    ├── model_meta.json              # Full model version metadata
    └── simple_meta.json             # Simple model version metadata
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

## Data Pipeline

`build_dataset.py` scans all `data/*/*.json` files, extracts sensor readings, and writes them to `data/weather.db`. The database is rebuilt from scratch on each run (drops and recreates the table). When multiple files exist for the same date/hour (from the 20-minute collection interval), only the latest is used.

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

The system trains two RandomForest models. Both run on every training invocation; the simple model serves as a fallback when the full model can't produce predictions.

### Full Model (24h lookback)

- 22 features per hour × 24 hours = 528-dimensional input vector
- Features include all sensor readings, engineered time-since features, device health metrics, and encoded trends
- Requires 25+ consecutive hourly readings (no gaps > 1.5h) to build training windows
- Uses leave-one-out CV when data is small (< 50 samples), 80/20 split otherwise

### Simple Model (3h fallback)

- 9 features per hour × 3 hours = 27-dimensional input vector
- Features: `temp_indoor`, `temp_outdoor`, `co2`, `humidity_indoor`, `humidity_outdoor`, `noise`, `pressure`, `temp_trend`, `pressure_trend`
- Requires 4+ consecutive hourly readings to build training windows
- Same CV/split strategy as the full model

Both models use `MultiOutputRegressor(RandomForestRegressor)` to predict next-hour indoor and outdoor temperatures.

## Model Versioning

Each model tracks its version and training metrics in a metadata JSON file:

- `models/model_meta.json` — full model metadata
- `models/simple_meta.json` — simple model metadata

Metadata fields:

| Field          | Description                                |
|----------------|--------------------------------------------|
| `version`      | Integer, increments on each training run   |
| `trained_at`   | UTC timestamp of training                  |
| `sample_count` | Number of training windows used            |
| `mae_indoor`   | Mean absolute error for indoor temp (°C)   |
| `mae_outdoor`  | Mean absolute error for outdoor temp (°C)  |

The full model also backs up the previous version to `temp_predictor_prev.joblib` before saving a new one.

## Prediction Cascade

`predict.py` attempts prediction in a fallback cascade:

1. **Stage 1 — Full model:** Loads the 24h model and the most recent 24 readings. If the model exists and enough recent data is available, produces a prediction with `model_type: "full"`.
2. **Stage 2 — Simple model:** If the full model fails or lacks data, loads the 3h model and the most recent 3 readings. Produces a prediction with `model_type: "simple"`.
3. **Stage 3 — Error:** If both models fail, exits with an error.

Predictions are saved to `data/predictions/{YYYY-MM-DD}/{HHMMSS}.json`.

### Output Format

```json
{
  "generated_at": "2026-02-15T01:00:00Z",
  "model_version": 3,
  "model_type": "full",
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
| `model_type`    | Which model produced the prediction (`full` or `simple`) |
| `last_reading`  | Most recent sensor data used as input              |
| `prediction`    | Predicted temperatures for the next hour           |

### Usage

```
python predict.py                                        # Print to stdout
python predict.py --output prediction.json               # Write JSON file
python predict.py --predictions-dir data/predictions     # Write timestamped file
```

## Prediction Validation

`validate_prediction.py` compares each prediction against the actual reading that arrived. It matches predictions by age — looking for a prediction made 30–90 minutes ago (ideally ~60 minutes), so the "next hour" prediction lines up with the current reading.

Results are appended to `data/prediction-history.json`, which holds up to 168 entries (1 week of hourly predictions). The history is used by `export_weather.py` to build the accuracy history shown on the frontend dashboard.

### Usage

```
python validate_prediction.py --predictions-dir data/predictions --history data/prediction-history.json
python validate_prediction.py --prediction path/to/specific.json --history data/prediction-history.json
```

## Frontend Exports

### `export_weather.py`

Assembles a combined `weather.json` for the frontend dashboard containing:
- Current sensor readings
- Next-hour prediction
- Recent prediction accuracy history (from validated `prediction-history.json`)

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
python train_model.py        # Trains both models → models/*.joblib
python predict.py            # Prints predicted temperatures
python validate_prediction.py --predictions-dir data/predictions --history data/prediction-history.json
python export_weather.py --output path/to/weather.json --history data/prediction-history.json
python export_workflow.py --output path/to/workflow.json   # Requires GH_TOKEN
```
