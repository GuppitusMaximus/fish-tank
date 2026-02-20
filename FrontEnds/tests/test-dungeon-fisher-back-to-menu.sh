#!/usr/bin/env bash
# QA test: qa-back-to-menu-button
# Verifies the persistent MENU button in UIOverlayScene is correctly implemented.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$SCRIPT_DIR/../dungeon-fisher/src"
OVERLAY="$SRC/scenes/UIOverlayScene.js"
TITLE_SCENE="$SRC/scenes/TitleScene.js"
VERSION_JS="$SRC/version.js"
PACKAGE_JSON="$SCRIPT_DIR/../dungeon-fisher/package.json"

PASS=0
FAIL=0

check() {
    local label="$1"
    local result="$2"
    if [ "$result" = "pass" ]; then
        echo "  PASS: $label"
        PASS=$((PASS + 1))
    else
        echo "  FAIL: $label"
        FAIL=$((FAIL + 1))
    fi
}

echo "=== qa-back-to-menu-button — Static Code Checks ==="
echo ""

# ─── Check 1: Menu button created in UIOverlayScene ────────────────────────────

echo "--- Check 1: UIOverlayScene.js creates [ MENU ] button ---"

# 1. File exists
if [ -f "$OVERLAY" ]; then
    check "UIOverlayScene.js exists" "pass"
else
    check "UIOverlayScene.js exists" "fail"
fi

# 2. Creates '[ MENU ]' text
if grep -q "\[ MENU \]" "$OVERLAY" 2>/dev/null; then
    check "UIOverlayScene creates '[ MENU ]' button text" "pass"
else
    check "UIOverlayScene creates '[ MENU ]' button text" "fail"
fi

# 3. Position in top-left (x=4, y=3)
if grep -q "4, 3.*\[ MENU \]\|4, 3, '\[ MENU \]'" "$OVERLAY" 2>/dev/null; then
    check "Menu button positioned at top-left (4, 3)" "pass"
else
    check "Menu button positioned at top-left (4, 3)" "fail"
fi

# 4. High depth (1000)
if grep -q "setDepth(1000)" "$OVERLAY" 2>/dev/null; then
    check "Menu button has setDepth(1000)" "pass"
else
    check "Menu button has setDepth(1000)" "fail"
fi

# 5. setScrollFactor(0)
if grep -q "setScrollFactor(0)" "$OVERLAY" 2>/dev/null; then
    check "Menu button has setScrollFactor(0)" "pass"
else
    check "Menu button has setScrollFactor(0)" "fail"
fi

# 6. Interactive with useHandCursor
if grep -q "setInteractive" "$OVERLAY" 2>/dev/null && \
   grep -q "useHandCursor" "$OVERLAY" 2>/dev/null; then
    check "Menu button is interactive with useHandCursor" "pass"
else
    check "Menu button is interactive with useHandCursor" "fail"
fi

# 7. Hover color change (pointerover → #ffffff)
if grep -q "pointerover" "$OVERLAY" 2>/dev/null && \
   grep -q "#ffffff" "$OVERLAY" 2>/dev/null; then
    check "Menu button has pointerover → #ffffff hover" "pass"
else
    check "Menu button has pointerover → #ffffff hover" "fail"
fi

# 8. Pointerout color restore
if grep -q "pointerout" "$OVERLAY" 2>/dev/null; then
    check "Menu button has pointerout color restore" "pass"
else
    check "Menu button has pointerout color restore" "fail"
fi

# 9. Stroke for readability (stroke defined)
if grep -q "stroke:" "$OVERLAY" 2>/dev/null || \
   grep -q "strokeThickness" "$OVERLAY" 2>/dev/null; then
    check "Menu button has stroke for readability" "pass"
else
    check "Menu button has stroke for readability" "fail"
fi

echo ""

# ─── Check 2: Button hidden on TitleScene and BootScene ────────────────────────

echo "--- Check 2: Button hidden on TitleScene and BootScene ---"

# 10. hiddenScenes includes 'BootScene'
if grep -q "BootScene" "$OVERLAY" 2>/dev/null; then
    check "BootScene in hiddenScenes list" "pass"
else
    check "BootScene in hiddenScenes list" "fail"
fi

# 11. hiddenScenes includes 'TitleScene'
if grep -q "TitleScene" "$OVERLAY" 2>/dev/null; then
    check "TitleScene in hiddenScenes list" "pass"
else
    check "TitleScene in hiddenScenes list" "fail"
fi

# 12. Button starts hidden (setVisible(false))
if grep -q "setVisible(false)" "$OVERLAY" 2>/dev/null; then
    check "Menu button starts hidden (setVisible(false))" "pass"
else
    check "Menu button starts hidden (setVisible(false))" "fail"
fi

# 13. update() method hides button for hidden scenes (replaces event listener approach)
if grep -q "update()" "$OVERLAY" 2>/dev/null && \
   grep -q "BootScene\|TitleScene" "$OVERLAY" 2>/dev/null && \
   grep -q "setVisible" "$OVERLAY" 2>/dev/null; then
    check "update() method hides button on TitleScene/BootScene" "pass"
else
    check "update() method hides button on TitleScene/BootScene" "fail"
fi

echo ""

# ─── Check 3: Button visible on all gameplay scenes ────────────────────────────

echo "--- Check 3: Button visible on gameplay scenes ---"

# 14. update() method uses setVisible(!hide) to show/hide based on active scenes
if grep -q "setVisible(!hide)" "$OVERLAY" 2>/dev/null; then
    check "update() calls setVisible(!hide) for dynamic show/hide" "pass"
else
    check "update() calls setVisible(!hide) for dynamic show/hide" "fail"
fi

# 15. update() uses getScenes(true) to poll active scenes (no crash-prone event listener)
if grep -q "getScenes(true)" "$OVERLAY" 2>/dev/null; then
    check "update() uses getScenes(true) — no scene.manager.on() event listener" "pass"
else
    check "update() uses getScenes(true) — no scene.manager.on() event listener" "fail"
fi

# 15b. Confirm scene.manager.on is NOT present (the crash was caused by this)
if grep -q "scene.manager.on" "$OVERLAY" 2>/dev/null; then
    check "scene.manager.on NOT present (crash-causing listener removed)" "fail"
else
    check "scene.manager.on NOT present (crash-causing listener removed)" "pass"
fi

echo ""

# ─── Check 4: Clicking button stops gameplay scenes and starts TitleScene ──────

echo "--- Check 4: Button click stops gameplay scenes and starts TitleScene ---"

# 16. pointerdown handler defined
if grep -q "pointerdown" "$OVERLAY" 2>/dev/null; then
    check "Menu button has pointerdown handler" "pass"
else
    check "Menu button has pointerdown handler" "fail"
fi

# 17. Stops CharacterSelectScene
if grep -q "CharacterSelectScene" "$OVERLAY" 2>/dev/null; then
    check "pointerdown handler stops CharacterSelectScene" "pass"
else
    check "pointerdown handler stops CharacterSelectScene" "fail"
fi

# 18. Stops FloorScene
if grep -q "FloorScene" "$OVERLAY" 2>/dev/null; then
    check "pointerdown handler stops FloorScene" "pass"
else
    check "pointerdown handler stops FloorScene" "fail"
fi

# 19. Stops BattleScene
if grep -q "BattleScene" "$OVERLAY" 2>/dev/null; then
    check "pointerdown handler stops BattleScene" "pass"
else
    check "pointerdown handler stops BattleScene" "fail"
fi

# 20. Stops ShopScene
if grep -q "ShopScene" "$OVERLAY" 2>/dev/null; then
    check "pointerdown handler stops ShopScene" "pass"
else
    check "pointerdown handler stops ShopScene" "fail"
fi

# 21. Stops CampScene
if grep -q "CampScene" "$OVERLAY" 2>/dev/null; then
    check "pointerdown handler stops CampScene" "pass"
else
    check "pointerdown handler stops CampScene" "fail"
fi

# 22. Stops VictoryScene
if grep -q "VictoryScene" "$OVERLAY" 2>/dev/null; then
    check "pointerdown handler stops VictoryScene" "pass"
else
    check "pointerdown handler stops VictoryScene" "fail"
fi

# 23. Stops ZonePreviewScene
if grep -q "ZonePreviewScene" "$OVERLAY" 2>/dev/null; then
    check "pointerdown handler stops ZonePreviewScene" "pass"
else
    check "pointerdown handler stops ZonePreviewScene" "fail"
fi

# 24. Starts TitleScene via scene.run() (not scene.start — avoids stopping UIOverlay)
if grep -q "scene.run('TitleScene')" "$OVERLAY" 2>/dev/null; then
    check "pointerdown handler runs TitleScene via scene.run()" "pass"
else
    check "pointerdown handler runs TitleScene via scene.run()" "fail"
fi

echo ""

# ─── Check 5: Continue works after returning to menu ──────────────────────────

echo "--- Check 5: Continue works after returning to menu ---"

# 25. TitleScene checks SaveSystem.hasSave() before showing Continue
if grep -q "SaveSystem.hasSave()" "$TITLE_SCENE" 2>/dev/null; then
    check "TitleScene checks SaveSystem.hasSave() for Continue button" "pass"
else
    check "TitleScene checks SaveSystem.hasSave() for Continue button" "fail"
fi

# 26. continueGame() loads from SaveSystem.load()
if grep -q "SaveSystem.load()" "$TITLE_SCENE" 2>/dev/null; then
    check "continueGame() loads from SaveSystem.load()" "pass"
else
    check "continueGame() loads from SaveSystem.load()" "fail"
fi

# 27. continueGame() starts FloorScene with loaded gameState
if grep -A20 "continueGame()" "$TITLE_SCENE" 2>/dev/null | grep -q "FloorScene"; then
    check "continueGame() starts FloorScene with loaded gameState" "pass"
else
    check "continueGame() starts FloorScene with loaded gameState" "fail"
fi

echo ""

# ─── Check 6: Version label still present ─────────────────────────────────────

echo "--- Check 6: Version label still present in UIOverlayScene ---"

# 28. VERSION import in UIOverlayScene
if grep -q "import.*VERSION" "$OVERLAY" 2>/dev/null; then
    check "VERSION imported in UIOverlayScene" "pass"
else
    check "VERSION imported in UIOverlayScene" "fail"
fi

# 29. Version text element created
if grep -q "v\${VERSION}\|v.*VERSION" "$OVERLAY" 2>/dev/null; then
    check "Version text element created with v\${VERSION}" "pass"
else
    check "Version text element created with v\${VERSION}" "fail"
fi

# 30. Version text has depth 1000
# (counted as part of the same setDepth chain — the version label also uses depth 1000)
DEPTH_COUNT=$(grep -c "setDepth(1000)" "$OVERLAY" 2>/dev/null || echo 0)
if [ "$DEPTH_COUNT" -ge 1 ]; then
    check "Version text has depth 1000 (UIOverlay has at least 1 depth-1000 element)" "pass"
else
    check "Version text has depth 1000" "fail"
fi

echo ""

# ─── Check 7: VERSION bumped in both version.js and package.json ───────────────

echo "--- Check 7: VERSION bumped from 0.9.0 to 0.10.0 ---"

# 31. version.js shows 0.10.0
if grep -q "VERSION = '0\.10\.0'" "$VERSION_JS" 2>/dev/null; then
    check "version.js has VERSION = '0.10.0'" "pass"
else
    check "version.js has VERSION = '0.10.0'" "fail"
fi

# 32. package.json shows 0.10.0
if grep -q '"version": "0\.10\.0"' "$PACKAGE_JSON" 2>/dev/null; then
    check "package.json has version 0.10.0" "pass"
else
    check "package.json has version 0.10.0" "fail"
fi

# 33. Both versions match
ACTUAL_VERSION=$(grep "export const VERSION" "$VERSION_JS" 2>/dev/null | sed "s/.*'\(.*\)'.*/\1/")
PKG_VERSION=$(grep '"version"' "$PACKAGE_JSON" 2>/dev/null | sed 's/.*"\(.*\)".*/\1/' | tr -d ' ,')
if [ "$ACTUAL_VERSION" = "$PKG_VERSION" ]; then
    check "version.js ($ACTUAL_VERSION) matches package.json ($PKG_VERSION)" "pass"
else
    check "version.js ($ACTUAL_VERSION) does NOT match package.json ($PKG_VERSION)" "fail"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="

if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
exit 0
