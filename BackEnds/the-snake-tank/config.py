import os
from dotenv import load_dotenv

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

load_dotenv(os.path.join(SCRIPT_DIR, ".env"))

DATABASE_URL = os.environ.get("DATABASE_URL", "")

R2_ENDPOINT_URL = os.environ.get("R2_ENDPOINT_URL")
R2_ACCESS_KEY_ID = os.environ.get("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = os.environ.get("R2_SECRET_ACCESS_KEY")
R2_BUCKET_NAME = os.environ.get("R2_BUCKET_NAME")

NETATMO_CLIENT_ID = os.environ.get("NETATMO_CLIENT_ID")
NETATMO_CLIENT_SECRET = os.environ.get("NETATMO_CLIENT_SECRET")
NETATMO_REFRESH_TOKEN = os.environ.get("NETATMO_REFRESH_TOKEN")
NETATMO_PUBLIC_LAT_NE = os.environ.get("NETATMO_PUBLIC_LAT_NE")
NETATMO_PUBLIC_LON_NE = os.environ.get("NETATMO_PUBLIC_LON_NE")
NETATMO_PUBLIC_LAT_SW = os.environ.get("NETATMO_PUBLIC_LAT_SW")
NETATMO_PUBLIC_LON_SW = os.environ.get("NETATMO_PUBLIC_LON_SW")

# Public reference point for the unauthenticated station feed. Station
# geometry is measured from here, never from the home location, so the
# published bearing/distance set cannot be trilaterated back to the house.
# Unset means the public station block is omitted entirely (fail closed).
WEATHER_REF_LAT = os.environ.get("WEATHER_REF_LAT")
WEATHER_REF_LON = os.environ.get("WEATHER_REF_LON")
WEATHER_REF_LABEL = os.environ.get("WEATHER_REF_LABEL")

MODEL_DIR = os.path.join(SCRIPT_DIR, "models")
DATA_DIR = os.path.join(SCRIPT_DIR, "data")
