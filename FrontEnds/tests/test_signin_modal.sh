#!/bin/bash
# Test: Sign-in modal structure verification
# Checks that the sign-in modal in index.html has all required elements.

PASS=0
FAIL=0

ROOT="$(dirname "$0")/../the-fish-tank"
INDEX="$ROOT/index.html"

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

# 1. Modal element with id=signin-modal exists
grep -q 'id="signin-modal"' "$INDEX" && check "Modal element #signin-modal exists" 1 || check "Modal element #signin-modal exists" 0

# 2. Username input with id=signin-username exists
grep -q 'id="signin-username"' "$INDEX" && check "Username input #signin-username exists" 1 || check "Username input #signin-username exists" 0

# 3. Password input with id=signin-password and type="password"
PASSWORD_LINE=$(grep 'id="signin-password"' "$INDEX")
if [ -n "$PASSWORD_LINE" ] && echo "$PASSWORD_LINE" | grep -q 'type="password"'; then
  check "Password input #signin-password with type=password exists" 1
else
  check "Password input #signin-password with type=password exists" 0
fi

# 4. Submit button inside signin-form
grep -q 'id="signin-form"' "$INDEX" && check "signin-form element exists" 1 || check "signin-form element exists" 0
grep -q 'type="submit"' "$INDEX" && check "Submit button exists in modal" 1 || check "Submit button exists in modal" 0

# 5. Close button with id=signin-close
grep -q 'id="signin-close"' "$INDEX" && check "Close button #signin-close exists" 1 || check "Close button #signin-close exists" 0

# 6. Fish emoji or aquatic visual element in modal
# Check for fish emoji (various encodings), .signin-fish class, or aquatic visual
if grep -q 'signin-fish\|🐟\|🐠\|🐡\|&#x1F420;\|&#128032\|&#128033\|&#128034\|🦈\|🐙\|🌊' "$INDEX"; then
  check "Modal has fish/aquatic visual element" 1
else
  check "Modal has fish/aquatic visual element" 0
fi

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
