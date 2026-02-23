#!/usr/bin/env bash
# QA test: fix-atlas-brightness-and-card-depth
# Verifies wide atlas brightness, square atlas transparency, card depth ordering, and version bump.
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PASS=0
FAIL=0

check() {
    local desc="$1"
    local result="$2"
    if [ "$result" = "true" ]; then
        echo "PASS: $desc"
        PASS=$((PASS + 1))
    else
        echo "FAIL: $desc"
        FAIL=$((FAIL + 1))
    fi
}

# 1. Wide atlas is bright (R > 100 at corner pixel, indicating brightening applied)
WIDE_ATLAS="$ROOT/dungeon-fisher/public/atlases/sewers_wide.png"
if command -v python3 &>/dev/null && python3 -c "from PIL import Image" 2>/dev/null; then
    WIDE_R=$(python3 -c "
from PIL import Image
img = Image.open('$WIDE_ATLAS').convert('RGB')
r, g, b = img.getpixel((0, 0))
print(r)
")
    check "Wide atlas corner pixel R > 100 (brightened)" "$([ "$WIDE_R" -gt 100 ] && echo true || echo false)"
else
    echo "SKIP: PIL not available — wide atlas brightness check skipped"
fi

# 2. Square atlas has alpha channel
SQUARE_ATLAS="$ROOT/dungeon-fisher/public/atlases/sewers.png"
if command -v python3 &>/dev/null && python3 -c "from PIL import Image" 2>/dev/null; then
    HAS_ALPHA=$(python3 -c "
from PIL import Image
img = Image.open('$SQUARE_ATLAS')
print('yes' if 'A' in img.mode else 'no')
")
    check "Square atlas has alpha channel" "$([ "$HAS_ALPHA" = "yes" ] && echo true || echo false)"
else
    echo "SKIP: PIL not available — atlas alpha check skipped"
fi

# 3. Square atlas center pixel is transparent (alpha=0)
if command -v python3 &>/dev/null && python3 -c "from PIL import Image" 2>/dev/null; then
    CENTER_ALPHA=$(python3 -c "
from PIL import Image
img = Image.open('$SQUARE_ATLAS').convert('RGBA')
w, h = img.size
r, g, b, a = img.getpixel((w // 2, h // 2))
print(a)
")
    check "Square atlas center pixel has alpha=0 (transparent)" "$([ "$CENTER_ALPHA" -eq 0 ] && echo true || echo false)"
else
    echo "SKIP: PIL not available — atlas center alpha check skipped"
fi

# 4. Square atlas corner pixel is opaque (alpha=255)
if command -v python3 &>/dev/null && python3 -c "from PIL import Image" 2>/dev/null; then
    CORNER_ALPHA=$(python3 -c "
from PIL import Image
img = Image.open('$SQUARE_ATLAS').convert('RGBA')
r, g, b, a = img.getpixel((0, 0))
print(a)
")
    check "Square atlas corner pixel has alpha=255 (opaque)" "$([ "$CORNER_ALPHA" -eq 255 ] && echo true || echo false)"
else
    echo "SKIP: PIL not available — atlas corner alpha check skipped"
fi

FLOOR="$ROOT/dungeon-fisher/src/scenes/FloorScene.js"

# 5. Card image depth is 1
IMG_DEPTH=$(grep -c "setDepth(1)" "$FLOOR" || true)
check "Card image setDepth(1) present in FloorScene" "$([ "$IMG_DEPTH" -ge 1 ] && echo true || echo false)"

# 6. themedPanel called with depth: 2
PANEL_DEPTH=$(grep -c "depth: 2" "$FLOOR" || true)
check "themedPanel called with depth: 2 in FloorScene" "$([ "$PANEL_DEPTH" -ge 1 ] && echo true || echo false)"

# 7. Label depth is 3
LABEL_DEPTH=$(grep -c "setDepth(3)" "$FLOOR" || true)
check "Label setDepth(3) present in FloorScene" "$([ "$LABEL_DEPTH" -ge 1 ] && echo true || echo false)"

# 8. Hit zone depth is 4
HIT_DEPTH=$(grep -c "setDepth(4)" "$FLOOR" || true)
check "Hit zone setDepth(4) present in FloorScene" "$([ "$HIT_DEPTH" -ge 1 ] && echo true || echo false)"

# 9. Version is PATCH-bumped (>= 27)
VERSION=$(grep -o "'[0-9]*\.[0-9]*\.[0-9]*'" "$ROOT/dungeon-fisher/src/version.js" | tr -d "'")
PATCH=$(echo "$VERSION" | cut -d'.' -f3)
check "Version PATCH >= 27 (bumped from 1.10.26)" "$([ "$PATCH" -ge 27 ] && echo true || echo false)"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
