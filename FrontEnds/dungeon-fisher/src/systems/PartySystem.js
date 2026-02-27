import ConfigLoader from './ConfigLoader.js';

export default class PartySystem {

    // Create a new fish instance from a species ID at level 1
    static createFish(speciesId) {
        const species = ConfigLoader.getFish(speciesId);
        if (!species) return null;

        return {
            speciesId: species.id,
            name: species.name,
            color: species.color,
            level: 1,
            xp: 0,
            xpToNext: 25,
            hp: species.baseHp,
            maxHp: species.baseHp,
            atk: species.baseAtk,
            def: species.baseDef,
            spd: species.baseSpd,
            shield: species.baseShield,
            maxShield: species.baseShield,
            healPower: species.baseHealPower,
            moves: [species.specialMove],
            poisoned: null,
            buffs: [],
            burn: null,
            curses: [],
            hots: [],
            poisons: []
        };
    }

    // Create a fish at a specific level (used by shop recruitment)
    static createFishAtLevel(speciesId, level) {
        const fish = this.createFish(speciesId);
        if (!fish) return null;
        const species = ConfigLoader.getFish(speciesId);
        const combatConfig = ConfigLoader.getCombatConfig();
        const xpCurve = combatConfig.xpCurve || { base: 25, perLevel: 25 };
        for (let i = 1; i < level; i++) {
            fish.level++;
            fish.xpToNext = xpCurve.base + fish.level * xpCurve.perLevel;
            fish.maxHp += species.growth.hp;
            fish.hp += species.growth.hp;
            fish.atk += species.growth.atk;
            fish.def += species.growth.def;
            fish.spd += species.growth.spd;
            fish.maxShield += species.growth.shield;
            fish.shield += species.growth.shield;
            fish.healPower += species.growth.healPower;
        }
        return fish;
    }

    // Create a companion from a character config
    static createCompanion(characterId) {
        const character = ConfigLoader.getCharacter(characterId);
        if (!character || !character.companion) return null;
        const comp = character.companion;
        return {
            speciesId: comp.id,
            name: comp.name,
            color: comp.color,
            level: 1,
            xp: 0,
            xpToNext: 25,
            hp: comp.baseHp,
            maxHp: comp.baseHp,
            atk: comp.baseAtk,
            def: comp.baseDef,
            spd: comp.baseSpd,
            shield: comp.baseShield,
            maxShield: comp.baseShield,
            healPower: comp.baseHealPower,
            moves: [comp.specialMove],
            poisoned: null,
            buffs: [],
            burn: null,
            curses: [],
            hots: [],
            poisons: [],
            isCompanion: true,
            growth: comp.growth
        };
    }

    // Award XP and handle level ups. Returns array of messages.
    static awardXP(fish, xp) {
        const messages = [];
        const species = ConfigLoader.getFish(fish.speciesId, { silent: !!fish.isCompanion });
        const combatConfig = ConfigLoader.getCombatConfig();
        const maxLevel = combatConfig.maxLevel || 20;
        const xpCurve = combatConfig.xpCurve || { base: 25, perLevel: 25 };
        fish.xp += xp;

        while (fish.xp >= fish.xpToNext && fish.level < maxLevel) {
            fish.xp -= fish.xpToNext;
            fish.level++;
            fish.xpToNext = xpCurve.base + fish.level * xpCurve.perLevel;

            const growth = fish.growth || (species ? species.growth : { hp: 5, atk: 2, def: 1, spd: 1, shield: 0, healPower: 0 });
            fish.maxHp += growth.hp;
            fish.hp += growth.hp;
            fish.atk += growth.atk;
            fish.def += growth.def;
            fish.spd += growth.spd;
            fish.maxShield += growth.shield;
            fish.shield += growth.shield;
            fish.healPower += growth.healPower;

            messages.push(`${fish.name} grew to level ${fish.level}!`);
        }

        return messages;
    }

    // Heal a fish to full HP, clear status effects
    static fullHeal(fish) {
        fish.hp = fish.maxHp;
        fish.shield = fish.maxShield;
        fish.poisoned = null;
        fish.buffs = [];
        fish.burn = null;
        fish.curses = [];
        fish.hots = [];
        fish.poisons = [];
    }

    // Revive a fainted fish to a percentage of max HP
    static revive(fish, hpPercent) {
        if (fish.hp > 0) return false;
        fish.hp = Math.floor(fish.maxHp * hpPercent);
        fish.poisoned = null;
        fish.buffs = [];
        fish.burn = null;
        fish.curses = [];
        fish.hots = [];
        fish.poisons = [];
        return true;
    }

    // Check if all fish in party are fainted
    static isPartyWiped(party) {
        return party.every(fish => fish.hp <= 0);
    }

    // Get list of alive fish in party
    static getAliveFish(party) {
        return party.filter(fish => fish.hp > 0);
    }

    // Clear combat-only state (buffs, poison) after battle ends
    static clearCombatState(fish) {
        fish.poisoned = null;
        fish.buffs = [];
        fish.burn = null;
        fish.curses = [];
        fish.hots = [];
        fish.poisons = [];
    }

    // Add a fish to the bench roster
    static addToRoster(gameState, fish) {
        if (!gameState.roster) gameState.roster = [];
        gameState.roster.push(fish);
    }

    // Check if a party member can be swapped out (companions cannot)
    static canSwap(gameState, partyIndex) {
        const member = gameState.party[partyIndex];
        return member && !member.isCompanion;
    }

    // Swap a fish between active party and bench roster
    static swapPartyMember(gameState, partyIndex, rosterIndex) {
        if (!this.canSwap(gameState, partyIndex)) return false;
        if (!gameState.roster || rosterIndex >= gameState.roster.length) return false;
        const temp = gameState.party[partyIndex];
        gameState.party[partyIndex] = gameState.roster[rosterIndex];
        gameState.roster[rosterIndex] = temp;
        return true;
    }

    // Get full roster (active party + bench)
    static getFullRoster(gameState) {
        return {
            active: gameState.party,
            bench: gameState.roster || []
        };
    }
}
