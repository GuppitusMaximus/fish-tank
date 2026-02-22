#!/usr/bin/env bash
# QA test: qa-zone-theme-title-screen
# Verifies that TitleScene correctly implements the master container and themed button
# containers using themedPanel, and that the Continue button uses the zone theme
# derived from the current save's floor number.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TITLE_SCENE="$SCRIPT_DIR/../dungeon-fisher/src/scenes/TitleScene.js"
THEMES_JS="$SCRIPT_DIR/../dungeon-fisher/src/data/themes.js"
SAVE_SYSTEM="$SCRIPT_DIR/../dungeon-fisher/src/systems/SaveSystem.js"
THEMED_PANEL="$SCRIPT_DIR/../dungeon-fisher/src/ui/ThemedPanel.js"

PASS=0
FAIL=0

check() {
    local label="$1"
    local pattern="$2"
    if grep -qF "$pattern" "$3" 2>/dev/null; then
        echo "  PASS: $label"
        PASS=$((PASS + 1))
    else
        echo "  FAIL: $label"
        FAIL=$((FAIL + 1))
    fi
}

check_not() {
    local label="$1"
    local pattern="$2"
    if ! grep -qF "$pattern" "$3" 2>/dev/null; then
        echo "  PASS: $label"
        PASS=$((PASS + 1))
    else
        echo "  FAIL: $label"
        FAIL=$((FAIL + 1))
    fi
}

echo "=== qa-zone-theme-title-screen ==="
echo "TitleScene: $TITLE_SCENE"
echo ""

echo "--- Check 1: Master container exists and uses TITLE_THEME ---"
check "themedPanel imported from ThemedPanel.js" "import { themedPanel } from '../ui/ThemedPanel.js';" "$TITLE_SCENE"
check "TITLE_THEME imported from themes.js" "import { TITLE_THEME, getZoneByFloor } from '../data/themes.js';" "$TITLE_SCENE"
check "masterPanel created with TITLE_THEME" "themedPanel(this, masterX, masterY, masterW, masterH, TITLE_THEME, { depth: 5 })" "$TITLE_SCENE"
check "masterPanel depth is 5 (behind buttons at depth 9)" "{ depth: 5 }" "$TITLE_SCENE"
check "masterPanel fades in with delay 3200" "delay: 3200," "$TITLE_SCENE"
check "masterPanel sizing uses padding variable masterPad" "const masterPad = 20" "$TITLE_SCENE"

echo ""
echo "--- Check 2: Button containers use TITLE_THEME ---"
check "NEW GAME button passed TITLE_THEME" "'NEW GAME'," "$TITLE_SCENE"
# Verify that the _createTitleButton calls for NEW GAME and ZONES include TITLE_THEME
if grep -A4 "'NEW GAME'" "$TITLE_SCENE" 2>/dev/null | grep -q "TITLE_THEME"; then
    echo "  PASS: NEW GAME button uses TITLE_THEME"
    PASS=$((PASS + 1))
else
    echo "  FAIL: NEW GAME button uses TITLE_THEME"
    FAIL=$((FAIL + 1))
fi
if grep -A4 "'ZONES'" "$TITLE_SCENE" 2>/dev/null | grep -q "TITLE_THEME"; then
    echo "  PASS: ZONES button uses TITLE_THEME"
    PASS=$((PASS + 1))
else
    echo "  FAIL: ZONES button uses TITLE_THEME"
    FAIL=$((FAIL + 1))
fi
check "button panel depth is 9 (behind text at depth 10)" "{ depth: 9 }" "$TITLE_SCENE"
check "button text depth is 10" ".setDepth(10)" "$TITLE_SCENE"

echo ""
echo "--- Check 3: Continue button inherits save zone theme ---"
check "continueTheme defaults to TITLE_THEME" "let continueTheme = TITLE_THEME;" "$TITLE_SCENE"
check "hasSave() called before loading" "if (SaveSystem.hasSave())" "$TITLE_SCENE"
check "SaveSystem.load() called to get floor" "const saveData = SaveSystem.load();" "$TITLE_SCENE"
check "getZoneByFloor used to derive continue theme" "continueTheme = getZoneByFloor(saveData.floor);" "$TITLE_SCENE"
if grep -A4 "'CONTINUE'" "$TITLE_SCENE" 2>/dev/null | grep -q "continueTheme"; then
    echo "  PASS: CONTINUE button uses continueTheme"
    PASS=$((PASS + 1))
else
    echo "  FAIL: CONTINUE button uses continueTheme"
    FAIL=$((FAIL + 1))
fi
# Continue only shown when save exists
if grep -B2 "'CONTINUE'" "$TITLE_SCENE" 2>/dev/null | grep -q "hasSave"; then
    echo "  PASS: Continue button only shown when save exists"
    PASS=$((PASS + 1))
else
    echo "  FAIL: Continue button only shown when save exists"
    FAIL=$((FAIL + 1))
fi

echo ""
echo "--- Check 4: SaveSystem.load() has no state side effects ---"
check_not "load() does not modify any scene registry" "this.registry" "$SAVE_SYSTEM"
check_not "load() does not start any scenes" "this.scene.start" "$SAVE_SYSTEM"
check "load() reads from localStorage" "localStorage.getItem(SAVE_KEY)" "$SAVE_SYSTEM"
check "hasSave() is separate from load() — lightweight check" "static hasSave()" "$SAVE_SYSTEM"

echo ""
echo "--- Check 5: No dungeonPanel in TitleScene ---"
check_not "No dungeonPanel import in TitleScene" "import dungeonPanel" "$TITLE_SCENE"
check_not "No direct dungeonPanel() call in TitleScene" "dungeonPanel(" "$TITLE_SCENE"
check "themedPanel used in _createTitleButton" "themedPanel(" "$TITLE_SCENE"

echo ""
echo "--- Check 6: version.js not touched by this plan (bump by zone-theme-scene-migration) ---"
if grep -q "VERSION" "$SCRIPT_DIR/../dungeon-fisher/src/version.js" 2>/dev/null; then
    echo "  PASS: version.js exists and has VERSION export"
    PASS=$((PASS + 1))
else
    echo "  FAIL: version.js missing or no VERSION"
    FAIL=$((FAIL + 1))
fi

echo ""
echo "--- Check 7: Depth ordering correct ---"
check "master panel at depth 5 (behind button panels)" "masterW, masterH, TITLE_THEME, { depth: 5 }" "$TITLE_SCENE"
check "button panel at depth 9 (behind text)" "{ depth: 9 }" "$TITLE_SCENE"
check "button text at depth 10 (top layer)" ".setDepth(10)" "$TITLE_SCENE"
# masterPanel has no setInteractive — won't intercept clicks
check_not "masterPanel does not have setInteractive" "masterPanel.setInteractive" "$TITLE_SCENE"

echo ""
echo "--- Check 8: getZoneByFloor returns correct zones ---"
check "getZoneByFloor exported from themes.js" "export function getZoneByFloor(floor)" "$THEMES_JS"
check "Sewers zone covers floors 1-10" "floorRange: [1, 10]," "$THEMES_JS"
check "Goblin Caves zone covers floors 11-20" "floorRange: [11, 20]," "$THEMES_JS"
check "Dungeon Heart zone covers floors 91-100" "floorRange: [91, 100]," "$THEMES_JS"
check "getZoneByFloor falls back to first zone" "return ZONE_LIST[0];" "$THEMES_JS"
check "TITLE_THEME exported for title screen panels" "export const TITLE_THEME = {" "$THEMES_JS"

echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
exit 0
