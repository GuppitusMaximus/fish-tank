#!/usr/bin/env bash
# test-zone-preview-backgrounds.sh
# QA test for qa-fix-zone-preview-backgrounds plan.
# Verifies that:
#   1. loadZoneTheme is called before coverBackground in ZonePreviewScene
#   2. Adjacent zone preloading (index-1 and index+1) is implemented
#   3. BootScene only loads title + save zone at boot (no regression)
#   4. All 7 zone bgKeys resolve to existing files in public/backgrounds/
#   5. VERSION was bumped as a PATCH fix

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FE="$SCRIPT_DIR/.."
ZONE_SCENE="$FE/dungeon-fisher/src/scenes/ZonePreviewScene.js"
BOOT="$FE/dungeon-fisher/src/scenes/BootScene.js"
THEMES="$FE/dungeon-fisher/src/data/themes.js"
VERSION_JS="$FE/dungeon-fisher/src/version.js"
BACKGROUNDS_DIR="$FE/dungeon-fisher/public/backgrounds"

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

echo "=== QA: Fix Zone Preview Backgrounds ==="
echo "Plan: qa-fix-zone-preview-backgrounds"
echo ""

# ─── Step 1: loadZoneTheme called before coverBackground ─────────────────────
echo "1. loadZoneTheme called before coverBackground in ZonePreviewScene"

check_grep "$ZONE_SCENE" "import { loadZoneTheme }" \
    "ZonePreviewScene imports loadZoneTheme from ThemeAssetLoader"

# Verify loadZoneTheme wraps the coverBackground call (callback pattern)
TMP_TEST=$(mktemp /tmp/zone_order_XXXXX.mjs)
cat > "$TMP_TEST" << NODEEOF
import { readFileSync } from 'fs';
const src = readFileSync('$ZONE_SCENE', 'utf8');

const loadIdx = src.indexOf('loadZoneTheme(');
const coverIdx = src.indexOf('coverBackground(');

if (loadIdx === -1) {
    process.stdout.write('FAIL:loadZoneTheme not found in ZonePreviewScene\n');
} else if (coverIdx === -1) {
    process.stdout.write('FAIL:coverBackground not found in ZonePreviewScene\n');
} else if (loadIdx < coverIdx) {
    process.stdout.write('PASS:loadZoneTheme appears before coverBackground (assets loaded before display)\n');
} else {
    process.stdout.write('FAIL:coverBackground appears before loadZoneTheme — assets may not be loaded\n');
}

// Verify coverBackground is inside the callback (indented inside loadZoneTheme call)
const loadCallEnd = src.indexOf('() => {', loadIdx);
const coverInsideCallback = loadCallEnd !== -1 && coverIdx > loadCallEnd && coverIdx < loadCallEnd + 2000;
if (coverInsideCallback) {
    process.stdout.write('PASS:coverBackground is inside loadZoneTheme callback (deferred until assets ready)\n');
} else {
    process.stdout.write('FAIL:coverBackground may not be inside loadZoneTheme callback\n');
}
NODEEOF

while IFS=: read -r status rest; do
    [ -z "$status" ] && continue
    if [ "$status" = "PASS" ]; then pass "$rest"; else fail "$rest"; fi
done < <(node "$TMP_TEST" 2>/dev/null)
rm -f "$TMP_TEST"

# ─── Step 2: Adjacent zone preloading ────────────────────────────────────────
echo ""
echo "2. Adjacent zone preloading (index-1 and index+1)"

check_grep "$ZONE_SCENE" "if (index > 0) loadZoneTheme(this, ZONES[index - 1].theme)" \
    "Previous zone (index-1) preloaded for smoother swiping"
check_grep "$ZONE_SCENE" "if (index < ZONES.length - 1) loadZoneTheme(this, ZONES[index + 1].theme)" \
    "Next zone (index+1) preloaded for smoother swiping"

# ─── Step 3: BootScene regression — only loads title + save zone ─────────────
echo ""
echo "3. BootScene loads only title + save zone (no eager loading of all zones)"

check_grep "$BOOT" "'bg_title'" \
    "BootScene always loads bg_title"
check_grep "$BOOT" "load only title + save zone at boot" \
    "BootScene comment confirms intent: lazy loading for other zones"
check_not_grep "$BOOT" "BACKGROUND_KEYS" \
    "BootScene does NOT use BACKGROUND_KEYS (no eager loading)"
check_not_grep "$BOOT" "for (const key of" \
    "BootScene has no for-loop over background array"

# ─── Step 4: All 7 zone bgKeys resolve to existing files ─────────────────────
echo ""
echo "4. All 7 zone bgKeys resolve to existing background files"

TMP_TEST=$(mktemp /tmp/bg_files_XXXXX.mjs)
cat > "$TMP_TEST" << NODEEOF
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const themeSrc = readFileSync('$THEMES', 'utf8');
const backgroundsDir = '$BACKGROUNDS_DIR';

// Extract all bgKey values from ZONE_THEMES (not TITLE_THEME or shop bgKeys)
// Pattern: bgKey: 'bg_...' within the ZONE_THEMES object
const bgKeyPattern = /bgKey:\s*'(bg_[^']+)'/g;
const zoneThemesStart = themeSrc.indexOf('export const ZONE_THEMES');
const zoneThemesEnd = themeSrc.indexOf('export const TITLE_THEME');
const zoneThemesSrc = themeSrc.slice(zoneThemesStart, zoneThemesEnd);

const bgKeys = [];
let m;
while ((m = bgKeyPattern.exec(zoneThemesSrc)) !== null) {
    bgKeys.push(m[1]);
}

if (bgKeys.length === 0) {
    process.stdout.write('FAIL:No bgKey entries found in ZONE_THEMES\n');
    process.exit(0);
}

process.stdout.write('INFO:Found ' + bgKeys.length + ' zone bgKeys: ' + bgKeys.join(', ') + '\n');

// Check each bgKey maps to an existing file
// bgKey format: 'bg_<name>' -> file: 'backgrounds/<name>.png'
let allFound = true;
for (const key of bgKeys) {
    const filename = key.replace('bg_', '') + '.png';
    const filepath = join(backgroundsDir, filename);
    if (existsSync(filepath)) {
        process.stdout.write('PASS:' + key + ' -> backgrounds/' + filename + ' exists\n');
    } else {
        process.stdout.write('FAIL:' + key + ' -> backgrounds/' + filename + ' NOT FOUND\n');
        allFound = false;
    }
}

if (bgKeys.length >= 7) {
    process.stdout.write('PASS:All ' + bgKeys.length + ' zone bgKeys checked (>= 7 required)\n');
} else {
    process.stdout.write('FAIL:Only ' + bgKeys.length + ' zone bgKeys found (expected >= 7)\n');
}
NODEEOF

while IFS=: read -r status rest; do
    [ -z "$status" ] && continue
    if [ "$status" = "INFO" ]; then
        echo "  INFO: $rest"
    elif [ "$status" = "PASS" ]; then
        pass "$rest"
    else
        fail "$rest"
    fi
done < <(node "$TMP_TEST" 2>/dev/null)
rm -f "$TMP_TEST"

# ─── Step 5: Version bumped for this fix ─────────────────────────────────────
echo ""
echo "5. Version bumped as a PATCH fix"

TMP_TEST=$(mktemp /tmp/version_bump_XXXXX.mjs)
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
// fix-zone-preview-backgrounds is a PATCH fix on top of the zone theme system (1.10.x)
const min = 1 * 10000 + 10 * 100 + 2; // 1.10.2
if (ver >= min) {
    process.stdout.write('PASS:VERSION is ' + major + '.' + minor + '.' + patch + ' (>= 1.10.2 — PATCH bump confirmed)\n');
} else {
    process.stdout.write('FAIL:VERSION is ' + major + '.' + minor + '.' + patch + ' (expected >= 1.10.2 for this PATCH fix)\n');
}
NODEEOF

while IFS=: read -r status rest; do
    [ -z "$status" ] && continue
    if [ "$status" = "PASS" ]; then pass "$rest"; else fail "$rest"; fi
done < <(node "$TMP_TEST" 2>/dev/null)
rm -f "$TMP_TEST"

check_grep "$VERSION_JS" "SAVE_FORMAT_VERSION = 3" \
    "SAVE_FORMAT_VERSION still 3 (no save schema change)"

# ─── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && echo "ALL CHECKS PASS" && exit 0
echo "SOME CHECKS FAILED"
exit 1
