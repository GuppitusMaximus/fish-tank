# the-snake-tank

Weather data collection and ML temperature prediction pipeline for a Netatmo weather station. Collects hourly readings via GitHub Actions, stores them in SQLite, and trains RandomForest models to predict next-hour indoor and outdoor temperatures.

## Architecture

```
Netatmo API → JSON files → SQLite → ML models → prediction JSON
```

1. `fetch_weather.py` pulls data from the Netatmo API and saves raw JSON
2. `build_dataset.py` parses all JSON files into a SQLite database
3. `train_model.py` trains temperature prediction models from the database
4. `predict.py` loads a model and outputs predicted temperatures

The GitHub Actions workflow (`/.github/workflows/netatmo.yml`) runs hourly and automates steps 1, 2, and 4. Step 3 (training) is run manually as needed.

## Project Structure

```
the-snake-tank/
├── fetch_weather.py        # Fetches data from Netatmo API
├── build_dataset.py        # Builds SQLite DB from raw JSON
├── train_model.py          # Trains both full and simple models
├── predict.py              # Runs predictions using trained model
├── requirements.txt        # Python dependencies (pandas, scikit-learn)
├── data/
│   ├── YYYY-MM-DD/         # Raw JSON files, one per hour
│   │   ├── 0000.json
│   │   ├── 0100.json
│   │   └── ...
│   ├── predictions/        # Timestamped prediction output files
│   │   └── YYYY-MM-DD/
│   │       └── HH00.json
│   └── weather.db          # SQLite database (gitignored)
└── models/
    ├── temp_predictor.joblib        # Full 24h model (gitignored)
    ├── temp_predictor_simple.joblib # Simple 3h fallback model (gitignored)
    ├── temp_predictor_prev.joblib   # Previous full model backup (gitignored)
    ├── model_meta.json              # Full model version metadata
    └── simple_meta.json             # Simple model version metadata

BackEnds/tests/
├── test_code_quality.py       # Code quality checks
├── test_model_versioning.py   # Model versioning tests
└── test_prediction_fallback.py # Prediction fallback tests
```

## Data Collection

`fetch_weather.py` authenticates with the Netatmo API using OAuth2 (client ID, client secret, refresh token from environment variables) and saves the raw station response to `data/{YYYY-MM-DD}/{HH}00.json`.

Runs hourly via the `netatmo.yml` GitHub Actions workflow.

## Data Pipeline

`build_dataset.py` scans all `data/*/*.json` files, extracts sensor readings, and writes them to `data/weather.db`. The database is rebuilt from scratch on each run (drops and recreates the table).

### `readings` Table Schema

| Column              | Type    | Description                          |
|---------------------|---------|--------------------------------------|
| `timestamp`         | INTEGER | Unix timestamp (primary key)         |
| `date`              | TEXT    | Date string (YYYY-MM-DD)            |
| `hour`              | INTEGER | Hour of reading (0-23)              |
| `temp_indoor`       | REAL    | Indoor temperature (°C)             |
| `co2`               | INTEGER | CO2 level (ppm)                     |
| `humidity_indoor`   | INTEGER | Indoor humidity (%)                 |
| `noise`             | INTEGER | Noise level (dB)                    |
| `pressure`          | REAL    | Pressure (mbar)                     |
| `pressure_absolute` | REAL    | Absolute pressure (mbar)            |
| `temp_indoor_min`   | REAL    | Indoor temp daily min (°C)          |
| `temp_indoor_max`   | REAL    | Indoor temp daily max (°C)          |
| `temp_trend`        | TEXT    | Temperature trend (up/stable/down)  |
| `pressure_trend`    | TEXT    | Pressure trend (up/stable/down)     |
| `temp_outdoor`      | REAL    | Outdoor temperature (°C)            |
| `humidity_outdoor`  | INTEGER | Outdoor humidity (%)                |
| `temp_outdoor_min`  | REAL    | Outdoor temp daily min (°C)         |
| `temp_outdoor_max`  | REAL    | Outdoor temp daily max (°C)         |

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
```
