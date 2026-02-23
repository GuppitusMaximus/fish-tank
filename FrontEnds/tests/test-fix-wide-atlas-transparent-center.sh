#!/usr/bin/env bash
# QA: qa-fix-wide-atlas-transparent-center
# Verifies the sewers_wide atlas center is transparent,
# the stone frame edges remain opaque, scrim exists in FloorScene, and version was bumped.

set -euo pipefail
cd "$(dirname "$0")/.."

PASS=0
FAIL=0

check() {
    local desc="$1"
    local result="$2"
    if [ "$result" = "1" ]; then
        echo "PASS: $desc"
        PASS=$((PASS + 1))
    else
        echo "FAIL: $desc"
        FAIL=$((FAIL + 1))
    fi
}

ATLAS="dungeon-fisher/public/atlases/sewers_wide.png"

# --- Check 1: Alpha channel present ---
has_alpha=$(python3 -c "
from PIL import Image
img = Image.open('$ATLAS')
print(1 if img.mode in ('RGBA', 'LA', 'PA') else 0)
")
check "Alpha channel: sewers_wide.png has alpha (mode=RGBA)" "$has_alpha"

# --- Pixel checks via Python ---
python3 - <<'EOF' > /tmp/pixel_check.txt
from PIL import Image
img = Image.open('dungeon-fisher/public/atlases/sewers_wide.png').convert('RGBA')
px = img.load()

checks = [
    ('center_alpha_0', px[128, 64][3] == 0),
    ('corner_0_0', px[0, 0][3] == 255),
    ('corner_255_0', px[255, 0][3] == 255),
    ('corner_0_127', px[0, 127][3] == 255),
    ('corner_255_127', px[255, 127][3] == 255),
    ('edge_10_64', px[10, 64][3] == 255),
    ('edge_246_64', px[246, 64][3] == 255),
]
for name, result in checks:
    print(f"{name}={'1' if result else '0'}")
EOF

read_pixel() { grep "^$1=" /tmp/pixel_check.txt | cut -d= -f2; }

# --- Check 2: Center pixel transparent ---
check "Center transparent: pixel (128,64) has alpha=0" "$(read_pixel center_alpha_0)"

# --- Check 3: Corner pixels opaque ---
check "Frame opaque: corner (0,0) has alpha=255"     "$(read_pixel corner_0_0)"
check "Frame opaque: corner (255,0) has alpha=255"   "$(read_pixel corner_255_0)"
check "Frame opaque: corner (0,127) has alpha=255"   "$(read_pixel corner_0_127)"
check "Frame opaque: corner (255,127) has alpha=255" "$(read_pixel corner_255_127)"

# --- Check 4: Edge pixels within frame opaque ---
check "Edge opaque: pixel (10,64) has alpha=255"  "$(read_pixel edge_10_64)"
check "Edge opaque: pixel (246,64) has alpha=255" "$(read_pixel edge_246_64)"

# --- Check 5: Scrim rectangle exists in FloorScene ---
FLOOR="dungeon-fisher/src/scenes/FloorScene.js"
scrim_fill=$(grep -c '0x000000.*0\.4\|0x000000, 0\.4' "$FLOOR" || echo 0)
check "Scrim: FloorScene has rectangle with 0x000000 fill and ~0.4 alpha" "$([ "$scrim_fill" -ge 1 ] && echo 1 || echo 0)"

# --- Check 6: Version bumped (PATCH) ---
VERSION=$(node -e "import('./dungeon-fisher/src/version.js').then(m => console.log(m.VERSION))" 2>/dev/null \
    || grep "export const VERSION" dungeon-fisher/src/version.js | grep -oE "[0-9]+\.[0-9]+\.[0-9]+")
PATCH=$(echo "$VERSION" | cut -d. -f3)
check "Version bumped: PATCH > 23 (current=$VERSION)" "$([ "$PATCH" -gt 23 ] && echo 1 || echo 0)"

# --- Summary ---
echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
