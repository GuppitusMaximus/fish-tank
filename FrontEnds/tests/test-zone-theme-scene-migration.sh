#!/usr/bin/env bash
# test-zone-theme-scene-migration.sh
# QA test for qa-zone-theme-scene-migration plan.
# Verifies all scenes use themedPanel, correct theme application (zone vs character),
# registry state, UIOverlayScene listener, and version bump.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FE="$SCRIPT_DIR/.."
FLOOR="$FE/dungeon-fisher/src/scenes/FloorScene.js"
BATTLE="$FE/dungeon-fisher/src/scenes/BattleScene.js"
SHOP="$FE/dungeon-fisher/src/scenes/ShopScene.js"
CAMP="$FE/dungeon-fisher/src/scenes/CampScene.js"
UIOVERLAY="$FE/dungeon-fisher/src/scenes/UIOverlayScene.js"
THEMED_PANEL="$FE/dungeon-fisher/src/ui/ThemedPanel.js"
DUNGEON_PANEL="$FE/dungeon-fisher/src/ui/DungeonPanel.js"
VERSION_JS="$FE/dungeon-fisher/src/version.js"

PASS=0
FAIL=0

pass() { echo "  PASS: $1"; PASS=$((PASS+1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL+1)); }
check_grep() {
    grep -qF "$2" "$1" 2>/dev/null && pass "$3" || fail "$3"
}
check_not_grep() {
    grep -qF "$2" "$1" 2>/dev/null && fail "$3" || pass "$3"
}

echo "=== Zone Theme Scene Migration QA ==="
echo "Plan: qa-zone-theme-scene-migration"
echo ""

# ─── Step 1: No remaining dungeonPanel imports in migrated scenes ──────────────
echo "1. No remaining dungeonPanel imports in migrated scenes"
check_not_grep "$FLOOR"     "import dungeonPanel"  "FloorScene has no dungeonPanel import"
check_not_grep "$BATTLE"    "import dungeonPanel"  "BattleScene has no dungeonPanel import"
check_not_grep "$SHOP"      "import dungeonPanel"  "ShopScene has no dungeonPanel import"
check_not_grep "$CAMP"      "import dungeonPanel"  "CampScene has no dungeonPanel import"
check_not_grep "$UIOVERLAY" "import dungeonPanel"  "UIOverlayScene has no dungeonPanel import"

# All migrated scenes import themedPanel
check_grep "$FLOOR"     "import { themedPanel }" "FloorScene imports themedPanel"
check_grep "$BATTLE"    "import { themedPanel }" "BattleScene imports themedPanel"
check_grep "$SHOP"      "import { themedPanel }" "ShopScene imports themedPanel"
check_grep "$CAMP"      "import { themedPanel }" "CampScene imports themedPanel"
check_grep "$UIOVERLAY" "import { themedPanel }" "UIOverlayScene imports themedPanel"

# DungeonPanel.js still exists (used internally by ThemedPanel)
if [ -f "$DUNGEON_PANEL" ]; then
    pass "DungeonPanel.js still exists (used by ThemedPanel internally)"
else
    fail "DungeonPanel.js missing (should still exist for ThemedPanel fallback)"
fi

# ThemedPanel.js imports DungeonPanel internally
check_grep "$THEMED_PANEL" "import dungeonPanel" "ThemedPanel.js imports dungeonPanel for fallback"

# ─── Step 2: Registry state set correctly in FloorScene ───────────────────────
echo ""
echo "2. Registry state set correctly in FloorScene"
check_grep "$FLOOR" "registry.set('currentZone', zone)"           "FloorScene sets currentZone in registry"
check_grep "$FLOOR" "registry.set('currentCharacter', getCharacterTheme" "FloorScene sets currentCharacter in registry"
check_grep "$FLOOR" "getZoneByFloor"                               "FloorScene uses getZoneByFloor"
check_grep "$FLOOR" "getCharacterTheme"                            "FloorScene imports getCharacterTheme"
check_grep "$FLOOR" "buildFloorUI"                                 "FloorScene has buildFloorUI method"

# Node-based ordering check: registry.set must appear before themedPanel call
TMP_TEST=$(mktemp /tmp/floor_scene_order_XXXXX.mjs)
cat > "$TMP_TEST" << NODEEOF
import { readFileSync } from 'fs';
const src = readFileSync('$FLOOR', 'utf8');

// Find the buildFloorUI METHOD DEFINITION (not call site)
const buildStart = src.indexOf('buildFloorUI() {');
if (buildStart === -1) {
    process.stdout.write('FAIL:buildFloorUI() method definition not found\n');
    process.exit(0);
}

const block = src.slice(buildStart);
const regZonePos = block.indexOf("registry.set('currentZone'");
const regCharPos = block.indexOf("registry.set('currentCharacter'");
const panelPos   = block.indexOf('themedPanel(');

if (regZonePos === -1) {
    process.stdout.write('FAIL:registry.set(currentZone) not found in buildFloorUI\n');
} else if (regCharPos === -1) {
    process.stdout.write('FAIL:registry.set(currentCharacter) not found in buildFloorUI\n');
} else if (panelPos === -1) {
    process.stdout.write('FAIL:themedPanel() call not found in buildFloorUI\n');
} else if (regZonePos < panelPos && regCharPos < panelPos) {
    process.stdout.write('PASS:registry.set calls appear before first themedPanel call in buildFloorUI\n');
} else {
    process.stdout.write('FAIL:registry.set calls do NOT appear before themedPanel call\n');
}
NODEEOF

while IFS=: read -r status rest; do
    [ -z "$status" ] && continue
    if [ "$status" = "PASS" ]; then pass "$rest"; else fail "$rest"; fi
done < <(node "$TMP_TEST" 2>/dev/null)
rm -f "$TMP_TEST"

# ─── Step 3: BattleScene dual theming ─────────────────────────────────────────
echo ""
echo "3. BattleScene dual theming (zone for combat panels, character for HP label)"
check_grep "$BATTLE" "getZoneByFloor"     "BattleScene imports getZoneByFloor"
check_grep "$BATTLE" "getCharacterTheme"  "BattleScene imports getCharacterTheme"

# Zone theme panels (floor indicator, monster name, message bar)
check_grep "$BATTLE" "themedPanel(this, W - 74, 4, 70, 20, zone)"      "BattleScene: floor indicator uses zone theme"
check_grep "$BATTLE" "themedPanel(this, 2, 2, W * 0.5, 22, zone)"      "BattleScene: monster name panel uses zone theme"
check_grep "$BATTLE" "themedPanel(this, 0, H - 30, W, 30, zone)"       "BattleScene: message bar uses zone theme"

# Character theme panel (HP label) — check for themedPanel with 'character' arg
check_grep "$BATTLE" ", character)"  "BattleScene: HP label panel ends with character theme arg"

# Verify zone and character are NOT swapped using text analysis
TMP_TEST=$(mktemp /tmp/battle_theme_XXXXX.mjs)
cat > "$TMP_TEST" << NODEEOF
import { readFileSync } from 'fs';
const src = readFileSync('$BATTLE', 'utf8');

// The HP label panel should use 'character', not 'zone'
const hpPanelLine = src.split('\n').find(l => l.includes('hpBarX') && l.includes('themedPanel'));
if (!hpPanelLine) {
    process.stdout.write('FAIL:HP label themedPanel line not found\n');
} else if (hpPanelLine.includes('character')) {
    process.stdout.write('PASS:HP label panel uses character theme (not zone)\n');
} else {
    process.stdout.write('FAIL:HP label panel does not use character theme\n');
}

// Monster name should use 'zone'
const namePanelLine = src.split('\n').find(l => l.includes('W * 0.5, 22') && l.includes('themedPanel'));
if (!namePanelLine) {
    process.stdout.write('FAIL:monster name themedPanel line not found\n');
} else if (namePanelLine.includes('zone')) {
    process.stdout.write('PASS:Monster name panel uses zone theme (not character)\n');
} else {
    process.stdout.write('FAIL:Monster name panel does not use zone theme\n');
}
NODEEOF

while IFS=: read -r status rest; do
    [ -z "$status" ] && continue
    if [ "$status" = "PASS" ]; then pass "$rest"; else fail "$rest"; fi
done < <(node "$TMP_TEST" 2>/dev/null)
rm -f "$TMP_TEST"

# ─── Step 4: ShopScene panels added ───────────────────────────────────────────
echo ""
echo "4. ShopScene panels added inside buildShop()"
check_grep "$SHOP" "getZoneByFloor"           "ShopScene imports getZoneByFloor"
check_grep "$SHOP" "themedPanel"              "ShopScene calls themedPanel"
check_grep "$SHOP" "buildShop()"              "ShopScene has buildShop() method"
check_grep "$SHOP" "this.children.removeAll()" "ShopScene buildShop clears all children first"

# Panels are inside buildShop (after removeAll)
TMP_TEST=$(mktemp /tmp/shop_panel_XXXXX.mjs)
cat > "$TMP_TEST" << NODEEOF
import { readFileSync } from 'fs';
const src = readFileSync('$SHOP', 'utf8');

const buildStart = src.indexOf('buildShop()');
if (buildStart === -1) {
    process.stdout.write('FAIL:buildShop() not found\n');
    process.exit(0);
}
const block = src.slice(buildStart);
const removePos  = block.indexOf('removeAll()');
const panelPos   = block.indexOf('themedPanel(');
const zonePos    = block.indexOf('getZoneByFloor(');

if (removePos !== -1 && panelPos !== -1 && removePos < panelPos) {
    process.stdout.write('PASS:themedPanel called after removeAll() in buildShop\n');
} else {
    process.stdout.write('FAIL:themedPanel not called after removeAll() in buildShop\n');
}
if (zonePos !== -1 && panelPos !== -1 && zonePos < panelPos) {
    process.stdout.write('PASS:zone resolved before themedPanel call in buildShop\n');
} else {
    process.stdout.write('FAIL:zone not resolved before themedPanel call in buildShop\n');
}

// Count themedPanel calls in buildShop
const matches = [...block.matchAll(/themedPanel\(/g)];
const count = matches.length;
if (count >= 2) {
    process.stdout.write('PASS:ShopScene buildShop has ' + count + ' themedPanel call(s) (>=2 expected)\n');
} else {
    process.stdout.write('FAIL:ShopScene buildShop has only ' + count + ' themedPanel call(s) (expected >=2)\n');
}
NODEEOF

while IFS=: read -r status rest; do
    [ -z "$status" ] && continue
    if [ "$status" = "PASS" ]; then pass "$rest"; else fail "$rest"; fi
done < <(node "$TMP_TEST" 2>/dev/null)
rm -f "$TMP_TEST"

# ─── Step 5: CampScene panels added ───────────────────────────────────────────
echo ""
echo "5. CampScene panels added"
check_grep "$CAMP" "getZoneByFloor"  "CampScene imports getZoneByFloor"
check_grep "$CAMP" "themedPanel"     "CampScene calls themedPanel"

TMP_TEST=$(mktemp /tmp/camp_panel_XXXXX.mjs)
cat > "$TMP_TEST" << NODEEOF
import { readFileSync } from 'fs';
const src = readFileSync('$CAMP', 'utf8');

// Count total themedPanel calls
const matches = [...src.matchAll(/themedPanel\(/g)];
const count = matches.length;
if (count >= 2) {
    process.stdout.write('PASS:CampScene has ' + count + ' themedPanel call(s) (>=2 expected)\n');
} else {
    process.stdout.write('FAIL:CampScene has only ' + count + ' themedPanel call(s) (expected >=2)\n');
}

// renderPartyOrder METHOD DEFINITION has a themedPanel call (for the party order panel)
const renderStart = src.indexOf('renderPartyOrder() {');
if (renderStart !== -1) {
    // Take a generous window (method body can be 1000+ chars)
    const block = src.slice(renderStart, renderStart + 1200);
    if (block.includes('themedPanel(')) {
        process.stdout.write('PASS:renderPartyOrder() creates a themedPanel\n');
    } else {
        process.stdout.write('FAIL:renderPartyOrder() does not create a themedPanel\n');
    }
} else {
    process.stdout.write('FAIL:renderPartyOrder() method definition not found\n');
}

// zone stored as this.zone for use in renderPartyOrder
if (src.includes('this.zone = zone')) {
    process.stdout.write('PASS:CampScene stores zone as this.zone for re-use in renderPartyOrder\n');
} else {
    process.stdout.write('FAIL:CampScene does not store zone as this.zone\n');
}
NODEEOF

while IFS=: read -r status rest; do
    [ -z "$status" ] && continue
    if [ "$status" = "PASS" ]; then pass "$rest"; else fail "$rest"; fi
done < <(node "$TMP_TEST" 2>/dev/null)
rm -f "$TMP_TEST"

# ─── Step 6: UIOverlayScene theming ───────────────────────────────────────────
echo ""
echo "6. UIOverlayScene theming"
check_grep "$UIOVERLAY" "TITLE_THEME"                        "UIOverlayScene imports TITLE_THEME for fallback"
check_grep "$UIOVERLAY" "registry.get('currentZone')"        "UIOverlayScene reads currentZone from registry for scrim"
check_grep "$UIOVERLAY" "registry.get('currentCharacter')"   "UIOverlayScene reads currentCharacter from registry for inventory panel"
check_grep "$UIOVERLAY" "changedata-currentZone"             "UIOverlayScene listens for currentZone registry changes"

# Verify old scrim destroyed before new one created
TMP_TEST=$(mktemp /tmp/uioverlay_listener_XXXXX.mjs)
cat > "$TMP_TEST" << NODEEOF
import { readFileSync } from 'fs';
const src = readFileSync('$UIOVERLAY', 'utf8');

// Find the changedata-currentZone listener body
const listenerStart = src.indexOf('changedata-currentZone');
if (listenerStart === -1) {
    process.stdout.write('FAIL:changedata-currentZone listener not found\n');
    process.exit(0);
}
const block = src.slice(listenerStart, listenerStart + 300);

const destroyPos = block.indexOf('.destroy()');
const panelPos   = block.indexOf('themedPanel(');

if (destroyPos === -1) {
    process.stdout.write('FAIL:listener does not destroy old scrim (memory leak risk)\n');
} else if (panelPos === -1) {
    process.stdout.write('FAIL:listener does not call themedPanel for new scrim\n');
} else if (destroyPos < panelPos) {
    process.stdout.write('PASS:listener destroys old scrim before creating new one\n');
} else {
    process.stdout.write('FAIL:destroy() appears after themedPanel call (wrong order)\n');
}

// Inventory panel uses character theme (currentCharacter)
const invStart = src.indexOf('openInventory() {');
if (invStart !== -1) {
    // Use a generous window — method has setup code before the themedPanel call
    const invBlock = src.slice(invStart, invStart + 1000);
    if (invBlock.includes('currentCharacter') && invBlock.includes('themedPanel(')) {
        process.stdout.write('PASS:openInventory() uses currentCharacter theme for panel\n');
    } else {
        process.stdout.write('FAIL:openInventory() does not use currentCharacter theme\n');
    }
} else {
    process.stdout.write('FAIL:openInventory() method definition not found\n');
}
NODEEOF

while IFS=: read -r status rest; do
    [ -z "$status" ] && continue
    if [ "$status" = "PASS" ]; then pass "$rest"; else fail "$rest"; fi
done < <(node "$TMP_TEST" 2>/dev/null)
rm -f "$TMP_TEST"

# ─── Step 7: Version bump ─────────────────────────────────────────────────────
echo ""
echo "7. Version bump"
# Plan qa-zone-theme-scene-migration targeted v1.8.0, but subsequent plans may have bumped further.
# Verify VERSION >= 1.8.0 (migration bumped from 1.7.x to 1.8.0).
TMP_TEST=$(mktemp /tmp/version_check_XXXXX.mjs)
cat > "$TMP_TEST" << NODEEOF
import { readFileSync } from 'fs';
const src = readFileSync('$VERSION_JS', 'utf8');
const match = src.match(/export const VERSION = '(\d+)\.(\d+)\.(\d+)'/);
if (!match) {
    process.stdout.write('FAIL:VERSION constant not found in version.js\n');
    process.exit(0);
}
const [, major, minor, patch] = match.map((v, i) => i === 0 ? v : parseInt(v));
const ver = major * 10000 + minor * 100 + patch;
const min = 1 * 10000 + 8 * 100 + 0; // 1.8.0
if (ver >= min) {
    process.stdout.write('PASS:VERSION is ' + major + '.' + minor + '.' + patch + ' (>= 1.8.0, migration applied)\n');
} else {
    process.stdout.write('FAIL:VERSION is ' + major + '.' + minor + '.' + patch + ' (expected >= 1.8.0)\n');
}
NODEEOF

while IFS=: read -r status rest; do
    [ -z "$status" ] && continue
    if [ "$status" = "PASS" ]; then pass "$rest"; else fail "$rest"; fi
done < <(node "$TMP_TEST" 2>/dev/null)
rm -f "$TMP_TEST"

if grep -q "SAVE_FORMAT_VERSION = 3" "$VERSION_JS" 2>/dev/null; then
    pass "SAVE_FORMAT_VERSION is still 3 (unchanged)"
else
    fail "SAVE_FORMAT_VERSION is not 3"
fi

# ─── Step 8: Layout integrity ─────────────────────────────────────────────────
echo ""
echo "8. Layout integrity"

# FloorScene: top panel spans full width at y=0
check_grep "$FLOOR" "themedPanel(this, 0, 0, W," "FloorScene top panel starts at x=0, y=0 (full width)"

# FloorScene: card panels use zone theme
check_grep "$FLOOR" "themedPanel(this, cx, cy, cardW, cardH, zone)" "FloorScene card panels use zone theme"

# BattleScene: panels have distinct positions (no overlap with key elements)
check_grep "$BATTLE" "themedPanel(this, W - 74, 4, 70, 20, zone)" "BattleScene floor indicator: top-right corner (non-overlapping)"
check_grep "$BATTLE" "themedPanel(this, 0, H - 30, W, 30, zone)"  "BattleScene message bar: bottom strip (full width)"

# ShopScene: at least 2 panels (header + content)
TMP_TEST=$(mktemp /tmp/shop_layout_XXXXX.mjs)
cat > "$TMP_TEST" << NODEEOF
import { readFileSync } from 'fs';
const src = readFileSync('$SHOP', 'utf8');
const matches = [...src.matchAll(/themedPanel\(/g)];
process.stdout.write((matches.length >= 2 ? 'PASS' : 'FAIL') +
    ':ShopScene has at least 2 themedPanel calls (header + content), found: ' + matches.length + '\n');
NODEEOF

while IFS=: read -r status rest; do
    [ -z "$status" ] && continue
    if [ "$status" = "PASS" ]; then pass "$rest"; else fail "$rest"; fi
done < <(node "$TMP_TEST" 2>/dev/null)
rm -f "$TMP_TEST"

# CampScene: panels render before content text (creation order = render order)
check_grep "$CAMP" "themedPanel(this, 4, 4" "CampScene header panel at top (y=4)"
check_grep "$CAMP" "themedPanel(this, 4, 52" "CampScene party panel below header (y=52)"

# UIOverlayScene: scrim at depth 999, buttons at depth 1000 (correct layering)
check_grep "$UIOVERLAY" "depth: 999"  "UIOverlayScene scrim at depth 999"
check_grep "$UIOVERLAY" ".setDepth(1000)" "UIOverlayScene buttons at depth 1000 (renders above scrim)"

# ─── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && echo "ALL CHECKS PASS" && exit 0
echo "SOME CHECKS FAILED"
exit 1
