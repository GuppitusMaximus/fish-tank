#!/usr/bin/env bash
# Verify compass station view implementation
set -euo pipefail

ERRORS=0
PASS=0

check() {
    local desc="$1"
    shift
    if "$@" >/dev/null 2>&1; then
        PASS=$((PASS + 1))
    else
        echo "FAIL: $desc"
        ERRORS=$((ERRORS + 1))
    fi
}

ROOT="$(cd "$(dirname "$0")/../the-fish-tank" && pwd)"

# HTML structure
check "home-compass id exists" grep -q 'id="home-compass"' "$ROOT/index.html"
check "home-compass-container class exists" grep -q 'home-compass-container' "$ROOT/index.html"
check "home-compass comes after home-weather" node -e "
  var fs = require('fs');
  var html = fs.readFileSync('$ROOT/index.html', 'utf8');
  var weatherIdx = html.indexOf('id=\"home-weather\"');
  var compassIdx = html.indexOf('id=\"home-compass\"');
  process.exit(compassIdx > weatherIdx ? 0 : 1);
"

# JS functions exist
check "loadCompassData function exists" grep -q 'loadCompassData' "$ROOT/js/weather.js"
check "renderCompass function exists" grep -q 'renderCompass' "$ROOT/js/weather.js"
check "computeStationPositions function exists" grep -q 'computeStationPositions' "$ROOT/js/weather.js"
check "compassBearing function exists" grep -q 'compassBearing' "$ROOT/js/weather.js"
check "MANIFEST_URL used in loadCompassData" grep -q 'MANIFEST_URL' "$ROOT/js/weather.js"
check "loadCompassData exposed on WeatherApp" grep -q 'loadCompassData: loadCompassData' "$ROOT/js/weather.js"
check "public-stations path in data fetch" grep -q "public-stations" "$ROOT/js/weather.js"
check "public_stations key checked in manifest" grep -q 'public_stations' "$ROOT/js/weather.js"

# CSS classes
check "compass-card CSS class" grep -q '\.compass-card' "$ROOT/css/style.css"
check "compass-svg CSS class" grep -q '\.compass-svg' "$ROOT/css/style.css"
check "compass-cardinal CSS class" grep -q '\.compass-cardinal' "$ROOT/css/style.css"
check "compass-station CSS class" grep -q '\.compass-station' "$ROOT/css/style.css"
check "compass-tooltip CSS class" grep -q '\.compass-tooltip' "$ROOT/css/style.css"
check "compass-ring CSS class" grep -q '\.compass-ring' "$ROOT/css/style.css"
check "compass-ring dashed stroke" grep -q 'stroke-dasharray' "$ROOT/css/style.css"
check "compass-station hover effect" grep -q '\.compass-station:hover' "$ROOT/css/style.css"

# Responsive
check "desktop max-width 320px" grep -q 'max-width: 320px' "$ROOT/css/style.css"
check "mobile max-width 260px" grep -q 'max-width: 260px' "$ROOT/css/style.css"
check "media query at 600px" grep -q 'max-width: 600px' "$ROOT/css/style.css"

# Temperature color coding
check "cold color #4a9eff" grep -q '4a9eff' "$ROOT/js/weather.js"
check "cool color #4acfcf" grep -q '4acfcf' "$ROOT/js/weather.js"
check "warm color #ffaa4a" grep -q 'ffaa4a' "$ROOT/js/weather.js"
check "hot color #ff6b4a" grep -q 'ff6b4a' "$ROOT/js/weather.js"

# Color thresholds
check "threshold at 0°C" grep -q 'celsius < 0\|celsius<0' "$ROOT/js/weather.js"
check "threshold at 10°C" grep -q '<= 10\|<=10' "$ROOT/js/weather.js"
check "threshold at 20°C" grep -q '<= 20\|<=20' "$ROOT/js/weather.js"

# Cardinal directions in SVG
check "N cardinal label" grep -q "label: 'N'" "$ROOT/js/weather.js"
check "E cardinal label" grep -q "label: 'E'" "$ROOT/js/weather.js"
check "S cardinal label" grep -q "label: 'S'" "$ROOT/js/weather.js"
check "W cardinal label" grep -q "label: 'W'" "$ROOT/js/weather.js"
check "NE intercardinal label" grep -q "label: 'NE'" "$ROOT/js/weather.js"

# Concentric rings
check "concentric rings drawn (3 rings)" node -e "
  var fs = require('fs');
  var js = fs.readFileSync('$ROOT/js/weather.js', 'utf8');
  var matches = js.match(/0\.33|0\.66|1\.0/g);
  process.exit(matches && matches.length >= 3 ? 0 : 1);
"

# Center marker
check "center dot rendered" grep -q 'centerDot\|center.*Dot' "$ROOT/js/weather.js"

# Tooltip behavior
check "showCompassTooltip function" grep -q 'showCompassTooltip' "$ROOT/js/weather.js"
check "hideCompassTooltip function" grep -q 'hideCompassTooltip' "$ROOT/js/weather.js"
check "tooltip on mouseenter" grep -q 'mouseenter.*showCompassTooltip\|showCompassTooltip.*mouseenter' "$ROOT/js/weather.js"
check "tooltip hides on mouseleave" grep -q 'mouseleave.*hideCompassTooltip\|hideCompassTooltip.*mouseleave' "$ROOT/js/weather.js"
check "tooltip shows temperature" grep -q 'formatTemp\|formatCompassTemp' "$ROOT/js/weather.js"
check "tooltip shows humidity" grep -q 'humidity' "$ROOT/js/weather.js"
check "tooltip shows pressure" grep -q 'pressure' "$ROOT/js/weather.js"

# Unit preference integration
check "formatCompassTemp uses convertTemp" grep -q 'convertTemp' "$ROOT/js/weather.js"
check "unit toggle triggers compass re-render" grep -q 'latestCompassData.*renderCompass\|renderCompass.*latestCompassData' "$ROOT/js/weather.js"

# Metadata displayed
check "station_count in metadata" grep -q 'station_count' "$ROOT/js/weather.js"
check "fetched_at timestamp shown" grep -q 'fetched_at' "$ROOT/js/weather.js"

echo ""
echo "Results: $PASS passed, $ERRORS failed"
[ "$ERRORS" -eq 0 ] && echo "ALL CHECKS PASSED" || exit 1
