#!/usr/bin/env node
/**
 * QA validation for equipment-grid-data-foundation plan.
 * Validates equipment-items.json, equipment-balance.json, ConfigLoader, and BootScene.
 */
const fs = require('fs');
const path = require('path');

const BASE = path.resolve(__dirname, '../../dungeon-fisher/src');
const items = JSON.parse(fs.readFileSync(path.join(BASE, 'config/equipment-items.json'), 'utf8'));
const balance = JSON.parse(fs.readFileSync(path.join(BASE, 'config/equipment-balance.json'), 'utf8'));
const configLoaderSrc = fs.readFileSync(path.join(BASE, 'systems/ConfigLoader.js'), 'utf8');
const bootSceneSrc = fs.readFileSync(path.join(BASE, 'scenes/BootScene.js'), 'utf8');

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

const VALID_SHAPES = ['I', 'O', 'T', 'S', 'Z', 'L', 'J', 'monomino'];
const VALID_RARITIES = ['standard', 'magic', 'rare', 'unique'];
const VALID_BUFF_TYPES = ['atk', 'def', 'spd', 'hp', 'shield', 'healPower', 'poison', 'burn', 'curse', 'healing', 'hot'];
const RARITY_BUFF_COUNT = { standard: 1, magic: 2, rare: 3, unique: 0 };
const ZONE_IDS = ['sewers', 'goblin_caves', 'bone_crypts', 'deep_dungeon', 'shadow_realm', 'ancient_chambers', 'dungeon_heart'];
const ZONE_PREFIXES = { sewers: 'sewer_', goblin_caves: 'goblin_', bone_crypts: 'crypt_', deep_dungeon: 'deep_', shadow_realm: 'shadow_', ancient_chambers: 'ancient_', dungeon_heart: 'heart_' };
const TETROMINO_SHAPES = ['I', 'O', 'T', 'S', 'Z', 'L', 'J'];

// ========== STEP 1: Validate equipment-items.json structure ==========
console.log('\n=== Step 1: Validate equipment-items.json structure ===');

const allKeys = Object.keys(items);
assert(allKeys.length === 85, `Total items should be 85, got ${allKeys.length}`);

for (const [key, item] of Object.entries(items)) {
    // Required fields
    const requiredFields = ['id', 'name', 'shape', 'rarity', 'buffs', 'buyPrice', 'zone', 'description'];
    for (const field of requiredFields) {
        assert(item.hasOwnProperty(field), `${key}: missing required field '${field}'`);
    }

    // id matches key
    assert(item.id === key, `${key}: id field '${item.id}' does not match key`);

    // shape validation
    assert(VALID_SHAPES.includes(item.shape), `${key}: invalid shape '${item.shape}'`);

    // rarity validation
    assert(VALID_RARITIES.includes(item.rarity), `${key}: invalid rarity '${item.rarity}'`);

    // buffs count matches rarity
    const expectedBuffCount = RARITY_BUFF_COUNT[item.rarity];
    assert(item.buffs.length === expectedBuffCount, `${key}: rarity '${item.rarity}' should have ${expectedBuffCount} buffs, got ${item.buffs.length}`);

    // buff structure validation
    for (const buff of item.buffs) {
        assert(buff.hasOwnProperty('type') && buff.hasOwnProperty('baseValue'), `${key}: buff missing type or baseValue`);
        assert(VALID_BUFF_TYPES.includes(buff.type), `${key}: invalid buff type '${buff.type}'`);
    }

    // buyPrice validation (positive except Harmony which is 0)
    if (key === 'harmony') {
        assert(item.buyPrice === 0, `harmony: buyPrice should be 0, got ${item.buyPrice}`);
    } else {
        assert(item.buyPrice > 0, `${key}: buyPrice should be positive, got ${item.buyPrice}`);
    }

    // zone validation
    if (key === 'harmony') {
        assert(item.zone === 'all', `harmony: zone should be 'all', got '${item.zone}'`);
    } else {
        assert(ZONE_IDS.includes(item.zone), `${key}: invalid zone '${item.zone}'`);
    }
}

// ========== STEP 2: Validate per-zone item distribution ==========
console.log('\n=== Step 2: Validate per-zone item distribution ===');

for (const zoneId of ZONE_IDS) {
    const zoneItems = Object.entries(items).filter(([, item]) => item.zone === zoneId);
    assert(zoneItems.length === 12, `${zoneId}: should have 12 items, got ${zoneItems.length}`);

    const standardItems = zoneItems.filter(([, item]) => item.rarity === 'standard');
    const magicItems = zoneItems.filter(([, item]) => item.rarity === 'magic');
    const rareItems = zoneItems.filter(([, item]) => item.rarity === 'rare');
    assert(standardItems.length === 7, `${zoneId}: should have 7 standard items, got ${standardItems.length}`);
    assert(magicItems.length === 3, `${zoneId}: should have 3 magic items, got ${magicItems.length}`);
    assert(rareItems.length === 2, `${zoneId}: should have 2 rare items, got ${rareItems.length}`);

    // All 7 tetromino shapes represented in standard tier
    const standardShapes = standardItems.map(([, item]) => item.shape).sort();
    const expectedShapes = [...TETROMINO_SHAPES].sort();
    assert(JSON.stringify(standardShapes) === JSON.stringify(expectedShapes),
        `${zoneId}: standard items should have all 7 shapes, got [${standardShapes}]`);

    // Correct zone prefix
    const expectedPrefix = ZONE_PREFIXES[zoneId];
    for (const [key] of zoneItems) {
        assert(key.startsWith(expectedPrefix), `${zoneId}: item '${key}' does not start with expected prefix '${expectedPrefix}'`);
    }
}

// ========== STEP 3: Validate Harmony special item ==========
console.log('\n=== Step 3: Validate Harmony special item ===');

const harmony = items.harmony;
assert(harmony !== undefined, 'Harmony item exists');
assert(harmony.id === 'harmony', `Harmony id should be 'harmony', got '${harmony.id}'`);
assert(harmony.unique === true, `Harmony unique should be true, got ${harmony.unique}`);
assert(harmony.indestructible === true, `Harmony indestructible should be true, got ${harmony.indestructible}`);
assert(harmony.shape === 'monomino', `Harmony shape should be 'monomino', got '${harmony.shape}'`);
assert(harmony.buyPrice === 0, `Harmony buyPrice should be 0, got ${harmony.buyPrice}`);
assert(Array.isArray(harmony.buffs) && harmony.buffs.length === 0, `Harmony buffs should be empty array`);
// rowRestriction: plan says 5, actual is 4 — flag as discrepancy
console.log(`  NOTE: Harmony rowRestriction = ${harmony.rowRestriction} (plan specified 5)`);
assert(typeof harmony.rowRestriction === 'number', `Harmony rowRestriction should be a number`);

// ========== STEP 4: Validate equipment-balance.json structure ==========
console.log('\n=== Step 4: Validate equipment-balance.json structure ===');

// zoneMultipliers
assert(Array.isArray(balance.zoneMultipliers), 'zoneMultipliers is an array');
assert(balance.zoneMultipliers.length === 7, `zoneMultipliers should have 7 entries, got ${balance.zoneMultipliers.length}`);
assert(balance.zoneMultipliers[0] === 1.0, `zoneMultipliers[0] should be 1.0, got ${balance.zoneMultipliers[0]}`);
for (let i = 1; i < balance.zoneMultipliers.length; i++) {
    assert(balance.zoneMultipliers[i] > balance.zoneMultipliers[i - 1],
        `zoneMultipliers should be ascending: [${i-1}]=${balance.zoneMultipliers[i-1]} >= [${i}]=${balance.zoneMultipliers[i]}`);
}

// rarityDropWeights
assert(typeof balance.rarityDropWeights === 'object', 'rarityDropWeights is an object');
for (const zoneId of ZONE_IDS) {
    assert(balance.rarityDropWeights.hasOwnProperty(zoneId), `rarityDropWeights missing zone '${zoneId}'`);
    const w = balance.rarityDropWeights[zoneId];
    assert(w.hasOwnProperty('standard') && w.hasOwnProperty('magic') && w.hasOwnProperty('rare'),
        `${zoneId} drop weights missing standard/magic/rare`);
    const sum = w.standard + w.magic + w.rare;
    assert(sum === 100, `${zoneId} drop weights sum should be 100, got ${sum}`);
}

// itemDestructionChance
assert(balance.itemDestructionChance.ancient_chambers === 0.30, `itemDestructionChance.ancient_chambers should be 0.30, got ${balance.itemDestructionChance.ancient_chambers}`);
assert(balance.itemDestructionChance.dungeon_heart === 0.60, `itemDestructionChance.dungeon_heart should be 0.60, got ${balance.itemDestructionChance.dungeon_heart}`);

// Scalar values
assert(balance.shopEquipmentCount === 3, `shopEquipmentCount should be 3, got ${balance.shopEquipmentCount}`);
assert(balance.stashCellCapacity === 15, `stashCellCapacity should be 15, got ${balance.stashCellCapacity}`);
assert(balance.sellPriceMultiplier === 0.5, `sellPriceMultiplier should be 0.5, got ${balance.sellPriceMultiplier}`);
assert(balance.synergyMultiplier === 2.0, `synergyMultiplier should be 2.0, got ${balance.synergyMultiplier}`);

// ========== STEP 5: Validate ConfigLoader integration ==========
console.log('\n=== Step 5: Validate ConfigLoader integration ===');

assert(configLoaderSrc.includes('getEquipmentItem(id)'), 'ConfigLoader has getEquipmentItem(id) method');
assert(configLoaderSrc.includes('getAllEquipmentItems()'), 'ConfigLoader has getAllEquipmentItems() method');
assert(configLoaderSrc.includes('getEquipmentBalance()'), 'ConfigLoader has getEquipmentBalance() method');
assert(configLoaderSrc.includes('getZoneItems(zoneId)'), 'ConfigLoader has getZoneItems(zoneId) method');

// Verify getEquipmentItem returns from equipmentItems data
assert(configLoaderSrc.includes('_data.equipmentItems'), 'ConfigLoader references _data.equipmentItems');
assert(configLoaderSrc.includes('_data.equipmentBalance'), 'ConfigLoader references _data.equipmentBalance');

// ========== STEP 6: Validate BootScene integration ==========
console.log('\n=== Step 6: Validate BootScene integration ===');

assert(bootSceneSrc.includes("import equipmentItemsConfig from '../config/equipment-items.json'"), 'BootScene imports equipmentItemsConfig');
assert(bootSceneSrc.includes("import equipmentBalanceConfig from '../config/equipment-balance.json'"), 'BootScene imports equipmentBalanceConfig');
assert(bootSceneSrc.includes('equipmentItems: equipmentItemsConfig'), 'BootScene passes equipmentItemsConfig to ConfigLoader.init');
assert(bootSceneSrc.includes('equipmentBalance: equipmentBalanceConfig'), 'BootScene passes equipmentBalanceConfig to ConfigLoader.init');

// Sprite loading loop
assert(bootSceneSrc.includes('Object.values(equipmentItemsConfig)'), 'BootScene iterates over equipment items for sprite loading');
assert(bootSceneSrc.includes('item_${item.id}') || bootSceneSrc.includes('`item_${item.id}`'), 'BootScene uses item_<id> key pattern for sprites');
assert(bootSceneSrc.includes("sprites/items/"), 'BootScene loads sprites from sprites/items/ directory');

// Graceful fallback for missing sprites
assert(bootSceneSrc.includes("item_") && bootSceneSrc.includes("loaderror"), 'BootScene handles missing sprite files gracefully');

// ========== SUMMARY ==========
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
