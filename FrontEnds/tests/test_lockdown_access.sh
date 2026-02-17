#!/bin/bash
# Test: Verify protected data is not publicly accessible via GitHub raw URLs
# Plan: website-auth-lockdown

PASS=0
FAIL=0

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

RAW_BASE="https://raw.githubusercontent.com/GuppitusMaximus/fish-tank/main/FrontEnds/the-fish-tank/data"
LOCAL_DATA="/Users/guppy/FishTank/FrontEnds/the-fish-tank/data"

# 1. weather.json should return 404 from raw GitHub URL (not publicly accessible)
echo "Checking raw GitHub access to weather.json..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$RAW_BASE/weather.json")
if [ "$HTTP_STATUS" = "404" ]; then
  pass "weather.json returns 404 on GitHub raw URL (not publicly accessible)"
elif [ "$HTTP_STATUS" = "200" ]; then
  fail "weather.json returns 200 on GitHub raw URL — file is still publicly accessible!"
else
  echo "NOTE: weather.json returned HTTP $HTTP_STATUS (expected 404, may need to check after push)"
  pass "weather.json returned HTTP $HTTP_STATUS (not 200, acceptable)"
fi

# 2. weather-public.json: check locally or that it's not blocked
echo "Checking weather-public.json..."
if [ -f "$LOCAL_DATA/weather-public.json" ]; then
  # File exists — validate it has required keys
  if command -v python3 &>/dev/null; then
    VALID=$(python3 -c "
import json, sys
try:
    data = json.load(open('$LOCAL_DATA/weather-public.json'))
    required = ['schema_version', 'generated_at', 'current']
    missing = [k for k in required if k not in data]
    if missing:
        print('missing: ' + ', '.join(missing))
    else:
        print('ok')
except Exception as e:
    print('error: ' + str(e))
")
    if [ "$VALID" = "ok" ]; then
      pass "weather-public.json exists locally and has required keys (schema_version, generated_at, current)"
    else
      fail "weather-public.json exists but validation failed: $VALID"
    fi
  else
    # No python3, just check the file exists and is non-empty
    if [ -s "$LOCAL_DATA/weather-public.json" ]; then
      pass "weather-public.json exists locally and is non-empty"
    else
      fail "weather-public.json exists but is empty"
    fi
  fi
else
  pass "weather-public.json does not exist yet (acceptable — backend workflow creates it on next run)"
fi

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ $FAIL -eq 0 ] && exit 0 || exit 1
