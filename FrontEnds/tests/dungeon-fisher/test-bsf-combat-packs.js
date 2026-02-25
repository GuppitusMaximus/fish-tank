#!/usr/bin/env node
/**
 * QA verification for bsf-combat-packs plan (Phase 5a).
 * Validates: EncounterSystem zone patterns, pack generation, boss generation,
 * reward calculation, pack combat state, targeting, death handling, FloorScene routing.
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

const encounterSrc = readFile(path.join(BASE, 'systems', 'EncounterSystem.js'));
const combatSrc = readFile(path.join(BASE, 'systems', 'CombatSystem.js'));
const floorSrc = readFile(path.join(BASE, 'scenes', 'FloorScene.js'));
const battleSrc = readFile(path.join(BASE, 'scenes', 'BattleScene.js'));
const encounterCfg = readJSON(path.join(CONFIG, 'encounters.json'));

if (!encounterSrc) { fail('Could not read EncounterSystem.js'); process.exit(1); }
if (!combatSrc) { fail('Could not read CombatSystem.js'); process.exit(1); }
if (!floorSrc) { fail('Could not read FloorScene.js'); process.exit(1); }
if (!battleSrc) { fail('Could not read BattleScene.js'); process.exit(1); }
if (!encounterCfg) { fail('Could not read encounters.json'); process.exit(1); }

// ─── Step 1: EncounterSystem zone pattern ────────────────────────────────────
section('1. EncounterSystem zone pattern');

// 1a. zonePattern config correctness
const zp = encounterCfg.zonePattern;
if (zp.length === 10) {
    ok(`zonePattern has ${zp.length} entries (one per floor-in-zone)`);
} else {
    fail(`zonePattern has ${zp.length} entries (expected 10)`);
}

// 1b. Pack floors: 1,2,4,5,7,8 (indices 0,1,3,4,6,7)
const packIndices = [0, 1, 3, 4, 6, 7];
const packCorrect = packIndices.every(i => zp[i] === 'pack');
if (packCorrect) {
    ok('Floors 1,2,4,5,7,8 → pack');
} else {
    fail(`Pack floors incorrect: ${packIndices.map(i => `idx${i}=${zp[i]}`).join(', ')}`);
}

// 1c. Boss floors: 3,6,9 (indices 2,5,8)
const bossIndices = [2, 5, 8];
const bossCorrect = bossIndices.every(i => zp[i] === 'boss');
if (bossCorrect) {
    ok('Floors 3,6,9 → boss');
} else {
    fail(`Boss floors incorrect: ${bossIndices.map(i => `idx${i}=${zp[i]}`).join(', ')}`);
}

// 1d. PVP floor: 10 (index 9)
if (zp[9] === 'pvp') {
    ok('Floor 10 → pvp');
} else {
    fail(`Floor 10 type: ${zp[9]} (expected pvp)`);
}

// 1e. getEncounterType uses modular floor indexing
if (encounterSrc.includes('(floor - 1) % config.floorsPerZone')) {
    ok('getEncounterType uses (floor-1) % floorsPerZone');
} else {
    fail('getEncounterType does not use modular floor indexing');
}

// 1f. floorsPerZone = 10
if (encounterCfg.floorsPerZone === 10) {
    ok(`floorsPerZone = ${encounterCfg.floorsPerZone}`);
} else {
    fail(`floorsPerZone = ${encounterCfg.floorsPerZone} (expected 10)`);
}

// 1g. Transitions config: boss → ["shop", "camp"]
const bossTransitions = encounterCfg.transitions.boss;
if (Array.isArray(bossTransitions) && bossTransitions[0] === 'shop' && bossTransitions[1] === 'camp') {
    ok('Boss transitions: ["shop", "camp"]');
} else {
    fail(`Boss transitions: ${JSON.stringify(bossTransitions)} (expected ["shop","camp"])`);
}

// 1h. Transitions config: pack_pair → "camp"
if (encounterCfg.transitions.pack_pair === 'camp') {
    ok('Pack pair transition: "camp"');
} else {
    fail(`Pack pair transition: ${encounterCfg.transitions.pack_pair} (expected "camp")`);
}

// 1i. getTransitions checks idx % 3 === 1 for camp between pack pairs
if (encounterSrc.includes("idx % 3 === 1")) {
    ok('getTransitions uses idx % 3 === 1 for pack pair camp');
} else {
    fail('getTransitions missing idx % 3 === 1 check');
}

// 1j. getZoneNumber computes correctly
if (encounterSrc.includes('Math.ceil(floor / config.floorsPerZone)')) {
    ok('getZoneNumber = Math.ceil(floor / floorsPerZone)');
} else {
    fail('getZoneNumber formula missing');
}

// 1k. getFloorInZone computes correctly
if (encounterSrc.includes('((floor - 1) % config.floorsPerZone) + 1')) {
    ok('getFloorInZone = ((floor-1) % floorsPerZone) + 1');
} else {
    fail('getFloorInZone formula missing');
}

// 1l. Computational: zone/floor computations for key floors
const testCases = [
    { floor: 1, zone: 1, inZone: 1 },
    { floor: 10, zone: 1, inZone: 10 },
    { floor: 11, zone: 2, inZone: 1 },
    { floor: 30, zone: 3, inZone: 10 },
    { floor: 100, zone: 10, inZone: 10 }
];
for (const tc of testCases) {
    const zone = Math.ceil(tc.floor / 10);
    const inZone = ((tc.floor - 1) % 10) + 1;
    if (zone === tc.zone && inZone === tc.inZone) {
        ok(`Floor ${tc.floor} → zone ${zone}, floorInZone ${inZone}`);
    } else {
        fail(`Floor ${tc.floor}: zone=${zone} inZone=${inZone} (expected zone=${tc.zone} inZone=${tc.inZone})`);
    }
}

// ─── Step 2: Pack generation ─────────────────────────────────────────────────
section('2. Pack generation');

// 2a. Pack size range
if (encounterCfg.packSize.min === 1 && encounterCfg.packSize.max === 3) {
    ok(`Pack size: ${encounterCfg.packSize.min}-${encounterCfg.packSize.max}`);
} else {
    fail(`Pack size: ${encounterCfg.packSize.min}-${encounterCfg.packSize.max} (expected 1-3)`);
}

// 2b. Pack stat multipliers
const psm = encounterCfg.packStatMultiplier;
if (psm['1'] === 1.0 && psm['2'] === 0.75 && psm['3'] === 0.6) {
    ok(`Pack multipliers: 1→${psm['1']}, 2→${psm['2']}, 3→${psm['3']}`);
} else {
    fail(`Pack multipliers wrong: ${JSON.stringify(psm)}`);
}

// 2c. generatePack filters by floorRange
if (encounterSrc.includes('floor >= m.floorRange[0] && floor <= m.floorRange[1]')) {
    ok('generatePack filters monsters by floorRange');
} else {
    fail('generatePack does not filter by floorRange');
}

// 2d. generatePack uses pack size from config
if (encounterSrc.includes('config.packSize.max - config.packSize.min + 1')) {
    ok('generatePack random size from config.packSize range');
} else {
    fail('generatePack does not use config.packSize');
}

// 2e. Pack multiplier applied to core stats (hp, atk, def, spd, shield)
const createMonsterBlock = encounterSrc.match(/static _createMonster[\s\S]*?^\s{4}\}/m);
if (createMonsterBlock) {
    const cm = createMonsterBlock[0];
    const statsWithMult = ['hp', 'atk', 'def', 'spd'];
    for (const stat of statsWithMult) {
        if (cm.includes(`s.${stat}.perFloor) * statMultiplier`)) {
            ok(`_createMonster: ${stat} has statMultiplier applied`);
        } else {
            fail(`_createMonster: ${stat} missing statMultiplier`);
        }
    }

    // Shield multiplier
    if (cm.includes('s.shield.perFloor) * statMultiplier')) {
        ok('_createMonster: shield has statMultiplier applied');
    } else {
        fail('_createMonster: shield missing statMultiplier');
    }

    // healPower multiplier (BUG CHECK: spec says multiplier should apply)
    if (cm.includes('s.healPower.perFloor) * statMultiplier')) {
        ok('_createMonster: healPower has statMultiplier applied');
    } else {
        fail('_createMonster: healPower MISSING statMultiplier (BUG: spec requires it)');
    }
} else {
    fail('Could not extract _createMonster method');
}

// ─── Step 3: Boss generation ─────────────────────────────────────────────────
section('3. Boss generation');

// 3a. Boss stat multipliers from config
const bm = encounterCfg.bossStatMultiplier;
if (bm.hp === 2.0 && bm.atk === 1.5 && bm.def === 1.3 && bm.spd === 1.0) {
    ok(`Boss multipliers: HP=${bm.hp}x ATK=${bm.atk}x DEF=${bm.def}x SPD=${bm.spd}x`);
} else {
    fail(`Boss multipliers wrong: ${JSON.stringify(bm)}`);
}

// 3b. generateBoss returns single monster
if (encounterSrc.includes('return this._createBossMonster(')) {
    ok('generateBoss returns single boss monster');
} else {
    fail('generateBoss return missing');
}

// 3c. _createBossMonster applies boss multipliers
const bossBlock = encounterSrc.match(/static _createBossMonster[\s\S]*?^\s{4}\}/m);
if (bossBlock) {
    const bb = bossBlock[0];
    if (bb.includes('s.hp.perFloor) * bm.hp') &&
        bb.includes('s.atk.perFloor) * bm.atk') &&
        bb.includes('s.def.perFloor) * bm.def') &&
        bb.includes('s.spd.perFloor) * bm.spd')) {
        ok('_createBossMonster applies per-stat boss multipliers');
    } else {
        fail('_createBossMonster missing some boss multipliers');
    }
} else {
    fail('Could not extract _createBossMonster method');
}

// ─── Step 4: Reward calculation ──────────────────────────────────────────────
section('4. Reward calculation');

// 4a. Reward multipliers in config
const rm = encounterCfg.rewardMultiplier;
if (rm.pack1.xp === 1.0 && rm.pack1.gold === 1.0) {
    ok(`pack1 reward mult: xp=${rm.pack1.xp}, gold=${rm.pack1.gold}`);
} else {
    fail(`pack1 reward mult wrong: ${JSON.stringify(rm.pack1)}`);
}

if (rm.pack2.xp === 1.3 && rm.pack2.gold === 1.3) {
    ok(`pack2 reward mult: xp=${rm.pack2.xp}, gold=${rm.pack2.gold}`);
} else {
    fail(`pack2 reward mult wrong: ${JSON.stringify(rm.pack2)}`);
}

if (rm.pack3.xp === 1.5 && rm.pack3.gold === 1.5) {
    ok(`pack3 reward mult: xp=${rm.pack3.xp}, gold=${rm.pack3.gold}`);
} else {
    fail(`pack3 reward mult wrong: ${JSON.stringify(rm.pack3)}`);
}

if (rm.boss.xp === 2.0 && rm.boss.gold === 2.0) {
    ok(`boss reward mult: xp=${rm.boss.xp}, gold=${rm.boss.gold}`);
} else {
    fail(`boss reward mult wrong: ${JSON.stringify(rm.boss)}`);
}

if (rm.pvp.xp === 2.5 && rm.pvp.gold === 2.5) {
    ok(`pvp reward mult: xp=${rm.pvp.xp}, gold=${rm.pvp.gold}`);
} else {
    fail(`pvp reward mult wrong: ${JSON.stringify(rm.pvp)}`);
}

// 4b. calculateRewards constructs key from encounterType + packSize
if (encounterSrc.includes("key = 'pack' + packSize")) {
    ok('calculateRewards builds pack key from encounterType + packSize');
} else {
    fail('calculateRewards key construction missing');
}

// 4c. Multiplier lookup
if (encounterSrc.includes('config.rewardMultiplier[key]')) {
    ok('calculateRewards looks up multiplier from config');
} else {
    fail('calculateRewards missing multiplier lookup');
}

// ─── Step 5: Pack combat state ───────────────────────────────────────────────
section('5. Pack combat state');

// 5a. state.monsters is an array
if (combatSrc.includes('monsters: monsterCombatants')) {
    ok('state.monsters is array (monsterCombatants)');
} else {
    fail('state.monsters not set to array');
}

// 5b. monsterHpBar has chunks per monster
if (combatSrc.includes('monsterHpBar:') && combatSrc.includes('chunks: monsterChunks')) {
    ok('state.monsterHpBar has chunks per monster');
} else {
    fail('monsterHpBar missing chunks');
}

// 5c. Each monster has independent timers
const monsterMapBlock = combatSrc.match(/const monsterCombatants = monsters\.map[\s\S]*?\}\)\)/);
if (monsterMapBlock) {
    const mm = monsterMapBlock[0];
    const fields = ['baseTimer: 0', 'specialTimer: 0', 'healPulseTimer: 0', 'alive: true'];
    for (const f of fields) {
        if (mm.includes(f)) {
            ok(`Monster combatant has ${f}`);
        } else {
            fail(`Monster combatant missing ${f}`);
        }
    }
} else {
    fail('Could not extract monster combatants mapping');
}

// 5d. getFrontMonsterIndex returns first living monster
if (combatSrc.includes('static getFrontMonsterIndex(state)')) {
    ok('getFrontMonsterIndex method exists');
} else {
    fail('getFrontMonsterIndex missing');
}

if (combatSrc.includes("state.monsters[i].alive") &&
    combatSrc.match(/getFrontMonsterIndex[\s\S]*?chunk\.hp > 0/)) {
    ok('getFrontMonsterIndex checks alive + chunk.hp > 0');
} else {
    fail('getFrontMonsterIndex logic incomplete');
}

// ─── Step 6: Pack targeting ──────────────────────────────────────────────────
section('6. Pack targeting');

// 6a. Fish attack frontmost living monster
if (combatSrc.includes('const frontM = this.getFrontMonsterIndex(state)')) {
    ok('Fish attacks target getFrontMonsterIndex');
} else {
    fail('Fish attacks not targeting front monster');
}

// 6b. All monsters attack frontmost living fish
if (combatSrc.includes('const targetIdx = this.getFrontFishIndex(state)') ||
    combatSrc.includes('const frontFishIdx = this.getFrontFishIndex(state)')) {
    ok('Monster attacks target getFrontFishIndex');
} else {
    fail('Monster attacks not targeting front fish');
}

// 6c. Poison applied to frontmost only
if (encounterSrc.includes('getFrontMonsterIndex') || combatSrc.includes("const frontM = this.getFrontMonsterIndex(state)")) {
    // Check poison targeting in _applyEffect
    const poisonBlock = combatSrc.match(/_applyEffect[\s\S]*?poison[\s\S]*?getFrontMonsterIndex/);
    if (poisonBlock) {
        ok('Poison targets frontmost monster only');
    } else {
        fail('Poison targeting not using getFrontMonsterIndex');
    }
} else {
    fail('Cannot verify poison targeting');
}

// 6d. Burn AoE targets all living monsters
const burnBlock = combatSrc.match(/static _applyBurn[\s\S]*?^\s{4}\}/m);
if (burnBlock && burnBlock[0].includes('for (let m = 0; m < state.monsters.length; m++)')) {
    ok('Burn iterates all monsters (AoE)');
} else {
    fail('Burn not applied to all monsters');
}

// 6e. Heal pulse heals all living monsters
const healPulseBlock = combatSrc.match(/static _applyHealPulse[\s\S]*?^\s{4}\}/m);
if (healPulseBlock && healPulseBlock[0].includes('for (let m = 0; m < state.monsters.length; m++)')) {
    ok('Heal pulse iterates all monsters');
} else {
    fail('Heal pulse not applied to all monsters');
}

// 6f. Effects cleared on death
if (combatSrc.includes("state.monsters[m].poisons = []") &&
    combatSrc.includes("state.monsters[m].burn = null") &&
    combatSrc.includes("state.monsters[m].curses = []")) {
    ok('Monster death clears poisons, burn, curses');
} else {
    fail('Monster death does not clear all effects');
}

// ─── Step 7: Pack death handling ─────────────────────────────────────────────
section('7. Pack death handling');

// 7a. Individual monster_incapacitated events
if (combatSrc.includes("type: 'monster_incapacitated', monsterIndex: m")) {
    ok('monster_incapacitated event emitted per monster');
} else {
    fail('monster_incapacitated event missing');
}

// 7b. alive=false set on incapacitation
if (combatSrc.includes('state.monsters[m].alive = false')) {
    ok('Monster alive=false on incapacitation');
} else {
    fail('Monster alive not set to false');
}

// 7c. Battle ends when ALL monster chunks depleted
if (combatSrc.includes("state.monsterHpBar.chunks.every(c => c.hp <= 0)")) {
    ok('Battle end: all monsterHpBar chunks hp <= 0');
} else {
    fail('Battle end condition missing');
}

// 7d. monsters_dead event (not singular monster_dead)
if (combatSrc.includes("type: 'monsters_dead'")) {
    ok("Battle end event: 'monsters_dead' (plural)");
} else {
    fail("Battle end event should be 'monsters_dead'");
}

// ─── Step 8: FloorScene uses EncounterSystem ─────────────────────────────────
section('8. FloorScene uses EncounterSystem');

// 8a. No generateMonster import
if (!floorSrc.includes('generateMonster')) {
    ok('FloorScene does not import generateMonster');
} else {
    fail('FloorScene still imports generateMonster');
}

// 8b. Imports EncounterSystem
if (floorSrc.includes("import EncounterSystem from '../systems/EncounterSystem.js'")) {
    ok('FloorScene imports EncounterSystem');
} else {
    fail('FloorScene missing EncounterSystem import');
}

// 8c. _startEncounter uses getEncounterType
if (floorSrc.includes('EncounterSystem.getEncounterType(gs.floor)')) {
    ok('_startEncounter calls getEncounterType');
} else {
    fail('_startEncounter not using getEncounterType');
}

// 8d. Boss → generateBoss, pack → generatePack
if (floorSrc.includes('EncounterSystem.generateBoss(gs.floor)') &&
    floorSrc.includes('EncounterSystem.generatePack(gs.floor)')) {
    ok('FloorScene uses generateBoss for boss, generatePack for pack');
} else {
    fail('FloorScene not using correct generation methods');
}

// 8e. Monsters passed as array to BattleScene
if (floorSrc.includes('monsters = [EncounterSystem.generateBoss(gs.floor)]') &&
    floorSrc.includes('monsters = EncounterSystem.generatePack(gs.floor)')) {
    ok('Boss wrapped in array, pack already array for BattleScene');
} else {
    fail('Monster array passing to BattleScene incorrect');
}

// 8f. Transition processing uses EncounterSystem
if (floorSrc.includes('EncounterSystem.getFloorInZone(gs.floor)') &&
    floorSrc.includes('EncounterSystem.getTransitions(floorInZone)')) {
    ok('FloorScene uses EncounterSystem for transition lookup');
} else {
    fail('FloorScene not using EncounterSystem for transitions');
}

// 8g. BattleScene uses EncounterSystem for rewards
if (battleSrc.includes('EncounterSystem.calculateRewards(')) {
    ok('BattleScene calculates rewards via EncounterSystem');
} else {
    fail('BattleScene not using EncounterSystem for rewards');
}

// 8h. BattleScene accepts monsters array
if (battleSrc.includes('this.monsters = data.monsters')) {
    ok('BattleScene stores monsters array from data');
} else {
    fail('BattleScene not storing monsters array');
}

// 8i. BattleScene creates combat state with monsters array
if (battleSrc.includes('CombatSystem.createCombatState(this.gameState.party, this.monsters, this.gameState.floor)')) {
    ok('BattleScene passes monsters array to createCombatState');
} else {
    fail('BattleScene not passing monsters array to createCombatState');
}

// ─── Results ─────────────────────────────────────────────────────────────────
console.log(`\n========================================`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`========================================`);
process.exit(failed > 0 ? 1 : 0);
