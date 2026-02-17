#!/bin/bash
# Test: Verify protected data files are removed from git tracking
# Plan: website-auth-lockdown

REPO_ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
DATA_PATH="FrontEnds/the-fish-tank/data"
PASS=0
FAIL=0

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

# 1. weather.json should NOT be tracked
result=$(git -C "$REPO_ROOT" ls-files "$DATA_PATH/weather.json")
if [ -z "$result" ]; then
  pass "weather.json is not tracked by git"
else
  fail "weather.json IS tracked by git (found: $result)"
fi

# 2. frontend.db.gz should NOT be tracked
result=$(git -C "$REPO_ROOT" ls-files "$DATA_PATH/frontend.db.gz")
if [ -z "$result" ]; then
  pass "frontend.db.gz is not tracked by git"
else
  fail "frontend.db.gz IS tracked by git (found: $result)"
fi

# 3. data-index.json should NOT be tracked
result=$(git -C "$REPO_ROOT" ls-files "$DATA_PATH/data-index.json")
if [ -z "$result" ]; then
  pass "data-index.json is not tracked by git"
else
  fail "data-index.json IS tracked by git (found: $result)"
fi

# 4. weather-public.json: tracked OR not yet created (both acceptable)
result=$(git -C "$REPO_ROOT" ls-files "$DATA_PATH/weather-public.json")
if [ -n "$result" ]; then
  pass "weather-public.json is tracked by git"
else
  # Check if it exists locally but just not tracked yet
  if [ -f "$REPO_ROOT/$DATA_PATH/weather-public.json" ]; then
    fail "weather-public.json exists locally but is NOT tracked by git"
  else
    pass "weather-public.json is not yet created (acceptable — backend workflow creates it on next run)"
  fi
fi

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ $FAIL -eq 0 ] && exit 0 || exit 1
