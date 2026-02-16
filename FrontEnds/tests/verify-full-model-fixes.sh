#!/bin/bash
# QA Test: Verify Full Model Frontend Fixes
# Plan: qa-full-model-frontend
# Tests the fixes from full-model-frontend plan

WEATHER_JS="/Users/guppy/FishTank/FrontEnds/the-fish-tank/js/weather.js"
PASS=0
FAIL=0

echo "================================================"
echo "QA: Full Model Frontend Fixes"
echo "================================================"
echo

# Test 1: No hardcoded 'temp_' prefix in V2 history code
echo "Test 1: Verify no hardcoded 'temp_' prefix..."
if grep -q "'temp_' +" "$WEATHER_JS"; then
  echo "  ✗ FAIL: Found hardcoded 'temp_' + suffix pattern"
  FAIL=$((FAIL + 1))
else
  echo "  ✓ PASS: No hardcoded 'temp_' prefix found"
  PASS=$((PASS + 1))
fi
echo

# Test 2: Verify resolvePropertyKey function exists
echo "Test 2: Verify resolvePropertyKey function exists..."
if grep -q "function resolvePropertyKey(suffix, propertyMeta)" "$WEATHER_JS"; then
  echo "  ✓ PASS: resolvePropertyKey function found"
  PASS=$((PASS + 1))

  # Verify it has the correct logic
  if grep -A 7 "function resolvePropertyKey" "$WEATHER_JS" | grep -q "key.endsWith('_' + suffix)"; then
    echo "  ✓ PASS: Function includes fallback prefix search"
    PASS=$((PASS + 1))
  else
    echo "  ✗ FAIL: Function missing fallback prefix search"
    FAIL=$((FAIL + 1))
  fi
else
  echo "  ✗ FAIL: resolvePropertyKey function not found"
  FAIL=$((FAIL + 1))
fi
echo

# Test 3: Verify resolvePropertyKey is used in buildHistoryTableV2
echo "Test 3: Verify resolvePropertyKey used in history table..."
if grep -A 50 "function buildHistoryTableV2" "$WEATHER_JS" | grep -q "resolvePropertyKey(suffix, pm)"; then
  echo "  ✓ PASS: resolvePropertyKey used in buildHistoryTableV2"
  PASS=$((PASS + 1))
else
  echo "  ✗ FAIL: resolvePropertyKey not used in buildHistoryTableV2"
  FAIL=$((FAIL + 1))
fi
echo

# Test 4: Verify resolvePropertyKey used in show-more handler
echo "Test 4: Verify resolvePropertyKey used in show-more handler..."
if grep -A 30 "showMoreBtn.addEventListener" "$WEATHER_JS" | grep -q "resolvePropertyKey(suffix, pm)"; then
  echo "  ✓ PASS: resolvePropertyKey used in show-more handler"
  PASS=$((PASS + 1))
else
  echo "  ✗ FAIL: resolvePropertyKey not used in show-more handler"
  FAIL=$((FAIL + 1))
fi
echo

# Test 5: Verify date filter defaults in initHistoryV2
echo "Test 5: Verify date filter defaults..."
if grep -A 10 "function initHistoryV2" "$WEATHER_JS" | grep -q "if (!historyState.filterDateStart && !historyState.filterDateEnd)"; then
  echo "  ✓ PASS: Default date filter check found"
  PASS=$((PASS + 1))

  if grep -A 10 "function initHistoryV2" "$WEATHER_JS" | grep -q "setDate(today.getDate() - 7)"; then
    echo "  ✓ PASS: Sets start date to 7 days ago"
    PASS=$((PASS + 1))
  else
    echo "  ✗ FAIL: Does not set 7-day default"
    FAIL=$((FAIL + 1))
  fi
else
  echo "  ✗ FAIL: Date filter default logic not found"
  FAIL=$((FAIL + 1))
fi
echo

# Test 6: Verify model_type and model_version columns
echo "Test 6: Verify model type/version columns in table..."
if grep -q 'data-sort="model_type"' "$WEATHER_JS"; then
  echo "  ✓ PASS: Model type column header found"
  PASS=$((PASS + 1))
else
  echo "  ✗ FAIL: Model type column header missing"
  FAIL=$((FAIL + 1))
fi

if grep -q 'data-sort="model_version"' "$WEATHER_JS"; then
  echo "  ✓ PASS: Model version column header found"
  PASS=$((PASS + 1))
else
  echo "  ✗ FAIL: Model version column header missing"
  FAIL=$((FAIL + 1))
fi
echo

# Test 7: Verify model filtering exists
echo "Test 7: Verify model type filtering..."
if grep -A 5 "function applyHistoryFilters" "$WEATHER_JS" | grep -q "entry.model_type"; then
  echo "  ✓ PASS: Model type filtering implemented"
  PASS=$((PASS + 1))
else
  echo "  ✗ FAIL: Model type filtering not found"
  FAIL=$((FAIL + 1))
fi
echo

# Summary
echo "================================================"
echo "RESULTS"
echo "================================================"
echo "PASS: $PASS"
echo "FAIL: $FAIL"
echo

if [ $FAIL -eq 0 ]; then
  echo "✓ All tests passed!"
  exit 0
else
  echo "✗ Some tests failed"
  exit 1
fi
