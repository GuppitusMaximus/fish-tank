# Frontend Tests

QA tests for the FishTank frontend. These are created by QA agents during plan verification and can be re-run to catch regressions.

## Test Files

### Executable Tests

| File | Type | What It Tests |
|------|------|---------------|
| `test_dash_qa_frontend.sh` | Shell script | HTML structure, JS quality, and JSON data format for the weather dashboard |
| `test_readme_update_frontend.sh` | Shell script | README accuracy — verifies documentation matches source code |
| `test_model_version_display.html` | HTML test page | ML model version rendering in forecast card and history table |

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

### What's Not Yet Tested

- Fish Tank simulation (`tank.js`) — no tests exist
- Tank Battle simulation (`battle.js`) — no tests exist
- Fighter Fish simulation (`fighter.js`) — no tests exist
- Hash-based routing and view switching
- Theme system (theme-ocean, theme-battle, theme-sky)
- Click-to-spawn interactions
- CSS animations (bubbles, smoke, debris)
- Mobile/responsive layout
- Temperature unit toggle (C/F/K) end-to-end behavior
- Time format toggle (12h/24h) end-to-end behavior

## QA Plans That Produced These Tests

| Plan | Status | Tests Created |
|------|--------|---------------|
| `qa-model-versioning-frontend` | Completed | `test_model_version_display.html` |
| `qa-readme-update-frontend` | Completed | `test_readme_update_frontend.sh` |
| `qa-workflow-trigger-label` | Completed | `qa-workflow-trigger-label.md` |

The `test_dash_qa_frontend.sh` script was created during earlier weather dashboard QA.
