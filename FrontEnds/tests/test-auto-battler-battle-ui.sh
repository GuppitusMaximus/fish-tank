#!/bin/bash
# QA: Auto-Battler Battle UI
# Verifies BattleScene and SpriteAnimator implementation for plan: auto-battler-battle-ui

PASS=0
FAIL=0

check() {
    local desc="$1"
    local result="$2"
    if [ "$result" = "ok" ]; then
        echo "  PASS: $desc"
        PASS=$((PASS + 1))
    else
        echo "  FAIL: $desc"
        FAIL=$((FAIL + 1))
    fi
}

SPRITE="$(dirname "$0")/../dungeon-fisher/src/effects/SpriteAnimator.js"
BATTLE="$(dirname "$0")/../dungeon-fisher/src/scenes/BattleScene.js"
FLOOR="$(dirname "$0")/../dungeon-fisher/src/scenes/FloorScene.js"

echo "=== SpriteAnimator Extensions ==="

grep -q "static projectile(" "$SPRITE" \
    && check "projectile() static method exists" "ok" \
    || check "projectile() static method exists" "fail"

grep -q "static damageNumber(" "$SPRITE" \
    && check "damageNumber() static method exists" "ok" \
    || check "damageNumber() static method exists" "fail"

grep -q "return new Promise" "$SPRITE" \
    && check "projectile/damageNumber return Promises" "ok" \
    || check "projectile/damageNumber return Promises" "fail"

for method in "idle()" "attack(" "hit()" "faint()" "stopIdle()" "destroy()"; do
    grep -q "$method" "$SPRITE" \
        && check "Existing method preserved: $method" "ok" \
        || check "Existing method preserved: $method" "fail"
done

echo ""
echo "=== BattleScene Structure ==="

grep -q "CombatSystem.createCombatState(" "$BATTLE" \
    && check "init() uses CombatSystem.createCombatState()" "ok" \
    || check "init() uses CombatSystem.createCombatState()" "fail"

grep -q "CombatSystem.update(" "$BATTLE" \
    && check "update() calls CombatSystem.update()" "ok" \
    || check "update() calls CombatSystem.update()" "fail"

grep -q "import CombatSystem" "$BATTLE" \
    && check "CombatSystem imported" "ok" \
    || check "CombatSystem imported" "fail"

grep -q "import MOVES" "$BATTLE" \
    && check "MOVES imported" "ok" \
    || check "MOVES imported" "fail"

for banned in "showActions" "onMove" "showItemMenu" "showItemTargets" "useItem" "showSwitchMenu" "showLearnMenu"; do
    grep -q "$banned" "$BATTLE" \
        && check "No turn-based method: $banned" "fail" \
        || check "No turn-based method: $banned" "ok"
done

echo ""
echo "=== Triangle Formation ==="

grep -q "_getFormationPositions" "$BATTLE" \
    && check "_getFormationPositions() method exists" "ok" \
    || check "_getFormationPositions() method exists" "fail"

grep -q "count === 1" "$BATTLE" \
    && check "1-fish single position case" "ok" \
    || check "1-fish single position case" "fail"

grep -q "count === 2" "$BATTLE" \
    && check "2-fish formation case" "ok" \
    || check "2-fish formation case" "fail"

grep -q "count >= 3" "$BATTLE" \
    && check "3-fish triangle case" "ok" \
    || check "3-fish triangle case" "fail"

echo ""
echo "=== Combined HP Bar ==="

grep -q "this.partyHpBar = this.add.graphics()" "$BATTLE" \
    && check "Party HP bar uses Phaser Graphics" "ok" \
    || check "Party HP bar uses Phaser Graphics" "fail"

grep -q "chunk.maxHp / totalMax" "$BATTLE" \
    && check "Segment width proportional to maxHp" "ok" \
    || check "Segment width proportional to maxHp" "fail"

grep -q "chunk.color" "$BATTLE" \
    && check "Segment uses fish species color" "ok" \
    || check "Segment uses fish species color" "fail"

grep -q "partyHpTxt.setText" "$BATTLE" \
    && check "Total HP text displayed" "ok" \
    || check "Total HP text displayed" "fail"

echo ""
echo "=== Cooldown Indicators ==="

grep -q "cdGroup.base\b" "$BATTLE" \
    && check "Base attack cooldown indicator" "ok" \
    || check "Base attack cooldown indicator" "fail"

grep -q "cdGroup.special\b" "$BATTLE" \
    && check "Special cooldown indicator" "ok" \
    || check "Special cooldown indicator" "fail"

grep -q "f.baseTimer" "$BATTLE" \
    && check "Cooldown fill from baseTimer" "ok" \
    || check "Cooldown fill from baseTimer" "fail"

grep -q "f.specialTimer" "$BATTLE" \
    && check "Cooldown fill from specialTimer" "ok" \
    || check "Cooldown fill from specialTimer" "fail"

grep -q "setVisible(false)" "$BATTLE" \
    && check "Cooldown hidden on incapacitation" "ok" \
    || check "Cooldown hidden on incapacitation" "fail"

echo ""
echo "=== Event Handling ==="

for event in "fish_base_attack" "fish_special" "monster_base_attack" "monster_special" \
             "fish_incapacitated" "monster_dead" "party_dead" "poison_tick" "heal" "buff_applied"; do
    grep -q "'$event'" "$BATTLE" \
        && check "Event handled: $event" "ok" \
        || check "Event handled: $event" "fail"
done

# buff_expired is emitted by CombatSystem but not handled in BattleScene (known bug)
grep -q "'buff_expired'" "$BATTLE" \
    && check "Event handled: buff_expired" "ok" \
    || check "Event handled: buff_expired (KNOWN BUG — filed)" "fail"

echo ""
echo "=== Victory / Defeat Flows ==="

grep -q "PartySystem.awardXP(" "$BATTLE" \
    && check "Victory: awardXP called" "ok" \
    || check "Victory: awardXP called" "fail"

grep -q "gameState.gold +=" "$BATTLE" \
    && check "Victory: gold awarded" "ok" \
    || check "Victory: gold awarded" "fail"

grep -q "advanceFloor()" "$BATTLE" \
    && check "Victory: advanceFloor() called" "ok" \
    || check "Victory: advanceFloor() called" "fail"

grep -q "PartySystem.fullHeal(" "$BATTLE" \
    && check "Defeat: fullHeal called" "ok" \
    || check "Defeat: fullHeal called" "fail"

grep -q "gameState.floor = this.gameState.campFloor" "$BATTLE" \
    && check "Defeat: floor reset to campFloor" "ok" \
    || check "Defeat: floor reset to campFloor" "fail"

echo ""
echo "=== FloorScene Compatibility ==="

grep -q "generateMonster(" "$FLOOR" \
    && check "FloorScene uses generateMonster()" "ok" \
    || check "FloorScene uses generateMonster()" "fail"

grep -q "scene.start('BattleScene'" "$FLOOR" \
    && check "FloorScene starts BattleScene" "ok" \
    || check "FloorScene starts BattleScene" "fail"

for banned in "pendingMove" "showActions" "onMove" "showItemMenu"; do
    grep -q "$banned" "$FLOOR" \
        && check "No removed reference in FloorScene: $banned" "fail" \
        || check "No removed reference in FloorScene: $banned" "ok"
done

echo ""
echo "================================"
echo "Results: $PASS passed, $FAIL failed"
if [ "$FAIL" -eq 0 ]; then
    echo "STATUS: PASS"
else
    echo "STATUS: FAIL"
fi
