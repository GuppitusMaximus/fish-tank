#!/bin/bash
# QA tests for qa-readme-update-frontend plan
# Verifies README.md is accurate and complete after weather dashboard documentation
# All tests are read-only inspections of production files

PASS=0
FAIL=0
BASE="$(cd "$(dirname "$0")/.." && pwd)/the-fish-tank"
README="$BASE/README.md"

echo "=== Test 1: README exists and is valid markdown ==="

if [ -f "$README" ]; then
  echo "  PASS: README.md exists"
  PASS=$((PASS + 1))
else
  echo "  FAIL: README.md does not exist"
  FAIL=$((FAIL + 1))
fi

# Check for basic markdown structure (headings)
HEADING_COUNT=$(grep -c '^#' "$README")
if [ "$HEADING_COUNT" -ge 3 ]; then
  echo "  PASS: README has $HEADING_COUNT markdown headings"
  PASS=$((PASS + 1))
else
  echo "  FAIL: README has only $HEADING_COUNT headings (expected >= 3)"
  FAIL=$((FAIL + 1))
fi

# Check code block is opened and closed
FENCE_COUNT=$(grep -c '```' "$README")
if [ $((FENCE_COUNT % 2)) -eq 0 ] && [ "$FENCE_COUNT" -gt 0 ]; then
  echo "  PASS: Code fences balanced ($FENCE_COUNT backtick fences)"
  PASS=$((PASS + 1))
else
  echo "  FAIL: Code fences unbalanced ($FENCE_COUNT backtick fences)"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "=== Test 2: Weather dashboard documented ==="

if grep -qi 'current.*reading' "$README"; then
  echo "  PASS: Current readings display documented"
  PASS=$((PASS + 1))
else
  echo "  FAIL: Current readings display not documented"
  FAIL=$((FAIL + 1))
fi

if grep -qi 'next.hour.*forecast\|forecast.*next.hour\|next-hour' "$README"; then
  echo "  PASS: Next-hour forecast documented"
  PASS=$((PASS + 1))
else
  echo "  FAIL: Next-hour forecast not documented"
  FAIL=$((FAIL + 1))
fi

if grep -qi 'prediction history' "$README"; then
  echo "  PASS: Prediction history table documented"
  PASS=$((PASS + 1))
else
  echo "  FAIL: Prediction history table not documented"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "=== Test 3: User controls documented ==="

if grep -qi 'celsius.*fahrenheit.*kelvin\|temperature.*unit.*toggle' "$README"; then
  echo "  PASS: Temperature unit toggle documented"
  PASS=$((PASS + 1))
else
  echo "  FAIL: Temperature unit toggle not documented"
  FAIL=$((FAIL + 1))
fi

if grep -qi 'time.*format.*toggle\|12h.*24h' "$README"; then
  echo "  PASS: Time format toggle documented"
  PASS=$((PASS + 1))
else
  echo "  FAIL: Time format toggle not documented"
  FAIL=$((FAIL + 1))
fi

if grep -qi 'localStorage' "$README"; then
  echo "  PASS: localStorage persistence documented"
  PASS=$((PASS + 1))
else
  echo "  FAIL: localStorage persistence not documented"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "=== Test 4: Data pipeline documented ==="

if grep -qi 'backend.*pipeline\|pipeline.*backend' "$README"; then
  echo "  PASS: Backend pipeline mentioned"
  PASS=$((PASS + 1))
else
  echo "  FAIL: Backend pipeline not mentioned"
  FAIL=$((FAIL + 1))
fi

if grep -qi 'GitHub.*raw.*CDN\|raw\.githubusercontent' "$README"; then
  echo "  PASS: GitHub raw CDN fetch documented"
  PASS=$((PASS + 1))
else
  echo "  FAIL: GitHub raw CDN fetch not documented"
  FAIL=$((FAIL + 1))
fi

if grep -qi 'local.*fallback\|fallback' "$README"; then
  echo "  PASS: Local fallback documented"
  PASS=$((PASS + 1))
else
  echo "  FAIL: Local fallback not documented"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "=== Test 5: Project structure updated ==="

if grep -q 'weather\.js' "$README"; then
  echo "  PASS: weather.js listed in project structure"
  PASS=$((PASS + 1))
else
  echo "  FAIL: weather.js not in project structure"
  FAIL=$((FAIL + 1))
fi

if grep -q 'weather\.json' "$README"; then
  echo "  PASS: weather.json listed in project structure"
  PASS=$((PASS + 1))
else
  echo "  FAIL: weather.json not in project structure"
  FAIL=$((FAIL + 1))
fi

# Verify these files actually exist
if [ -f "$BASE/js/weather.js" ]; then
  echo "  PASS: js/weather.js exists on disk"
  PASS=$((PASS + 1))
else
  echo "  FAIL: js/weather.js does not exist on disk"
  FAIL=$((FAIL + 1))
fi

if [ -f "$BASE/data/weather.json" ]; then
  echo "  PASS: data/weather.json exists on disk"
  PASS=$((PASS + 1))
else
  echo "  FAIL: data/weather.json does not exist on disk"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "=== Test 6: Cross-reference with source code ==="

# 6a: README says 5 views; verify index.html has 5 view entries
VIEW_COUNT=$(grep -c "data-view=" "$BASE/index.html")
README_VIEWS=$(grep -c '^\- \*\*' "$README" | head -1)
if grep -q 'five views' "$README"; then
  if [ "$VIEW_COUNT" -ge 5 ]; then
    echo "  PASS: README says 'five views', index.html has $VIEW_COUNT data-view links"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: README says 'five views' but index.html has only $VIEW_COUNT data-view links"
    FAIL=$((FAIL + 1))
  fi
else
  echo "  FAIL: README does not mention 'five views'"
  FAIL=$((FAIL + 1))
fi

# 6b: README mentions Potter Weather Predictions; verify it matches nav label
if grep -q 'Potter Weather Predictions' "$README" && grep -q 'Potter Weather Predictions' "$BASE/index.html"; then
  echo "  PASS: 'Potter Weather Predictions' name matches between README and HTML"
  PASS=$((PASS + 1))
else
  echo "  FAIL: Weather view name mismatch between README and HTML"
  FAIL=$((FAIL + 1))
fi

# 6c: README mentions theme-ocean for weather; verify in index.html JS
if grep -q "theme-ocean.*Weather\|Weather.*theme-ocean\|Home.*Weather.*Fish Tank" "$README" && \
   grep -A6 'weather:' "$BASE/index.html" | grep -q "theme-ocean"; then
  echo "  PASS: Weather view theme (theme-ocean) matches between README and source"
  PASS=$((PASS + 1))
else
  echo "  FAIL: Weather view theme mismatch between README and source"
  FAIL=$((FAIL + 1))
fi

# 6d: README mentions localStorage; verify weather.js uses it
if grep -q 'localStorage' "$README" && grep -q 'localStorage' "$BASE/js/weather.js"; then
  echo "  PASS: localStorage documented and used in weather.js"
  PASS=$((PASS + 1))
else
  echo "  FAIL: localStorage mention mismatch between README and weather.js"
  FAIL=$((FAIL + 1))
fi

# 6e: README mentions Celsius/Fahrenheit/Kelvin; verify weather.js supports all three
if grep -q "units.*=.*\['C'.*'F'.*'K'\]" "$BASE/js/weather.js"; then
  echo "  PASS: weather.js supports C/F/K units as documented"
  PASS=$((PASS + 1))
else
  echo "  FAIL: weather.js unit support doesn't match README"
  FAIL=$((FAIL + 1))
fi

# 6f: README mentions color-coded deltas; verify deltaClass in weather.js
if grep -q 'delta-low\|delta-mid\|delta-high' "$BASE/js/weather.js"; then
  echo "  PASS: Delta color classes exist in weather.js"
  PASS=$((PASS + 1))
else
  echo "  FAIL: Delta color classes missing from weather.js"
  FAIL=$((FAIL + 1))
fi

# 6g: README mentions model version; verify weather.js renders it
if grep -q 'model.version\|model_version' "$README" && grep -q 'model_version' "$BASE/js/weather.js"; then
  echo "  PASS: Model version documented and rendered in weather.js"
  PASS=$((PASS + 1))
else
  echo "  FAIL: Model version mismatch between README and weather.js"
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
