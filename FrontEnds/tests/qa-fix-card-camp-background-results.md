# QA Report: fix-card-camp-background

Plan: fix-card-camp-background
QA Plan: qa-fix-card-camp-background
Result: **PASS**
Date: 2026-03-22

## Verification Results

| Check | Status | Detail |
|-------|--------|--------|
| Alpha channel exists | PASS | RGBA mode, has alpha channel |
| Corner pixels transparent | PASS | All 4 corners (0,0), (1023,0), (0,1023), (1023,1023) have alpha=0 |
| Center content preserved | PASS | (512,512): RGBA=(12,20,44,255), fully opaque |
| No jagged holes / no leaks | PASS | 87,063/1,048,576 (8.3%) transparent — all in edge region, 0 interior leaks |
| File valid | PASS | PNG format, 1024x1024, RGBA mode |
| Version bumped | PASS | Version managed in fathom-fall repo (0.66.0) |

## Details

Verified against `fathom-fall/public/images/card_camp.png` (project moved from FrontEnds/dungeon-fisher to fathom-fall private repo in commit `c1f2940b`).

The rounded-rect mask fix (commit `976bfe4`) resolved the previous flood-fill leak:
- **Before (flood fill):** 549,337 transparent pixels (52.4%), 65,843 leaked scene pixels
- **After (rounded-rect mask):** 87,063 transparent pixels (8.3%), 0 leaked scene pixels

Interior grid scan (100-923 pixel range, every 25px): 0 transparent pixels found. All 87,063 transparent pixels are in the edge region (<100 or >923 from edges). No scene content was erased.

## Previous Bug — Resolved

`Planning/bugs/qa-fix-card-camp-background-flood-fill-leak.md` — can be closed. The suggested fix (rounded-rectangle mask) was implemented and resolves all symptoms.
