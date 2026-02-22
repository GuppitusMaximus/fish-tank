#!/bin/bash
# QA: Auto-Battler Engine — Data & System Verification
# Plan: qa-auto-battler-engine
# Verifies data integrity of moves, fish, monsters, and system files

SRC="/Users/guppy/FishTank/FrontEnds/dungeon-fisher/src"
PASS=0
FAIL=0

ok() { echo "  PASS: $1"; ((PASS++)); }
fail() { echo "  FAIL: $1"; ((FAIL++)); }
section() { echo ""; echo "=== $1 ==="; }

# ---- moves.js ----
section "moves.js — Move count and format"

MOVES_FILE="$SRC/data/moves.js"

# Count move definitions (objects with id: field)
MOVE_COUNT=$(grep -c "^    [a-z_]*: {$" "$MOVES_FILE")
if [ "$MOVE_COUNT" -eq 23 ]; then
    ok "23 moves defined"
else
    fail "Expected 23 moves, found $MOVE_COUNT"
fi

# Check all required fields are present in the file
for field in "id:" "name:" "damage:" "cooldown:" "effect:" "animation:" "description:"; do
    if grep -q "$field" "$MOVES_FILE"; then
        ok "Field '$field' present"
    else
        fail "Field '$field' missing from moves.js"
    fi
done

# Verify fish specials (10)
FISH_SPECIALS="bubble_volley spike_shield deep_strike trick_shot abyssal_beam razor_rush venom_sting healing_tide tidal_crush golden_aura"
for move in $FISH_SPECIALS; do
    if grep -q "^    ${move}:" "$MOVES_FILE"; then
        ok "Fish special '$move' defined"
    else
        fail "Fish special '$move' missing"
    fi
done

# Verify monster specials (13)
MONSTER_SPECIALS="gnaw sonic_screech dagger_throw web_venom bone_throw acid_splash ground_slam shadow_bolt stone_crush hellfire fire_breath dark_nova cataclysm"
for move in $MONSTER_SPECIALS; do
    if grep -q "^    ${move}:" "$MOVES_FILE"; then
        ok "Monster special '$move' defined"
    else
        fail "Monster special '$move' missing"
    fi
done

# No old format fields
for old_field in "power:" "poisonTurns:" "    type:"; do
    if grep -q "$old_field" "$MOVES_FILE"; then
        fail "Old field '$old_field' found in moves.js"
    else
        ok "Old field '$old_field' not present"
    fi
done

# animation values (exclude comment lines)
ANIM_COUNT=$(grep -v "^//" "$MOVES_FILE" | grep -c "animation:")
PROJECTILE_COUNT=$(grep -v "^//" "$MOVES_FILE" | grep -c "animation: 'projectile'")
LUNGE_COUNT=$(grep -v "^//" "$MOVES_FILE" | grep -c "animation: 'lunge'")
if [ $((PROJECTILE_COUNT + LUNGE_COUNT)) -eq "$ANIM_COUNT" ]; then
    ok "All animations are 'projectile' or 'lunge' ($PROJECTILE_COUNT projectile, $LUNGE_COUNT lunge)"
else
    fail "Some animations have unexpected values (projectile=$PROJECTILE_COUNT, lunge=$LUNGE_COUNT, total=$ANIM_COUNT)"
fi

# ---- fish.js ----
section "fish.js — Species format"

FISH_FILE="$SRC/data/fish.js"

# Count species
SPECIES_COUNT=$(grep -c "id: '" "$FISH_FILE")
if [ "$SPECIES_COUNT" -eq 10 ]; then
    ok "10 fish species defined"
else
    fail "Expected 10 species, found $SPECIES_COUNT"
fi

# specialMove field present
if grep -q "specialMove:" "$FISH_FILE"; then
    ok "specialMove field present in fish.js"
else
    fail "specialMove field missing from fish.js"
fi

# No old move arrays
if grep -q "starterMoves:" "$FISH_FILE"; then
    fail "starterMoves field found in fish.js (should be removed)"
else
    ok "starterMoves not present"
fi
if grep -q "learnableMoves:" "$FISH_FILE"; then
    fail "learnableMoves field found in fish.js (should be removed)"
else
    ok "learnableMoves not present"
fi

# All base stats present
for stat in "baseHp:" "baseAtk:" "baseDef:" "baseSpd:"; do
    if grep -q "$stat" "$FISH_FILE"; then
        ok "Stat '$stat' present in fish.js"
    else
        fail "Stat '$stat' missing from fish.js"
    fi
done

# ---- monsters.js ----
section "monsters.js — Monster format and stat scaling"

MONSTER_FILE="$SRC/data/monsters.js"

# Count monster types
MONSTER_COUNT=$(grep -c "{ id:" "$MONSTER_FILE")
if [ "$MONSTER_COUNT" -eq 13 ]; then
    ok "13 monster types defined"
else
    fail "Expected 13 monster types, found $MONSTER_COUNT"
fi

# specialMove field present
if grep -q "specialMove:" "$MONSTER_FILE"; then
    ok "specialMove field present in monsters.js"
else
    fail "specialMove field missing from monsters.js"
fi

# No old moves array
if grep -q "moves: \[" "$MONSTER_FILE"; then
    fail "Old 'moves' array found in monsters.js"
else
    ok "No old 'moves' array in monsters.js"
fi

# HP formula: floor 1 = 75 + 1*9 = 84 (>75)
if grep -q "75 + floor \* 9" "$MONSTER_FILE"; then
    ok "HP scaling formula: 75 + floor*9 (floor 1 = 84, floor 100 = 975)"
else
    fail "HP scaling formula not found or incorrect"
fi

# Check floor 100 HP would be in range
HP_FLOOR100=$(echo "75 + 100 * 9" | bc)
if [ "$HP_FLOOR100" -ge 800 ] && [ "$HP_FLOOR100" -le 1100 ]; then
    ok "Floor 100 monster HP = $HP_FLOOR100 (in 800-1100 range)"
else
    fail "Floor 100 monster HP = $HP_FLOOR100 (expected 800-1100)"
fi

# ---- CombatSystem.js ----
section "CombatSystem.js — API and event types"

COMBAT_FILE="$SRC/systems/CombatSystem.js"

# Required methods
for method in "createCombatState" "update(state" "getBaseAttackCooldown" "calculateBaseDamage" "calculateSpecialDamage" "applyDamageToHpBar" "getFrontFishIndex"; do
    if grep -q "$method" "$COMBAT_FILE"; then
        ok "Method '$method' present"
    else
        fail "Method '$method' missing"
    fi
done

# Required event types
for event in "fish_base_attack" "fish_special" "monster_base_attack" "monster_special" "fish_incapacitated" "monster_dead" "party_dead" "poison_tick" "heal" "buff_applied" "buff_expired"; do
    if grep -q "'$event'" "$COMBAT_FILE"; then
        ok "Event type '$event' present"
    else
        fail "Event type '$event' missing"
    fi
done

# No old turn-based methods
for old_method in "getTurnOrder" "getMonsterMove" "executeMove" "processPoison" "processBuffs"; do
    if grep -q "$old_method" "$COMBAT_FILE"; then
        fail "Old method '$old_method' still present in CombatSystem.js"
    else
        ok "Old method '$old_method' not present"
    fi
done

# state.running = false on end
if grep -q "state.running = false" "$COMBAT_FILE"; then
    ok "state.running set to false on battle end"
else
    fail "state.running not set to false"
fi

# ---- PartySystem.js ----
section "PartySystem.js — createFish and awardXP"

PARTY_FILE="$SRC/systems/PartySystem.js"

# createFish uses specialMove
if grep -q "moves: \[species\.specialMove\]" "$PARTY_FILE"; then
    ok "createFish uses species.specialMove"
else
    fail "createFish does not use species.specialMove"
fi

# No learnableMoves or pendingMove in awardXP
if grep -q "learnableMoves" "$PARTY_FILE"; then
    fail "learnableMoves found in PartySystem.js"
else
    ok "learnableMoves not in PartySystem.js"
fi
if grep -q "pendingMove" "$PARTY_FILE"; then
    fail "pendingMove found in PartySystem.js"
else
    ok "pendingMove not in PartySystem.js"
fi

# Level-up stat growth
if grep -q "maxHp += 5" "$PARTY_FILE" && grep -q "atk += 2" "$PARTY_FILE" && grep -q "def += 1" "$PARTY_FILE" && grep -q "spd += 1" "$PARTY_FILE"; then
    ok "Level-up growth: +5 HP, +2 ATK, +1 DEF, +1 SPD"
else
    fail "Level-up growth values incorrect"
fi

# Utility methods
for method in "fullHeal" "revive" "clearCombatState" "getAliveFish" "isPartyWiped"; do
    if grep -q "$method" "$PARTY_FILE"; then
        ok "Utility method '$method' present"
    else
        fail "Utility method '$method' missing"
    fi
done

# ---- SaveSystem.js ----
section "SaveSystem.js — v2→v3 migration"

SAVE_FILE="$SRC/systems/SaveSystem.js"

# Migration v2→v3 exists
if grep -q "version === 2" "$SAVE_FILE"; then
    ok "v2→v3 migration block exists"
else
    fail "v2→v3 migration missing"
fi

# Replaces moves with specialMove
if grep -q "fish.moves = \[species.specialMove\]" "$SAVE_FILE"; then
    ok "Migration sets fish.moves = [species.specialMove]"
else
    fail "Migration does not set moves correctly"
fi

# Deletes pendingMove
if grep -q "delete fish.pendingMove" "$SAVE_FILE"; then
    ok "Migration deletes fish.pendingMove"
else
    fail "Migration does not delete fish.pendingMove"
fi

# Sets version to 3
if grep -q "data.version = 3" "$SAVE_FILE"; then
    ok "Migration sets data.version = 3"
else
    fail "Migration does not set version to 3"
fi

# FISH_SPECIES imported
if grep -q "import FISH_SPECIES" "$SAVE_FILE"; then
    ok "FISH_SPECIES imported in SaveSystem.js"
else
    fail "FISH_SPECIES not imported in SaveSystem.js"
fi

# v1→v2 migration preserved
if grep -q "version === 1" "$SAVE_FILE"; then
    ok "v1→v2 migration preserved"
else
    fail "v1→v2 migration missing"
fi

# ---- version.js ----
section "version.js — Version constants"

VERSION_FILE="$SRC/version.js"

if grep -q "VERSION = '1.0.0'" "$VERSION_FILE"; then
    ok "VERSION = '1.0.0'"
else
    fail "VERSION is not '1.0.0'"
fi

if grep -q "SAVE_FORMAT_VERSION = 3" "$VERSION_FILE"; then
    ok "SAVE_FORMAT_VERSION = 3"
else
    fail "SAVE_FORMAT_VERSION is not 3"
fi

# ---- Summary ----
echo ""
echo "==============================="
echo "RESULTS: $PASS passed, $FAIL failed"
echo "==============================="
if [ "$FAIL" -eq 0 ]; then
    echo "ALL TESTS PASSED"
    exit 0
else
    echo "SOME TESTS FAILED"
    exit 1
fi
