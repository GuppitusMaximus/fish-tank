import MOVES from '../data/moves.js';

// Damage formula: max(1, (attacker.atk * move.power / 50) - defender.def)
// Speed determines turn order (higher goes first)
// Returns: { damage, message, poisonApplied, buffApplied }

export default class CombatSystem {

    // Calculate damage for an attack move (uses effective stats to respect buffs)
    static calculateDamage(attacker, defender, move) {
        const moveData = typeof move === 'string' ? MOVES[move] : move;
        if (moveData.type !== 'attack') return 0;
        const atk = this.getEffectiveStat(attacker, 'atk');
        const def = this.getEffectiveStat(defender, 'def');
        const damage = Math.max(1, Math.floor((atk * moveData.power / 50) - def));
        return damage;
    }

    // Execute a move (attack, heal, or buff)
    // Returns { type, damage, healing, message, poison, buff }
    static executeMove(attacker, defender, moveId) {
        const move = MOVES[moveId];
        const result = { type: move.type, moveId, moveName: move.name, message: '' };

        if (move.type === 'attack') {
            result.damage = this.calculateDamage(attacker, defender, move);
            defender.hp = Math.max(0, defender.hp - result.damage);
            result.message = `${attacker.name} uses ${move.name}! Deals ${result.damage} damage.`;

            // Apply poison if move has it
            if (move.poison && !defender.poisoned) {
                defender.poisoned = { damage: move.poison, turnsLeft: move.poisonTurns };
                result.poison = true;
                result.message += ` ${defender.name} is poisoned!`;
            }
        } else if (move.type === 'heal') {
            const healing = Math.min(move.power, attacker.maxHp - attacker.hp);
            attacker.hp = Math.min(attacker.maxHp, attacker.hp + healing);
            result.healing = healing;
            result.message = `${attacker.name} uses ${move.name}! Restores ${healing} HP.`;
        } else if (move.type === 'buff') {
            if (!attacker.buffs) attacker.buffs = [];
            attacker.buffs.push({ stat: move.buff.stat, amount: move.buff.amount, turnsLeft: move.buff.turns });
            result.buff = move.buff;
            result.message = `${attacker.name} uses ${move.name}! ${move.buff.stat.toUpperCase()} raised!`;
        }

        return result;
    }

    // Process poison damage at end of turn
    static processPoison(entity) {
        if (!entity.poisoned || entity.hp <= 0) return null;
        entity.hp = Math.max(0, entity.hp - entity.poisoned.damage);
        entity.poisoned.turnsLeft--;
        const msg = `${entity.name} takes ${entity.poisoned.damage} poison damage!`;
        if (entity.poisoned.turnsLeft <= 0) {
            entity.poisoned = null;
        }
        return msg;
    }

    // Process buff expiry at end of turn
    static processBuffs(entity) {
        if (!entity.buffs) return;
        entity.buffs = entity.buffs.filter(b => {
            b.turnsLeft--;
            return b.turnsLeft > 0;
        });
    }

    // Get effective stat (base + buff bonuses)
    static getEffectiveStat(entity, stat) {
        let value = entity[stat];
        if (entity.buffs) {
            for (const buff of entity.buffs) {
                if (buff.stat === stat) value += buff.amount;
            }
        }
        return value;
    }

    // Determine turn order: higher speed goes first
    static getTurnOrder(fish, monster) {
        const fishSpd = this.getEffectiveStat(fish, 'spd');
        const monsterSpd = this.getEffectiveStat(monster, 'spd');
        // If tied, fish goes first (player advantage)
        return fishSpd >= monsterSpd ? ['fish', 'monster'] : ['monster', 'fish'];
    }

    // Pick a random move for a monster
    static getMonsterMove(monster) {
        const moves = monster.moves;
        return moves[Math.floor(Math.random() * moves.length)];
    }
}
