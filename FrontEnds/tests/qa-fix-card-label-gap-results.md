# QA Results: fix-card-label-gap

**Plan:** fix-card-label-gap
**Status:** PASS
**Date:** 2026-02-22
**Method:** Static code inspection of `FloorScene.js` and `version.js`

## Checks

| # | Criterion | Result |
|---|-----------|--------|
| 1 | Label Y calculated from `imgBottom + 6` (not `cy + cardH - inset - 2`) | ✅ PASS |
| 2 | Small gap only (~6px between image bottom and label top) | ✅ PASS |
| 3 | All three cards (Delve, Shop, Camp) use new positioning inside `cards.forEach` | ✅ PASS |
| 4 | Shimmer tween (`tweens.addCounter`) references `label` and calls `label.setTint(c1, c2, c1, c2)` | ✅ PASS |
| 5 | VERSION bumped 1.10.28 → 1.10.29 (PATCH) in `src/version.js` | ✅ PASS |

## Details

- **FloorScene.js line 259–262:** `const imgBottom = img.y + (img.height * imgScale) / 2; const label = this.add.text(midX, imgBottom + 6, card.label, ...)` — label anchored directly to image bottom edge with 6px padding.
- **All cards covered:** Label positioning is inside the `cards.forEach` loop (lines 238–307), so Delve, Shop, and Camp all use the same `imgBottom + 6` formula.
- **Shimmer intact:** `tweens.addCounter` at lines 265–276 references `label` variable; `label.setTint(c1, c2, c1, c2)` called on each frame update.
- **Version bump:** Confirmed via `git show 324ea545` — `version.js` changed from `'1.10.28'` to `'1.10.29'`.

## Verdict

**PASS — all 5/5 criteria met.** The label gap fix is correctly implemented.
