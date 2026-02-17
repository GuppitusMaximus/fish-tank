#!/bin/bash
# Test: Cloudflare Worker (index.js) structure review
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKER="$SCRIPT_DIR/../../Planning/cloudflare-auth/src/index.js"

if [ ! -f "$WORKER" ]; then
    echo "FAIL: Worker not found at $WORKER"
    exit 1
fi

FAILURES=0

# Test 1: Auth endpoints
for endpoint in '/auth/login' '/auth/logout' '/auth/check'; do
    if grep -q "$endpoint" "$WORKER"; then
        echo "PASS: Auth endpoint $endpoint found"
    else
        echo "FAIL: Auth endpoint $endpoint not found in Worker"
        FAILURES=$((FAILURES + 1))
    fi
done

# Test 2: Data endpoints
for endpoint in '/data/weather' '/data/database'; do
    if grep -q "$endpoint" "$WORKER"; then
        echo "PASS: Data endpoint $endpoint found"
    else
        echo "FAIL: Data endpoint $endpoint not found in Worker"
        FAILURES=$((FAILURES + 1))
    fi
done

# Test 3: JWT validation (verifies JWT before serving data)
if grep -q "verifyRequestJWT" "$WORKER"; then
    echo "PASS: JWT validation function referenced"
else
    echo "FAIL: verifyRequestJWT not found — JWT validation may be missing"
    FAILURES=$((FAILURES + 1))
fi

if grep -q "Authorization" "$WORKER"; then
    echo "PASS: Authorization header checked"
else
    echo "FAIL: Authorization header not checked in Worker"
    FAILURES=$((FAILURES + 1))
fi

# Test 4: PBKDF2 password verification
if grep -q "PBKDF2" "$WORKER"; then
    echo "PASS: PBKDF2 found in Worker"
else
    echo "FAIL: PBKDF2 not found — password verification may not use Web Crypto PBKDF2"
    FAILURES=$((FAILURES + 1))
fi

# Test 5: CORS headers
for header in 'Access-Control-Allow-Origin' 'Access-Control-Allow-Methods' 'Access-Control-Allow-Headers'; do
    if grep -q "$header" "$WORKER"; then
        echo "PASS: CORS header '$header' set"
    else
        echo "FAIL: CORS header '$header' not found in Worker"
        FAILURES=$((FAILURES + 1))
    fi
done

# Test 6: R2 binding DATA_BUCKET
if grep -q "DATA_BUCKET" "$WORKER"; then
    echo "PASS: R2 binding DATA_BUCKET referenced"
else
    echo "FAIL: DATA_BUCKET R2 binding not found in Worker"
    FAILURES=$((FAILURES + 1))
fi

# Test 7: KV binding AUTH_KV
if grep -q "AUTH_KV" "$WORKER"; then
    echo "PASS: KV binding AUTH_KV referenced"
else
    echo "FAIL: AUTH_KV KV binding not found in Worker"
    FAILURES=$((FAILURES + 1))
fi

if [ "$FAILURES" -eq 0 ]; then
    echo ""
    echo "All Worker structure checks passed."
    exit 0
else
    echo ""
    echo "FAILED: $FAILURES check(s) failed."
    exit 1
fi
