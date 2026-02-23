#!/usr/bin/env bash
# QA test for flavor scrim effects (qa-fix-flavor-scrim-effects)
# Verifies: vignette layers, glow border, expanding reveal, breathing pulse, floating drift, depth ordering, version bump

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FLOOR="$SCRIPT_DIR/../dungeon-fisher/src/scenes/FloorScene.js"
VERSION="$SCRIPT_DIR/../dungeon-fisher/src/version.js"

PASS=0
FAIL=0

check() {
    local label="$1"
    local result="$2"
    if [ "$result" = "pass" ]; then
        echo "  PASS  $label"
        PASS=$((PASS+1))
    else
        echo "  FAIL  $label"
        FAIL=$((FAIL+1))
    fi
}

echo "=== Flavor Scrim Effects (qa-fix-flavor-scrim-effects) ==="
echo ""

echo "1. Vignette layers (3 rectangles, decreasing size, increasing alpha)"
grep -q "0x000000, 0.15" "$FLOOR" && check "Outer vignette alpha=0.15" pass || check "Outer vignette alpha=0.15" fail
grep -q "0x000000, 0.25" "$FLOOR" && check "Middle vignette alpha=0.25" pass || check "Middle vignette alpha=0.25" fail
grep -q "0x000000, 0.45" "$FLOOR" && check "Inner scrim alpha=0.45" pass || check "Inner scrim alpha=0.45" fail
grep -q "fpad \* 6" "$FLOOR" && check "Outer vignette largest (fpad*6)" pass || check "Outer vignette largest (fpad*6)" fail
grep -q "fpad \* 4" "$FLOOR" && check "Middle vignette medium (fpad*4)" pass || check "Middle vignette medium (fpad*4)" fail
grep -q "fpad \* 2" "$FLOOR" && check "Inner scrim smallest (fpad*2)" pass || check "Inner scrim smallest (fpad*2)" fail

echo ""
echo "2. Glow border (zone.panel.accent color, depth 4)"
grep -q "zone\.panel\.accent" "$FLOOR" && check "Uses zone.panel.accent color" pass || check "Uses zone.panel.accent color" fail
grep -q "setDepth(4)" "$FLOOR" && check "Glow border at depth 4" pass || check "Glow border at depth 4" fail
grep -q "fpad \* 3" "$FLOOR" && check "Glow border medium size (fpad*3, between vignette sizes)" pass || check "Glow border medium size (fpad*3)" fail

echo ""
echo "3. Expanding reveal (scaleX:0 start, Back.easeOut tween, text fades in after)"
grep -q "setScale(0, 1)" "$FLOOR" && check "Scrim layers start with setScale(0,1)" pass || check "Scrim layers start with setScale(0,1)" fail
grep -q "scaleX: 1" "$FLOOR" && check "Tween targets scaleX:1" pass || check "Tween targets scaleX:1" fail
grep -q "Back\.easeOut" "$FLOOR" && check "Expand uses Back.easeOut ease" pass || check "Expand uses Back.easeOut ease" fail
grep -q "setAlpha(0)" "$FLOOR" && check "Text starts at alpha 0" pass || check "Text starts at alpha 0" fail
grep -q "onComplete" "$FLOOR" && check "Text fade-in fires onComplete" pass || check "Text fade-in fires onComplete" fail

echo ""
echo "4. Breathing pulse (scrim 0.35↔0.55, glow 0.1↔0.3, yoyo)"
grep -q "from: 0\.35, to: 0\.55" "$FLOOR" && check "Scrim alpha 0.35↔0.55" pass || check "Scrim alpha 0.35↔0.55" fail
grep -q "from: 0\.1, to: 0\.3" "$FLOOR" && check "Glow alpha 0.1↔0.3" pass || check "Glow alpha 0.1↔0.3" fail
# yoyo:true appears multiple times (breathing + floating), check it's present at least once
grep -q "yoyo: true" "$FLOOR" && check "Yoyo enabled on alpha tweens" pass || check "Yoyo enabled on alpha tweens" fail

echo ""
echo "5. Floating drift (all scrim layers + flavor text, ±2px y, yoyo)"
grep -q "floatTargets" "$FLOOR" && check "floatTargets array defined" pass || check "floatTargets array defined" fail
grep -q "flavorTxt" "$FLOOR" && check "Flavor text included in float targets" pass || check "Flavor text included in float targets" fail
grep -q "y: '-=2'" "$FLOOR" && check "Float tween moves y by -2px" pass || check "Float tween moves y by -2px" fail

echo ""
echo "6. Depth ordering (vignette=3, glow=4, scrim=5, text=6)"
grep -q "setDepth(3)" "$FLOOR" && check "Vignette layers at depth 3" pass || check "Vignette layers at depth 3" fail
grep -q "setDepth(4)" "$FLOOR" && check "Glow border at depth 4" pass || check "Glow border at depth 4" fail
grep -q "setDepth(5)" "$FLOOR" && check "Inner scrim at depth 5" pass || check "Inner scrim at depth 5" fail
grep -q "setDepth(6)" "$FLOOR" && check "Flavor text at depth 6" pass || check "Flavor text at depth 6" fail

echo ""
echo "7. Version bumped (PATCH increment 1.10.19 → 1.10.20)"
grep -q "VERSION = '1\.10\.20'" "$VERSION" && check "VERSION is 1.10.20" pass || check "VERSION is 1.10.20" fail

echo ""
echo "============================================"
echo "Results: $PASS passed, $FAIL failed"
if [ "$FAIL" -eq 0 ]; then
    echo "PASS — all checks pass"
    exit 0
else
    echo "FAIL — $FAIL check(s) failed"
    exit 1
fi
