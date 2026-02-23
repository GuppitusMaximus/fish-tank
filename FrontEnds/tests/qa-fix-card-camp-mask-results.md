# QA Results: fix-card-camp-mask

**Plan:** `qa-fix-card-camp-mask`
**Date:** 2026-02-22
**Result:** PASS — all 6 criteria met

## Verification Summary

| # | Criterion | Result |
|---|-----------|--------|
| 1 | Alpha channel exists (RGBA, samplesPerPixel=4) | ✅ PASS |
| 2 | Corner pixels transparent (alpha=0 at all 4 corners) | ✅ PASS |
| 3 | Center content opaque (512,512) has alpha=255 | ✅ PASS |
| 4 | No interior leaks (12 interior scene pixels, all alpha=255) | ✅ PASS |
| 5 | Transparency ratio 5–15% (actual: 8.30%) | ✅ PASS |
| 6 | Version bumped PATCH (1.10.17 → 1.10.18) | ✅ PASS |

## Detailed Results

### Alpha Channel
- Mode: RGBA
- samplesPerPixel: 4
- Size: 1024×1024

### Corner Pixels
All 4 corners confirmed transparent (alpha=0):
- `(0,0)`: alpha=0
- `(1023,0)`: alpha=0
- `(0,1023)`: alpha=0
- `(1023,1023)`: alpha=0

### Center Pixel
- `(512,512)`: alpha=255 (fully opaque)

### Interior Scene Pixels (12 samples, all alpha=255)
- Campfire area: `(500,600)`, `(500,610)`, `(510,590)` — all alpha=255
- Tent area: `(400,350)`, `(350,400)`, `(380,380)` — all alpha=255
- Ground area: `(500,800)`, `(800,500)`, `(700,600)` — all alpha=255
- Mid area: `(600,400)`, `(400,512)`, `(600,600)` — all alpha=255

### Transparency Ratio
- Transparent pixels: 87,063 / 1,048,576 (8.30%)
- Acceptable range: 5–15% ✅
- Previous flood-fill result was ~52% — this confirms the fix is correct

### Version Bump
- Before fix commit (`160b00d2`): VERSION='1.10.17'
- After fix commit (`67aa096d`): VERSION='1.10.18'
- PATCH increment ✅

## Fix Verification

The fix applied a rounded-rectangle alpha mask (inset=20, radius=100) rather than flood fill. The rounded-rect approach correctly removes only the corner background areas without leaking into scene content. Zero interior holes found across all 12 sampled pixels.
