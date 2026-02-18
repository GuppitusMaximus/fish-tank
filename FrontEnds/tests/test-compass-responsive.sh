#!/usr/bin/env bash
set -euo pipefail
ERRORS=0; PASS=0
check() { if "$@" >/dev/null 2>&1; then PASS=$((PASS+1)); else echo "FAIL: $*"; ERRORS=$((ERRORS+1)); fi; }
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CSS="$ROOT/the-fish-tank/css/style.css"

# Card is square
check grep -q 'aspect-ratio.*1' "$CSS"

# SVG is responsive (no fixed small max-width)
! grep -A3 '\.compass-svg' "$CSS" | grep -q 'max-width: 320px' && PASS=$((PASS+1)) || { echo "FAIL: compass-svg still has 320px max-width"; ERRORS=$((ERRORS+1)); }

# Container uses responsive width
check grep -q '90vw\|100%' "$CSS"

echo ""; echo "Results: $PASS passed, $ERRORS failed"
[ "$ERRORS" -eq 0 ] && echo "ALL CHECKS PASSED" || exit 1
