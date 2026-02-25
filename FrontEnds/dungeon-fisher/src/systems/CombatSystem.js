import ConfigLoader from './ConfigLoader.js';

export default class CombatSystem {

    // Create the initial combat state from a party array and a monster object.
    static createCombatState(party, monster) {
        const aliveFish = party.filter(f => f.hp > 0);

        const chunks = aliveFish.map((f, i) => ({
            fishIndex: party.indexOf(f),
            hp: f.hp,
            maxHp: f.maxHp,
            color: f.color,
            shield: f.shield || 0,
            maxShield: f.maxShield || 0
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
                buffs: [],
                shield: f.shield || f.maxShield || 0,
                maxShield: f.maxShield || 0,
                curses: [],
                hots: [],
                burn: null,
                poisons: []
            })),
            monster: {
                ref: monster,
                baseTimer: 0,
                specialTimer: 0,
                poisoned: null,
                buffs: [],
                shield: monster.shield || monster.maxShield || 0,
                maxShield: monster.maxShield || 0,
                curses: [],
                hots: [],
                burn: null,
                poisons: []
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
                const dmgResult = this._applyDamage(state, 'monster', damage, false, events);
                events.push({ type: 'fish_base_attack', fishIndex: i, damage: dmgResult.actualDamage, shieldAbsorbed: dmgResult.shieldAbsorbed });
            }

            // Special attack timer
            const move = ConfigLoader.getMove(f.ref.moves[0]);
            if (move) {
                f.specialTimer += dt;
                if (f.specialTimer >= move.cooldown) {
                    f.specialTimer -= move.cooldown;
                    const monsterDef = this.getEffectiveStat(state.monster, 'def');
                    const damage = this.calculateSpecialDamage(move.damage, monsterDef);
                    let specialDmgResult = { actualDamage: 0, shieldAbsorbed: 0 };
                    if (damage > 0) {
                        specialDmgResult = this._applyDamage(state, 'monster', damage, false, events);
                    }
                    events.push({ type: 'fish_special', fishIndex: i, moveId: move.id, damage: specialDmgResult.actualDamage, shieldAbsorbed: specialDmgResult.shieldAbsorbed, effect: move.effect });

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
                const result = this._applyDamage(state, 'fish', damage, false, events);
                events.push({ type: 'monster_base_attack', damage: result.actualDamage, shieldAbsorbed: result.shieldAbsorbed, targetFishIndex: frontIdx });

                if (result.incapacitated) {
                    this._checkIncapacitations(state, events);
                }
            }

            // Monster special attack
            const mMove = ConfigLoader.getMove(state.monster.ref.specialMove);
            if (mMove) {
                state.monster.specialTimer += dt;
                if (state.monster.specialTimer >= mMove.cooldown) {
                    state.monster.specialTimer -= mMove.cooldown;
                    const targetIdx = this.getFrontFishIndex(state);
                    if (targetIdx !== -1) {
                        const fishDef = this.getEffectiveStat(state.fish[targetIdx], 'def');
                        const damage = this.calculateSpecialDamage(mMove.damage, fishDef);
                        let mSpecialResult = { actualDamage: 0, shieldAbsorbed: 0, incapacitated: false };
                        if (damage > 0) {
                            mSpecialResult = this._applyDamage(state, 'fish', damage, false, events);
                        }
                        events.push({ type: 'monster_special', moveId: mMove.id, damage: mSpecialResult.actualDamage, shieldAbsorbed: mSpecialResult.shieldAbsorbed, effect: mMove.effect, targetFishIndex: targetIdx });

                        if (mMove.effect) {
                            this._applyEffect(state, mMove.effect, 'fish', targetIdx, events);
                        }

                        if (mSpecialResult.incapacitated) {
                            this._checkIncapacitations(state, events);
                        }
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
        const cc = ConfigLoader.getCombatConfig();
        return Math.max(cc.minBaseCooldown, cc.spdToCooldownK / spd);
    }

    // Base attack damage: scales with ATK, reduced by DEF
    static calculateBaseDamage(atk, def) {
        const cc = ConfigLoader.getCombatConfig();
        return Math.max(1, Math.floor(atk * cc.baseAtkK1 - def * cc.baseAtkK2));
    }

    // Special move damage: flat damage reduced by partial DEF
    static calculateSpecialDamage(moveDamage, def) {
        if (moveDamage === 0) return 0;
        const cc = ConfigLoader.getCombatConfig();
        return Math.max(1, moveDamage - Math.floor(def * cc.specialDefFactor));
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

    // Modifier pipeline: base → flat buffs → curse reduction → floor at 0
    static getEffectiveStat(combatant, stat) {
        let value = combatant.ref[stat];

        // Flat buff bonuses
        if (combatant.buffs) {
            for (const buff of combatant.buffs) {
                if (buff.stat === stat) value += buff.amount;
            }
        }

        // Curse reduction: sum active curse percentages, cap, then reduce
        if (combatant.curses && combatant.curses.length > 0) {
            const cc = ConfigLoader.getCombatConfig();
            let totalCursePercent = 0;
            for (const curse of combatant.curses) {
                totalCursePercent += curse.percent;
            }
            totalCursePercent = Math.min(totalCursePercent, cc.curseCap);
            value *= (1 - totalCursePercent);
        }

        return Math.max(0, value);
    }

    // --- Private helpers ---

    // Route damage through shield → HP. Returns { actualDamage, shieldAbsorbed, incapacitated }.
    // targetType: 'monster' or 'fish'. Fish damage hits frontmost living chunk's shield then HP bar.
    static _applyDamage(state, targetType, rawDamage, bypassShield, events) {
        let shieldAbsorbed = 0;
        let remaining = rawDamage;

        if (targetType === 'monster') {
            if (!bypassShield && state.monster.shield > 0) {
                shieldAbsorbed = Math.min(state.monster.shield, remaining);
                state.monster.shield -= shieldAbsorbed;
                remaining -= shieldAbsorbed;
                if (shieldAbsorbed > 0) {
                    events.push({ type: 'shield_hit', target: 'monster', absorbed: shieldAbsorbed });
                }
            }
            if (remaining > 0) {
                state.monster.ref.hp -= remaining;
            }
            return { actualDamage: remaining, shieldAbsorbed, incapacitated: false };
        }

        // Fish target — absorb from frontmost living chunk's shield, then HP bar
        if (!bypassShield) {
            const frontChunk = state.hpBar.chunks.find(c => c.hp > 0);
            if (frontChunk && frontChunk.shield > 0) {
                shieldAbsorbed = Math.min(frontChunk.shield, remaining);
                frontChunk.shield -= shieldAbsorbed;
                remaining -= shieldAbsorbed;
                if (shieldAbsorbed > 0) {
                    events.push({ type: 'shield_hit', target: 'fish', absorbed: shieldAbsorbed });
                }
            }
        }

        let incapacitated = false;
        if (remaining > 0) {
            const result = this.applyDamageToHpBar(state.hpBar, remaining);
            remaining = result.actualDamage;
            incapacitated = result.incapacitated;
        }

        return { actualDamage: remaining, shieldAbsorbed, incapacitated };
    }

    // Get the party index for a fish at combat state index i
    static _partyIndex(state, i) {
        return state.hpBar.chunks[i]?.fishIndex ?? -1;
    }

    // Sync chunk HP and shield back to party refs after battle ends
    static _syncHpBack(state) {
        for (let i = 0; i < state.fish.length; i++) {
            const partyIdx = this._partyIndex(state, i);
            const chunk = state.hpBar.chunks.find(c => c.fishIndex === partyIdx);
            if (chunk) {
                state.fish[i].ref.hp = Math.max(0, chunk.hp);
                state.fish[i].ref.shield = Math.max(0, chunk.shield);
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
                this._applyDamage(state, 'monster', p.damagePerTick, true, events);
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
                const poisonResult = this._applyDamage(state, 'fish', p.damagePerTick, true, events);
                events.push({ type: 'poison_tick', target: 'fish', fishIndex: i, damage: poisonResult.actualDamage });
                if (poisonResult.incapacitated) {
                    this._checkIncapacitations(state, events);
                }
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
