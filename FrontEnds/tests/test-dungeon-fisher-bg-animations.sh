#!/usr/bin/env bash
# test-dungeon-fisher-bg-animations.sh
# Verifies zone-aware ambient background effects (BackgroundEffects module)
# Plan: qa-bg-animations-dungeon-fisher

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

EFFECTS="$(dirname "$0")/../dungeon-fisher/src/effects/BackgroundEffects.js"
FLOOR="$(dirname "$0")/../dungeon-fisher/src/scenes/FloorScene.js"
BATTLE="$(dirname "$0")/../dungeon-fisher/src/scenes/BattleScene.js"
CAMP="$(dirname "$0")/../dungeon-fisher/src/scenes/CampScene.js"
SHOP="$(dirname "$0")/../dungeon-fisher/src/scenes/ShopScene.js"
VICTORY="$(dirname "$0")/../dungeon-fisher/src/scenes/VictoryScene.js"
TITLE="$(dirname "$0")/../dungeon-fisher/src/scenes/TitleScene.js"

# --- Check 1: BackgroundEffects module exists and exports addEffects ---
check "BackgroundEffects.js file exists" "$([ -f "$EFFECTS" ] && echo 1 || echo 0)"
check "addEffects function exported" "$(grep -c 'export function addEffects' "$EFFECTS")"

# --- Check 2: All 7 zone presets present ---
check "Zone preset: bg_sewers" "$(grep -c "'bg_sewers'" "$EFFECTS")"
check "Zone preset: bg_goblin-caves" "$(grep -c "'bg_goblin-caves'" "$EFFECTS")"
check "Zone preset: bg_bone-crypts" "$(grep -c "'bg_bone-crypts'" "$EFFECTS")"
check "Zone preset: bg_deep-dungeon" "$(grep -c "'bg_deep-dungeon'" "$EFFECTS")"
check "Zone preset: bg_shadow-realm" "$(grep -c "'bg_shadow-realm'" "$EFFECTS")"
check "Zone preset: bg_ancient-chambers" "$(grep -c "'bg_ancient-chambers'" "$EFFECTS")"
check "Zone preset: bg_dungeon-heart" "$(grep -c "'bg_dungeon-heart'" "$EFFECTS")"

# --- Check 3: Particle texture creation with exists() guards ---
check "particle_soft created with textures.exists() guard" "$(grep -c "textures.exists('particle_soft')" "$EFFECTS")"
check "particle_dot created with textures.exists() guard" "$(grep -c "textures.exists('particle_dot')" "$EFFECTS")"
check "generateTexture particle_soft called" "$(grep -c "generateTexture('particle_soft'" "$EFFECTS")"
check "generateTexture particle_dot called" "$(grep -c "generateTexture('particle_dot'" "$EFFECTS")"

# --- Check 4: All 5 gameplay scenes call addEffects (6 total call sites) ---
FLOOR_CALLS=$(grep -c 'addEffects(' "$FLOOR")
check "FloorScene has 2 addEffects call sites" "$([ "$FLOOR_CALLS" -eq 2 ] && echo 1 || echo 0)"
check "BattleScene calls addEffects" "$(grep -c 'addEffects(' "$BATTLE")"
check "CampScene calls addEffects" "$(grep -c 'addEffects(' "$CAMP")"
check "ShopScene calls addEffects" "$(grep -c 'addEffects(' "$SHOP")"
check "VictoryScene calls addEffects" "$(grep -c 'addEffects(' "$VICTORY")"

# --- Check 5: Render order — coverBackground before addEffects in each scene ---
# Verify addEffects appears after coverBackground in FloorScene buildFloorUI
FLOOR_BG=$(grep -n 'coverBackground' "$FLOOR" | head -1 | cut -d: -f1)
FLOOR_EFF=$(grep -n 'addEffects' "$FLOOR" | head -1 | cut -d: -f1)
check "FloorScene buildFloorUI: coverBackground before addEffects" "$([ "$FLOOR_EFF" -gt "$FLOOR_BG" ] && echo 1 || echo 0)"

# Verify addEffects appears before dark overlay in VictoryScene
VICTORY_EFF=$(grep -n 'addEffects' "$VICTORY" | head -1 | cut -d: -f1)
VICTORY_RECT=$(grep -n 'add.rectangle.*0x000000' "$VICTORY" | head -1 | cut -d: -f1)
check "VictoryScene: addEffects before dark overlay rectangle" "$([ "$VICTORY_EFF" -lt "$VICTORY_RECT" ] && echo 1 || echo 0)"

# Verify addEffects appears before dark overlay in CampScene
CAMP_EFF=$(grep -n 'addEffects' "$CAMP" | head -1 | cut -d: -f1)
CAMP_RECT=$(grep -n 'add.rectangle.*0x000000' "$CAMP" | head -1 | cut -d: -f1)
check "CampScene: addEffects before dark overlay rectangle" "$([ "$CAMP_EFF" -lt "$CAMP_RECT" ] && echo 1 || echo 0)"

# ShopScene
SHOP_EFF=$(grep -n 'addEffects' "$SHOP" | head -1 | cut -d: -f1)
SHOP_RECT=$(grep -n 'add.rectangle.*0x000000' "$SHOP" | head -1 | cut -d: -f1)
check "ShopScene: addEffects before dark overlay rectangle" "$([ "$SHOP_EFF" -lt "$SHOP_RECT" ] && echo 1 || echo 0)"

# --- Check 6: Import correctness in each scene ---
check "FloorScene imports addEffects from BackgroundEffects.js" "$(grep -c "from '../effects/BackgroundEffects.js'" "$FLOOR")"
check "BattleScene imports addEffects from BackgroundEffects.js" "$(grep -c "from '../effects/BackgroundEffects.js'" "$BATTLE")"
check "CampScene imports addEffects from BackgroundEffects.js" "$(grep -c "from '../effects/BackgroundEffects.js'" "$CAMP")"
check "ShopScene imports addEffects from BackgroundEffects.js" "$(grep -c "from '../effects/BackgroundEffects.js'" "$SHOP")"
check "VictoryScene imports addEffects from BackgroundEffects.js" "$(grep -c "from '../effects/BackgroundEffects.js'" "$VICTORY")"

# --- Check 7: No regressions ---
check "TitleScene does NOT import BackgroundEffects" "$(grep -c 'BackgroundEffects' "$TITLE" | grep -qx 0 && echo 1 || echo 0)"
check "TitleScene has own _createParticleTextures method" "$(grep -q '_createParticleTextures' "$TITLE" && echo 1 || echo 0)"
check "BackgroundEffects uses blendMode ADD for particles" "$(grep -q "blendMode: 'ADD'" "$EFFECTS" && echo 1 || echo 0)"
check "VictoryScene uses bg_dungeon-heart hardcoded (floor 100)" "$(grep -q "'bg_dungeon-heart'" "$VICTORY" && echo 1 || echo 0)"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
