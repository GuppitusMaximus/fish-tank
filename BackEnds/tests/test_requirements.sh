#!/bin/bash
# Test: requirements.txt includes boto3
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REQUIREMENTS="$SCRIPT_DIR/../the-snake-tank/requirements.txt"

if [ ! -f "$REQUIREMENTS" ]; then
    echo "FAIL: requirements.txt not found at $REQUIREMENTS"
    exit 1
fi

if grep -q "^boto3" "$REQUIREMENTS"; then
    echo "PASS: boto3 found in requirements.txt"
else
    echo "FAIL: boto3 not found in requirements.txt"
    echo "Contents of requirements.txt:"
    cat "$REQUIREMENTS"
    exit 1
fi
