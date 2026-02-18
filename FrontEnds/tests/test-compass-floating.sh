#!/usr/bin/env bash
set -euo pipefail
ERRORS=0; PASS=0
check() {
    local desc="$1"; shift
    if "$@" >/dev/null 2>&1; then PASS=$((PASS+1)); else echo "FAIL: $desc"; ERRORS=$((ERRORS+1)); fi
}
ROOT="$(cd "$(dirname "$0")/../the-fish-tank" && pwd)"

# Keyframe exists
check "compass-float keyframe exists" grep -q '@keyframes compass-float' "$ROOT/css/style.css"

# Station dots have animation applied in CSS
check ".compass-station has compass-float animation" bash -c "grep -A5 '\.compass-station {' '$ROOT/css/style.css' | grep -q 'compass-float'"

# Temp labels have animation applied in CSS
check ".compass-temp-label has compass-float animation" bash -c "grep -A5 '\.compass-temp-label' '$ROOT/css/style.css' | grep -q 'compass-float'"

# JS sets random delay and duration on station dots
check "JS sets animationDelay on station dots" grep -q 'animationDelay' "$ROOT/js/weather.js"
check "JS sets animationDuration on station dots" grep -q 'animationDuration' "$ROOT/js/weather.js"

echo ""; echo "Results: $PASS passed, $ERRORS failed"
[ "$ERRORS" -eq 0 ] && echo "ALL CHECKS PASSED" || exit 1
