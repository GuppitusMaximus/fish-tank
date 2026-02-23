#!/usr/bin/env bash
# QA test: fix-info-panel-scrim-and-atlas
# Verifies atlas darkening, scrim size/alpha, and version bump.
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

# 1. Scrim size: width uses panelMargin * 2 - 8 (not -20)
SCRIM_SIZE=$(grep -c "panelMargin \* 2 - 8" "$ROOT/dungeon-fisher/src/scenes/FloorScene.js" || true)
check "Scrim width uses panelMargin * 2 - 8" "$([ "$SCRIM_SIZE" -ge 1 ] && echo true || echo false)"

# 2. Scrim height: panelH - 8 (not -20)
SCRIM_H=$(grep -c "panelH - 8" "$ROOT/dungeon-fisher/src/scenes/FloorScene.js" || true)
check "Scrim height uses panelH - 8" "$([ "$SCRIM_H" -ge 1 ] && echo true || echo false)"

# 3. Scrim alpha: 0.6
SCRIM_ALPHA=$(grep -c "0x000000, 0\.6" "$ROOT/dungeon-fisher/src/scenes/FloorScene.js" || true)
check "Scrim alpha is 0.6" "$([ "$SCRIM_ALPHA" -ge 1 ] && echo true || echo false)"

# 4. Atlas pixel (0,0) is dark (R < 100 indicates darkening was applied)
ATLAS="$ROOT/dungeon-fisher/public/atlases/sewers_wide.png"
if command -v python3 &>/dev/null && python3 -c "from PIL import Image" 2>/dev/null; then
    PIXEL_R=$(python3 -c "
from PIL import Image
img = Image.open('$ATLAS')
r, g, b, a = img.getpixel((0, 0))
print(r)
")
    check "Atlas corner pixel R channel < 100 (darkened)" "$([ "$PIXEL_R" -lt 100 ] && echo true || echo false)"
else
    echo "SKIP: PIL not available — atlas pixel check skipped"
fi

# 5. Version is PATCH-bumped (current is higher than 1.10.25)
VERSION=$(grep -o "'[0-9]*\.[0-9]*\.[0-9]*'" "$ROOT/dungeon-fisher/src/version.js" | tr -d "'")
PATCH=$(echo "$VERSION" | cut -d'.' -f3)
check "Version PATCH >= 26 (bumped from 1.10.25)" "$([ "$PATCH" -ge 26 ] && echo true || echo false)"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
