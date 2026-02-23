# QA Results: Unique Card Shimmers
Plan: qa-fix-card-label-unique-shimmer
Date: 2026-02-22
Result: ✅ PASS — All 5/5 criteria met

## Verification

| # | Criterion | Result |
|---|-----------|--------|
| 1 | Each card object has its own `shimmer` property with `base` and `range` | ✅ PASS |
| 2 | Distinct colors: Delve=amber, Shop=gold, Camp=green — base values differ | ✅ PASS |
| 3 | `tweens.addCounter` is inside the `cards.forEach` loop (per-card, not shared) | ✅ PASS |
| 4 | No shared `cardLabels` array or shared tween after the loop | ✅ PASS |
| 5 | VERSION bumped 1.10.20 → 1.10.21 (PATCH increment) | ✅ PASS |

## Details

**File:** `dungeon-fisher/src/scenes/FloorScene.js`

### Check 1 & 2: Per-card shimmer data with distinct colors

```js
const cards = [
    { type: 'delve', key: 'card_delve', label: 'Delve Deeper', color: '#cc9966',
      shimmer: { base: [200, 140, 80], range: [55, 60, 40] } },  // warm amber
];
if (shopAvailable) {
    cards.push({ type: 'shop', key: getShopCardKey(gs.floor), label: getShopName(gs.floor), color: '#ccaa44',
        shimmer: { base: [200, 180, 50], range: [55, 55, 40] } });  // bright gold
}
cards.push({ type: 'camp', key: 'card_camp', label: 'Make Camp', color: '#88aa66',
    shimmer: { base: [80, 180, 80], range: [40, 75, 40] } });  // forest green
```

- Delve: base [200, 140, 80] — warm amber ✅
- Shop: base [200, 180, 50] — bright gold ✅
- Camp: base [80, 180, 80] — forest green ✅
- All three bases are distinct ✅

### Check 3: Individual tweens inside loop

`cards.forEach((card) => {` begins at line 231. The `tweens.addCounter` call appears at line 257, inside the loop:

```js
// Per-card shimmer tween
const sh = card.shimmer;
this.tweens.addCounter({
    from: 0, to: Math.PI * 2,
    duration: 3000,
    repeat: -1,
    onUpdate: (tween) => {
        const p = tween.getValue();
        const l1 = 0.5 + 0.5 * Math.sin(p);
        const l2 = 0.5 + 0.5 * Math.sin(p - 1.5);
        const c1 = Phaser.Display.Color.GetColor(sh.base[0] + l1 * sh.range[0], sh.base[1] + l1 * sh.range[1], sh.base[2] + l1 * sh.range[2]);
        const c2 = Phaser.Display.Color.GetColor(sh.base[0] + l2 * sh.range[0], sh.base[1] + l2 * sh.range[1], sh.base[2] + l2 * sh.range[2]);
        label.setTint(c1, c2, c1, c2);
    }
});
```

Each card gets its own tween with its own captured `sh` reference. ✅

### Check 4: No shared cardLabels tween

Grep for `cardLabels` in `FloorScene.js` returns no matches. The old shared tween and `cardLabels` array have been fully removed. ✅

### Check 5: Version bump

`src/version.js` changed from `'1.10.20'` → `'1.10.21'` (PATCH increment). ✅
