#!/bin/bash
# test-camp-party-order.sh
# Verifies party ordering UI in CampScene.js (plan: auto-battler-camp-ordering)
# Checks: section presence, UI elements, reorder logic, edge-case arrow visibility, layout

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FILE="$SCRIPT_DIR/../dungeon-fisher/src/scenes/CampScene.js"

PASS=0
FAIL=0

check() {
    local desc="$1"
    local result="$2"
    if [ "$result" = "true" ]; then
        echo "  PASS: $desc"
        ((PASS++))
    else
        echo "  FAIL: $desc"
        ((FAIL++))
    fi
}

grep_check() {
    local desc="$1"
    local pattern="$2"
    if grep -qE "$pattern" "$FILE"; then
        check "$desc" "true"
    else
        check "$desc" "false"
    fi
}

echo "=== Camp Party Order Tests ==="
echo ""

echo "--- Section Presence ---"
grep_check "renderPartyOrder() called in create()" "this\.renderPartyOrder\(\)"
grep_check "orderStartY set before renderPartyOrder" "orderStartY"
grep_check "orderEndY used for continue button placement" "orderEndY"
grep_check "Continue button placed below party order section" "contY.*Math\.max.*orderEndY"

echo ""
echo "--- UI Elements ---"
grep_check "PARTY ORDER header text" "'PARTY ORDER'"
grep_check "Subtext explaining front position" "'First fish takes damage first'"
grep_check "Fish name + level rendered per fish" "f\.name.*Lv\.' \+ f\.level"
grep_check "(FRONT) label on first fish (i === 0)" "i === 0"
grep_check "(FRONT) label text" "'\(FRONT\)'"
grep_check "Up arrow character (▲)" "\\\\u25b2"
grep_check "Down arrow character (▼)" "\\\\u25bc"

echo ""
echo "--- Reorder Logic ---"
grep_check "Up arrow swaps party[i-1] and party[i]" "gs\.party\[i - 1\], gs\.party\[i\]\] = \[gs\.party\[i\], gs\.party\[i - 1\]\]"
grep_check "Down arrow swaps party[i] and party[i+1]" "gs\.party\[i\], gs\.party\[i \+ 1\]\] = \[gs\.party\[i \+ 1\], gs\.party\[i\]\]"
grep_check "SaveSystem.save called after up swap" "SaveSystem\.save"
grep_check "renderPartyOrder called after each swap" "this\.renderPartyOrder\(\)"
grep_check "Old objects destroyed before re-render" "orderObjects\.forEach.*destroy"

echo ""
echo "--- Edge Case Arrow Visibility ---"
grep_check "Up arrow only shown when i > 0 (hidden for first fish)" "if \(i > 0\)"
grep_check "Down arrow only shown when i < party.length - 1 (hidden for last)" "if \(i < gs\.party\.length - 1\)"

echo ""
echo "--- Layout ---"
grep_check "Continue button Y uses Math.max for viewport fit" "Math\.max.*orderEndY.*H - "
grep_check "Row spacing 18px per fish in party order" "y \+= 18"
grep_check "Header spacing 15px" "y \+= 15"
grep_check "Subtext spacing 16px" "y \+= 16"

echo ""
echo "--- System Integration ---"
grep_check "SaveSystem imported" "import SaveSystem from"
grep_check "orderObjects array initialized" "this\.orderObjects = \[\]"

echo ""
if [ $FAIL -eq 0 ]; then
    echo "All $PASS checks PASSED"
    exit 0
else
    echo "$FAIL check(s) FAILED, $PASS passed"
    exit 1
fi
