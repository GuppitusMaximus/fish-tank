#!/bin/bash
# Test: Auth setup verification
# Checks that required auth files exist, are linked in index.html, and load in correct order.

PASS=0
FAIL=0

ROOT="$(dirname "$0")/../the-fish-tank"

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

# 1. auth-config.js exists
[ -f "$ROOT/js/auth-config.js" ] && check "auth-config.js exists" 1 || check "auth-config.js exists" 0

# 2. auth.js exists
[ -f "$ROOT/js/auth.js" ] && check "auth.js exists" 1 || check "auth.js exists" 0

# 3. css/auth.css exists
[ -f "$ROOT/css/auth.css" ] && check "css/auth.css exists" 1 || check "css/auth.css exists" 0

# 4. auth.css is linked in index.html
grep -q 'href="css/auth.css"' "$ROOT/index.html" && check "auth.css linked in index.html" 1 || check "auth.css linked in index.html" 0

# 5. Script load order: auth-config.js before auth.js
LINE_CONFIG=$(grep -n 'auth-config.js' "$ROOT/index.html" | head -1 | cut -d: -f1)
LINE_AUTH=$(grep -n '"js/auth.js"' "$ROOT/index.html" | head -1 | cut -d: -f1)
if [ -n "$LINE_CONFIG" ] && [ -n "$LINE_AUTH" ] && [ "$LINE_CONFIG" -lt "$LINE_AUTH" ]; then
  check "auth-config.js loaded before auth.js" 1
else
  check "auth-config.js loaded before auth.js" 0
fi

# 6. Script load order: auth.js before weather.js
LINE_WEATHER=$(grep -n '"js/weather.js"' "$ROOT/index.html" | head -1 | cut -d: -f1)
if [ -n "$LINE_AUTH" ] && [ -n "$LINE_WEATHER" ] && [ "$LINE_AUTH" -lt "$LINE_WEATHER" ]; then
  check "auth.js loaded before weather.js" 1
else
  check "auth.js loaded before weather.js" 0
fi

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
