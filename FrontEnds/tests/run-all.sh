#!/usr/bin/env bash
# Regression test runner — runs all frontend tests and prints a summary.
# Usage: ./tests/run-all.sh
# Exit code: 0 if all tests pass, 1 if any fail.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

total=0
passed=0
failed=0
skipped=0
failed_names=()

# --- Browser tests (Playwright) ---
browser_specs=("$SCRIPT_DIR"/browser/*.spec.js)
if [ -e "${browser_specs[0]}" ]; then
    if command -v npx >/dev/null 2>&1 && npx playwright --version >/dev/null 2>&1; then
        echo "=== Playwright browser tests ==="
        total=$((total + 1))
        if (cd "$FRONTEND_DIR" && npx playwright test --reporter=line 2>&1); then
            passed=$((passed + 1))
            echo "--- Playwright: PASSED ---"
        else
            failed=$((failed + 1))
            failed_names+=("playwright (browser tests)")
            echo "--- Playwright: FAILED ---"
        fi
        echo ""
    else
        echo "=== Playwright: SKIPPED (not installed) ==="
        skipped=$((skipped + 1))
        total=$((total + 1))
        echo ""
    fi
else
    echo "=== Playwright: SKIPPED (no spec files found) ==="
    skipped=$((skipped + 1))
    total=$((total + 1))
    echo ""
fi

# --- Shell tests ---
echo "=== Shell tests ==="
shell_tests=("$SCRIPT_DIR"/*.sh)
for test_file in "${shell_tests[@]}"; do
    # Skip this runner script itself
    [ "$(basename "$test_file")" = "run-all.sh" ] && continue

    name="$(basename "$test_file")"
    total=$((total + 1))

    if [ ! -x "$test_file" ]; then
        chmod +x "$test_file"
    fi

    echo "--- $name ---"
    if (cd "$FRONTEND_DIR" && bash "$test_file" 2>&1); then
        passed=$((passed + 1))
    else
        failed=$((failed + 1))
        failed_names+=("$name")
    fi
    echo ""
done

# --- Summary ---
echo "========================================"
echo "  REGRESSION TEST SUMMARY"
echo "========================================"
printf "  %-10s %d\n" "Total:" "$total"
printf "  %-10s %d\n" "Passed:" "$passed"
printf "  %-10s %d\n" "Failed:" "$failed"
printf "  %-10s %d\n" "Skipped:" "$skipped"
echo "========================================"

if [ ${#failed_names[@]} -gt 0 ]; then
    echo ""
    echo "  Failed tests:"
    for name in "${failed_names[@]}"; do
        echo "    - $name"
    done
fi

echo ""
if [ "$failed" -eq 0 ]; then
    echo "  ALL TESTS PASSED"
    exit 0
else
    echo "  SOME TESTS FAILED"
    exit 1
fi
