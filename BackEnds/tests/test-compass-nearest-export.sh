#!/usr/bin/env bash
set -euo pipefail
ERRORS=0; PASS=0
check() { if "$@" >/dev/null 2>&1; then PASS=$((PASS+1)); else echo "FAIL: $*"; ERRORS=$((ERRORS+1)); fi; }
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Code checks
check grep -q 'haversine_km' "$ROOT/the-snake-tank/export_weather.py"
check grep -q 'get_home_location' "$ROOT/the-snake-tank/export_weather.py"
check grep -q 'distance_km' "$ROOT/the-snake-tank/export_weather.py"
check grep -q 'distance_mi' "$ROOT/the-snake-tank/export_weather.py"
check grep -q 'home_location' "$ROOT/the-snake-tank/export_weather.py"

# Output checks (if weather-public.json exists)
WP="$ROOT/../FrontEnds/the-fish-tank/data/weather-public.json"
if [ -f "$WP" ]; then
  check python3 -c "import json; d=json.load(open('$WP')); assert 'home_location' in d['public_stations']"
  check python3 -c "import json; d=json.load(open('$WP')); assert len(d['public_stations']['stations']) <= 10"
  check python3 -c "import json; d=json.load(open('$WP')); assert 'distance_km' in d['public_stations']['stations'][0]"
  check python3 -c "import json; d=json.load(open('$WP')); ds=[s['distance_km'] for s in d['public_stations']['stations']]; assert ds==sorted(ds)"
fi

echo ""; echo "Results: $PASS passed, $ERRORS failed"
[ "$ERRORS" -eq 0 ] && echo "ALL CHECKS PASSED" || exit 1
