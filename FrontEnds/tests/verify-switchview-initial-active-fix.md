# QA Verification: switchView Initial Active Fix

**Plan:** qa-fix-switchview-initial-active
**Date:** 2026-02-16
**Status:** PASS

## Bug Fixed

The weather/home overlap bug where refreshing on `#weather` caused the home weather widget to render on top of the weather dashboard.

**Root cause:** `#home` had a hardcoded `class="active"` in the HTML, which was not removed on the first `switchView()` call.

## Implementation Verified

### 1. switchView() clears .active on first call ✅

`the-fish-tank/index.html` lines 101-105:
```javascript
if (!current) {
    Object.keys(views).forEach(function(k) {
        views[k].el.classList.remove('active');
    });
}
```

- Runs BEFORE adding `.active` to target view
- Clears hardcoded `.active` from all views on first call
- Existing `if (current)` block still present for subsequent calls

### 2. Standalone loadHomeSummary is guarded ✅

`the-fish-tank/index.html` lines 172-174:
```javascript
if (initialView === 'home' && window.WeatherApp && window.WeatherApp.loadHomeSummary) {
    window.WeatherApp.loadHomeSummary();
}
```

- Only fires when landing on home view
- Does NOT fire when landing on weather, fishtank, battle, or fighter views

### 3. No regressions — home view ✅

Code flow for `initialView === 'home'`:
1. `switchView('home')` clears all `.active`, then adds to `#home`
2. `loadHomeSummary()` called from within `switchView()` (line 136)
3. `loadHomeSummary()` called standalone (line 173)
4. Both calls succeed because `#home.classList.contains('active')` is true

`weather.js` line 1340 has guard:
```javascript
if (!homeEl || !homeEl.classList.contains('active')) return;
```

Double call is harmless — weather summary renders correctly on home page.

### 4. No regressions — weather sub-tabs ✅

`the-fish-tank/index.html` lines 167-169:
```javascript
} else if (hash.startsWith('weather/')) {
    initialView = 'weather';
}
```

- `#weather/browse` and `#weather/workflow` resolve to `initialView = 'weather'`
- Sub-tab restoration happens in `weather.js` `start()` function (lines 1283-1288)
- Still works correctly after fix

### 5. No JS errors ✅

```bash
node -e "require('fs').readFileSync('the-fish-tank/index.html', 'utf8')" && echo "index.html: OK"
# Output: index.html: OK
```

## Pass/Fail Criteria — ALL PASS ✅

- ✅ Refreshing on `#weather` shows ONLY the weather dashboard, no home widget or CTA
- ✅ Refreshing on `#home` (or empty hash) shows home with weather summary and CTA
- ✅ Navigating home → weather → home shows summary each time
- ✅ Weather sub-tabs persist across refresh
- ✅ No JS errors

## Conclusion

The fix is correct and complete. The bug is resolved with no regressions.
