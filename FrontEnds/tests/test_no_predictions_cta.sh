#!/usr/bin/env bash
# Test: Verify "View full predictions" CTA has been removed
# Plan: qa-remove-predictions-cta
#
# Verifies:
# 1. No home-cta or cta-link HTML in weather.js
# 2. No "View full predictions" text in weather.js
# 3. renderHomeSummary still exists in weather.js
# 4. No .home-cta rule in style.css
# 5. No .cta-link rule in style.css

PASS="\033[32m✓ PASS\033[0m"
FAIL="\033[31m✗ FAIL\033[0m"

WEATHER_JS="$(dirname "$0")/../the-fish-tank/js/weather.js"
STYLE_CSS="$(dirname "$0")/../the-fish-tank/css/style.css"

failures=0

check() {
  local name="$1"
  local condition="$2"  # 0 = true/pass, 1 = false/fail
  local details="$3"
  if [ "$condition" -eq 0 ]; then
    echo -e "${PASS} ${name}"
  else
    echo -e "${FAIL} ${name}"
    [ -n "$details" ] && echo "  → ${details}"
    failures=$((failures + 1))
  fi
}

echo ""
echo "=== QA: Remove Predictions CTA ==="
echo ""

echo "Step 1: Verify CTA removed from weather.js"
echo ""

# Check 1: No home-cta in weather.js
if grep -q "home-cta" "$WEATHER_JS"; then
  check "weather.js does NOT contain 'home-cta'" 1 "Found 'home-cta' in weather.js — CTA not fully removed"
else
  check "weather.js does NOT contain 'home-cta'" 0
fi

# Check 2: No cta-link in weather.js
if grep -q "cta-link" "$WEATHER_JS"; then
  check "weather.js does NOT contain 'cta-link'" 1 "Found 'cta-link' in weather.js — CTA not fully removed"
else
  check "weather.js does NOT contain 'cta-link'" 0
fi

# Check 3: No "View full predictions" text in weather.js
if grep -q "View full predictions" "$WEATHER_JS"; then
  check "weather.js does NOT contain 'View full predictions'" 1 "Found 'View full predictions' in weather.js — CTA text not removed"
else
  check "weather.js does NOT contain 'View full predictions'" 0
fi

# Check 4: renderHomeSummary still exists
if grep -q "renderHomeSummary" "$WEATHER_JS"; then
  check "weather.js still contains 'renderHomeSummary'" 0
else
  check "weather.js still contains 'renderHomeSummary'" 1 "renderHomeSummary was accidentally removed from weather.js"
fi

echo ""
echo "Step 2: Verify CTA CSS removed from style.css"
echo ""

# Check 5: No .home-cta rule in style.css
if grep -q "\.home-cta" "$STYLE_CSS"; then
  check "style.css does NOT contain '.home-cta'" 1 "Found '.home-cta' in style.css — dead CSS not cleaned up"
else
  check "style.css does NOT contain '.home-cta'" 0
fi

# Check 6: No .cta-link rule in style.css
if grep -q "\.cta-link" "$STYLE_CSS"; then
  check "style.css does NOT contain '.cta-link'" 1 "Found '.cta-link' in style.css — dead CSS not cleaned up"
else
  check "style.css does NOT contain '.cta-link'" 0
fi

echo ""
echo "=== Test Summary ==="
echo ""

if [ "$failures" -eq 0 ]; then
  echo -e "${PASS} All tests passed — CTA is fully removed."
  echo ""
  exit 0
else
  echo -e "${FAIL} ${failures} test(s) failed."
  echo ""
  exit 1
fi
