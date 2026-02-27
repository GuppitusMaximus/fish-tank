import ConfigLoader from './ConfigLoader.js';

export default class CombatSystem {

    // Create the initial combat state from a party array and a monsters array.
    // monsters: array of 1-3 monster objects (pack or single boss).
    // floor: current dungeon floor number for scaling calculations.
    static createCombatState(party, monsters, floor = 1) {
        const aliveFish = party.filter(f => f.hp > 0);

        const chunks = aliveFish.map((f, i) => {
            const bonus = f.bonusShield || 0;
            if (bonus > 0) delete f.bonusShield;
            return {
                fishIndex: party.indexOf(f),
                hp: f.hp,
                maxHp: f.maxHp,
                color: f.color,
                shield: (f.maxShield || 0) + bonus,
                maxShield: (f.maxShield || 0) + bonus
            };
        });

        const total = chunks.reduce((sum, c) => sum + c.hp, 0);
        const totalMax = chunks.reduce((sum, c) => sum + c.maxHp, 0);

        const monsterCombatants = monsters.map(m => ({
            ref: m,
            alive: true,
            baseTimer: 0,
            specialTimer: 0,
            healPulseTimer: 0,
            poisoned: null,
            buffs: [],
            shield: m.shield || m.maxShield || 0,
            maxShield: m.maxShield || 0,
            curses: [],
            hots: [],
            burn: null,
            poisons: [],
            regenTimer: 0
        }));

        const monsterChunks = monsters.map((m, i) => ({
            monsterIndex: i,
            hp: m.hp,
            maxHp: m.maxHp,
            color: m.color,
            shield: m.shield || m.maxShield || 0,
            maxShield: m.maxShield || 0
        }));

        const monsterTotal = monsterChunks.reduce((s, c) => s + c.hp, 0);
        const monsterTotalMax = monsterChunks.reduce((s, c) => s + c.maxHp, 0);

        return {
            fish: aliveFish.map(f => ({
                ref: f,
                alive: true,
                baseTimer: 0,
                specialTimer: 0,
                poisoned: null,
                buffs: [],
                shield: f.maxShield || 0,
                maxShield: f.maxShield || 0,
                curses: [],
                hots: [],
                burn: null,
                poisons: []
            })),
            monsters: monsterCombatants,
            hpBar: { chunks, total, totalMax },
            monsterHpBar: {
                chunks: monsterChunks,
                total: monsterTotal,
                totalMax: monsterTotalMax
            },
            floor: floor,
            running: true
        };
    }

    // Tick all timers and return an array of combat events.
    // FR-24 tick order: attacks → DoTs → heals → buffs/curses → death checks last
    static update(state, deltaMs) {
        if (!state.running) return [];

        const dt = Math.min(deltaMs, 100) / 1000;
        const events = [];

        // 1. Fish base attack timers
        for (let i = 0; i < state.fish.length; i++) {
            const f = state.fish[i];
            if (!f.alive) continue;

            const frontM = this.getFrontMonsterIndex(state);
            if (frontM === -1) continue;

            const effSpd = this.getEffectiveStat(f, 'spd');
            const effAtk = this.getEffectiveStat(f, 'atk');

            const baseCd = this.getBaseAttackCooldown(effSpd);
            f.baseTimer += dt;
            if (f.baseTimer >= baseCd) {
                f.baseTimer -= baseCd;
                const monsterDef = this.getEffectiveStat(state.monsters[frontM], 'def');
                const damage = this.calculateBaseDamage(effAtk, monsterDef);
                const dmgResult = this._applyDamage(state, 'monster', damage, false, events);
                events.push({ type: 'fish_base_attack', fishIndex: i, damage: dmgResult.actualDamage, shieldAbsorbed: dmgResult.shieldAbsorbed });

                // Equipment action effects — fire on base attack hit
                if (f.ref._equipActionEffects && f.ref._equipActionEffects.length > 0) {
                    for (const effect of f.ref._equipActionEffects) {
                        this._applyEffect(state, effect, 'monster', i, events);
                    }
                }

                // Harmony double-strike — Bernie fires a bonus attack
                if (f.ref.isCompanion && f.ref._harmonyAttack) {
                    const ha = f.ref._harmonyAttack;
                    const harmonyDmg = this.calculateBaseDamage(ha.totalDamage, monsterDef);
                    const hResult = this._applyDamage(state, 'monster', harmonyDmg, false, events);
                    events.push({
                        type: 'fish_base_attack',
                        fishIndex: i,
                        damage: hResult.actualDamage,
                        shieldAbsorbed: hResult.shieldAbsorbed,
                        isHarmonyStrike: true
                    });
                    if (ha.adjacencyEffects) {
                        for (const effect of ha.adjacencyEffects) {
                            this._applyEffect(state, effect, 'monster', i, events);
                        }
                    }
                }
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
                    const frontM = this.getFrontMonsterIndex(state);
                    if (frontM === -1) continue;
                    const monsterDef = this.getEffectiveStat(state.monsters[frontM], 'def');
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

        // 3. Monster base attack timers (each monster attacks independently)
        const frontFishIdx = this.getFrontFishIndex(state);
        if (frontFishIdx !== -1) {
            for (let m = 0; m < state.monsters.length; m++) {
                const mon = state.monsters[m];
                if (!mon.alive) continue;
                const monChunk = state.monsterHpBar.chunks.find(c => c.monsterIndex === m);
                if (!monChunk || monChunk.hp <= 0) continue;

                const mEffSpd = this.getEffectiveStat(mon, 'spd');
                const mEffAtk = this.getEffectiveStat(mon, 'atk');

                const mBaseCd = this.getBaseAttackCooldown(mEffSpd);
                mon.baseTimer += dt;
                if (mon.baseTimer >= mBaseCd) {
                    mon.baseTimer -= mBaseCd;
                    const targetIdx = this.getFrontFishIndex(state);
                    if (targetIdx !== -1) {
                        const fishDef = this.getEffectiveStat(state.fish[targetIdx], 'def');
                        const damage = this.calculateBaseDamage(mEffAtk, fishDef);
                        const result = this._applyDamage(state, 'fish', damage, false, events);
                        events.push({ type: 'monster_base_attack', monsterIndex: m, damage: result.actualDamage, shieldAbsorbed: result.shieldAbsorbed, targetFishIndex: targetIdx });
                    }
                }
            }

            // 4. Monster special move timers (each monster independently)
            for (let m = 0; m < state.monsters.length; m++) {
                const mon = state.monsters[m];
                if (!mon.alive) continue;
                const monChunk = state.monsterHpBar.chunks.find(c => c.monsterIndex === m);
                if (!monChunk || monChunk.hp <= 0) continue;

                const mMove = ConfigLoader.getMove(mon.ref.specialMove);
                if (mMove) {
                    mon.specialTimer += dt;
                    if (mon.specialTimer >= mMove.cooldown) {
                        mon.specialTimer -= mMove.cooldown;
                        const targetIdx = this.getFrontFishIndex(state);
                        if (targetIdx !== -1) {
                            const fishDef = this.getEffectiveStat(state.fish[targetIdx], 'def');
                            const scaledDamage = this._resolveScaledValue(mMove, 'damage', mMove.damage, state.floor);
                            const damage = this.calculateSpecialDamage(scaledDamage, fishDef);
                            let mSpecialResult = { actualDamage: 0, shieldAbsorbed: 0 };
                            if (damage > 0) {
                                mSpecialResult = this._applyDamage(state, 'fish', damage, false, events);
                            }
                            events.push({ type: 'monster_special', monsterIndex: m, moveId: mMove.id, damage: mSpecialResult.actualDamage, shieldAbsorbed: mSpecialResult.shieldAbsorbed, effect: mMove.effect, targetFishIndex: targetIdx });

                            this._applyLifeDrain(state, m, mSpecialResult.actualDamage, events);

                            if (mMove.effect) {
                                this._applyScaledEffect(state, mMove, 'fish', targetIdx, events);
                            }
                        }
                    }
                }

                // 4b. Heal pulse timer (e.g. Dungeon Lord's third ability)
                const healPulseId = mon.ref.healingBehavior?.healPulseMove;
                if (healPulseId) {
                    const hpMove = ConfigLoader.getMove(healPulseId);
                    if (hpMove) {
                        mon.healPulseTimer += dt;
                        if (mon.healPulseTimer >= hpMove.cooldown) {
                            mon.healPulseTimer -= hpMove.cooldown;
                            if (hpMove.effect) {
                                this._applyScaledEffect(state, hpMove, 'monster_allies', -1, events);
                            }
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
        this._checkMonsterIncapacitations(state, events);

        // Simultaneous death: if both sides dead, player wins (fish attacks processed first)
        const allMonstersDead = state.monsterHpBar.chunks.every(c => c.hp <= 0);
        const partyDead = state.hpBar.chunks.every(c => c.hp <= 0);

        if (allMonstersDead) {
            state.running = false;
            events.push({ type: 'monsters_dead' });
            this._syncHpBack(state);
            this._syncMonsterHpBack(state);
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

    // Apply damage to the fish combined HP bar, hitting the frontmost living chunk first.
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

    // Apply damage to the monster combined HP bar, hitting the frontmost living chunk first.
    static applyDamageToMonsterHpBar(hpBar, damage) {
        let remaining = damage;
        let lastMonsterIndex = -1;
        let anyIncapacitated = false;

        for (const chunk of hpBar.chunks) {
            if (chunk.hp <= 0) continue;
            lastMonsterIndex = chunk.monsterIndex;
            const absorbed = Math.min(remaining, chunk.hp);
            chunk.hp -= absorbed;
            remaining -= absorbed;
            hpBar.total -= absorbed;
            if (chunk.hp <= 0) anyIncapacitated = true;
            if (remaining <= 0) break;
        }

        return {
            monsterIndex: lastMonsterIndex,
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

    // Get index of frontmost living monster in the combat state's monsters array
    static getFrontMonsterIndex(state) {
        for (let i = 0; i < state.monsters.length; i++) {
            if (state.monsters[i].alive) {
                const chunk = state.monsterHpBar.chunks.find(c => c.monsterIndex === i);
                if (chunk && chunk.hp > 0) return i;
            }
        }
        return -1;
    }

    // Modifier pipeline: base → flat buffs → curse reduction → floor at 0
    static getEffectiveStat(combatant, stat) {
        let value = combatant.ref[stat];

        if (combatant.buffs) {
            for (const buff of combatant.buffs) {
                if (buff.stat === stat) value += buff.amount;
            }
        }

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
    static _applyDamage(state, targetType, rawDamage, bypassShield, events) {
        let shieldAbsorbed = 0;
        let remaining = rawDamage;

        if (targetType === 'monster') {
            const frontChunk = state.monsterHpBar.chunks.find(c => c.hp > 0);

            if (!bypassShield && frontChunk && frontChunk.shield > 0) {
                shieldAbsorbed = Math.min(frontChunk.shield, remaining);
                frontChunk.shield -= shieldAbsorbed;
                remaining -= shieldAbsorbed;
                if (shieldAbsorbed > 0) {
                    events.push({ type: 'shield_hit', target: 'monster', absorbed: shieldAbsorbed });
                }
            }

            let incapacitated = false;
            if (remaining > 0) {
                const result = this.applyDamageToMonsterHpBar(state.monsterHpBar, remaining);
                remaining = result.actualDamage;
                incapacitated = result.incapacitated;
            }

            return { actualDamage: remaining, shieldAbsorbed, incapacitated };
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

    // Sync monster HP bar chunks back to monster refs after battle ends
    static _syncMonsterHpBack(state) {
        for (let i = 0; i < state.monsters.length; i++) {
            const chunk = state.monsterHpBar.chunks.find(c => c.monsterIndex === i);
            if (chunk) {
                state.monsters[i].ref.hp = Math.max(0, chunk.hp);
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

    // Check for newly incapacitated monsters and emit events
    static _checkMonsterIncapacitations(state, events) {
        for (let m = 0; m < state.monsters.length; m++) {
            if (!state.monsters[m].alive) continue;
            const chunk = state.monsterHpBar.chunks.find(c => c.monsterIndex === m);
            if (chunk && chunk.hp <= 0) {
                state.monsters[m].alive = false;
                state.monsters[m].poisons = [];
                state.monsters[m].burn = null;
                state.monsters[m].curses = [];
                state.monsters[m].buffs = [];
                state.monsters[m].hots = [];
                events.push({ type: 'monster_incapacitated', monsterIndex: m });
            }
        }
    }

    // Apply a move effect
    static _applyEffect(state, effect, target, sourceIndex, events) {
        if (effect.type === 'poison') {
            const stack = {
                damagePerTick: effect.damagePerTick,
                ticksLeft: effect.ticks,
                interval: effect.interval,
                timer: 0
            };
            if (target === 'monster') {
                const frontM = this.getFrontMonsterIndex(state);
                if (frontM !== -1) {
                    state.monsters[frontM].poisons.push(stack);
                    events.push({ type: 'poison_applied', target: 'monster', monsterIndex: frontM, damagePerTick: effect.damagePerTick, ticks: effect.ticks });
                }
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
                const frontM = this.getFrontMonsterIndex(state);
                if (frontM !== -1) {
                    state.monsters[frontM].buffs.push({ stat: effect.stat, amount: effect.amount, remaining: effect.duration });
                    events.push({ type: 'buff_applied', target: 'monster', monsterIndex: frontM, stat: effect.stat, amount: effect.amount, duration: effect.duration });
                }
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

    // Tick all poison stacks (bypasses shield)
    static _tickPoisons(state, dt, events) {
        // Monster poison stacks (per-monster)
        for (let m = 0; m < state.monsters.length; m++) {
            const mon = state.monsters[m];
            if (!mon.alive) continue;
            for (let s = mon.poisons.length - 1; s >= 0; s--) {
                const p = mon.poisons[s];
                p.timer += dt;
                while (p.timer >= p.interval && p.ticksLeft > 0) {
                    p.timer -= p.interval;
                    p.ticksLeft--;
                    this._applyDamage(state, 'monster', p.damagePerTick, true, events);
                    events.push({ type: 'poison_tick', target: 'monster', monsterIndex: m, damage: p.damagePerTick });
                }
                if (p.ticksLeft <= 0) {
                    mon.poisons.splice(s, 1);
                }
            }
            mon.poisoned = mon.poisons.length > 0 ? mon.poisons[0] : null;
        }

        // Fish poison stacks
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
            f.poisoned = f.poisons.length > 0 ? f.poisons[0] : null;
        }
    }

    // Apply burn — AoE spread to all living monsters, front gets full value
    static _applyBurn(state, effect, target, sourceIndex, events) {
        const cc = ConfigLoader.getCombatConfig();
        const initialDamage = effect.damage;

        if (target === 'monster') {
            const frontM = this.getFrontMonsterIndex(state);
            if (frontM !== -1) {
                for (let m = 0; m < state.monsters.length; m++) {
                    if (!state.monsters[m].alive) continue;
                    const dmg = (m === frontM) ? initialDamage : Math.floor(initialDamage * cc.burnAoePercent);
                    if (!state.monsters[m].burn || dmg > state.monsters[m].burn.damage) {
                        state.monsters[m].burn = { damage: dmg, timer: 0 };
                        events.push({ type: 'burn_applied', target: 'monster', monsterIndex: m, initialDamage: dmg });
                    }
                }
            }
        } else {
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

        // Monster burns (per-monster)
        for (let m = 0; m < state.monsters.length; m++) {
            const mon = state.monsters[m];
            if (!mon.alive || !mon.burn) continue;
            mon.burn.timer += dt;
            if (mon.burn.timer >= 1) {
                mon.burn.timer -= 1;
                const dmgResult = this._applyDamage(state, 'monster', Math.floor(mon.burn.damage), false, events);
                events.push({ type: 'burn_tick', target: 'monster', monsterIndex: m, damage: dmgResult.actualDamage, shieldAbsorbed: dmgResult.shieldAbsorbed });
                mon.burn.damage -= cc.burnDecayPerSecond;
                if (mon.burn.damage <= 0) {
                    mon.burn = null;
                    events.push({ type: 'burn_expired', target: 'monster', monsterIndex: m });
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

    // Apply curse — stacking with cap handled by getEffectiveStat
    static _applyCurse(state, effect, target, sourceIndex, events) {
        const curse = { percent: effect.percent, remaining: effect.duration };
        if (target === 'monster') {
            const frontM = this.getFrontMonsterIndex(state);
            if (frontM !== -1) {
                state.monsters[frontM].curses.push(curse);
                events.push({ type: 'curse_applied', target: 'monster', monsterIndex: frontM, percent: effect.percent, duration: effect.duration });
            }
        } else {
            const frontIdx = this.getFrontFishIndex(state);
            if (frontIdx !== -1) {
                state.fish[frontIdx].curses.push(curse);
                events.push({ type: 'curse_applied', target: 'fish', index: frontIdx, percent: effect.percent, duration: effect.duration });
            }
        }
    }

    // Tick curse durations
    static _tickCurses(state, dt, events) {
        // Monster curses (per-monster)
        for (let m = 0; m < state.monsters.length; m++) {
            const mon = state.monsters[m];
            if (!mon.alive) continue;
            for (let s = mon.curses.length - 1; s >= 0; s--) {
                mon.curses[s].remaining -= dt;
                if (mon.curses[s].remaining <= 0) {
                    mon.curses.splice(s, 1);
                    events.push({ type: 'curse_expired', target: 'monster', monsterIndex: m });
                }
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

    // Apply HoT — adds a new HoT stack to frontmost fish
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

    // Tick passive regen for each monster independently
    static _tickPassiveRegen(state, dt, events) {
        const cc = ConfigLoader.getCombatConfig();

        for (let m = 0; m < state.monsters.length; m++) {
            const mon = state.monsters[m];
            if (!mon.alive) continue;

            if (!mon.regenTimer) mon.regenTimer = 0;
            const monRef = mon.ref;
            const behavior = monRef.healingBehavior;
            if (!behavior) continue;

            const hasRegen = behavior.type === 'passive_regen' ||
                             behavior.type === 'passive_regen_and_life_drain' ||
                             behavior.type === 'all';

            if (!hasRegen) continue;

            mon.regenTimer += dt;
            if (mon.regenTimer >= cc.regenTickInterval) {
                mon.regenTimer -= cc.regenTickInterval;
                const healPower = monRef.healPower || 0;
                const scalingFactor = behavior.scalingFactor || behavior.regenScaling || 1;
                const amount = Math.floor(healPower * scalingFactor);
                if (amount > 0) {
                    const chunk = state.monsterHpBar.chunks.find(c => c.monsterIndex === m);
                    if (chunk && chunk.hp > 0) {
                        const before = chunk.hp;
                        chunk.hp = Math.min(chunk.maxHp, chunk.hp + amount);
                        const healed = chunk.hp - before;
                        state.monsterHpBar.total += healed;
                        if (healed > 0) {
                            events.push({ type: 'regen_tick', target: 'monster', monsterIndex: m, amount: healed });
                        }
                    }
                }
            }
        }
    }

    // Tick buff durations
    static _tickBuffs(state, dt, events) {
        // Monster buffs (per-monster)
        for (let m = 0; m < state.monsters.length; m++) {
            const mon = state.monsters[m];
            if (!mon.alive) continue;
            mon.buffs = mon.buffs.filter(b => {
                b.remaining -= dt;
                if (b.remaining <= 0) {
                    events.push({ type: 'buff_expired', target: 'monster', monsterIndex: m, stat: b.stat });
                    return false;
                }
                return true;
            });
        }

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

    // --- Effect handlers ---

    // shield_grant: grants shield to the source fish (self-buff)
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

    // burn_aoe: applies burn with AoE spread
    static _applyBurnAoe(state, effect, target, sourceIndex, events) {
        const burnEffect = { type: 'burn', damage: effect.initialDamage };
        if (target === 'monster') {
            this._applyBurn(state, burnEffect, 'monster', sourceIndex, events);
        } else {
            this._applyBurn(state, burnEffect, 'fish', sourceIndex, events);
        }
    }

    // heal_hot: burst heal + HoT on frontmost fish
    static _applyHealHot(state, effect, sourceIndex, events) {
        const caster = state.fish[sourceIndex];
        const healPower = caster ? (caster.ref.healPower || 0) : 0;
        const scaleFactor = 1 + healPower * 0.1;

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

            const hotAmount = Math.floor(effect.hotAmount * scaleFactor);
            state.fish[frontIdx].hots.push({
                amount: hotAmount,
                ticksLeft: effect.hotTicks,
                timer: 0
            });
            events.push({ type: 'hot_applied', fishIndex: frontIdx, amount: hotAmount, ticks: effect.hotTicks });
        }
    }

    // burn_curse: dual burn + curse effect
    static _applyBurnCurse(state, effect, target, sourceIndex, events) {
        const burnInitial = (typeof effect.burnInitial === 'object')
            ? Math.floor(effect.burnInitial.base + (state.floor || 1) * effect.burnInitial.perFloor)
            : effect.burnInitial;

        const burnEffect = { type: 'burn', damage: burnInitial };
        this._applyBurn(state, burnEffect, target, sourceIndex, events);

        const curseEffect = { type: 'curse', percent: effect.cursePercent, duration: effect.curseDuration };
        this._applyCurse(state, curseEffect, target, sourceIndex, events);
    }

    // heal_pulse: heal ALL friendly combatants
    static _applyHealPulse(state, effect, target, events) {
        const baseAmount = (typeof effect.amount === 'object')
            ? Math.floor(effect.amount.base + (state.floor || 1) * effect.amount.perFloor)
            : effect.amount;

        if (target === 'monster_allies') {
            // Heal all living monsters' HP chunks
            for (let m = 0; m < state.monsters.length; m++) {
                const mon = state.monsters[m];
                if (!mon.alive) continue;
                const healPower = mon.ref.healPower || 0;
                const amount = Math.floor(baseAmount * (1 + healPower * 0.1));
                const chunk = state.monsterHpBar.chunks.find(c => c.monsterIndex === m);
                if (chunk && chunk.hp > 0) {
                    const before = chunk.hp;
                    chunk.hp = Math.min(chunk.maxHp, chunk.hp + amount);
                    const healed = chunk.hp - before;
                    state.monsterHpBar.total += healed;
                    if (healed > 0) {
                        events.push({ type: 'heal_pulse', target: 'monster', monsterIndex: m, amount: healed });
                    }
                }
            }
        } else {
            // Fish heal pulse — heal all living fish chunks
            for (let i = 0; i < state.fish.length; i++) {
                if (!state.fish[i].alive) continue;
                const partyIdx = this._partyIndex(state, i);
                const chunk = state.hpBar.chunks.find(c => c.fishIndex === partyIdx);
                if (chunk && chunk.hp > 0) {
                    const amount = baseAmount;
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

    static _resolveScaledValue(move, key, defaultValue, floor) {
        if (!move.scaling || !move.scaling[key]) return defaultValue;
        const s = move.scaling[key];
        return Math.floor(s.base + floor * s.perFloor);
    }

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
            this._applyEffect(state, effect, target, targetIdx, events);
        }
    }

    // Life drain: after a specific monster's special deals damage, heal that monster
    static _applyLifeDrain(state, monsterIndex, damage, events) {
        const mon = state.monsters[monsterIndex];
        const behavior = mon.ref.healingBehavior;
        if (!behavior) return;

        const hasDrain = behavior.type === 'life_drain' ||
                         behavior.type === 'passive_regen_and_life_drain' ||
                         behavior.type === 'all';

        if (!hasDrain || damage <= 0) return;

        const drainPercent = behavior.drainPercent || behavior.percent || 0;
        const amount = Math.floor(damage * drainPercent);
        if (amount > 0) {
            const chunk = state.monsterHpBar.chunks.find(c => c.monsterIndex === monsterIndex);
            if (chunk && chunk.hp > 0) {
                const before = chunk.hp;
                chunk.hp = Math.min(chunk.maxHp, chunk.hp + amount);
                const healed = chunk.hp - before;
                state.monsterHpBar.total += healed;
                if (healed > 0) {
                    events.push({ type: 'life_drain', target: 'monster', monsterIndex, amount: healed });
                }
            }
        }
    }
}
