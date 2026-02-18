#!/usr/bin/env bash
# QA test: Verify fix-home-weather-public changes are correct
# Checks that loadHomeSummary() fetches from the local file with a Worker fallback.

set -e
PASS=0
FAIL=0

JS="the-fish-tank/js/weather.js"
JSON="the-fish-tank/data/weather-public.json"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

pass() { echo "  PASS: $1"; PASS=$((PASS+1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL+1)); }

echo "=== test_home_weather_public ==="

# 1. loadHomeSummary primary fetch is local data/weather-public.json
if awk '/function loadHomeSummary/,/^  \}$/' "$ROOT/$JS" | grep -q "fetch('data/weather-public.json')"; then
  pass "loadHomeSummary fetches from data/weather-public.json"
else
  fail "loadHomeSummary does NOT fetch from data/weather-public.json"
fi

# 2. Worker fallback still exists in loadHomeSummary
if awk '/function loadHomeSummary/,/^  \}$/' "$ROOT/$JS" | grep -q "AUTH_API_URL.*data/weather-public"; then
  pass "loadHomeSummary has Worker fallback (AUTH_API_URL + /data/weather-public)"
else
  fail "loadHomeSummary is MISSING Worker fallback"
fi

# 3. Fallback is guarded by !AUTH_API_URL check
if awk '/function loadHomeSummary/,/^  \}$/' "$ROOT/$JS" | grep -q "if (!AUTH_API_URL) return"; then
  pass "Worker fallback is guarded by !AUTH_API_URL check"
else
  fail "Worker fallback is NOT guarded by !AUTH_API_URL check"
fi

# 4. data/weather-public.json exists
if [ -f "$ROOT/$JSON" ]; then
  pass "data/weather-public.json exists"
else
  fail "data/weather-public.json MISSING"
fi

# 5. data/weather-public.json is valid JSON
if python3 -c "import json, sys; json.load(open('$ROOT/$JSON'))" 2>/dev/null; then
  pass "data/weather-public.json is valid JSON"
else
  fail "data/weather-public.json is NOT valid JSON"
fi

# 6. data/weather-public.json has required fields
FIELDS_OK=true
for field in schema_version generated_at current; do
  if ! python3 -c "import json; d=json.load(open('$ROOT/$JSON')); assert '$field' in d" 2>/dev/null; then
    fail "data/weather-public.json missing field: $field"
    FIELDS_OK=false
  fi
done
if [ "$FIELDS_OK" = true ]; then
  pass "data/weather-public.json has required fields (schema_version, generated_at, current)"
fi

# 7. start() still uses authenticated endpoint
if grep -q "AUTH_API_URL.*'/data/weather'" "$ROOT/$JS"; then
  pass "start() still fetches from AUTH_API_URL + /data/weather"
else
  fail "start() does NOT fetch from AUTH_API_URL + /data/weather"
fi

# 8. initDatabase() still uses authenticated endpoint
if grep -q "AUTH_API_URL.*'/data/database'" "$ROOT/$JS"; then
  pass "initDatabase() still fetches from AUTH_API_URL + /data/database"
else
  fail "initDatabase() does NOT fetch from AUTH_API_URL + /data/database"
fi

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
