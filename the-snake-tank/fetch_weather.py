#!/usr/bin/env python3
"""Fetch weather data from a Netatmo station and save the raw JSON response."""

import json
import os
import sys
import urllib.request
import urllib.error
import urllib.parse
from datetime import datetime, timezone


def refresh_access_token(client_id, client_secret, refresh_token):
    """Exchange a refresh token for a new access + refresh token pair."""
    data = urllib.parse.urlencode({
        "grant_type": "refresh_token",
        "client_id": client_id,
        "client_secret": client_secret,
        "refresh_token": refresh_token,
    }).encode()

    req = urllib.request.Request("https://api.netatmo.com/oauth2/token", data=data)
    with urllib.request.urlopen(req) as resp:
        body = json.loads(resp.read())

    return body["access_token"], body["refresh_token"]


def get_stations_data(access_token):
    """Call getstationsdata and return the parsed JSON response."""
    req = urllib.request.Request("https://api.netatmo.com/api/getstationsdata")
    req.add_header("Authorization", f"Bearer {access_token}")
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def main():
    client_id = os.environ["NETATMO_CLIENT_ID"]
    client_secret = os.environ["NETATMO_CLIENT_SECRET"]
    refresh_token = os.environ["NETATMO_REFRESH_TOKEN"]

    # --- Token refresh ---
    print("Refreshing access token...")
    access_token, new_refresh_token = refresh_access_token(
        client_id, client_secret, refresh_token
    )
    print("Token refreshed successfully.")

    # Persist the new refresh token so the workflow can update the secret.
    with open("new_refresh_token.txt", "w") as f:
        f.write(new_refresh_token)

    # --- Fetch weather data ---
    print("Fetching station data...")
    data = get_stations_data(access_token)
    print("Station data received.")

    # --- Save to the-snake-tank/data/{YYYY-MM-DD}/{HH}00.json ---
    now = datetime.now(timezone.utc)
    date_dir = now.strftime("%Y-%m-%d")
    filename = now.strftime("%H") + "00.json"

    out_dir = os.path.join("the-snake-tank", "data", date_dir)
    os.makedirs(out_dir, exist_ok=True)

    out_path = os.path.join(out_dir, filename)
    with open(out_path, "w") as f:
        json.dump(data, f, indent=2)

    print(f"Saved weather data to {out_path}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
