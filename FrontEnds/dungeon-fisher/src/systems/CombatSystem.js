import MOVES from '../data/moves.js';

// Real-time auto-battler combat engine.
// All party fish (1-3) attack simultaneously on independent cooldown timers.
// No player input during battle. SPD determines base attack speed.

// Tuning constants
const BASE_ATK_K1 = 0.6;
const BASE_ATK_K2 = 0.4;
const SPD_TO_COOLDOWN_K = 6;
const MIN_BASE_COOLDOWN = 0.8;
const SPECIAL_DEF_FACTOR = 0.5;

export default class CombatSystem {

    // Create the initial combat state from a party array and a monster object.
    static createCombatState(party, monster) {
        const aliveFish = party.filter(f => f.hp > 0);

        const chunks = aliveFish.map((f, i) => ({
            fishIndex: party.indexOf(f),
            hp: f.hp,
            maxHp: f.maxHp,
            color: f.color
        }));

        const total = chunks.reduce((sum, c) => sum + c.hp, 0);
        const totalMax = chunks.reduce((sum, c) => sum + c.maxHp, 0);

        return {
            fish: aliveFish.map(f => ({
                ref: f,
                alive: true,
                baseTimer: 0,
                specialTimer: 0,
                poisoned: null,
                buffs: []
            })),
            monster: {
                ref: monster,
                baseTimer: 0,
                specialTimer: 0,
                poisoned: null,
                buffs: []
            },
            hpBar: { chunks, total, totalMax },
            running: true
        };
    }

    // Tick all timers and return an array of combat events.
    // deltaMs comes from Phaser's update(time, delta) in milliseconds.
    static update(state, deltaMs) {
        if (!state.running) return [];

        const dt = Math.min(deltaMs, 100) / 1000;
        const events = [];

        // 1. Tick fish timers
        for (let i = 0; i < state.fish.length; i++) {
            const f = state.fish[i];
            if (!f.alive) continue;

            const effSpd = this.getEffectiveStat(f, 'spd');
            const effAtk = this.getEffectiveStat(f, 'atk');
            const effDef = this.getEffectiveStat(f, 'def');

            // Base attack timer
            const baseCd = this.getBaseAttackCooldown(effSpd);
            f.baseTimer += dt;
            if (f.baseTimer >= baseCd) {
                f.baseTimer -= baseCd;
                const monsterDef = this.getEffectiveStat(state.monster, 'def');
                const damage = this.calculateBaseDamage(effAtk, monsterDef);
                state.monster.ref.hp -= damage;
                events.push({ type: 'fish_base_attack', fishIndex: i, damage });
            }

            // Special attack timer
            const move = MOVES[f.ref.moves[0]];
            if (move) {
                f.specialTimer += dt;
                if (f.specialTimer >= move.cooldown) {
                    f.specialTimer -= move.cooldown;
                    const monsterDef = this.getEffectiveStat(state.monster, 'def');
                    const damage = this.calculateSpecialDamage(move.damage, monsterDef);
                    if (damage > 0) {
                        state.monster.ref.hp -= damage;
                    }
                    events.push({ type: 'fish_special', fishIndex: i, moveId: move.id, damage, effect: move.effect });

                    // Apply effect
                    if (move.effect) {
                        this._applyEffect(state, move.effect, 'monster', i, events);
                    }
                }
            }
        }

        // 2. Check monster death
        if (state.monster.ref.hp <= 0) {
            state.monster.ref.hp = 0;
            state.running = false;
            events.push({ type: 'monster_dead' });
            // Sync HP back to party refs
            this._syncHpBack(state);
            return events;
        }

        // 3. Tick monster timers
        const mEffSpd = this.getEffectiveStat(state.monster, 'spd');
        const mEffAtk = this.getEffectiveStat(state.monster, 'atk');
        const frontIdx = this.getFrontFishIndex(state);

        if (frontIdx !== -1) {
            // Monster base attack
            const mBaseCd = this.getBaseAttackCooldown(mEffSpd);
            state.monster.baseTimer += dt;
            if (state.monster.baseTimer >= mBaseCd) {
                state.monster.baseTimer -= mBaseCd;
                const fishDef = this.getEffectiveStat(state.fish[frontIdx], 'def');
                const damage = this.calculateBaseDamage(mEffAtk, fishDef);
                const result = this.applyDamageToHpBar(state.hpBar, damage);
                events.push({ type: 'monster_base_attack', damage: result.actualDamage, targetFishIndex: frontIdx });

                // 4. Check for newly incapacitated fish
                if (result.incapacitated) {
                    const incapFish = state.fish.find((f, fi) =>
                        state.hpBar.chunks.find(c => c.fishIndex === this._partyIndex(state, fi))?.hp <= 0 && f.alive
                    );
                    this._checkIncapacitations(state, events);
                }
            }

            // Monster special attack
            const mMove = MOVES[state.monster.ref.specialMove];
            if (mMove) {
                state.monster.specialTimer += dt;
                if (state.monster.specialTimer >= mMove.cooldown) {
                    state.monster.specialTimer -= mMove.cooldown;
                    const targetIdx = this.getFrontFishIndex(state);
                    if (targetIdx !== -1) {
                        const fishDef = this.getEffectiveStat(state.fish[targetIdx], 'def');
                        const damage = this.calculateSpecialDamage(mMove.damage, fishDef);
                        if (damage > 0) {
                            const result = this.applyDamageToHpBar(state.hpBar, damage);
                            events.push({ type: 'monster_special', moveId: mMove.id, damage: result.actualDamage, effect: mMove.effect, targetFishIndex: targetIdx });
                        } else {
                            events.push({ type: 'monster_special', moveId: mMove.id, damage: 0, effect: mMove.effect, targetFishIndex: targetIdx });
                        }

                        if (mMove.effect) {
                            this._applyEffect(state, mMove.effect, 'fish', targetIdx, events);
                        }

                        this._checkIncapacitations(state, events);
                    }
                }
            }
        }

        // 5. Check all chunks depleted
        if (state.hpBar.chunks.every(c => c.hp <= 0)) {
            state.running = false;
            events.push({ type: 'party_dead' });
            this._syncHpBack(state);
            return events;
        }

        // 6. Tick poison timers
        this._tickPoisons(state, dt, events);

        // 7. Re-check death conditions after poison
        if (state.monster.ref.hp <= 0) {
            state.monster.ref.hp = 0;
            state.running = false;
            events.push({ type: 'monster_dead' });
            this._syncHpBack(state);
            return events;
        }
        if (state.hpBar.chunks.every(c => c.hp <= 0)) {
            state.running = false;
            events.push({ type: 'party_dead' });
            this._syncHpBack(state);
            return events;
        }

        // 8. Tick buff durations
        this._tickBuffs(state, dt, events);

        return events;
    }

    // SPD-to-cooldown conversion: higher SPD = faster attacks
    static getBaseAttackCooldown(spd) {
        return Math.max(MIN_BASE_COOLDOWN, SPD_TO_COOLDOWN_K / spd);
    }

    // Base attack damage: scales with ATK, reduced by DEF
    static calculateBaseDamage(atk, def) {
        return Math.max(1, Math.floor(atk * BASE_ATK_K1 - def * BASE_ATK_K2));
    }

    // Special move damage: flat damage reduced by partial DEF
    static calculateSpecialDamage(moveDamage, def) {
        if (moveDamage === 0) return 0;
        return Math.max(1, moveDamage - Math.floor(def * SPECIAL_DEF_FACTOR));
    }

    // Apply damage to the combined HP bar, hitting the frontmost living chunk first.
    // Returns { fishIndex, actualDamage, incapacitated }
    static applyDamageToHpBar(hpBar, damage) {
        let remaining = damage;
        let lastFishIndex = -1;
        let anyIncapacitated = false;

        for (const chunk of hpBar.chunks) {
            if (chunk.hp <= 0) continue;
            lastFishIndex = chunk.fishIndex;
            const absorbed = Math.min(remaining, chunk.hp);
            chunk.hp -= absorbed;
            remaining -= absorbed;
            hpBar.total -= absorbed;
            if (chunk.hp <= 0) anyIncapacitated = true;
            if (remaining <= 0) break;
        }

        return {
            fishIndex: lastFishIndex,
            actualDamage: damage - remaining,
            incapacitated: anyIncapacitated
        };
    }

    // Get index of frontmost living fish in the combat state's fish array
    static getFrontFishIndex(state) {
        for (let i = 0; i < state.fish.length; i++) {
            if (state.fish[i].alive) {
                const partyIdx = this._partyIndex(state, i);
                const chunk = state.hpBar.chunks.find(c => c.fishIndex === partyIdx);
                if (chunk && chunk.hp > 0) return i;
            }
        }
        return -1;
    }

    // Get effective stat value (base + buff bonuses)
    // Reads from the combat state's buffs array on the combatant
    static getEffectiveStat(combatant, stat) {
        let value = combatant.ref[stat];
        if (combatant.buffs) {
            for (const buff of combatant.buffs) {
                if (buff.stat === stat) value += buff.amount;
            }
        }
        return value;
    }

    // --- Private helpers ---

    // Get the party index for a fish at combat state index i
    static _partyIndex(state, i) {
        return state.hpBar.chunks[i]?.fishIndex ?? -1;
    }

    // Sync chunk HP back to party refs after battle ends
    static _syncHpBack(state) {
        for (let i = 0; i < state.fish.length; i++) {
            const partyIdx = this._partyIndex(state, i);
            const chunk = state.hpBar.chunks.find(c => c.fishIndex === partyIdx);
            if (chunk) {
                state.fish[i].ref.hp = Math.max(0, chunk.hp);
            }
        }
    }

    // Check for newly incapacitated fish and emit events
    static _checkIncapacitations(state, events) {
        for (let i = 0; i < state.fish.length; i++) {
            if (!state.fish[i].alive) continue;
            const partyIdx = this._partyIndex(state, i);
            const chunk = state.hpBar.chunks.find(c => c.fishIndex === partyIdx);
            if (chunk && chunk.hp <= 0) {
                state.fish[i].alive = false;
                events.push({ type: 'fish_incapacitated', fishIndex: i });
            }
        }
    }

    // Apply a move effect (poison, heal, buff)
    static _applyEffect(state, effect, target, sourceIndex, events) {
        if (effect.type === 'poison') {
            if (target === 'monster') {
                if (!state.monster.poisoned) {
                    state.monster.poisoned = {
                        damagePerTick: effect.damagePerTick,
                        ticksLeft: effect.ticks,
                        interval: effect.interval,
                        timer: 0
                    };
                }
            } else {
                // Poison the frontmost living fish
                const frontIdx = this.getFrontFishIndex(state);
                if (frontIdx !== -1 && !state.fish[frontIdx].poisoned) {
                    state.fish[frontIdx].poisoned = {
                        damagePerTick: effect.damagePerTick,
                        ticksLeft: effect.ticks,
                        interval: effect.interval,
                        timer: 0
                    };
                }
            }
        } else if (effect.type === 'heal') {
            const frontIdx = this.getFrontFishIndex(state);
            if (frontIdx !== -1) {
                const partyIdx = this._partyIndex(state, frontIdx);
                const chunk = state.hpBar.chunks.find(c => c.fishIndex === partyIdx);
                if (chunk && chunk.hp > 0) {
                    const before = chunk.hp;
                    chunk.hp = Math.min(chunk.maxHp, chunk.hp + effect.amount);
                    const healed = chunk.hp - before;
                    state.hpBar.total += healed;
                    events.push({ type: 'heal', fishIndex: frontIdx, amount: healed });
                }
            }
        } else if (effect.type === 'buff') {
            if (target === 'monster') {
                state.monster.buffs.push({ stat: effect.stat, amount: effect.amount, remaining: effect.duration });
                events.push({ type: 'buff_applied', target: 'monster', stat: effect.stat, amount: effect.amount, duration: effect.duration });
            } else {
                // Buff the fish that used the move
                state.fish[sourceIndex].buffs.push({ stat: effect.stat, amount: effect.amount, remaining: effect.duration });
                events.push({ type: 'buff_applied', target: 'fish', fishIndex: sourceIndex, stat: effect.stat, amount: effect.amount, duration: effect.duration });
            }
        }
    }

    // Tick all poison timers and apply damage
    static _tickPoisons(state, dt, events) {
        // Monster poison
        if (state.monster.poisoned) {
            const p = state.monster.poisoned;
            p.timer += dt;
            while (p.timer >= p.interval && p.ticksLeft > 0) {
                p.timer -= p.interval;
                p.ticksLeft--;
                state.monster.ref.hp -= p.damagePerTick;
                events.push({ type: 'poison_tick', target: 'monster', damage: p.damagePerTick });
            }
            if (p.ticksLeft <= 0) {
                state.monster.poisoned = null;
            }
        }

        // Fish poison (damages frontmost chunk)
        for (let i = 0; i < state.fish.length; i++) {
            const f = state.fish[i];
            if (!f.alive || !f.poisoned) continue;
            const p = f.poisoned;
            p.timer += dt;
            while (p.timer >= p.interval && p.ticksLeft > 0) {
                p.timer -= p.interval;
                p.ticksLeft--;
                this.applyDamageToHpBar(state.hpBar, p.damagePerTick);
                events.push({ type: 'poison_tick', target: 'fish', fishIndex: i, damage: p.damagePerTick });
                this._checkIncapacitations(state, events);
            }
            if (p.ticksLeft <= 0) {
                f.poisoned = null;
            }
        }
    }

    // Tick buff durations and expire them
    static _tickBuffs(state, dt, events) {
        // Monster buffs
        state.monster.buffs = state.monster.buffs.filter(b => {
            b.remaining -= dt;
            if (b.remaining <= 0) {
                events.push({ type: 'buff_expired', target: 'monster', stat: b.stat });
                return false;
            }
            return true;
        });

        // Fish buffs
        for (let i = 0; i < state.fish.length; i++) {
            state.fish[i].buffs = state.fish[i].buffs.filter(b => {
                b.remaining -= dt;
                if (b.remaining <= 0) {
                    events.push({ type: 'buff_expired', target: 'fish', fishIndex: i, stat: b.stat });
                    return false;
                }
                return true;
            });
        }
    }
}
