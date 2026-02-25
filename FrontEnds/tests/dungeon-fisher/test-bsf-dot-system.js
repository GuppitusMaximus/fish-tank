#!/usr/bin/env node
/**
 * QA verification for bsf-dot-system plan.
 * Validates: poison stacking, burn (decay/AoE/non-stack), curse (stack/cap),
 * HoT (scaling/clear-on-death), FR-24 update loop order, new events.
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
const partySrc = readFile(path.join(BASE, 'systems', 'PartySystem.js'));
const combatConfig = readJSON(path.join(CONFIG, 'combat.json'));

if (!combatSrc) { fail('Could not read CombatSystem.js'); process.exit(1); }
if (!partySrc) { fail('Could not read PartySystem.js'); process.exit(1); }
if (!combatConfig) { fail('Could not read combat.json'); process.exit(1); }

// ─── Step 1: Poison stacking ────────────────────────────────────────────────
section('1. Poison stacking');

// 1a. poisons[] array initialized in combat state
if (combatSrc.includes('poisons: []')) {
    ok('poisons[] array initialized in combat state');
} else {
    fail('poisons[] array not initialized');
}

// 1b. _applyEffect pushes new stack to poisons[]
const poisonEffectBlock = combatSrc.match(/if \(effect\.type === 'poison'\)[\s\S]*?else if/);
if (poisonEffectBlock) {
    const pe = poisonEffectBlock[0];
    if (pe.includes('.poisons.push(stack)')) {
        ok('New poison push()ed to poisons[] (stacking, not replaced)');
    } else {
        fail('Poison not pushed to poisons[] array');
    }
    // 1c. Stack object has correct fields
    if (pe.includes('damagePerTick:') && pe.includes('ticksLeft:') && pe.includes('interval:') && pe.includes('timer: 0')) {
        ok('Poison stack has damagePerTick, ticksLeft, interval, timer');
    } else {
        fail('Poison stack missing required fields');
    }
} else {
    fail('Could not extract poison effect handling block');
}

// 1d. _tickPoisons iterates stacks independently
const tickPoisonsBlock = combatSrc.match(/static _tickPoisons[\s\S]*?^    \}/m);
if (tickPoisonsBlock) {
    const tp = tickPoisonsBlock[0];

    // Multiple stacks: iterates poisons array in reverse for safe splice
    if (tp.includes('state.monster.poisons.length - 1; s >= 0; s--')) {
        ok('Monster poisons iterated in reverse (safe splice pattern)');
    } else {
        fail('Monster poisons not iterated safely');
    }

    if (tp.includes('f.poisons.length - 1; s >= 0; s--')) {
        ok('Fish poisons iterated in reverse (safe splice pattern)');
    } else {
        fail('Fish poisons not iterated safely');
    }

    // 1e. Expired stacks removed
    if (tp.includes('state.monster.poisons.splice(s, 1)') && tp.includes('f.poisons.splice(s, 1)')) {
        ok('Expired poison stacks spliced from arrays');
    } else {
        fail('Expired poison stacks not removed');
    }

    // 1f. Poison bypasses shield (bypassShield = true)
    if (tp.includes("this._applyDamage(state, 'monster', p.damagePerTick, true, events)")) {
        ok('Monster poison bypasses shield (bypassShield=true)');
    } else {
        fail('Monster poison does not bypass shield');
    }

    if (tp.includes("this._applyDamage(state, 'fish', p.damagePerTick, true, events)")) {
        ok('Fish poison bypasses shield (bypassShield=true)');
    } else {
        fail('Fish poison does not bypass shield');
    }

    // 1g. Poison bypasses DEF (no DEF calculation in tick)
    if (!tp.includes('getEffectiveStat') && !tp.includes('calculateBaseDamage')) {
        ok('Poison bypasses DEF (no DEF lookup in _tickPoisons)');
    } else {
        fail('Poison tick includes DEF reduction — should bypass');
    }

    // 1h. Legacy poisoned getter kept in sync
    if (tp.includes('state.monster.poisoned = state.monster.poisons.length > 0 ? state.monster.poisons[0] : null')) {
        ok('Legacy monster.poisoned kept in sync');
    } else {
        fail('Legacy monster.poisoned not synced');
    }

    if (tp.includes('f.poisoned = f.poisons.length > 0 ? f.poisons[0] : null')) {
        ok('Legacy fish.poisoned kept in sync');
    } else {
        fail('Legacy fish.poisoned not synced');
    }

    // 1i. poison_tick event emitted
    if (tp.includes("type: 'poison_tick'")) {
        ok('poison_tick event emitted');
    } else {
        fail('poison_tick event not emitted');
    }
} else {
    fail('Could not extract _tickPoisons method');
}

// 1j. poison_applied event emitted
if (combatSrc.includes("type: 'poison_applied'")) {
    ok('poison_applied event emitted');
} else {
    fail('poison_applied event not emitted');
}

// ─── Step 2: Burn effect ─────────────────────────────────────────────────────
section('2. Burn effect');

// 2a. _applyBurn exists
if (combatSrc.includes('static _applyBurn(state, effect, target, sourceIndex, events)')) {
    ok('_applyBurn method exists');
} else {
    fail('_applyBurn method missing');
}

// 2b. Non-stacking: higher damage wins
const applyBurnBlock = combatSrc.match(/static _applyBurn[\s\S]*?^    \}/m);
if (applyBurnBlock) {
    const ab = applyBurnBlock[0];

    // Monster burn: higher replaces
    if (ab.includes('!state.monster.burn || initialDamage > state.monster.burn.damage')) {
        ok('Monster burn: non-stacking, higher damage replaces');
    } else {
        fail('Monster burn replacement logic incorrect');
    }

    // Fish burn: higher replaces
    if (ab.includes('!state.fish[i].burn || dmg > state.fish[i].burn.damage')) {
        ok('Fish burn: non-stacking, higher damage replaces');
    } else {
        fail('Fish burn replacement logic incorrect');
    }

    // 2c. AoE: front full value, back at burnAoePercent
    if (ab.includes('(i === frontIdx) ? initialDamage : Math.floor(initialDamage * cc.burnAoePercent)')) {
        ok('Burn AoE: front full, back at burnAoePercent');
    } else {
        fail('Burn AoE spread not implemented correctly');
    }

    // 2d. burn_applied event
    if (ab.includes("type: 'burn_applied'")) {
        ok('burn_applied event emitted');
    } else {
        fail('burn_applied event not emitted');
    }
} else {
    fail('Could not extract _applyBurn method');
}

// 2e. Config: burnAoePercent = 0.5
if (combatConfig.burnAoePercent === 0.5) {
    ok(`burnAoePercent = ${combatConfig.burnAoePercent} (50%)`);
} else {
    fail(`burnAoePercent = ${combatConfig.burnAoePercent} (expected 0.5)`);
}

// 2f. _tickBurns: 1-second ticks with decaying damage
const tickBurnsBlock = combatSrc.match(/static _tickBurns[\s\S]*?^    \}/m);
if (tickBurnsBlock) {
    const tb = tickBurnsBlock[0];

    // 1-second tick interval
    if (tb.includes('burn.timer >= 1')) {
        ok('Burn ticks every 1 second');
    } else {
        fail('Burn tick interval not 1 second');
    }

    // Damage goes through pipeline (bypassShield = false)
    if (tb.includes("this._applyDamage(state, 'monster', Math.floor(state.monster.burn.damage), false, events)")) {
        ok('Monster burn routes through damage pipeline (shield → HP)');
    } else {
        fail('Monster burn does not route through damage pipeline');
    }

    if (tb.includes("this._applyDamage(state, 'fish', Math.floor(f.burn.damage), false, events)")) {
        ok('Fish burn routes through damage pipeline (shield → HP)');
    } else {
        fail('Fish burn does not route through damage pipeline');
    }

    // Decay per second
    if (tb.includes('state.monster.burn.damage -= cc.burnDecayPerSecond') && tb.includes('f.burn.damage -= cc.burnDecayPerSecond')) {
        ok('Burn damage decays by burnDecayPerSecond each tick');
    } else {
        fail('Burn decay not applied correctly');
    }

    // Expires when damage <= 0
    if (tb.includes('state.monster.burn.damage <= 0') && tb.includes('f.burn.damage <= 0')) {
        ok('Burn expires when damage decays to 0');
    } else {
        fail('Burn expiration condition incorrect');
    }

    // burn_tick event
    if (tb.includes("type: 'burn_tick'")) {
        ok('burn_tick event emitted');
    } else {
        fail('burn_tick event not emitted');
    }

    // burn_expired event
    if (tb.includes("type: 'burn_expired'")) {
        ok('burn_expired event emitted');
    } else {
        fail('burn_expired event not emitted');
    }
} else {
    fail('Could not extract _tickBurns method');
}

// 2g. Config: burnDecayPerSecond
if (combatConfig.burnDecayPerSecond === 1) {
    ok(`burnDecayPerSecond = ${combatConfig.burnDecayPerSecond}`);
} else {
    fail(`burnDecayPerSecond = ${combatConfig.burnDecayPerSecond} (expected 1)`);
}

// 2h. Computational check: burn 10 damage, decays 10→9→8→...→1→0 (10 ticks)
const burnInitial = 10;
let burnDmg = burnInitial;
let burnTicks = 0;
while (burnDmg > 0) {
    burnTicks++;
    burnDmg -= combatConfig.burnDecayPerSecond;
}
if (burnTicks === 10) {
    ok(`Burn 10 damage lasts ${burnTicks} ticks (10, 9, 8, ..., 1, expired)`);
} else {
    fail(`Burn 10 damage should last 10 ticks, got ${burnTicks}`);
}

// ─── Step 3: Curse effect ────────────────────────────────────────────────────
section('3. Curse effect');

// 3a. _applyCurse exists
if (combatSrc.includes('static _applyCurse(state, effect, target, sourceIndex, events)')) {
    ok('_applyCurse method exists');
} else {
    fail('_applyCurse method missing');
}

// 3b. Curse pushed to curses[] (stacking)
const applyCurseBlock = combatSrc.match(/static _applyCurse[\s\S]*?^    \}/m);
if (applyCurseBlock) {
    const ac = applyCurseBlock[0];

    if (ac.includes('state.monster.curses.push(curse)')) {
        ok('Monster curse pushed to curses[] array (stacking)');
    } else {
        fail('Monster curse not pushed to array');
    }

    if (ac.includes('.curses.push(curse)')) {
        ok('Fish curse pushed to curses[] array');
    } else {
        fail('Fish curse not pushed to array');
    }

    // 3c. Frontmost fish only
    if (ac.includes('this.getFrontFishIndex(state)')) {
        ok('Curse targets frontmost fish');
    } else {
        fail('Curse does not target frontmost fish');
    }

    // 3d. Curse has percent and duration
    if (ac.includes('percent: effect.percent') && ac.includes('remaining: effect.duration')) {
        ok('Curse object has percent and remaining (duration)');
    } else {
        fail('Curse object missing percent or duration');
    }

    // 3e. curse_applied event
    if (ac.includes("type: 'curse_applied'")) {
        ok('curse_applied event emitted');
    } else {
        fail('curse_applied event not emitted');
    }
} else {
    fail('Could not extract _applyCurse method');
}

// 3f. Curses stack additively and cap in getEffectiveStat
const getEffStatBlock = combatSrc.match(/static getEffectiveStat[\s\S]*?^    \}/m);
if (getEffStatBlock) {
    const gs = getEffStatBlock[0];

    if (gs.includes('totalCursePercent += curse.percent')) {
        ok('Curses stack additively (sum percentages)');
    } else {
        fail('Curses do not stack additively');
    }

    if (gs.includes('Math.min(totalCursePercent, cc.curseCap)')) {
        ok('Curse total capped at curseCap');
    } else {
        fail('Curse cap not applied');
    }

    if (gs.includes('value *= (1 - totalCursePercent)')) {
        ok('Stat reduced by curse percentage');
    } else {
        fail('Stat not reduced by curse');
    }
} else {
    fail('Could not extract getEffectiveStat method');
}

// 3g. curseCap in config = 0.5
if (combatConfig.curseCap === 0.5) {
    ok(`curseCap = ${combatConfig.curseCap} (50%)`);
} else {
    fail(`curseCap = ${combatConfig.curseCap} (expected 0.5)`);
}

// 3h. _tickCurses expires by duration
const tickCursesBlock = combatSrc.match(/static _tickCurses[\s\S]*?^    \}/m);
if (tickCursesBlock) {
    const tc = tickCursesBlock[0];

    if (tc.includes('.remaining -= dt')) {
        ok('Curse remaining decremented by dt');
    } else {
        fail('Curse remaining not decremented');
    }

    if (tc.includes('.remaining <= 0')) {
        ok('Curse expires when remaining <= 0');
    } else {
        fail('Curse expiration condition missing');
    }

    if (tc.includes("type: 'curse_expired'")) {
        ok('curse_expired event emitted');
    } else {
        fail('curse_expired event not emitted');
    }
} else {
    fail('Could not extract _tickCurses method');
}

// 3i. No direct damage from curses
if (!combatSrc.match(/_applyCurse[\s\S]*?_applyDamage/m) || combatSrc.match(/static _applyCurse[\s\S]*?^    \}/m)[0].indexOf('_applyDamage') === -1) {
    ok('Curses do not apply direct damage');
} else {
    fail('Curses should not apply direct damage');
}

// 3j. Computational check: two 30% curses cap at 50%
const twoC = Math.min(0.30 + 0.30, combatConfig.curseCap);
if (twoC === 0.5) {
    ok(`Two 30% curses → ${0.30 + 0.30} capped to ${twoC}`);
} else {
    fail(`Curse cap check: expected 0.5, got ${twoC}`);
}

// ─── Step 4: HoT effect ─────────────────────────────────────────────────────
section('4. HoT effect');

// 4a. _applyHoT exists
if (combatSrc.includes('static _applyHoT(state, effect, sourceIndex, events)')) {
    ok('_applyHoT method exists');
} else {
    fail('_applyHoT method missing');
}

// 4b. Scales with caster healPower
const applyHoTBlock = combatSrc.match(/static _applyHoT[\s\S]*?^    \}/m);
if (applyHoTBlock) {
    const ah = applyHoTBlock[0];

    if (ah.includes('caster.ref.healPower')) {
        ok('HoT reads caster healPower');
    } else {
        fail('HoT does not read caster healPower');
    }

    if (ah.includes('effect.baseHealAmount * (1 + healPower')) {
        ok('HoT scales: baseHealAmount * (1 + healPower * scalingFactor)');
    } else {
        fail('HoT scaling formula incorrect');
    }

    // 4c. Applied to frontmost fish
    if (ah.includes('this.getFrontFishIndex(state)')) {
        ok('HoT applied to frontmost living fish');
    } else {
        fail('HoT not applied to frontmost fish');
    }

    // 4d. Multiple HoTs stack (push to array)
    if (ah.includes('.hots.push(')) {
        ok('HoTs push to array (multiple stack independently)');
    } else {
        fail('HoTs not pushed to array');
    }

    // 4e. hot_applied event
    if (ah.includes("type: 'hot_applied'")) {
        ok('hot_applied event emitted');
    } else {
        fail('hot_applied event not emitted');
    }
} else {
    fail('Could not extract _applyHoT method');
}

// 4f. _tickHoTs: heals frontmost chunk
const tickHoTsBlock = combatSrc.match(/static _tickHoTs[\s\S]*?^    \}/m);
if (tickHoTsBlock) {
    const th = tickHoTsBlock[0];

    // Tick interval from config
    if (th.includes('cc.hotTickInterval')) {
        ok('HoT uses hotTickInterval from combat config');
    } else {
        fail('HoT does not use hotTickInterval');
    }

    // Heals chunk HP (capped at maxHp)
    if (th.includes('Math.min(chunk.maxHp, chunk.hp + h.amount)')) {
        ok('HoT heals chunk HP, capped at maxHp');
    } else {
        fail('HoT heal capping incorrect');
    }

    // Updates total HP
    if (th.includes('state.hpBar.total += healed')) {
        ok('HoT updates hpBar.total');
    } else {
        fail('HoT does not update hpBar.total');
    }

    // Cleared on incapacitated fish
    if (th.includes('!f.alive') && th.includes('f.hots.length = 0')) {
        ok('HoTs cleared on incapacitated fish');
    } else {
        fail('HoTs not cleared on incapacitated fish');
    }

    // Expired HoTs removed
    if (th.includes('f.hots.splice(s, 1)')) {
        ok('Expired HoTs spliced from array');
    } else {
        fail('Expired HoTs not removed');
    }

    // hot_tick event
    if (th.includes("type: 'hot_tick'")) {
        ok('hot_tick event emitted');
    } else {
        fail('hot_tick event not emitted');
    }
} else {
    fail('Could not extract _tickHoTs method');
}

// 4g. Config: hotTickInterval = 1
if (combatConfig.hotTickInterval === 1) {
    ok(`hotTickInterval = ${combatConfig.hotTickInterval} (1 second)`);
} else {
    fail(`hotTickInterval = ${combatConfig.hotTickInterval} (expected 1)`);
}

// ─── Step 5: FR-24 update loop order ─────────────────────────────────────────
section('5. FR-24 update loop order');

// Extract the update method and verify tick order by position
const updateBlock = combatSrc.match(/static update\(state, deltaMs\)[\s\S]*return events;\s*\}/);
if (updateBlock) {
    const ub = updateBlock[0];

    // Find positions of each phase in the update loop
    const phases = [
        { label: 'fish base attacks', pattern: 'fish_base_attack' },
        { label: 'fish specials', pattern: 'fish_special' },
        { label: 'monster base attack', pattern: 'monster_base_attack' },
        { label: 'monster special', pattern: 'monster_special' },
        { label: 'tick poisons', pattern: '_tickPoisons' },
        { label: 'tick burns', pattern: '_tickBurns' },
        { label: 'tick HoTs', pattern: '_tickHoTs' },
        { label: 'tick passive regen', pattern: '_tickPassiveRegen' },
        { label: 'tick buffs', pattern: '_tickBuffs' },
        { label: 'tick curses', pattern: '_tickCurses' },
        { label: 'death checks', pattern: '_checkIncapacitations' }
    ];

    const positions = phases.map(p => ({
        label: p.label,
        pos: ub.indexOf(p.pattern)
    }));

    let orderCorrect = true;
    for (let i = 1; i < positions.length; i++) {
        if (positions[i].pos === -1) {
            fail(`Missing phase: ${positions[i].label}`);
            orderCorrect = false;
        } else if (positions[i].pos <= positions[i - 1].pos) {
            fail(`Order violation: "${positions[i].label}" should come after "${positions[i - 1].label}"`);
            orderCorrect = false;
        }
    }

    if (orderCorrect) {
        ok('FR-24 tick order correct: attacks → specials → poisons → burns → HoTs → regen → buffs/curses → death checks');
    }

    // Death checks are LAST (after all DoTs and buffs)
    const deathPos = ub.indexOf('_checkIncapacitations');
    const lastTickPos = Math.max(ub.indexOf('_tickCurses'), ub.indexOf('_tickBuffs'));
    if (deathPos > lastTickPos) {
        ok('Death checks are LAST (after all ticks)');
    } else {
        fail('Death checks not last');
    }

    // No interleaved death checks within the main loop
    const beforeDeathBlock = ub.substring(0, deathPos);
    if (!beforeDeathBlock.includes('_checkIncapacitations')) {
        ok('No interleaved death checks before final pass');
    } else {
        fail('Found premature _checkIncapacitations call');
    }

    // Simultaneous death: player wins
    if (ub.includes('monsterDead') && ub.includes('partyDead')) {
        const monsterDeadPos = ub.indexOf('if (monsterDead)');
        const partyDeadPos = ub.indexOf('if (partyDead)');
        if (monsterDeadPos < partyDeadPos) {
            ok('Simultaneous death: monster checked first (player wins)');
        } else {
            fail('Simultaneous death order wrong — monster should be checked first');
        }
    } else {
        fail('Missing monsterDead/partyDead end-of-battle checks');
    }
} else {
    fail('Could not extract update method');
}

// ─── Step 6: New events emitted ──────────────────────────────────────────────
section('6. New events emitted');

const requiredEvents = [
    'burn_tick', 'burn_applied', 'burn_expired',
    'curse_applied', 'curse_expired',
    'hot_applied', 'hot_tick',
    'regen_tick', 'shield_hit'
];

for (const evt of requiredEvents) {
    if (combatSrc.includes(`type: '${evt}'`)) {
        ok(`Event '${evt}' emitted`);
    } else {
        fail(`Event '${evt}' NOT found in CombatSystem.js`);
    }
}

// ─── Step 7: PartySystem integration ─────────────────────────────────────────
section('7. PartySystem integration');

// 7a. createFish includes new DoT fields
const fishFields = ['burn: null', 'curses: []', 'hots: []', 'poisons: []'];
for (const field of fishFields) {
    if (partySrc.includes(field)) {
        ok(`createFish initializes ${field}`);
    } else {
        fail(`createFish missing ${field}`);
    }
}

// 7b. fullHeal clears all effect types
const fullHealBlock = partySrc.match(/static fullHeal[\s\S]*?^    \}/m);
if (fullHealBlock) {
    const fh = fullHealBlock[0];
    const clearFields = ['burn = null', 'curses = []', 'hots = []', 'poisons = []', 'poisoned = null', 'buffs = []'];
    for (const field of clearFields) {
        if (fh.includes(field)) {
            ok(`fullHeal clears ${field}`);
        } else {
            fail(`fullHeal does not clear ${field}`);
        }
    }
} else {
    fail('Could not extract fullHeal method');
}

// 7c. clearCombatState clears all effect types
const clearBlock = partySrc.match(/static clearCombatState[\s\S]*?^    \}/m);
if (clearBlock) {
    const cb = clearBlock[0];
    const clearFields = ['burn = null', 'curses = []', 'hots = []', 'poisons = []'];
    for (const field of clearFields) {
        if (cb.includes(field)) {
            ok(`clearCombatState clears ${field}`);
        } else {
            fail(`clearCombatState does not clear ${field}`);
        }
    }
} else {
    fail('Could not extract clearCombatState method');
}

// 7d. revive clears all effect types
const reviveBlock = partySrc.match(/static revive[\s\S]*?^    \}/m);
if (reviveBlock) {
    const rv = reviveBlock[0];
    const clearFields = ['burn = null', 'curses = []', 'hots = []', 'poisons = []'];
    for (const field of clearFields) {
        if (rv.includes(field)) {
            ok(`revive clears ${field}`);
        } else {
            fail(`revive does not clear ${field}`);
        }
    }
} else {
    fail('Could not extract revive method');
}

// ─── Step 8: Combat config completeness ──────────────────────────────────────
section('8. Combat config completeness');

const dotConfigFields = {
    curseCap: 0.5,
    burnAoePercent: 0.5,
    burnDecayPerSecond: 1,
    regenTickInterval: 2,
    hotTickInterval: 1
};

for (const [field, expected] of Object.entries(dotConfigFields)) {
    if (combatConfig[field] === expected) {
        ok(`combat.json ${field} = ${combatConfig[field]}`);
    } else {
        fail(`combat.json ${field} = ${combatConfig[field]} (expected ${expected})`);
    }
}

// ─── Results ─────────────────────────────────────────────────────────────────
console.log(`\n========================================`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`========================================`);
process.exit(failed > 0 ? 1 : 0);
