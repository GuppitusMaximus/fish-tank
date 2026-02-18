#!/bin/bash
# Test: Hamburger menu icon visibility
# Verifies that the account toggle opacity was updated from the original low values.
# Expected: rest=0.7, hover=1

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

# .account-toggle span block must contain opacity: 0.7
# We verify by checking that 0.7 appears after the .account-toggle span selector
# and before the next rule block.
check ".account-toggle span opacity is 0.7" "opacity: 0\.7"

# .account-toggle:hover span must set opacity: 1
# The hover rule must not reduce it below 1.
check ".account-toggle:hover span opacity is 1" "\.account-toggle:hover span"

# Confirm old low-visibility value (0.4) is NOT present for the toggle span
if grep -q "opacity: 0\.4" "$CSS"; then
  echo "FAIL: legacy opacity 0.4 still present in auth.css"
  FAIL=$((FAIL + 1))
else
  echo "PASS: legacy opacity 0.4 not present"
  PASS=$((PASS + 1))
fi

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
