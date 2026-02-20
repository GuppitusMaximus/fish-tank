#!/usr/bin/env bash
# Test: Dungeon Fisher — Background Cover-Crop Fix
# Plan: qa-fix-bg-cover-dungeon-fisher
# Verifies that coverBackground() uses Math.max cover-crop scaling instead of
# setDisplaySize stretch-to-fill across all 6 scenes.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$SCRIPT_DIR/../dungeon-fisher/src"
ZONES="$SRC/utils/zones.js"
SCENES="$SRC/scenes"

pass=0
fail=0

check() {
    local desc="$1"
    local code="$2"
    if [ "$code" -eq 0 ]; then
        echo "PASS: $desc"
        pass=$((pass + 1))
    else
        echo "FAIL: $desc"
        fail=$((fail + 1))
    fi
}

# 1. coverBackground function exists in zones.js
grep -q "export function coverBackground" "$ZONES"; check "coverBackground function exported from zones.js" $?

# 2. coverBackground uses Math.max for cover-crop scaling
grep -q "Math.max(W / img.width, H / img.height)" "$ZONES"; check "coverBackground uses Math.max cover-crop formula" $?

# 3. No setDisplaySize calls in scene files
count=$(grep -r "setDisplaySize" "$SCENES" 2>/dev/null | wc -l | tr -d ' ')
[ "$count" -eq 0 ]; check "No setDisplaySize calls in scene files" $?

# 4. All 6 scenes import coverBackground
for scene in FloorScene BattleScene CampScene ShopScene TitleScene VictoryScene; do
    file="$SCENES/${scene}.js"
    grep -q "coverBackground" "$file"; check "${scene} imports coverBackground" $?
done

# 5. All 8 call sites use coverBackground(this, ...)
# FloorScene: 2 (buildFloorUI + showFloorReward)
count=$(grep -c "coverBackground(this," "$SCENES/FloorScene.js" 2>/dev/null || echo 0)
[ "$count" -eq 2 ]; check "FloorScene has 2 coverBackground call sites" $?

# BattleScene: 1
count=$(grep -c "coverBackground(this," "$SCENES/BattleScene.js" 2>/dev/null || echo 0)
[ "$count" -eq 1 ]; check "BattleScene has 1 coverBackground call site" $?

# CampScene: 1
count=$(grep -c "coverBackground(this," "$SCENES/CampScene.js" 2>/dev/null || echo 0)
[ "$count" -eq 1 ]; check "CampScene has 1 coverBackground call site" $?

# ShopScene: 1
count=$(grep -c "coverBackground(this," "$SCENES/ShopScene.js" 2>/dev/null || echo 0)
[ "$count" -eq 1 ]; check "ShopScene has 1 coverBackground call site" $?

# TitleScene: 2 (create + showStarterSelection)
count=$(grep -c "coverBackground(this," "$SCENES/TitleScene.js" 2>/dev/null || echo 0)
[ "$count" -eq 2 ]; check "TitleScene has 2 coverBackground call sites" $?

# VictoryScene: 1
count=$(grep -c "coverBackground(this," "$SCENES/VictoryScene.js" 2>/dev/null || echo 0)
[ "$count" -eq 1 ]; check "VictoryScene has 1 coverBackground call site" $?

# 6. TitleScene Ken Burns tween reads scale from image instance (not hardcoded)
grep -q "this\.bg\.scaleX \*" "$SCENES/TitleScene.js"; check "TitleScene Ken Burns tween reads scaleX from image instance" $?
grep -q "this\.bg\.scaleY \*" "$SCENES/TitleScene.js"; check "TitleScene Ken Burns tween reads scaleY from image instance" $?

# 7. Overlays render AFTER backgrounds (no regression)
SCENES_DIR="$SCENES" python3 - <<'PYEOF'
import sys, os

def check_order(filepath):
    with open(filepath) as f:
        lines = f.readlines()
    bg_idx = None
    for i, line in enumerate(lines):
        if 'coverBackground(this,' in line and bg_idx is None:
            bg_idx = i
    if bg_idx is None:
        return True  # No background call, skip
    # Find if any rectangle comes before the first coverBackground
    for i, line in enumerate(lines):
        if 'add.rectangle(' in line and i < bg_idx:
            return False
    return True

scenes_dir = os.environ['SCENES_DIR']
ok = True
for scene in ['FloorScene.js', 'BattleScene.js', 'CampScene.js', 'ShopScene.js', 'TitleScene.js', 'VictoryScene.js']:
    path = os.path.join(scenes_dir, scene)
    if not check_order(path):
        print(f"  Rectangle before coverBackground in {scene}")
        ok = False
sys.exit(0 if ok else 1)
PYEOF
check "No overlay rectangles appear before coverBackground in any scene" $?

# Summary
echo ""
echo "Results: $pass passed, $fail failed"
[ "$fail" -eq 0 ] && exit 0 || exit 1
