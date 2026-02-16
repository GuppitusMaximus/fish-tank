# The Fish Tank — Frontend Tests

This directory contains automated tests for verifying frontend implementations.

## Test Suite Overview

All tests are written in Node.js and can be run directly without dependencies. Tests verify correct HTML structure, JavaScript logic, CSS styling, and integration between components.

## Running Tests

Run individual tests:
```bash
cd the-fish-tank
node tests/<test-file>.js
```

Run all tests:
```bash
cd the-fish-tank
for test in tests/*.js; do node "$test" || exit 1; done
```

## Test Coverage

### `verify-home-weather-nav-persistence.js`

**Plan:** `qa-frontend-home-weather`
**Feature:** Home weather summary + view persistence

Verifies:
- Nav reordering (Home → Weather → Fish Games dropdown)
- Home page contains `#home-weather` container
- `renderHomeSummary()` reuses `renderCurrentV2()` and `renderPredictionsV2()`
- History table is NOT rendered on home page
- CTA link exists with correct href (`#weather`)
- URL hash persistence:
  - `switchView()` updates `location.hash` via `history.replaceState()`
  - Initial load reads hash to set starting view
  - `hashchange` event listener responds to browser back/forward
  - `#weather/workflow` pattern switches to weather view + workflow sub-tab
- Weather sub-tab persistence:
  - Sub-tab clicks update URL hash (`#weather/dashboard`, `#weather/browse`, `#weather/workflow`)
  - `start()` reads hash to restore last active sub-tab
  - `stop()` does NOT reset `activeSubtab` (preserves state)
- CSS styles for home weather summary and CTA link
- Valid HTML and JavaScript syntax

**Exit code:** 0 if all pass, 1 if any fail

## Test Output

Tests use a simple pass/fail format:
- `✓` indicates passed test
- `✗` indicates failed test with error message

Example output:
```
=== Step 1: Verify nav order ===
✓ Nav order is Home → Weather → Fish Games

=== Step 2: Verify home page has weather container ===
✓ Home page contains weather summary container

...

==================================================
Results: 22 passed, 0 failed
==================================================
```

## Writing New Tests

When adding new tests:

1. Create a new `.js` file in `tests/`
2. Use Node.js built-in modules (`fs`, `path`, etc.)
3. Include a header comment describing what the test verifies
4. Follow the existing test pattern:
   - Use `test(name, fn)` for each assertion group
   - Use `assert()`, `assertMatch()`, `assertContains()` helpers
   - Print summary with pass/fail counts
   - Exit with code 1 if any test fails
5. Update this README with the new test's coverage

## CI Integration

Tests can be run in CI/CD by executing all `.js` files in this directory:

```bash
#!/bin/bash
cd the-fish-tank/tests
for test in *.js; do
  echo "Running $test..."
  node "$test" || exit 1
done
```

## File References

Tests read source files relative to `the-fish-tank/`:
- `index.html` — Main HTML structure
- `js/weather.js` — Weather app module
- `css/style.css` — Stylesheet
- Other modules as needed

Tests should never modify production code.
