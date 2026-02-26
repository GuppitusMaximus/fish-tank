#!/usr/bin/env node
/**
 * QA validation for equipment-grid-pure-data-system plan.
 * Tests EquipmentSystem.js pure math: shapes, rotation, placement, row targeting,
 * synergy map, and stash capacity logic.
 *
 * Extracts constants and pure functions from source to test without ConfigLoader.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../dungeon-fisher/src/systems/EquipmentSystem.js');
const src = fs.readFileSync(SRC, 'utf8');

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, msg) {
    if (condition) {
        passed++;
    } else {
        failed++;
        failures.push(msg);
        console.log(`  FAIL: ${msg}`);
    }
}

function deepEqual(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}

// ===== Extract SHAPES from source =====
const SHAPES = {
    I: [[0,0],[1,0],[2,0],[3,0]],
    O: [[0,0],[1,0],[0,1],[1,1]],
    T: [[1,0],[0,1],[1,1],[2,1]],
    S: [[1,0],[2,0],[0,1],[1,1]],
    Z: [[0,0],[1,0],[1,1],[2,1]],
    L: [[2,0],[0,1],[1,1],[2,1]],
    J: [[0,0],[0,1],[1,1],[2,1]],
    monomino: [[0,0]]
};

const ROW_TARGETING = { 0: [0], 1: [0, 1], 2: [1], 3: [1, 2], 4: [2] };

const SYNERGY_MAP = {
    poison: ['poison'],
    burn: ['burn_aoe', 'burn'],
    curse: ['curse'],
    hot: ['heal_hot'],
    healing: ['heal_hot'],
    shield: ['shield_grant']
};

// Replicate getShapeCells logic exactly from source
function getShapeCells(shape, rotation = 0, flipped = false) {
    let cells = (SHAPES[shape] || SHAPES.monomino).map(([c, r]) => [c, r]);

    if (flipped) {
        const maxCol = Math.max(...cells.map(([c]) => c));
        cells = cells.map(([c, r]) => [maxCol - c, r]);
    }

    const rot = ((rotation % 4) + 4) % 4;
    for (let i = 0; i < rot; i++) {
        cells = cells.map(([c, r]) => [-r, c]);
        const minCol = Math.min(...cells.map(([c]) => c));
        const minRow = Math.min(...cells.map(([, r]) => r));
        cells = cells.map(([c, r]) => [c - minCol, r - minRow]);
    }

    return cells;
}

function cellsEqual(a, b) {
    const sortFn = ([c1, r1], [c2, r2]) => r1 !== r2 ? r1 - r2 : c1 - c2;
    return deepEqual([...a].sort(sortFn), [...b].sort(sortFn));
}

// ===== Step 1: Shape definitions =====
console.log('\n=== Step 1: Shape definitions ===');

assert(Object.keys(SHAPES).length === 8, 'SHAPES has 8 entries');
for (const name of ['I', 'O', 'T', 'S', 'Z', 'L', 'J']) {
    assert(SHAPES[name].length === 4, `${name} has 4 cells`);
}
assert(SHAPES.monomino.length === 1, 'monomino has 1 cell');

// Verify source matches our extracted constants
for (const [name, cells] of Object.entries(SHAPES)) {
    const cellStr = cells.map(([c,r]) => `[${c},${r}]`).join(',');
    assert(src.includes(cellStr) || src.includes(cells.map(([c,r]) => `[${c}, ${r}]`).join(',')),
        `Source contains ${name} shape definition`);
}

// ===== Step 2: Rotation math =====
console.log('\n=== Step 2: Rotation math ===');

// I-piece: rot 0 = horizontal, rot 1 = vertical
assert(cellsEqual(getShapeCells('I', 0), [[0,0],[1,0],[2,0],[3,0]]),
    'I rot 0: horizontal line');
assert(cellsEqual(getShapeCells('I', 1), [[0,0],[0,1],[0,2],[0,3]]),
    'I rot 1: vertical column');

// O-piece: all rotations identical
for (let r = 0; r < 4; r++) {
    assert(cellsEqual(getShapeCells('O', r), [[0,0],[1,0],[0,1],[1,1]]),
        `O rot ${r}: same 2x2 block`);
}

// T-piece: 4 distinct orientations
const tRots = [0,1,2,3].map(r => JSON.stringify(getShapeCells('T', r).sort()));
const tUnique = new Set(tRots);
assert(tUnique.size === 4, `T-piece has 4 distinct orientations (got ${tUnique.size})`);

// S-piece: 2 unique orientations (rot 0 = rot 2, rot 1 = rot 3)
assert(cellsEqual(getShapeCells('S', 0), getShapeCells('S', 2)),
    'S rot 0 = rot 2');
assert(cellsEqual(getShapeCells('S', 1), getShapeCells('S', 3)),
    'S rot 1 = rot 3');
assert(!cellsEqual(getShapeCells('S', 0), getShapeCells('S', 1)),
    'S rot 0 != rot 1');

// Z-piece: 2 unique orientations
assert(cellsEqual(getShapeCells('Z', 0), getShapeCells('Z', 2)),
    'Z rot 0 = rot 2');
assert(cellsEqual(getShapeCells('Z', 1), getShapeCells('Z', 3)),
    'Z rot 1 = rot 3');

// L-piece: 4 distinct
const lRots = [0,1,2,3].map(r => JSON.stringify(getShapeCells('L', r).sort()));
assert(new Set(lRots).size === 4, 'L-piece has 4 distinct orientations');

// J-piece: 4 distinct
const jRots = [0,1,2,3].map(r => JSON.stringify(getShapeCells('J', r).sort()));
assert(new Set(jRots).size === 4, 'J-piece has 4 distinct orientations');

// Flip: S flipped = Z
assert(cellsEqual(getShapeCells('S', 0, true), getShapeCells('Z', 0, false)),
    'S flipped = Z');

// Flip: L flipped = J
assert(cellsEqual(getShapeCells('L', 0, true), getShapeCells('J', 0, false)),
    'L flipped = J');

// Flip + rotation: S flipped rot 1 = Z rot 1
assert(cellsEqual(getShapeCells('S', 1, true), getShapeCells('Z', 1, false)),
    'S flipped rot 1 = Z rot 1');

// ===== Step 3: Placement validation logic =====
console.log('\n=== Step 3: Placement validation logic ===');

// Verify canPlace checks bounds, overlap, and row restriction in source
assert(src.includes('c < 0 || c >= gridWidth || r < 0 || r >= gridHeight'),
    'canPlace checks grid bounds');
assert(src.includes("reason: 'out_of_bounds'"), 'canPlace returns out_of_bounds reason');
assert(src.includes("reason: 'overlap'"), 'canPlace returns overlap reason');
assert(src.includes("reason: 'row_restriction'"), 'canPlace returns row_restriction reason');
assert(src.includes('item.rowRestriction !== undefined'), 'canPlace checks rowRestriction');
assert(src.includes('r !== item.rowRestriction'), 'canPlace validates cell row against restriction');

// Bounds: I-piece horizontal at (0,0) in 3x5 grid would need cols 0-3, col 3 >= gridWidth=3
const iCells = getShapeCells('I', 0).map(([c, r]) => [0 + c, 0 + r]);
const outOfBounds = iCells.some(([c, r]) => c < 0 || c >= 3 || r < 0 || r >= 5);
assert(outOfBounds === true, 'I-piece horizontal at (0,0) exceeds 3-wide grid');

// I-piece vertical at (0,0) in 3x5 grid: col 0, rows 0-3 → fits
const iVertCells = getShapeCells('I', 1).map(([c, r]) => [0 + c, 0 + r]);
const vFits = !iVertCells.some(([c, r]) => c < 0 || c >= 3 || r < 0 || r >= 5);
assert(vFits === true, 'I-piece vertical at (0,0) fits in 3x5 grid');

// I-piece vertical at (0,2): rows 2-5, row 5 >= gridHeight=5
const iVert2 = getShapeCells('I', 1).map(([c, r]) => [0 + c, 2 + r]);
const vExceeds = iVert2.some(([c, r]) => c < 0 || c >= 3 || r < 0 || r >= 5);
assert(vExceeds === true, 'I-piece vertical at (0,2) exceeds 5-tall grid');

// Harmony monomino at (1,4) with rowRestriction=4: cell [1,4], r=4 matches
const harmonyCells = getShapeCells('monomino', 0).map(([c, r]) => [1 + c, 4 + r]);
const harmonyRestrictionPass = harmonyCells.every(([, r]) => r === 4);
assert(harmonyRestrictionPass === true, 'Harmony at (1,4) passes rowRestriction=4');

// Harmony at (1,3): cell [1,3], r=3 !== 4
const harmonyFail = getShapeCells('monomino', 0).map(([c, r]) => [1 + c, 3 + r]);
const harmonyRestrictionFail = harmonyFail.every(([, r]) => r === 4);
assert(harmonyRestrictionFail === false, 'Harmony at (1,3) fails rowRestriction=4');

// ===== Step 4: Row targeting =====
console.log('\n=== Step 4: Row targeting ===');

// Verify ROW_TARGETING in source
assert(src.includes('0: [0]'), 'ROW_TARGETING row 0 → [0]');
assert(src.includes('1: [0, 1]'), 'ROW_TARGETING row 1 → [0, 1]');
assert(src.includes('2: [1]'), 'ROW_TARGETING row 2 → [1]');
assert(src.includes('3: [1, 2]'), 'ROW_TARGETING row 3 → [1, 2]');
assert(src.includes('4: [2]'), 'ROW_TARGETING row 4 → [2]');

// Simulate getAffectedPartyMembers for multi-row items
function getAffectedPartyMembers(cells, partySize) {
    const affected = new Set();
    for (const [, row] of cells) {
        const targets = ROW_TARGETING[row];
        if (targets) {
            for (const idx of targets) {
                if (idx < partySize) affected.add(idx);
            }
        }
    }
    return affected;
}

// Item spanning rows 1-2 → {0, 1}
const rows12 = getAffectedPartyMembers([[0,1],[0,2]], 3);
assert(deepEqual([...rows12].sort(), [0, 1]), 'Rows 1-2 → party members [0, 1]');

// I-piece vertical spanning rows 0-3 → {0, 1, 2}
const rows03 = getAffectedPartyMembers([[0,0],[0,1],[0,2],[0,3]], 3);
assert(deepEqual([...rows03].sort(), [0, 1, 2]), 'Rows 0-3 → party members [0, 1, 2]');

// Single cell on row 4 → {2}
const row4 = getAffectedPartyMembers([[1,4]], 3);
assert(deepEqual([...row4], [2]), 'Row 4 → party member [2]');

// ===== Step 5: Synergy map =====
console.log('\n=== Step 5: Synergy map ===');

// Verify SYNERGY_MAP in source
assert(src.includes("poison: ['poison']"), 'SYNERGY_MAP: poison → [poison]');
assert(src.includes("burn: ['burn_aoe', 'burn']"), 'SYNERGY_MAP: burn → [burn_aoe, burn]');
assert(src.includes("curse: ['curse']"), 'SYNERGY_MAP: curse → [curse]');
assert(src.includes("hot: ['heal_hot']"), 'SYNERGY_MAP: hot → [heal_hot]');
assert(src.includes("healing: ['heal_hot']"), 'SYNERGY_MAP: healing → [heal_hot]');
assert(src.includes("shield: ['shield_grant']"), 'SYNERGY_MAP: shield → [shield_grant]');

// Synergy logic: checks fish.moves[0] via ConfigLoader
assert(src.includes('fish.moves[0]'), 'detectSynergy checks fish.moves[0]');
assert(src.includes('SYNERGY_MAP[buffType].includes(move.effect.type)'),
    'detectSynergy matches move.effect.type against SYNERGY_MAP');

// Stat buffs do NOT trigger synergy (SYNERGY_MAP has no atk/def/spd/hp keys)
assert(!SYNERGY_MAP.hasOwnProperty('atk'), 'No synergy for atk buff type');
assert(!SYNERGY_MAP.hasOwnProperty('def'), 'No synergy for def buff type');
assert(!SYNERGY_MAP.hasOwnProperty('spd'), 'No synergy for spd buff type');
assert(!SYNERGY_MAP.hasOwnProperty('hp'), 'No synergy for hp buff type');
assert(!SYNERGY_MAP.hasOwnProperty('healPower'), 'No synergy for healPower buff type');

// ===== Step 6: applyBonuses / revertBonuses lifecycle =====
console.log('\n=== Step 6: applyBonuses / revertBonuses lifecycle ===');

// applyBonuses mutates stats
assert(src.includes('fish.atk += bonuses.atk'), 'applyBonuses: atk mutation');
assert(src.includes('fish.def += bonuses.def'), 'applyBonuses: def mutation');
assert(src.includes('fish.spd += bonuses.spd'), 'applyBonuses: spd mutation');
assert(src.includes('fish.healPower += bonuses.healPower'), 'applyBonuses: healPower mutation');

// maxHp: preserves ratio
assert(src.includes('fish.hp / fish.maxHp'), 'applyBonuses: hp ratio preservation');
assert(src.includes('fish.maxHp += bonuses.maxHp'), 'applyBonuses: maxHp increase');
assert(src.includes('Math.floor(fish.maxHp * ratio)'), 'applyBonuses: hp set from ratio');

// maxShield: direct add
assert(src.includes('fish.maxShield += bonuses.maxShield'), 'applyBonuses: maxShield increase');
assert(src.includes('fish.shield += bonuses.maxShield'), 'applyBonuses: shield increase');

// Action effects and harmony
assert(src.includes('fish._equipActionEffects = actionEffects[i]'), 'applyBonuses: sets _equipActionEffects');
assert(src.includes('party[2]._harmonyAttack = harmonyBonus'), 'applyBonuses: sets _harmonyAttack on party[2]');

// revertBonuses: subtracts delta
assert(src.includes('fish.atk -= bonuses.atk'), 'revertBonuses: atk revert');
assert(src.includes('fish.def -= bonuses.def'), 'revertBonuses: def revert');
assert(src.includes('fish.spd -= bonuses.spd'), 'revertBonuses: spd revert');
assert(src.includes('fish.maxHp -= bonuses.maxHp'), 'revertBonuses: maxHp revert');
assert(src.includes('fish.hp = Math.min(fish.hp, fish.maxHp)'), 'revertBonuses: hp capped after maxHp revert');
assert(src.includes('fish.maxShield -= bonuses.maxShield'), 'revertBonuses: maxShield revert');
assert(src.includes('fish.shield = Math.min(fish.shield, fish.maxShield)'), 'revertBonuses: shield capped after maxShield revert');
assert(src.includes('delete fish._equipActionEffects'), 'revertBonuses: clears _equipActionEffects');
assert(src.includes('delete fish._harmonyAttack'), 'revertBonuses: clears _harmonyAttack');

// ===== Step 7: Harmony mechanics =====
console.log('\n=== Step 7: Harmony mechanics ===');

// Base damage = 50% of companion's ATK
assert(src.includes('companion.atk * 0.5'), 'Harmony: base damage = 50% of companion ATK');
assert(src.includes('party[2]') && src.includes('const companion = party[2]'),
    'Harmony: companion is party[2]');

// Adjacency: orthogonal neighbors
assert(src.includes('col - 1, row], [col + 1, row], [col, row - 1], [col, row + 1]'),
    'Harmony: checks 4 orthogonal neighbors');

// Deduplication
assert(src.includes('visitedItems.has(adjacent.entry.itemId)'),
    'Harmony: deduplicates adjacent items by itemId');

// Only stat buffs contribute to adjacency
assert(src.includes('STAT_BUFFS.has(buff.type)') && src.includes('adjacencyBonuses.push'),
    'Harmony: adjacency only adds stat buffs');

// ===== Step 8: Stash capacity =====
console.log('\n=== Step 8: Stash capacity ===');

// canFitInStash logic
assert(src.includes('(currentCells + itemCells) <= stashCapacity'),
    'canFitInStash: checks total cells <= capacity');

// Counts cells from SHAPES
assert(src.includes('SHAPES[config.shape] || SHAPES.monomino').length > 0 ||
       src.includes("(SHAPES[config.shape] || SHAPES.monomino).length"),
    'canFitInStash: uses SHAPES for cell count');

// Handles both id and itemId
assert(src.includes('stashItem.id || stashItem.itemId'),
    'canFitInStash: handles both id and itemId');

// Simulate canFitInStash math
function canFitInStash(currentCells, newItemCells, capacity) {
    return (currentCells + newItemCells) <= capacity;
}

assert(canFitInStash(0, 4, 15) === true, 'Empty stash + 4-cell item = fits');
assert(canFitInStash(12, 4, 15) === false, 'Stash at 12 + 4-cell item = overflow');
assert(canFitInStash(11, 4, 15) === true, 'Stash at 11 + 4-cell item = fits exactly');
assert(canFitInStash(15, 1, 15) === false, 'Full stash + monomino = overflow');
assert(canFitInStash(14, 1, 15) === true, 'Stash at 14 + monomino = fits');

// ===== Step 9: rollBossDrop =====
console.log('\n=== Step 9: rollBossDrop ===');

assert(src.includes('balance.rarityDropWeights[zoneId]'),
    'rollBossDrop reads weights from balance config');
assert(src.includes('Math.random() * 100'), 'rollBossDrop uses 0-100 range');
assert(src.includes("rarity = 'standard'"), 'rollBossDrop can select standard');
assert(src.includes("rarity = 'magic'"), 'rollBossDrop can select magic');
assert(src.includes("rarity = 'rare'"), 'rollBossDrop can select rare');
assert(src.includes('ConfigLoader.getZoneItems(zoneId)'),
    'rollBossDrop filters items by zone');

// ===== SUMMARY =====
console.log('\n=== SUMMARY ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failures.length > 0) {
    console.log('\nFailures:');
    for (const f of failures) {
        console.log(`  - ${f}`);
    }
}

process.exit(failed > 0 ? 1 : 0);
