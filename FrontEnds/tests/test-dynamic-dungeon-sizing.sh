#!/usr/bin/env bash
# QA test for qa-dynamic-dungeon-sizing
# Verifies that #dungeon uses flex-based sizing on desktop instead of fixed aspect-ratio

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CSS="$SCRIPT_DIR/../the-fish-tank/css/style.css"

pass=0
fail=0

check() {
    local desc="$1"
    local result="$2"
    if [ "$result" = "pass" ]; then
        echo "PASS: $desc"
        ((pass++))
    else
        echo "FAIL: $desc"
        ((fail++))
    fi
}

# 1. Desktop media query has height: auto for #dungeon
if grep -A 10 '@media (min-width: 601px)' "$CSS" | grep -q 'height: auto'; then
    check "Desktop @media (min-width: 601px) sets height: auto on #dungeon" pass
else
    check "Desktop @media (min-width: 601px) sets height: auto on #dungeon" fail
fi

# 2. Desktop media query has flex: 1 for #dungeon
if grep -A 10 '@media (min-width: 601px)' "$CSS" | grep -q 'flex: 1'; then
    check "Desktop @media (min-width: 601px) sets flex: 1 on #dungeon" pass
else
    check "Desktop @media (min-width: 601px) sets flex: 1 on #dungeon" fail
fi

# 3. Desktop media query has min-height: 0 for #dungeon
if grep -A 10 '@media (min-width: 601px)' "$CSS" | grep -q 'min-height: 0'; then
    check "Desktop @media (min-width: 601px) sets min-height: 0 on #dungeon" pass
else
    check "Desktop @media (min-width: 601px) sets min-height: 0 on #dungeon" fail
fi

# 4. No aspect-ratio in the desktop media query block for #dungeon
DESKTOP_BLOCK=$(awk '/@media \(min-width: 601px\)/,/^}/' "$CSS")
if echo "$DESKTOP_BLOCK" | grep -q 'aspect-ratio'; then
    check "No aspect-ratio property in desktop media query" fail
else
    check "No aspect-ratio property in desktop media query" pass
fi

# 5. No max-height in the desktop media query block
if echo "$DESKTOP_BLOCK" | grep -q 'max-height'; then
    check "No max-height property in desktop media query" fail
else
    check "No max-height property in desktop media query" pass
fi

# 6. Shared rule for #tank, #arena, #sky, #dungeon is intact (not split)
if grep -q '#tank, #arena, #sky, #dungeon' "$CSS"; then
    check "Shared rule #tank, #arena, #sky, #dungeon exists (not split)" pass
else
    check "Shared rule #tank, #arena, #sky, #dungeon exists (not split)" fail
fi

# 7. Mobile query still sets explicit height for #dungeon
MOBILE_BLOCK=$(awk '/@media \(max-width: 600px\)/,/^}/' "$CSS")
if echo "$MOBILE_BLOCK" | grep -q '#dungeon' && echo "$MOBILE_BLOCK" | grep -q 'height:'; then
    check "Mobile @media (max-width: 600px) still sets height on #dungeon" pass
else
    check "Mobile @media (max-width: 600px) still sets height on #dungeon" fail
fi

# 8. Body has display: flex
if grep -A 5 '^body {' "$CSS" | grep -q 'display: flex'; then
    check "Body has display: flex" pass
else
    check "Body has display: flex" fail
fi

# 9. Body has flex-direction: column
if grep -A 5 '^body {' "$CSS" | grep -q 'flex-direction: column'; then
    check "Body has flex-direction: column" pass
else
    check "Body has flex-direction: column" fail
fi

echo ""
echo "Results: $pass passed, $fail failed"

[ "$fail" -eq 0 ] && exit 0 || exit 1
