#!/usr/bin/env bash
# Test: Title Background Contain Scaling
# Plan: qa-title-bg-contain-scaling (updated by qa-browser-title-bg-cover-mode)
# Verifies that coverBackground() supports an optional 'contain' mode using
# Math.min scaling, and that all scenes use the default 'cover' mode (no 'contain').

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

# 1. coverBackground has optional mode parameter defaulting to 'cover'
grep -q "function coverBackground(scene, key, mode = 'cover')" "$ZONES"
check "coverBackground has mode parameter defaulting to 'cover'" $?

# 2. When mode is 'contain', Math.min is used for scaling
grep -q "mode === 'contain'" "$ZONES"
check "coverBackground checks mode === 'contain'" $?

grep -q "Math.min(W / img.width, H / img.height)" "$ZONES"
check "coverBackground uses Math.min for contain scaling" $?

# 3. When mode is not 'contain', Math.max is used (backward-compatible cover behavior)
grep -q "Math.max(W / img.width, H / img.height)" "$ZONES"
check "coverBackground still uses Math.max for cover scaling" $?

# 4. TitleScene does NOT pass 'contain' to UILayout.sceneBackground (uses cover mode)
grep -q "'contain'" "$SCENES/TitleScene.js"
not_found=$?
[ "$not_found" -ne 0 ]
check "TitleScene does not pass 'contain' (uses default cover mode)" $?

# 5. CharacterSelectScene does NOT pass 'contain' to UILayout.sceneBackground
grep -q "'contain'" "$SCENES/CharacterSelectScene.js"
not_found=$?
[ "$not_found" -ne 0 ]
check "CharacterSelectScene does not pass 'contain' (uses default cover mode)" $?

# 6. TitleScene uses UILayout.sceneBackground for bg_title (cover behavior)
grep -q "UILayout.sceneBackground(this, 'bg_title')" "$SCENES/TitleScene.js"
check "TitleScene uses UILayout.sceneBackground for bg_title" $?

# 7. No other scene files pass 'contain' to coverBackground
for scene in FloorScene BattleScene CampScene ShopScene VictoryScene ZonePreviewScene; do
    file="$SCENES/${scene}.js"
    grep -q "'contain'" "$file" 2>/dev/null
    not_found=$?
    [ "$not_found" -ne 0 ]
    check "${scene} does not pass 'contain' to coverBackground" $?
done

# 8. All non-title scene call sites use no mode argument (default cover)
# Only check scenes that actually call coverBackground directly
for scene in BattleScene ShopScene VictoryScene; do
    file="$SCENES/${scene}.js"
    if grep -q "coverBackground(this," "$file" 2>/dev/null; then
        # Scene calls coverBackground directly — verify no third argument
        count=$(grep -c "coverBackground(this, [^,)]*)" "$file" 2>/dev/null)
        calls=$(grep -c "coverBackground(this," "$file" 2>/dev/null)
        [ "$count" -eq "$calls" ]
        check "${scene} all coverBackground calls use default mode (no third argument)" $?
    else
        echo "PASS: ${scene} does not call coverBackground directly (uses UILayout)"
        pass=$((pass + 1))
    fi
done

# Summary
echo ""
echo "Results: $pass passed, $fail failed"
[ "$fail" -eq 0 ] && exit 0 || exit 1
