# QA Results: fix-info-panel-layout
Plan: qa-fix-info-panel-layout
Status: FAIL
Date: 2026-02-22

## Summary

6/7 verification steps pass. Version bump missing — bug filed.

## Verification Steps

| # | Criterion | Result |
|---|-----------|--------|
| 1 | `panelH = 36 + gs.party.length * 18` (was 56+) | ✓ PASS |
| 2 | Flavor text NOT inside panel — positioned at `H * 0.42` | ✓ PASS |
| 3 | `wordWrap: { width: 100 }` and `align: 'center'` on flavor text | ✓ PASS |
| 4 | Scrim rectangle `0x000000` alpha `0.5` at depth 4; flavor at depth 5 | ✓ PASS |
| 5 | Warm tint shimmer tween (`addCounter`) on flavor text | ✓ PASS |
| 6 | Party bars `py` starts at `36` (was `56`) | ✓ PASS |
| 7 | PATCH version bump applied | ✗ FAIL |

## Pass Criteria Check

- **Info panel is shorter (no flavor text inside):** PASS — `panelH = 36 + gs.party.length * 18`, flavor text at `H * 0.42`
- **Flavor text centered mid-screen with word wrap, scrim, and shimmer:** PASS — all present in `FloorScene.js`
- **Party HP bars start at correct offset:** PASS — `py = 36`

## Bugs Filed

- `Planning/bugs/qa-fix-info-panel-layout-missing-version-bump.md` — `package.json` version still `0.11.0`, expected `0.11.1`

## Files Inspected

- `FrontEnds/dungeon-fisher/src/scenes/FloorScene.js` — all layout changes verified correct
- `FrontEnds/dungeon-fisher/package.json` — version NOT bumped (still `0.11.0`)
