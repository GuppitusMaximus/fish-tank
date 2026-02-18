#!/usr/bin/env bash
set -euo pipefail
ERRORS=0; PASS=0
check() { if "$@" >/dev/null 2>&1; then PASS=$((PASS+1)); else echo "FAIL: $*"; ERRORS=$((ERRORS+1)); fi; }
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
JS="$ROOT/the-fish-tank/js/weather.js"
CSS="$ROOT/the-fish-tank/css/style.css"

# Toggle button
check grep -q 'compass-toggle' "$JS"
check grep -q 'compass-header' "$JS"
check grep -q 'aria-label' "$JS"

# List rendering
check grep -q 'compass-list' "$JS"
check grep -q 'compass-list-item\|list-item' "$JS"
check grep -q 'list-direction\|bearingToCardinal' "$JS"
check grep -q 'list-distance\|distance_mi' "$JS"

# localStorage persistence
check grep -q 'compass-view-mode' "$JS"

# CSS classes
check grep -q 'compass-header' "$CSS"
check grep -q 'compass-toggle' "$CSS"
check grep -q 'compass-list-item' "$CSS"
check grep -q 'list-temp' "$CSS"
check grep -q 'list-direction' "$CSS"

echo ""; echo "Results: $PASS passed, $ERRORS failed"
[ "$ERRORS" -eq 0 ] && echo "ALL CHECKS PASSED" || exit 1
