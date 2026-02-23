#!/bin/bash
# QA: fix-wide-atlas-crop
# Verifies the olive border was fully removed from sewers_wide.png
# and the stone frame fills the full 256x128 texture.

PASS=0
FAIL=0

ok() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

ATLAS="/Users/guppy/FishTank/FrontEnds/dungeon-fisher/public/atlases/sewers_wide.png"
VERSION="/Users/guppy/FishTank/FrontEnds/dungeon-fisher/src/version.js"

# ── Check 1: Valid PNG ────────────────────────────────────────────────────────
SIPS_OUT=$(sips -g all "$ATLAS" 2>&1)
if echo "$SIPS_OUT" | grep -q "format: png"; then
    ok "sewers_wide.png is a valid PNG"
else
    fail "sewers_wide.png sips validation failed"
fi

# ── Check 2: Dimensions 256x128 ──────────────────────────────────────────────
DIMS=$(python3 -c "
import struct
with open('$ATLAS', 'rb') as f:
    f.read(16)
    w = struct.unpack('>I', f.read(4))[0]
    h = struct.unpack('>I', f.read(4))[0]
print(f'{w}x{h}')
" 2>/dev/null)

if [ "$DIMS" = "256x128" ]; then
    ok "Dimensions are 256x128"
else
    fail "Dimensions are $DIMS (expected 256x128)"
fi

# ── Check 3: Corner pixels are NOT olive ────────────────────────────────────
CORNER_RESULT=$(python3 -c "
from PIL import Image

def is_olive(px):
    r, g, b, a = px
    brightness = r + g + b
    return g > r and g > b and brightness > 300 and brightness < 750

img = Image.open('$ATLAS').convert('RGBA')
corners = {
    '(0,0)': img.getpixel((0, 0)),
    '(255,0)': img.getpixel((255, 0)),
    '(0,127)': img.getpixel((0, 127)),
    '(255,127)': img.getpixel((255, 127)),
}
failures = []
for pos, px in corners.items():
    if is_olive(px):
        failures.append(f'{pos}=RGB{px[:3]}')
if failures:
    print('FAIL:' + ','.join(failures))
else:
    print('PASS')
" 2>/dev/null)

if [ "$CORNER_RESULT" = "PASS" ]; then
    ok "Corner pixels are not olive (dark stone/frame colors)"
else
    fail "Corner pixels are olive: $CORNER_RESULT"
fi

# ── Check 4: Edges are not predominantly olive ───────────────────────────────
EDGE_RESULT=$(python3 -c "
from PIL import Image

def is_olive(px):
    r, g, b, a = px
    brightness = r + g + b
    return g > r and g > b and brightness > 300 and brightness < 750

img = Image.open('$ATLAS').convert('RGBA')
w, h = img.size

edges = {
    'top': [img.getpixel((x, 0)) for x in range(w)],
    'bottom': [img.getpixel((x, h-1)) for x in range(w)],
    'left': [img.getpixel((0, y)) for y in range(h)],
    'right': [img.getpixel((w-1, y)) for y in range(h)],
}
failures = []
for edge, pixels in edges.items():
    olive_pct = 100 * sum(1 for px in pixels if is_olive(px)) // len(pixels)
    if olive_pct > 10:
        failures.append(f'{edge}={olive_pct}% olive')
if failures:
    print('FAIL:' + ', '.join(failures))
else:
    print('PASS')
" 2>/dev/null)

if [ "$EDGE_RESULT" = "PASS" ]; then
    ok "Edges are not olive (stone frame fills full texture)"
else
    fail "Edges still contain olive pixels: $EDGE_RESULT"
fi

# ── Check 5: Version bumped (>= 1.10.23) ────────────────────────────────────
VERSION_NUM=$(grep -oE "[0-9]+\.[0-9]+\.[0-9]+" "$VERSION" | head -1)
PREV_VERSION="1.10.22"
if [ "$(printf '%s\n' "$PREV_VERSION" "$VERSION_NUM" | sort -V | tail -1)" = "$VERSION_NUM" ] && \
   [ "$VERSION_NUM" != "$PREV_VERSION" ]; then
    ok "Version bumped to $VERSION_NUM (was >$PREV_VERSION)"
else
    fail "Version $VERSION_NUM not bumped past $PREV_VERSION"
fi

# ─── Summary ─────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"
if [ $FAIL -eq 0 ]; then
    echo "ALL CHECKS PASSED"
    exit 0
else
    echo "SOME CHECKS FAILED"
    exit 1
fi
