#!/usr/bin/env bash
# test-zone-theme-lazy-loading.sh
# QA test for qa-zone-theme-lazy-loading plan.
# Verifies selective asset loading at boot and lazy zone loading in FloorScene.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FE="$SCRIPT_DIR/.."
THEME_LOADER="$FE/dungeon-fisher/src/systems/ThemeAssetLoader.js"
BOOT="$FE/dungeon-fisher/src/scenes/BootScene.js"
FLOOR="$FE/dungeon-fisher/src/scenes/FloorScene.js"
THEMES="$FE/dungeon-fisher/src/data/themes.js"
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

echo "=== Zone Theme Lazy Loading QA ==="
echo "Plan: qa-zone-theme-lazy-loading"
echo ""

# ─── Step 1: ThemeAssetLoader module exists and exports correctly ─────────────
echo "1. ThemeAssetLoader module"
if [ -f "$THEME_LOADER" ]; then
    pass "ThemeAssetLoader.js exists at src/systems/ThemeAssetLoader.js"
else
    fail "ThemeAssetLoader.js missing at src/systems/ThemeAssetLoader.js"
fi

check_grep "$THEME_LOADER" "export function loadZoneTheme"    "loadZoneTheme is exported"
check_grep "$THEME_LOADER" "export function unloadZoneTheme"  "unloadZoneTheme is exported"
check_grep "$THEME_LOADER" "export function isZoneLoaded"     "isZoneLoaded is exported"
check_not_grep "$THEME_LOADER" "export default" "ThemeAssetLoader uses named exports only"

# loadZoneTheme accepts scene, zoneTheme, and optional onComplete
check_grep "$THEME_LOADER" "loadZoneTheme(scene, zoneTheme" "loadZoneTheme signature accepts scene and zoneTheme"

# loadedZones is a module-level Set used for tracking
check_grep "$THEME_LOADER" "new Set()" "loadedZones uses a Set for tracking"
check_grep "$THEME_LOADER" "loadedZones.has" "loadZoneTheme checks if zone is already loaded"
check_grep "$THEME_LOADER" "loadedZones.add" "loadZoneTheme marks zone as loaded after complete"
check_grep "$THEME_LOADER" "loadedZones.delete" "unloadZoneTheme removes zone from tracking"

# unloadZoneTheme only removes atlas, not background
check_grep "$THEME_LOADER" "atlasKey" "ThemeAssetLoader handles atlasKey (zone-specific atlas)"
check_not_grep "$THEME_LOADER" "textures.remove(zoneTheme.bgKey)" \
    "unloadZoneTheme does NOT remove background texture (only atlas)"

# load.start() triggers the async load
check_grep "$THEME_LOADER" "scene.load.start()" "loadZoneTheme starts the Phaser loader"
check_grep "$THEME_LOADER" "load.once('complete'" "loadZoneTheme hooks into loader complete event"

# ─── Step 2: BootScene selective loading ──────────────────────────────────────
echo ""
echo "2. BootScene selective loading"

# BootScene must NOT import BACKGROUND_KEYS (old eager-loading approach removed)
check_not_grep "$BOOT" "BACKGROUND_KEYS" \
    "BootScene does NOT import or use BACKGROUND_KEYS array"

# BootScene must NOT do a loop over all zone backgrounds
check_not_grep "$BOOT" "for (const key of BACKGROUND" \
    "BootScene has no for-loop over background keys array"

# BootScene imports the new selective sources
check_grep "$BOOT" "import { getZoneByFloor }" "BootScene imports getZoneByFloor for save zone lookup"
check_grep "$BOOT" "import SaveSystem"         "BootScene imports SaveSystem to check for existing save"

# bg_title always loaded
check_grep "$BOOT" "'bg_title'" "BootScene always loads bg_title"

# Conditional save zone loading
check_grep "$BOOT" "SaveSystem.hasSave()" "BootScene checks for existing save before loading save zone bg"
check_grep "$BOOT" "SaveSystem.load()"    "BootScene reads save data to get the saved floor"
check_grep "$BOOT" "getZoneByFloor(saveData.floor)" "BootScene derives zone from saved floor"

# Shared assets still loaded at boot
check_grep "$BOOT" "fish_"    "Fish sprites still loaded at boot (shared assets)"
check_grep "$BOOT" "monster_" "Monster sprites still loaded at boot (shared assets)"
check_grep "$BOOT" "fisher_"  "Fisher portraits still loaded at boot (shared assets)"
check_grep "$BOOT" "merchant_rat" "Merchant sprite still loaded at boot"

# ─── Step 3: FloorScene lazy loading integration ──────────────────────────────
echo ""
echo "3. FloorScene lazy loading integration"

# FloorScene imports both load/unload functions
check_grep "$FLOOR" "import { loadZoneTheme, unloadZoneTheme }" \
    "FloorScene imports loadZoneTheme and unloadZoneTheme"

# Previous zone tracking via registry
check_grep "$FLOOR" "registry.get('previousZone')" "FloorScene reads previousZone from registry"
check_grep "$FLOOR" "registry.set('previousZone', zone)" "FloorScene stores current zone as previousZone"

# Old zone unloaded on transition
check_grep "$FLOOR" "unloadZoneTheme(this, prevZone)" "FloorScene calls unloadZoneTheme for previous zone"

# Lazy load: only loads bg if texture missing
TMP_TEST=$(mktemp /tmp/floor_lazy_XXXXX.mjs)
cat > "$TMP_TEST" << NODEEOF
import { readFileSync } from 'fs';
const src = readFileSync('$FLOOR', 'utf8');

// create() must check texture existence before calling onZoneReady
const createStart = src.indexOf('create() {');
if (createStart === -1) {
    process.stdout.write('FAIL:create() method definition not found\n');
    process.exit(0);
}

const block = src.slice(createStart, createStart + 900);
const textureCheck = block.indexOf('textures.exists');
const lazyLoad     = block.indexOf('loadZoneTheme');
const onReady      = block.indexOf('onZoneReady');
const returnStmt   = block.indexOf('return;');

if (textureCheck === -1) {
    process.stdout.write('FAIL:create() does not check textures.exists before rendering\n');
} else {
    process.stdout.write('PASS:create() checks textures.exists for bg before rendering\n');
}

if (lazyLoad !== -1 && onReady !== -1 && returnStmt !== -1 && returnStmt > lazyLoad) {
    process.stdout.write('PASS:create() early-returns after queuing lazy load (defers scene build)\n');
} else {
    process.stdout.write('FAIL:create() does not defer scene build when bg is missing\n');
}
NODEEOF

while IFS=: read -r status rest; do
    [ -z "$status" ] && continue
    if [ "$status" = "PASS" ]; then pass "$rest"; else fail "$rest"; fi
done < <(node "$TMP_TEST" 2>/dev/null)
rm -f "$TMP_TEST"

# onZoneReady method exists and calls buildFloorUI
check_grep "$FLOOR" "onZoneReady()"    "FloorScene has onZoneReady() method"
check_grep "$FLOOR" "buildFloorUI()"  "FloorScene onZoneReady calls buildFloorUI"

# ─── Step 4: ThemeAssetLoader graceful atlas error handling ───────────────────
echo ""
echo "4. ThemeAssetLoader graceful atlas error handling"

# When both bg and atlas are needed, atlas load failure shouldn't crash
# The complete event fires even on loader errors in Phaser 3
check_grep "$THEME_LOADER" "load.once('complete'" \
    "Uses Phaser complete event (fires even on file errors — graceful fallback)"

# If already loaded, returns immediately (idempotent)
TMP_TEST=$(mktemp /tmp/loader_idempotent_XXXXX.mjs)
cat > "$TMP_TEST" << NODEEOF
import { readFileSync } from 'fs';
const src = readFileSync('$THEME_LOADER', 'utf8');

// loadZoneTheme should have an early return when zone is already in loadedZones
const fnStart = src.indexOf('export function loadZoneTheme');
if (fnStart === -1) {
    process.stdout.write('FAIL:loadZoneTheme function not found\n');
    process.exit(0);
}
const block = src.slice(fnStart, fnStart + 500);
const hasAlreadyCheck = block.includes('loadedZones.has') && block.includes('return;');
if (hasAlreadyCheck) {
    process.stdout.write('PASS:loadZoneTheme early-returns if zone already loaded (idempotent)\n');
} else {
    process.stdout.write('FAIL:loadZoneTheme does not early-return for already-loaded zones\n');
}

// Second early return: if all textures already exist (recovered from failed Set but textures present)
const allLoadedCheck = block.includes('!needsBg && !needsAtlas');
if (allLoadedCheck) {
    process.stdout.write('PASS:loadZoneTheme early-returns if all textures already exist\n');
} else {
    process.stdout.write('FAIL:loadZoneTheme missing texture-existence early-return\n');
}
NODEEOF

while IFS=: read -r status rest; do
    [ -z "$status" ] && continue
    if [ "$status" = "PASS" ]; then pass "$rest"; else fail "$rest"; fi
done < <(node "$TMP_TEST" 2>/dev/null)
rm -f "$TMP_TEST"

# Atlas path uses zone ID for filename
check_grep "$THEME_LOADER" "atlases/\${zoneTheme.id}" \
    "Atlas path derived from zone ID (atlases/<id>.png and .json)"

# ─── Step 5: No regressions ───────────────────────────────────────────────────
echo ""
echo "5. No regressions"

# SAVE_FORMAT_VERSION still 3
check_grep "$VERSION_JS" "SAVE_FORMAT_VERSION = 3" "SAVE_FORMAT_VERSION is still 3 (no schema change)"

# VERSION >= 1.9.0 (lazy loading plan bumped version)
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
const min = 1 * 10000 + 9 * 100 + 0; // 1.9.0
if (ver >= min) {
    process.stdout.write('PASS:VERSION is ' + major + '.' + minor + '.' + patch + ' (>= 1.9.0, lazy loading plan applied)\n');
} else {
    process.stdout.write('FAIL:VERSION is ' + major + '.' + minor + '.' + patch + ' (expected >= 1.9.0)\n');
}
NODEEOF

while IFS=: read -r status rest; do
    [ -z "$status" ] && continue
    if [ "$status" = "PASS" ]; then pass "$rest"; else fail "$rest"; fi
done < <(node "$TMP_TEST" 2>/dev/null)
rm -f "$TMP_TEST"

# themes.js defines ZONE_THEMES with all 7 zones having bgKey and atlasKey
TMP_TEST=$(mktemp /tmp/themes_check_XXXXX.mjs)
cat > "$TMP_TEST" << NODEEOF
import { readFileSync } from 'fs';
const src = readFileSync('$THEMES', 'utf8');

// Count zones with bgKey
const bgKeyCount = (src.match(/bgKey:/g) || []).length;
// Count zones with atlasKey
const atlasKeyCount = (src.match(/atlasKey:/g) || []).length;

if (bgKeyCount >= 7) {
    process.stdout.write('PASS:themes.js defines bgKey for all zones (' + bgKeyCount + ' found, >=7 expected)\n');
} else {
    process.stdout.write('FAIL:themes.js only has ' + bgKeyCount + ' bgKey entries (expected >=7)\n');
}

if (atlasKeyCount >= 7) {
    process.stdout.write('PASS:themes.js defines atlasKey for all zones (' + atlasKeyCount + ' found, >=7 expected)\n');
} else {
    process.stdout.write('FAIL:themes.js only has ' + atlasKeyCount + ' atlasKey entries (expected >=7)\n');
}

// getZoneByFloor exported
if (src.includes('export function getZoneByFloor')) {
    process.stdout.write('PASS:themes.js exports getZoneByFloor function\n');
} else {
    process.stdout.write('FAIL:themes.js does not export getZoneByFloor\n');
}
NODEEOF

while IFS=: read -r status rest; do
    [ -z "$status" ] && continue
    if [ "$status" = "PASS" ]; then pass "$rest"; else fail "$rest"; fi
done < <(node "$TMP_TEST" 2>/dev/null)
rm -f "$TMP_TEST"

# BACKGROUND_KEYS still exported from zones.js (used by ZonePreviewScene)
ZONES_JS="$FE/dungeon-fisher/src/utils/zones.js"
check_grep "$ZONES_JS" "export const BACKGROUND_KEYS" \
    "zones.js still exports BACKGROUND_KEYS (used by ZonePreviewScene)"

# ─── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && echo "ALL CHECKS PASS" && exit 0
echo "SOME CHECKS FAILED"
exit 1
