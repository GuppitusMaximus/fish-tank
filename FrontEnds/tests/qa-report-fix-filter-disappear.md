# QA Report: Fix Filters Disappearing on Empty Results

**Plan:** fix-filter-disappear
**Date:** 2026-02-15
**Status:** ✅ PASS
**Tested by:** qa-frontend agent

## Overview

Verified the fix for a bug where history table filter controls disappeared when no predictions matched the active filters, leaving users unable to clear them.

## Implementation Verified

File: `js/weather.js:951-971` (`refreshHistoryV2()` function)

## Test Results

### Test 1: Empty filter results show filters ✅ PASS

**Expected:** When `historyState.sorted.length === 0`, filters remain visible

**Verification:**
- Line 961: `buildHistoryFilters()` is called ✓
- Lines 959-964: Filter HTML is included in container innerHTML ✓
- Line 965: `wireHistoryHandlers()` is called to maintain interactivity ✓

### Test 2: Row count shows zero ✅ PASS

**Expected:** Empty state includes row count showing "0 predictions match filters"

**Verification:**
- Line 962: Shows "0 predictions match filters" ✓

### Test 3: Empty state message present ✅ PASS

**Expected:** "No predictions match current filters" message displayed below filters

**Verification:**
- Line 963: Empty state message is rendered ✓

### Test 4: Initial empty state unchanged ✅ PASS

**Expected:** When no data is loaded (`historyState.fullData.length === 0`), the original "Prediction history building up…" message still shows

**Verification:**
- Lines 942-945 in `initHistoryV2()`: Initial empty state logic preserved ✓
- This state is separate from the filter-no-results state ✓

### Test 5: wireHistoryHandlers called ✅ PASS

**Expected:** Filter event handlers remain active after rendering empty state

**Verification:**
- Line 965: `wireHistoryHandlers()` is called after rendering empty state ✓
- Filter inputs remain interactive even when no results match ✓

## Code Review

The fix correctly handles the empty filter results case:

```javascript
// Line 951-971: refreshHistoryV2()
function refreshHistoryV2() {
  applyHistoryFilters();
  applyHistorySort();
  historyState.rendered = 0;
  var histContainer = document.getElementById('history-v2-container');
  if (!histContainer) return;

  if (historyState.sorted.length === 0) {
    // FIXED: Filters now persist when no results match
    histContainer.innerHTML = '<div class="history-section">' +
      '<h2>Prediction History</h2>' +
      buildHistoryFilters() +  // ← Filters rendered
      '<div class="history-row-count">0 predictions match filters</div>' +  // ← Count shows zero
      '<div class="history-empty">No predictions match current filters</div>' +  // ← Empty message
      '</div>';
    wireHistoryHandlers();  // ← Event handlers wired
    return;
  }

  histContainer.innerHTML = buildHistoryTableV2();
  wireHistoryHandlers();
}
```

### Separation of Empty States

The implementation correctly distinguishes between:

1. **Initial empty state** (no data loaded): `initHistoryV2()` lines 942-945
   - Shows "Prediction history building up…"
   - No filters rendered (none available yet)

2. **Filter-no-results state** (data exists but filters exclude all): `refreshHistoryV2()` lines 958-966
   - Shows filters + "0 predictions match filters" + "No predictions match current filters"
   - Filters remain interactive

## Summary

All 5 tests passed. The fix successfully:
- Preserves filter controls when no predictions match
- Shows clear feedback with row count and empty state message
- Maintains filter interactivity via `wireHistoryHandlers()`
- Keeps the initial empty state logic intact

No bugs found. Implementation is correct and complete.
