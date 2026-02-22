#!/usr/bin/env bash
# QA test: qa-dungeon-fisher-move-buttons-up (updated for title-button-animations)
# Verifies title buttons are positioned correctly via _createTitleButton helper.
# Updated by qa-title-button-animations: old newBtn/contBtn vars replaced by helper.

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

check_grep() {
    local label="$1"
    local pattern="$2"
    if grep -qF "$pattern" "$TITLE_SCENE" 2>/dev/null; then
        check "$label" "pass"
    else
        check "$label" "fail"
    fi
}

check_not_grep() {
    local label="$1"
    local pattern="$2"
    if ! grep -qF "$pattern" "$TITLE_SCENE" 2>/dev/null; then
        check "$label" "pass"
    else
        check "$label" "fail"
    fi
}

echo "=== qa-dungeon-fisher-move-buttons-up ==="
echo "File: $TITLE_SCENE"
echo ""

# 1. _createTitleButton helper method exists
check_grep "_createTitleButton helper method exists" "_createTitleButton("

# 2. NEW GAME button at height * 0.36 via _createTitleButton
if grep -q "height \* 0\.36.*'NEW GAME'" "$TITLE_SCENE" 2>/dev/null; then
    check "NEW GAME button at height * 0.36" "pass"
else
    check "NEW GAME button at height * 0.36" "fail"
fi

# 3. NEW GAME button is NOT at old position 0.55
if grep -q "height \* 0\.55.*NEW GAME\|NEW GAME.*height \* 0\.55" "$TITLE_SCENE" 2>/dev/null; then
    check "NEW GAME button NOT at old position (0.55)" "fail"
else
    check "NEW GAME button NOT at old position (0.55)" "pass"
fi

# 4. CONTINUE button at height * 0.43
if grep -q "height \* 0\.43.*'CONTINUE'" "$TITLE_SCENE" 2>/dev/null; then
    check "CONTINUE button at height * 0.43" "pass"
else
    check "CONTINUE button at height * 0.43" "fail"
fi

# 5. CONTINUE button NOT at old position 0.65
if grep -q "height \* 0\.65.*CONTINUE\|CONTINUE.*height \* 0\.65" "$TITLE_SCENE" 2>/dev/null; then
    check "CONTINUE button NOT at old position (0.65)" "fail"
else
    check "CONTINUE button NOT at old position (0.65)" "pass"
fi

# 6. NEW GAME button fade-in delay is 3500 (passed as argument to _createTitleButton)
# Call spans multiple lines: check that 'NEW GAME' block contains 3500 in next line
if grep -A2 "'NEW GAME'" "$TITLE_SCENE" 2>/dev/null | grep -q "3500"; then
    check "NEW GAME button fade-in delay is 3500" "pass"
else
    check "NEW GAME button fade-in delay is 3500" "fail"
fi

# 7. CONTINUE button fade-in delay is 3700
# Call spans multiple lines: check that 'CONTINUE' block contains 3700 in next line
if grep -A2 "'CONTINUE'" "$TITLE_SCENE" 2>/dev/null | grep -q "3700"; then
    check "CONTINUE button fade-in delay is 3700" "pass"
else
    check "CONTINUE button fade-in delay is 3700" "fail"
fi

# 8. pointerover handler in _createTitleButton
check_grep "pointerover handler in _createTitleButton" "text.on('pointerover'"

# 9. pointerout handler in _createTitleButton
check_grep "pointerout handler in _createTitleButton" "text.on('pointerout'"

# 10. pointerdown handler in _createTitleButton
check_grep "pointerdown handler in _createTitleButton" "text.on('pointerdown'"

# 11. Hover scale 1.08 in _createTitleButton
check_grep "Hover tween scales to 1.08" "scaleX: 1.08,"

# 12. Panel created via themedPanel() (migrated from dungeonPanel by zone-theme-title-screen)
check_grep "Panel created via themedPanel()" "themedPanel("

echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
exit 0
