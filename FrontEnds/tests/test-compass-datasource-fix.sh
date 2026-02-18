#!/usr/bin/env bash
set -euo pipefail
ERRORS=0; PASS=0
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
JS="$ROOT/the-fish-tank/js/weather.js"

pass() { PASS=$((PASS+1)); }
fail() { echo "FAIL: $1"; ERRORS=$((ERRORS+1)); }

# loadCompassData should NOT reference MANIFEST_URL in its body
if grep -A 20 'function loadCompassData' "$JS" | grep -q 'MANIFEST_URL'; then
  fail "loadCompassData still references MANIFEST_URL"
else
  pass
fi

# loadCompassData should reference latestData.public_stations
if grep -A 20 'function loadCompassData' "$JS" | grep -q 'public_stations'; then
  pass
else
  fail "loadCompassData does not reference public_stations"
fi

# renderCompass should still exist
if grep -q 'function renderCompass' "$JS"; then
  pass
else
  fail "renderCompass function not found"
fi

# loadCompassData should still be exposed on WeatherApp return object
if grep -q 'loadCompassData' "$JS"; then
  pass
else
  fail "loadCompassData not found in weather.js"
fi

# No direct data-index.json fetch in compass code
if grep -A 30 'function loadCompassData' "$JS" | grep -q 'data-index'; then
  fail "loadCompassData still references data-index"
else
  pass
fi

echo ""
echo "Results: $PASS passed, $ERRORS failed"
[ "$ERRORS" -eq 0 ] && echo "ALL CHECKS PASSED" || exit 1
