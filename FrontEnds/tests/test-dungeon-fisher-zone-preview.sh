#!/usr/bin/env bash
# QA test: Zone Preview Scene — qa-zone-preview-dungeon-fisher
# Verifies the ZonePreviewScene implementation: 7 zones, navigation, transitions, back nav, ZONES button.
# Run from any directory.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ZONE_SCENE="$REPO_ROOT/FrontEnds/dungeon-fisher/src/scenes/ZonePreviewScene.js"
MAIN_JS="$REPO_ROOT/FrontEnds/dungeon-fisher/src/main.js"
TITLE_SCENE="$REPO_ROOT/FrontEnds/dungeon-fisher/src/scenes/TitleScene.js"

PASS=0
FAIL=0

check() {
    local label="$1"
    local pattern="$2"
    local file="$3"
    if grep -qF "$pattern" "$file" 2>/dev/null; then
        echo "  PASS: $label"
        PASS=$((PASS + 1))
    else
        echo "  FAIL: $label"
        FAIL=$((FAIL + 1))
    fi
}

check_exists() {
    local label="$1"
    local path="$2"
    if [ -f "$path" ]; then
        echo "  PASS: $label"
        PASS=$((PASS + 1))
    else
        echo "  FAIL: $label"
        FAIL=$((FAIL + 1))
    fi
}

echo "=== Zone Preview Scene QA Tests ==="
echo ""

# ─── Check 1: ZonePreviewScene.js exists ─────────────────────────────────────
echo "1. ZonePreviewScene file exists"
check_exists "ZonePreviewScene.js exists" "$ZONE_SCENE"

# ─── Check 2: Exports a Phaser.Scene subclass ─────────────────────────────────
echo "2. Phaser.Scene subclass"
check "extends Phaser.Scene" \
    "class ZonePreviewScene extends Phaser.Scene" "$ZONE_SCENE"
check "constructor registers as ZonePreviewScene" \
    "super('ZonePreviewScene')" "$ZONE_SCENE"

# ─── Check 3: Registered in main.js ───────────────────────────────────────────
echo "3. Registered in main.js"
check "main.js imports ZonePreviewScene" \
    "import ZonePreviewScene" "$MAIN_JS"
check "main.js scene array includes ZonePreviewScene" \
    "ZonePreviewScene" "$MAIN_JS"

# ─── Check 4: All 7 zones defined ─────────────────────────────────────────────
echo "4. All 7 zones defined (ZONES array)"
check "zone: sewers"           "bg_sewers"           "$ZONE_SCENE"
check "zone: goblin-caves"     "bg_goblin-caves"     "$ZONE_SCENE"
check "zone: bone-crypts"      "bg_bone-crypts"      "$ZONE_SCENE"
check "zone: deep-dungeon"     "bg_deep-dungeon"     "$ZONE_SCENE"
check "zone: shadow-realm"     "bg_shadow-realm"     "$ZONE_SCENE"
check "zone: ancient-chambers" "bg_ancient-chambers" "$ZONE_SCENE"
check "zone: dungeon-heart"    "bg_dungeon-heart"    "$ZONE_SCENE"

ZONE_COUNT=$(grep -cF "name:" "$ZONE_SCENE" 2>/dev/null)
if [ "$ZONE_COUNT" -ge 7 ]; then echo "  PASS: 7 zone name fields"; PASS=$((PASS+1)); else echo "  FAIL: 7 zone name fields (found $ZONE_COUNT)"; FAIL=$((FAIL+1)); fi
FLOOR_COUNT=$(grep -cF "floors:" "$ZONE_SCENE" 2>/dev/null)
if [ "$FLOOR_COUNT" -ge 7 ]; then echo "  PASS: 7 zone floors fields"; PASS=$((PASS+1)); else echo "  FAIL: 7 zone floors fields (found $FLOOR_COUNT)"; FAIL=$((FAIL+1)); fi
FLAVOR_COUNT=$(grep -cF "flavor:" "$ZONE_SCENE" 2>/dev/null)
if [ "$FLAVOR_COUNT" -ge 7 ]; then echo "  PASS: 7 zone flavor fields"; PASS=$((PASS+1)); else echo "  FAIL: 7 zone flavor fields (found $FLAVOR_COUNT)"; FAIL=$((FAIL+1)); fi

# ─── Check 5: Background + effects called in showZone ─────────────────────────
echo "5. Background and effects calls in showZone"
check "coverBackground() called with zone.key" \
    "coverBackground(this, zone.key)" "$ZONE_SCENE"
check "addEffects() called with zone.key" \
    "addEffects(this, zone.key)" "$ZONE_SCENE"

# ─── Check 6: Effects cleanup before next zone ────────────────────────────────
echo "6. Effects cleanup"
check "effectsHandle.cleanup() called" \
    "effectsHandle.cleanup()" "$ZONE_SCENE"
check "effectsHandle set to null after cleanup" \
    "effectsHandle = null" "$ZONE_SCENE"

# ─── Check 7: Navigation calls navigate() ─────────────────────────────────────
echo "7. Navigation with bounds checking"
check "navigate(-1) called for left navigation" \
    "this.navigate(-1)" "$ZONE_SCENE"
check "navigate(1) called for right navigation" \
    "this.navigate(1)" "$ZONE_SCENE"
check "keyboard LEFT arrow calls navigate" \
    "keydown-LEFT" "$ZONE_SCENE"
check "keyboard RIGHT arrow calls navigate" \
    "keydown-RIGHT" "$ZONE_SCENE"
check "touch swipe: pointerup handler" \
    "pointerup" "$ZONE_SCENE"
check "navigate() lower bounds check (< 0)" \
    "newIndex < 0" "$ZONE_SCENE"
check "navigate() upper bounds check (>= ZONES.length)" \
    "newIndex >= ZONES.length" "$ZONE_SCENE"

# ─── Check 8: Camera fade transition + transitioning guard ────────────────────
echo "8. Camera fade transition with guard"
check "camera fadeOut used" \
    "fadeOut" "$ZONE_SCENE"
check "camera fadeIn used" \
    "fadeIn" "$ZONE_SCENE"
check "transitioning guard at start of navigate()" \
    "if (this.transitioning) return" "$ZONE_SCENE"
check "transitioning set to true before fade" \
    "this.transitioning = true" "$ZONE_SCENE"
check "transitioning reset to false in showZone" \
    "this.transitioning = false" "$ZONE_SCENE"

# ─── Check 9: ZONES button on title ───────────────────────────────────────────
echo "9. ZONES button on TitleScene"
check "TitleScene has [ ZONES ] button" \
    "[ ZONES ]" "$TITLE_SCENE"
check "ZONES button starts ZonePreviewScene" \
    "ZonePreviewScene" "$TITLE_SCENE"

# ─── Check 10: Back navigation ────────────────────────────────────────────────
echo "10. Back navigation from ZonePreviewScene"
check "back button returns to TitleScene" \
    "scene.start('TitleScene')" "$ZONE_SCENE"
check "ESC key returns to TitleScene" \
    "keydown-ESC" "$ZONE_SCENE"

# ─── Check 11: No regressions ─────────────────────────────────────────────────
echo "11. No regressions"
check "TitleScene still has [ NEW GAME ] button" \
    "[ NEW GAME ]" "$TITLE_SCENE"
check "ZonePreviewScene added after VictoryScene in scene array" \
    "VictoryScene" "$MAIN_JS"

echo ""
echo "Results: $PASS passed, $FAIL failed"
if [ "$FAIL" -eq 0 ]; then
    echo "ALL CHECKS PASS"
    exit 0
else
    echo "SOME CHECKS FAILED"
    exit 1
fi
