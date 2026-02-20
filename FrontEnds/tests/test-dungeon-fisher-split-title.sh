#!/usr/bin/env bash
# Test: Dungeon Fisher Split Title Verification
# Plan: qa-dungeon-fisher-split-title
#
# Verifies that TitleScene.js uses the two-line 'DUNGEON\nFISHER' title
# with correct styling, animation, and no leftover single-line references.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TITLE_SCENE="$SCRIPT_DIR/../dungeon-fisher/src/scenes/TitleScene.js"

PASS=0
FAIL=0

check() {
    local description="$1"
    local pattern="$2"
    if grep -qF "$pattern" "$TITLE_SCENE" 2>/dev/null; then
        echo "PASS: $description"
        PASS=$((PASS + 1))
    else
        echo "FAIL: $description"
        FAIL=$((FAIL + 1))
    fi
}

check_not() {
    local description="$1"
    local pattern="$2"
    if ! grep -qF "$pattern" "$TITLE_SCENE" 2>/dev/null; then
        echo "PASS: $description"
        PASS=$((PASS + 1))
    else
        echo "FAIL: $description"
        FAIL=$((FAIL + 1))
    fi
}

echo "=== Dungeon Fisher Split Title — Static Code Checks ==="
echo "File: $TITLE_SCENE"
echo ""

# Step 1: Title uses 'DUNGEON\nFISHER' with align: 'center'
check "Title text uses two-line DUNGEON\\nFISHER" 'DUNGEON\nFISHER'
check "Title text has align: 'center'" "align: 'center'"

# Step 2: Title uses TEXT_STYLES.TITLE_LARGE
check "Title uses TEXT_STYLES.TITLE_LARGE" "TEXT_STYLES.TITLE_LARGE"

# Step 3: Bounce-in tween drops from y=-50 with Bounce.Out
check "Title text starts at y=-50 (constructor arg)" ", -50,"
check "Bounce-in tween uses Bounce.Out ease" "Bounce.Out"

# Step 4: Pulse glow tween runs after bounce completes
check "Bounce-in has onComplete callback" "onComplete"
check "Pulse glow alpha starts at 0.85" "0.85"
check "Pulse glow is looping (repeat: -1)" "repeat: -1"

# Step 5: No old single-line 'DUNGEON FISHER' string
check_not "No old single-line 'DUNGEON FISHER' string" "'DUNGEON FISHER'"

echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
exit 0
