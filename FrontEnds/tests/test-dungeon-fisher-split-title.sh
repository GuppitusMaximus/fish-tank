#!/usr/bin/env bash
# Test: Dungeon Fisher Split Title Verification
# Plan: qa-dungeon-fisher-split-title (updated by qa-rename-dungeon-angler)
#
# Verifies that TitleScene.js uses the two-line 'DUNGEON\nANGLER' title
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

# Step 1: Title uses 'DUNGEON\nANGLER' with align: 'center'
check "Title text uses two-line DUNGEON\\nANGLER" 'DUNGEON\nANGLER'
check "Title text has align: 'center'" "align: 'center'"

# Step 2: Title uses TEXT_STYLES.TITLE_LARGE
check "Title uses TEXT_STYLES.TITLE_LARGE" "TEXT_STYLES.TITLE_LARGE"

# Step 3: Fade-into-focus tween (replaced bounce-in in title-text-effects-dungeon-fisher plan)
check "Title text starts invisible (setAlpha(0))" ".setAlpha(0)"
check "Fade-in tween uses Sine.Out ease" "Sine.Out"

# Step 4: Pulse glow tween runs after bounce completes
check "Bounce-in has onComplete callback" "onComplete"
check "Gold shimmer uses addCounter" "addCounter"
check "Pulse glow is looping (repeat: -1)" "repeat: -1"

# Step 5: No old single-line 'DUNGEON FISHER' string
check_not "No old single-line 'DUNGEON FISHER' string" "'DUNGEON FISHER'"

echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
exit 0
