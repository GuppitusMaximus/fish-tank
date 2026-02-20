#!/usr/bin/env bash
# Verify intensified background effects in BackgroundEffects.js
# Plan: intensify-bg-effects-dungeon-fisher
# Checks: all 7 zones have mist, particle quantity/alpha/scale increased,
#         mist reads per-preset values, ambient pulse range widened, no syntax errors

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FILE="$SCRIPT_DIR/../dungeon-fisher/src/effects/BackgroundEffects.js"

PASS=0
FAIL=0

pass() { echo "PASS: $1"; PASS=$((PASS+1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL+1)); }

if [ ! -f "$FILE" ]; then
    echo "FAIL: BackgroundEffects.js not found at $FILE"
    exit 1
fi

# ─── Check 1: All 7 zones have mist ──────────────────────────────────────────
# Each zone block must contain mist: { ... } (not mist: null)

ZONES="bg_sewers bg_goblin-caves bg_bone-crypts bg_deep-dungeon bg_shadow-realm bg_ancient-chambers bg_dungeon-heart"

for zone in $ZONES; do
    result=$(node -e "
const fs = require('fs');
const src = fs.readFileSync('$FILE', 'utf8');
const start = src.indexOf(\"'$zone':\");
if (start === -1) { console.log('missing'); process.exit(0); }
const allZones = ['bg_sewers','bg_goblin-caves','bg_bone-crypts','bg_deep-dungeon','bg_shadow-realm','bg_ancient-chambers','bg_dungeon-heart'];
let nextStart = src.length;
for (const z of allZones) {
  if (z === '$zone') continue;
  const pos = src.indexOf(\"'\" + z + \"':\", start + 1);
  if (pos !== -1 && pos < nextStart) nextStart = pos;
}
const block = src.slice(start, nextStart);
const hasMist = /mist:\s*\{/.test(block);
console.log(hasMist ? 'pass' : 'fail');
" 2>/dev/null)
    if [ "$result" = "pass" ]; then
        pass "$zone has non-null mist"
    else
        fail "$zone missing non-null mist (got: $result)"
    fi
done

# ─── Check 2: All presets have particle quantity 2 or 3 ──────────────────────

for zone in $ZONES; do
    result=$(node -e "
const fs = require('fs');
const src = fs.readFileSync('$FILE', 'utf8');
const start = src.indexOf(\"'$zone':\");
if (start === -1) { console.log('missing'); process.exit(0); }
const allZones = ['bg_sewers','bg_goblin-caves','bg_bone-crypts','bg_deep-dungeon','bg_shadow-realm','bg_ancient-chambers','bg_dungeon-heart'];
let nextStart = src.length;
for (const z of allZones) {
  if (z === '$zone') continue;
  const pos = src.indexOf(\"'\" + z + \"':\", start + 1);
  if (pos !== -1 && pos < nextStart) nextStart = pos;
}
const block = src.slice(start, nextStart);
const particlesIdx = block.indexOf('particles:');
if (particlesIdx === -1) { console.log('no-particles'); process.exit(0); }
const particlesBlock = block.slice(particlesIdx, particlesIdx + 300);
const hasQty = /quantity:\s*[23]\b/.test(particlesBlock);
console.log(hasQty ? 'pass' : 'fail');
" 2>/dev/null)
    if [ "$result" = "pass" ]; then
        pass "$zone particles quantity is 2 or 3"
    else
        fail "$zone particles quantity not 2 or 3 (got: $result)"
    fi
done

# ─── Check 3: Particle alpha starts at 0.7 ───────────────────────────────────

if grep -q 'alpha: { start: 0\.7' "$FILE"; then
    pass "particle emitter alpha start is 0.7"
else
    fail "particle emitter alpha start is not 0.7 (was 0.5 before intensify)"
fi

# ─── Check 4: Particle scale starts at 0.8 ───────────────────────────────────

if grep -q 'scale: { start: 0\.8' "$FILE"; then
    pass "particle emitter scale start is 0.8"
else
    fail "particle emitter scale start is not 0.8 (was 0.5 before intensify)"
fi

# ─── Check 5: Mist uses per-preset frequency and quantity ────────────────────

if grep -q 'frequency: m\.frequency' "$FILE"; then
    pass "mist emitter reads m.frequency from preset"
else
    fail "mist emitter does not read m.frequency from preset"
fi

if grep -q 'quantity: m\.quantity' "$FILE"; then
    pass "mist emitter reads m.quantity from preset"
else
    fail "mist emitter does not read m.quantity from preset"
fi

# ─── Check 6: Ambient pulse range widened ────────────────────────────────────

if grep -q 'ambientAlpha \* 0\.5' "$FILE"; then
    pass "ambient tween lower bound is ambientAlpha * 0.5"
else
    fail "ambient tween lower bound is not ambientAlpha * 0.5"
fi

if grep -q 'ambientAlpha \* 3\.0' "$FILE"; then
    pass "ambient tween upper bound is ambientAlpha * 3.0"
else
    fail "ambient tween upper bound is not ambientAlpha * 3.0"
fi

# ─── Check 7: No syntax errors ───────────────────────────────────────────────

BAD_HEX=$(grep -oE '0x[0-9a-fA-F]+' "$FILE" | grep -Ev '^0x[0-9a-fA-F]{6}$' || true)
if [ -z "$BAD_HEX" ]; then
    pass "all hex color values are valid 6-digit format"
else
    fail "invalid hex color values found: $BAD_HEX"
fi

if node --check "$FILE" 2>/dev/null; then
    pass "no JavaScript syntax errors"
else
    fail "JavaScript syntax errors detected"
fi

# ─── Summary ──────────────────────────────────────────────────────────────────

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
