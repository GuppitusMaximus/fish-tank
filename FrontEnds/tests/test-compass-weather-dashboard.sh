#!/usr/bin/env bash
set -euo pipefail
ERRORS=0; PASS=0
check() { if "$@" >/dev/null 2>&1; then PASS=$((PASS+1)); else echo "FAIL: $*"; ERRORS=$((ERRORS+1)); fi; }
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
JS="$ROOT/the-fish-tank/js/weather.js"
CSS="$ROOT/the-fish-tank/css/style.css"

# Dashboard compass container in renderV2
check grep -q 'dash-compass-container' "$JS"

# loadDashCompass function
check grep -q 'loadDashCompass' "$JS"

# renderCompass accepts target parameter
check grep -q 'targetId\|target_id\|containerId\|targetEl' "$JS"

# Fetches weather-public.json as fallback
check grep -q 'weather-public.json' "$JS"

# CSS for dashboard compass
check grep -q 'dash-compass-container' "$CSS"

echo ""; echo "Results: $PASS passed, $ERRORS failed"
[ "$ERRORS" -eq 0 ] && echo "ALL CHECKS PASSED" || exit 1
