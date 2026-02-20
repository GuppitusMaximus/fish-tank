# QA Results: Sprite Tween Animations — Dungeon Fisher
Plan: qa-sprite-animations-dungeon-fisher
Status: completed
Verified-by: qa-frontend
Date: 2026-02-20

## Summary

All 9 checks pass. The SpriteAnimator tween-based animation system is correctly
implemented and integrated across BattleScene, TitleScene, and FloorScene.

## Checks

### 1. SpriteAnimator module exists ✅

`FrontEnds/dungeon-fisher/src/effects/SpriteAnimator.js` exports a default class
with all required methods: `idle()`, `attack()`, `hit()`, `faint()`, `stopIdle()`,
and `destroy()`.

### 2. idle() creates two tweens ✅

- **Vertical bob:** tween targets `sprite.y` to `baseY - 2`, `duration: 1200`,
  `yoyo: true`, `repeat: -1`, `ease: 'Sine.InOut'` — stored as `this.idleTween`
- **Scale breathing:** tween targets `scaleX: baseScaleX * 1.03` and
  `scaleY: baseScaleY * 0.97`, `duration: 1800`, `yoyo: true`, `repeat: -1`,
  `ease: 'Sine.InOut'` — stored as `this.breathTween`

Both use `repeat: -1` (infinite) and `yoyo: true` (oscillating). ✅

### 3. attack() returns Promise ✅

- Returns `new Promise(resolve => {...})`
- Calls `this.stopIdle()` at start
- Lunges toward target: `x = baseX + (targetX - baseX) * 0.4`, `y = baseY + (targetY - baseY) * 0.2`
- Flashes white with `this.sprite.setTintFill(0xffffff)` after lunge completes
- Clears tint after 80ms delay
- Snaps back to `baseX`/`baseY`/`baseScaleX`/`baseScaleY`
- Calls `this.idle()` and `resolve()` in snap-back `onComplete`

### 4. hit() returns Promise ✅

- Returns `new Promise(resolve => {...})`
- Applies red tint: `this.sprite.setTint(0xff4444)`
- Shakes horizontally: tween `x` to `baseX - 3`, `yoyo: true`, `repeat: 3`, `duration: 50`
- Resets `sprite.x = this.baseX` after shake
- Clears tint after 100ms delay, then calls `resolve()`

### 5. faint() returns Promise ✅

- Returns `new Promise(resolve => {...})`
- Calls `this.stopIdle()` first
- Tween: `angle: 90`, `alpha: 0.3`, `y: baseY + 10`, `duration: 600`, `ease: 'Sine.In'`
- Calls `resolve()` in `onComplete`

### 6. BattleScene integration ✅

`BattleScene.create()` (lines 77–78):
```javascript
this.monsterAnim = new SpriteAnimator(this, this.monsterSpr).idle();
this.fishAnim = new SpriteAnimator(this, this.fishSpr).idle();
```

Both sprites have SpriteAnimator attached and `idle()` started on create.

Animations play during combat in `execAttack()` (lines 221–225):
```javascript
attackerAnim.attack(defenderSpr.x, defenderSpr.y).then(() => {
    return defenderAnim.hit();
}).then(() => {
    this.time.delayedCall(300, cb);
});
```

`faint()` called in `onMonsterDead()` and `onFishDead()`.

### 7. TitleScene starter selection ✅

`showStarterSelection()` creates `SpriteAnimator` with `idle()` for each starter
fish sprite in both portrait and landscape branches:

- Portrait (line 261): `new SpriteAnimator(this, fishImg).idle();`
- Landscape (line 288): `new SpriteAnimator(this, fishImg).idle();`

### 8. FloorScene recruit ✅

`showFishReward()` (lines 172–173):
```javascript
const recruitImg = this.add.image(W / 2, H * 0.52, 'fish_' + species.id).setScale(0.75);
new SpriteAnimator(this, recruitImg).idle();
```

### 9. No regressions ✅

Fish switching in `showSwitchMenu()` (lines 329–330):
```javascript
this.fishAnim.destroy();
this.fishAnim = new SpriteAnimator(this, this.fishSpr).idle();
```

Old animator is properly destroyed and replaced with a fresh one after fish switch.
`fishSpr` texture and alpha/angle are reset before the new animator is attached.

## Files Verified

- `FrontEnds/dungeon-fisher/src/effects/SpriteAnimator.js` — ✅ all methods correct
- `FrontEnds/dungeon-fisher/src/scenes/BattleScene.js` — ✅ integrated, idle on create, attack/hit/faint in combat, animator replaced on fish switch
- `FrontEnds/dungeon-fisher/src/scenes/TitleScene.js` — ✅ idle on all starter fish sprites (portrait + landscape)
- `FrontEnds/dungeon-fisher/src/scenes/FloorScene.js` — ✅ idle on recruit fish in showFishReward()

## Bugs Filed

None.
