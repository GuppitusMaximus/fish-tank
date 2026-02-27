#!/usr/bin/env node
/**
 * QA verification for fix-dead-monster-attacks plan.
 * Validates: monsters at 0 HP (via DoT) cannot queue base or special attacks.
 * The fix adds monsterHpBar chunk HP checks before monster attack logic.
 */

const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..', '..', 'dungeon-fisher', 'src');
let passed = 0;
let failed = 0;

function ok(msg) { passed++; console.log(`  PASS: ${msg}`); }
function fail(msg) { failed++; console.error(`  FAIL: ${msg}`); }
function section(msg) { console.log(`\n--- ${msg} ---`); }

function readFile(filePath) {
    try { return fs.readFileSync(filePath, 'utf8'); }
    catch (e) { return null; }
}

const combatSrc = readFile(path.join(BASE, 'systems', 'CombatSystem.js'));
if (!combatSrc) { fail('Could not read CombatSystem.js'); process.exit(1); }

// ─── Step 1: HP guard in monster base attack loop (step 3) ────────────────
section('1. Monster base attack HP guard');

const baseAttackBlock = combatSrc.match(
    /\/\/ 3\. Monster base attack timers[\s\S]*?(?=\/\/ 4\. Monster special)/
);

if (baseAttackBlock) {
    const ba = baseAttackBlock[0];

    if (ba.includes('state.monsterHpBar.chunks.find(c => c.monsterIndex === m)')) {
        ok('Base attack loop looks up monster HP chunk by index');
    } else {
        fail('Base attack loop missing monChunk lookup');
    }

    if (ba.includes('if (!monChunk || monChunk.hp <= 0) continue')) {
        ok('Base attack loop skips monsters with HP <= 0');
    } else {
        fail('Base attack loop missing HP <= 0 guard');
    }

    const aliveCheckPos = ba.indexOf('if (!mon.alive) continue');
    const hpGuardPos = ba.indexOf('if (!monChunk || monChunk.hp <= 0) continue');
    if (aliveCheckPos !== -1 && hpGuardPos !== -1 && hpGuardPos > aliveCheckPos) {
        ok('HP guard is after alive check (correct order)');
    } else {
        fail('HP guard should come after alive check');
    }

    const attackCalcPos = ba.indexOf('getEffectiveStat(mon,');
    if (hpGuardPos !== -1 && attackCalcPos !== -1 && hpGuardPos < attackCalcPos) {
        ok('HP guard is before attack stat calculations');
    } else {
        fail('HP guard should come before attack calculations');
    }
} else {
    fail('Could not extract monster base attack block');
}

// ─── Step 2: HP guard in monster special move loop (step 4) ───────────────
section('2. Monster special move HP guard');

const specialBlock = combatSrc.match(
    /\/\/ 4\. Monster special move timers[\s\S]*?(?=\/\/ 5\. Tick poisons)/
);

if (specialBlock) {
    const sp = specialBlock[0];

    if (sp.includes('state.monsterHpBar.chunks.find(c => c.monsterIndex === m)')) {
        ok('Special move loop looks up monster HP chunk by index');
    } else {
        fail('Special move loop missing monChunk lookup');
    }

    if (sp.includes('if (!monChunk || monChunk.hp <= 0) continue')) {
        ok('Special move loop skips monsters with HP <= 0');
    } else {
        fail('Special move loop missing HP <= 0 guard');
    }

    const aliveCheckPos = sp.indexOf('if (!mon.alive) continue');
    const hpGuardPos = sp.indexOf('if (!monChunk || monChunk.hp <= 0) continue');
    if (aliveCheckPos !== -1 && hpGuardPos !== -1 && hpGuardPos > aliveCheckPos) {
        ok('HP guard is after alive check (correct order)');
    } else {
        fail('HP guard should come after alive check');
    }

    const moveLookupPos = sp.indexOf('ConfigLoader.getMove(mon.ref.specialMove)');
    if (hpGuardPos !== -1 && moveLookupPos !== -1 && hpGuardPos < moveLookupPos) {
        ok('HP guard is before special move lookup');
    } else {
        fail('HP guard should come before special move lookup');
    }
} else {
    fail('Could not extract monster special move block');
}

// ─── Step 3: Guard pattern consistency ────────────────────────────────────
section('3. Guard pattern consistency');

const guardRegex = /const monChunk = state\.monsterHpBar\.chunks\.find\(c => c\.monsterIndex === m\);\s+if \(!monChunk \|\| monChunk\.hp <= 0\) continue;/g;
const guardMatches = combatSrc.match(guardRegex);
if (guardMatches && guardMatches.length === 2) {
    ok('Identical HP guard pattern appears exactly 2 times (base + special loops)');
} else {
    fail(`Expected 2 HP guard patterns, found ${guardMatches ? guardMatches.length : 0}`);
}

// ─── Step 4: Death check ordering (DoT → death → no more attacks) ────────
section('4. Death checks after DoT ticks');

const updateBlock = combatSrc.match(/static update\(state, deltaMs\)[\s\S]*?return events;\s*\}/);
if (updateBlock) {
    const ub = updateBlock[0];
    const poisonTickPos = ub.indexOf('_tickPoisons');
    const burnTickPos = ub.indexOf('_tickBurns');
    const deathCheckPos = ub.indexOf('_checkMonsterIncapacitations');
    const baseAttackPos = ub.indexOf('monster_base_attack');
    const specialAttackPos = ub.indexOf('monster_special');

    if (deathCheckPos > poisonTickPos && deathCheckPos > burnTickPos) {
        ok('Monster incapacitation checks run AFTER poison and burn ticks');
    } else {
        fail('Monster incapacitation checks should run after DoT ticks');
    }

    if (baseAttackPos < poisonTickPos && specialAttackPos < poisonTickPos) {
        ok('Monster attacks processed before DoT ticks (correct FR-24 order)');
    } else {
        fail('Monster attacks should come before DoT ticks');
    }
} else {
    fail('Could not extract update method');
}

// _checkMonsterIncapacitations correctly marks dead monsters
const incapBlock = combatSrc.match(/static _checkMonsterIncapacitations[\s\S]*?^\s{4}\}/m);
if (incapBlock) {
    const ib = incapBlock[0];

    if (ib.includes('chunk.hp <= 0') && ib.includes('state.monsters[m].alive = false')) {
        ok('Incapacitation: chunk HP <= 0 sets alive = false');
    } else {
        fail('Incapacitation does not correctly set alive = false on HP depletion');
    }

    if (ib.includes('poisons = []') && ib.includes('burn = null') && ib.includes('curses = []')) {
        ok('DoT effects cleared on monster death');
    } else {
        fail('DoT effects not fully cleared on death');
    }

    if (ib.includes("type: 'monster_incapacitated'")) {
        ok('monster_incapacitated event emitted');
    } else {
        fail('monster_incapacitated event not emitted');
    }
} else {
    fail('Could not extract _checkMonsterIncapacitations method');
}

// ─── Step 5: getFrontMonsterIndex also respects HP ────────────────────────
section('5. getFrontMonsterIndex HP-aware');

const frontMonsterBlock = combatSrc.match(/static getFrontMonsterIndex[\s\S]*?^\s{4}\}/m);
if (frontMonsterBlock) {
    const fm = frontMonsterBlock[0];
    if (fm.includes('monsters[i].alive') && fm.includes('chunk.hp > 0')) {
        ok('getFrontMonsterIndex checks both alive AND chunk HP > 0');
    } else {
        fail('getFrontMonsterIndex missing alive or HP check');
    }
} else {
    fail('Could not extract getFrontMonsterIndex method');
}

// ─── Step 6: Multi-monster loop integrity ─────────────────────────────────
section('6. Multi-monster support');

// Both attack loops iterate ALL monsters, using continue to skip dead ones
const monsterLoopPattern = /for \(let m = 0; m < state\.monsters\.length; m\+\+\)/g;
const loopCount = combatSrc.match(monsterLoopPattern);
// There should be many loops (base attack, special, DoT ticks, death checks, etc.)
if (loopCount && loopCount.length >= 2) {
    ok(`Monster iteration loops found (${loopCount.length} total across all systems)`);
} else {
    fail('Not enough monster iteration loops found');
}

// ─── Step 7: Version bump ─────────────────────────────────────────────────
section('7. Version check');

const versionSrc = readFile(path.join(BASE, 'version.js'));
if (versionSrc) {
    const versionMatch = versionSrc.match(/VERSION\s*=\s*'(\d+\.\d+\.\d+)'/);
    if (versionMatch) {
        const [major, minor, patch] = versionMatch[1].split('.').map(Number);
        // The fix was in 0.16.1; subsequent plans bumped further
        if (major > 0 || (major === 0 && minor > 16) || (major === 0 && minor === 16 && patch >= 1)) {
            ok(`VERSION = ${versionMatch[1]} (>= 0.16.1, fix included)`);
        } else {
            fail(`VERSION = ${versionMatch[1]} (expected >= 0.16.1)`);
        }
    } else {
        fail('Could not parse VERSION string');
    }
} else {
    fail('Could not read version.js');
}

// ─── Results ──────────────────────────────────────────────────────────────
console.log(`\n========================================`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`========================================`);
process.exit(failed > 0 ? 1 : 0);
