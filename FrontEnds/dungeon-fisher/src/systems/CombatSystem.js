import ConfigLoader from './ConfigLoader.js';

export default class CombatSystem {

    // Create the initial combat state from a party array and a monster object.
    // floor: current dungeon floor number for scaling calculations.
    static createCombatState(party, monster, floor = 1) {
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
                healPulseTimer: 0,
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
            floor: floor,
            running: true
        };
    }

    // Tick all timers and return an array of combat events.
    // deltaMs comes from Phaser's update(time, delta) in milliseconds.
    // FR-24 tick order: attacks → DoTs → heals → buffs/curses → death checks last
    static update(state, deltaMs) {
        if (!state.running) return [];

        const dt = Math.min(deltaMs, 100) / 1000;
        const events = [];

        // 1. Fish base attack timers
        for (let i = 0; i < state.fish.length; i++) {
            const f = state.fish[i];
            if (!f.alive) continue;

            const effSpd = this.getEffectiveStat(f, 'spd');
            const effAtk = this.getEffectiveStat(f, 'atk');

            const baseCd = this.getBaseAttackCooldown(effSpd);
            f.baseTimer += dt;
            if (f.baseTimer >= baseCd) {
                f.baseTimer -= baseCd;
                const monsterDef = this.getEffectiveStat(state.monster, 'def');
                const damage = this.calculateBaseDamage(effAtk, monsterDef);
                const dmgResult = this._applyDamage(state, 'monster', damage, false, events);
                events.push({ type: 'fish_base_attack', fishIndex: i, damage: dmgResult.actualDamage, shieldAbsorbed: dmgResult.shieldAbsorbed });
            }
        }

        // 2. Fish special move timers
        for (let i = 0; i < state.fish.length; i++) {
            const f = state.fish[i];
            if (!f.alive) continue;

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

                    if (move.effect) {
                        this._applyEffect(state, move.effect, 'monster', i, events);
                    }
                }
            }
        }

        // 3. Monster base attack timer
        const mEffSpd = this.getEffectiveStat(state.monster, 'spd');
        const mEffAtk = this.getEffectiveStat(state.monster, 'atk');
        const frontIdx = this.getFrontFishIndex(state);

        if (frontIdx !== -1) {
            const mBaseCd = this.getBaseAttackCooldown(mEffSpd);
            state.monster.baseTimer += dt;
            if (state.monster.baseTimer >= mBaseCd) {
                state.monster.baseTimer -= mBaseCd;
                const fishDef = this.getEffectiveStat(state.fish[frontIdx], 'def');
                const damage = this.calculateBaseDamage(mEffAtk, fishDef);
                const result = this._applyDamage(state, 'fish', damage, false, events);
                events.push({ type: 'monster_base_attack', damage: result.actualDamage, shieldAbsorbed: result.shieldAbsorbed, targetFishIndex: frontIdx });
            }
        }

        // 4. Monster special move timer (with floor-scaled damage)
        if (frontIdx !== -1) {
            const mMove = ConfigLoader.getMove(state.monster.ref.specialMove);
            if (mMove) {
                state.monster.specialTimer += dt;
                if (state.monster.specialTimer >= mMove.cooldown) {
                    state.monster.specialTimer -= mMove.cooldown;
                    const targetIdx = this.getFrontFishIndex(state);
                    if (targetIdx !== -1) {
                        const fishDef = this.getEffectiveStat(state.fish[targetIdx], 'def');
                        const scaledDamage = this._resolveScaledValue(mMove, 'damage', mMove.damage, state.floor);
                        const damage = this.calculateSpecialDamage(scaledDamage, fishDef);
                        let mSpecialResult = { actualDamage: 0, shieldAbsorbed: 0 };
                        if (damage > 0) {
                            mSpecialResult = this._applyDamage(state, 'fish', damage, false, events);
                        }
                        events.push({ type: 'monster_special', moveId: mMove.id, damage: mSpecialResult.actualDamage, shieldAbsorbed: mSpecialResult.shieldAbsorbed, effect: mMove.effect, targetFishIndex: targetIdx });

                        // Life drain: heal monster by portion of special damage dealt
                        this._applyLifeDrain(state, mSpecialResult.actualDamage, events);

                        if (mMove.effect) {
                            this._applyScaledEffect(state, mMove, 'fish', targetIdx, events);
                        }
                    }
                }
            }

            // 4b. Dungeon Lord heal pulse timer (third ability)
            const healPulseId = state.monster.ref.healingBehavior?.healPulseMove;
            if (healPulseId) {
                const hpMove = ConfigLoader.getMove(healPulseId);
                if (hpMove) {
                    state.monster.healPulseTimer += dt;
                    if (state.monster.healPulseTimer >= hpMove.cooldown) {
                        state.monster.healPulseTimer -= hpMove.cooldown;
                        if (hpMove.effect) {
                            this._applyScaledEffect(state, hpMove, 'monster_allies', -1, events);
                        }
                    }
                }
            }
        }

        // 5. Tick poisons (bypass shield)
        this._tickPoisons(state, dt, events);

        // 6. Tick burns (through damage pipeline)
        this._tickBurns(state, dt, events);

        // 7. Tick HoTs (heal frontmost)
        this._tickHoTs(state, dt, events);

        // 8. Tick passive regen (monster self-heal)
        this._tickPassiveRegen(state, dt, events);

        // 9. Tick buff/curse durations, expire finished
        this._tickBuffs(state, dt, events);
        this._tickCurses(state, dt, events);

        // 10. Death checks — mark incapacitated, check battle end
        this._checkIncapacitations(state, events);

        // Simultaneous death: if both sides dead, player wins (fish attacks processed first)
        const monsterDead = state.monster.ref.hp <= 0;
        const partyDead = state.hpBar.chunks.every(c => c.hp <= 0);

        if (monsterDead) {
            state.monster.ref.hp = 0;
            state.running = false;
            events.push({ type: 'monster_dead' });
            this._syncHpBack(state);
            return events;
        }

        if (partyDead) {
            state.running = false;
            events.push({ type: 'party_dead' });
            this._syncHpBack(state);
            return events;
        }

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

    // Apply a move effect (poison, burn, curse, heal, buff, hot, shield_grant, burn_aoe, heal_hot, burn_curse, heal_pulse)
    static _applyEffect(state, effect, target, sourceIndex, events) {
        if (effect.type === 'poison') {
            const stack = {
                damagePerTick: effect.damagePerTick,
                ticksLeft: effect.ticks,
                interval: effect.interval,
                timer: 0
            };
            if (target === 'monster') {
                state.monster.poisons.push(stack);
                events.push({ type: 'poison_applied', target: 'monster', damagePerTick: effect.damagePerTick, ticks: effect.ticks });
            } else {
                const frontIdx = this.getFrontFishIndex(state);
                if (frontIdx !== -1) {
                    state.fish[frontIdx].poisons.push(stack);
                    events.push({ type: 'poison_applied', target: 'fish', fishIndex: frontIdx, damagePerTick: effect.damagePerTick, ticks: effect.ticks });
                }
            }
        } else if (effect.type === 'burn') {
            this._applyBurn(state, effect, target, sourceIndex, events);
        } else if (effect.type === 'curse') {
            this._applyCurse(state, effect, target, sourceIndex, events);
        } else if (effect.type === 'hot') {
            this._applyHoT(state, effect, sourceIndex, events);
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
                state.fish[sourceIndex].buffs.push({ stat: effect.stat, amount: effect.amount, remaining: effect.duration });
                events.push({ type: 'buff_applied', target: 'fish', fishIndex: sourceIndex, stat: effect.stat, amount: effect.amount, duration: effect.duration });
            }
        } else if (effect.type === 'shield_grant') {
            this._applyShieldGrant(state, effect, sourceIndex, events);
        } else if (effect.type === 'burn_aoe') {
            this._applyBurnAoe(state, effect, target, sourceIndex, events);
        } else if (effect.type === 'heal_hot') {
            this._applyHealHot(state, effect, sourceIndex, events);
        } else if (effect.type === 'burn_curse') {
            this._applyBurnCurse(state, effect, target, sourceIndex, events);
        } else if (effect.type === 'heal_pulse') {
            this._applyHealPulse(state, effect, target, events);
        }
    }

    // Tick all poison stacks and apply damage (bypasses shield)
    static _tickPoisons(state, dt, events) {
        // Monster poison stacks
        for (let s = state.monster.poisons.length - 1; s >= 0; s--) {
            const p = state.monster.poisons[s];
            p.timer += dt;
            while (p.timer >= p.interval && p.ticksLeft > 0) {
                p.timer -= p.interval;
                p.ticksLeft--;
                this._applyDamage(state, 'monster', p.damagePerTick, true, events);
                events.push({ type: 'poison_tick', target: 'monster', damage: p.damagePerTick });
            }
            if (p.ticksLeft <= 0) {
                state.monster.poisons.splice(s, 1);
            }
        }
        // Keep legacy poisoned getter in sync
        state.monster.poisoned = state.monster.poisons.length > 0 ? state.monster.poisons[0] : null;

        // Fish poison stacks (damage hits frontmost chunk via _applyDamage)
        for (let i = 0; i < state.fish.length; i++) {
            const f = state.fish[i];
            if (!f.alive) continue;
            for (let s = f.poisons.length - 1; s >= 0; s--) {
                const p = f.poisons[s];
                p.timer += dt;
                while (p.timer >= p.interval && p.ticksLeft > 0) {
                    p.timer -= p.interval;
                    p.ticksLeft--;
                    const poisonResult = this._applyDamage(state, 'fish', p.damagePerTick, true, events);
                    events.push({ type: 'poison_tick', target: 'fish', fishIndex: i, damage: poisonResult.actualDamage });
                }
                if (p.ticksLeft <= 0) {
                    f.poisons.splice(s, 1);
                }
            }
            // Keep legacy poisoned getter in sync
            f.poisoned = f.poisons.length > 0 ? f.poisons[0] : null;
        }
    }

    // Apply burn effect — non-stacking, higher damage wins, AoE spread
    static _applyBurn(state, effect, target, sourceIndex, events) {
        const cc = ConfigLoader.getCombatConfig();
        const initialDamage = effect.damage;

        if (target === 'monster') {
            if (!state.monster.burn || initialDamage > state.monster.burn.damage) {
                state.monster.burn = { damage: initialDamage, timer: 0 };
                events.push({ type: 'burn_applied', target: 'monster', initialDamage });
            }
        } else {
            // Burn the frontmost fish, AoE spread to others
            const frontIdx = this.getFrontFishIndex(state);
            if (frontIdx !== -1) {
                for (let i = 0; i < state.fish.length; i++) {
                    if (!state.fish[i].alive) continue;
                    const dmg = (i === frontIdx) ? initialDamage : Math.floor(initialDamage * cc.burnAoePercent);
                    if (!state.fish[i].burn || dmg > state.fish[i].burn.damage) {
                        state.fish[i].burn = { damage: dmg, timer: 0 };
                        events.push({ type: 'burn_applied', target: 'fish', index: i, initialDamage: dmg });
                    }
                }
            }
        }
    }

    // Tick burn timers — 1s ticks, decaying, routes through damage pipeline
    static _tickBurns(state, dt, events) {
        const cc = ConfigLoader.getCombatConfig();

        // Monster burn
        if (state.monster.burn) {
            state.monster.burn.timer += dt;
            if (state.monster.burn.timer >= 1) {
                state.monster.burn.timer -= 1;
                const dmgResult = this._applyDamage(state, 'monster', Math.floor(state.monster.burn.damage), false, events);
                events.push({ type: 'burn_tick', target: 'monster', damage: dmgResult.actualDamage, shieldAbsorbed: dmgResult.shieldAbsorbed });
                state.monster.burn.damage -= cc.burnDecayPerSecond;
                if (state.monster.burn.damage <= 0) {
                    state.monster.burn = null;
                    events.push({ type: 'burn_expired', target: 'monster' });
                }
            }
        }

        // Fish burns
        for (let i = 0; i < state.fish.length; i++) {
            const f = state.fish[i];
            if (!f.alive || !f.burn) continue;
            f.burn.timer += dt;
            if (f.burn.timer >= 1) {
                f.burn.timer -= 1;
                const dmgResult = this._applyDamage(state, 'fish', Math.floor(f.burn.damage), false, events);
                events.push({ type: 'burn_tick', target: 'fish', index: i, damage: dmgResult.actualDamage, shieldAbsorbed: dmgResult.shieldAbsorbed });
                f.burn.damage -= cc.burnDecayPerSecond;
                if (f.burn.damage <= 0) {
                    f.burn = null;
                    events.push({ type: 'burn_expired', target: 'fish', index: i });
                }
            }
        }
    }

    // Apply curse effect — stacking with cap handled by getEffectiveStat
    static _applyCurse(state, effect, target, sourceIndex, events) {
        const curse = { percent: effect.percent, remaining: effect.duration };
        if (target === 'monster') {
            state.monster.curses.push(curse);
            events.push({ type: 'curse_applied', target: 'monster', percent: effect.percent, duration: effect.duration });
        } else {
            const frontIdx = this.getFrontFishIndex(state);
            if (frontIdx !== -1) {
                state.fish[frontIdx].curses.push(curse);
                events.push({ type: 'curse_applied', target: 'fish', index: frontIdx, percent: effect.percent, duration: effect.duration });
            }
        }
    }

    // Tick curse durations and expire finished curses
    static _tickCurses(state, dt, events) {
        // Monster curses
        for (let s = state.monster.curses.length - 1; s >= 0; s--) {
            state.monster.curses[s].remaining -= dt;
            if (state.monster.curses[s].remaining <= 0) {
                state.monster.curses.splice(s, 1);
                events.push({ type: 'curse_expired', target: 'monster' });
            }
        }

        // Fish curses
        for (let i = 0; i < state.fish.length; i++) {
            const f = state.fish[i];
            for (let s = f.curses.length - 1; s >= 0; s--) {
                f.curses[s].remaining -= dt;
                if (f.curses[s].remaining <= 0) {
                    f.curses.splice(s, 1);
                    events.push({ type: 'curse_expired', target: 'fish', index: i });
                }
            }
        }
    }

    // Apply HoT effect — adds a new HoT stack to a fish
    static _applyHoT(state, effect, sourceIndex, events) {
        const caster = state.fish[sourceIndex];
        const healPower = caster ? (caster.ref.healPower || 0) : 0;
        const amount = Math.floor(effect.baseHealAmount * (1 + healPower * (effect.scalingFactor || 1)));
        const frontIdx = this.getFrontFishIndex(state);
        if (frontIdx !== -1) {
            state.fish[frontIdx].hots.push({
                amount,
                ticksLeft: effect.ticks,
                timer: 0
            });
            events.push({ type: 'hot_applied', fishIndex: frontIdx, amount, ticks: effect.ticks });
        }
    }

    // Tick HoT timers — heal frontmost living fish's HP chunk
    static _tickHoTs(state, dt, events) {
        const cc = ConfigLoader.getCombatConfig();
        for (let i = 0; i < state.fish.length; i++) {
            const f = state.fish[i];
            if (!f.alive) {
                f.hots.length = 0;
                continue;
            }
            for (let s = f.hots.length - 1; s >= 0; s--) {
                const h = f.hots[s];
                h.timer += dt;
                if (h.timer >= cc.hotTickInterval) {
                    h.timer -= cc.hotTickInterval;
                    h.ticksLeft--;
                    // Heal frontmost living chunk
                    const partyIdx = this._partyIndex(state, i);
                    const chunk = state.hpBar.chunks.find(c => c.fishIndex === partyIdx && c.hp > 0);
                    if (chunk) {
                        const before = chunk.hp;
                        chunk.hp = Math.min(chunk.maxHp, chunk.hp + h.amount);
                        const healed = chunk.hp - before;
                        state.hpBar.total += healed;
                        events.push({ type: 'hot_tick', fishIndex: i, amount: healed });
                    }
                }
                if (h.ticksLeft <= 0) {
                    f.hots.splice(s, 1);
                }
            }
        }
    }

    // Tick passive monster regen — supports all healing behavior types
    static _tickPassiveRegen(state, dt, events) {
        const cc = ConfigLoader.getCombatConfig();
        if (!state.monster.regenTimer) state.monster.regenTimer = 0;
        const monRef = state.monster.ref;
        const behavior = monRef.healingBehavior;
        if (!behavior) return;

        const hasRegen = behavior.type === 'passive_regen' ||
                         behavior.type === 'passive_regen_and_life_drain' ||
                         behavior.type === 'all';

        if (!hasRegen) return;

        state.monster.regenTimer += dt;
        if (state.monster.regenTimer >= cc.regenTickInterval) {
            state.monster.regenTimer -= cc.regenTickInterval;
            const healPower = monRef.healPower || 0;
            const scalingFactor = behavior.scalingFactor || behavior.regenScaling || 1;
            const amount = Math.floor(healPower * scalingFactor);
            if (amount > 0) {
                monRef.hp = Math.min(monRef.maxHp || monRef.hp, monRef.hp + amount);
                events.push({ type: 'regen_tick', target: 'monster', amount });
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

    // --- New effect handlers (bsf-special-moves) ---

    // shield_grant: grants shield to the source fish (self-buff). Caps at 2x maxShield.
    static _applyShieldGrant(state, effect, sourceIndex, events) {
        const fish = state.fish[sourceIndex];
        if (!fish || !fish.alive) return;
        const partyIdx = this._partyIndex(state, sourceIndex);
        const chunk = state.hpBar.chunks.find(c => c.fishIndex === partyIdx);
        if (!chunk) return;
        const maxCap = chunk.maxShield * 2 || effect.amount * 2;
        const before = chunk.shield;
        chunk.shield = Math.min(maxCap, chunk.shield + effect.amount);
        const granted = chunk.shield - before;
        events.push({ type: 'shield_grant', fishIndex: sourceIndex, amount: granted });
    }

    // burn_aoe: applies burn to frontmost monster at full value, spread to all others at burnAoePercent
    // When used by fish, target is 'monster' — but monster is single entity, so full burn applied.
    // When used by monster, target is 'fish' — AoE spread uses existing _applyBurn logic.
    static _applyBurnAoe(state, effect, target, sourceIndex, events) {
        const burnEffect = { type: 'burn', damage: effect.initialDamage };
        if (target === 'monster') {
            // Fish using burn_aoe against monster — full burn on monster
            this._applyBurn(state, burnEffect, 'monster', sourceIndex, events);
        } else {
            // Monster using burn_aoe against fish party — AoE spread handled by _applyBurn
            this._applyBurn(state, burnEffect, 'fish', sourceIndex, events);
        }
    }

    // heal_hot: burst heal on frontmost living fish chunk, then apply HoT. Scales with caster healPower.
    static _applyHealHot(state, effect, sourceIndex, events) {
        const caster = state.fish[sourceIndex];
        const healPower = caster ? (caster.ref.healPower || 0) : 0;
        const scaleFactor = 1 + healPower * 0.1;

        // Burst heal on frontmost living chunk
        const frontIdx = this.getFrontFishIndex(state);
        if (frontIdx !== -1) {
            const partyIdx = this._partyIndex(state, frontIdx);
            const chunk = state.hpBar.chunks.find(c => c.fishIndex === partyIdx);
            if (chunk && chunk.hp > 0) {
                const burstAmount = Math.floor(effect.burstHeal * scaleFactor);
                const before = chunk.hp;
                chunk.hp = Math.min(chunk.maxHp, chunk.hp + burstAmount);
                const healed = chunk.hp - before;
                state.hpBar.total += healed;
                events.push({ type: 'heal', fishIndex: frontIdx, amount: healed });
            }

            // Apply HoT to frontmost fish
            const hotAmount = Math.floor(effect.hotAmount * scaleFactor);
            state.fish[frontIdx].hots.push({
                amount: hotAmount,
                ticksLeft: effect.hotTicks,
                timer: 0
            });
            events.push({ type: 'hot_applied', fishIndex: frontIdx, amount: hotAmount, ticks: effect.hotTicks });
        }
    }

    // burn_curse: dual effect — apply burn + curse simultaneously (Dungeon Lord's cataclysm)
    static _applyBurnCurse(state, effect, target, sourceIndex, events) {
        // Resolve floor-scaled burn initial value
        const burnInitial = (typeof effect.burnInitial === 'object')
            ? Math.floor(effect.burnInitial.base + (state.floor || 1) * effect.burnInitial.perFloor)
            : effect.burnInitial;

        // Apply burn
        const burnEffect = { type: 'burn', damage: burnInitial };
        this._applyBurn(state, burnEffect, target, sourceIndex, events);

        // Apply curse
        const curseEffect = { type: 'curse', percent: effect.cursePercent, duration: effect.curseDuration };
        this._applyCurse(state, curseEffect, target, sourceIndex, events);
    }

    // heal_pulse: heal ALL friendly combatants by a flat amount scaled by caster's healPower
    static _applyHealPulse(state, effect, target, events) {
        // Resolve floor-scaled heal amount
        const baseAmount = (typeof effect.amount === 'object')
            ? Math.floor(effect.amount.base + (state.floor || 1) * effect.amount.perFloor)
            : effect.amount;
        const healPower = state.monster.ref.healPower || 0;
        const amount = Math.floor(baseAmount * (1 + healPower * 0.1));

        if (target === 'monster_allies') {
            // Monster heal pulse — heal the monster itself
            const monRef = state.monster.ref;
            const before = monRef.hp;
            monRef.hp = Math.min(monRef.maxHp || monRef.hp, monRef.hp + amount);
            const healed = monRef.hp - before;
            if (healed > 0) {
                events.push({ type: 'heal_pulse', target: 'monster', amount: healed });
            }
        } else {
            // Fish heal pulse — heal all living fish chunks
            for (let i = 0; i < state.fish.length; i++) {
                if (!state.fish[i].alive) continue;
                const partyIdx = this._partyIndex(state, i);
                const chunk = state.hpBar.chunks.find(c => c.fishIndex === partyIdx);
                if (chunk && chunk.hp > 0) {
                    const before = chunk.hp;
                    chunk.hp = Math.min(chunk.maxHp, chunk.hp + amount);
                    const healed = chunk.hp - before;
                    state.hpBar.total += healed;
                    if (healed > 0) {
                        events.push({ type: 'heal_pulse', target: 'fish', fishIndex: i, amount: healed });
                    }
                }
            }
        }
    }

    // --- Floor-scaled special helpers ---

    // Resolve a scaled value from a move's scaling object. Falls back to defaultValue if no scaling.
    static _resolveScaledValue(move, key, defaultValue, floor) {
        if (!move.scaling || !move.scaling[key]) return defaultValue;
        const s = move.scaling[key];
        return Math.floor(s.base + floor * s.perFloor);
    }

    // Apply a move's effect with floor-scaling applied to relevant values
    static _applyScaledEffect(state, move, target, targetIdx, events) {
        const effect = move.effect;
        if (!effect) return;

        const floor = state.floor || 1;

        if (effect.type === 'poison' && move.scaling?.poison) {
            const sp = move.scaling.poison;
            const scaledEffect = {
                type: 'poison',
                damagePerTick: Math.floor(sp.damagePerTick.base + floor * sp.damagePerTick.perFloor),
                ticks: sp.ticks || effect.ticks,
                interval: sp.interval || effect.interval
            };
            this._applyEffect(state, scaledEffect, target, targetIdx, events);
        } else if (effect.type === 'burn' && move.scaling?.burn) {
            const sb = move.scaling.burn;
            const scaledEffect = {
                type: 'burn',
                damage: Math.floor(sb.damage.base + floor * sb.damage.perFloor)
            };
            this._applyEffect(state, scaledEffect, target, targetIdx, events);
        } else if (effect.type === 'curse' && move.scaling?.curse) {
            const sc = move.scaling.curse;
            const scaledEffect = {
                type: 'curse',
                percent: sc.percent.base + floor * sc.percent.perFloor,
                duration: Math.floor(sc.duration.base + floor * sc.duration.perFloor)
            };
            this._applyEffect(state, scaledEffect, target, targetIdx, events);
        } else {
            // No scaling for this effect type — use as-is
            this._applyEffect(state, effect, target, targetIdx, events);
        }
    }

    // Apply life drain: after monster special deals damage, heal monster by damage * drainPercent
    static _applyLifeDrain(state, damage, events) {
        const behavior = state.monster.ref.healingBehavior;
        if (!behavior) return;

        const hasDrain = behavior.type === 'life_drain' ||
                         behavior.type === 'passive_regen_and_life_drain' ||
                         behavior.type === 'all';

        if (!hasDrain || damage <= 0) return;

        const drainPercent = behavior.drainPercent || behavior.percent || 0;
        const amount = Math.floor(damage * drainPercent);
        if (amount > 0) {
            const monRef = state.monster.ref;
            monRef.hp = Math.min(monRef.maxHp || monRef.hp, monRef.hp + amount);
            events.push({ type: 'life_drain', target: 'monster', amount });
        }
    }
}
