#!/usr/bin/env node
// Headless battle simulation CLI — no Phaser dependency.
// Usage: node tools/simulate.js tools/example-sim.json
//
// Requires Node.js 18+ (ES modules). Run from the dungeon-fisher/ directory.

import { readFileSync, readdirSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');

// --- Config loading ---

function loadJSON(rel) {
    return JSON.parse(readFileSync(resolve(PROJECT_ROOT, rel), 'utf8'));
}

function loadAllInDir(rel) {
    const dir = resolve(PROJECT_ROOT, rel);
    const result = {};
    for (const file of readdirSync(dir)) {
        if (!file.endsWith('.json')) continue;
        const data = JSON.parse(readFileSync(join(dir, file), 'utf8'));
        const id = data.id || file.replace('.json', '');
        result[id] = data;
    }
    return result;
}

function loadGameConfigs() {
    return {
        fish: loadAllInDir('src/config/fish'),
        monsters: loadAllInDir('src/config/monsters'),
        characters: loadAllInDir('src/config/characters'),
        moves: loadJSON('src/config/moves.json'),
        combat: loadJSON('src/config/combat.json'),
        encounters: loadJSON('src/config/encounters.json')
    };
}

// --- Seeded PRNG (mulberry32) ---

function mulberry32(seed) {
    let s = seed | 0;
    return function () {
        s = s + 0x6D2B79F5 | 0;
        let t = Math.imul(s ^ s >>> 15, 1 | s);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

// --- Main ---

async function main() {
    const simConfigPath = process.argv[2];
    if (!simConfigPath) {
        console.error('Usage: node tools/simulate.js <sim-config.json>');
        process.exit(1);
    }

    // Load game configs and initialize ConfigLoader
    const gameData = loadGameConfigs();

    const { default: ConfigLoader } = await import('../src/systems/ConfigLoader.js');
    const { default: CombatSystem } = await import('../src/systems/CombatSystem.js');
    const { default: PartySystem } = await import('../src/systems/PartySystem.js');
    const { default: EncounterSystem } = await import('../src/systems/EncounterSystem.js');
    const StatAggregator = await import('../src/systems/StatAggregator.js');

    ConfigLoader.init(gameData, { strict: true });

    // Read simulation config
    const simConfig = JSON.parse(readFileSync(resolve(simConfigPath), 'utf8'));
    const { parties: partyPresets, simulations } = simConfig;

    const combatConfig = ConfigLoader.getCombatConfig();
    const movesConfig = ConfigLoader.getMoves();
    const maxBattleDuration = combatConfig.maxBattleDuration || 120;
    const DT_MS = 16; // ~60fps

    const results = [];

    for (const sim of simulations) {
        const preset = partyPresets[sim.party];
        if (!preset) {
            console.error(`Party preset "${sim.party}" not found`);
            continue;
        }

        const seed = sim.seed ?? Math.floor(Math.random() * 0xFFFFFFFF);
        const rng = mulberry32(seed);

        // Override Math.random for seeded encounter generation
        const origRandom = Math.random;
        Math.random = rng;

        try {
            if (sim.mode === 'single-floor') {
                const result = runSingleFloor(sim, preset, seed, rng, {
                    ConfigLoader, CombatSystem, PartySystem, EncounterSystem,
                    StatAggregator, combatConfig, movesConfig, maxBattleDuration, DT_MS
                });
                results.push(result);
            } else if (sim.mode === 'zone-run') {
                const result = runZoneRun(sim, preset, seed, rng, {
                    ConfigLoader, CombatSystem, PartySystem, EncounterSystem,
                    StatAggregator, combatConfig, movesConfig, maxBattleDuration, DT_MS
                });
                results.push(result);
            } else if (sim.mode === 'full-sweep') {
                const result = runFullSweep(sim, preset, seed, rng, {
                    ConfigLoader, CombatSystem, PartySystem, EncounterSystem,
                    StatAggregator, combatConfig, movesConfig, maxBattleDuration, DT_MS
                });
                results.push(result);
            } else {
                console.error(`Unknown mode: ${sim.mode}`);
            }
        } finally {
            Math.random = origRandom;
        }
    }

    console.log(JSON.stringify(results, null, 2));
}

// --- Party Construction ---

function buildParty(preset, deps) {
    const { PartySystem } = deps;
    const party = preset.fish.map(f =>
        PartySystem.createFishAtLevel(f.speciesId, f.level)
    ).filter(Boolean);

    if (preset.character) {
        const companion = PartySystem.createCompanion(preset.character);
        if (companion && preset.companionLevel) {
            // Level up companion
            const charConfig = deps.ConfigLoader.getCharacter(preset.character);
            const growth = companion.growth || charConfig?.companion?.growth || { hp: 4, atk: 2, def: 1, spd: 1, shield: 1, healPower: 1 };
            for (let i = 1; i < preset.companionLevel; i++) {
                companion.level++;
                companion.maxHp += growth.hp;
                companion.hp += growth.hp;
                companion.atk += growth.atk;
                companion.def += growth.def;
                companion.spd += growth.spd;
                companion.maxShield += growth.shield;
                companion.shield += growth.shield;
                companion.healPower += growth.healPower;
            }
        }
        if (companion) party.push(companion);
    }

    // Apply order if specified
    if (preset.order && preset.order.length === party.length) {
        const ordered = preset.order.map(i => party[i]);
        return ordered;
    }

    return party;
}

function generateEncounter(floor, deps) {
    const { EncounterSystem } = deps;
    const type = EncounterSystem.getEncounterType(floor);
    if (type === 'boss') {
        return { type: 'boss', monsters: [EncounterSystem.generateBoss(floor)] };
    } else {
        const pack = EncounterSystem.generatePack(floor);
        return { type: 'pack', monsters: pack };
    }
}

// --- Headless Battle ---

function runBattle(party, monsters, floor, deps) {
    const { CombatSystem, maxBattleDuration, DT_MS } = deps;

    const state = CombatSystem.createCombatState(party, monsters, floor);
    let simulatedTime = 0;
    const allEvents = [];

    let totalDamageDealt = 0;
    let totalDamageTaken = 0;
    let totalShieldAbsorbed = 0;
    let totalHealingDone = 0;
    let totalPoisonDamage = 0;
    let totalBurnDamage = 0;
    let totalCurseDuration = 0;

    while (state.running && simulatedTime < maxBattleDuration * 1000) {
        const events = CombatSystem.update(state, DT_MS);
        simulatedTime += DT_MS;

        for (const e of events) {
            if (e.type === 'fish_base_attack' || e.type === 'fish_special') {
                totalDamageDealt += e.damage || 0;
                totalShieldAbsorbed += e.shieldAbsorbed || 0;
            }
            if (e.type === 'monster_base_attack' || e.type === 'monster_special') {
                totalDamageTaken += e.damage || 0;
            }
            if (e.type === 'heal' || e.type === 'hot_tick' || e.type === 'heal_pulse') {
                if (e.target !== 'monster') {
                    totalHealingDone += e.amount || 0;
                }
            }
            if (e.type === 'poison_tick' && e.target === 'monster') {
                totalPoisonDamage += e.damage || 0;
            }
            if (e.type === 'burn_tick' && e.target === 'monster') {
                totalBurnDamage += e.damage || 0;
            }
            if (e.type === 'curse_applied' && e.target === 'monster') {
                totalCurseDuration += e.duration || 0;
            }
        }
        allEvents.push(...events);
    }

    const win = state.monsterHpBar.chunks.every(c => c.hp <= 0);
    const timedOut = simulatedTime >= maxBattleDuration * 1000 && state.running;
    const duration = simulatedTime / 1000;

    // Remaining stats
    const hpRemaining = Math.max(0, state.hpBar.total);
    const shieldRemaining = state.hpBar.chunks.reduce((s, c) => s + Math.max(0, c.shield), 0);
    const fishAlive = state.fish.filter(f => f.alive).length;

    return {
        win: win && !timedOut,
        timedOut,
        duration,
        hpRemaining,
        shieldRemaining,
        fishAlive,
        totalDamageDealt,
        totalDamageTaken,
        totalShieldAbsorbed,
        totalHealingDone,
        totalPoisonDamage,
        totalBurnDamage,
        totalCurseDuration
    };
}

// --- Simulation Modes ---

function runSingleFloor(sim, preset, seed, rng, deps) {
    const floor = sim.floor || 1;
    const runs = sim.runs || 100;

    const results = [];
    for (let r = 0; r < runs; r++) {
        const party = buildParty(preset, deps);
        const encounter = generateEncounter(floor, deps);
        const result = runBattle(party, encounter.monsters, floor, deps);
        results.push({ ...result, encounterType: encounter.type, packSize: encounter.monsters.length });
    }

    return formatResults(sim, floor, results, seed, preset, deps);
}

function runZoneRun(sim, preset, seed, rng, deps) {
    const zone = sim.zone || 1;
    const encounterConfig = deps.ConfigLoader.getEncounterConfig();
    const floorsPerZone = encounterConfig.floorsPerZone;
    const startFloor = (zone - 1) * floorsPerZone + 1;
    const endFloor = zone * floorsPerZone;
    const runs = sim.runs || 100;

    const runResults = [];
    for (let r = 0; r < runs; r++) {
        const party = buildParty(preset, deps);
        let diedOnFloor = null;

        for (let floor = startFloor; floor <= endFloor; floor++) {
            const encounterType = deps.EncounterSystem.getEncounterType(floor);

            // Skip non-combat floors (camps heal, shops are rest)
            const floorInZone = deps.EncounterSystem.getFloorInZone(floor);
            const transitions = deps.EncounterSystem.getTransitions(floorInZone);

            if (encounterType === 'pvp') {
                // Skip PvP in zone runs (ghost generator would be needed)
                continue;
            }

            const encounter = generateEncounter(floor, deps);
            const result = runBattle(party, encounter.monsters, floor, deps);

            if (!result.win) {
                diedOnFloor = floor;
                break;
            }

            // Award XP if levelUp enabled (skip companions — no fish config entry)
            if (sim.levelUp) {
                const rewards = deps.EncounterSystem.calculateRewards(floor, encounter.type, encounter.monsters.length);
                const alive = party.filter(f => f.hp > 0 && !f.isCompanion);
                for (const fish of alive) {
                    deps.PartySystem.awardXP(fish, Math.floor(rewards.xp / alive.length));
                }
            }

            // Post-battle: camp healing after transitions
            for (const t of transitions) {
                if (t === 'camp') {
                    for (const fish of party) {
                        deps.PartySystem.fullHeal(fish);
                    }
                }
            }

            // Shield resets each fight (already handled by createCombatState)
        }

        runResults.push({
            survived: diedOnFloor === null,
            diedOnFloor,
            finalFloor: diedOnFloor || endFloor
        });
    }

    const wins = runResults.filter(r => r.survived).length;
    const deaths = runResults.filter(r => !r.survived);
    const avgDeathFloor = deaths.length > 0
        ? deaths.reduce((s, r) => s + r.diedOnFloor, 0) / deaths.length
        : null;

    const partyForPower = buildParty(preset, deps);
    const { level: partyPL, variance: partyVar } = deps.StatAggregator.computePowerLevel(partyForPower, deps.combatConfig, deps.movesConfig);

    return {
        config: sim.party,
        mode: 'zone-run',
        zone,
        floors: `${startFloor}-${endFloor}`,
        runs,
        seed,
        summary: {
            winRate: wins / runs,
            avgDeathFloor
        },
        powerLevel: {
            party: { level: partyPL, variance: partyVar }
        }
    };
}

function runFullSweep(sim, preset, seed, rng, deps) {
    const runs = sim.runs || 10;
    const encounterConfig = deps.ConfigLoader.getEncounterConfig();
    const floorsPerZone = encounterConfig.floorsPerZone;
    const totalFloors = floorsPerZone * 10; // 10 zones

    const runResults = [];
    for (let r = 0; r < runs; r++) {
        const party = buildParty(preset, deps);
        let diedOnFloor = null;

        for (let floor = 1; floor <= totalFloors; floor++) {
            const encounterType = deps.EncounterSystem.getEncounterType(floor);
            const floorInZone = deps.EncounterSystem.getFloorInZone(floor);
            const transitions = deps.EncounterSystem.getTransitions(floorInZone);

            if (encounterType === 'pvp') continue;

            const encounter = generateEncounter(floor, deps);
            const result = runBattle(party, encounter.monsters, floor, deps);

            if (!result.win) {
                diedOnFloor = floor;
                break;
            }

            if (sim.levelUp) {
                const rewards = deps.EncounterSystem.calculateRewards(floor, encounter.type, encounter.monsters.length);
                const alive = party.filter(f => f.hp > 0 && !f.isCompanion);
                for (const fish of alive) {
                    deps.PartySystem.awardXP(fish, Math.floor(rewards.xp / alive.length));
                }
            }

            for (const t of transitions) {
                if (t === 'camp') {
                    for (const fish of party) {
                        deps.PartySystem.fullHeal(fish);
                    }
                }
            }
        }

        runResults.push({
            survived: diedOnFloor === null,
            diedOnFloor,
            maxFloor: diedOnFloor ? diedOnFloor - 1 : totalFloors
        });
    }

    const survived = runResults.filter(r => r.survived).length;
    const avgMaxFloor = runResults.reduce((s, r) => s + r.maxFloor, 0) / runResults.length;
    const floorDistribution = {};
    for (const r of runResults) {
        if (r.diedOnFloor) {
            const zone = Math.ceil(r.diedOnFloor / floorsPerZone);
            floorDistribution[`zone_${zone}`] = (floorDistribution[`zone_${zone}`] || 0) + 1;
        }
    }

    return {
        config: sim.party,
        mode: 'full-sweep',
        totalFloors,
        runs,
        seed,
        summary: {
            completionRate: survived / runs,
            avgMaxFloor,
            floorDistribution
        }
    };
}

// --- Result Formatting ---

function formatResults(sim, floor, battleResults, seed, preset, deps) {
    const runs = battleResults.length;
    const wins = battleResults.filter(r => r.win).length;

    const avg = (arr, key) => arr.reduce((s, r) => s + r[key], 0) / arr.length;

    const encounterTypes = [...new Set(battleResults.map(r => r.encounterType))];

    const partyForPower = buildParty(preset, deps);
    const { level: partyPL, variance: partyVar } = deps.StatAggregator.computePowerLevel(partyForPower, deps.combatConfig, deps.movesConfig);

    return {
        config: sim.party,
        floor,
        encounter: encounterTypes.join('/'),
        runs,
        seed,
        summary: {
            winRate: wins / runs,
            avgDuration: +avg(battleResults, 'duration').toFixed(2),
            avgHpRemaining: +avg(battleResults, 'hpRemaining').toFixed(1),
            avgShieldRemaining: +avg(battleResults, 'shieldRemaining').toFixed(1),
            avgFishAlive: +avg(battleResults, 'fishAlive').toFixed(2)
        },
        offense: {
            avgDps: +(avg(battleResults, 'totalDamageDealt') / avg(battleResults, 'duration')).toFixed(2),
            avgBurstDamage: +avg(battleResults, 'totalDamageDealt').toFixed(1),
            avgPoisonDamage: +avg(battleResults, 'totalPoisonDamage').toFixed(1),
            avgBurnDamage: +avg(battleResults, 'totalBurnDamage').toFixed(1),
            avgCurseDuration: +avg(battleResults, 'totalCurseDuration').toFixed(1)
        },
        defense: {
            avgDamageTaken: +avg(battleResults, 'totalDamageTaken').toFixed(1),
            avgShieldAbsorbed: +avg(battleResults, 'totalShieldAbsorbed').toFixed(1),
            avgHealingDone: +avg(battleResults, 'totalHealingDone').toFixed(1),
            avgEhp: +deps.StatAggregator.computeEHP(partyForPower, deps.combatConfig).toFixed(1)
        },
        powerLevel: {
            party: { level: +partyPL.toFixed(2), variance: +partyVar.toFixed(3) }
        }
    };
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
