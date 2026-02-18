#!/usr/bin/env bash
set -euo pipefail
ERRORS=0; PASS=0
check() { if "$@" >/dev/null 2>&1; then PASS=$((PASS+1)); else echo "FAIL: $*"; ERRORS=$((ERRORS+1)); fi; }
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
JS="$ROOT/the-fish-tank/js/weather.js"
CSS="$ROOT/the-fish-tank/css/style.css"

# New structure exists
check grep -q 'compass-layout' "$JS"
check grep -q 'compass-center' "$JS"
check grep -q 'compass-satellite' "$JS"
check grep -q 'compass-stack\|groupStations\|stack-badge' "$JS"
check grep -q 'aria-label' "$JS"
check grep -q 'tabindex' "$JS"
check grep -q 'home_location' "$JS"

# CSS classes
check grep -q 'compass-layout' "$CSS"
check grep -q 'compass-center' "$CSS"
check grep -q 'compass-satellite' "$CSS"
check grep -q 'compass-stack' "$CSS"
check grep -q 'stack-badge' "$CSS"
check grep -q 'prefers-reduced-motion' "$CSS"
check grep -q 'satellite-temp' "$CSS"
check grep -q 'satellite-distance' "$CSS"

# Old SVG dot styles removed
! grep -q '\.compass-station[^-]' "$CSS" && PASS=$((PASS+1)) || { echo "FAIL: old .compass-station still in CSS"; ERRORS=$((ERRORS+1)); }

# Distance label in JS
check grep -q 'distance_mi' "$JS"

echo ""; echo "Results: $PASS passed, $ERRORS failed"
[ "$ERRORS" -eq 0 ] && echo "ALL CHECKS PASSED" || exit 1
