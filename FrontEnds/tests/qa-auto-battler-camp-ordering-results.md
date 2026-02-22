# QA Report: Auto-Battler Camp Party Ordering
Plan: auto-battler-camp-ordering
QA Plan: qa-auto-battler-camp-ordering
Status: PASS
Found-by: qa-frontend
Date: 2026-02-21

## Summary

All 5 verification steps passed. The party ordering UI in `CampScene.js` is correctly implemented. No bugs found.

## Verification Steps

### 1. Section Presence ✅

- `renderPartyOrder()` is called from `create()` at line 73
- Party order section renders after HP healing display (lines 50–63) and checkpoint message (lines 66–68)
- Continue button placed at `Math.max(this.orderEndY + 22, H - 30)` — always below the ordering section

### 2. UI Elements ✅

- **Header:** `'PARTY ORDER'` at line 94 ✅
- **Subtext:** `'First fish takes damage first'` at line 100 ✅
- **Fish name + level:** `f.name + ' Lv.' + f.level` per fish at line 107 ✅
- **`(FRONT)` label:** Displayed for `i === 0` at lines 112–117 ✅
- **Up arrow ▲:** Unicode `\u25b2` at line 120 ✅
- **Down arrow ▼:** Unicode `\u25bc` at line 134 ✅

### 3. Reorder Logic ✅

- **Up swap:** `[gs.party[i-1], gs.party[i]] = [gs.party[i], gs.party[i-1]]` at line 126 ✅
- **Down swap:** `[gs.party[i], gs.party[i+1]] = [gs.party[i+1], gs.party[i]]` at line 140 ✅
- **Auto-save:** `SaveSystem.save(gs)` called after both up (line 127) and down (line 141) swaps ✅
- **Re-render:** `this.renderPartyOrder()` called after both swaps (lines 128, 142) ✅
- **Cleanup:** `this.orderObjects.forEach(obj => obj.destroy())` before each re-render at line 89 ✅

### 4. Edge Cases ✅

Arrow visibility is controlled purely by index bounds:
- **First fish** (`i === 0`): No ▲ (condition `i > 0` is false), ▼ shown if `party.length > 1`
- **Last fish** (`i === party.length - 1`): ▲ shown, no ▼ (condition `i < length - 1` is false)
- **1-fish party:** Only `(FRONT)` label, no arrows ✅
- **2-fish party:** Fish 0 has ▼ only; fish 1 has ▲ only ✅
- **3-fish party:** Fish 0 has ▼, fish 1 has both, fish 2 has ▲ only ✅

### 5. Layout ✅

Layout trace for 3-fish party on 270×480 viewport:
- HP display: y=60→126 (3 fish × 22px)
- Checkpoint: y=141 (doesn't advance `y`)
- Party order section starts: `orderStartY = 126 + 35 = 161`
  - Header: y=161→176
  - Subtext: y=176→192
  - 3 fish rows: y=192→246 (3 × 18px)
  - `orderEndY = 246`
- Continue button: `Math.max(246 + 22, 480 - 30)` = `Math.max(268, 450)` = **y=450**

Continue button at y=450 within 480px viewport — no overflow. ✅

## Test Script

`tests/test-camp-party-order.sh` — 24 static checks, all pass.

## Bugs Filed

None.
