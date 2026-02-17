#!/bin/bash
# Test: netatmo.yml workflow has proper R2 secrets and git add pattern
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKFLOW="$SCRIPT_DIR/../../.github/workflows/netatmo.yml"

if [ ! -f "$WORKFLOW" ]; then
    echo "FAIL: netatmo.yml not found at $WORKFLOW"
    exit 1
fi

FAILURES=0

# Test 1: R2 secrets referenced
for secret in R2_ENDPOINT_URL R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET_NAME; do
    if grep -q "$secret" "$WORKFLOW"; then
        echo "PASS: $secret referenced in workflow"
    else
        echo "FAIL: $secret not found in workflow"
        FAILURES=$((FAILURES + 1))
    fi
done

# Test 2: boto3 in pip install step
if grep -q "boto3" "$WORKFLOW"; then
    echo "PASS: boto3 found in workflow (pip install step)"
else
    echo "FAIL: boto3 not found in workflow pip install step"
    FAILURES=$((FAILURES + 1))
fi

# Test 3: git add covers FrontEnds data directory (which includes weather-public.json)
# Note: The full git add lockdown (excluding weather.json and frontend.db.gz) is deferred
# to the lockdown plan. For now, the directory add covers weather-public.json.
if grep -q "FrontEnds/the-fish-tank/data/" "$WORKFLOW"; then
    echo "PASS: FrontEnds/the-fish-tank/data/ in git add (covers weather-public.json)"
else
    echo "FAIL: FrontEnds/the-fish-tank/data/ not in git add"
    FAILURES=$((FAILURES + 1))
fi

# Test 4: No leaked secrets (R2 credentials use secrets.* syntax only)
# Check that R2 credential values don't appear hardcoded
if grep -E "R2_ENDPOINT_URL.*=.*['\"][^$]" "$WORKFLOW" | grep -v "secrets\." | grep -q .; then
    echo "FAIL: Possible hardcoded R2_ENDPOINT_URL value found"
    FAILURES=$((FAILURES + 1))
else
    echo "PASS: R2 credentials use secrets.* syntax"
fi

# Verify all R2 env vars are assigned via secrets syntax
for secret in R2_ENDPOINT_URL R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET_NAME; do
    # Extract the value assigned to this env var
    value=$(grep "$secret:" "$WORKFLOW" | grep -v "^#" | head -1 | sed 's/.*: *//')
    if echo "$value" | grep -q '^\${{ secrets\.'; then
        echo "PASS: $secret assigned via secrets syntax: $value"
    else
        echo "FAIL: $secret may not be using secrets syntax: $value"
        FAILURES=$((FAILURES + 1))
    fi
done

if [ "$FAILURES" -eq 0 ]; then
    echo ""
    echo "All workflow checks passed."
    exit 0
else
    echo ""
    echo "FAILED: $FAILURES check(s) failed."
    exit 1
fi
