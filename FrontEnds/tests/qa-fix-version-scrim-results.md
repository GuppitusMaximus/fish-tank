# QA Report: fix-version-scrim

Plan: qa-fix-version-scrim
Depends-on: fix-version-scrim
Date: 2026-02-22
Result: **PASS** — all 5 criteria verified

## Verification Results

### 1. Scrim exists ✅
`UIOverlayScene.js` line 22 creates:
```js
this.add.rectangle(bounds.centerX, bounds.centerY, bounds.width + pad * 2, bounds.height + pad * 2, 0x000000, 0.35)
```
Fill `0x000000`, alpha `0.35` — correct.

### 2. Depth layering ✅
- `verTxt.setDepth(1000)` (line 16) — version text on top
- Scrim `.setDepth(999)` (line 23) — scrim behind text
- Correct ordering confirmed.

### 3. Fixed to viewport ✅
Scrim has `.setScrollFactor(0)` (line 24). Text also has `.setScrollFactor(0)` (line 17).

### 4. Padding ✅
```js
const pad = 4;
this.add.rectangle(..., bounds.width + pad * 2, bounds.height + pad * 2, ...)
```
4px padding on each side (8px total per axis).

### 5. Version bumped ✅
`version.js` changed from `'1.10.9'` → `'1.10.10'` — PATCH increment as required.

## Files Inspected
- `dungeon-fisher/src/scenes/UIOverlayScene.js` — scrim implementation verified
- `dungeon-fisher/src/version.js` — VERSION='1.10.10' confirmed

## Summary
All pass criteria met. The dark semi-transparent scrim (0x000000, alpha 0.35) renders at depth 999 behind the version text at depth 1000. Both are viewport-fixed. The rectangle is 4px larger than the text bounds on each side. VERSION PATCH bumped from 1.10.9 to 1.10.10.
