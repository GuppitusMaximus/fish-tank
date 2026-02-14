# the-snake-tank

Weather data collection and ML temperature prediction pipeline for a Netatmo weather station. Collects hourly readings via GitHub Actions, stores them in SQLite, and trains a RandomForest model to predict next-hour indoor and outdoor temperatures.

## Architecture

```
Netatmo API → JSON files → SQLite → ML model → prediction JSON
```

1. `fetch_weather.py` pulls data from the Netatmo API and saves raw JSON
2. `build_dataset.py` parses all JSON files into a SQLite database
3. `train_model.py` trains a temperature prediction model from the database
4. `predict.py` loads the model and outputs predicted temperatures

The GitHub Actions workflow (`/.github/workflows/netatmo.yml`) runs hourly and automates steps 1, 2, and 4. Step 3 (training) is run manually as needed.

## Project Structure

```
the-snake-tank/
├── fetch_weather.py        # Fetches data from Netatmo API
├── build_dataset.py        # Builds SQLite DB from raw JSON
├── train_model.py          # Trains RandomForest temperature model
├── predict.py              # Runs predictions using trained model
├── requirements.txt        # Python dependencies (pandas, scikit-learn)
├── data/
│   ├── YYYY-MM-DD/         # Raw JSON files, one per hour
│   │   ├── 0000.json
│   │   ├── 0100.json
│   │   └── ...
│   └── weather.db          # SQLite database (gitignored)
└── models/
    └── temp_predictor.joblib   # Trained model (gitignored)
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

## ML Model

`train_model.py` trains a `MultiOutputRegressor(RandomForestRegressor)` to predict the next hour's indoor and outdoor temperatures. Features are built from a 3-hour sliding window of readings (9 features × 3 hours = 27-dimensional input).

- Uses leave-one-out cross-validation when data is small (<50 samples), 80/20 split otherwise
- Requires consecutive readings with no gaps >1.5 hours
- Model is saved to `models/temp_predictor.joblib`

## Prediction

`predict.py` loads the trained model and the most recent 3 readings from the database to predict next-hour temperatures.

```
python predict.py                          # Print to stdout
python predict.py --output prediction.json # Write JSON for frontend
```

The output JSON includes the last reading's data and predicted temperatures, used by the frontend weather widget.

## Setup

```bash
pip install -r requirements.txt   # pandas, scikit-learn
```

Run scripts individually:

```bash
python fetch_weather.py      # Requires NETATMO_CLIENT_ID, NETATMO_CLIENT_SECRET, NETATMO_REFRESH_TOKEN
python build_dataset.py      # Builds data/weather.db from data/*/*.json
python train_model.py        # Trains model → models/temp_predictor.joblib
python predict.py             # Prints predicted temperatures
```
