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
| `verify-full-model-fixes.sh` | Shell script | Verifies full model fixes: no hardcoded prefixes, resolvePropertyKey exists, date filter defaults to 7 days |
| `verify-expired-predictions-filter.sh` | Shell script | Verifies expired predictions are hidden from dashboard: renderPredictionsV2 time filter, history table unaffected |
| `verify-multi-select-filters.js` | Node.js script | Verifies multi-select dropdown filters for model type and version: array-based state, createMultiSelect function, filter UI components, array filtering logic, version options update on model change, CSS styles (28 assertions) |
| `verify-readme-docs.sh` | Shell script | Verifies README documentation accuracy: multi-select filters, expired predictions, auto-deploy workflow trigger, project structure, model types (12 checks) |
| `test_multiselect_include_mode.html` | HTML test page | Verifies createMultiSelect include mode behavior: initial state (none checked), single/multiple selection, clear behavior, all-checked state (does NOT show "All"), pre-selected values (7 test suites, 23 assertions) |
| `run_multiselect_tests.sh` | Shell script | Opens `test_multiselect_include_mode.html` in default browser for visual verification |

### Test Reports

| File | What It Documents |
|------|-------------------|
| `qa-workflow-trigger-label.md` | Verifies \`workflow_dispatch\` displays as "Scheduled" (not "Manual") |
| `qa-multi-model-dashboard-ui-report.md` | Initial QA report for v2 multi-model dashboard (found 2 bugs, now fixed) |
| `qa-multi-model-dashboard-ui-final.md` | **Final QA report for v2 multi-model dashboard — all 15 tests passed, 78 assertions, 0 bugs** |
| `qa-docs-frontend.md` | Documentation QA report |
| `qa-report-dashboard-filter-search.md` | Filter search inputs QA report — all 8 tests passed (replaces dropdowns with autocomplete text inputs) |
| `qa-report-fix-filter-disappear.md` | Fix filters disappearing on empty results — all 5 tests passed (filters persist when no predictions match) |
| `qa-full-model-frontend.md` | QA report for full model frontend fixes — all 10 tests passed (property lookup fixes, date filter defaults) |
| `qa-invert-history-filter-checkboxes.md` | QA report for inverted history filter checkboxes — all 7 test suites passed (include mode: none checked by default, all-checked shows values not "All") |

### Test Data

| File | What It Contains |
|------|------------------|
| `test_v1_v2_data_samples.json` | Sample v1 and v2 schema data for testing fallback and multi-model rendering |

## How to Run

**Shell scripts** — run from anywhere; they resolve paths relative to their own location:

```bash
bash tests/test_dash_qa_frontend.sh
bash tests/test_readme_update_frontend.sh
bash tests/verify-readme-docs.sh
bash tests/verify-full-model-fixes.sh
bash tests/verify-expired-predictions-filter.sh
```

All scripts print PASS/FAIL for each check and exit with code 0 (all pass) or 1 (any failure).

**Node.js scripts** — run with \`node\`:

```bash
node tests/test_v2_multi_model_dashboard.js
node tests/verify-multi-select-filters.js
```

Prints test results to console and exits with code 0 (all pass) or 1 (any failure).

**HTML test page** — open in a browser. The page loads \`weather.js\` and runs assertions in-browser:

```
open tests/test_model_version_display.html
open tests/test_multiselect_include_mode.html
# Or use the runner script:
bash tests/run_multiselect_tests.sh
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
| **Full model property lookup and date filter fixes** | \`verify-full-model-fixes.sh\` + \`qa-full-model-frontend.md\` |
| **Expired predictions hidden from dashboard** | \`verify-expired-predictions-filter.sh\` |
| **Multi-select dropdown filters (model type and version)** | \`verify-multi-select-filters.js\` |
| **README documentation accuracy** | \`verify-readme-docs.sh\` |
| **Multi-select include mode (inverted checkboxes)** | \`test_multiselect_include_mode.html\` + \`qa-invert-history-filter-checkboxes.md\` |

### Multi-Model Dashboard UI (v2 Schema)

**QA Run:** \`qa-multi-model-dashboard-ui\` (2026-02-15, final verification)
**Result:** ✅ All 15 tests passed (78 automated assertions)
**Test File:** \`test_v2_multi_model_dashboard.js\`
**Report:** \`qa-multi-model-dashboard-ui-final.md\`

The following v2 features were verified:

| Feature | Status | Test Coverage |
|---------|--------|---------------|
| V1 fallback rendering | ✅ PASS | Schema detection, graceful fallback to v1 (5/5 assertions) |
| V2 schema validation | ✅ PASS | Checks schema_version, current.readings, predictions array (5/5 assertions) |
| Shared property utilities | ✅ PASS | getPropertyLabel(), formatProperty(), discoverHistoryProperties() (7/7 assertions) |
| Dynamic current reading | ✅ PASS | Iterates current.readings dynamically, uses property utilities (7/7 assertions) |
| Per-model prediction cards | ✅ PASS | Maps predictions array, renders card per model with badges (6/6 assertions) |
| Empty predictions placeholder | ✅ PASS | Shows "No predictions available" when predictions array is empty (3/3 assertions) |
| Dynamic history table columns | ✅ PASS | Discovers properties from history (actual_*, predicted_*, delta_*) (6/6 assertions) |
| Model type filtering | ✅ PASS | Text input with datalist autocomplete, dynamic model types (4/4 assertions) |
| Date range filtering | ✅ PASS | Date inputs exist and filter logic works (4/4 assertions) |
| Column sorting | ✅ PASS | Clickable headers, toggle asc/desc, default timestamp desc (5/5 assertions) |
| Lazy loading (50 rows) | ✅ PASS | Initial 50 rows, "Show more" button, appends next 50 (4/4 assertions) |
| localStorage caching (5 min TTL) | ✅ PASS | Cache key, TTL validation, graceful failure (6/6 assertions) |
| Mobile responsive (393px) | ✅ PASS | Prediction cards stack, filters stack, Version column hidden (6/6 assertions) |
| Browse tab compatibility | ✅ PASS | Handles v2 values object and v1 flat properties (4/4 assertions) |
| No hardcoded field names in v2 | ✅ PASS | V2 uses Object.keys for all property iteration (3/3 assertions) |

**Bugs Found:** None (all previously identified bugs have been fixed)

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
| \`qa-multi-model-dashboard-ui\` (initial) | Completed | \`test_v2_multi_model_dashboard.js\`, \`qa-multi-model-dashboard-ui-report.md\`, \`test_v1_v2_data_samples.json\` | 2 bugs (now fixed) |
| \`qa-multi-model-dashboard-ui\` (final) | Completed | Updated \`test_v2_multi_model_dashboard.js\`, \`qa-multi-model-dashboard-ui-final.md\` | None (all tests pass) |
| \`qa-dashboard-filter-search\` | Completed | \`qa-report-dashboard-filter-search.md\` | — |
| \`qa-fix-filter-disappear\` | Completed | \`qa-report-fix-filter-disappear.md\` | — |
| \`qa-full-model-frontend\` | Completed | \`verify-full-model-fixes.sh\`, \`qa-full-model-frontend.md\` | None (all 10 tests pass) |
| \`qa-fix-stale-predictions-frontend\` | Completed | \`verify-expired-predictions-filter.sh\` | None (all tests pass) |
| \`qa-multi-select-history-filters\` | Completed | \`verify-multi-select-filters.js\` | None (all 28 tests pass) |
| \`qa-docs-frontend\` | Completed | \`verify-readme-docs.sh\` | None (all 12 tests pass) |
| \`qa-invert-history-filter-checkboxes\` | Completed | \`test_multiselect_include_mode.html\`, \`run_multiselect_tests.sh\`, \`qa-invert-history-filter-checkboxes.md\` | None (all 7 test suites pass, 23 assertions) |

The \`test_dash_qa_frontend.sh\` script was created during earlier weather dashboard QA.
