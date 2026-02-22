# QA Results: fix-card-layout

Plan: qa-fix-card-layout
Status: PASS
Date: 2026-02-22

## Verification Summary

All 6 plan criteria verified by static code inspection of `dungeon-fisher/src/scenes/FloorScene.js`.

| # | Criterion | Result |
|---|-----------|--------|
| 1 | `cardH` max is 84 (not 105) | ✓ PASS |
| 2 | `positions` object unconditionally has all 3 slots | ✓ PASS |
| 3 | No `if (shopAvailable)` around position calculations | ✓ PASS |
| 4 | Edge margin: shop x = margin (8), camp x = W - cardW - margin | ✓ PASS |
| 5 | `delveY` uses `H * 0.74` (was 0.67) | ✓ PASS |
| 6 | Version bumped: 1.10.8 → 1.10.9 (PATCH) | ✓ PASS |

## Detail

### 1. Card height (line 138)
```js
const cardH = Math.min(84, H - py - 50);
```
Max is 84. ✓

### 2. Fixed positions (lines 145–149)
```js
const positions = {
    'shop':  { x: margin, y: topY },
    'delve': { x: Math.floor((W - cardW) / 2), y: delveY },
    'camp':  { x: W - cardW - margin, y: topY }
};
```
Unconditional — always defines all 3 slots. ✓

### 3. No dynamic shifting
`if (shopAvailable)` on line 133 only controls which cards are pushed into the `cards` rendering array. Position calculations are fully independent of `shopAvailable`. ✓

### 4. Edge margins
- Shop: `x: margin` (margin = 8) ✓
- Camp: `x: W - cardW - margin` ✓

### 5. Delve Y position (line 142)
```js
const delveY = Math.floor(H * 0.74) - cardH / 2;
```
Uses `H * 0.74`. ✓

### 6. Version bump
- Previous (de1d515): `VERSION = '1.10.8'`
- Current (01a70f2): `VERSION = '1.10.9'`
- PATCH increment confirmed. ✓

## Pass Criteria Met

- ✓ Positions object always has all 3 card slots defined
- ✓ No conditional positioning logic remains
- ✓ Cards have edge margin preventing clipping
