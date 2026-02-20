#!/usr/bin/env bash
# Test: Dungeon Fisher Title Text Effects Verification
# Plan: qa-title-text-effects-dungeon-fisher
#
# Verifies fade-into-focus title animation and water drip particle effects.
# Checks: no bounce animation, fade-in tween params, drip emitter, drip position,
#         button delay, drip cleanup, and no regressions.

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
check     "Title starts oversized (setScale(1.4))" ".setScale(1.4)"

echo ""
echo "--- Check 2: Fade-in tween params ---"
check "Fade-in tweens alpha to 1" "alpha: 1,"
check "Fade-in tweens scaleX to 1" "scaleX: 1,"
check "Fade-in tweens scaleY to 1" "scaleY: 1,"
check "Fade-in duration is 2500ms" "duration: 2500,"
check "Fade-in ease is Sine.Out" "ease: 'Sine.Out',"

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
echo "--- Check 5: Button delay >= 2500ms ---"
check "NEW GAME button fade-in delay is 2500" "delay: 2500"

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
