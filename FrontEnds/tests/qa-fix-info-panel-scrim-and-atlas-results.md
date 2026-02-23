# QA Report: fix-info-panel-scrim-and-atlas

Plan: qa-fix-info-panel-scrim-and-atlas
Depends-on: fix-info-panel-scrim-and-atlas
Date: 2026-02-22
Result: **PASS** — all 4 criteria verified (5/5 automated checks pass)

## Verification Results

### 1. Atlas darkened ✅
`sewers_wide.png` corner pixel (0,0) changed from `(195, 211, 182)` to `(48, 52, 45)` — significantly darker opaque frame. Verified via git diff of binary image + PIL pixel read.

### 2. Scrim larger ✅
`FloorScene.js` line 79:
```js
this.add.rectangle(W / 2, panelH / 2, W - panelMargin * 2 - 8, panelH - 8, 0x000000, 0.6)
```
Width uses `W - panelMargin * 2 - 8` (was `-20`), height uses `panelH - 8` (was `-20`).

### 3. Scrim darker ✅
Alpha is `0.6` (was `0.4`) — confirmed in same line above.

### 4. Version bumped ✅
`version.js` changed from `'1.10.25'` → `'1.10.26'` — PATCH increment as required.

## Files Inspected
- `dungeon-fisher/src/scenes/FloorScene.js` — scrim size and alpha verified (lines 72–80)
- `dungeon-fisher/src/version.js` — VERSION='1.10.26' confirmed
- `dungeon-fisher/public/atlases/sewers_wide.png` — pixel darkening verified against previous commit 3d96a225

## Summary
All pass criteria met. The info panel scrim covers panel text with a larger (−8 margins instead of −20) and darker (alpha 0.6 vs 0.4) black rectangle at depth 1, ensuring text is readable over the transparent atlas center. The sewers_wide.png atlas frame is significantly darkened (R: 195→48, G: 211→52, B: 182→45 at corner pixel). VERSION PATCH bumped from 1.10.25 to 1.10.26.
