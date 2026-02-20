# QA Results: Fix Background Display Cover Crop
Plan: qa-fix-bg-cover-dungeon-fisher
Status: PASS
Date: 2026-02-19
Found-by: qa-frontend

## Summary

All 6 plan checks passed. The `coverBackground()` helper was correctly implemented
and used in all 6 scenes (8 call sites total). No regressions found.

## Checks

### 1. coverBackground helper exists — PASS

`FrontEnds/dungeon-fisher/src/utils/zones.js` exports `coverBackground` using
`Math.max(W / img.width, H / img.height)` for scale, correctly implementing cover-crop
(fills the full canvas without distortion by scaling to the larger dimension ratio).

### 2. No remaining setDisplaySize for backgrounds — PASS

Grep across all 6 scene files returns zero matches for `setDisplaySize`. The old
stretch-to-fill approach has been fully removed.

### 3. All 6 scenes import coverBackground — PASS

| Scene | Import |
|-------|--------|
| FloorScene.js | `import { getBackgroundKey, coverBackground } from '../utils/zones.js'` |
| BattleScene.js | `import { getBackgroundKey, coverBackground } from '../utils/zones.js'` |
| CampScene.js | `import { getBackgroundKey, coverBackground } from '../utils/zones.js'` |
| ShopScene.js | `import { getBackgroundKey, coverBackground } from '../utils/zones.js'` |
| TitleScene.js | `import { coverBackground } from '../utils/zones.js'` |
| VictoryScene.js | `import { getBackgroundKey, coverBackground } from '../utils/zones.js'` |

### 4. All 8 call sites updated — PASS

| Scene | Call Site | Location |
|-------|-----------|----------|
| FloorScene | `coverBackground(this, bgKey)` | `buildFloorUI()` line 43 |
| FloorScene | `coverBackground(this, bgKey)` | `showFloorReward()` line 130 |
| BattleScene | `coverBackground(this, bgKey)` | `create()` line 50 |
| CampScene | `coverBackground(this, bgKey)` | `create()` line 22 |
| ShopScene | `coverBackground(this, bgKey)` | `buildShop()` line 28 |
| TitleScene | `this.bg = coverBackground(this, 'bg_title')` | `create()` line 19 |
| TitleScene | `coverBackground(this, 'bg_title')` | `showStarterSelection()` line 172 |
| VictoryScene | `coverBackground(this, 'bg_dungeon-heart')` | `create()` line 20 |

### 5. TitleScene Ken Burns tween — PASS

The zoom animation reads from the returned image instance:
```js
this.bg = coverBackground(this, 'bg_title');
this.tweens.add({
    targets: this.bg,
    scaleX: this.bg.scaleX * 1.08,
    scaleY: this.bg.scaleY * 1.08,
    ...
});
```
This correctly uses the dynamically computed cover scale, not hardcoded values.

### 6. No regressions — PASS

In every scene, `coverBackground()` is called before any `add.rectangle()` dark overlay.
The draw order is preserved: background first, overlay second, UI on top.

| Scene | Order |
|-------|-------|
| FloorScene `showFloorReward()` | background line 130, overlay line 131 |
| BattleScene `create()` | background line 50, panels lines 53-55 |
| CampScene `create()` | background line 22, overlay line 23 |
| ShopScene `buildShop()` | background line 28, overlay line 29 |
| TitleScene `create()` | background line 19, overlay line 31 |
| TitleScene `showStarterSelection()` | background line 172, overlay line 173 |
| VictoryScene `create()` | background line 20, overlay line 21 |

## Test Script

`tests/test-dungeon-fisher-bg-cover.sh` — 18 static checks, all pass.

Run:
```bash
bash tests/test-dungeon-fisher-bg-cover.sh
```

## Bugs Filed

None. All checks passed.
