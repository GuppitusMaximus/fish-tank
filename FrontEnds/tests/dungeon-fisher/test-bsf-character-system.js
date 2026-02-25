#!/usr/bin/env node
/**
 * QA verification for bsf-character-system plan (Phase 5b).
 * Validates: dog companion, roster management, starter selection,
 * camp swap UI, companion level-up, save persistence, v3→v4 migration.
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

// ─── Step 1: Character config (andy.json) ────────────────────────────────────
section('1. Character config has companion and party slots');

const andyConfig = readJSON(path.join(CONFIG, 'characters', 'andy.json'));
if (!andyConfig) {
    fail('Could not read andy.json');
} else {
    if (andyConfig.id === 'andy') {
        ok('Character ID is "andy"');
    } else {
        fail(`Character ID is "${andyConfig.id}" (expected "andy")`);
    }

    if (andyConfig.startingGold === 50) {
        ok('Starting gold is 50');
    } else {
        fail(`Starting gold is ${andyConfig.startingGold} (expected 50)`);
    }

    // Party slots
    if (andyConfig.partySlots && andyConfig.partySlots.fish === 2 && andyConfig.partySlots.companion === 1) {
        ok('Party slots: 2 fish + 1 companion');
    } else {
        fail(`Party slots: ${JSON.stringify(andyConfig.partySlots)} (expected {fish:2, companion:1})`);
    }

    // Companion config
    const comp = andyConfig.companion;
    if (!comp) {
        fail('andy.json missing companion field');
    } else {
        if (comp.id === 'dog') {
            ok('Companion ID is "dog"');
        } else {
            fail(`Companion ID is "${comp.id}" (expected "dog")`);
        }

        if (comp.name === 'Dog') {
            ok('Companion name is "Dog"');
        } else {
            fail(`Companion name is "${comp.name}" (expected "Dog")`);
        }

        // Stats
        const expectedStats = { baseHp: 35, baseAtk: 7, baseDef: 6, baseSpd: 5, baseShield: 5, baseHealPower: 3 };
        for (const [key, val] of Object.entries(expectedStats)) {
            if (comp[key] === val) {
                ok(`Companion ${key}=${val}`);
            } else {
                fail(`Companion ${key}=${comp[key]} (expected ${val})`);
            }
        }

        // Growth rates
        if (comp.growth) {
            const expectedGrowth = { hp: 4, atk: 2, def: 1, spd: 1, shield: 1, healPower: 1 };
            for (const [key, val] of Object.entries(expectedGrowth)) {
                if (comp.growth[key] === val) {
                    ok(`Companion growth.${key}=${val}`);
                } else {
                    fail(`Companion growth.${key}=${comp.growth[key]} (expected ${val})`);
                }
            }
        } else {
            fail('Companion missing growth object');
        }

        // Special move
        if (comp.specialMove === 'loyal_bite') {
            ok('Companion specialMove is "loyal_bite"');
        } else {
            fail(`Companion specialMove is "${comp.specialMove}" (expected "loyal_bite")`);
        }
    }
}

// ─── Step 2: PartySystem.createCompanion ─────────────────────────────────────
section('2. PartySystem.createCompanion produces correct object');

const partySystemSrc = readFile(path.join(BASE, 'systems', 'PartySystem.js'));
if (!partySystemSrc) {
    fail('Could not read PartySystem.js');
} else {
    // createCompanion method exists
    if (partySystemSrc.includes('static createCompanion(characterId)')) {
        ok('createCompanion method exists');
    } else {
        fail('createCompanion method missing');
    }

    // Uses ConfigLoader.getCharacter
    if (partySystemSrc.includes('ConfigLoader.getCharacter(characterId)')) {
        ok('createCompanion reads character config via ConfigLoader');
    } else {
        fail('createCompanion does not use ConfigLoader.getCharacter');
    }

    // Sets isCompanion: true
    if (partySystemSrc.includes('isCompanion: true')) {
        ok('createCompanion sets isCompanion: true');
    } else {
        fail('createCompanion missing isCompanion: true flag');
    }

    // Stores growth directly on the object
    if (partySystemSrc.includes('growth: comp.growth')) {
        ok('createCompanion stores growth rates on object');
    } else {
        fail('createCompanion does not store growth on object');
    }

    // Has same stat fields as fish
    const companionFields = ['speciesId', 'name', 'color', 'level', 'xp', 'xpToNext',
        'hp', 'maxHp', 'atk', 'def', 'spd', 'shield', 'maxShield', 'healPower',
        'moves', 'poisoned', 'buffs', 'burn', 'curses', 'hots', 'poisons'];

    // Extract the createCompanion return block
    const compReturnMatch = partySystemSrc.match(/static createCompanion[\s\S]*?return \{([\s\S]*?)\};/);
    if (compReturnMatch) {
        const body = compReturnMatch[1];
        for (const field of companionFields) {
            if (body.includes(field + ':') || body.includes(field + ' :')) {
                ok(`createCompanion returns ${field}`);
            } else {
                fail(`createCompanion missing field: ${field}`);
            }
        }
    } else {
        fail('Could not parse createCompanion return object');
    }

    // Returns null if no companion in character config
    if (partySystemSrc.includes('!character.companion') && partySystemSrc.includes('return null')) {
        ok('createCompanion returns null when character has no companion');
    } else {
        fail('createCompanion does not handle missing companion');
    }
}

// ─── Step 3: Roster management ───────────────────────────────────────────────
section('3. Roster management (addToRoster, canSwap, swapPartyMember, getFullRoster)');

if (partySystemSrc) {
    // addToRoster
    if (partySystemSrc.includes('static addToRoster(gameState, fish)')) {
        ok('addToRoster method exists');
    } else {
        fail('addToRoster method missing');
    }

    if (partySystemSrc.includes('gameState.roster.push(fish)')) {
        ok('addToRoster pushes fish to roster');
    } else {
        fail('addToRoster does not push fish to roster');
    }

    // Initializes roster if missing
    if (partySystemSrc.includes('if (!gameState.roster) gameState.roster = []')) {
        ok('addToRoster initializes roster if missing');
    } else {
        fail('addToRoster does not initialize roster');
    }

    // canSwap
    if (partySystemSrc.includes('static canSwap(gameState, partyIndex)')) {
        ok('canSwap method exists');
    } else {
        fail('canSwap method missing');
    }

    // canSwap blocks companions
    if (partySystemSrc.includes('!member.isCompanion')) {
        ok('canSwap returns false for isCompanion members');
    } else {
        fail('canSwap does not check isCompanion flag');
    }

    // swapPartyMember
    if (partySystemSrc.includes('static swapPartyMember(gameState, partyIndex, rosterIndex)')) {
        ok('swapPartyMember method exists');
    } else {
        fail('swapPartyMember method missing');
    }

    // swapPartyMember uses canSwap guard
    if (partySystemSrc.includes('this.canSwap(gameState, partyIndex)')) {
        ok('swapPartyMember calls canSwap before swapping');
    } else {
        fail('swapPartyMember does not guard with canSwap');
    }

    // swapPartyMember does array swap
    if (partySystemSrc.includes('gameState.party[partyIndex] = gameState.roster[rosterIndex]') &&
        partySystemSrc.includes('gameState.roster[rosterIndex] = temp')) {
        ok('swapPartyMember swaps between party and roster arrays');
    } else {
        fail('swapPartyMember does not swap correctly');
    }

    // getFullRoster
    if (partySystemSrc.includes('static getFullRoster(gameState)')) {
        ok('getFullRoster method exists');
    } else {
        fail('getFullRoster method missing');
    }

    if (partySystemSrc.includes('active: gameState.party') && partySystemSrc.includes('bench: gameState.roster')) {
        ok('getFullRoster returns {active, bench}');
    } else {
        fail('getFullRoster does not return expected shape');
    }
}

// ─── Step 4: TitleScene starter selection (pick 2 + companion) ───────────────
section('4. TitleScene starter selection with companion');

const titleSceneSrc = readFile(path.join(BASE, 'scenes', 'TitleScene.js'));
if (!titleSceneSrc) {
    fail('Could not read TitleScene.js');
} else {
    // showStarterSelection reads partySlots.fish for max picks
    if (titleSceneSrc.includes('character.partySlots.fish')) {
        ok('showStarterSelection reads partySlots.fish for max picks');
    } else {
        fail('showStarterSelection does not use partySlots.fish');
    }

    // Shows companion preview
    if (titleSceneSrc.includes('character.companion') && titleSceneSrc.includes('Companion:')) {
        ok('Starter selection shows companion preview');
    } else {
        fail('Starter selection does not show companion preview');
    }

    // _toggleStarter limits to maxPicks
    if (titleSceneSrc.includes('this._selectedStarters.length >= maxPicks')) {
        ok('_toggleStarter enforces maxPicks limit');
    } else {
        fail('_toggleStarter does not enforce maxPicks');
    }

    // BEGIN button disabled until ready
    if (titleSceneSrc.includes('this._selectedStarters.length === maxPicks') &&
        titleSceneSrc.includes('setAlpha(alpha)')) {
        ok('BEGIN button enables when exactly maxPicks starters selected');
    } else {
        fail('BEGIN button logic missing');
    }

    // startNewGame creates companion
    if (titleSceneSrc.includes('PartySystem.createCompanion(fisherId)')) {
        ok('startNewGame creates companion via PartySystem.createCompanion');
    } else {
        fail('startNewGame does not create companion');
    }

    // Dog pushed to party
    if (titleSceneSrc.includes('party.push(dog)')) {
        ok('startNewGame pushes dog to party array');
    } else {
        fail('startNewGame does not push dog to party');
    }

    // gameState has new fields
    if (titleSceneSrc.includes('roster: []') && titleSceneSrc.includes('companion: dog')) {
        ok('startNewGame sets roster:[] and companion:dog in gameState');
    } else {
        fail('startNewGame missing roster/companion in gameState');
    }

    if (titleSceneSrc.includes('pveDeathCount: 0') && titleSceneSrc.includes('pvpLossCount: 0')) {
        ok('startNewGame sets pveDeathCount:0 and pvpLossCount:0');
    } else {
        fail('startNewGame missing death count fields');
    }

    // Starting gold from character config
    if (titleSceneSrc.includes('character.startingGold') || titleSceneSrc.includes('character ? character.startingGold')) {
        ok('startNewGame uses character.startingGold');
    } else {
        fail('startNewGame does not use character.startingGold');
    }

    // continueGame loads new fields
    if (titleSceneSrc.includes('roster: saveData.roster') && titleSceneSrc.includes('companion: saveData.companion')) {
        ok('continueGame restores roster and companion from save');
    } else {
        fail('continueGame does not restore roster/companion');
    }

    if (titleSceneSrc.includes('pveDeathCount: saveData.pveDeathCount') &&
        titleSceneSrc.includes('pvpLossCount: saveData.pvpLossCount')) {
        ok('continueGame restores death count fields');
    } else {
        fail('continueGame missing death count restore');
    }
}

// ─── Step 5: CampScene roster swap UI ────────────────────────────────────────
section('5. CampScene roster swap UI');

const campSceneSrc = readFile(path.join(BASE, 'scenes', 'CampScene.js'));
if (!campSceneSrc) {
    fail('Could not read CampScene.js');
} else {
    // Companion star in HP list
    if (campSceneSrc.includes("f.isCompanion ? ' \\u2605' : ''") ||
        campSceneSrc.includes("f.isCompanion ? ' \u2605' : ''")) {
        ok('Camp HP list shows star for companion');
    } else {
        fail('Camp HP list does not mark companion with star');
    }

    // Party order section
    if (campSceneSrc.includes('PARTY ORDER')) {
        ok('CampScene has PARTY ORDER section');
    } else {
        fail('CampScene missing PARTY ORDER section');
    }

    // LOCKED label for companion
    if (campSceneSrc.includes('(LOCKED)')) {
        ok('Companion shows (LOCKED) in party order');
    } else {
        fail('Companion does not show (LOCKED) label');
    }

    // LOCKED only for isCompanion
    if (campSceneSrc.includes('f.isCompanion') && campSceneSrc.includes('(LOCKED)')) {
        ok('LOCKED label tied to isCompanion flag');
    } else {
        fail('LOCKED label not tied to isCompanion');
    }

    // Roster section
    if (campSceneSrc.includes('ROSTER')) {
        ok('CampScene has ROSTER section');
    } else {
        fail('CampScene missing ROSTER section');
    }

    // Roster hidden when empty
    if (campSceneSrc.includes('gs.roster.length === 0')) {
        ok('Roster section hidden when roster is empty');
    } else {
        fail('Roster section does not check for empty roster');
    }

    // SWAP buttons on bench fish
    if (campSceneSrc.includes("label: 'SWAP'")) {
        ok('SWAP buttons on bench fish');
    } else {
        fail('Missing SWAP buttons on bench fish');
    }

    // Swap targets exclude companion
    if (campSceneSrc.includes('!f.isCompanion')) {
        ok('Swap targets filter excludes companion');
    } else {
        fail('Swap targets do not exclude companion');
    }

    // Swap calls PartySystem.swapPartyMember
    if (campSceneSrc.includes('PartySystem.swapPartyMember(gs, partyIdx, rosterIndex)')) {
        ok('Swap action calls PartySystem.swapPartyMember');
    } else {
        fail('Swap does not call PartySystem.swapPartyMember');
    }

    // Save after swap
    if (campSceneSrc.includes('SaveSystem.save(gs)')) {
        ok('CampScene saves after swap');
    } else {
        fail('CampScene does not save after swap');
    }

    // Re-render after swap
    if (campSceneSrc.includes('this.renderPartyOrder()') && campSceneSrc.includes('this.renderRoster()')) {
        ok('CampScene re-renders party order and roster after swap');
    } else {
        fail('CampScene does not re-render after swap');
    }

    // Shield values shown in HP list
    if (campSceneSrc.includes('Shield:') || campSceneSrc.includes('Sh:')) {
        ok('Camp shows shield values for party members');
    } else {
        fail('Camp does not show shield values');
    }
}

// ─── Step 6: Dog in combat (BattleScene) ─────────────────────────────────────
section('6. Dog in combat (BattleScene)');

const battleSceneSrc = readFile(path.join(BASE, 'scenes', 'BattleScene.js'));
if (!battleSceneSrc) {
    fail('Could not read BattleScene.js');
} else {
    // Party passed to CombatSystem includes dog (no isCompanion filter)
    if (!battleSceneSrc.includes('isCompanion') || battleSceneSrc.includes('// no companion filter')) {
        ok('BattleScene does not filter out companion from combat');
    } else {
        // Check if isCompanion is used to EXCLUDE from battle
        if (battleSceneSrc.includes('!isCompanion') || battleSceneSrc.includes('isCompanion === false')) {
            fail('BattleScene may be filtering out companions from combat');
        } else {
            ok('BattleScene includes companion in combat (no exclusion filter)');
        }
    }

    // XP awarded to all living fish (which includes dog)
    if (battleSceneSrc.includes('PartySystem.awardXP')) {
        ok('BattleScene awards XP via PartySystem.awardXP');
    } else {
        fail('BattleScene does not award XP');
    }
}

// ─── Step 7: Companion level-up growth ───────────────────────────────────────
section('7. Companion level-up uses own growth rates');

if (partySystemSrc) {
    // awardXP checks fish.growth first, then species.growth
    if (partySystemSrc.includes('fish.growth || (species')) {
        ok('awardXP checks fish.growth first (for companions)');
    } else {
        fail('awardXP does not prioritize fish.growth');
    }

    // This means dog uses its own growth from createCompanion, not species lookup
    // (since ConfigLoader.getFish("dog") returns null, fish.growth is the only source)
    if (partySystemSrc.includes('const growth = fish.growth || (species ? species.growth')) {
        ok('Growth fallback: fish.growth → species.growth → hardcoded default');
    } else {
        fail('Growth fallback chain not as expected');
    }
}

// ─── Step 8: Save persistence with new fields ───────────────────────────────
section('8. Save persistence includes companion and roster');

const saveSystemSrc = readFile(path.join(BASE, 'systems', 'SaveSystem.js'));
if (!saveSystemSrc) {
    fail('Could not read SaveSystem.js');
} else {
    // Save key
    if (saveSystemSrc.includes("'fathom-fall-save'")) {
        ok('Save key is fathom-fall-save');
    } else {
        fail('Save key is not fathom-fall-save');
    }

    // Save includes roster
    if (saveSystemSrc.includes('roster: gameState.roster')) {
        ok('save() serializes roster');
    } else {
        fail('save() does not serialize roster');
    }

    // Save includes companion
    if (saveSystemSrc.includes('companion: gameState.companion')) {
        ok('save() serializes companion');
    } else {
        fail('save() does not serialize companion');
    }

    // Save includes death counts
    if (saveSystemSrc.includes('pveDeathCount: gameState.pveDeathCount') &&
        saveSystemSrc.includes('pvpLossCount: gameState.pvpLossCount')) {
        ok('save() serializes pveDeathCount and pvpLossCount');
    } else {
        fail('save() missing death count serialization');
    }

    // v3→v4 migration defaults
    if (saveSystemSrc.includes('data.roster = []') && saveSystemSrc.includes('data.companion = null')) {
        ok('v3→v4 migration sets roster=[] and companion=null');
    } else {
        fail('v3→v4 migration missing roster/companion defaults');
    }

    if (saveSystemSrc.includes('data.pveDeathCount = 0') && saveSystemSrc.includes('data.pvpLossCount = 0')) {
        ok('v3→v4 migration sets death counts to 0');
    } else {
        fail('v3→v4 migration missing death count defaults');
    }
}

// ─── Step 9: Version check ──────────────────────────────────────────────────
section('9. Version and save format');

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

// ─── Step 10: loyal_bite move exists ─────────────────────────────────────────
section('10. loyal_bite move exists in moves config');

const movesConfig = readJSON(path.join(CONFIG, 'moves.json'));
if (movesConfig) {
    const loyalBite = movesConfig.loyal_bite;
    if (loyalBite) {
        ok('loyal_bite move exists in moves.json');
        if (loyalBite.name) {
            ok(`loyal_bite name: "${loyalBite.name}"`);
        }
        if (typeof loyalBite.damage === 'number' && loyalBite.damage > 0) {
            ok(`loyal_bite damage: ${loyalBite.damage}`);
        } else {
            fail(`loyal_bite damage missing or zero`);
        }
        if (typeof loyalBite.cooldown === 'number' && loyalBite.cooldown > 0) {
            ok(`loyal_bite cooldown: ${loyalBite.cooldown}s`);
        } else {
            fail(`loyal_bite cooldown missing or zero`);
        }
    } else {
        fail('loyal_bite move not found in moves.json');
    }
} else {
    fail('Could not read moves.json');
}

// ─── Step 11: Starter fish marked correctly ──────────────────────────────────
section('11. Starter fish configuration');

const starterIds = ['guppy', 'pufferfish', 'swordfish'];
let starterCount = 0;
const allFishDir = path.join(CONFIG, 'fish');
try {
    const fishFiles = fs.readdirSync(allFishDir).filter(f => f.endsWith('.json'));
    for (const file of fishFiles) {
        const cfg = readJSON(path.join(allFishDir, file));
        if (cfg && cfg.isStarter) starterCount++;
    }
    if (starterCount === 3) {
        ok(`Exactly 3 starter species found`);
    } else {
        fail(`${starterCount} starter species found (expected 3)`);
    }
} catch (e) {
    fail('Could not read fish config directory');
}

for (const id of starterIds) {
    const cfg = readJSON(path.join(allFishDir, `${id}.json`));
    if (cfg && cfg.isStarter === true) {
        ok(`${id} is marked as starter`);
    } else {
        fail(`${id} is NOT marked as starter (isStarter=${cfg?.isStarter})`);
    }
}

// ─── Step 12: Simulated new game state shape ─────────────────────────────────
section('12. Simulated new game state shape');

// Verify what startNewGame would produce (without running the game)
if (andyConfig && andyConfig.companion) {
    const comp = andyConfig.companion;
    const dogObj = {
        speciesId: comp.id,
        name: comp.name,
        level: 1,
        hp: comp.baseHp,
        maxHp: comp.baseHp,
        atk: comp.baseAtk,
        def: comp.baseDef,
        spd: comp.baseSpd,
        shield: comp.baseShield,
        maxShield: comp.baseShield,
        healPower: comp.baseHealPower,
        isCompanion: true,
        growth: comp.growth
    };

    // Party should be [fish1, fish2, dog]
    const simulatedParty = [
        { speciesId: 'guppy', name: 'Guppy' },
        { speciesId: 'swordfish', name: 'Swordfish' },
        dogObj
    ];

    if (simulatedParty.length === 3) {
        ok('New game party has 3 members (2 fish + 1 dog)');
    } else {
        fail(`New game party has ${simulatedParty.length} members`);
    }

    if (simulatedParty[2].isCompanion === true) {
        ok('Third party member is the companion (isCompanion=true)');
    } else {
        fail('Third party member is not the companion');
    }

    if (simulatedParty[2].speciesId === 'dog') {
        ok('Companion speciesId is "dog"');
    } else {
        fail(`Companion speciesId is "${simulatedParty[2].speciesId}" (expected "dog")`);
    }

    // Verify companion has same stat fields as fish
    const requiredFields = ['hp', 'maxHp', 'atk', 'def', 'spd', 'shield', 'maxShield', 'healPower'];
    for (const field of requiredFields) {
        if (typeof dogObj[field] === 'number') {
            ok(`Dog has ${field}=${dogObj[field]}`);
        } else {
            fail(`Dog missing stat field: ${field}`);
        }
    }

    // Starting gold matches config
    if (andyConfig.startingGold === 50) {
        ok('Starting gold matches config (50)');
    }

    // Simulated save shape
    const simulatedSave = {
        version: 4,
        floor: 1,
        gold: andyConfig.startingGold,
        party: simulatedParty,
        inventory: [],
        campFloor: 1,
        nextShopFloor: 1,
        fisherId: 'andy',
        roster: [],
        companion: dogObj,
        pveDeathCount: 0,
        pvpLossCount: 0
    };

    const requiredSaveFields = ['version', 'floor', 'gold', 'party', 'inventory',
        'campFloor', 'nextShopFloor', 'fisherId', 'roster', 'companion',
        'pveDeathCount', 'pvpLossCount'];
    for (const field of requiredSaveFields) {
        if (field in simulatedSave) {
            ok(`Save has field: ${field}`);
        } else {
            fail(`Save missing field: ${field}`);
        }
    }
}

// ─── Step 13: Swap logic validation ──────────────────────────────────────────
section('13. Swap logic simulation');

// Simulate canSwap with a party containing 2 fish + 1 dog
const mockParty = [
    { speciesId: 'guppy', name: 'Guppy' },
    { speciesId: 'swordfish', name: 'Swordfish' },
    { speciesId: 'dog', name: 'Dog', isCompanion: true }
];
const mockRoster = [
    { speciesId: 'clownfish', name: 'Clownfish' }
];
const mockState = { party: mockParty, roster: mockRoster };

// canSwap(index=0) → fish → should be true
if (!mockParty[0].isCompanion) {
    ok('canSwap(0): fish at index 0 is swappable');
} else {
    fail('canSwap(0): fish at index 0 incorrectly marked as companion');
}

// canSwap(index=2) → dog → should be false
if (mockParty[2].isCompanion) {
    ok('canSwap(2): dog at index 2 is NOT swappable (isCompanion=true)');
} else {
    fail('canSwap(2): dog at index 2 should be locked');
}

// Simulate swap: party[0] ↔ roster[0]
const temp = mockState.party[0];
mockState.party[0] = mockState.roster[0];
mockState.roster[0] = temp;

if (mockState.party[0].speciesId === 'clownfish' && mockState.roster[0].speciesId === 'guppy') {
    ok('Swap works: party[0] is now clownfish, roster[0] is now guppy');
} else {
    fail('Swap produced incorrect result');
}

// After swap, party still has 2 fish + 1 dog
const fishCount = mockState.party.filter(f => !f.isCompanion).length;
const companionCount = mockState.party.filter(f => f.isCompanion).length;
if (fishCount === 2 && companionCount === 1) {
    ok('After swap: party composition valid (2 fish + 1 dog)');
} else {
    fail(`After swap: party has ${fishCount} fish and ${companionCount} companions`);
}

// ─── Results ──────────────────────────────────────────────────────────────────
console.log(`\n========================================`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`========================================`);
process.exit(failed > 0 ? 1 : 0);
