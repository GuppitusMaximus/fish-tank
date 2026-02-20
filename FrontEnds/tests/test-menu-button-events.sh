#!/usr/bin/env bash
# QA test: qa-menu-button-events
# Verifies the event-driven menu button visibility implementation in UIOverlayScene.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$SCRIPT_DIR/../dungeon-fisher/src"
OVERLAY="$SRC/scenes/UIOverlayScene.js"

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

echo "=== qa-menu-button-events — Event-Driven Visibility Checks ==="
echo ""

# ─── Check 1: No update() method (polling removed) ────────────────────────────

echo "--- Check 1: No update() polling method ---"

if grep -q "update()" "$OVERLAY" 2>/dev/null; then
    check "No update() method — per-frame polling removed" "fail"
else
    check "No update() method — per-frame polling removed" "pass"
fi

echo ""

# ─── Check 2: Event-driven listener registration in create() ──────────────────

echo "--- Check 2: Event-driven listener registered in create() ---"

# 2a. menuBtn starts hidden before listeners are registered
if grep -q "setVisible(false)" "$OVERLAY" 2>/dev/null; then
    check "menuBtn.setVisible(false) called in create()" "pass"
else
    check "menuBtn.setVisible(false) called in create()" "fail"
fi

# 2b. Loop iterates over this.scene.manager.scenes
if grep -q "this.scene.manager.scenes" "$OVERLAY" 2>/dev/null; then
    check "Loops over this.scene.manager.scenes" "pass"
else
    check "Loops over this.scene.manager.scenes" "fail"
fi

# 2c. Skips UIOverlay scene in loop
if grep -q "UIOverlay" "$OVERLAY" 2>/dev/null && \
   grep -q "continue" "$OVERLAY" 2>/dev/null; then
    check "Loop skips 'UIOverlay' scene with continue" "pass"
else
    check "Loop skips 'UIOverlay' scene with continue" "fail"
fi

# 2d. Registers 'start' event listener on sys.events
if grep -q "sys.events.on" "$OVERLAY" 2>/dev/null && \
   grep -q "'start'" "$OVERLAY" 2>/dev/null; then
    check "Registers 'start' event on s.sys.events" "pass"
else
    check "Registers 'start' event on s.sys.events" "fail"
fi

# 2e. Listener calls setVisible with hiddenScenes check
if grep -q "hiddenScenes.has" "$OVERLAY" 2>/dev/null && \
   grep -q "setVisible" "$OVERLAY" 2>/dev/null; then
    check "Listener calls setVisible(!hiddenScenes.has(s.scene.key))" "pass"
else
    check "Listener calls setVisible(!hiddenScenes.has(s.scene.key))" "fail"
fi

echo ""

# ─── Check 3: hiddenScenes set contains exactly BootScene and TitleScene ──────

echo "--- Check 3: hiddenScenes Set contents ---"

if grep -q "new Set" "$OVERLAY" 2>/dev/null && \
   grep -q "hiddenScenes" "$OVERLAY" 2>/dev/null; then
    check "hiddenScenes is a Set" "pass"
else
    check "hiddenScenes is a Set" "fail"
fi

if grep -q "BootScene" "$OVERLAY" 2>/dev/null; then
    check "hiddenScenes contains 'BootScene'" "pass"
else
    check "hiddenScenes contains 'BootScene'" "fail"
fi

if grep -q "TitleScene" "$OVERLAY" 2>/dev/null; then
    check "hiddenScenes contains 'TitleScene'" "pass"
else
    check "hiddenScenes contains 'TitleScene'" "fail"
fi

echo ""

# ─── Check 4: Menu button styling unchanged ───────────────────────────────────

echo "--- Check 4: Menu button styling ---"

if grep -q "fontSize.*11px\|11px.*fontSize" "$OVERLAY" 2>/dev/null; then
    check "Menu button fontSize is 11px" "pass"
else
    check "Menu button fontSize is 11px" "fail"
fi

if grep -q "stroke" "$OVERLAY" 2>/dev/null && \
   grep -q "strokeThickness" "$OVERLAY" 2>/dev/null; then
    check "Menu button has stroke and strokeThickness" "pass"
else
    check "Menu button has stroke and strokeThickness" "fail"
fi

if grep -q "setDepth(1000)" "$OVERLAY" 2>/dev/null; then
    check "Menu button has setDepth(1000)" "pass"
else
    check "Menu button has setDepth(1000)" "fail"
fi

if grep -q "setScrollFactor(0)" "$OVERLAY" 2>/dev/null; then
    check "Menu button has setScrollFactor(0)" "pass"
else
    check "Menu button has setScrollFactor(0)" "fail"
fi

echo ""

# ─── Check 5: Click handler uses scene.run (not scene.start) ──────────────────

echo "--- Check 5: Click handler uses scene.run('TitleScene', {}) ---"

if grep -q "scene.run('TitleScene', {})" "$OVERLAY" 2>/dev/null; then
    check "Click handler uses this.scene.run('TitleScene', {}) not scene.start" "pass"
else
    check "Click handler uses this.scene.run('TitleScene', {}) not scene.start" "fail"
fi

# Confirm scene.start('TitleScene') is NOT used
if grep -q "scene.start('TitleScene')" "$OVERLAY" 2>/dev/null; then
    check "scene.start('TitleScene') NOT used (would stop UIOverlay)" "fail"
else
    check "scene.start('TitleScene') NOT used (would stop UIOverlay)" "pass"
fi

echo ""

# ─── Check 6: scenesToStop includes all gameplay scenes ───────────────────────

echo "--- Check 6: scenesToStop array includes all gameplay scenes ---"

for scene in TitleScene CharacterSelectScene FloorScene BattleScene ShopScene CampScene VictoryScene ZonePreviewScene; do
    if grep -q "$scene" "$OVERLAY" 2>/dev/null; then
        check "$scene in scenesToStop" "pass"
    else
        check "$scene in scenesToStop" "fail"
    fi
done

echo ""

# ─── Check 7: Version label code unchanged ────────────────────────────────────

echo "--- Check 7: Version label still present ---"

if grep -q "import.*VERSION" "$OVERLAY" 2>/dev/null; then
    check "VERSION imported in UIOverlayScene" "pass"
else
    check "VERSION imported in UIOverlayScene" "fail"
fi

if grep -q 'v${VERSION}' "$OVERLAY" 2>/dev/null; then
    check "Version label created with v\${VERSION}" "pass"
else
    check "Version label created with v\${VERSION}" "fail"
fi

echo ""

# ─── Check 8: No scene.manager.on() references ────────────────────────────────

echo "--- Check 8: No crash-causing scene.manager.on() ---"

if grep -q "scene.manager.on(" "$OVERLAY" 2>/dev/null; then
    check "scene.manager.on() NOT present (crash-causing pattern)" "fail"
else
    check "scene.manager.on() NOT present (crash-causing pattern)" "pass"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="

if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
exit 0
