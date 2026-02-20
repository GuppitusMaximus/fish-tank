#!/usr/bin/env bash
# Static checks for SpriteAnimator tween-based animations (plan: qa-sprite-animations-dungeon-fisher)
# Tests SpriteAnimator class structure and integration in BattleScene, TitleScene, FloorScene.
# Run from anywhere — paths are resolved relative to this script's location.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$SCRIPT_DIR/../dungeon-fisher/src"

SPRITE_ANIM="$SRC/effects/SpriteAnimator.js"
BATTLE="$SRC/scenes/BattleScene.js"
TITLE="$SRC/scenes/TitleScene.js"
FLOOR="$SRC/scenes/FloorScene.js"

pass=0
fail=0

check() {
    local desc="$1"
    local pattern="$2"
    local file="$3"
    if grep -q "$pattern" "$file" 2>/dev/null; then
        echo "  PASS: $desc"
        pass=$((pass+1))
    else
        echo "  FAIL: $desc"
        fail=$((fail+1))
    fi
}

echo "=== SpriteAnimator: Module Structure ==="

check "SpriteAnimator exported as default class" \
    "export default class SpriteAnimator" "$SPRITE_ANIM"

check "idle() method defined" \
    "idle()" "$SPRITE_ANIM"

check "attack() method defined" \
    "attack(targetX, targetY)" "$SPRITE_ANIM"

check "hit() method defined" \
    "hit()" "$SPRITE_ANIM"

check "faint() method defined" \
    "faint()" "$SPRITE_ANIM"

check "stopIdle() method defined" \
    "stopIdle()" "$SPRITE_ANIM"

check "destroy() method defined" \
    "destroy()" "$SPRITE_ANIM"

echo ""
echo "=== SpriteAnimator: idle() — two tweens ==="

check "idle() creates vertical bob tween (idleTween)" \
    "idleTween" "$SPRITE_ANIM"

check "idle() creates breathing tween (breathTween)" \
    "breathTween" "$SPRITE_ANIM"

check "bob tween has repeat: -1" \
    "repeat: -1" "$SPRITE_ANIM"

check "bob tween has yoyo: true" \
    "yoyo: true" "$SPRITE_ANIM"

check "scale breathing tweens scaleX" \
    "scaleX: this.baseScaleX" "$SPRITE_ANIM"

check "scale breathing tweens scaleY" \
    "scaleY: this.baseScaleY" "$SPRITE_ANIM"

echo ""
echo "=== SpriteAnimator: attack() — returns Promise ==="

check "attack() returns new Promise" \
    "return new Promise" "$SPRITE_ANIM"

check "attack() calls stopIdle() before lunging" \
    "this.stopIdle()" "$SPRITE_ANIM"

check "attack() flashes white with setTintFill(0xffffff)" \
    "setTintFill(0xffffff)" "$SPRITE_ANIM"

check "attack() clears tint after flash" \
    "this.sprite.clearTint()" "$SPRITE_ANIM"

check "attack() resumes idle() after snap-back" \
    "this.idle()" "$SPRITE_ANIM"

echo ""
echo "=== SpriteAnimator: hit() — returns Promise ==="

check "hit() returns Promise" \
    "return new Promise" "$SPRITE_ANIM"

check "hit() applies red tint (0xff4444)" \
    "setTint(0xff4444)" "$SPRITE_ANIM"

echo ""
echo "=== SpriteAnimator: faint() — returns Promise ==="

check "faint() returns Promise" \
    "return new Promise" "$SPRITE_ANIM"

check "faint() tilts sprite to 90 degrees" \
    "angle: 90" "$SPRITE_ANIM"

check "faint() fades alpha" \
    "alpha: 0." "$SPRITE_ANIM"

check "faint() drops y position" \
    "y: this.baseY +" "$SPRITE_ANIM"

echo ""
echo "=== BattleScene: SpriteAnimator integration ==="

check "BattleScene imports SpriteAnimator" \
    "import SpriteAnimator from '../effects/SpriteAnimator.js'" "$BATTLE"

check "monster sprite gets SpriteAnimator with idle() on create" \
    "monsterAnim = new SpriteAnimator(this, this.monsterSpr).idle()" "$BATTLE"

check "fish sprite gets SpriteAnimator with idle() on create" \
    "fishAnim = new SpriteAnimator(this, this.fishSpr).idle()" "$BATTLE"

check "execAttack uses attackerAnim.attack()" \
    "attackerAnim.attack(" "$BATTLE"

check "execAttack chains defenderAnim.hit()" \
    "defenderAnim.hit()" "$BATTLE"

check "onMonsterDead calls monsterAnim.faint()" \
    "this.monsterAnim.faint()" "$BATTLE"

check "onFishDead calls fishAnim.faint()" \
    "this.fishAnim.faint()" "$BATTLE"

check "fish switch destroys old animator" \
    "this.fishAnim.destroy()" "$BATTLE"

check "fish switch creates new animator with idle()" \
    "this.fishAnim = new SpriteAnimator(this, this.fishSpr).idle()" "$BATTLE"

echo ""
echo "=== TitleScene: starter selection idle animations ==="

check "TitleScene imports SpriteAnimator" \
    "import SpriteAnimator from '../effects/SpriteAnimator.js'" "$TITLE"

check "showStarterSelection() creates SpriteAnimator for fish sprites" \
    "new SpriteAnimator(this, fishImg).idle()" "$TITLE"

echo ""
echo "=== FloorScene: recruit fish idle animation ==="

check "FloorScene imports SpriteAnimator" \
    "import SpriteAnimator from '../effects/SpriteAnimator.js'" "$FLOOR"

check "showFishReward() creates SpriteAnimator for recruit" \
    "new SpriteAnimator(this, recruitImg).idle()" "$FLOOR"

echo ""
echo "======================================"
echo "Results: $pass passed, $fail failed"
echo "======================================"

if [ "$fail" -gt 0 ]; then
    exit 1
fi
exit 0
