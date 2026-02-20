#!/usr/bin/env bash
# QA test for qa-fix-dungeon-sizing-v3
# Verifies that #dungeon uses the shared viewport-height rule (no broken desktop override)

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

# 1. No desktop @media (min-width: 601px) block targeting #dungeon
if grep -q '@media (min-width: 601px)' "$CSS"; then
    check "No @media (min-width: 601px) block exists (was removed)" fail
else
    check "No @media (min-width: 601px) block exists (was removed)" pass
fi

# 2. Shared rule for all game containers exists
if grep -q '#tank, #arena, #sky, #dungeon' "$CSS"; then
    check "Shared rule #tank, #arena, #sky, #dungeon exists" pass
else
    check "Shared rule #tank, #arena, #sky, #dungeon exists" fail
fi

# 3. Shared rule sets width: 94vw
SHARED_BLOCK=$(awk '/#tank, #arena, #sky, #dungeon \{/,/^}/' "$CSS" | head -20)
if echo "$SHARED_BLOCK" | grep -q 'width: 94vw'; then
    check "Shared rule sets width: 94vw" pass
else
    check "Shared rule sets width: 94vw" fail
fi

# 4. Shared rule sets max-width: 1200px
if echo "$SHARED_BLOCK" | grep -q 'max-width: 1200px'; then
    check "Shared rule sets max-width: 1200px" pass
else
    check "Shared rule sets max-width: 1200px" fail
fi

# 5. Shared rule sets height: calc(100vh - 6rem)
if echo "$SHARED_BLOCK" | grep -q 'height: calc(100vh - 6rem)'; then
    check "Shared rule sets height: calc(100vh - 6rem)" pass
else
    check "Shared rule sets height: calc(100vh - 6rem)" fail
fi

# Extract dungeon-specific block for checks 6 and 7
DUNGEON_RULES=$(grep -A 5 '^#dungeon {' "$CSS")

# 6. No aspect-ratio in the dungeon-specific block
if echo "$DUNGEON_RULES" | grep -q 'aspect-ratio'; then
    check "No aspect-ratio property in #dungeon block" fail
else
    check "No aspect-ratio property in #dungeon block" pass
fi

# 7. No flex: 1 or min-height: 0 applied to #dungeon
if echo "$DUNGEON_RULES" | grep -qE 'flex: 1|min-height: 0'; then
    check "No flex: 1 or min-height: 0 on #dungeon block" fail
else
    check "No flex: 1 or min-height: 0 on #dungeon block" pass
fi

# 8. Mobile media query still sets height: calc(100vh - 5rem) for game containers
MOBILE_BLOCK=$(awk '/@media \(max-width: 600px\)/,/^}/' "$CSS")
if echo "$MOBILE_BLOCK" | grep -q 'height: calc(100vh - 5rem)'; then
    check "Mobile @media (max-width: 600px) sets height: calc(100vh - 5rem)" pass
else
    check "Mobile @media (max-width: 600px) sets height: calc(100vh - 5rem)" fail
fi

echo ""
echo "Results: $pass passed, $fail failed"

[ "$fail" -eq 0 ] && exit 0 || exit 1
