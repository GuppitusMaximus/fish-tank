# QA Report: fix-version-scrim-size
Plan: qa-fix-version-scrim-size
Depends-on: fix-version-scrim-size
Status: pass
Found-by: qa-frontend

## Summary

Static code inspection of `dungeon-fisher/src/scenes/UIOverlayScene.js` and `dungeon-fisher/src/version.js`.

## Verification Results

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| No getBounds() for version scrim | Uses `displayWidth`/`displayHeight` | Lines 20–22 use `displayWidth`/`displayHeight` | ✅ |
| Padding | `pad = 2` (was 4) | `const pad = 2;` at line 19 | ✅ |
| Alpha | `0.5` (was 0.35) | `0x000000, 0.5` at line 22 | ✅ |
| Version bumped | PATCH increment | `1.10.13` → `1.10.14` (bumped in concurrent smooth-text-rendering commit) | ✅ |

## Code Evidence

**UIOverlayScene.js lines 19–25** (the version scrim):
```js
const pad = 2;
const sw = verTxt.displayWidth + pad * 2;
const sh = verTxt.displayHeight + pad * 2;
this.add.rectangle(verTxt.x - verTxt.displayWidth / 2, verTxt.y - verTxt.displayHeight / 2, sw, sh, 0x000000, 0.5)
    .setOrigin(0.5)
    .setDepth(999)
    .setScrollFactor(0);
```

Note: `getBounds()` appears at lines 73–74 for `menuBtn`/`bagBtn` scrim sizing — this is unrelated to the version scrim and correct.

**version.js**: `VERSION = '1.10.14'` — PATCH increment from 1.10.13. The bump was committed in the concurrent `smooth-text-rendering` plan (d78c9de). Both plans landed in the same deployment batch.

## Pass Criteria

- ✅ Scrim uses displayWidth/displayHeight for sizing
- ✅ Darker and tighter than before (alpha 0.5, pad 2)
