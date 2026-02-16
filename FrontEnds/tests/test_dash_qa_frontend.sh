#!/bin/bash
# QA tests for test-dash-qa-frontend plan
# Tests: HTML structure, JS quality, JSON data format
# All tests are read-only inspections of production files

PASS=0
FAIL=0
BASE="$(cd "$(dirname "$0")/.." && pwd)/the-fish-tank"

echo "=== Test 1: Validate HTML structure ==="

# 1a: Valid doctype
if head -1 "$BASE/index.html" | grep -qi '<!DOCTYPE html>'; then
  echo "  PASS: Valid doctype declaration"
  PASS=$((PASS + 1))
else
  echo "  FAIL: Missing or invalid doctype"
  FAIL=$((FAIL + 1))
fi

# 1b: All opened tags properly closed (check key structural tags)
for tag in html head body header nav main; do
  open=$(grep -c "<${tag}[ >]" "$BASE/index.html")
  close=$(grep -c "</$tag>" "$BASE/index.html")
  if [ "$open" -eq "$close" ]; then
    echo "  PASS: <$tag> tags balanced ($open open, $close close)"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: <$tag> tags unbalanced ($open open, $close close)"
    FAIL=$((FAIL + 1))
  fi
done

# 1c: Navigation data-view attributes map to views in JS
for view in home weather fishtank battle fighter; do
  if grep -q "data-view=\"$view\"" "$BASE/index.html"; then
    echo "  PASS: Nav link data-view=\"$view\" exists"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: Nav link data-view=\"$view\" missing"
    FAIL=$((FAIL + 1))
  fi
done

echo ""
echo "=== Test 2: Check JavaScript weather.js ==="

# 2a: No obvious undefined references — container is defined
if grep -q "const container = document.getElementById('weather')" "$BASE/js/weather.js"; then
  echo "  PASS: container variable is defined"
  PASS=$((PASS + 1))
else
  echo "  FAIL: container variable not properly defined"
  FAIL=$((FAIL + 1))
fi

# 2b: Fetch calls have error handling (.catch)
FETCH_COUNT=$(grep -c "fetch(" "$BASE/js/weather.js")
CATCH_COUNT=$(grep -c "\.catch(" "$BASE/js/weather.js")
if [ "$CATCH_COUNT" -ge "$FETCH_COUNT" ]; then
  echo "  PASS: All fetch calls have .catch() handlers ($FETCH_COUNT fetches, $CATCH_COUNT catches)"
  PASS=$((PASS + 1))
else
  echo "  FAIL: Not all fetch calls have error handling ($FETCH_COUNT fetches, $CATCH_COUNT catches)"
  FAIL=$((FAIL + 1))
fi

# 2c: DOM element ID 'weather' exists in HTML
if grep -q 'id="weather"' "$BASE/index.html"; then
  echo "  PASS: DOM element id=\"weather\" exists in HTML"
  PASS=$((PASS + 1))
else
  echo "  FAIL: DOM element id=\"weather\" missing from HTML"
  FAIL=$((FAIL + 1))
fi

# 2d: Dynamic IDs are created before being queried
if grep -q 'id="time-format-toggle"' "$BASE/js/weather.js" && grep -q "#time-format-toggle" "$BASE/js/weather.js"; then
  echo "  PASS: time-format-toggle created and referenced consistently"
  PASS=$((PASS + 1))
else
  echo "  FAIL: time-format-toggle ID mismatch"
  FAIL=$((FAIL + 1))
fi

if grep -q 'id="unit-toggle"' "$BASE/js/weather.js" && grep -q "#unit-toggle" "$BASE/js/weather.js"; then
  echo "  PASS: unit-toggle created and referenced consistently"
  PASS=$((PASS + 1))
else
  echo "  FAIL: unit-toggle ID mismatch"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "=== Test 3: Verify weather.json data format ==="

# 3a: Valid JSON
if python3 -c "import json; json.load(open('$BASE/data/weather.json'))" 2>/dev/null; then
  echo "  PASS: weather.json is valid JSON"
  PASS=$((PASS + 1))
else
  echo "  FAIL: weather.json is not valid JSON"
  FAIL=$((FAIL + 1))
fi

# 3b: Expected top-level keys
for key in generated_at current next_prediction history; do
  if python3 -c "import json; d=json.load(open('$BASE/data/weather.json')); assert '$key' in d" 2>/dev/null; then
    echo "  PASS: Top-level key '$key' exists"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: Top-level key '$key' missing"
    FAIL=$((FAIL + 1))
  fi
done

# 3c: Timestamps are ISO format
if python3 -c "
import json, re
d = json.load(open('$BASE/data/weather.json'))
iso = re.compile(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$')
assert iso.match(d['generated_at']), 'generated_at not ISO'
assert iso.match(d['current']['timestamp']), 'current.timestamp not ISO'
for h in d['history']:
    assert iso.match(h['timestamp']), f'history timestamp not ISO: {h[\"timestamp\"]}'
" 2>/dev/null; then
  echo "  PASS: All timestamps are in ISO format"
  PASS=$((PASS + 1))
else
  echo "  FAIL: Some timestamps are not in ISO format"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "=============================="
echo "Results: $PASS passed, $FAIL failed"
if [ "$FAIL" -eq 0 ]; then
  echo "ALL TESTS PASSED"
  exit 0
else
  echo "SOME TESTS FAILED"
  exit 1
fi
