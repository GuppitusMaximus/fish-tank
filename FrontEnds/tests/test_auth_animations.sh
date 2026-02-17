#!/bin/bash
# Test: CSS animations verification
# Checks that auth.css defines required keyframe animations, modal overlay, and aquatic colors.

PASS=0
FAIL=0

ROOT="$(dirname "$0")/../the-fish-tank"
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

# 1. Bubble animation keyframe
grep -q '@keyframes bubble-rise' "$AUTH_CSS" && check "auth.css defines @keyframes bubble-rise" 1 || check "auth.css defines @keyframes bubble-rise" 0

# 2. Success animation keyframe
grep -q '@keyframes auth-success-flash' "$AUTH_CSS" && check "auth.css defines @keyframes auth-success-flash" 1 || check "auth.css defines @keyframes auth-success-flash" 0

# 3. Failure/shake animation keyframe
grep -q '@keyframes auth-shake' "$AUTH_CSS" && check "auth.css defines @keyframes auth-shake" 1 || check "auth.css defines @keyframes auth-shake" 0

# 4. Modal overlay has position: fixed
if grep -A10 '#signin-modal' "$AUTH_CSS" | grep -q 'position: fixed\|position:fixed'; then
  check "Modal #signin-modal has position: fixed" 1
else
  check "Modal #signin-modal has position: fixed" 0
fi

# 5. Aquatic color values present
if grep -qE '#0a2a4a|#0d3b66|#7fdbff|#1a8a5c|rgba\(0, 30, 60' "$AUTH_CSS"; then
  check "auth.css uses ocean/aquatic color values" 1
else
  check "auth.css uses ocean/aquatic color values" 0
fi

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
