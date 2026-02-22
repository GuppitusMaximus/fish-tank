# QA Report: fix-card-camp-background

Plan: fix-card-camp-background
QA Plan: qa-fix-card-camp-background
Result: **FAIL**
Date: 2026-02-22 (re-verified 2026-02-22)

## Verification Results

| Check | Status | Detail |
|-------|--------|--------|
| Alpha channel exists | ✓ PASS | `hasAlpha: yes`, `samplesPerPixel: 4` |
| Corner pixels transparent | ✓ PASS | All 4 corners (0,0), (1023,0), (0,1023), (1023,1023) have alpha=0 |
| Center content preserved | ✓ PASS | (512,512): alpha=255, fully opaque |
| No jagged holes / no leaks | ✗ **FAIL** | 52.4% of image transparent; scene pixels incorrectly erased |
| File valid | ✓ PASS | PNG, 1024×1024, passes `sips -g all` |
| Version bumped | ✓ PASS | 1.10.7 → 1.10.8 (PATCH) in version.js |

## Failure Detail

The flood fill leaked massively into scene content:
- **549,337 of 1,048,576 pixels (52.4%) are transparent** — expected <10% for corner-only removal
- All transparent pixels are connected to corners (no isolated holes), but the transparent region spans far into the interior of the image
- Scene pixels with original color far from the background (distance > 50) were made transparent. Example: `(200, 700)` had original RGB `(152, 64, 64)` (reddish, likely campfire content) and is now alpha=0
- Interior leak confirmed: 306 transparent pixels found in broadened grid scan (100-923 pixel range, every 25px)

## Second QA Run — Same Result (2026-02-22, Re-Verified)

Re-verified 2026-02-22 with deeper spatial analysis. `card_camp.png` last modified in commit `de1d515`. No fix applied since previous FAIL result.

Detailed analysis confirms **65,843 transparent pixels with RGB color distance > 40 from background (88,74,69)** — these are scene content incorrectly erased. Examples of worst leaks:

- `(308,789)`: RGB=(221,76,69) dist=133 — bright campfire red
- `(188,657)`: RGB=(220,73,69) dist=132 — campfire red
- `(289,727)`: RGB=(218,76,69) dist=130 — campfire red

Center column (x=500) analysis reveals scene pixels in rows 114–134 (dark sky blues ~(45,49,58)) and rows 795–889 (ground tones ~(161,102,91)) are transparent — these are not background color and should be opaque.

Of 549,337 total transparent pixels:
- 483,494 (88%) are near background color (dist ≤ 40) — legitimate
- 65,843 (12%) are scene content — **leaked**

## Bug Filed

`Planning/bugs/qa-fix-card-camp-background-flood-fill-leak.md` (Status: open)

**Suggested fix:** Use a rounded-rectangle mask approach instead of flood fill, or re-run the flood fill with a stricter tolerance (≤ 30) and seed-color comparison (not neighbor-color drift).
