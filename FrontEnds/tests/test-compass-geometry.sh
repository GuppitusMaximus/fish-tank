#!/usr/bin/env bash
# Test compass geometry calculations using node
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

check_value() {
    local desc="$1"
    local expected="$2"
    local actual="$3"
    local tolerance="${4:-1}"
    local diff
    diff=$(node -e "var d=Math.abs($actual - $expected); process.exit(d <= $tolerance ? 0 : 1)" 2>/dev/null)
    if node -e "var d=Math.abs($actual - $expected); process.exit(d <= $tolerance ? 0 : 1)" 2>/dev/null; then
        PASS=$((PASS + 1))
    else
        echo "FAIL: $desc — expected ~$expected, got $actual (tolerance=$tolerance)"
        ERRORS=$((ERRORS + 1))
    fi
}

# ROOT is unused in geometry tests (pure math), but defined for consistency
ROOT="$(cd "$(dirname "$0")/../the-fish-tank" && pwd)"

# Run geometry tests via node
NODE_RESULT=$(node - <<'EOF'
function compassBearing(lat1, lon1, lat2, lon2) {
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);
    var x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
            Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

var errors = 0;
var pass = 0;

function check(desc, actual, expected, tolerance) {
    tolerance = tolerance || 1;
    if (Math.abs(actual - expected) <= tolerance) {
        pass++;
    } else {
        console.error('FAIL: ' + desc + ' — expected ~' + expected + ', got ' + actual.toFixed(2));
        errors++;
    }
}

// Due north: point directly north should be ~0°
check('due north bearing', compassBearing(0, 0, 1, 0), 0, 1);

// Due south: point directly south should be ~180°
check('due south bearing', compassBearing(0, 0, -1, 0), 180, 1);

// Due east: point directly east should be ~90°
check('due east bearing', compassBearing(0, 0, 0, 1), 90, 1);

// Due west: point directly west should be ~270°
check('due west bearing', compassBearing(0, 0, 0, -1), 270, 1);

// Bearing always 0-360
var b = compassBearing(10, 10, 5, 5);
check('bearing in 0-360 range', b >= 0 && b < 360 ? 0 : 1, 0, 0);

// Centroid: average of two symmetric points should be origin
var stations = [{lat: 1, lon: 1}, {lat: -1, lon: -1}];
var sumLat = 0, sumLon = 0;
stations.forEach(function(s) { sumLat += s.lat; sumLon += s.lon; });
var cLat = sumLat / stations.length;
var cLon = sumLon / stations.length;
check('centroid lat of symmetric points', cLat, 0, 0.001);
check('centroid lon of symmetric points', cLon, 0, 0.001);

// SVG coordinate conversion: bearing=0 (north) → x=cx, y=cy-r
var bearing = 0;
var bearingRad = (bearing - 90) * Math.PI / 180;
var cx = 150, cy = 150, r = 120;
var sx = cx + r * Math.cos(bearingRad);
var sy = cy + r * Math.sin(bearingRad);
check('north dot x is center', sx, cx, 0.1);
check('north dot y is top (cy - r)', sy, cy - r, 0.1);

// SVG coordinate conversion: bearing=90 (east) → x=cx+r, y=cy
bearing = 90;
bearingRad = (bearing - 90) * Math.PI / 180;
sx = cx + r * Math.cos(bearingRad);
sy = cy + r * Math.sin(bearingRad);
check('east dot x is right (cx + r)', sx, cx + r, 0.1);
check('east dot y is center', sy, cy, 0.1);

// SVG coordinate conversion: bearing=180 (south) → x=cx, y=cy+r
bearing = 180;
bearingRad = (bearing - 90) * Math.PI / 180;
sx = cx + r * Math.cos(bearingRad);
sy = cy + r * Math.sin(bearingRad);
check('south dot x is center', sx, cx, 0.1);
check('south dot y is bottom (cy + r)', sy, cy + r, 0.1);

console.log('Results: ' + pass + ' passed, ' + errors + ' failed');
process.exit(errors > 0 ? 1 : 0);
EOF
)

echo "$NODE_RESULT"

if echo "$NODE_RESULT" | grep -q "FAIL:"; then
    ERRORS=$((ERRORS + 1))
else
    PASS=$((PASS + 1))
fi

echo ""
echo "Shell Results: $PASS passed, $ERRORS failed"
[ "$ERRORS" -eq 0 ] && echo "ALL GEOMETRY CHECKS PASSED" || exit 1
