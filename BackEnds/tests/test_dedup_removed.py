#!/usr/bin/env python3
"""Test that hourly deduplication was removed from build_dataset.py."""

import os
import sys

# Add parent directory to path so we can import from the-snake-tank
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "the-snake-tank"))

import build_dataset


def test_no_dedup_in_source():
    """Verify no hourly dedup pattern exists in build_database() source."""
    import inspect
    source = inspect.getsource(build_dataset.build_database)

    # Should not contain dedup-related patterns
    assert "hour_prefix" not in source, "hour_prefix dedup pattern still exists"
    assert "seen = {}" not in source, "seen = {} dedup pattern still exists"
    assert "seen = set()" not in source, "seen = set() dedup pattern still exists"

    # Should go directly from glob to the "not found" check
    # Look for the pattern: json_files = ... followed by if not json_files
    lines = [line.strip() for line in source.split('\n') if line.strip()]

    json_files_idx = None
    for i, line in enumerate(lines):
        if 'json_files = sorted(glob.glob' in line:
            json_files_idx = i
            break

    assert json_files_idx is not None, "Could not find json_files assignment"

    # Next non-comment, non-blank line should be the "if not json_files" check
    next_idx = json_files_idx + 1
    while next_idx < len(lines) and (lines[next_idx].startswith('#') or not lines[next_idx]):
        next_idx += 1

    assert next_idx < len(lines), "No code after json_files assignment"
    assert 'if not json_files' in lines[next_idx], f"Expected 'if not json_files', got: {lines[next_idx]}"


if __name__ == "__main__":
    test_no_dedup_in_source()
    print("✓ Dedup removal verified: no hour_prefix or seen={} pattern in build_database()")
