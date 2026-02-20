#!/usr/bin/env bash
# QA test: qa-dungeon-fisher-move-buttons-up
# Verifies NEW GAME and CONTINUE buttons were moved up on the title screen.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TITLE_SCENE="$SCRIPT_DIR/../dungeon-fisher/src/scenes/TitleScene.js"

PASS=0
FAIL=0

check() {
    local label="$1"
    local result="$2"
    if [ "$result" = "pass" ]; then
        echo "  PASS: $label"
        PASS=$((PASS + 1))
    else
        echo "  FAIL: $label"
        FAIL=$((FAIL + 1))
    fi
}

echo "=== qa-dungeon-fisher-move-buttons-up ==="
echo "File: $TITLE_SCENE"
echo ""

# 1. NEW GAME button Y is height * 0.36
if grep -q "height \* 0\.36.*NEW GAME\|NEW GAME.*height \* 0\.36" "$TITLE_SCENE" 2>/dev/null || \
   grep -q "height \* 0\.36" "$TITLE_SCENE" 2>/dev/null && grep -q "NEW GAME" "$TITLE_SCENE" 2>/dev/null; then
    # More precise: check the specific line
    if grep -q "height \* 0\.36, '\[ NEW GAME \]'" "$TITLE_SCENE" 2>/dev/null; then
        check "NEW GAME button at height * 0.36" "pass"
    else
        check "NEW GAME button at height * 0.36" "fail"
    fi
else
    check "NEW GAME button at height * 0.36" "fail"
fi

# 2. NEW GAME button is NOT at old position 0.55
if grep -q "height \* 0\.55.*NEW GAME\|NEW GAME.*height \* 0\.55" "$TITLE_SCENE" 2>/dev/null; then
    check "NEW GAME button NOT at old position (0.55)" "fail"
else
    check "NEW GAME button NOT at old position (0.55)" "pass"
fi

# 3. CONTINUE button Y is height * 0.43
if grep -q "height \* 0\.43, '\[ CONTINUE \]'" "$TITLE_SCENE" 2>/dev/null; then
    check "CONTINUE button at height * 0.43" "pass"
else
    check "CONTINUE button at height * 0.43" "fail"
fi

# 4. CONTINUE button is NOT at old position 0.65
if grep -q "height \* 0\.65.*CONTINUE\|CONTINUE.*height \* 0\.65" "$TITLE_SCENE" 2>/dev/null; then
    check "CONTINUE button NOT at old position (0.65)" "fail"
else
    check "CONTINUE button NOT at old position (0.65)" "pass"
fi

# 5. NEW GAME button fades in with delay tween (alpha: 1, delay: 3500)
# Note: delay was updated to 3500ms by the title-text-effects plan (2000ms phase1 + 1500ms phase2)
if grep -A5 "newBtn" "$TITLE_SCENE" | grep -q "delay: 3500"; then
    check "NEW GAME button fade-in tween with delay:3500" "pass"
elif grep -q "delay: 3500" "$TITLE_SCENE" 2>/dev/null; then
    check "NEW GAME button fade-in tween with delay:3500" "pass"
else
    check "NEW GAME button fade-in tween with delay:3500" "fail"
fi

# 6. CONTINUE button fades in with delay tween (3500ms)
if grep -A5 "contBtn" "$TITLE_SCENE" | grep -q "delay: 3500"; then
    check "CONTINUE button fade-in tween with delay:3500" "pass"
else
    check "CONTINUE button fade-in tween with delay:3500" "fail"
fi

# 7. NEW GAME button has pointerover handler
if grep -q "newBtn.on('pointerover'" "$TITLE_SCENE" 2>/dev/null; then
    check "NEW GAME pointerover handler present" "pass"
else
    check "NEW GAME pointerover handler present" "fail"
fi

# 8. NEW GAME button has pointerout handler
if grep -q "newBtn.on('pointerout'" "$TITLE_SCENE" 2>/dev/null; then
    check "NEW GAME pointerout handler present" "pass"
else
    check "NEW GAME pointerout handler present" "fail"
fi

# 9. NEW GAME button has pointerdown handler
if grep -q "newBtn.on('pointerdown'" "$TITLE_SCENE" 2>/dev/null; then
    check "NEW GAME pointerdown handler present" "pass"
else
    check "NEW GAME pointerdown handler present" "fail"
fi

# 10. CONTINUE button has pointerover handler
if grep -q "contBtn.on('pointerover'" "$TITLE_SCENE" 2>/dev/null; then
    check "CONTINUE pointerover handler present" "pass"
else
    check "CONTINUE pointerover handler present" "fail"
fi

# 11. CONTINUE button has pointerout handler
if grep -q "contBtn.on('pointerout'" "$TITLE_SCENE" 2>/dev/null; then
    check "CONTINUE pointerout handler present" "pass"
else
    check "CONTINUE pointerout handler present" "fail"
fi

# 12. CONTINUE button has pointerdown handler
if grep -q "contBtn.on('pointerdown'" "$TITLE_SCENE" 2>/dev/null; then
    check "CONTINUE pointerdown handler present" "pass"
else
    check "CONTINUE pointerdown handler present" "fail"
fi

echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
exit 0
