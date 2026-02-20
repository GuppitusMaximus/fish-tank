# QA Report: Title Background Contain Scaling
Plan: qa-title-bg-contain-scaling
Status: passed
Date: 2026-02-20
Found-by: qa-frontend

## Summary

All 4 plan verification criteria pass. The `coverBackground()` utility correctly
supports an optional `mode` parameter, and `TitleScene` correctly uses `'contain'`
for the title background in both `create()` and `showStarterSelection()`. All other
scene call sites continue to use the default `'cover'` behavior.

## Verification Results

### 1. `coverBackground()` mode parameter — PASS
- **File:** `dungeon-fisher/src/utils/zones.js:11`
- Function signature: `export function coverBackground(scene, key, mode = 'cover')`
- When `mode === 'contain'`: uses `Math.min(W / img.width, H / img.height)` ✅
- Otherwise (default `'cover'`): uses `Math.max(W / img.width, H / img.height)` ✅

### 2. TitleScene calls with `'contain'` in both methods — PASS
- `TitleScene.create()` line 20: `this.bg = coverBackground(this, 'bg_title', 'contain')` ✅
- `TitleScene.showStarterSelection()` line 246: `coverBackground(this, 'bg_title', 'contain')` ✅

### 3. No other scenes use `'contain'` — PASS
All non-title scene call sites pass no mode argument (default `'cover'`):
- `FloorScene.js:45,133` — no mode arg ✅
- `BattleScene.js:52` — no mode arg ✅
- `ShopScene.js:29` — no mode arg ✅
- `CampScene.js:23` — no mode arg ✅
- `ZonePreviewScene.js:41` — no mode arg ✅
- `VictoryScene.js:21` — no mode arg ✅

### 4. Backward compatibility — PASS
- Default value `mode = 'cover'` ensures all existing callers without a `mode`
  argument continue to get `Math.max` cover-crop scaling with no code changes. ✅

## Test Artifacts

- `tests/test-title-bg-contain-scaling.sh` — 17 static checks, all pass
- `tests/test-dungeon-fisher-bg-cover.sh` — 18 regression checks, all still pass

## Bugs Filed

None. All verification criteria satisfied.
