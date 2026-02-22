# QA Results: qa-raise-title-text

Plan: qa-raise-title-text
Status: completed
Date: 2026-02-22

## Summary

All 3 verification checks passed. Title text position was successfully raised.

## Checks

| # | Check | Result |
|---|-------|--------|
| 1 | `titleText` Y position is `height * 0.13` in TitleScene.js | PASS |
| 2 | No old `0.22` Y position on `titleText` | PASS |
| 3 | VERSION >= 1.7.5 (current: 1.7.6) | PASS |

## Notes

- VERSION was `1.7.5` when `raise-title-text` executed. A subsequent plan (restyle title font, commit `3ce25c1`) bumped it to `1.7.6`. The version check was updated to accept >= 1.7.5.
- The `0.22` appearing at TitleScene.js:250 (`height * 0.2 + i * (height * 0.22)`) is dungeon level spacing, unrelated to the title text.

## Files Verified

- `dungeon-fisher/src/scenes/TitleScene.js` — titleText at `height * 0.13` (line 92)
- `dungeon-fisher/src/version.js` — VERSION `'1.7.6'`
