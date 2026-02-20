#!/usr/bin/env bash
# Test: Title Background Contain Scaling
# Plan: qa-title-bg-contain-scaling
# Verifies that coverBackground() supports an optional 'contain' mode using
# Math.min scaling, and that TitleScene uses it for bg_title while all other
# scenes continue using the default 'cover' mode.

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

# 4. TitleScene create() calls coverBackground with 'contain'
grep -q "coverBackground(this, 'bg_title', 'contain')" "$SCENES/TitleScene.js"
check "TitleScene.create() calls coverBackground with 'contain' mode" $?

# 5. TitleScene showStarterSelection() also calls coverBackground with 'contain'
count=$(grep -c "coverBackground(this, 'bg_title', 'contain')" "$SCENES/TitleScene.js" 2>/dev/null || echo 0)
[ "$count" -eq 2 ]
check "TitleScene has 2 calls to coverBackground with 'contain' (create + showStarterSelection)" $?

# 6. No other scene files pass 'contain' to coverBackground
for scene in FloorScene BattleScene CampScene ShopScene VictoryScene ZonePreviewScene; do
    file="$SCENES/${scene}.js"
    grep -q "'contain'" "$file" 2>/dev/null
    not_found=$?
    [ "$not_found" -ne 0 ]
    check "${scene} does not pass 'contain' to coverBackground" $?
done

# 7. All non-title scene call sites use no mode argument (default cover)
for scene in FloorScene BattleScene CampScene ShopScene VictoryScene; do
    file="$SCENES/${scene}.js"
    # Verify coverBackground calls don't have a third argument
    count=$(grep -c "coverBackground(this, [^,)]*)" "$file" 2>/dev/null || echo 0)
    calls=$(grep -c "coverBackground(this," "$file" 2>/dev/null || echo 0)
    [ "$count" -eq "$calls" ]
    check "${scene} all coverBackground calls use default mode (no third argument)" $?
done

# Summary
echo ""
echo "Results: $pass passed, $fail failed"
[ "$fail" -eq 0 ] && exit 0 || exit 1
