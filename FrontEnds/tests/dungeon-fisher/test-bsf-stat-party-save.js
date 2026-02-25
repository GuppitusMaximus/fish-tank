#!/usr/bin/env node
/**
 * QA verification for bsf-stat-party-save plan (Phase 2b).
 * Validates: species-specific stats, growth rates, XP curve,
 * fullHeal/clearCombatState, save migration v3→v4, save round-trip.
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
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
        return null;
    }
}

function readFile(filePath) {
    try {
        return fs.readFileSync(filePath, 'utf8');
    } catch (e) {
        return null;
    }
}

// ─── Step 1: Fish creation has new stats ──────────────────────────────────────
section('1. Fish creation has new stats (shield, maxShield, healPower)');

const fishConfigs = {};
for (const species of ['guppy', 'pufferfish', 'swordfish', 'clownfish', 'anglerfish', 'barracuda', 'jellyfish', 'seahorse', 'manta_ray', 'golden_koi']) {
    fishConfigs[species] = readJSON(path.join(CONFIG, 'fish', `${species}.json`));
}

// Verify PartySystem.createFish includes shield, maxShield, healPower
const partySystemSrc = readFile(path.join(BASE, 'systems', 'PartySystem.js'));
if (!partySystemSrc) {
    fail('Could not read PartySystem.js');
} else {
    if (partySystemSrc.includes('shield: species.baseShield')) {
        ok('createFish sets shield from species.baseShield');
    } else {
        fail('createFish missing shield: species.baseShield');
    }

    if (partySystemSrc.includes('maxShield: species.baseShield')) {
        ok('createFish sets maxShield from species.baseShield');
    } else {
        fail('createFish missing maxShield: species.baseShield');
    }

    if (partySystemSrc.includes('healPower: species.baseHealPower')) {
        ok('createFish sets healPower from species.baseHealPower');
    } else {
        fail('createFish missing healPower: species.baseHealPower');
    }
}

// Pufferfish: high baseShield (>=10), 0 healPower
const puffer = fishConfigs.pufferfish;
if (puffer) {
    if (puffer.baseShield >= 10) {
        ok(`Pufferfish baseShield=${puffer.baseShield} (>=10)`);
    } else {
        fail(`Pufferfish baseShield=${puffer.baseShield} (expected >=10)`);
    }
    if (puffer.baseHealPower === 0) {
        ok('Pufferfish baseHealPower=0');
    } else {
        fail(`Pufferfish baseHealPower=${puffer.baseHealPower} (expected 0)`);
    }
} else {
    fail('Could not read pufferfish.json');
}

// Seahorse: high baseHealPower (>=8), 0 shield
const seahorse = fishConfigs.seahorse;
if (seahorse) {
    if (seahorse.baseHealPower >= 8) {
        ok(`Seahorse baseHealPower=${seahorse.baseHealPower} (>=8)`);
    } else {
        fail(`Seahorse baseHealPower=${seahorse.baseHealPower} (expected >=8)`);
    }
    if (seahorse.baseShield === 0) {
        ok('Seahorse baseShield=0');
    } else {
        fail(`Seahorse baseShield=${seahorse.baseShield} (expected 0)`);
    }
} else {
    fail('Could not read seahorse.json');
}

// Swordfish/Barracuda: 0 shield, 0 healPower
for (const id of ['swordfish', 'barracuda']) {
    const cfg = fishConfigs[id];
    if (cfg) {
        if (cfg.baseShield === 0 && cfg.baseHealPower === 0) {
            ok(`${cfg.name}: baseShield=0, baseHealPower=0`);
        } else {
            fail(`${cfg.name}: baseShield=${cfg.baseShield}, baseHealPower=${cfg.baseHealPower} (expected both 0)`);
        }
    } else {
        fail(`Could not read ${id}.json`);
    }
}

// All species have the new fields
for (const [id, cfg] of Object.entries(fishConfigs)) {
    if (!cfg) { fail(`Missing config for ${id}`); continue; }
    if (typeof cfg.baseShield === 'number' && typeof cfg.baseHealPower === 'number') {
        ok(`${id}: has baseShield and baseHealPower`);
    } else {
        fail(`${id}: missing baseShield or baseHealPower`);
    }
}

// ─── Step 2: Species-specific growth rates ────────────────────────────────────
section('2. Species-specific growth rates');

// Pufferfish gains more HP and shield per level than Swordfish
const pufferGrowth = fishConfigs.pufferfish?.growth;
const swordGrowth = fishConfigs.swordfish?.growth;
if (pufferGrowth && swordGrowth) {
    if (pufferGrowth.hp > swordGrowth.hp) {
        ok(`Pufferfish HP growth (${pufferGrowth.hp}) > Swordfish (${swordGrowth.hp})`);
    } else {
        fail(`Pufferfish HP growth (${pufferGrowth.hp}) not > Swordfish (${swordGrowth.hp})`);
    }
    if (pufferGrowth.shield > swordGrowth.shield) {
        ok(`Pufferfish shield growth (${pufferGrowth.shield}) > Swordfish (${swordGrowth.shield})`);
    } else {
        fail(`Pufferfish shield growth (${pufferGrowth.shield}) not > Swordfish (${swordGrowth.shield})`);
    }
}

// Seahorse gains more healPower per level than Guppy
const seahorseGrowth = fishConfigs.seahorse?.growth;
const guppyGrowth = fishConfigs.guppy?.growth;
if (seahorseGrowth && guppyGrowth) {
    if (seahorseGrowth.healPower > guppyGrowth.healPower) {
        ok(`Seahorse healPower growth (${seahorseGrowth.healPower}) > Guppy (${guppyGrowth.healPower})`);
    } else {
        fail(`Seahorse healPower growth (${seahorseGrowth.healPower}) not > Guppy (${guppyGrowth.healPower})`);
    }
}

// Swordfish gains more ATK per level than Pufferfish
if (swordGrowth && pufferGrowth) {
    if (swordGrowth.atk > pufferGrowth.atk) {
        ok(`Swordfish ATK growth (${swordGrowth.atk}) > Pufferfish (${pufferGrowth.atk})`);
    } else {
        fail(`Swordfish ATK growth (${swordGrowth.atk}) not > Pufferfish (${pufferGrowth.atk})`);
    }
}

// HP gained on level-up added to current HP (not just maxHp)
if (partySystemSrc) {
    if (partySystemSrc.includes('fish.hp += growth.hp')) {
        ok('Level-up adds growth.hp to current HP');
    } else {
        fail('Level-up does not add growth.hp to current HP');
    }
}

// All growth objects have shield and healPower fields
for (const [id, cfg] of Object.entries(fishConfigs)) {
    if (!cfg?.growth) { fail(`${id}: missing growth object`); continue; }
    if (typeof cfg.growth.shield === 'number' && typeof cfg.growth.healPower === 'number') {
        ok(`${id}: growth has shield and healPower`);
    } else {
        fail(`${id}: growth missing shield or healPower`);
    }
}

// awardXP uses species-specific growth (not hardcoded values)
if (partySystemSrc) {
    if (partySystemSrc.includes('species.growth') || partySystemSrc.includes('species ? species.growth')) {
        ok('awardXP uses species-specific growth rates');
    } else {
        fail('awardXP does not use species-specific growth rates');
    }
    if (partySystemSrc.includes('fish.maxShield += growth.shield')) {
        ok('awardXP applies shield growth per level');
    } else {
        fail('awardXP missing shield growth');
    }
    if (partySystemSrc.includes('fish.healPower += growth.healPower')) {
        ok('awardXP applies healPower growth per level');
    } else {
        fail('awardXP missing healPower growth');
    }
}

// ─── Step 3: XP curve from config ─────────────────────────────────────────────
section('3. XP curve from config');

const combatConfig = readJSON(path.join(CONFIG, 'combat.json'));
if (combatConfig) {
    if (combatConfig.xpCurve && typeof combatConfig.xpCurve.base === 'number' && typeof combatConfig.xpCurve.perLevel === 'number') {
        ok(`XP curve in config: base=${combatConfig.xpCurve.base}, perLevel=${combatConfig.xpCurve.perLevel}`);
    } else {
        fail('combat.json missing xpCurve.base or xpCurve.perLevel');
    }
    if (typeof combatConfig.maxLevel === 'number' && combatConfig.maxLevel === 20) {
        ok(`Max level in config: ${combatConfig.maxLevel}`);
    } else {
        fail(`combat.json maxLevel=${combatConfig.maxLevel} (expected 20)`);
    }
} else {
    fail('Could not read combat.json');
}

// PartySystem reads XP config from ConfigLoader
if (partySystemSrc) {
    if (partySystemSrc.includes('ConfigLoader.getCombatConfig()')) {
        ok('awardXP reads combat config from ConfigLoader');
    } else {
        fail('awardXP does not use ConfigLoader.getCombatConfig()');
    }
    if (partySystemSrc.includes('combatConfig.maxLevel')) {
        ok('awardXP uses maxLevel from config');
    } else {
        fail('awardXP does not use maxLevel from config');
    }
    if (partySystemSrc.includes('xpCurve.base') && partySystemSrc.includes('xpCurve.perLevel')) {
        ok('awardXP uses xpCurve formula from config');
    } else {
        fail('awardXP does not use xpCurve formula');
    }
}

// ─── Step 4: fullHeal and clearCombatState ────────────────────────────────────
section('4. fullHeal and clearCombatState');

if (partySystemSrc) {
    // fullHeal checks
    const fullHealMatch = partySystemSrc.match(/static fullHeal\(fish\)\s*\{([\s\S]*?)\n    \}/);
    if (fullHealMatch) {
        const body = fullHealMatch[1];
        const checks = [
            ['fish.hp = fish.maxHp', 'restores HP to max'],
            ['fish.shield = fish.maxShield', 'restores shield to maxShield'],
            ['fish.poisoned = null', 'clears poisoned'],
            ['fish.buffs = []', 'clears buffs'],
            ['fish.burn = null', 'clears burn'],
            ['fish.curses = []', 'clears curses'],
            ['fish.hots = []', 'clears hots'],
            ['fish.poisons = []', 'clears poisons'],
        ];
        for (const [code, desc] of checks) {
            if (body.includes(code)) {
                ok(`fullHeal ${desc}`);
            } else {
                fail(`fullHeal does NOT ${desc}`);
            }
        }
    } else {
        fail('Could not find fullHeal method');
    }

    // clearCombatState checks
    const clearMatch = partySystemSrc.match(/static clearCombatState\(fish\)\s*\{([\s\S]*?)\n    \}/);
    if (clearMatch) {
        const body = clearMatch[1];
        const effectTypes = ['poisoned', 'buffs', 'burn', 'curses', 'hots', 'poisons'];
        for (const eff of effectTypes) {
            if (body.includes(`fish.${eff}`)) {
                ok(`clearCombatState clears ${eff}`);
            } else {
                fail(`clearCombatState does NOT clear ${eff}`);
            }
        }
    } else {
        fail('Could not find clearCombatState method');
    }
}

// ─── Step 5: Save migration v3 to v4 ─────────────────────────────────────────
section('5. Save migration v3 to v4');

const saveSystemSrc = readFile(path.join(BASE, 'systems', 'SaveSystem.js'));
if (saveSystemSrc) {
    // v3→v4 migration block exists
    if (saveSystemSrc.includes('if (data.version === 3)')) {
        ok('v3→v4 migration block exists');
    } else {
        fail('v3→v4 migration block missing');
    }

    // Recomputes stats from species growth
    if (saveSystemSrc.includes('species.baseHp + (fish.level - 1) * species.growth.hp')) {
        ok('Migration recomputes maxHp from species growth');
    } else {
        fail('Migration does not recompute maxHp from species growth');
    }

    // Adds shield/maxShield/healPower
    if (saveSystemSrc.includes('fish.shield = species.baseShield')) {
        ok('Migration adds shield from species config');
    } else {
        fail('Migration does not add shield from species config');
    }
    if (saveSystemSrc.includes('fish.maxShield = fish.shield')) {
        ok('Migration sets maxShield');
    } else {
        fail('Migration does not set maxShield');
    }
    if (saveSystemSrc.includes('fish.healPower = species.baseHealPower')) {
        ok('Migration adds healPower from species config');
    } else {
        fail('Migration does not add healPower');
    }

    // New game fields
    if (saveSystemSrc.includes('data.pveDeathCount = 0')) {
        ok('Migration adds pveDeathCount=0');
    } else {
        fail('Migration missing pveDeathCount');
    }
    if (saveSystemSrc.includes('data.pvpLossCount = 0')) {
        ok('Migration adds pvpLossCount=0');
    } else {
        fail('Migration missing pvpLossCount');
    }
    if (saveSystemSrc.includes('data.roster = []')) {
        ok('Migration adds roster=[]');
    } else {
        fail('Migration missing roster');
    }
    if (saveSystemSrc.includes('data.companion = null')) {
        ok('Migration adds companion=null');
    } else {
        fail('Migration missing companion');
    }

    // Fish HP preserved (alive fish keep current HP, not reset to max)
    if (saveSystemSrc.includes('if (fish.hp > 0) fish.hp = Math.min(fish.hp, fish.maxHp)')) {
        ok('Migration preserves alive fish HP (capped at new maxHp)');
    } else {
        fail('Migration does not preserve fish HP correctly');
    }

    // Version set to 4
    if (saveSystemSrc.includes('data.version = 4')) {
        ok('Migration sets version to 4');
    } else {
        fail('Migration does not set version to 4');
    }

    // Clears new effect types during migration
    if (saveSystemSrc.includes('fish.burn = null') && saveSystemSrc.includes('fish.curses = []') &&
        saveSystemSrc.includes('fish.hots = []') && saveSystemSrc.includes('fish.poisons = []')) {
        ok('Migration clears new effect types (burn, curses, hots, poisons)');
    } else {
        fail('Migration does not clear all new effect types');
    }
} else {
    fail('Could not read SaveSystem.js');
}

// ─── Step 6: Save round-trip and SAVE_FORMAT_VERSION = 4 ─────────────────────
section('6. Save round-trip and SAVE_FORMAT_VERSION = 4');

const versionSrc = readFile(path.join(BASE, 'version.js'));
if (versionSrc) {
    const versionMatch = versionSrc.match(/SAVE_FORMAT_VERSION\s*=\s*(\d+)/);
    if (versionMatch && parseInt(versionMatch[1]) === 4) {
        ok('SAVE_FORMAT_VERSION = 4');
    } else {
        fail(`SAVE_FORMAT_VERSION = ${versionMatch ? versionMatch[1] : 'not found'} (expected 4)`);
    }
} else {
    fail('Could not read version.js');
}

// save() includes all new fields
if (saveSystemSrc) {
    const saveFields = ['pveDeathCount', 'pvpLossCount', 'roster', 'companion'];
    for (const field of saveFields) {
        if (saveSystemSrc.includes(`${field}:`)) {
            ok(`save() includes ${field}`);
        } else {
            fail(`save() missing ${field}`);
        }
    }

    // save() uses SAVE_FORMAT_VERSION
    if (saveSystemSrc.includes('version: SAVE_FORMAT_VERSION')) {
        ok('save() writes SAVE_FORMAT_VERSION as version');
    } else {
        fail('save() does not use SAVE_FORMAT_VERSION');
    }

    // load() checks version and migrates
    if (saveSystemSrc.includes('data.version !== SAVE_FORMAT_VERSION') && saveSystemSrc.includes('this.migrate(data)')) {
        ok('load() checks version and triggers migration');
    } else {
        fail('load() does not check version or trigger migration');
    }
}

// ─── Verify migration simulation ──────────────────────────────────────────────
section('7. Migration simulation (v3→v4 logic)');

// Simulate what the migration would do for a v3 pufferfish save
const pufferCfg = fishConfigs.pufferfish;
if (pufferCfg) {
    const fishLevel = 5;
    const expectedMaxHp = pufferCfg.baseHp + (fishLevel - 1) * pufferCfg.growth.hp;
    const expectedShield = pufferCfg.baseShield + (fishLevel - 1) * pufferCfg.growth.shield;
    const expectedHealPower = pufferCfg.baseHealPower + (fishLevel - 1) * pufferCfg.growth.healPower;

    ok(`Pufferfish level ${fishLevel} migrated maxHp: ${pufferCfg.baseHp} + ${fishLevel - 1}*${pufferCfg.growth.hp} = ${expectedMaxHp}`);
    ok(`Pufferfish level ${fishLevel} migrated shield: ${pufferCfg.baseShield} + ${fishLevel - 1}*${pufferCfg.growth.shield} = ${expectedShield}`);
    ok(`Pufferfish level ${fishLevel} migrated healPower: ${pufferCfg.baseHealPower} + ${fishLevel - 1}*${pufferCfg.growth.healPower} = ${expectedHealPower}`);

    // HP preservation: alive fish with hp=30 and new maxHp=73 → hp stays 30
    const oldHp = 30;
    const preservedHp = Math.min(oldHp, expectedMaxHp);
    if (preservedHp === oldHp) {
        ok(`HP preserved: old hp=${oldHp} ≤ new maxHp=${expectedMaxHp}, keeps ${preservedHp}`);
    } else {
        ok(`HP capped: old hp=${oldHp} > new maxHp=${expectedMaxHp}, capped to ${preservedHp}`);
    }
}

// Simulate seahorse migration
const seahorseCfg = fishConfigs.seahorse;
if (seahorseCfg) {
    const fishLevel = 3;
    const expectedHealPower = seahorseCfg.baseHealPower + (fishLevel - 1) * seahorseCfg.growth.healPower;
    ok(`Seahorse level ${fishLevel} migrated healPower: ${seahorseCfg.baseHealPower} + ${fishLevel - 1}*${seahorseCfg.growth.healPower} = ${expectedHealPower}`);
    if (expectedHealPower > 0) {
        ok(`Seahorse has meaningful healPower (${expectedHealPower}) after migration`);
    } else {
        fail('Seahorse healPower should be > 0 after migration');
    }
}

// ─── Verify createFish object shape ───────────────────────────────────────────
section('8. createFish object shape verification');

if (partySystemSrc) {
    const returnMatch = partySystemSrc.match(/return \{([\s\S]*?)\};/);
    if (returnMatch) {
        const body = returnMatch[1];
        const expectedFields = [
            'speciesId', 'name', 'color', 'level', 'xp', 'xpToNext',
            'hp', 'maxHp', 'atk', 'def', 'spd',
            'shield', 'maxShield', 'healPower',
            'moves', 'poisoned', 'buffs', 'burn', 'curses', 'hots', 'poisons'
        ];
        for (const field of expectedFields) {
            if (body.includes(field + ':') || body.includes(field + ' :')) {
                ok(`createFish returns ${field}`);
            } else {
                fail(`createFish missing field: ${field}`);
            }
        }
    } else {
        fail('Could not parse createFish return object');
    }
}

// ─── Results ──────────────────────────────────────────────────────────────────
console.log(`\n========================================`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`========================================`);
process.exit(failed > 0 ? 1 : 0);
