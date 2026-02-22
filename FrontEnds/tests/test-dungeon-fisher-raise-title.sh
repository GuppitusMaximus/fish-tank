#!/bin/bash
# QA test: qa-raise-title-text
# Verifies title text Y position raised to height * 0.13 in TitleScene.js
# Note: VERSION was 1.7.5 at plan time; subsequent plans may bump it further.

TITLE_SCENE="dungeon-fisher/src/scenes/TitleScene.js"
VERSION_FILE="dungeon-fisher/src/version.js"
PASS=0
FAIL=0

check() {
    local desc="$1"
    local result="$2"
    if [ "$result" = "pass" ]; then
        echo "PASS: $desc"
        PASS=$((PASS + 1))
    else
        echo "FAIL: $desc"
        FAIL=$((FAIL + 1))
    fi
}

# 1. Title Y position is height * 0.13 on the titleText line
if grep "height \* 0\.13" "$TITLE_SCENE" | grep -q "titleText"; then
    check "titleText Y position is height * 0.13" "pass"
else
    check "titleText Y position is height * 0.13" "fail"
fi

# 2. Old 0.22 position is not used for titleText
if grep "0\.22" "$TITLE_SCENE" | grep -q "titleText"; then
    check "No old 0.22 position on titleText" "fail"
else
    check "No old 0.22 position on titleText" "pass"
fi

# 3. VERSION is >= 1.7.5 (raise-title-text set 1.7.5; subsequent plans may bump higher)
CURRENT_VERSION=$(grep "^export const VERSION" "$VERSION_FILE" | sed "s/.*'\(.*\)'.*/\1/")
MAJOR=$(echo "$CURRENT_VERSION" | cut -d. -f1)
MINOR=$(echo "$CURRENT_VERSION" | cut -d. -f2)
PATCH=$(echo "$CURRENT_VERSION" | cut -d. -f3)
if [ "$MAJOR" -gt 1 ] || { [ "$MAJOR" -eq 1 ] && [ "$MINOR" -gt 7 ]; } || \
   { [ "$MAJOR" -eq 1 ] && [ "$MINOR" -eq 7 ] && [ "$PATCH" -ge 5 ]; }; then
    check "VERSION >= 1.7.5 (current: $CURRENT_VERSION)" "pass"
else
    check "VERSION >= 1.7.5 (current: $CURRENT_VERSION)" "fail"
fi

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
