# Frontend Tests

QA tests for the FishTank frontend. These are created by QA agents during plan verification and can be re-run to catch regressions.

## Test Files

### Executable Tests

| File | Type | What It Tests |
|------|------|---------------|
| `test_dash_qa_frontend.sh` | Shell script | HTML structure, JS quality, and JSON data format for the weather dashboard |
| `test_readme_update_frontend.sh` | Shell script | README accuracy — verifies documentation matches source code |
| `test_model_version_display.html` | HTML test page | ML model version rendering in forecast card and history table |
| `test_v2_multi_model_dashboard.js` | Node.js script | V2 schema detection, data-driven rendering, filtering, sorting, lazy loading, mobile responsive, Browse tab compatibility |

### Test Reports

| File | What It Documents |
|------|-------------------|
| `qa-workflow-trigger-label.md` | Verifies `workflow_dispatch` displays as "Scheduled" (not "Manual") |

## How to Run

**Shell scripts** — run from anywhere; they resolve paths relative to their own location:

```bash
bash tests/test_dash_qa_frontend.sh
bash tests/test_readme_update_frontend.sh
```

Both scripts print PASS/FAIL for each check and exit with code 0 (all pass) or 1 (any failure).

**Node.js scripts** — run from the FrontEnds directory:

```bash
node tests/test_v2_multi_model_dashboard.js
```

The script reads the implementation files and validates the code structure, printing ✓/✗ for each check.

**HTML test page** — open in a browser. The page loads `weather.js` and runs assertions in-browser:

```
open tests/test_model_version_display.html
```

Results display on the page. The document title changes to "ALL TESTS PASS" or "FAIL: N test(s)".

**Test reports** — `.md` files are not executable. They document the results of manual code inspections.

## Coverage

### What's Tested

| Area | Covered By |
|------|------------|
| HTML structure (doctype, tag balance, nav links) | `test_dash_qa_frontend.sh` |
| weather.js DOM references and error handling | `test_dash_qa_frontend.sh` |
| weather.json validity and schema | `test_dash_qa_frontend.sh` |
| ML model version in forecast card | `test_model_version_display.html` |
| ML model version in history table | `test_model_version_display.html` |
| Backwards compatibility (missing model_version) | `test_model_version_display.html` |
| CSS `.card-meta` class existence | `test_model_version_display.html` |
| README accuracy vs source code | `test_readme_update_frontend.sh` |
| Workflow trigger label mapping | `qa-workflow-trigger-label.md` |
| V2 schema detection and validation | `test_v2_multi_model_dashboard.js` |
| V1 fallback rendering | `test_v2_multi_model_dashboard.js` |
| Shared property utilities (getPropertyLabel, formatProperty, discoverHistoryProperties) | `test_v2_multi_model_dashboard.js` |
| Dynamic current reading rendering | `test_v2_multi_model_dashboard.js` |
| Per-model prediction cards | `test_v2_multi_model_dashboard.js` |
| Empty predictions placeholder | `test_v2_multi_model_dashboard.js` |
| Dynamic history table columns | `test_v2_multi_model_dashboard.js` |
| History filtering (model type, version, date range) | `test_v2_multi_model_dashboard.js` |
| History column sorting (asc/desc, default timestamp desc) | `test_v2_multi_model_dashboard.js` |
| Lazy loading (50 rows, "Show more" button) | `test_v2_multi_model_dashboard.js` |
| localStorage caching (5-min TTL) | `test_v2_multi_model_dashboard.js` |
| Mobile responsive CSS (393px) | `test_v2_multi_model_dashboard.js` |
| Browse tab v2 compatibility | `test_v2_multi_model_dashboard.js` |
| No hardcoded field names in v2 path | `test_v2_multi_model_dashboard.js` |

### Multi-Model Dashboard UI (v2 Schema)

The following features were verified during the `qa-multi-model-dashboard-ui` QA run. All were code-inspected and validated against the implementation:

| Feature | Verified | Notes |
|---------|----------|-------|
| V1 fallback rendering | ✅ | weather.js:607-630 — Schema detection with graceful fallback |
| V2 schema validation | ✅ | Checks schema_version, current.readings, predictions array |
| Shared property utilities | ✅ | getPropertyLabel(), formatProperty(), discoverHistoryProperties() |
| Dynamic current reading | ✅ | Iterates current.readings dynamically (not hardcoded) |
| Per-model prediction cards | ✅ | Maps predictions array, renders card per model |
| Empty predictions placeholder | ✅ | Shows "No predictions available" when predictions array is empty |
| Dynamic history table columns | ✅ | Discovers properties from history entries (actual_*, predicted_*, delta_*) |
| Model type filtering | ✅ | Dropdown with "All Models" + dynamic model types |
| Date range filtering | ⚠️  | Inputs exist and work, but no default "last 7 days" — see bug report |
| Column sorting | ✅ | Clickable headers, toggle asc/desc, default timestamp desc |
| Lazy loading (50 rows) | ✅ | Initial 50 rows, "Show more" button, appends next 50 |
| localStorage caching (5 min TTL) | ✅ | Cache key, TTL validation, graceful failure |
| Mobile responsive (393px) | ✅ | Prediction cards stack, filters stack, Version column hidden |
| Browse tab compatibility | ✅ | Handles v2 values object and v1 flat properties |
| Hardcoded field names | ⚠️  | V1 functions clean, but V2 history hardcodes "temp_" prefix — see bug report |

**Bugs filed:**
- `multi-model-dashboard-ui-date-filter-no-default.md` — Date range filter has no default (last 7 days)
- `multi-model-dashboard-ui-hardcoded-temp-prefix.md` — V2 history table hardcodes "temp_" prefix for properties

### What's Not Yet Tested

- Fish Tank simulation (`tank.js`) — no tests exist
- Tank Battle simulation (`battle.js`) — no tests exist
- Fighter Fish simulation (`fighter.js`) — no tests exist
- Hash-based routing and view switching
- Theme system (theme-ocean, theme-battle, theme-sky)
- Click-to-spawn interactions
- CSS animations (bubbles, smoke, debris)
- Temperature unit toggle (C/F/K) end-to-end behavior
- Time format toggle (12h/24h) end-to-end behavior

## QA Plans That Produced These Tests

| Plan | Status | Tests Created | Bugs Filed |
|------|--------|---------------|------------|
| `qa-model-versioning-frontend` | Completed | `test_model_version_display.html` | — |
| `qa-readme-update-frontend` | Completed | `test_readme_update_frontend.sh` | — |
| `qa-workflow-trigger-label` | Completed | `qa-workflow-trigger-label.md` | — |
| `qa-multi-model-dashboard-ui` | Completed | `test_v2_multi_model_dashboard.js`, `test_v1_v2_data_samples.json` | 2 bugs in Planning/bugs/ |

The `test_dash_qa_frontend.sh` script was created during earlier weather dashboard QA.
