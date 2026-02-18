#!/usr/bin/env bash
set -euo pipefail
ERRORS=0; PASS=0
check() { if "$@" >/dev/null 2>&1; then PASS=$((PASS+1)); else echo "FAIL: $*"; ERRORS=$((ERRORS+1)); fi; }
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Check export script has public stations code
check grep -q 'public_stations' "$ROOT/the-snake-tank/export_weather.py"

# Check generated output has the field
if [ -f "$ROOT/../FrontEnds/the-fish-tank/data/weather-public.json" ]; then
  WP="$ROOT/../FrontEnds/the-fish-tank/data/weather-public.json"
elif [ -f "$ROOT/the-snake-tank/data/weather-public.json" ]; then
  WP="$ROOT/the-snake-tank/data/weather-public.json"
else
  echo "FAIL: weather-public.json not found"; ERRORS=$((ERRORS+1))
  WP=""
fi

if [ -n "$WP" ]; then
  check python3 -c "import json; d=json.load(open('$WP')); assert 'public_stations' in d"
  check python3 -c "import json; d=json.load(open('$WP')); assert len(d['public_stations']['stations'])>10"
  check python3 -c "import json; d=json.load(open('$WP')); assert d['schema_version']==2"
  check python3 -c "import json; d=json.load(open('$WP')); assert 'current' in d and 'predictions' in d"
fi

echo ""; echo "Results: $PASS passed, $ERRORS failed"
[ "$ERRORS" -eq 0 ] && echo "ALL CHECKS PASSED" || exit 1
