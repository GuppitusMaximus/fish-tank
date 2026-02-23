#!/bin/bash
# QA: gen-wide-atlas-sewers
# Verifies wide sewer atlas generation, integration, and code wiring.

PASS=0
FAIL=0

ok() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

ROOT="/Users/guppy/FishTank/FrontEnds/dungeon-fisher"
ATLAS="$ROOT/public/atlases/sewers_wide.png"
THEMES="$ROOT/src/data/themes.js"
BOOT="$ROOT/src/scenes/BootScene.js"
LOADER="$ROOT/src/systems/ThemeAssetLoader.js"
FLOOR="$ROOT/src/scenes/FloorScene.js"
VERSION="$ROOT/src/version.js"

# ── Step 1: File exists and is valid PNG ────────────────────────────────────
if [ -f "$ATLAS" ]; then
    ok "sewers_wide.png exists"
else
    fail "sewers_wide.png not found at $ATLAS"
fi

# Check PNG magic bytes
PNG_SIG=$(python3 -c "
import sys
with open('$ATLAS', 'rb') as f:
    sig = f.read(8)
print('ok' if sig == b'\x89PNG\r\n\x1a\n' else 'bad')
" 2>/dev/null)
if [ "$PNG_SIG" = "ok" ]; then
    ok "sewers_wide.png has valid PNG signature"
else
    fail "sewers_wide.png has invalid PNG signature"
fi

# ── Step 2: File size >5KB ───────────────────────────────────────────────────
FSIZE=$(wc -c < "$ATLAS" | tr -d ' ')
if [ "$FSIZE" -gt 5120 ]; then
    ok "sewers_wide.png is ${FSIZE} bytes (>5KB)"
else
    fail "sewers_wide.png is only ${FSIZE} bytes (<5KB, likely a stub)"
fi

# ── Step 3: Dimensions 256x128 ──────────────────────────────────────────────
DIMS=$(python3 -c "
import struct
with open('$ATLAS', 'rb') as f:
    f.read(16)  # skip: 8 sig + 4 chunk_len + 4 chunk_type (IHDR)
    w = struct.unpack('>I', f.read(4))[0]
    h = struct.unpack('>I', f.read(4))[0]
print(f'{w}x{h}')
" 2>/dev/null)
if [ "$DIMS" = "256x128" ]; then
    ok "sewers_wide.png dimensions are 256x128"
else
    fail "sewers_wide.png dimensions are $DIMS (expected 256x128)"
fi

# ── Step 4: ZONE_THEMES.sewers.wideAtlasKey = 'atlas_sewers_wide' ───────────
if grep -q "wideAtlasKey: 'atlas_sewers_wide'" "$THEMES"; then
    ok "ZONE_THEMES.sewers has wideAtlasKey: 'atlas_sewers_wide'"
else
    fail "ZONE_THEMES.sewers missing wideAtlasKey: 'atlas_sewers_wide' in $THEMES"
fi

# ── Step 5: BootScene loads wide atlas ──────────────────────────────────────
if grep -q "zone.wideAtlasKey" "$BOOT" && grep -q "wideAtlasKey.*atlases" "$BOOT"; then
    ok "BootScene preloads wideAtlasKey"
else
    fail "BootScene does not preload wideAtlasKey"
fi

# Check correct filename pattern: atlases/${zone.id}_wide.png
if grep -q "atlases/\${zone.id}_wide.png" "$BOOT"; then
    ok "BootScene uses correct filename pattern for wide atlas"
else
    fail "BootScene wide atlas filename pattern incorrect (expected atlases/\${zone.id}_wide.png)"
fi

# ── Step 6: ThemeAssetLoader handles wideAtlasKey ───────────────────────────
if grep -q "needsWide" "$LOADER"; then
    ok "ThemeAssetLoader checks needsWide for wideAtlasKey zones"
else
    fail "ThemeAssetLoader missing needsWide check"
fi

if grep -q "wideAtlasKey.*atlases/\${zoneTheme.id}_wide.png" "$LOADER" || \
   grep -q "zoneTheme.id.*_wide.png" "$LOADER"; then
    ok "ThemeAssetLoader loads wide atlas with correct filename"
else
    fail "ThemeAssetLoader missing wide atlas load with correct filename"
fi

# ── Step 7: FloorScene uses wide atlas for info panel ───────────────────────
if grep -q "infoPanelTheme" "$FLOOR" && grep -q "wideAtlasKey.*atlasKey.*wideAtlasKey" "$FLOOR"; then
    ok "FloorScene overrides atlasKey with wideAtlasKey for info panel"
else
    # Check with slightly looser pattern
    if grep -q "atlasKey: zone.wideAtlasKey" "$FLOOR"; then
        ok "FloorScene overrides atlasKey with wideAtlasKey for info panel"
    else
        fail "FloorScene does not use wideAtlasKey as atlasKey for info panel"
    fi
fi

# ── Step 8: NEAREST filter applied to wide atlas ────────────────────────────
if grep -q "wideAtlasKey.*setFilter.*NEAREST\|wideAtlasKey.*FilterMode.NEAREST" "$LOADER" || \
   (grep -q "wideAtlasKey" "$LOADER" && grep -q "FilterMode.NEAREST" "$LOADER"); then
    ok "ThemeAssetLoader sets NEAREST filter on wide atlas texture"
else
    fail "ThemeAssetLoader does not set NEAREST filter on wide atlas"
fi

# ── Step 9: Version bumped ───────────────────────────────────────────────────
# Get current version — should be at least 1.10.23
VERSION_NUM=$(grep -oE "[0-9]+\.[0-9]+\.[0-9]+" "$VERSION" | head -1)
PREV_VERSION="1.10.22"
if [ "$(printf '%s\n' "$PREV_VERSION" "$VERSION_NUM" | sort -V | tail -1)" = "$VERSION_NUM" ] && \
   [ "$VERSION_NUM" != "$PREV_VERSION" ]; then
    ok "Version bumped to $VERSION_NUM (was $PREV_VERSION)"
else
    fail "Version $VERSION_NUM not bumped past $PREV_VERSION"
fi

# ─── Summary ────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"
if [ $FAIL -eq 0 ]; then
    echo "ALL CHECKS PASSED"
    exit 0
else
    echo "SOME CHECKS FAILED"
    exit 1
fi
