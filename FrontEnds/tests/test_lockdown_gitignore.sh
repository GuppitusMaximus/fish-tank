#!/bin/bash
# Test: Verify .gitignore correctly ignores protected data files
# Plan: website-auth-lockdown

GITIGNORE="/Users/guppy/FishTank/FrontEnds/the-fish-tank/.gitignore"
PASS=0
FAIL=0

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

if [ ! -f "$GITIGNORE" ]; then
  echo "FAIL: .gitignore not found at $GITIGNORE"
  exit 1
fi

# Helper: check if a pattern in .gitignore would match a given path
# We use git check-ignore for accuracy (respects wildcards, negation, etc.)
FISH_TANK_DIR="/Users/guppy/FishTank/FrontEnds/the-fish-tank"

check_ignored() {
  local file="$1"
  git -C "$FISH_TANK_DIR" check-ignore -q "$file" 2>/dev/null
  return $?
}

check_not_ignored() {
  local file="$1"
  git -C "$FISH_TANK_DIR" check-ignore -q "$file" 2>/dev/null
  return $?
}

# 1. weather.json should be ignored
if check_ignored "data/weather.json"; then
  pass "data/weather.json is ignored"
else
  fail "data/weather.json is NOT ignored"
fi

# 2. frontend.db.gz should be ignored
if check_ignored "data/frontend.db.gz"; then
  pass "data/frontend.db.gz is ignored"
else
  fail "data/frontend.db.gz is NOT ignored"
fi

# 3. data-index.json should be ignored
if check_ignored "data/data-index.json"; then
  pass "data/data-index.json is ignored"
else
  fail "data/data-index.json is NOT ignored"
fi

# 4. weather-public.json should NOT be ignored
if check_not_ignored "data/weather-public.json"; then
  fail "data/weather-public.json IS ignored (it should be publicly accessible)"
else
  pass "data/weather-public.json is not ignored"
fi

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ $FAIL -eq 0 ] && exit 0 || exit 1
