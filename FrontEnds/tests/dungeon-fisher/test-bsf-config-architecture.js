#!/usr/bin/env node
/**
 * QA verification for bsf-config-architecture plan.
 * Validates JSON config files, ConfigLoader structure, data consumer migration,
 * and data correctness against original data files.
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

// Step 1: Config files exist and parse correctly
section('1. Config files exist and parse');

const FISH_REQUIRED = ['id','name','baseHp','baseAtk','baseDef','baseSpd','baseShield','baseHealPower','growth','specialMove','color','shopPrice','isStarter'];
const GROWTH_REQUIRED = ['hp','atk','def','spd','shield','healPower'];
const MONSTER_REQUIRED = ['id','name','color','floorRange','specialMove','statScaling','goldReward','xpReward'];
const MOVE_REQUIRED = ['id','name','damage','cooldown','animation'];

const EXPECTED_FISH = ['guppy','pufferfish','swordfish','clownfish','anglerfish','barracuda','jellyfish','seahorse','manta_ray','golden_koi'];
const EXPECTED_MONSTERS = ['sewer_rat','cave_bat','goblin','spider','skeleton','slime','ogre','wraith','golem','demon','dragon','shadow_lord','dungeon_lord'];

// Fish configs
const fishDir = path.join(CONFIG, 'fish');
if (fs.existsSync(fishDir)) {
    const fishFiles = fs.readdirSync(fishDir).filter(f => f.endsWith('.json'));
    fishFiles.length === 10 ? ok(`10 fish config files found`) : fail(`Expected 10 fish configs, got ${fishFiles.length}`);

    for (const expected of EXPECTED_FISH) {
        const filePath = path.join(fishDir, `${expected}.json`);
        const data = readJSON(filePath);
        if (!data) { fail(`${expected}.json missing or invalid JSON`); continue; }
        const missing = FISH_REQUIRED.filter(f => !(f in data));
        missing.length === 0 ? ok(`${expected}.json has all required fields`) : fail(`${expected}.json missing: ${missing.join(', ')}`);
        if (data.growth) {
            const missingGrowth = GROWTH_REQUIRED.filter(f => !(f in data.growth));
            missingGrowth.length === 0 ? ok(`${expected}.json growth has all sub-fields`) : fail(`${expected}.json growth missing: ${missingGrowth.join(', ')}`);
        }
        if (typeof data.color === 'string' && data.color.startsWith('0x')) {
            ok(`${expected}.json color is hex string`);
        } else {
            fail(`${expected}.json color should be hex string, got: ${typeof data.color} ${data.color}`);
        }
    }
} else {
    fail('src/config/fish/ directory does not exist');
}

// Monster configs
const monsterDir = path.join(CONFIG, 'monsters');
if (fs.existsSync(monsterDir)) {
    const monsterFiles = fs.readdirSync(monsterDir).filter(f => f.endsWith('.json'));
    monsterFiles.length === 13 ? ok(`13 monster config files found`) : fail(`Expected 13 monster configs, got ${monsterFiles.length}`);

    for (const expected of EXPECTED_MONSTERS) {
        const filePath = path.join(monsterDir, `${expected}.json`);
        const data = readJSON(filePath);
        if (!data) { fail(`${expected}.json missing or invalid JSON`); continue; }
        const missing = MONSTER_REQUIRED.filter(f => !(f in data));
        missing.length === 0 ? ok(`${expected}.json has all required fields`) : fail(`${expected}.json missing: ${missing.join(', ')}`);
    }

    // spider.json id check
    const spider = readJSON(path.join(monsterDir, 'spider.json'));
    spider && spider.id === 'spider' ? ok('spider.json has id "spider" (not "giant_spider")') : fail('spider.json id mismatch');
} else {
    fail('src/config/monsters/ directory does not exist');
}

// characters/andy.json
const andy = readJSON(path.join(CONFIG, 'characters', 'andy.json'));
if (andy) {
    ok('characters/andy.json exists and parses');
    andy.companion ? ok('andy.json has companion data') : fail('andy.json missing companion');
    andy.id === 'andy' ? ok('andy.json has correct id') : fail('andy.json id mismatch');
} else {
    fail('characters/andy.json missing or invalid');
}

// moves.json
const moves = readJSON(path.join(CONFIG, 'moves.json'));
if (moves) {
    const moveKeys = Object.keys(moves);
    moveKeys.length >= 23 ? ok(`moves.json has ${moveKeys.length} moves (>=23)`) : fail(`moves.json has ${moveKeys.length} moves, expected >=23`);
    let allMovesValid = true;
    for (const key of moveKeys) {
        const missing = MOVE_REQUIRED.filter(f => !(f in moves[key]));
        if (missing.length > 0) { fail(`move ${key} missing: ${missing.join(', ')}`); allMovesValid = false; }
    }
    if (allMovesValid) ok('All moves have required fields');
} else {
    fail('moves.json missing or invalid');
}

// combat.json
const combat = readJSON(path.join(CONFIG, 'combat.json'));
if (combat) {
    ok('combat.json exists and parses');
    const combatFields = ['baseAtkK1','baseAtkK2','spdToCooldownK','minBaseCooldown','specialDefFactor','xpCurve','maxLevel'];
    const missing = combatFields.filter(f => !(f in combat));
    missing.length === 0 ? ok('combat.json has all tuning constants') : fail(`combat.json missing: ${missing.join(', ')}`);
} else {
    fail('combat.json missing or invalid');
}

// encounters.json
const encounters = readJSON(path.join(CONFIG, 'encounters.json'));
if (encounters) {
    ok('encounters.json exists and parses');
    const encFields = ['zonePattern','floorsPerZone','packSize','bossStatMultiplier','rewardMultiplier'];
    const missing = encFields.filter(f => !(f in encounters));
    missing.length === 0 ? ok('encounters.json has zone patterns and scaling') : fail(`encounters.json missing: ${missing.join(', ')}`);
} else {
    fail('encounters.json missing or invalid');
}

// Step 2: ConfigLoader structure
section('2. ConfigLoader singleton structure');

const clPath = path.join(BASE, 'systems', 'ConfigLoader.js');
const clSrc = fs.readFileSync(clPath, 'utf8');

clSrc.includes('let _data') ? ok('Module-scoped _data for singleton') : fail('No _data variable found');
clSrc.includes('init(') ? ok('init() method exists') : fail('No init() method');
clSrc.includes('getFish(') ? ok('getFish() method exists') : fail('No getFish()');
clSrc.includes('getAllFish(') ? ok('getAllFish() method exists') : fail('No getAllFish()');
clSrc.includes('getMonster(') ? ok('getMonster() method exists') : fail('No getMonster()');
clSrc.includes('getMove(') ? ok('getMove() method exists') : fail('No getMove()');
clSrc.includes('getCombatConfig(') ? ok('getCombatConfig() method exists') : fail('No getCombatConfig()');
clSrc.includes('getEncounterConfig(') ? ok('getEncounterConfig() method exists') : fail('No getEncounterConfig()');
clSrc.includes('getCharacter(') ? ok('getCharacter() method exists') : fail('No getCharacter()');
clSrc.includes('Number(') ? ok('Color parsing uses Number()') : fail('No Number() for color parsing');
clSrc.includes('throw new Error') ? ok('Strict mode throws Error') : fail('No Error throw found');
clSrc.includes('console.warn') ? ok('Forgiving mode uses console.warn') : fail('No console.warn found');

// Step 3: Data consumers migrated
section('3. Data consumer migration');

const consumers = {
    'systems/CombatSystem.js': { mustImport: 'ConfigLoader', mustNotImport: ['data/moves'], uses: ['getMove', 'getCombatConfig'] },
    'systems/PartySystem.js': { mustImport: 'ConfigLoader', mustNotImport: ['data/fish'], uses: ['getFish', 'getCombatConfig'] },
    'systems/EconomySystem.js': { mustImport: 'ConfigLoader', mustNotImport: ['data/fish'], uses: ['getFish', 'getAllFish'] },
    'scenes/FloorScene.js': { mustImport: 'ConfigLoader', mustNotImport: ['data/monsters'], uses: ['getAllMonsters'] },
    'scenes/TitleScene.js': { mustImport: 'ConfigLoader', mustNotImport: ['FISH_SPECIES'], uses: ['getAllFish'] },
    'scenes/CharacterSelectScene.js': { mustImport: 'ConfigLoader', mustNotImport: ['FISHERS', 'data/fishers'], uses: ['getCharacter'] },
    'scenes/BattleScene.js': { mustImport: 'ConfigLoader', mustNotImport: ['data/moves'], uses: ['getMove'] },
    'systems/SaveSystem.js': { mustImport: 'ConfigLoader', mustNotImport: [], uses: ['getFish'] },
};

for (const [file, spec] of Object.entries(consumers)) {
    const src = fs.readFileSync(path.join(BASE, file), 'utf8');
    src.includes(spec.mustImport) ? ok(`${file} imports ${spec.mustImport}`) : fail(`${file} does not import ${spec.mustImport}`);
    for (const banned of spec.mustNotImport) {
        !src.includes(banned) ? ok(`${file} does not import ${banned}`) : fail(`${file} still imports ${banned}`);
    }
    for (const method of spec.uses) {
        src.includes(method) ? ok(`${file} uses ${method}()`) : fail(`${file} does not use ${method}()`);
    }
}

// ShopScene: delegates through EconomySystem, no deprecated imports
const shopSrc = fs.readFileSync(path.join(BASE, 'scenes', 'ShopScene.js'), 'utf8');
!shopSrc.includes('data/fish') && !shopSrc.includes('data/monsters') && !shopSrc.includes('data/moves')
    ? ok('ShopScene.js has no deprecated data imports')
    : fail('ShopScene.js still imports deprecated data files');

// Step 4: BootScene config loading
section('4. BootScene config loading');

const bootSrc = fs.readFileSync(path.join(BASE, 'scenes', 'BootScene.js'), 'utf8');
bootSrc.includes('import.meta.glob') ? ok('BootScene uses import.meta.glob') : fail('BootScene missing import.meta.glob');
bootSrc.includes('ConfigLoader.init') ? ok('BootScene calls ConfigLoader.init()') : fail('BootScene missing ConfigLoader.init()');
bootSrc.includes("config/fish") ? ok('BootScene loads fish configs') : fail('BootScene missing fish config glob');
bootSrc.includes("config/monsters") ? ok('BootScene loads monster configs') : fail('BootScene missing monster config glob');
bootSrc.includes("config/characters") ? ok('BootScene loads character configs') : fail('BootScene missing character config glob');

// Step 5: Data matches originals
section('5. Config data matches original values');

const ORIGINAL_FISH = {
    guppy: { baseHp: 30, baseAtk: 8, baseDef: 5, baseSpd: 6, specialMove: 'bubble_volley', color: '0xe8734a', shopPrice: 0, isStarter: true },
    pufferfish: { baseHp: 45, baseAtk: 5, baseDef: 9, baseSpd: 3, specialMove: 'spike_shield', color: '0xf0c040', shopPrice: 60, isStarter: true },
    swordfish: { baseHp: 22, baseAtk: 14, baseDef: 3, baseSpd: 8, specialMove: 'deep_strike', color: '0x4a90d9', shopPrice: 80, isStarter: true },
    clownfish: { baseHp: 28, baseAtk: 7, baseDef: 5, baseSpd: 10, specialMove: 'trick_shot', color: '0xe05080', shopPrice: 70, isStarter: false },
    golden_koi: { baseHp: 34, baseAtk: 11, baseDef: 8, baseSpd: 7, specialMove: 'golden_aura', color: '0xffd700', shopPrice: 200, isStarter: false },
};

for (const [id, expected] of Object.entries(ORIGINAL_FISH)) {
    const actual = readJSON(path.join(CONFIG, 'fish', `${id}.json`));
    if (!actual) { fail(`Cannot read ${id}.json for comparison`); continue; }
    let match = true;
    for (const [key, val] of Object.entries(expected)) {
        if (JSON.stringify(actual[key]) !== JSON.stringify(val)) {
            fail(`${id}.json ${key}: expected ${val}, got ${actual[key]}`);
            match = false;
        }
    }
    if (match) ok(`${id}.json stats match original data/fish.js`);
}

// Monster stat scaling matches generateMonster() formula
const ORIGINAL_SCALING = { hp: { base: 25, perFloor: 12 }, atk: { base: 6, perFloor: 0.6 }, def: { base: 2, perFloor: 0.25 }, spd: { base: 3, perFloor: 0.12 } };
const ORIGINAL_REWARDS = { goldReward: { base: 5, perFloor: 0.8 }, xpReward: { base: 10, perFloor: 1.5 } };

const sewerRat = readJSON(path.join(CONFIG, 'monsters', 'sewer_rat.json'));
if (sewerRat) {
    let scalingMatch = true;
    for (const [stat, vals] of Object.entries(ORIGINAL_SCALING)) {
        if (sewerRat.statScaling[stat].base !== vals.base || sewerRat.statScaling[stat].perFloor !== vals.perFloor) {
            fail(`sewer_rat ${stat} scaling mismatch`);
            scalingMatch = false;
        }
    }
    for (const [field, vals] of Object.entries(ORIGINAL_REWARDS)) {
        if (sewerRat[field].base !== vals.base || sewerRat[field].perFloor !== vals.perFloor) {
            fail(`sewer_rat ${field} mismatch`);
            scalingMatch = false;
        }
    }
    if (scalingMatch) ok('Monster stat scaling matches generateMonster() formulas');
} else {
    fail('Cannot read sewer_rat.json for scaling check');
}

// Spot-check moves
const ORIGINAL_MOVES = {
    bubble_volley: { damage: 12, cooldown: 2.5, animation: 'projectile' },
    deep_strike: { damage: 35, cooldown: 5, animation: 'lunge' },
    cataclysm: { damage: 40, cooldown: 5, animation: 'projectile' },
    venom_sting: { damage: 15, cooldown: 4, animation: 'projectile' },
};

for (const [id, expected] of Object.entries(ORIGINAL_MOVES)) {
    if (!moves[id]) { fail(`Move ${id} not found in moves.json`); continue; }
    let match = true;
    for (const [key, val] of Object.entries(expected)) {
        if (moves[id][key] !== val) { fail(`Move ${id}.${key}: expected ${val}, got ${moves[id][key]}`); match = false; }
    }
    if (match) ok(`Move ${id} matches original data/moves.js`);
}

// Step 6: Deprecated files marked
section('6. Deprecated file markers');

const deprecated = ['data/fish.js', 'data/monsters.js', 'data/moves.js', 'data/fishers.js'];
for (const file of deprecated) {
    const src = fs.readFileSync(path.join(BASE, file), 'utf8');
    src.includes('DEPRECATED') ? ok(`${file} has deprecation marker`) : fail(`${file} missing deprecation marker`);
}

// Summary
section('SUMMARY');
console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
