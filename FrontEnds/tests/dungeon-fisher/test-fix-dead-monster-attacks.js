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

// Extract the monster base attack block (step 3 comment to step 4 comment)
const baseAttackBlock = combatSrc.match(
    /\/\/ 3\. Monster base attack timers[\s\S]*?(?=\/\/ 4\. Monster special)/
);

if (baseAttackBlock) {
    const ba = baseAttackBlock[0];

    // 1a. The monChunk lookup exists
    if (ba.includes('state.monsterHpBar.chunks.find(c => c.monsterIndex === m)')) {
        ok('Base attack loop looks up monster HP chunk by index');
    } else {
        fail('Base attack loop missing monChunk lookup');
    }

    // 1b. The HP <= 0 guard exists
    if (ba.includes('if (!monChunk || monChunk.hp <= 0) continue')) {
        ok('Base attack loop skips monsters with HP <= 0');
    } else {
        fail('Base attack loop missing HP <= 0 guard');
    }

    // 1c. Guard is AFTER alive check
    const aliveCheckPos = ba.indexOf('if (!mon.alive) continue');
    const hpGuardPos = ba.indexOf('if (!monChunk || monChunk.hp <= 0) continue');
    if (aliveCheckPos !== -1 && hpGuardPos !== -1 && hpGuardPos > aliveCheckPos) {
        ok('HP guard is after alive check (correct order)');
    } else {
        fail('HP guard should come after alive check');
    }

    // 1d. Guard is BEFORE attack calculations
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

// Extract the monster special move block (step 4 comment to step 5 comment)
const specialBlock = combatSrc.match(
    /\/\/ 4\. Monster special move timers[\s\S]*?(?=\/\/ 5\. Tick poisons)/
);

if (specialBlock) {
    const sp = specialBlock[0];

    // 2a. The monChunk lookup exists
    if (sp.includes('state.monsterHpBar.chunks.find(c => c.monsterIndex === m)')) {
        ok('Special move loop looks up monster HP chunk by index');
    } else {
        fail('Special move loop missing monChunk lookup');
    }

    // 2b. The HP <= 0 guard exists
    if (sp.includes('if (!monChunk || monChunk.hp <= 0) continue')) {
        ok('Special move loop skips monsters with HP <= 0');
    } else {
        fail('Special move loop missing HP <= 0 guard');
    }

    // 2c. Guard is AFTER alive check
    const aliveCheckPos = sp.indexOf('if (!mon.alive) continue');
    const hpGuardPos = sp.indexOf('if (!monChunk || monChunk.hp <= 0) continue');
    if (aliveCheckPos !== -1 && hpGuardPos !== -1 && hpGuardPos > aliveCheckPos) {
        ok('HP guard is after alive check (correct order)');
    } else {
        fail('HP guard should come after alive check');
    }

    // 2d. Guard is BEFORE special move lookup
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

// Both loops should use the exact same guard pattern
const guardPattern = 'const monChunk = state.monsterHpBar.chunks.find(c => c.monsterIndex === m);\n                if (!monChunk || monChunk.hp <= 0) continue;';
const guardCount = combatSrc.split(guardPattern).length - 1;

if (guardCount === 2) {
    ok('Exact same HP guard pattern appears in both attack loops');
} else {
    fail(`Expected 2 instances of the HP guard pattern, found ${guardCount}`);
}

// ─── Step 4: Death check ordering ────────────────────────────────────────
section('4. Death checks after DoT ticks');

// Death checks must come AFTER poison/burn ticks (so DoT kills are detected)
const updateBlock = combatSrc.match(/static update\(state, deltaMs\)[\s\S]*?return events;\s*\}/);
if (updateBlock) {
    const ub = updateBlock[0];
    const poisonTickPos = ub.indexOf('_tickPoisons');
    const burnTickPos = ub.indexOf('_tickBurns');
    const deathCheckPos = ub.indexOf('_checkIncapacitations');

    if (poisonTickPos !== -1 && deathCheckPos !== -1 && deathCheckPos > poisonTickPos) {
        ok('Death checks come after poison ticks');
    } else {
        fail('Death checks should come after poison ticks');
    }

    if (burnTickPos !== -1 && deathCheckPos !== -1 && deathCheckPos > burnTickPos) {
        ok('Death checks come after burn ticks');
    } else {
        fail('Death checks should come after burn ticks');
    }

    // Monster base/special attacks come BEFORE DoT ticks
    const baseAttackPos = ub.indexOf('monster_base_attack');
    const specialAttackPos = ub.indexOf('monster_special');
    if (baseAttackPos !== -1 && baseAttackPos < poisonTickPos) {
        ok('Monster base attacks processed before poison ticks');
    } else {
        fail('Monster base attacks should come before poison ticks');
    }

    if (specialAttackPos !== -1 && specialAttackPos < poisonTickPos) {
        ok('Monster special attacks processed before poison ticks');
    } else {
        fail('Monster special attacks should come before poison ticks');
    }
} else {
    fail('Could not extract update method');
}

// ─── Step 5: Version check ────────────────────────────────────────────────
section('5. Version check');

const versionSrc = readFile(path.join(BASE, 'version.js'));
if (versionSrc) {
    const versionMatch = versionSrc.match(/VERSION\s*=\s*'(\d+\.\d+\.\d+)'/);
    if (versionMatch) {
        const [major, minor, patch] = versionMatch[1].split('.').map(Number);
        // The fix was in 0.16.1, so version must be >= 0.16.1
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
