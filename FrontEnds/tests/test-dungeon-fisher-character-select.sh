#!/usr/bin/env bash
# QA test: qa-character-selection
# Verifies the character selection screen and related systems are correctly implemented.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$SCRIPT_DIR/../dungeon-fisher/src"
CHAR_SELECT="$SRC/scenes/CharacterSelectScene.js"
TITLE_SCENE="$SRC/scenes/TitleScene.js"
MAIN_JS="$SRC/main.js"
BOOT_SCENE="$SRC/scenes/BootScene.js"
SAVE_SYSTEM="$SRC/systems/SaveSystem.js"
VERSION_JS="$SRC/version.js"
FISHERS_DATA="$SRC/data/fishers.js"
PORTRAITS_DIR="$SCRIPT_DIR/../dungeon-fisher/public/sprites/fishers"
PACKAGE_JSON="$SCRIPT_DIR/../dungeon-fisher/package.json"

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

echo "=== qa-character-selection — Static Code Checks ==="
echo ""

echo "--- Check 1: CharacterSelectScene file and class ---"

# 1. File exists
if [ -f "$CHAR_SELECT" ]; then
    check "CharacterSelectScene.js exists in src/scenes/" "pass"
else
    check "CharacterSelectScene.js exists in src/scenes/" "fail"
fi

# 2. Extends Phaser.Scene with key 'CharacterSelectScene'
if grep -q "extends Phaser.Scene" "$CHAR_SELECT" 2>/dev/null; then
    check "CharacterSelectScene extends Phaser.Scene" "pass"
else
    check "CharacterSelectScene extends Phaser.Scene" "fail"
fi

if grep -q "super('CharacterSelectScene')" "$CHAR_SELECT" 2>/dev/null; then
    check "CharacterSelectScene key is 'CharacterSelectScene'" "pass"
else
    check "CharacterSelectScene key is 'CharacterSelectScene'" "fail"
fi

echo ""
echo "--- Check 2: CharacterSelectScene registered in main.js ---"

# 3. Imported in main.js
if grep -q "import CharacterSelectScene" "$MAIN_JS" 2>/dev/null; then
    check "CharacterSelectScene imported in main.js" "pass"
else
    check "CharacterSelectScene imported in main.js" "fail"
fi

# 4. Added to scene array
if grep -q "CharacterSelectScene" "$MAIN_JS" 2>/dev/null; then
    check "CharacterSelectScene in main.js scene array" "pass"
else
    check "CharacterSelectScene in main.js scene array" "fail"
fi

echo ""
echo "--- Check 3: TitleScene NEW GAME → CharacterSelectScene ---"

# 5. NEW GAME handler transitions to CharacterSelectScene (not showStarterSelection)
if grep -q "scene.start('CharacterSelectScene')" "$TITLE_SCENE" 2>/dev/null; then
    check "NEW GAME handler starts CharacterSelectScene" "pass"
else
    check "NEW GAME handler starts CharacterSelectScene" "fail"
fi

# 6. NEW GAME handler does NOT directly call showStarterSelection on pointerdown
# (It should go through CharacterSelectScene first)
NEW_GAME_HANDLER=$(grep -A3 "newBtn.on('pointerdown'" "$TITLE_SCENE" 2>/dev/null || true)
if echo "$NEW_GAME_HANDLER" | grep -q "showStarterSelection"; then
    check "NEW GAME pointerdown does NOT directly call showStarterSelection" "fail"
else
    check "NEW GAME pointerdown does NOT directly call showStarterSelection" "pass"
fi

echo ""
echo "--- Check 4: TitleScene handles selectedFisher data ---"

# 7. create() checks for data.selectedFisher
if grep -q "data.selectedFisher" "$TITLE_SCENE" 2>/dev/null; then
    check "TitleScene create() checks data.selectedFisher" "pass"
else
    check "TitleScene create() checks data.selectedFisher" "fail"
fi

# 8. If selectedFisher present, goes to showStarterSelection()
if grep -B2 -A3 "data.selectedFisher" "$TITLE_SCENE" | grep -q "showStarterSelection" 2>/dev/null; then
    check "selectedFisher present → showStarterSelection() called" "pass"
else
    check "selectedFisher present → showStarterSelection() called" "fail"
fi

echo ""
echo "--- Check 5: CharacterSelectScene displays Andy and transitions back ---"

# 9. Displays portrait using fisher.portrait
if grep -q "fisher.portrait" "$CHAR_SELECT" 2>/dev/null; then
    check "CharacterSelectScene uses fisher.portrait for image" "pass"
else
    check "CharacterSelectScene uses fisher.portrait for image" "fail"
fi

# 10. Displays fisher.name
if grep -q "fisher.name" "$CHAR_SELECT" 2>/dev/null; then
    check "CharacterSelectScene displays fisher.name" "pass"
else
    check "CharacterSelectScene displays fisher.name" "fail"
fi

# 11. Displays fisher.description
if grep -q "fisher.description" "$CHAR_SELECT" 2>/dev/null; then
    check "CharacterSelectScene displays fisher.description" "pass"
else
    check "CharacterSelectScene displays fisher.description" "fail"
fi

# 12. SELECT button transitions to TitleScene with selectedFisher: fisher.id
if grep -q "scene.start('TitleScene'" "$CHAR_SELECT" 2>/dev/null && \
   grep -q "selectedFisher: fisher.id" "$CHAR_SELECT" 2>/dev/null; then
    check "SELECT button transitions to TitleScene with selectedFisher: fisher.id" "pass"
else
    check "SELECT button transitions to TitleScene with selectedFisher: fisher.id" "fail"
fi

echo ""
echo "--- Check 6: fishers.js data model ---"

# 13. fishers.js exists
if [ -f "$FISHERS_DATA" ]; then
    check "fishers.js exists in src/data/" "pass"
else
    check "fishers.js exists in src/data/" "fail"
fi

# 14. Andy entry has required fields: id, name, description, portrait, starterFish, ability, lore
for field in id name description portrait starterFish ability lore; do
    if grep -q "$field:" "$FISHERS_DATA" 2>/dev/null; then
        check "fishers.js Andy has field: $field" "pass"
    else
        check "fishers.js Andy has field: $field" "fail"
    fi
done

# 15. Andy's id is 'andy'
if grep -q "id: 'andy'" "$FISHERS_DATA" 2>/dev/null; then
    check "Andy's id is 'andy'" "pass"
else
    check "Andy's id is 'andy'" "fail"
fi

# 16. Andy's portrait is 'fisher_andy'
if grep -q "portrait: 'fisher_andy'" "$FISHERS_DATA" 2>/dev/null; then
    check "Andy's portrait key is 'fisher_andy'" "pass"
else
    check "Andy's portrait key is 'fisher_andy'" "fail"
fi

echo ""
echo "--- Check 7: Portrait asset exists ---"

# 17. andy.png exists
if [ -f "$PORTRAITS_DIR/andy.png" ]; then
    check "andy.png exists in public/sprites/fishers/" "pass"
else
    check "andy.png exists in public/sprites/fishers/" "fail"
fi

echo ""
echo "--- Check 8: BootScene loads fisher portrait ---"

# 18. BootScene preloads fisher sprites
if grep -q "fisher_andy\|fishers.*andy\|andy.*fishers" "$BOOT_SCENE" 2>/dev/null; then
    check "BootScene loads fisher portrait" "pass"
else
    check "BootScene loads fisher portrait" "fail"
fi

# 19. Uses key fisher_andy
if grep -q "fisher_andy\|fisher_\`\${id}\`\|fisher_\${id}" "$BOOT_SCENE" 2>/dev/null || \
   grep -q "fisher_" "$BOOT_SCENE" 2>/dev/null; then
    check "BootScene uses fisher_ key prefix" "pass"
else
    check "BootScene uses fisher_ key prefix" "fail"
fi

echo ""
echo "--- Check 9: SaveSystem includes fisherId ---"

# 20. save() includes fisherId
if grep -q "fisherId" "$SAVE_SYSTEM" 2>/dev/null; then
    check "SaveSystem.save() includes fisherId field" "pass"
else
    check "SaveSystem.save() includes fisherId field" "fail"
fi

# 21. fisherId defaults to 'andy'
if grep -q "fisherId.*||.*'andy'\|fisherId.*'andy'" "$SAVE_SYSTEM" 2>/dev/null; then
    check "fisherId defaults to 'andy'" "pass"
else
    check "fisherId defaults to 'andy'" "fail"
fi

echo ""
echo "--- Check 10: SAVE_FORMAT_VERSION is 2 ---"

# 22. SAVE_FORMAT_VERSION = 2
if grep -q "SAVE_FORMAT_VERSION = 2" "$VERSION_JS" 2>/dev/null; then
    check "SAVE_FORMAT_VERSION is 2 in version.js" "pass"
else
    check "SAVE_FORMAT_VERSION is 2 in version.js" "fail"
fi

echo ""
echo "--- Check 11: v1→v2 migration ---"

# 23. migrate() handles version 1
if grep -q "data.version === 1" "$SAVE_SYSTEM" 2>/dev/null; then
    check "migrate() handles version 1" "pass"
else
    check "migrate() handles version 1" "fail"
fi

# 24. migration adds fisherId: 'andy'
if grep -A3 "data.version === 1" "$SAVE_SYSTEM" | grep -q "fisherId.*=.*'andy'" 2>/dev/null; then
    check "v1→v2 migration adds fisherId: 'andy'" "pass"
else
    check "v1→v2 migration adds fisherId: 'andy'" "fail"
fi

# 25. migration bumps version to 2
if grep -A4 "data.version === 1" "$SAVE_SYSTEM" | grep -q "data.version = 2" 2>/dev/null; then
    check "v1→v2 migration bumps version to 2" "pass"
else
    check "v1→v2 migration bumps version to 2" "fail"
fi

echo ""
echo "--- Check 12: Game version ---"

# 26. VERSION is '0.9.0'
if grep -q "VERSION = '0.9.0'" "$VERSION_JS" 2>/dev/null; then
    check "VERSION is '0.9.0' in version.js" "pass"
else
    check "VERSION is '0.9.0' in version.js" "fail"
fi

# 27. package.json version is 0.9.0
if grep -q '"version": "0.9.0"' "$PACKAGE_JSON" 2>/dev/null; then
    check "package.json version is 0.9.0" "pass"
else
    check "package.json version is 0.9.0" "fail"
fi

echo ""
echo "--- Check 13: Continue still loads directly to FloorScene ---"

# 28. continueGame() loads directly to FloorScene without CharacterSelectScene
if grep -A20 "continueGame() {" "$TITLE_SCENE" | grep -q "scene.start('FloorScene'" 2>/dev/null; then
    check "continueGame() starts FloorScene directly" "pass"
else
    check "continueGame() starts FloorScene directly" "fail"
fi

# 29. continueGame() does NOT go through CharacterSelectScene
if grep -A10 "continueGame()" "$TITLE_SCENE" | grep -q "CharacterSelectScene" 2>/dev/null; then
    check "continueGame() does NOT invoke CharacterSelectScene" "fail"
else
    check "continueGame() does NOT invoke CharacterSelectScene" "pass"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="

if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
exit 0
