# Static QA Report: fix-info-panel-border

**Plan:** qa-fix-info-panel-border
**Status:** PASS
**Date:** 2026-02-22
**Found-by:** qa-frontend

## Verification Criteria

| # | Criterion | Result |
|---|-----------|--------|
| 1 | `createNineSlicePanel` checks `opts.cornerSize` before formula | ✅ PASS |
| 2 | Info panel x is `panelMargin` (8), width is `W - panelMargin * 2` | ✅ PASS |
| 3 | Info panel passes `{ cornerSize: 5 }` to `themedPanel` | ✅ PASS |
| 4 | VERSION bumped (PATCH increment) | ✅ PASS |

## Details

**Criterion 1** — `ThemedPanel.js:19`:
```js
const cornerSize = opts.cornerSize || Math.min(16, Math.floor(Math.min(w, h) / 12));
```
`opts.cornerSize` is checked first; formula is the fallback. ✅

**Criterion 2 & 3** — `FloorScene.js:72–73`:
```js
const panelMargin = 8;
themedPanel(this, panelMargin, 0, W - panelMargin * 2, panelH, zone, { cornerSize: 5 });
```
Panel x = 8 (panelMargin), width = W - 16 (margins on both sides), cornerSize = 5 passed. ✅

**Criterion 4** — Version bumped from `1.10.16` → `1.10.17` in commit `160b00d2` ("Thinner info panel border — narrower with cornerSize override"). ✅

## Conclusion

All 4/4 criteria met. No bugs found. ThemedPanel correctly supports the `opts.cornerSize` override and the info panel in FloorScene uses narrower margins with a thin 5px corner size to match the card style.
