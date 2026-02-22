#!/usr/bin/env bash
# Test: Dungeon Fisher — Restyle Title Font and Remove Drip Effect
# Plan: qa-restyle-title-font
#
# Verifies MedievalSharp font is used for the title, the Google Fonts link is updated,
# the drip emitter was removed, and the warm amber shimmer is intact.
# VERSION is confirmed at 1.7.6.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TITLE_SCENE="$SCRIPT_DIR/../dungeon-fisher/src/scenes/TitleScene.js"
INDEX_HTML="$SCRIPT_DIR/../dungeon-fisher/index.html"
VERSION_JS="$SCRIPT_DIR/../dungeon-fisher/src/version.js"

PASS=0
FAIL=0

check() {
    local description="$1"
    local pattern="$2"
    local file="$3"
    if grep -qF "$pattern" "$file" 2>/dev/null; then
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
    local file="$3"
    if ! grep -qF "$pattern" "$file" 2>/dev/null; then
        echo "PASS: $description"
        PASS=$((PASS + 1))
    else
        echo "FAIL: $description"
        FAIL=$((FAIL + 1))
    fi
}

echo "=== Dungeon Fisher — Restyle Title Font (qa-restyle-title-font) ==="
echo ""

echo "--- Check 1: Google Fonts link includes MedievalSharp ---"
check "index.html Fonts link includes MedievalSharp" "family=MedievalSharp" "$INDEX_HTML"

echo ""
echo "--- Check 2: TitleScene uses MedievalSharp font ---"
check     "Title fontFamily uses MedievalSharp" "'MedievalSharp'" "$TITLE_SCENE"
check     "Font stack includes Georgia serif fallback" "'Georgia', serif" "$TITLE_SCENE"

echo ""
echo "--- Check 3: Drip emitter removed ---"
check_not "No dripEmitter created in TitleScene.create()" "this.dripEmitter = this.add.particles" "$TITLE_SCENE"
check_not "No blue drip tint (0x44aaff)" "0x44aaff" "$TITLE_SCENE"
check_not "No gravityY (drip physics gone)" "gravityY:" "$TITLE_SCENE"
check_not "No bounds.left (drip x positioning gone)" "bounds.left" "$TITLE_SCENE"
check_not "No bounds.right (drip x positioning gone)" "bounds.right" "$TITLE_SCENE"
check_not "No bounds.bottom (drip y positioning gone)" "bounds.bottom" "$TITLE_SCENE"
check_not "No Water dripping comment" "Water dripping" "$TITLE_SCENE"

echo ""
echo "--- Check 4: Warm amber shimmer intact ---"
check "Warm shimmer uses addCounter tween" "tweens.addCounter(" "$TITLE_SCENE"
check "Warm shimmer cycles to Math.PI * 2" "to: Math.PI * 2," "$TITLE_SCENE"
check "Warm shimmer uses GetColor formula" "GetColor(" "$TITLE_SCENE"
check "Warm shimmer sets four-corner tint" "setTint(c1, c2, c1, c2)" "$TITLE_SCENE"

echo ""
echo "--- Check 5: Two-phase title animation intact ---"
check "Phase 1 glow (alpha 0.6, scaleX 0.7, 2000ms)" "alpha: 0.6," "$TITLE_SCENE"
check "Phase 1 depth 0 + ADD blend at init" ".setDepth(0).setBlendMode" "$TITLE_SCENE"
check "Phase 2 break-through (depth 10)" "titleText.setDepth(10);" "$TITLE_SCENE"
check "Phase 2 blend switches to NORMAL" "titleText.setBlendMode(Phaser.BlendModes.NORMAL);" "$TITLE_SCENE"
check "Phase 2 alpha and scale reach 1 (Sine.Out, 1500ms)" "ease: 'Sine.Out'," "$TITLE_SCENE"

echo ""
echo "--- Check 6: VERSION is 1.7.6 ---"
check "version.js VERSION is '1.7.6'" "VERSION = '1.7.6'" "$VERSION_JS"

echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
exit 0
