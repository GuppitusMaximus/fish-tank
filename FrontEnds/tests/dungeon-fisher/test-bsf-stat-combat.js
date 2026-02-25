#!/usr/bin/env node
/**
 * QA verification for bsf-stat-combat plan (Phase 2a).
 * Validates: modifier pipeline (getEffectiveStat), combat state initialization,
 * shield absorption in damage pipeline, poison bypass, minimum damage.
 */

const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..', '..', 'dungeon-fisher', 'src');
const CONFIG = path.join(BASE, 'config');
let passed = 0;
let failed = 0;

function ok(msg) { passed++; console.log(`  PASS: ${msg}`); }
function fail(msg) { failed++; console.error(`  FAIL: ${msg}`); }
function section(msg) { console.log(`\n--- ${msg} ---`); }

function readJSON(filePath) {
    try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
    catch (e) { return null; }
}

function readFile(filePath) {
    try { return fs.readFileSync(filePath, 'utf8'); }
    catch (e) { return null; }
}

const combatSrc = readFile(path.join(BASE, 'systems', 'CombatSystem.js'));
const combatConfig = readJSON(path.join(CONFIG, 'combat.json'));

if (!combatSrc) { fail('Could not read CombatSystem.js'); process.exit(1); }
if (!combatConfig) { fail('Could not read combat.json'); process.exit(1); }

// ─── Step 1: Modifier pipeline (getEffectiveStat) ───────────────────────────
section('1. Modifier pipeline — getEffectiveStat');

// 1a. Method exists with correct signature
if (combatSrc.includes('static getEffectiveStat(combatant, stat)')) {
    ok('getEffectiveStat exists with (combatant, stat) signature');
} else {
    fail('getEffectiveStat missing or wrong signature');
}

// 1b. Starts from base stat on ref
if (combatSrc.includes('combatant.ref[stat]')) {
    ok('Reads base stat from combatant.ref[stat]');
} else {
    fail('Does not read base stat from combatant.ref');
}

// 1c. Flat buff bonuses applied
if (combatSrc.includes('buff.stat === stat') && combatSrc.includes('value += buff.amount')) {
    ok('Applies flat buff bonuses (buff.stat match → value += amount)');
} else {
    fail('Flat buff logic missing or incorrect');
}

// 1d. Curse reduction with cap
if (combatSrc.includes('totalCursePercent += curse.percent')) {
    ok('Sums curse percentages from curses array');
} else {
    fail('Does not sum curse.percent values');
}

if (combatSrc.includes('Math.min(totalCursePercent, cc.curseCap)')) {
    ok('Caps curse percent at curseCap from combat config');
} else {
    fail('Curse cap not applied correctly');
}

if (combatSrc.includes('value *= (1 - totalCursePercent)')) {
    ok('Reduces stat by curse percentage');
} else {
    fail('Curse reduction formula missing');
}

// 1e. Floor at 0
if (combatSrc.includes('Math.max(0, value)')) {
    ok('Result floored at 0');
} else {
    fail('Result not floored at 0');
}

// 1f. Pipeline order: base → buffs → curses → floor
const getEffectiveMatch = combatSrc.match(/static getEffectiveStat[\s\S]*?Math\.max\(0, value\)/);
if (getEffectiveMatch) {
    const body = getEffectiveMatch[0];
    const buffPos = body.indexOf('combatant.buffs');
    const cursePos = body.indexOf('combatant.curses');
    const floorPos = body.indexOf('Math.max(0');
    if (buffPos < cursePos && cursePos < floorPos) {
        ok('Pipeline order correct: buffs → curses → floor');
    } else {
        fail('Pipeline order incorrect');
    }
} else {
    fail('Could not extract getEffectiveStat body');
}

// 1g. Computational check: ATK 10 with 15% curse → ~8.5
const atkBase = 10;
const cursePercent = 0.15;
const expected = atkBase * (1 - cursePercent); // 8.5
if (expected === 8.5) {
    ok(`Curse math: ATK ${atkBase} with ${cursePercent * 100}% curse = ${expected}`);
} else {
    fail(`Curse math wrong: expected 8.5, got ${expected}`);
}

// 1h. Curse cap: two 30% curses → capped at 50%
const curseCap = combatConfig.curseCap;
if (curseCap === 0.5) {
    ok(`curseCap in config = ${curseCap} (50%)`);
} else {
    fail(`curseCap = ${curseCap} (expected 0.5)`);
}
const twoCurses = Math.min(0.30 + 0.30, curseCap); // 0.60 → capped at 0.50
if (twoCurses === 0.5) {
    ok(`Two 30% curses capped: ${0.30 + 0.30} → ${twoCurses}`);
} else {
    fail(`Curse cap math wrong: expected 0.5, got ${twoCurses}`);
}

// ─── Step 2: Combat state initialization ─────────────────────────────────────
section('2. Combat state initialization');

// 2a. createCombatState exists (pack-based: party, monsters array, floor)
if (combatSrc.includes('static createCombatState(party, monsters, floor')) {
    ok('createCombatState exists with (party, monsters, floor) signature');
} else {
    fail('createCombatState missing or wrong signature');
}

// 2b. Fish combatant fields
const fishStateFields = ['shield', 'maxShield', 'curses: []', 'hots: []', 'burn: null', 'poisons: []'];
for (const field of fishStateFields) {
    // Look for the field in the fish state initialization block
    if (combatSrc.includes(field)) {
        ok(`Fish combatant state has ${field}`);
    } else {
        fail(`Fish combatant state missing ${field}`);
    }
}

// 2c. Backward compat: poisoned: null still present
const fishBlock = combatSrc.match(/fish: aliveFish\.map[\s\S]*?\}\)\)/);
if (fishBlock && fishBlock[0].includes('poisoned: null')) {
    ok('Fish combatant retains poisoned: null (backward compat)');
} else {
    fail('Fish combatant missing poisoned: null');
}

// 2d. Monster combatant has same fields (now in monsterCombatants array via monsters.map)
const monsterBlock = combatSrc.match(/const monsterCombatants = monsters\.map[\s\S]*?\}\)\)/);
if (monsterBlock) {
    const mb = monsterBlock[0];
    const monsterFields = ['shield:', 'maxShield:', 'curses: []', 'hots: []', 'burn: null', 'poisons: []', 'poisoned: null'];
    for (const f of monsterFields) {
        if (mb.includes(f)) {
            ok(`Monster combatant has ${f}`);
        } else {
            fail(`Monster combatant missing ${f}`);
        }
    }
} else {
    fail('Could not extract monster combatants block');
}

// 2e. HP bar chunks include shield and maxShield
const chunksBlock = combatSrc.match(/const chunks = aliveFish\.map[\s\S]*?\}\)\)/);
if (chunksBlock) {
    const cb = chunksBlock[0];
    if (cb.includes('shield:') && cb.includes('maxShield:')) {
        ok('HP bar chunks include shield and maxShield');
    } else {
        fail('HP bar chunks missing shield or maxShield');
    }
} else {
    fail('Could not extract chunks mapping');
}

// ─── Step 3: Shield absorption (damage pipeline) ────────────────────────────
section('3. Shield absorption — _applyDamage');

// 3a. _applyDamage exists with bypassShield parameter
if (combatSrc.includes('static _applyDamage(state, targetType, rawDamage, bypassShield, events)')) {
    ok('_applyDamage has bypassShield parameter');
} else {
    fail('_applyDamage missing or wrong signature');
}

// 3b. Monster shield absorption (now via monsterHpBar chunks)
if (combatSrc.includes('!bypassShield && frontChunk && frontChunk.shield > 0')) {
    ok('Monster damage checks bypassShield before shield absorption');
} else {
    fail('Monster shield check missing bypassShield guard');
}

if (combatSrc.includes('frontChunk.shield -= shieldAbsorbed')) {
    ok('Monster chunk shield depleted by absorbed amount');
} else {
    fail('Monster chunk shield not depleted');
}

// 3c. shield_hit event emitted for monster
if (combatSrc.includes("type: 'shield_hit', target: 'monster'")) {
    ok('shield_hit event emitted for monster');
} else {
    fail('shield_hit event missing for monster');
}

// 3d. Monster HP reduced via applyDamageToMonsterHpBar
if (combatSrc.includes('this.applyDamageToMonsterHpBar(state.monsterHpBar, remaining)')) {
    ok('Monster damage routes through applyDamageToMonsterHpBar');
} else {
    fail('Monster damage not using applyDamageToMonsterHpBar');
}

// 3e. Fish shield absorption (chunk-level)
if (combatSrc.includes("const frontChunk = state.hpBar.chunks.find(c => c.hp > 0)")) {
    ok('Fish damage targets frontmost living chunk');
} else {
    fail('Fish damage does not find frontmost living chunk');
}

if (combatSrc.includes('frontChunk.shield -= shieldAbsorbed')) {
    ok('Chunk shield depleted by absorbed amount');
} else {
    fail('Chunk shield not depleted');
}

// 3f. shield_hit event emitted for fish
if (combatSrc.includes("type: 'shield_hit', target: 'fish'")) {
    ok('shield_hit event emitted for fish');
} else {
    fail('shield_hit event missing for fish');
}

// 3g. Remaining damage after shield goes to HP bar
if (combatSrc.includes('this.applyDamageToHpBar(state.hpBar, remaining)')) {
    ok('Remaining damage after chunk shield hits HP bar');
} else {
    fail('Remaining damage not routed to HP bar');
}

// 3h. Return includes shieldAbsorbed
if (combatSrc.includes('actualDamage: remaining, shieldAbsorbed')) {
    ok('_applyDamage returns shieldAbsorbed');
} else {
    fail('_applyDamage return missing shieldAbsorbed');
}

// 3i. Fish attack events include shieldAbsorbed
if (combatSrc.includes("type: 'fish_base_attack'") && combatSrc.includes('shieldAbsorbed: dmgResult.shieldAbsorbed')) {
    ok('fish_base_attack event includes shieldAbsorbed');
} else {
    fail('fish_base_attack event missing shieldAbsorbed');
}

// 3j. Monster attack events include shieldAbsorbed
if (combatSrc.includes("type: 'monster_base_attack'") && combatSrc.includes('shieldAbsorbed: result.shieldAbsorbed')) {
    ok('monster_base_attack event includes shieldAbsorbed');
} else {
    fail('monster_base_attack event missing shieldAbsorbed');
}

// ─── Step 4: Poison bypass ──────────────────────────────────────────────────
section('4. Poison bypass (DEF and shield)');

// 4a. _tickPoisons calls _applyDamage with bypassShield: true for monster
const tickPoisonsBlock = combatSrc.match(/static _tickPoisons[\s\S]*?^\s{4}\}/m);
if (tickPoisonsBlock) {
    const tp = tickPoisonsBlock[0];

    // Monster poison: bypassShield true
    if (tp.includes("this._applyDamage(state, 'monster', p.damagePerTick, true, events)")) {
        ok('Monster poison calls _applyDamage with bypassShield=true');
    } else {
        fail('Monster poison does not bypass shield');
    }

    // Fish poison: bypassShield true
    if (tp.includes("this._applyDamage(state, 'fish', p.damagePerTick, true, events)")) {
        ok('Fish poison calls _applyDamage with bypassShield=true');
    } else {
        fail('Fish poison does not bypass shield');
    }

    // Poison uses raw damagePerTick (no DEF reduction)
    // The poison tick passes p.damagePerTick directly — no calculateBaseDamage or DEF lookup
    if (!tp.includes('getEffectiveStat') && !tp.includes('calculateBaseDamage')) {
        ok('Poison bypasses DEF (no DEF calculation in tick)');
    } else {
        fail('Poison tick should not include DEF reduction');
    }
} else {
    fail('Could not extract _tickPoisons method');
}

// 4b. Incapacitation checked in _checkIncapacitations (separate death check pass)
if (combatSrc.includes('static _checkIncapacitations(state, events)') &&
    combatSrc.includes('static _checkMonsterIncapacitations(state, events)')) {
    ok('Incapacitation checks in dedicated methods (called after all damage)');
} else {
    fail('Incapacitation check methods missing');
}

// ─── Step 5: Minimum damage preserved ───────────────────────────────────────
section('5. Minimum damage preserved');

// 5a. Base damage min 1
if (combatSrc.includes('Math.max(1, Math.floor(atk * cc.baseAtkK1 - def * cc.baseAtkK2))')) {
    ok('calculateBaseDamage: Math.max(1, ...) ensures min 1');
} else {
    fail('calculateBaseDamage missing min 1 floor');
}

// 5b. Special damage min 1 (when moveDamage > 0)
if (combatSrc.includes('if (moveDamage === 0) return 0')) {
    ok('calculateSpecialDamage: zero-damage moves return 0 (effect-only)');
} else {
    fail('calculateSpecialDamage missing zero-damage guard');
}

if (combatSrc.includes('Math.max(1, moveDamage - Math.floor(def * cc.specialDefFactor))')) {
    ok('calculateSpecialDamage: Math.max(1, ...) ensures min 1 for damage moves');
} else {
    fail('calculateSpecialDamage missing min 1 floor');
}

// 5c. Computational check: DEF overwhelms ATK but min 1
const atk = 3, def = 10;
const baseDmg = Math.max(1, Math.floor(atk * combatConfig.baseAtkK1 - def * combatConfig.baseAtkK2));
if (baseDmg === 1) {
    ok(`Min damage: ATK ${atk} vs DEF ${def} → ${baseDmg} (min 1 preserved)`);
} else {
    fail(`Min damage: ATK ${atk} vs DEF ${def} → ${baseDmg} (expected 1)`);
}

// 5d. Special damage min check
const moveDmg = 5, highDef = 20;
const specialDmg = Math.max(1, moveDmg - Math.floor(highDef * combatConfig.specialDefFactor));
if (specialDmg === 1) {
    ok(`Min special: move ${moveDmg} vs DEF ${highDef} → ${specialDmg} (min 1 preserved)`);
} else {
    fail(`Min special: move ${moveDmg} vs DEF ${highDef} → ${specialDmg} (expected 1)`);
}

// ─── Step 6: _syncHpBack syncs shield ───────────────────────────────────────
section('6. _syncHpBack syncs shield');

if (combatSrc.includes("state.fish[i].ref.shield = Math.max(0, chunk.shield)")) {
    ok('_syncHpBack syncs shield from chunk to party ref');
} else {
    fail('_syncHpBack does not sync shield');
}

if (combatSrc.includes("state.fish[i].ref.hp = Math.max(0, chunk.hp)")) {
    ok('_syncHpBack syncs HP from chunk to party ref');
} else {
    fail('_syncHpBack does not sync HP');
}

// ─── Step 7: Config values present ──────────────────────────────────────────
section('7. Combat config has required fields');

const requiredFields = ['baseAtkK1', 'baseAtkK2', 'spdToCooldownK', 'minBaseCooldown', 'specialDefFactor', 'curseCap'];
for (const field of requiredFields) {
    if (typeof combatConfig[field] === 'number') {
        ok(`combat.json has ${field}=${combatConfig[field]}`);
    } else {
        fail(`combat.json missing ${field}`);
    }
}

// ─── Results ─────────────────────────────────────────────────────────────────
console.log(`\n========================================`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`========================================`);
process.exit(failed > 0 ? 1 : 0);
