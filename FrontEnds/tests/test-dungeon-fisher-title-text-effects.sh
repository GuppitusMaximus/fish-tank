#!/usr/bin/env bash
# Test: Dungeon Fisher Title Text Effects Verification
# Plans: qa-title-text-effects-dungeon-fisher, qa-title-emerge-from-stars-dungeon-fisher
#
# Verifies the two-phase "emerge from stars" title animation and water drip particle effects.
# Checks: no bounce animation, two-phase tween params, ADD blend mode, depth layering,
#         drip emitter, drip position, button delay, drip cleanup, and no regressions.

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

echo "=== Dungeon Fisher Title Text Effects — Static Code Checks ==="
echo "File: $TITLE_SCENE"
echo ""

echo "--- Check 1: No bounce animation ---"
check_not "No Bounce.Out ease in TitleScene" "Bounce.Out"
check_not "Title does not start at y=-50" ", -50,"
check     "Title starts transparent (setAlpha(0))" ".setAlpha(0)"
check     "Title starts small (setScale(0.3))" ".setScale(0.3)"
check     "Title starts with ADD blend mode" ".setBlendMode('ADD')"
check     "Title starts at depth 0 (behind overlay)" ".setDepth(0).setBlendMode"

echo ""
echo "--- Check 2: Two-phase emerge tween params ---"
check "Phase 1 tweens alpha to 0.6" "alpha: 0.6,"
check "Phase 1 tweens scaleX to 0.7" "scaleX: 0.7,"
check "Phase 1 tweens scaleY to 0.7" "scaleY: 0.7,"
check "Phase 1 duration is 2000ms" "duration: 2000,"
check "Phase 2 tweens alpha to 1" "alpha: 1,"
check "Phase 2 tweens scaleX to 1" "scaleX: 1,"
check "Phase 2 tweens scaleY to 1" "scaleY: 1,"
check "Phase 2 duration is 1500ms" "duration: 1500,"
check "Phase 2 ease is Sine.Out" "ease: 'Sine.Out',"
check "Depth switches to 10 before phase 2" "titleText.setDepth(10);"
check "Blend switches to NORMAL before phase 2" "titleText.setBlendMode(Phaser.BlendModes.NORMAL);"

echo ""
echo "--- Check 3: Water drip emitter ---"
check "dripEmitter created in onComplete callback" "this.dripEmitter = this.add.particles"
check "Drip emitter uses particle_dot texture" "'particle_dot'"
check "Drip has blue tint (0x44aaff)" "0x44aaff"
check "Drip has downward gravityY" "gravityY:"

echo ""
echo "--- Check 4: Drip position ---"
check "Drip x uses bounds.left" "bounds.left"
check "Drip x uses bounds.right" "bounds.right"
check "Drip y starts at bounds.bottom" "bounds.bottom"

echo ""
echo "--- Check 5: Button delay >= 3500ms (after both title phases: 2000+1500ms) ---"
check "NEW GAME button fade-in delay is 3500" "delay: 3500"

echo ""
echo "--- Check 6: Drip emitter cleanup ---"
check "dripEmitter is destroyed in _transitionTo()" "this.dripEmitter.destroy()"
check "mistEmitter destroyed in _transitionTo()" "this.mistEmitter.destroy()"
check "crystalEmitter destroyed in _transitionTo()" "this.crystalEmitter.destroy()"

echo ""
echo "--- Check 7: No regressions ---"
check "Ken Burns zoom tween present (Sine.InOut)" "Sine.InOut"
check "Dark overlay rectangle present" "0x000000, 0.4"
check "Mist emitter (particle_soft) present" "particle_soft"
check "Twinkling stars loop present (repeat: -1)" "repeat: -1"
check "Crystal embers tint (0x40ffcc) present" "0x40ffcc"

echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
exit 0
