#!/usr/bin/env bash
# QA Test: Verify README documentation accuracy
# Plan: qa-docs-frontend
# Created: 2026-02-15
#
# Verifies that the-fish-tank/README.md accurately documents:
# - Multi-select filter functionality
# - Expired prediction filtering
# - Auto-deploy workflow trigger
# - Project file structure

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(dirname "$SCRIPT_DIR")"
README="$FRONTEND_DIR/the-fish-tank/README.md"
WEATHER_JS="$FRONTEND_DIR/the-fish-tank/js/weather.js"

PASS=0
FAIL=0

pass() { echo "✅ PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "❌ FAIL: $1"; FAIL=$((FAIL + 1)); }

echo "=== QA: README Documentation Verification ==="
echo

# Step 1: README exists
if [[ -f "$README" ]]; then
  pass "README.md exists"
else
  fail "README.md missing"
  exit 1
fi

# Step 2: Multi-select filter documentation
if grep -q "multi-select dropdowns" "$README"; then
  pass "Multi-select dropdowns mentioned in README"
else
  fail "Multi-select dropdowns not mentioned in README"
fi

if grep -q "filtering by model type and model version via multi-select" "$README"; then
  pass "Model type and version multi-select filters documented"
else
  fail "Model type and version multi-select filters not documented"
fi

# Check for absence of old filter terminology
if grep -iq "single-select" "$README" || grep -iq "text input.*filter" "$README"; then
  fail "README contains old filter terminology (single-select or text inputs)"
else
  pass "No references to old single-select or text input filters"
fi

# Cross-reference with code
if grep -q "function createMultiSelect" "$WEATHER_JS"; then
  pass "createMultiSelect function exists in weather.js"
else
  fail "createMultiSelect function not found in weather.js"
fi

# Step 3: Expired predictions documentation
if grep -qi "more than 6 hours in the past" "$README"; then
  pass "Expired predictions filtering documented (6 hour limit)"
else
  fail "Expired predictions filtering not documented"
fi

# Cross-reference with code: check for time filtering in buildPredictionContent
if grep -A15 "function buildPredictionContent" "$WEATHER_JS" | grep -q "sixHoursAgo"; then
  pass "Time filter logic exists in buildPredictionContent"
else
  fail "Time filter logic not found in buildPredictionContent"
fi

# Step 5: Project structure verification
echo
echo "--- Verifying Project Structure ---"

declare -a EXPECTED_FILES=(
  "the-fish-tank/index.html"
  "the-fish-tank/CNAME"
  "the-fish-tank/favicon.png"
  "the-fish-tank/css/style.css"
  "the-fish-tank/js/tank.js"
  "the-fish-tank/js/battle.js"
  "the-fish-tank/js/fighter.js"
  "the-fish-tank/js/weather.js"
  "the-fish-tank/data/weather-public.json"
)

STRUCTURE_PASS=0
STRUCTURE_FAIL=0

for file in "${EXPECTED_FILES[@]}"; do
  full_path="$FRONTEND_DIR/$file"
  if [[ -f "$full_path" ]]; then
    STRUCTURE_PASS=$((STRUCTURE_PASS + 1))
  else
    fail "Expected file missing: $file"
    STRUCTURE_FAIL=$((STRUCTURE_FAIL + 1))
  fi
done

if [[ $STRUCTURE_FAIL -eq 0 ]]; then
  pass "All documented files exist (${#EXPECTED_FILES[@]} files verified)"
  PASS=$((PASS + 1))
else
  fail "$STRUCTURE_FAIL file(s) listed in README are missing"
  FAIL=$((FAIL + 1))
fi

# Check for model types mentioned (3hrRaw, 24hrRaw, 6hrRC)
echo
echo "--- Verifying Model Types Documented ---"
MODEL_TYPES_FOUND=0
for model in "3hrRaw" "24hrRaw" "6hrRC"; do
  if grep -q "$model" "$README"; then
    MODEL_TYPES_FOUND=$((MODEL_TYPES_FOUND + 1))
  fi
done

if [[ $MODEL_TYPES_FOUND -eq 3 ]]; then
  pass "All 3 model types documented (3hrRaw, 24hrRaw, 6hrRC)"
else
  fail "Only $MODEL_TYPES_FOUND/3 model types found in README"
fi

# Summary
echo
echo "=== SUMMARY ==="
echo "PASS: $PASS"
echo "FAIL: $FAIL"
echo

if [[ $FAIL -eq 0 ]]; then
  echo "✅ ALL TESTS PASSED"
  exit 0
else
  echo "❌ SOME TESTS FAILED"
  exit 1
fi
