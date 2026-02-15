# QA Report: Workflow Trigger Label

**Plan:** qa-workflow-trigger-label
**Date:** 2026-02-15
**Result:** PASS

## Checks

### 1. Latest Run card trigger mapping (line 485)

**Status:** PASS

Found:
```javascript
var trigger = latest.event === 'schedule' || latest.event === 'workflow_dispatch' ? 'Scheduled' : latest.event;
```

Both `schedule` and `workflow_dispatch` map to "Scheduled". Unknown events fall through to `latest.event` (raw name).

### 2. Run History table trigger mapping (line 528)

**Status:** PASS

Found:
```javascript
var trigger = r.event === 'schedule' || r.event === 'workflow_dispatch' ? 'Scheduled' : r.event;
```

Same logic as Latest Run card. Both `schedule` and `workflow_dispatch` map to "Scheduled". Unknown events fall through to `r.event` (raw name).

### 3. No remaining "Manual" label

**Status:** PASS

Searched `weather.js` for the string "Manual" — zero matches found. The old `workflow_dispatch → "Manual"` mapping has been fully removed.

### 4. Default fallback uses raw event name

**Status:** PASS

Both mappings use the raw event property (`latest.event` / `r.event`) as the default case, so any new or unexpected event type will display its actual name rather than a misleading label.

## Summary

All 4 checks passed. The `workflow_dispatch` trigger label change was applied correctly in both locations.
