# QA Results: qa-title-button-animations
Plan: qa-title-button-animations
Status: passed
Found-by: qa-frontend

## Summary

All plan checks verified. The `title-button-animations` implementation is correct.

## Step 1: TitleScene.js Verification

All criteria confirmed in `dungeon-fisher/src/scenes/TitleScene.js`:

| Check | Result |
|-------|--------|
| `import dungeonPanel` present (line 7) | ✅ PASS |
| `_createTitleButton` helper exists (line 204) | ✅ PASS |
| Panel created via `dungeonPanel()` in helper (line 213) | ✅ PASS |
| Hover scale tween to 1.08 (lines 229–232) | ✅ PASS |
| Entrance slide+fade: `y: '-=15'`, alpha 0→0.7 (lines 252–256) | ✅ PASS |
| Idle breathing: panel alpha 0.6→0.8 repeat:-1 (lines 261–268) | ✅ PASS |
| NEW GAME at `height * 0.36`, delay 3500 → CharacterSelectScene | ✅ PASS |
| CONTINUE at `height * 0.43`, delay 3700, conditional on `SaveSystem.hasSave()` → continueGame() | ✅ PASS |
| ZONES at `height * 0.50`, delay 3900, fontSize '14px' → ZonePreviewScene | ✅ PASS |
| No old-style `'[ NEW GAME ]'` / `'[ CONTINUE ]'` / `'[ ZONES ]'` literals in button code | ✅ PASS |
| `pointerdown` callbacks correct (all via `_transitionTo`) | ✅ PASS |
| Title animation intact: Phase 1 glow, Phase 2 break-through, gold shimmer, particles, breathing | ✅ PASS |
| `_transitionTo` exists with full cleanup (lines 275–281) | ✅ PASS |

## Step 2: version.js Verification

- Expected: `'1.7.8'`
- Actual: `'1.7.9'`
- **Result: NOTE** — Version is higher than plan spec. Previous QA run (2313) confirmed it was `'1.7.8'` when `title-button-animations` deployed. The `title-gold-shimmer` plan subsequently bumped it to `'1.7.9'`. This is expected and correct. The version was bumped as required.

## Existing Test Fix

`test-dungeon-fisher-move-buttons-up.sh` had two failing checks (delay patterns) because the `_createTitleButton` calls span multiple lines but the grep patterns expected single-line matches. Updated checks 6 and 7 to use `grep -A2 | grep` multi-line strategy. **All 12 checks now pass.**

## Automated Test Run

```
Results: 12 passed, 0 failed
```

No bugs filed.
