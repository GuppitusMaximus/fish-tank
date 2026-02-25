// Pure stat aggregation functions — no Phaser imports.
// All computations take party configs and return numeric values.

import ConfigLoader from './ConfigLoader.js';

function getBaseAttackCooldown(spd, cc) {
    return Math.max(cc.minBaseCooldown, cc.spdToCooldownK / spd);
}

function estimateBurnTotal(initialDmg, decayPerSecond) {
    if (initialDmg <= 0) return 0;
    const ticks = Math.ceil(initialDmg / decayPerSecond);
    let total = 0;
    for (let i = 0; i < ticks; i++) {
        total += Math.max(0, initialDmg - i * decayPerSecond);
    }
    return total;
}

export function computeDPS(party, combatConfig, movesConfig) {
    let total = 0;
    for (const fish of party) {
        if (fish.hp <= 0) continue;

        const cooldown = getBaseAttackCooldown(fish.spd, combatConfig);
        const baseDPS = (fish.atk * combatConfig.baseAtkK1) / cooldown;

        let specialDPS = 0;
        let dotDPS = 0;

        const moveId = fish.moves?.[0];
        const move = moveId ? movesConfig[moveId] : null;
        if (move) {
            if (move.damage > 0) {
                specialDPS = move.damage / move.cooldown;
            }
            if (move.effect) {
                const eff = move.effect;
                if (eff.type === 'poison') {
                    dotDPS += (eff.damagePerTick * eff.ticks) / move.cooldown;
                } else if (eff.type === 'burn' || eff.type === 'burn_aoe') {
                    const d = eff.initialDamage || eff.damage || 0;
                    dotDPS += estimateBurnTotal(d, combatConfig.burnDecayPerSecond) / move.cooldown;
                } else if (eff.type === 'burn_curse') {
                    const d = typeof eff.burnInitial === 'number'
                        ? eff.burnInitial
                        : (eff.burnInitial?.base || 0);
                    dotDPS += estimateBurnTotal(d, combatConfig.burnDecayPerSecond) / move.cooldown;
                }
            }
        }

        total += baseDPS + specialDPS + dotDPS;
    }
    return total;
}

export function computeEHP(party, combatConfig) {
    const defFactor = 1 / (combatConfig.defMitigationEstimate || 15);
    const battleDuration = combatConfig.expectedBattleDuration || 15;
    const moves = ConfigLoader.getMoves();
    let total = 0;

    for (const fish of party) {
        if (fish.hp <= 0) continue;

        const effectiveHp = fish.maxHp * (1 + fish.def * defFactor);
        const shield = fish.maxShield || 0;

        let healingThroughput = 0;
        const moveId = fish.moves?.[0];
        const move = moveId ? moves[moveId] : null;
        if (move?.effect) {
            const eff = move.effect;
            const hp = fish.healPower || 0;
            if (eff.type === 'heal_hot') {
                const scale = 1 + hp * 0.1;
                const burst = (eff.burstHeal || 0) * scale;
                const hot = (eff.hotAmount || 0) * (eff.hotTicks || 0) * scale;
                healingThroughput = (burst + hot) * (battleDuration / move.cooldown);
            } else if (eff.type === 'hot') {
                const scale = 1 + hp * (eff.scalingFactor || 1);
                const hot = (eff.baseHealAmount || 0) * scale * (eff.ticks || 0);
                healingThroughput = hot * (battleDuration / move.cooldown);
            } else if (eff.type === 'heal') {
                healingThroughput = (eff.amount || 0) * (battleDuration / move.cooldown);
            } else if (eff.type === 'shield_grant') {
                healingThroughput = (eff.amount || 0) * (battleDuration / move.cooldown);
            }
        }

        total += effectiveHp + shield + healingThroughput;
    }
    return total;
}

export function computeBurst(party, combatConfig, movesConfig, windowSeconds) {
    const window = windowSeconds ?? combatConfig.burstWindow ?? 3;
    let total = 0;

    for (const fish of party) {
        if (fish.hp <= 0) continue;

        const cooldown = getBaseAttackCooldown(fish.spd, combatConfig);
        if (cooldown <= window) {
            total += fish.atk * combatConfig.baseAtkK1;
        }

        const moveId = fish.moves?.[0];
        const move = moveId ? movesConfig[moveId] : null;
        if (move && move.damage > 0 && move.cooldown <= window) {
            total += move.damage;
        }
    }
    return total;
}

export function computeThreat(party, combatConfig, movesConfig) {
    const weights = combatConfig.threatWeights || { dps: 0.4, burst: 0.3, ehp: 0.3 };
    const dps = computeDPS(party, combatConfig, movesConfig);
    const burst = computeBurst(party, combatConfig, movesConfig);
    const ehp = computeEHP(party, combatConfig);
    return dps * weights.dps + burst * weights.burst + ehp * weights.ehp;
}

export function computePowerLevel(party, combatConfig, movesConfig) {
    const scaling = combatConfig.powerLevelScaling || 10;
    const threat = computeThreat(party, combatConfig, movesConfig);
    const level = threat / scaling;

    // Variance: coefficient of variation of per-fish threat contributions
    const perFish = [];
    for (const fish of party) {
        if (fish.hp <= 0) continue;
        const single = computeThreat([fish], combatConfig, movesConfig);
        perFish.push(single);
    }

    let variance = 0;
    if (perFish.length > 1) {
        const mean = perFish.reduce((a, b) => a + b, 0) / perFish.length;
        if (mean > 0) {
            const sumSqDiff = perFish.reduce((s, v) => s + (v - mean) ** 2, 0);
            const std = Math.sqrt(sumSqDiff / perFish.length);
            variance = std / mean;
        }
    }

    return { level, variance };
}

export default {
    computeDPS,
    computeEHP,
    computeBurst,
    computeThreat,
    computePowerLevel
};
