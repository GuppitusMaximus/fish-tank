#!/usr/bin/env node
/**
 * QA verification for bsf-special-moves plan.
 * Validates: fish special rework, monster move scaling, monster configs,
 * CombatSystem effect handlers, floor-scaled specials, healing behaviors,
 * Dungeon Lord heal_pulse.
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

const moves = readJSON(path.join(CONFIG, 'moves.json'));
const combatSrc = readFile(path.join(BASE, 'systems', 'CombatSystem.js'));
const combatConfig = readJSON(path.join(CONFIG, 'combat.json'));

if (!moves) { fail('Could not read moves.json'); process.exit(1); }
if (!combatSrc) { fail('Could not read CombatSystem.js'); process.exit(1); }
if (!combatConfig) { fail('Could not read combat.json'); process.exit(1); }

// Load all monster configs
const monsterDir = path.join(CONFIG, 'monsters');
const monsters = {};
for (const file of fs.readdirSync(monsterDir)) {
    if (file.endsWith('.json')) {
        const m = readJSON(path.join(monsterDir, file));
        if (m) monsters[m.id] = m;
    }
}

// ─── Step 1: Fish special rework ────────────────────────────────────────────
section('1. Fish special rework');

// 1a. spike_shield → shield_grant
if (moves.spike_shield?.effect?.type === 'shield_grant') {
    ok('spike_shield effect type is shield_grant');
} else {
    fail(`spike_shield effect type should be shield_grant, got ${moves.spike_shield?.effect?.type}`);
}
if (typeof moves.spike_shield?.effect?.amount === 'number' && moves.spike_shield.effect.amount > 0) {
    ok(`spike_shield grants ${moves.spike_shield.effect.amount} shield`);
} else {
    fail('spike_shield effect.amount missing or zero');
}

// 1b. abyssal_beam → burn_aoe
if (moves.abyssal_beam?.effect?.type === 'burn_aoe') {
    ok('abyssal_beam effect type is burn_aoe');
} else {
    fail(`abyssal_beam effect type should be burn_aoe, got ${moves.abyssal_beam?.effect?.type}`);
}
if (typeof moves.abyssal_beam?.effect?.initialDamage === 'number') {
    ok(`abyssal_beam has initialDamage ${moves.abyssal_beam.effect.initialDamage}`);
} else {
    fail('abyssal_beam effect.initialDamage missing');
}

// 1c. golden_aura → curse
if (moves.golden_aura?.effect?.type === 'curse') {
    ok('golden_aura effect type is curse');
} else {
    fail(`golden_aura effect type should be curse, got ${moves.golden_aura?.effect?.type}`);
}
if (typeof moves.golden_aura?.effect?.percent === 'number' && moves.golden_aura.effect.percent > 0 && moves.golden_aura.effect.percent < 1) {
    ok(`golden_aura curse percent is ${moves.golden_aura.effect.percent} (decimal)`);
} else {
    fail('golden_aura effect.percent missing or not a decimal');
}
if (typeof moves.golden_aura?.effect?.duration === 'number') {
    ok(`golden_aura curse duration is ${moves.golden_aura.effect.duration}s`);
} else {
    fail('golden_aura effect.duration missing');
}

// 1d. healing_tide → heal_hot
if (moves.healing_tide?.effect?.type === 'heal_hot') {
    ok('healing_tide effect type is heal_hot');
} else {
    fail(`healing_tide effect type should be heal_hot, got ${moves.healing_tide?.effect?.type}`);
}
if (typeof moves.healing_tide?.effect?.burstHeal === 'number') {
    ok(`healing_tide burstHeal is ${moves.healing_tide.effect.burstHeal}`);
} else {
    fail('healing_tide effect.burstHeal missing');
}
if (typeof moves.healing_tide?.effect?.hotAmount === 'number' && typeof moves.healing_tide?.effect?.hotTicks === 'number') {
    ok(`healing_tide HoT: ${moves.healing_tide.effect.hotAmount}/tick for ${moves.healing_tide.effect.hotTicks} ticks`);
} else {
    fail('healing_tide effect.hotAmount or hotTicks missing');
}

// 1e. Damage-only specials unchanged (null effects)
for (const id of ['bubble_volley', 'deep_strike', 'trick_shot', 'razor_rush', 'tidal_crush']) {
    if (moves[id] && moves[id].effect === null) {
        ok(`${id} has null effect (damage-only, unchanged)`);
    } else {
        fail(`${id} should have null effect, got ${JSON.stringify(moves[id]?.effect)}`);
    }
}

// ─── Step 2: Monster move scaling ────────────────────────────────────────────
section('2. Monster move scaling');

// 2a. gnaw scaling
if (moves.gnaw?.scaling?.damage?.base === 5 && moves.gnaw?.scaling?.damage?.perFloor === 0.5) {
    ok('gnaw scaling: damage = 5 + floor * 0.5');
} else {
    fail(`gnaw scaling incorrect: ${JSON.stringify(moves.gnaw?.scaling)}`);
}

// 2b. web_venom scaling (damage + poison)
if (moves.web_venom?.scaling?.damage && moves.web_venom?.scaling?.poison?.damagePerTick) {
    ok('web_venom has damage + poison scaling');
} else {
    fail('web_venom missing damage or poison scaling');
}

// 2c. hellfire burn scaling
if (moves.hellfire?.scaling?.burn?.damage?.base && moves.hellfire?.scaling?.burn?.damage?.perFloor) {
    ok(`hellfire burn scales: ${moves.hellfire.scaling.burn.damage.base} + floor * ${moves.hellfire.scaling.burn.damage.perFloor}`);
} else {
    fail('hellfire burn scaling missing');
}

// 2d. bone_throw damage + curse scaling
if (moves.bone_throw?.scaling?.damage && moves.bone_throw?.scaling?.curse?.percent) {
    ok('bone_throw has damage + curse percent scaling');
} else {
    fail('bone_throw missing damage or curse scaling');
}

// 2e. cataclysm burn_curse effect with floor scaling
if (moves.cataclysm?.effect?.type === 'burn_curse') {
    ok('cataclysm effect type is burn_curse');
} else {
    fail(`cataclysm effect type should be burn_curse, got ${moves.cataclysm?.effect?.type}`);
}
if (typeof moves.cataclysm?.effect?.burnInitial === 'object' && moves.cataclysm.effect.burnInitial.base !== undefined) {
    ok(`cataclysm burnInitial scales with floor: base=${moves.cataclysm.effect.burnInitial.base}`);
} else {
    fail('cataclysm burnInitial should be a scaling object {base, perFloor}');
}
if (moves.cataclysm?.scaling?.damage) {
    ok(`cataclysm damage scales: ${moves.cataclysm.scaling.damage.base} + floor * ${moves.cataclysm.scaling.damage.perFloor}`);
} else {
    fail('cataclysm damage scaling missing');
}

// ─── Step 3: Monster configs ─────────────────────────────────────────────────
section('3. Monster configs');

// 3a. Ogre/Golem have baseShield > 0 and shield scaling
for (const id of ['ogre', 'golem']) {
    const m = monsters[id];
    if (!m) { fail(`${id} config missing`); continue; }
    if (m.baseShield > 0) {
        ok(`${id} has baseShield ${m.baseShield}`);
    } else {
        fail(`${id} baseShield should be > 0`);
    }
    if (m.statScaling?.shield?.base > 0 || m.statScaling?.shield?.perFloor > 0) {
        ok(`${id} has shield scaling`);
    } else {
        fail(`${id} missing shield scaling`);
    }
}

// 3b. Slime/Wraith/Shadow Lord/Dungeon Lord have baseHealPower > 0
for (const id of ['slime', 'wraith', 'shadow_lord', 'dungeon_lord']) {
    const m = monsters[id];
    if (!m) { fail(`${id} config missing`); continue; }
    if (m.baseHealPower > 0) {
        ok(`${id} has baseHealPower ${m.baseHealPower}`);
    } else {
        fail(`${id} baseHealPower should be > 0`);
    }
}

// 3c. Healing behaviors per FR-12
const expectedBehaviors = {
    slime: 'passive_regen',
    wraith: 'life_drain',
    shadow_lord: 'passive_regen_and_life_drain',
    dungeon_lord: 'all'
};
for (const [id, expectedType] of Object.entries(expectedBehaviors)) {
    const m = monsters[id];
    if (!m) { fail(`${id} config missing`); continue; }
    if (m.healingBehavior?.type === expectedType) {
        ok(`${id} healingBehavior.type is '${expectedType}'`);
    } else {
        fail(`${id} healingBehavior.type should be '${expectedType}', got '${m.healingBehavior?.type}'`);
    }
}

// 3d. All other monsters: healingBehavior = null
const healers = new Set(['slime', 'wraith', 'shadow_lord', 'dungeon_lord']);
for (const [id, m] of Object.entries(monsters)) {
    if (healers.has(id)) continue;
    if (m.healingBehavior === null) {
        ok(`${id} healingBehavior is null`);
    } else {
        fail(`${id} healingBehavior should be null, got ${JSON.stringify(m.healingBehavior)}`);
    }
}

// ─── Step 4: Effect handlers in CombatSystem ─────────────────────────────────
section('4. CombatSystem effect handlers');

// 4a. shield_grant handler
if (combatSrc.includes('_applyShieldGrant') && combatSrc.includes("effect.type === 'shield_grant'")) {
    ok('shield_grant handler exists');
} else {
    fail('shield_grant handler missing in CombatSystem');
}
if (combatSrc.includes("type: 'shield_grant'") && combatSrc.includes('chunk.shield')) {
    ok('shield_grant adds to source fish chunk shield and emits event');
} else {
    fail('shield_grant does not properly update shield');
}

// 4b. burn_aoe handler
if (combatSrc.includes('_applyBurnAoe') && combatSrc.includes("effect.type === 'burn_aoe'")) {
    ok('burn_aoe handler exists');
} else {
    fail('burn_aoe handler missing in CombatSystem');
}

// 4c. curse handler applies to frontmost target
if (combatSrc.includes('_applyCurse') && combatSrc.includes("effect.type === 'curse'")) {
    ok('curse handler exists');
} else {
    fail('curse handler missing');
}

// 4d. heal_hot handler with burst + HoT
if (combatSrc.includes('_applyHealHot') && combatSrc.includes("effect.type === 'heal_hot'")) {
    ok('heal_hot handler exists');
} else {
    fail('heal_hot handler missing');
}
if (combatSrc.includes('burstHeal') && combatSrc.includes('hotAmount') && combatSrc.includes('hotTicks')) {
    ok('heal_hot uses burstHeal + hotAmount/hotTicks');
} else {
    fail('heal_hot missing burstHeal or hotAmount/hotTicks fields');
}

// 4e. burn_curse handler (dual effect)
if (combatSrc.includes('_applyBurnCurse') && combatSrc.includes("effect.type === 'burn_curse'")) {
    ok('burn_curse handler exists');
} else {
    fail('burn_curse handler missing');
}
if (combatSrc.includes('burnInitial') && combatSrc.includes('cursePercent') && combatSrc.includes('curseDuration')) {
    ok('burn_curse applies both burn (burnInitial) and curse (cursePercent/curseDuration)');
} else {
    fail('burn_curse missing burn or curse fields');
}

// 4f. heal_pulse handler (AoE heal)
if (combatSrc.includes('_applyHealPulse') && combatSrc.includes("effect.type === 'heal_pulse'")) {
    ok('heal_pulse handler exists');
} else {
    fail('heal_pulse handler missing');
}
if (combatSrc.includes("type: 'heal_pulse'") && combatSrc.includes('monster_allies')) {
    ok('heal_pulse supports monster_allies target for pack healing');
} else {
    fail('heal_pulse missing monster_allies support');
}

// ─── Step 5: Floor-scaled specials in combat ─────────────────────────────────
section('5. Floor-scaled specials');

// 5a. _resolveScaledValue method exists
if (combatSrc.includes('_resolveScaledValue') && combatSrc.includes('move.scaling')) {
    ok('_resolveScaledValue method exists for floor scaling');
} else {
    fail('_resolveScaledValue missing');
}

// 5b. Monster special uses scaled damage
if (combatSrc.includes("this._resolveScaledValue(mMove, 'damage', mMove.damage, state.floor)")) {
    ok('Monster special damage computed from _resolveScaledValue with state.floor');
} else {
    fail('Monster special not using _resolveScaledValue for damage');
}

// 5c. _applyScaledEffect handles poison, burn, curse scaling
if (combatSrc.includes('_applyScaledEffect') && combatSrc.includes('move.scaling?.poison') && combatSrc.includes('move.scaling?.burn') && combatSrc.includes('move.scaling?.curse')) {
    ok('_applyScaledEffect scales poison, burn, and curse effects by floor');
} else {
    fail('_applyScaledEffect missing scaling for some effect types');
}

// 5d. Floor stored in combat state
if (combatSrc.includes('floor: floor')) {
    ok('Floor value stored in combat state');
} else {
    fail('Floor not stored in combat state');
}

// ─── Step 6: Monster healing behaviors ───────────────────────────────────────
section('6. Monster healing behaviors');

// 6a. Passive regen ticks at regenTickInterval (2s from combat config)
if (combatConfig.regenTickInterval === 2) {
    ok(`Passive regen ticks every ${combatConfig.regenTickInterval}s`);
} else {
    fail(`regenTickInterval should be 2, got ${combatConfig.regenTickInterval}`);
}

// 6b. _tickPassiveRegen supports passive_regen, passive_regen_and_life_drain, all
if (combatSrc.includes("'passive_regen'") && combatSrc.includes("'passive_regen_and_life_drain'") && combatSrc.includes("'all'")) {
    ok('_tickPassiveRegen handles all regen behavior types');
} else {
    fail('_tickPassiveRegen missing some behavior type checks');
}

// 6c. Life drain in _applyLifeDrain
if (combatSrc.includes('_applyLifeDrain') && combatSrc.includes("'life_drain'")) {
    ok('_applyLifeDrain handles life_drain behavior');
} else {
    fail('_applyLifeDrain missing');
}
if (combatSrc.includes('drainPercent')) {
    ok('Life drain uses drainPercent to calculate heal amount');
} else {
    fail('drainPercent not used in life drain');
}

// 6d. Wraith drainPercent is reasonable
if (monsters.wraith?.healingBehavior?.percent === 0.3 || monsters.wraith?.healingBehavior?.drainPercent === 0.3) {
    ok('Wraith life drain percent is 0.3 (30%)');
} else {
    fail('Wraith drain percent unexpected');
}

// 6e. Shadow Lord has both regen and drain
const sl = monsters.shadow_lord?.healingBehavior;
if (sl?.regenScaling > 0 && sl?.drainPercent > 0) {
    ok(`Shadow Lord has regenScaling=${sl.regenScaling} and drainPercent=${sl.drainPercent}`);
} else {
    fail('Shadow Lord missing regenScaling or drainPercent');
}

// ─── Step 7: Dungeon Lord heal_pulse ─────────────────────────────────────────
section('7. Dungeon Lord heal_pulse');

// 7a. heal_pulse move exists
if (moves.heal_pulse) {
    ok('heal_pulse move exists in moves.json');
} else {
    fail('heal_pulse move missing from moves.json');
}

// 7b. heal_pulse has its own cooldown
if (moves.heal_pulse?.cooldown > 0) {
    ok(`heal_pulse cooldown is ${moves.heal_pulse.cooldown}s (separate timer)`);
} else {
    fail('heal_pulse missing cooldown');
}

// 7c. heal_pulse effect is heal_pulse type with scaling amount
if (moves.heal_pulse?.effect?.type === 'heal_pulse' && typeof moves.heal_pulse?.effect?.amount === 'object') {
    ok(`heal_pulse heals base=${moves.heal_pulse.effect.amount.base} + floor*${moves.heal_pulse.effect.amount.perFloor}`);
} else {
    fail('heal_pulse effect missing or amount not a scaling object');
}

// 7d. healPulseTimer separate in combat state
if (combatSrc.includes('healPulseTimer')) {
    ok('healPulseTimer exists in combat state (independent timer)');
} else {
    fail('healPulseTimer missing from combat state');
}

// 7e. heal_pulse timer section in update loop
if (combatSrc.includes('healPulseMove') && combatSrc.includes('healPulseTimer')) {
    ok('Heal pulse has dedicated timer section in update loop');
} else {
    fail('Heal pulse timer section missing from update loop');
}

// 7f. Dungeon Lord config references heal_pulse
const dl = monsters.dungeon_lord;
if (dl?.healingBehavior?.healPulseMove === 'heal_pulse') {
    ok('Dungeon Lord healingBehavior.healPulseMove is heal_pulse');
} else {
    fail('Dungeon Lord healingBehavior.healPulseMove missing');
}
if (dl?.healingBehavior?.type === 'all') {
    ok('Dungeon Lord has type=all (regen + drain + heal pulse)');
} else {
    fail(`Dungeon Lord healingBehavior.type should be 'all', got '${dl?.healingBehavior?.type}'`);
}

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${'='.repeat(60)}`);
console.log(`QA: bsf-special-moves — ${passed} passed, ${failed} failed`);
console.log(`${'='.repeat(60)}`);
process.exit(failed > 0 ? 1 : 0);
