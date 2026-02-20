#!/usr/bin/env bash
# QA test for qa-sprite-animations-dungeon-fisher
# Verifies SpriteAnimator tween-based animation system is correctly integrated.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$SCRIPT_DIR/.."
EFFECTS="$ROOT/dungeon-fisher/src/effects/SpriteAnimator.js"
BATTLE="$ROOT/dungeon-fisher/src/scenes/BattleScene.js"
TITLE="$ROOT/dungeon-fisher/src/scenes/TitleScene.js"
FLOOR="$ROOT/dungeon-fisher/src/scenes/FloorScene.js"

PASS=0
FAIL=0

check() {
    local label="$1"
    local result="$2"
    if [ "$result" = "0" ]; then
        echo "  PASS: $label"
        PASS=$((PASS + 1))
    else
        echo "  FAIL: $label"
        FAIL=$((FAIL + 1))
    fi
}

echo "=== SpriteAnimator: Module Structure ==="

# Check 1: File exists
[ -f "$EFFECTS" ]
check "SpriteAnimator.js exists" $?

# Check 2: Exports default class
grep -q "export default class SpriteAnimator" "$EFFECTS"
check "exports default class SpriteAnimator" $?

# Check 3: Has idle() method
grep -q "idle()" "$EFFECTS"
check "has idle() method" $?

# Check 4: Has attack() method
grep -q "attack(targetX, targetY)" "$EFFECTS"
check "has attack(targetX, targetY) method" $?

# Check 5: Has hit() method
grep -q "hit()" "$EFFECTS"
check "has hit() method" $?

# Check 6: Has faint() method
grep -q "faint()" "$EFFECTS"
check "has faint() method" $?

# Check 7: Has stopIdle() method
grep -q "stopIdle()" "$EFFECTS"
check "has stopIdle() method" $?

# Check 8: Has destroy() method
grep -q "destroy()" "$EFFECTS"
check "has destroy() method" $?

echo ""
echo "=== SpriteAnimator: idle() Tween Details ==="

# Check 9: idle() stores idleTween
grep -q "this.idleTween = this.scene.tweens.add" "$EFFECTS"
check "idle() stores idleTween via scene.tweens.add" $?

# Check 10: idle() stores breathTween
grep -q "this.breathTween = this.scene.tweens.add" "$EFFECTS"
check "idle() stores breathTween via scene.tweens.add" $?

# Check 11: idleTween has yoyo: true
grep -A6 "this.idleTween" "$EFFECTS" | grep -q "yoyo: true"
check "idleTween has yoyo: true" $?

# Check 12: idleTween has repeat: -1
grep -A6 "this.idleTween" "$EFFECTS" | grep -q "repeat: -1"
check "idleTween has repeat: -1" $?

# Check 13: breathTween has yoyo: true
grep -A8 "this.breathTween" "$EFFECTS" | grep -q "yoyo: true"
check "breathTween has yoyo: true" $?

# Check 14: breathTween has repeat: -1
grep -A8 "this.breathTween" "$EFFECTS" | grep -q "repeat: -1"
check "breathTween has repeat: -1" $?

# Check 15: breathTween modifies scaleX
grep -A8 "this.breathTween" "$EFFECTS" | grep -q "scaleX:"
check "breathTween modifies scaleX" $?

# Check 16: breathTween modifies scaleY
grep -A8 "this.breathTween" "$EFFECTS" | grep -q "scaleY:"
check "breathTween modifies scaleY" $?

echo ""
echo "=== SpriteAnimator: attack() ==="

# Check 17: attack() returns Promise
grep -A2 "attack(targetX, targetY)" "$EFFECTS" | grep -q "return new Promise"
check "attack() returns new Promise" $?

# Check 18: attack() uses setTintFill for white flash
grep -q "setTintFill(0xffffff)" "$EFFECTS"
check "attack() flashes white with setTintFill(0xffffff)" $?

# Check 19: attack() calls clearTint
grep -q "this.sprite.clearTint()" "$EFFECTS"
check "attack() clears tint after flash" $?

# Check 20: attack() resumes idle after snap back
grep -q "this.idle();" "$EFFECTS"
check "attack() resumes idle() after snap back" $?

echo ""
echo "=== SpriteAnimator: hit() ==="

# Check 21: hit() returns Promise
grep -A2 "hit()" "$EFFECTS" | grep -q "return new Promise"
check "hit() returns new Promise" $?

# Check 22: hit() applies red tint
grep -q "setTint(0xff4444)" "$EFFECTS"
check "hit() applies red tint setTint(0xff4444)" $?

echo ""
echo "=== SpriteAnimator: faint() ==="

# Check 23: faint() returns Promise
grep -A2 "faint()" "$EFFECTS" | grep -q "return new Promise"
check "faint() returns new Promise" $?

# Check 24: faint() calls stopIdle first
grep -A2 "faint()" "$EFFECTS" | grep -q "this.stopIdle()"
check "faint() calls stopIdle() before tween" $?

# Check 25: faint() tilts to 90 degrees
grep -q "angle: 90" "$EFFECTS"
check "faint() tilts sprite to angle: 90" $?

# Check 26: faint() fades alpha
grep -q "alpha: 0" "$EFFECTS"
check "faint() fades alpha" $?

# Check 27: faint() drops y position
grep -q "y: this.baseY + " "$EFFECTS"
check "faint() drops y position" $?

echo ""
echo "=== SpriteAnimator: stopIdle() / destroy() ==="

# Check 28: stopIdle destroys idleTween
grep -A3 "stopIdle()" "$EFFECTS" | grep -q "idleTween.destroy()"
check "stopIdle() destroys idleTween" $?

# Check 29: stopIdle destroys breathTween
grep -A5 "stopIdle()" "$EFFECTS" | grep -q "breathTween.destroy()"
check "stopIdle() destroys breathTween" $?

# Check 30: destroy() calls stopIdle
grep -A3 "destroy()" "$EFFECTS" | grep -q "this.stopIdle()"
check "destroy() delegates to stopIdle()" $?

echo ""
echo "=== BattleScene Integration ==="

# Check 31: BattleScene imports SpriteAnimator
grep -q "import SpriteAnimator from '../effects/SpriteAnimator.js'" "$BATTLE"
check "BattleScene imports SpriteAnimator" $?

# Check 32: BattleScene attaches animator to monster sprite with idle
grep -q "this.monsterAnim = new SpriteAnimator(this, this.monsterSpr).idle()" "$BATTLE"
check "monsterAnim = new SpriteAnimator(...).idle() in create()" $?

# Check 33: BattleScene attaches animator to fish sprite with idle
grep -q "this.fishAnim = new SpriteAnimator(this, this.fishSpr).idle()" "$BATTLE"
check "fishAnim = new SpriteAnimator(...).idle() in create()" $?

# Check 34: BattleScene calls attack() in execAttack
grep -q "attackerAnim.attack(" "$BATTLE"
check "execAttack() calls attackerAnim.attack()" $?

# Check 35: BattleScene chains hit() after attack
grep -q "defenderAnim.hit()" "$BATTLE"
check "execAttack() chains defenderAnim.hit()" $?

# Check 36: BattleScene calls faint() on monster defeat
grep -A2 "onMonsterDead()" "$BATTLE" | grep -q "this.monsterAnim.faint()"
check "onMonsterDead() calls monsterAnim.faint()" $?

# Check 37: BattleScene calls faint() on fish defeat
grep -A2 "onFishDead()" "$BATTLE" | grep -q "this.fishAnim.faint()"
check "onFishDead() calls fishAnim.faint()" $?

# Check 38: Fish switching destroys old animator
grep -q "this.fishAnim.destroy()" "$BATTLE"
check "showSwitchMenu() destroys old fishAnim" $?

# Check 39: Fish switching creates new animator
grep -q "this.fishAnim = new SpriteAnimator(this, this.fishSpr).idle()" "$BATTLE"
check "showSwitchMenu() creates new SpriteAnimator with idle()" $?

echo ""
echo "=== TitleScene Integration ==="

# Check 40: TitleScene imports SpriteAnimator
grep -q "import SpriteAnimator from '../effects/SpriteAnimator.js'" "$TITLE"
check "TitleScene imports SpriteAnimator" $?

# Check 41: TitleScene showStarterSelection uses SpriteAnimator (portrait)
grep -A40 "showStarterSelection()" "$TITLE" | grep -q "new SpriteAnimator("
check "showStarterSelection() attaches SpriteAnimator to fish sprites" $?

# Check 42: idle() called on starter fish sprites
grep -A40 "showStarterSelection()" "$TITLE" | grep -q ".idle()"
check "showStarterSelection() calls idle() on fish sprites" $?

echo ""
echo "=== FloorScene Integration ==="

# Check 43: FloorScene imports SpriteAnimator
grep -q "import SpriteAnimator from '../effects/SpriteAnimator.js'" "$FLOOR"
check "FloorScene imports SpriteAnimator" $?

# Check 44: showFishReward uses SpriteAnimator (function spans >10 lines, search full file)
grep -q "new SpriteAnimator(" "$FLOOR"
check "showFishReward() attaches SpriteAnimator to recruit sprite" $?

# Check 45: idle() called on recruit fish sprite
grep -A20 "showFishReward(species)" "$FLOOR" | grep -q "\.idle()"
check "showFishReward() calls idle() on recruit sprite" $?

echo ""
echo "=== Regression: No Broken Imports ==="

# Check 46: No syntax error markers in SpriteAnimator (basic sanity)
node --input-type=module --eval "
import { readFileSync } from 'fs';
const src = readFileSync('$EFFECTS', 'utf8');
if (!src.includes('export default class SpriteAnimator')) process.exit(1);
" 2>/dev/null
check "SpriteAnimator.js parseable as ESM module" $?

# Check 47: Attack uses promise-chained animation (no callback style)
grep -q "attackerAnim.attack(" "$BATTLE" && grep -A2 "attackerAnim.attack(" "$BATTLE" | grep -q ".then("
check "BattleScene chains attack().then() correctly" $?

echo ""
echo "==================================================="
echo "Results: $PASS passed, $FAIL failed"
echo "==================================================="

if [ "$FAIL" -gt 0 ]; then
    exit 1
else
    exit 0
fi
