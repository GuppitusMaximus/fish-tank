#!/usr/bin/env bash
# test_public_weather_display.sh
# Verifies the public weather frontend fetches from the Worker endpoint
# and that script load order is correct.
#
# Plan: qa-public-weather-frontend

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WEATHER_JS="$FRONTEND_DIR/the-fish-tank/js/weather.js"
INDEX_HTML="$FRONTEND_DIR/the-fish-tank/index.html"

PASS=0
FAIL=0

check() {
  local description="$1"
  local result="$2"
  if [ "$result" -eq 0 ]; then
    echo "PASS: $description"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $description"
    FAIL=$((FAIL + 1))
  fi
}

# 1. loadHomeSummary fetches from AUTH_API_URL + '/data/weather-public'
grep -q "AUTH_API_URL + '/data/weather-public'" "$WEATHER_JS"
check "loadHomeSummary uses AUTH_API_URL + '/data/weather-public'" $?

# 2. No hardcoded static path like weather-public.json in loadHomeSummary context
# Verify there is no fetch to a .json file within loadHomeSummary
python3 -c "
import re, sys

with open('$WEATHER_JS') as f:
    content = f.read()

m = re.search(r'function loadHomeSummary\(\)(.*?)(?=\n  function |\n  return \{)', content, re.DOTALL)
if not m:
    print('ERROR: could not find loadHomeSummary')
    sys.exit(1)

body = m.group(1)
if 'weather-public.json' in body:
    print('ERROR: loadHomeSummary still fetches static .json file')
    sys.exit(1)
sys.exit(0)
"
check "loadHomeSummary does NOT fetch a hardcoded .json path" $?

# 3. No auth headers in loadHomeSummary fetch (public endpoint, no auth needed)
python3 -c "
import re, sys

with open('$WEATHER_JS') as f:
    content = f.read()

m = re.search(r'function loadHomeSummary\(\)(.*?)(?=\n  function |\n  return \{)', content, re.DOTALL)
if not m:
    print('ERROR: could not find loadHomeSummary')
    sys.exit(1)

body = m.group(1)
if 'authHeaders' in body or 'FishTankAuth' in body:
    print('ERROR: loadHomeSummary sends auth headers — should be public')
    sys.exit(1)
sys.exit(0)
"
check "loadHomeSummary does NOT send auth headers" $?

# 4. .catch() handler exists in loadHomeSummary (graceful degradation)
python3 -c "
import re, sys

with open('$WEATHER_JS') as f:
    content = f.read()

m = re.search(r'function loadHomeSummary\(\)(.*?)(?=\n  function |\n  return \{)', content, re.DOTALL)
if not m:
    print('ERROR: could not find loadHomeSummary')
    sys.exit(1)

body = m.group(1)
if '.catch(' not in body:
    print('ERROR: loadHomeSummary missing .catch() handler')
    sys.exit(1)
sys.exit(0)
"
check "loadHomeSummary has .catch() for graceful degradation" $?

# 5. auth-config.js is loaded before weather.js in index.html
python3 -c "
import sys

with open('$INDEX_HTML') as f:
    content = f.read()

pos_auth = content.find('auth-config.js')
pos_weather = content.find('weather.js')

if pos_auth == -1:
    print('ERROR: auth-config.js not found in index.html')
    sys.exit(1)
if pos_weather == -1:
    print('ERROR: weather.js not found in index.html')
    sys.exit(1)
if pos_auth >= pos_weather:
    print('ERROR: auth-config.js must be loaded before weather.js')
    sys.exit(1)
sys.exit(0)
"
check "auth-config.js is loaded before weather.js in index.html" $?

# 6. V2 rendering: schema_version >= 2 check exists
grep -q 'schema_version >= 2' "$WEATHER_JS"
check "renderHomeSummary checks schema_version >= 2" $?

# 7. V2 rendering: current.readings check exists
grep -q 'current\.readings' "$WEATHER_JS"
check "renderHomeSummary checks current.readings" $?

# 8. V2 rendering: Array.isArray(predictions) check exists
grep -q 'Array\.isArray(data\.predictions)' "$WEATHER_JS"
check "renderHomeSummary checks Array.isArray(data.predictions)" $?

# 9. renderCurrentV2 function exists
grep -q 'function renderCurrentV2(' "$WEATHER_JS"
check "renderCurrentV2 function is defined" $?

# 10. renderPredictionsV2 function exists
grep -q 'function renderPredictionsV2(' "$WEATHER_JS"
check "renderPredictionsV2 function is defined" $?

echo ""
echo "Results: $PASS passed, $FAIL failed"

[ "$FAIL" -eq 0 ] && exit 0 || exit 1
