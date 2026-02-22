#!/usr/bin/env bash
# test-zone-theme-data-layer.sh
# QA test for qa-zone-theme-data-layer plan.
# Verifies themes.js registry completeness, floor-range accuracy, background key parity,
# shop data parity, flavor text, ambient data, character/title themes, and no stale refs.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FE="$SCRIPT_DIR/.."
THEMES="$FE/dungeon-fisher/src/data/themes.js"
ZONES_JS="$FE/dungeon-fisher/src/utils/zones.js"
EFFECTS="$FE/dungeon-fisher/src/effects/BackgroundEffects.js"
FLOOR="$FE/dungeon-fisher/src/scenes/FloorScene.js"
ZONE_PREVIEW="$FE/dungeon-fisher/src/scenes/ZonePreviewScene.js"

PASS=0
FAIL=0

pass() { echo "  PASS: $1"; PASS=$((PASS+1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL+1)); }
check_grep() {
    grep -qF "$2" "$1" 2>/dev/null && pass "$3" || fail "$3"
}

echo "=== Zone Theme Data Layer QA ==="
echo "Plan: qa-zone-theme-data-layer"
echo ""

# ─── Step 1: Theme registry exports ───────────────────────────────────────────
echo "1. Theme registry exports"
check_grep "$THEMES" "export const ZONE_THEMES"        "themes.js exports ZONE_THEMES"
check_grep "$THEMES" "export const TITLE_THEME"        "themes.js exports TITLE_THEME"
check_grep "$THEMES" "export const CHARACTER_THEMES"   "themes.js exports CHARACTER_THEMES"
check_grep "$THEMES" "export function getZoneByFloor"  "themes.js exports getZoneByFloor"
check_grep "$THEMES" "export function getZoneTheme"    "themes.js exports getZoneTheme"
check_grep "$THEMES" "export function getCharacterTheme" "themes.js exports getCharacterTheme"

# ─── Step 1b: ZONE_THEMES has exactly 7 entries ────────────────────────────────
echo ""
echo "2. ZONE_THEMES has all 7 zone entries"
for zone in sewers goblin_caves bone_crypts deep_dungeon shadow_realm ancient_chambers dungeon_heart; do
    check_grep "$THEMES" "$zone:" "ZONE_THEMES entry: $zone"
done

# ─── Step 1c: Each zone has required fields ────────────────────────────────────
echo ""
echo "3. Required zone fields"
for field in id name floorRange bgKey flavor panel atlasKey shop; do
    COUNT=$(grep -c "^\s*$field:" "$THEMES" 2>/dev/null || echo 0)
    if [ "$COUNT" -ge 7 ]; then
        pass "field '$field' present in all 7 zones (found $COUNT)"
    else
        fail "field '$field' appears only $COUNT times (expected >=7)"
    fi
done

# panel sub-fields
for sub in fill outer inner accent; do
    check_grep "$THEMES" "$sub:" "panel has $sub sub-field"
done

# ─── Step 2: Floor range accuracy via Node ────────────────────────────────────
echo ""
echo "4. Floor range boundary testing"

TMP_TEST=$(mktemp /tmp/themes_floor_test_XXXXX.mjs)
cat > "$TMP_TEST" << NODEEOF
import { getZoneByFloor } from 'file://$THEMES';

const tests = [
  [1,   'sewers'],           [10,  'sewers'],
  [11,  'goblin_caves'],     [20,  'goblin_caves'],
  [21,  'bone_crypts'],      [30,  'bone_crypts'],
  [31,  'deep_dungeon'],     [50,  'deep_dungeon'],
  [51,  'shadow_realm'],     [70,  'shadow_realm'],
  [71,  'ancient_chambers'], [90,  'ancient_chambers'],
  [91,  'dungeon_heart'],    [100, 'dungeon_heart'],
];

for (const [floor, expected] of tests) {
  const zone = getZoneByFloor(floor);
  const got = zone ? zone.id : 'null';
  const status = (got === expected) ? 'PASS' : 'FAIL';
  process.stdout.write(status + ':floor ' + floor + ' -> ' + expected + ' (got: ' + got + ')\n');
}
NODEEOF

while IFS=: read -r status rest; do
    [ -z "$status" ] && continue
    if [ "$status" = "PASS" ]; then
        pass "$rest"
        PASS=$((PASS+1))
    else
        fail "$rest"
        FAIL=$((FAIL+1))
    fi
done < <(node "$TMP_TEST" 2>/dev/null)
rm -f "$TMP_TEST"

# ─── Step 3: Background key parity ────────────────────────────────────────────
echo ""
echo "5. Background key parity"

TMP_TEST=$(mktemp /tmp/themes_bgkey_test_XXXXX.mjs)
cat > "$TMP_TEST" << NODEEOF
import { BACKGROUND_KEYS } from 'file://$ZONES_JS';

const expected = [
  'bg_sewers', 'bg_goblin-caves', 'bg_bone-crypts', 'bg_deep-dungeon',
  'bg_shadow-realm', 'bg_ancient-chambers', 'bg_dungeon-heart', 'bg_title'
];

// Check count
const status = BACKGROUND_KEYS.length === 8 ? 'PASS' : 'FAIL';
process.stdout.write(status + ':BACKGROUND_KEYS has 8 entries (got: ' + BACKGROUND_KEYS.length + ')\n');

// Check each expected key exists
for (const key of expected) {
  const found = BACKGROUND_KEYS.includes(key);
  process.stdout.write((found ? 'PASS' : 'FAIL') + ':BACKGROUND_KEYS includes ' + key + '\n');
}
NODEEOF

while IFS=: read -r status rest; do
    [ -z "$status" ] && continue
    if [ "$status" = "PASS" ]; then
        pass "$rest"
        PASS=$((PASS+1))
    else
        fail "$rest"
        FAIL=$((FAIL+1))
    fi
done < <(node "$TMP_TEST" 2>/dev/null)
rm -f "$TMP_TEST"

# getBackgroundKey parity
TMP_TEST=$(mktemp /tmp/themes_bgfunc_test_XXXXX.mjs)
cat > "$TMP_TEST" << NODEEOF
import { getBackgroundKey } from 'file://$ZONES_JS';
import { getZoneByFloor } from 'file://$THEMES';

const testFloors = [1, 10, 11, 20, 21, 30, 31, 50, 51, 70, 71, 90, 91, 100];
let allOk = true;
for (const floor of testFloors) {
  const fromFn = getBackgroundKey(floor);
  const fromZone = getZoneByFloor(floor).bgKey;
  if (fromFn !== fromZone) { allOk = false; }
}
process.stdout.write((allOk ? 'PASS' : 'FAIL') + ':getBackgroundKey matches getZoneByFloor().bgKey for all test floors\n');
NODEEOF

while IFS=: read -r status rest; do
    [ -z "$status" ] && continue
    if [ "$status" = "PASS" ]; then pass "$rest"; PASS=$((PASS+1))
    else fail "$rest"; FAIL=$((FAIL+1)); fi
done < <(node "$TMP_TEST" 2>/dev/null)
rm -f "$TMP_TEST"

# ─── Step 4: Shop data parity ─────────────────────────────────────────────────
echo ""
echo "6. Shop data parity"

TMP_TEST=$(mktemp /tmp/themes_shop_test_XXXXX.mjs)
cat > "$TMP_TEST" << NODEEOF
import { getShopCardKey, getShopBackground, getShopMerchant, getShopName } from 'file://$ZONES_JS';

const ok = (label, got, expected) => {
  const pass = got === expected;
  process.stdout.write((pass ? 'PASS' : 'FAIL') + ':' + label + ' (got: ' + JSON.stringify(got) + ', expected: ' + JSON.stringify(expected) + ')\n');
};

// Only sewers (floors 1-10) has custom bg + merchant
ok('getShopBackground(1) = bg_shop_sewers', getShopBackground(1), 'bg_shop_sewers');
ok('getShopBackground(11) = null', getShopBackground(11), null);
ok('getShopBackground(50) = null', getShopBackground(50), null);
ok('getShopMerchant(1) = merchant_rat', getShopMerchant(1), 'merchant_rat');
ok('getShopMerchant(11) = null', getShopMerchant(11), null);
ok('getShopMerchant(100) = null', getShopMerchant(100), null);

// Shop card keys (one per zone)
ok("getShopCardKey(1) = card_shop_sewers", getShopCardKey(1), 'card_shop_sewers');
ok("getShopCardKey(15) = card_shop_goblin", getShopCardKey(15), 'card_shop_goblin');
ok("getShopCardKey(25) = card_shop_crypts", getShopCardKey(25), 'card_shop_crypts');

// Shop names
const sewersName = getShopName(1);
ok("getShopName(1) returns non-empty string", typeof sewersName === 'string' && sewersName.length > 0, true);
NODEEOF

while IFS=: read -r status rest; do
    [ -z "$status" ] && continue
    if [ "$status" = "PASS" ]; then pass "$rest"; PASS=$((PASS+1))
    else fail "$rest"; FAIL=$((FAIL+1)); fi
done < <(node "$TMP_TEST" 2>/dev/null)
rm -f "$TMP_TEST"

# ─── Step 5: Flavor text — no stale getFlavorText in FloorScene ───────────────
echo ""
echo "7. Flavor text parity"
if grep -q 'getFlavorText' "$FLOOR" 2>/dev/null; then
    fail "FloorScene still has getFlavorText method (should be removed)"
else
    pass "FloorScene has no getFlavorText method"
fi
check_grep "$FLOOR" "getZoneByFloor" "FloorScene uses getZoneByFloor for flavor text"
check_grep "$FLOOR" ".flavor" "FloorScene accesses .flavor from zone data"

# Each zone's flavor in themes.js
for flavor_fragment in "echo around you" "echoes in the dark" "crunch underfoot" "air grows heavy" "Shadows move" "Ancient power" "heart beats"; do
    check_grep "$THEMES" "$flavor_fragment" "themes.js has flavor: '$flavor_fragment'"
done

# ─── Step 6: Ambient data — no stale ZONE_PRESETS ─────────────────────────────
echo ""
echo "8. Ambient preset parity"
if grep -q 'ZONE_PRESETS' "$EFFECTS" 2>/dev/null; then
    fail "BackgroundEffects.js still has ZONE_PRESETS (should be removed)"
else
    pass "BackgroundEffects.js has no ZONE_PRESETS constant"
fi
check_grep "$EFFECTS" "from '../data/themes.js'" "BackgroundEffects imports from themes.js"
check_grep "$EFFECTS" "zone.ambient" "BackgroundEffects reads ambient from zone object"

# Verify all 7 zones have ambient data in themes.js
for zone in sewers goblin_caves bone_crypts deep_dungeon shadow_realm ancient_chambers dungeon_heart; do
    result=$(node -e "
const fs = require('fs');
const src = fs.readFileSync('$THEMES', 'utf8');
const start = src.indexOf('$zone:');
if (start === -1) { console.log('missing'); process.exit(0); }
const nextZones = ['sewers:','goblin_caves:','bone_crypts:','deep_dungeon:','shadow_realm:','ancient_chambers:','dungeon_heart:','ZONE_LIST'];
let nextStart = src.length;
for (const z of nextZones) {
  if (z === '$zone:') continue;
  const pos = src.indexOf(z, start + '$zone:'.length);
  if (pos !== -1 && pos < nextStart) nextStart = pos;
}
const block = src.slice(start, nextStart);
const hasAmbient = block.includes('ambient:') && block.includes('particles:') && block.includes('ambientColor:');
console.log(hasAmbient ? 'pass' : 'fail');
" 2>/dev/null)
    if [ "$result" = "pass" ]; then
        pass "$zone has ambient data in themes.js"
    else
        fail "$zone missing ambient data in themes.js"
    fi
done

# addEffects signature unchanged
check_grep "$EFFECTS" "export function addEffects(scene, bgKey)" "addEffects(scene, bgKey) signature unchanged"

# ─── Step 7: Character and title themes ───────────────────────────────────────
echo ""
echo "9. Character and title themes"

TMP_TEST=$(mktemp /tmp/themes_char_test_XXXXX.mjs)
cat > "$TMP_TEST" << NODEEOF
import { CHARACTER_THEMES, TITLE_THEME, getCharacterTheme } from 'file://$THEMES';

const ok = (label, cond) =>
  process.stdout.write((cond ? 'PASS' : 'FAIL') + ':' + label + '\n');

// andy character theme fields
const andy = CHARACTER_THEMES.andy;
ok("CHARACTER_THEMES.andy exists", !!andy);
ok("andy has id field", 'id' in andy);
ok("andy has accent field", 'accent' in andy);
ok("andy has emblemKey field", 'emblemKey' in andy);
ok("andy has panelTint field", 'panelTint' in andy);

// getCharacterTheme
ok("getCharacterTheme('andy') returns andy", getCharacterTheme('andy') === andy);
ok("getCharacterTheme('unknown') returns andy (fallback)", getCharacterTheme('unknown') === andy);

// TITLE_THEME
ok("TITLE_THEME has id", 'id' in TITLE_THEME);
ok("TITLE_THEME has bgKey: bg_title", TITLE_THEME.bgKey === 'bg_title');
ok("TITLE_THEME has panel", 'panel' in TITLE_THEME);
ok("TITLE_THEME has atlasKey", 'atlasKey' in TITLE_THEME);
NODEEOF

while IFS=: read -r status rest; do
    [ -z "$status" ] && continue
    if [ "$status" = "PASS" ]; then pass "$rest"; PASS=$((PASS+1))
    else fail "$rest"; FAIL=$((FAIL+1)); fi
done < <(node "$TMP_TEST" 2>/dev/null)
rm -f "$TMP_TEST"

# ─── Step 8: No stale references ──────────────────────────────────────────────
echo ""
echo "10. No stale references"

# ZONE_PRESETS gone from BackgroundEffects
if grep -q 'const ZONE_PRESETS' "$EFFECTS" 2>/dev/null; then
    fail "ZONE_PRESETS constant still present in BackgroundEffects.js"
else
    pass "no ZONE_PRESETS constant in BackgroundEffects.js"
fi

# getFlavorText gone from FloorScene
if grep -q 'getFlavorText' "$FLOOR" 2>/dev/null; then
    fail "getFlavorText still present in FloorScene.js"
else
    pass "no getFlavorText in FloorScene.js"
fi

# ZonePreviewScene derives from ZONE_THEMES (not a private hardcoded array)
if grep -qF "Object.values(ZONE_THEMES)" "$ZONE_PREVIEW" 2>/dev/null; then
    pass "ZonePreviewScene derives ZONES from ZONE_THEMES"
else
    fail "ZonePreviewScene does not use ZONE_THEMES (expected Object.values(ZONE_THEMES))"
fi

# No hardcoded private ZONES array with old zone data in ZonePreviewScene
# Old pattern: { key: 'bg_sewers', name: 'The Sewers', ... } hardcoded
if grep -qF "bg_sewers" "$ZONE_PREVIEW" 2>/dev/null; then
    fail "ZonePreviewScene has hardcoded 'bg_sewers' (should derive from themes)"
else
    pass "ZonePreviewScene has no hardcoded zone bg keys"
fi

# All imports still resolve (check import statement presence)
check_grep "$ZONES_JS" "from '../data/themes.js'" "zones.js imports from themes.js"
check_grep "$EFFECTS" "from '../data/themes.js'" "BackgroundEffects imports from themes.js"
check_grep "$FLOOR" "from '../data/themes.js'" "FloorScene imports from themes.js"
check_grep "$ZONE_PREVIEW" "from '../data/themes.js'" "ZonePreviewScene imports from themes.js"

# ─── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && echo "ALL CHECKS PASS" && exit 0
echo "SOME CHECKS FAILED"
exit 1
