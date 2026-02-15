# Frontend Tests

QA tests for the FishTank frontend. These are created by QA agents during plan verification and can be re-run to catch regressions.

## Test Files

### Executable Tests

| File | Type | What It Tests |
|------|------|---------------|
| `test_dash_qa_frontend.sh` | Shell script | HTML structure, JS quality, and JSON data format for the weather dashboard |
| `test_readme_update_frontend.sh` | Shell script | README accuracy — verifies documentation matches source code |
| `test_model_version_display.html` | HTML test page | ML model version rendering in forecast card and history table |
| `test_v2_multi_model_dashboard.js` | Node.js script | Multi-model dashboard v2 schema detection, data-driven rendering, filtering, sorting, lazy loading (78 assertions) |

### Test Reports

| File | What It Documents |
|------|-------------------|
| `qa-workflow-trigger-label.md` | Verifies \`workflow_dispatch\` displays as "Scheduled" (not "Manual") |
| `qa-multi-model-dashboard-ui-report.md` | Comprehensive QA report for v2 multi-model dashboard — all 15 tests passed |
| `qa-docs-frontend.md` | Documentation QA report |
| `qa-report-dashboard-filter-search.md` | Filter search inputs QA report — all 8 tests passed (replaces dropdowns with autocomplete text inputs) |
| `qa-report-fix-filter-disappear.md` | Fix filters disappearing on empty results — all 5 tests passed (filters persist when no predictions match) |

### Test Data

| File | What It Contains |
|------|------------------|
| `test_v1_v2_data_samples.json` | Sample v1 and v2 schema data for testing fallback and multi-model rendering |

## How to Run

**Shell scripts** — run from anywhere; they resolve paths relative to their own location:

```bash
bash tests/test_dash_qa_frontend.sh
bash tests/test_readme_update_frontend.sh
```

Both scripts print PASS/FAIL for each check and exit with code 0 (all pass) or 1 (any failure).

**Node.js scripts** — run with \`node\`:

```bash
node tests/test_v2_multi_model_dashboard.js
```

Prints test results to console and exits with code 0 (all pass) or 1 (any failure).

**HTML test page** — open in a browser. The page loads \`weather.js\` and runs assertions in-browser:

```
open tests/test_model_version_display.html
```

Results display on the page. The document title changes to "ALL TESTS PASS" or "FAIL: N test(s)".

**Test reports** — \`.md\` files are not executable. They document the results of manual code inspections and QA runs.

## Coverage

### What's Tested

| Area | Covered By |
|------|------------|
| HTML structure (doctype, tag balance, nav links) | \`test_dash_qa_frontend.sh\` |
| weather.js DOM references and error handling | \`test_dash_qa_frontend.sh\` |
| weather.json validity and schema | \`test_dash_qa_frontend.sh\` |
| ML model version in forecast card | \`test_model_version_display.html\` |
| ML model version in history table | \`test_model_version_display.html\` |
| Backwards compatibility (missing model_version) | \`test_model_version_display.html\` |
| CSS \`.card-meta\` class existence | \`test_model_version_display.html\` |
| README accuracy vs source code | \`test_readme_update_frontend.sh\` |
| Workflow trigger label mapping | \`qa-workflow-trigger-label.md\` |
| **V2 Multi-Model Dashboard (all features)** | \`test_v2_multi_model_dashboard.js\` + \`qa-multi-model-dashboard-ui-report.md\` |
| **Dashboard Filter Search (text inputs with autocomplete)** | \`qa-report-dashboard-filter-search.md\` |
| **Fix: Filters disappearing on empty results** | \`qa-report-fix-filter-disappear.md\` |

### Multi-Model Dashboard UI (v2 Schema)

**QA Run:** \`qa-multi-model-dashboard-ui\` (2026-02-15)
**Result:** ✅ All 15 tests passed (60 automated assertions)
**Test File:** \`test_v2_multi_model_dashboard.js\`
**Report:** \`qa-multi-model-dashboard-ui-report.md\`

The following v2 features were verified:

| Feature | Status | Test Coverage |
|---------|--------|---------------|
| V1 fallback rendering | ✅ PASS | Schema detection, graceful fallback to v1 (5/5 assertions) |
| V2 schema validation | ✅ PASS | Checks schema_version, current.readings, predictions array (5/5 assertions) |
| Shared property utilities | ✅ PASS | getPropertyLabel(), formatProperty(), discoverHistoryProperties() (8/8 assertions) |
| Dynamic current reading | ✅ PASS | Iterates current.readings dynamically, uses property utilities (7/7 assertions) |
| Per-model prediction cards | ✅ PASS | Maps predictions array, renders card per model with badges (6/6 assertions) |
| Empty predictions placeholder | ✅ PASS | Shows "No predictions available" when predictions array is empty (3/3 assertions) |
| Dynamic history table columns | ✅ PASS | Discovers properties from history (actual_*, predicted_*, delta_*) (6/6 assertions) |
| Model type filtering | ✅ PASS | Dropdown with "All Models" + dynamic model types (4/4 assertions) |
| Date range filtering | ✅ PASS | Date inputs exist and filter logic works (4/4 assertions) |
| Column sorting | ✅ PASS | Clickable headers, toggle asc/desc, default timestamp desc (5/5 assertions) |
| Lazy loading (50 rows) | ✅ PASS | Initial 50 rows, "Show more" button, appends next 50 (4/4 assertions) |
| localStorage caching (5 min TTL) | ✅ PASS | Cache key, TTL validation, graceful failure (6/6 assertions) |
| Mobile responsive (393px) | ✅ PASS | Prediction cards stack, filters stack, Version column hidden (6/6 assertions) |
| Browse tab compatibility | ✅ PASS | Handles v2 values object and v1 flat properties (4/4 assertions) |
| No hardcoded field names in v2 | ⚠️  PASS* | V2 uses Object.keys, but hardcodes "temp_" prefix — see bug (3/3 assertions) |

**Known Bugs (both filed in Planning/bugs/):**
- \`multi-model-dashboard-ui-date-filter-no-default.md\` — Severity: minor — Date range filter starts empty (should default to last 7 days)
- \`multi-model-dashboard-ui-hardcoded-temp-prefix.md\` — Severity: major — V2 history table prepends "temp_" to property suffixes, preventing future non-temperature properties

### What's Not Yet Tested

- Fish Tank simulation (\`tank.js\`) — no tests exist
- Tank Battle simulation (\`battle.js\`) — no tests exist
- Fighter Fish simulation (\`fighter.js\`) — no tests exist
- Hash-based routing and view switching
- Theme system (theme-ocean, theme-battle, theme-sky)
- Click-to-spawn interactions
- CSS animations (bubbles, smoke, debris)
- Temperature unit toggle (C/F/K) end-to-end behavior
- Time format toggle (12h/24h) end-to-end behavior

## QA Plans That Produced These Tests

| Plan | Status | Tests Created | Bugs Filed |
|------|--------|---------------|------------|
| \`qa-model-versioning-frontend\` | Completed | \`test_model_version_display.html\` | — |
| \`qa-readme-update-frontend\` | Completed | \`test_readme_update_frontend.sh\` | — |
| \`qa-workflow-trigger-label\` | Completed | \`qa-workflow-trigger-label.md\` | — |
| \`qa-multi-model-dashboard-ui\` | Completed | \`test_v2_multi_model_dashboard.js\`, \`qa-multi-model-dashboard-ui-report.md\`, \`test_v1_v2_data_samples.json\` | 2 bugs (previously filed, still open) |
| \`qa-dashboard-filter-search\` | Completed | \`qa-report-dashboard-filter-search.md\` | — |
| \`qa-fix-filter-disappear\` | Completed | \`qa-report-fix-filter-disappear.md\` | — |

The \`test_dash_qa_frontend.sh\` script was created during earlier weather dashboard QA.
