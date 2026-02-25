// Ghost party generator — no Phaser imports.
// Generates NPC ghost parties for PvP encounters.

import ConfigLoader from './ConfigLoader.js';
import PartySystem from './PartySystem.js';
import { computePowerLevel } from './StatAggregator.js';

const ROLES = {
    pufferfish:  'tank',
    manta_ray:   'tank',
    swordfish:   'dps',
    barracuda:   'dps',
    anglerfish:  'dps',
    seahorse:    'healer',
    golden_koi:  'support',
    jellyfish:   'support',
    clownfish:   'support',
    guppy:       'support'
};

const BALANCED_COMPS = [
    ['tank', 'dps', 'healer'],
    ['tank', 'dps', 'support'],
    ['tank', 'healer', 'support']
];

const SKEWED_COMPS = [
    ['dps', 'dps', 'support'],
    ['dps', 'dps', 'dps'],
    ['tank', 'tank', 'healer']
];

function getSpeciesForRole(role, rng) {
    const allFish = ConfigLoader.getAllFish();
    const candidates = Object.keys(allFish).filter(id => ROLES[id] === role);
    if (candidates.length === 0) return Object.keys(allFish)[0];
    return candidates[Math.floor(rng() * candidates.length)];
}

function estimateTargetPowerLevel(floor, combatConfig, movesConfig) {
    // Estimate the power level a party should have to match floor difficulty.
    // Scale linearly: floor 1 → level ~2, floor 50 → level ~10, floor 100 → level ~20.
    const estimatedLevel = Math.max(1, Math.min(20, Math.round(floor * 0.2)));

    // Create a reference balanced party at this level to get a baseline power
    const refSpecies = ['pufferfish', 'swordfish', 'seahorse'];
    const refParty = refSpecies
        .map(id => PartySystem.createFishAtLevel(id, estimatedLevel))
        .filter(Boolean);

    if (refParty.length === 0) return { target: 10, tolerance: 5 };

    const { level } = computePowerLevel(refParty, combatConfig, movesConfig);
    return { target: level, tolerance: level * 0.25 };
}

function createPartyAtLevel(species, level) {
    return species
        .map(id => PartySystem.createFishAtLevel(id, level))
        .filter(Boolean);
}

export function generateGhostParty(floor, config = {}) {
    const rng = config.rng || Math.random;
    const combatConfig = ConfigLoader.getCombatConfig();
    const movesConfig = ConfigLoader.getMoves();

    // Pick composition: 80% balanced, 20% skewed
    const comps = rng() < 0.8 ? BALANCED_COMPS : SKEWED_COMPS;
    const comp = comps[Math.floor(rng() * comps.length)];

    // Select species for each role slot
    const species = comp.map(role => getSpeciesForRole(role, rng));

    // Determine target power range
    const { target, tolerance } = estimateTargetPowerLevel(floor, combatConfig, movesConfig);

    // Binary search for level that puts party in target range
    let lo = 1;
    let hi = 20;
    let bestLevel = Math.max(1, Math.min(20, Math.round(floor * 0.2)));

    for (let iter = 0; iter < 10; iter++) {
        const mid = Math.floor((lo + hi) / 2);
        if (mid < 1 || mid > 20) break;

        const testParty = createPartyAtLevel(species, mid);
        if (testParty.length === 0) break;

        const { level: pl } = computePowerLevel(testParty, combatConfig, movesConfig);

        if (Math.abs(pl - target) <= tolerance) {
            bestLevel = mid;
            break;
        }

        if (pl < target) {
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
        bestLevel = mid;
    }

    bestLevel = Math.max(1, Math.min(20, bestLevel));

    return {
        character: 'andy',
        fish: species.map(speciesId => ({
            speciesId,
            level: bestLevel
        })),
        companionLevel: bestLevel,
        order: [0, 1, 2],
        items: []
    };
}

export default { generateGhostParty };
