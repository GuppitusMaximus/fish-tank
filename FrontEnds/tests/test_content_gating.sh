#!/bin/bash
# Test: Content gating verification
# Checks that auth-gated and auth-public-only elements are correctly marked in index.html,
# and that auth-hidden CSS rule exists in auth.css.

PASS=0
FAIL=0

ROOT="$(dirname "$0")/../the-fish-tank"
INDEX="$ROOT/index.html"
AUTH_CSS="$ROOT/css/auth.css"

check() {
  local desc="$1"
  local result="$2"
  if [ "$result" = "1" ]; then
    echo "PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $desc"
    FAIL=$((FAIL + 1))
  fi
}

# 1. Weather nav link has both auth-gated and auth-hidden classes
WEATHER_NAV=$(grep 'data-view="weather"' "$INDEX")
if echo "$WEATHER_NAV" | grep -q 'auth-gated' && echo "$WEATHER_NAV" | grep -q 'auth-hidden'; then
  check "Weather nav link has auth-gated and auth-hidden classes" 1
else
  check "Weather nav link has auth-gated and auth-hidden classes" 0
fi

# 2. Sign-in link exists with id=signin-link and auth-public-only class
SIGNIN=$(grep 'id="signin-link"' "$INDEX")
if [ -n "$SIGNIN" ] && echo "$SIGNIN" | grep -q 'auth-public-only'; then
  check "signin-link element has auth-public-only class" 1
else
  check "signin-link element has auth-public-only class" 0
fi

# 3. Sign-out element exists with id=signout-link and auth-gated class
SIGNOUT=$(grep 'id="signout-link"' "$INDEX")
if [ -n "$SIGNOUT" ] && echo "$SIGNOUT" | grep -q 'auth-gated'; then
  check "signout-link element has auth-gated class" 1
else
  check "signout-link element has auth-gated class" 0
fi

# 4. auth-hidden CSS rule defines display: none
if grep -q '\.auth-hidden' "$AUTH_CSS" && grep -A2 '\.auth-hidden' "$AUTH_CSS" | grep -q 'display.*none'; then
  check "auth.css defines .auth-hidden with display: none" 1
else
  check "auth.css defines .auth-hidden with display: none" 0
fi

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
