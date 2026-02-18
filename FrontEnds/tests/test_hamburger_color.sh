#!/bin/bash
# Test: Hamburger icon color inheritance
# Verifies that .account-toggle has color: inherit so the icon
# inherits the page's light text color instead of browser default black.

CSS="the-fish-tank/css/auth.css"
PASS=0
FAIL=0

check() {
  local desc="$1"
  local pattern="$2"
  if grep -qE "$pattern" "$CSS"; then
    echo "PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $desc"
    FAIL=$((FAIL + 1))
  fi
}

# .account-toggle must have color: inherit
check ".account-toggle has color: inherit" "color: inherit"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
