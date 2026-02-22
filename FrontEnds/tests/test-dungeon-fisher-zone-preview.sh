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

# ─── Check 4: All 7 zones defined (zone-theme-data-layer: now derived from ZONE_THEMES) ──
echo "4. All 7 zones defined (derived from ZONE_THEMES import)"
check "imports ZONE_THEMES from themes.js" \
    "from '../data/themes.js'" "$ZONE_SCENE"
check "ZONES array derived from ZONE_THEMES" \
    "Object.values(ZONE_THEMES)" "$ZONE_SCENE"
check "zones mapped with name field" \
    "name: z.name" "$ZONE_SCENE"
check "zones mapped with flavor field" \
    "flavor: z.flavor" "$ZONE_SCENE"
check "zones mapped with floors from floorRange" \
    "floorRange" "$ZONE_SCENE"
check "zones sorted by floorRange[0]" \
    "a.floorRange[0] - b.floorRange[0]" "$ZONE_SCENE"

THEMES_FILE="$REPO_ROOT/FrontEnds/dungeon-fisher/src/data/themes.js"
check "themes.js has all 7 zones including sewers" \
    "sewers:" "$THEMES_FILE"
check "themes.js has goblin_caves zone" \
    "goblin_caves:" "$THEMES_FILE"
check "themes.js has dungeon_heart zone" \
    "dungeon_heart:" "$THEMES_FILE"

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
check "TitleScene has ZONES button" \
    "ZONES" "$TITLE_SCENE"
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
check "TitleScene still has NEW GAME button" \
    "NEW GAME" "$TITLE_SCENE"
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
