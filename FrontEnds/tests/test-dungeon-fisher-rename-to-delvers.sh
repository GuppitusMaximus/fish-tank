#!/bin/bash
# Test: Dungeon Angler renamed to Dungeon Delvers in the-fish-tank
# Plan: qa-rename-fish-tank-dungeon-delvers
# Verifies that all "Dungeon Angler" references are updated to "Dungeon Delvers"

FISH_TANK_DIR="$(dirname "$0")/../the-fish-tank"
PASS=0
FAIL=0

check() {
  local desc="$1"
  local result="$2"
  if [ "$result" = "0" ]; then
    echo "PASS: $desc"
    PASS=$((PASS+1))
  else
    echo "FAIL: $desc"
    FAIL=$((FAIL+1))
  fi
}

# 1. No "Angler" references remain (excluding "wrangler" which is unrelated)
angler_count=$(grep -ri "angler" "$FISH_TANK_DIR" --include="*.html" --include="*.js" --include="*.css" | grep -iv "wrangler" | wc -l | tr -d ' ')
check "No 'Angler' references remain in the-fish-tank (excluding wrangler CLI)" "$([ "$angler_count" = "0" ] && echo 0 || echo 1)"

# 2. Nav link says "Dungeon Delvers"
nav_match=$(grep -c 'data-view="dungeon">Dungeon Delvers' "$FISH_TANK_DIR/index.html")
check "index.html nav link says 'Dungeon Delvers'" "$([ "$nav_match" -ge 1 ] && echo 0 || echo 1)"

# 3. View config title says "Dungeon Delvers"
title_match=$(grep -c "title: 'Dungeon Delvers'" "$FISH_TANK_DIR/index.html")
check "index.html view config title says 'Dungeon Delvers'" "$([ "$title_match" -ge 1 ] && echo 0 || echo 1)"

# 4. iframe title in dungeon-fisher.js says "Dungeon Delvers"
iframe_match=$(grep -c "'title', 'Dungeon Delvers'" "$FISH_TANK_DIR/js/dungeon-fisher.js")
check "dungeon-fisher.js iframe title says 'Dungeon Delvers'" "$([ "$iframe_match" -ge 1 ] && echo 0 || echo 1)"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" = "0" ] && exit 0 || exit 1
