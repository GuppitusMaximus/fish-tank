#!/usr/bin/env bash
# Run the full backend test corpus.
# Usage: bash tests/run-all.sh
# Exit code mirrors pytest: 0 = all passed, non-zero = failures or errors.

set -euo pipefail

TESTS_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== FishTank Backend Test Suite ==="
echo "Running pytest on: $TESTS_DIR"
echo ""

# Run pytest from the BackEnds/ root so imports resolve correctly.
# --tb=short   — concise tracebacks
# --ignore-glob='*/__pycache__/*' — skip cache dirs
# Tests with missing imports are reported as collection errors but do not
# crash the runner; pytest continues with the remaining tests.
cd "$TESTS_DIR/.."
python -m pytest tests/ -v --tb=short --ignore-glob='tests/__pycache__'
EXIT_CODE=$?

echo ""
if [ "$EXIT_CODE" -eq 0 ]; then
    echo "=== RESULT: ALL TESTS PASSED ==="
else
    echo "=== RESULT: FAILURES DETECTED (exit code $EXIT_CODE) ==="
fi

exit "$EXIT_CODE"
