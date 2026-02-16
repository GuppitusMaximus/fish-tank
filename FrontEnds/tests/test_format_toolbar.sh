#!/bin/bash
# QA tests for format toolbar implementation
# Tests: toolbar HTML structure, CSS styles, event handlers, localStorage persistence
# All tests are read-only inspections of production files

PASS=0
FAIL=0
BASE="$(cd "$(dirname "$0")/.." && pwd)/the-fish-tank"

echo "=== Test 1: Verify toolbar HTML structure in weather.js ==="

# 1a: Check buildToolbarHtml() function exists and creates toolbar
if grep -q "function buildToolbarHtml()" "$BASE/js/weather.js"; then
  echo "  PASS: buildToolbarHtml() function exists"
  PASS=$((PASS + 1))
else
  echo "  FAIL: buildToolbarHtml() function not found"
  FAIL=$((FAIL + 1))
fi

# 1b: Toolbar container with correct class
if grep -q '<div class="dash-toolbar">' "$BASE/js/weather.js"; then
  echo "  PASS: dash-toolbar container exists"
  PASS=$((PASS + 1))
else
  echo "  FAIL: dash-toolbar container missing"
  FAIL=$((FAIL + 1))
fi

# 1c: Time format group with label and toggle
if grep -q '<span class="toolbar-label">Time</span>' "$BASE/js/weather.js"; then
  echo "  PASS: Time label exists"
  PASS=$((PASS + 1))
else
  echo "  FAIL: Time label missing"
  FAIL=$((FAIL + 1))
fi

if grep -q 'id="time-format-toggle"' "$BASE/js/weather.js"; then
  echo "  PASS: time-format-toggle element exists"
  PASS=$((PASS + 1))
else
  echo "  FAIL: time-format-toggle element missing"
  FAIL=$((FAIL + 1))
fi

# 1d: Time options (12h and 24h buttons)
if grep -q 'data-value="12h">12h</button>' "$BASE/js/weather.js"; then
  echo "  PASS: 12h option exists"
  PASS=$((PASS + 1))
else
  echo "  FAIL: 12h option missing"
  FAIL=$((FAIL + 1))
fi

if grep -q 'data-value="24h">24h</button>' "$BASE/js/weather.js"; then
  echo "  PASS: 24h option exists"
  PASS=$((PASS + 1))
else
  echo "  FAIL: 24h option missing"
  FAIL=$((FAIL + 1))
fi

# 1e: Unit format group with label and toggle
if grep -q '<span class="toolbar-label">Unit</span>' "$BASE/js/weather.js"; then
  echo "  PASS: Unit label exists"
  PASS=$((PASS + 1))
else
  echo "  FAIL: Unit label missing"
  FAIL=$((FAIL + 1))
fi

if grep -q 'id="unit-toggle"' "$BASE/js/weather.js"; then
  echo "  PASS: unit-toggle element exists"
  PASS=$((PASS + 1))
else
  echo "  FAIL: unit-toggle element missing"
  FAIL=$((FAIL + 1))
fi

# 1f: Unit options (°C, °F, K buttons)
if grep -q 'data-value="C">.*C</button>' "$BASE/js/weather.js"; then
  echo "  PASS: °C option exists"
  PASS=$((PASS + 1))
else
  echo "  FAIL: °C option missing"
  FAIL=$((FAIL + 1))
fi

if grep -q 'data-value="F">.*F</button>' "$BASE/js/weather.js"; then
  echo "  PASS: °F option exists"
  PASS=$((PASS + 1))
else
  echo "  FAIL: °F option missing"
  FAIL=$((FAIL + 1))
fi

if grep -q 'data-value="K">K</button>' "$BASE/js/weather.js"; then
  echo "  PASS: K option exists"
  PASS=$((PASS + 1))
else
  echo "  FAIL: K option missing"
  FAIL=$((FAIL + 1))
fi

# 1g: Active class is applied based on current settings
if grep -q "' active' : ''" "$BASE/js/weather.js"; then
  echo "  PASS: Active class conditionally applied"
  PASS=$((PASS + 1))
else
  echo "  FAIL: Active class logic missing"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "=== Test 2: Verify toolbar placement in render functions ==="

# 2a: buildToolbarHtml() called in renderV1
if grep -q "buildToolbarHtml()" "$BASE/js/weather.js" | head -1; then
  echo "  PASS: buildToolbarHtml() is called"
  PASS=$((PASS + 1))
else
  echo "  FAIL: buildToolbarHtml() not called in render functions"
  FAIL=$((FAIL + 1))
fi

# 2b: Toolbar appears after dash-subnav in renderV1
if grep -A 5 'class="dash-subnav"' "$BASE/js/weather.js" | grep -q 'buildToolbarHtml()'; then
  echo "  PASS: Toolbar appears after sub-nav in renderV1"
  PASS=$((PASS + 1))
else
  echo "  FAIL: Toolbar placement incorrect in renderV1"
  FAIL=$((FAIL + 1))
fi

# 2c: Toolbar appears after dash-subnav in renderV2
if grep -A 5 'dash-subnav' "$BASE/js/weather.js" | tail -20 | grep -q 'buildToolbarHtml()'; then
  echo "  PASS: Toolbar appears after sub-nav in renderV2"
  PASS=$((PASS + 1))
else
  echo "  FAIL: Toolbar placement incorrect in renderV2"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "=== Test 3: Verify event handlers ==="

# 3a: wireToolbarHandlers function exists
if grep -q "function wireToolbarHandlers" "$BASE/js/weather.js"; then
  echo "  PASS: wireToolbarHandlers() function exists"
  PASS=$((PASS + 1))
else
  echo "  FAIL: wireToolbarHandlers() function missing"
  FAIL=$((FAIL + 1))
fi

# 3b: Time toggle click handler sets use24h
if grep -A 10 "#time-format-toggle" "$BASE/js/weather.js" | grep -q "use24h = btn.dataset.value === '24h'"; then
  echo "  PASS: Time toggle handler sets use24h variable"
  PASS=$((PASS + 1))
else
  echo "  FAIL: Time toggle handler logic incorrect"
  FAIL=$((FAIL + 1))
fi

# 3c: Time toggle saves to localStorage
if grep -A 10 "#time-format-toggle" "$BASE/js/weather.js" | grep -q "localStorage.setItem('timeFormat'"; then
  echo "  PASS: Time toggle persists to localStorage"
  PASS=$((PASS + 1))
else
  echo "  FAIL: Time toggle does not persist to localStorage"
  FAIL=$((FAIL + 1))
fi

# 3d: Unit toggle click handler sets currentUnit
if grep -A 10 "#unit-toggle" "$BASE/js/weather.js" | grep -q "currentUnit = btn.dataset.value"; then
  echo "  PASS: Unit toggle handler sets currentUnit variable"
  PASS=$((PASS + 1))
else
  echo "  FAIL: Unit toggle handler logic incorrect"
  FAIL=$((FAIL + 1))
fi

# 3e: Unit toggle saves to localStorage
if grep -A 10 "#unit-toggle" "$BASE/js/weather.js" | grep -q "localStorage.setItem('tempUnit'"; then
  echo "  PASS: Unit toggle persists to localStorage"
  PASS=$((PASS + 1))
else
  echo "  FAIL: Unit toggle does not persist to localStorage"
  FAIL=$((FAIL + 1))
fi

# 3f: Handlers trigger re-render
if grep -A 15 "function wireToolbarHandlers" "$BASE/js/weather.js" | grep -q "rerender()"; then
  echo "  PASS: Handlers trigger view re-render"
  PASS=$((PASS + 1))
else
  echo "  FAIL: Handlers do not trigger re-render"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "=== Test 4: Verify CSS styles exist ==="

# 4a: dash-toolbar styles
if grep -q ".dash-toolbar" "$BASE/css/style.css"; then
  echo "  PASS: .dash-toolbar styles exist"
  PASS=$((PASS + 1))
else
  echo "  FAIL: .dash-toolbar styles missing"
  FAIL=$((FAIL + 1))
fi

# 4b: toolbar-group styles
if grep -q ".toolbar-group" "$BASE/css/style.css"; then
  echo "  PASS: .toolbar-group styles exist"
  PASS=$((PASS + 1))
else
  echo "  FAIL: .toolbar-group styles missing"
  FAIL=$((FAIL + 1))
fi

# 4c: toolbar-label styles
if grep -q ".toolbar-label" "$BASE/css/style.css"; then
  echo "  PASS: .toolbar-label styles exist"
  PASS=$((PASS + 1))
else
  echo "  FAIL: .toolbar-label styles missing"
  FAIL=$((FAIL + 1))
fi

# 4d: toolbar-toggle styles
if grep -q ".toolbar-toggle" "$BASE/css/style.css"; then
  echo "  PASS: .toolbar-toggle styles exist"
  PASS=$((PASS + 1))
else
  echo "  FAIL: .toolbar-toggle styles missing"
  FAIL=$((FAIL + 1))
fi

# 4e: toggle-option styles
if grep -q ".toggle-option" "$BASE/css/style.css"; then
  echo "  PASS: .toggle-option styles exist"
  PASS=$((PASS + 1))
else
  echo "  FAIL: .toggle-option styles missing"
  FAIL=$((FAIL + 1))
fi

# 4f: Active state highlighting
if grep -q ".toggle-option.active" "$BASE/css/style.css"; then
  echo "  PASS: .toggle-option.active styles exist"
  PASS=$((PASS + 1))
else
  echo "  FAIL: .toggle-option.active styles missing"
  FAIL=$((FAIL + 1))
fi

# 4g: Responsive mobile styles
MEDIA_LINE=$(grep -n "@media.*max-width" "$BASE/css/style.css" | head -1 | cut -d: -f1)
if [ -n "$MEDIA_LINE" ] && tail -n +"$MEDIA_LINE" "$BASE/css/style.css" | head -100 | grep -q ".dash-toolbar"; then
  echo "  PASS: Responsive mobile styles exist"
  PASS=$((PASS + 1))
else
  echo "  FAIL: Responsive mobile styles missing"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "=== Test 5: Verify old controls removed ==="

# 5a: No .dash-controls in CSS
if ! grep -q ".dash-controls" "$BASE/css/style.css"; then
  echo "  PASS: Old .dash-controls styles removed from CSS"
  PASS=$((PASS + 1))
else
  echo "  FAIL: Old .dash-controls styles still present in CSS"
  FAIL=$((FAIL + 1))
fi

# 5b: No .format-toggle in CSS
if ! grep -q ".format-toggle" "$BASE/css/style.css"; then
  echo "  PASS: Old .format-toggle styles removed from CSS"
  PASS=$((PASS + 1))
else
  echo "  FAIL: Old .format-toggle styles still present in CSS"
  FAIL=$((FAIL + 1))
fi

# 5c: No .dash-controls in JS
if ! grep -q 'class="dash-controls"' "$BASE/js/weather.js"; then
  echo "  PASS: Old .dash-controls markup removed from JS"
  PASS=$((PASS + 1))
else
  echo "  FAIL: Old .dash-controls markup still present in JS"
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
