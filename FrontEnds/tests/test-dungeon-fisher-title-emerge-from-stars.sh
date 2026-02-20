#!/usr/bin/env bash
# Test: Dungeon Fisher — Title Emerges From Stars
# Plan: qa-title-emerge-from-stars-dungeon-fisher
#
# Verifies depth layering, ADD blend mode, two-phase emergence tween,
# depth/blend switch between phases, water drips, button delay, and no regressions.

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

echo "=== Dungeon Fisher — Title Emerges From Stars ==="
echo "File: $TITLE_SCENE"
echo ""

echo "--- Check 1: Depth layering ---"
check "Background at depth 0"          "this.bg.setDepth(0)"
check "Dark overlay at depth 1"        "overlay.setDepth(1)"
check "Mist emitter at depth 2"        "this.mistEmitter.setDepth(2)"
check "Crystal emitter at depth 2"     "this.crystalEmitter.setDepth(2)"
check "Stars at depth 2"               ".setDepth(2)"
check "Title/buttons/version at depth 10 (post-emerge)" "setDepth(10)"

echo ""
echo "--- Check 2: Title starts behind overlay (depth 0) ---"
check "titleText initialised at depth 0" ".setDepth(0).setBlendMode"

echo ""
echo "--- Check 3: ADD blend mode phase ---"
check "titleText starts with ADD blend mode" ".setBlendMode('ADD')"

echo ""
echo "--- Check 4: Two-phase tween ---"
check "Phase 1 alpha target ~0.6"          "alpha: 0.6,"
check "Phase 1 scale grows to ~0.7x"      "scaleX: 0.7,"
check "Phase 1 duration ~2s"               "duration: 2000,"
check "Phase 2 alpha target 1"             "alpha: 1,"
check "Phase 2 scale finishes at 1"        "scaleX: 1,"
check "Phase 2 duration ~1.5s"             "duration: 1500,"

echo ""
echo "--- Check 5: Depth switch at break-through moment ---"
check "Depth set to 10 in phase 1 onComplete"  "titleText.setDepth(10);"
check "Blend switched to NORMAL before phase 2" "titleText.setBlendMode(Phaser.BlendModes.NORMAL);"

echo ""
echo "--- Check 6: Water drips in phase 2 onComplete ---"
check "dripEmitter created in nested onComplete" "this.dripEmitter = this.add.particles"
check "Drip positioned at titleText bounds"       "titleText.getBounds()"
check "Drip x spread uses bounds.left"            "bounds.left"
check "Drip x spread uses bounds.right"           "bounds.right"
check "Drip y starts at bounds.bottom"            "bounds.bottom"
check "Drip uses blue tint"                       "0x44aaff"
check "Drip has downward gravity"                 "gravityY:"

echo ""
echo "--- Check 7: Button delay >= 3500ms ---"
check "NEW GAME button delay is 3500ms" "delay: 3500"
check_not "Button does NOT use old 2500ms delay" "delay: 2500"

echo ""
echo "--- Check 8: No regressions ---"
check "Ken Burns zoom tween present"         "Sine.InOut"
check "Dark overlay rectangle present"       "0x000000, 0.4"
check "Rising mist particles present"        "particle_soft"
check "Twinkling stars present (repeat: -1)" "repeat: -1"
check "Crystal embers tint present"          "0x40ffcc"
check "_transitionTo cleans up dripEmitter"  "this.dripEmitter.destroy()"
check "_transitionTo cleans up mistEmitter"  "this.mistEmitter.destroy()"
check "_transitionTo cleans up crystalEmitter" "this.crystalEmitter.destroy()"

echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
exit 0
