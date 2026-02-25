#!/usr/bin/env node
/**
 * QA verification for bsf-simulation plan (Phase 8).
 * Validates: StatAggregator, GhostGenerator, headless CLI, simulation modes,
 * levelUp toggle, seed determinism, output schema, combat.json constants.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DF_ROOT = path.join(__dirname, '..', '..', 'dungeon-fisher');
const SRC = path.join(DF_ROOT, 'src');
const CONFIG = path.join(SRC, 'config');
const TOOLS = path.join(DF_ROOT, 'tools');

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

function runSim(configPath) {
    try {
        const out = execSync(`node tools/simulate.js ${configPath}`, {
            cwd: DF_ROOT, encoding: 'utf8', timeout: 60000
        });
        return JSON.parse(out);
    } catch (e) {
        return null;
    }
}

// --- Step 1: StatAggregator functions ---
section('1. StatAggregator functions');

const statSrc = readFile(path.join(SRC, 'systems', 'StatAggregator.js'));
if (!statSrc) { fail('Could not read StatAggregator.js'); process.exit(1); }

const statFunctions = ['computeDPS', 'computeEHP', 'computeBurst', 'computeThreat', 'computePowerLevel'];
for (const fn of statFunctions) {
    if (statSrc.includes(`export function ${fn}(`)) {
        ok(`${fn} exported`);
    } else {
        fail(`${fn} not found as exported function`);
    }
}

// computeDPS handles poison + burn DoT
if (statSrc.includes("eff.type === 'poison'") && statSrc.includes("eff.type === 'burn'")) {
    ok('computeDPS accounts for poison and burn DoT');
} else {
    fail('computeDPS missing DoT handling');
}

// computeEHP includes shield + healing throughput
if (statSrc.includes('maxShield') && statSrc.includes('healingThroughput')) {
    ok('computeEHP reflects HP + DEF + shield + healing');
} else {
    fail('computeEHP missing shield or healing');
}

// computeBurst uses burstWindow
if (statSrc.includes('burstWindow')) {
    ok('computeBurst uses burstWindow from config');
} else {
    fail('computeBurst missing burstWindow');
}

// computeThreat uses weighted combination
if (statSrc.includes('threatWeights') && statSrc.includes('weights.dps') && statSrc.includes('weights.burst') && statSrc.includes('weights.ehp')) {
    ok('computeThreat uses weighted DPS + burst + EHP');
} else {
    fail('computeThreat missing weight components');
}

// computePowerLevel returns { level, variance }
if (statSrc.includes('return { level, variance }')) {
    ok('computePowerLevel returns { level, variance }');
} else {
    fail('computePowerLevel missing level/variance return');
}

// No Phaser imports
if (!statSrc.includes("from 'phaser'") && !statSrc.includes('import Phaser')) {
    ok('StatAggregator has no Phaser imports');
} else {
    fail('StatAggregator imports Phaser');
}

// --- Step 2: GhostGenerator ---
section('2. GhostGenerator');

const ghostSrc = readFile(path.join(SRC, 'systems', 'GhostGenerator.js'));
if (!ghostSrc) { fail('Could not read GhostGenerator.js'); process.exit(1); }

if (ghostSrc.includes('export function generateGhostParty(')) {
    ok('generateGhostParty exported');
} else {
    fail('generateGhostParty not found');
}

// Returns 3-fish party
if (ghostSrc.includes('fish:') && ghostSrc.includes('speciesId') && ghostSrc.includes('level')) {
    ok('Ghost config has fish with speciesId and level');
} else {
    fail('Ghost config missing fish structure');
}

// 80% balanced, 20% skewed
if (ghostSrc.includes('0.8')) {
    ok('~80% balanced / ~20% skewed composition split');
} else {
    fail('Missing 80/20 balanced/skewed split');
}

// Balanced comps include tank + DPS + healer
if (ghostSrc.includes('BALANCED_COMPS') && ghostSrc.includes("'tank'") && ghostSrc.includes("'dps'") && ghostSrc.includes("'healer'")) {
    ok('Balanced comps include tank + DPS + healer');
} else {
    fail('Balanced comps missing expected roles');
}

// Serializable config with order and items
if (ghostSrc.includes('order:') && ghostSrc.includes('items:')) {
    ok('Ghost config includes order and items (serializable)');
} else {
    fail('Ghost config missing order or items');
}

// Uses computePowerLevel for level matching
if (ghostSrc.includes('computePowerLevel')) {
    ok('GhostGenerator uses computePowerLevel for floor matching');
} else {
    fail('GhostGenerator missing power level matching');
}

// No Phaser imports
if (!ghostSrc.includes("from 'phaser'") && !ghostSrc.includes('import Phaser')) {
    ok('GhostGenerator has no Phaser imports');
} else {
    fail('GhostGenerator imports Phaser');
}

// --- Step 3: Headless simulation CLI ---
section('3. Headless simulation CLI');

const simScript = path.join(TOOLS, 'simulate.js');
const exampleConfig = path.join(TOOLS, 'example-sim.json');

if (fs.existsSync(simScript)) {
    ok('tools/simulate.js exists');
} else {
    fail('tools/simulate.js missing');
}

if (fs.existsSync(exampleConfig)) {
    ok('tools/example-sim.json exists');
} else {
    fail('tools/example-sim.json missing');
}

const simSrc = readFile(simScript);
if (simSrc) {
    // No Phaser dependency
    if (!simSrc.includes("from 'phaser'") && !simSrc.includes('import Phaser') && !simSrc.includes("require('phaser')")) {
        ok('simulate.js has no Phaser dependency');
    } else {
        fail('simulate.js imports Phaser');
    }

    // ConfigLoader strict mode
    if (simSrc.includes('strict: true')) {
        ok('ConfigLoader initialized in strict mode');
    } else {
        fail('ConfigLoader not in strict mode');
    }
}

// Actually run the simulation
const exampleResults = runSim(exampleConfig);
if (exampleResults && Array.isArray(exampleResults) && exampleResults.length === 4) {
    ok('example-sim.json runs without errors (4 results)');
} else {
    fail(`example-sim.json failed or wrong result count: ${exampleResults ? exampleResults.length : 'null'}`);
}

// Output is valid JSON (already parsed above, so this passed)
if (exampleResults) {
    ok('Output is valid JSON');
}

// --- Step 4: Simulation modes ---
section('4. Simulation modes');

if (exampleResults) {
    // single-floor
    const sf = exampleResults.find(r => r.floor && r.summary && r.offense);
    if (sf && typeof sf.summary.winRate === 'number' && sf.offense) {
        ok('single-floor mode: returns summary + offense + defense stats');
    } else {
        fail('single-floor mode: missing expected output structure');
    }

    // zone-run
    const zr = exampleResults.find(r => r.mode === 'zone-run');
    if (zr && zr.floors && typeof zr.summary.winRate === 'number') {
        ok('zone-run mode: runs all floors of a zone');
    } else {
        fail('zone-run mode: missing expected output structure');
    }

    // full-sweep
    const fs2 = exampleResults.find(r => r.mode === 'full-sweep');
    if (fs2 && fs2.totalFloors === 100 && typeof fs2.summary.completionRate === 'number') {
        ok('full-sweep mode: runs all 100 floors');
    } else {
        fail('full-sweep mode: missing expected output or wrong totalFloors');
    }
}

// --- Step 5: LevelUp toggle ---
section('5. LevelUp toggle');

const levelUpConfig = {
    parties: {
        test: {
            character: 'andy',
            fish: [
                { speciesId: 'pufferfish', level: 1 },
                { speciesId: 'swordfish', level: 1 },
                { speciesId: 'seahorse', level: 1 }
            ],
            companionLevel: 1,
            order: [0, 1, 2],
            items: []
        }
    },
    simulations: [
        { party: 'test', mode: 'full-sweep', levelUp: true, runs: 5, seed: 99 },
        { party: 'test', mode: 'full-sweep', levelUp: false, runs: 5, seed: 99 }
    ]
};

const lvlPath = path.join(DF_ROOT, '/tmp-levelup-test.json');
fs.writeFileSync(lvlPath, JSON.stringify(levelUpConfig));
const lvlResults = runSim(lvlPath);
fs.unlinkSync(lvlPath);

if (lvlResults && lvlResults.length === 2) {
    const withLvl = lvlResults[0].summary.avgMaxFloor;
    const withoutLvl = lvlResults[1].summary.avgMaxFloor;
    if (withLvl > withoutLvl) {
        ok(`levelUp: true (avgMaxFloor=${withLvl}) > levelUp: false (${withoutLvl})`);
    } else {
        fail(`levelUp toggle: expected true > false, got ${withLvl} vs ${withoutLvl}`);
    }
} else {
    fail('LevelUp toggle test: simulation failed');
}

// --- Step 6: Seed determinism ---
section('6. Seed determinism');

const run1 = runSim(exampleConfig);
const run2 = runSim(exampleConfig);

if (run1 && run2) {
    const json1 = JSON.stringify(run1);
    const json2 = JSON.stringify(run2);
    if (json1 === json2) {
        ok('Same seed produces identical results across runs');
    } else {
        fail('Seed determinism broken: different results with same seed');
    }
} else {
    fail('Could not run simulation for determinism test');
}

// No seed generates a random seed and records it
const noSeedConfig = {
    parties: {
        test: {
            character: 'andy',
            fish: [{ speciesId: 'pufferfish', level: 5 }],
            companionLevel: 5,
            order: [0],
            items: []
        }
    },
    simulations: [
        { party: 'test', mode: 'single-floor', floor: 5, runs: 3 }
    ]
};

const nsPath = path.join(DF_ROOT, '/tmp-noseed-test.json');
fs.writeFileSync(nsPath, JSON.stringify(noSeedConfig));
const nsResults = runSim(nsPath);
fs.unlinkSync(nsPath);

if (nsResults && nsResults[0] && typeof nsResults[0].seed === 'number') {
    ok(`No seed: random seed generated and recorded (${nsResults[0].seed})`);
} else {
    fail('No seed: seed not recorded in output');
}

// --- Step 7: Output schema ---
section('7. Output schema (FR-18)');

if (exampleResults) {
    const sf = exampleResults[0]; // single-floor result

    const summaryKeys = ['winRate', 'avgDuration', 'avgHpRemaining', 'avgFishAlive'];
    const offenseKeys = ['avgDps', 'avgBurstDamage', 'avgPoisonDamage', 'avgBurnDamage'];
    const defenseKeys = ['avgDamageTaken', 'avgShieldAbsorbed', 'avgHealingDone'];
    const powerKeys = ['level', 'variance'];

    for (const key of summaryKeys) {
        if (typeof sf.summary?.[key] === 'number') {
            ok(`summary.${key} present (${sf.summary[key]})`);
        } else {
            fail(`summary.${key} missing or not a number`);
        }
    }

    for (const key of offenseKeys) {
        if (typeof sf.offense?.[key] === 'number') {
            ok(`offense.${key} present (${sf.offense[key]})`);
        } else {
            fail(`offense.${key} missing or not a number`);
        }
    }

    for (const key of defenseKeys) {
        if (typeof sf.defense?.[key] === 'number') {
            ok(`defense.${key} present (${sf.defense[key]})`);
        } else {
            fail(`defense.${key} missing or not a number`);
        }
    }

    for (const key of powerKeys) {
        if (typeof sf.powerLevel?.party?.[key] === 'number') {
            ok(`powerLevel.party.${key} present (${sf.powerLevel.party[key]})`);
        } else {
            fail(`powerLevel.party.${key} missing or not a number`);
        }
    }
}

// --- Step 8: combat.json aggregation constants ---
section('8. combat.json aggregation constants');

const combatCfg = readJSON(path.join(CONFIG, 'combat.json'));
if (!combatCfg) { fail('Could not read combat.json'); }

if (combatCfg) {
    const requiredConstants = ['threatWeights', 'powerLevelScaling', 'burstWindow', 'defMitigationEstimate'];
    for (const key of requiredConstants) {
        if (combatCfg[key] !== undefined) {
            ok(`${key} present (${JSON.stringify(combatCfg[key])})`);
        } else {
            fail(`${key} missing from combat.json`);
        }
    }

    // threatWeights shape
    const tw = combatCfg.threatWeights;
    if (tw && typeof tw.dps === 'number' && typeof tw.burst === 'number' && typeof tw.ehp === 'number') {
        ok(`threatWeights has dps/burst/ehp (${tw.dps}/${tw.burst}/${tw.ehp})`);
    } else {
        fail('threatWeights missing dps, burst, or ehp');
    }

    // Verify StatAggregator reads these via ConfigLoader
    if (statSrc.includes('combatConfig.threatWeights') || statSrc.includes('combatConfig.powerLevelScaling')) {
        ok('StatAggregator reads constants via combatConfig parameter');
    } else {
        fail('StatAggregator does not read from combatConfig');
    }
}

// --- Summary ---
console.log(`\n========================================`);
console.log(`QA bsf-simulation: ${passed} passed, ${failed} failed`);
console.log(`========================================`);
process.exit(failed > 0 ? 1 : 0);
