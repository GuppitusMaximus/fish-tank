#!/usr/bin/env bash
# Run the full backend test corpus.
# Usage: bash tests/run-all.sh
# Exit code mirrors pytest: 0 = all passed, non-zero = failures or errors.

set -uo pipefail

TESTS_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== FishTank Backend Test Suite ==="
echo "Running pytest on: $TESTS_DIR"
echo ""

# Run pytest from the BackEnds/ root so imports resolve correctly.
# --tb=short                        — concise tracebacks
# --continue-on-collection-errors   — note import failures, don't abort the run
# --ignore-glob='tests/__pycache__' — skip cache dirs
cd "$TESTS_DIR/.."
python -m pytest tests/ -v --tb=short --continue-on-collection-errors --ignore-glob='tests/__pycache__' || EXIT_CODE=$?
EXIT_CODE=${EXIT_CODE:-0}

echo ""
if [ "$EXIT_CODE" -eq 0 ]; then
    echo "=== RESULT: ALL TESTS PASSED ==="
else
    echo "=== RESULT: FAILURES DETECTED (exit code $EXIT_CODE) ==="
fi

exit "$EXIT_CODE"
