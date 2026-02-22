import FISH_SPECIES from '../data/fish.js';

export default class PartySystem {

    // Create a new fish instance from a species ID at level 1
    static createFish(speciesId) {
        const species = FISH_SPECIES.find(s => s.id === speciesId);
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
            moves: [species.specialMove],
            poisoned: null,
            buffs: []
        };
    }

    // Award XP and handle level ups. Returns array of messages.
    static awardXP(fish, xp) {
        const messages = [];
        fish.xp += xp;

        while (fish.xp >= fish.xpToNext && fish.level < 20) {
            fish.xp -= fish.xpToNext;
            fish.level++;
            fish.xpToNext = fish.level * 25;

            // Stat increases on level up
            fish.maxHp += 5;
            fish.hp += 5;
            fish.atk += 2;
            fish.def += 1;
            fish.spd += 1;

            messages.push(`${fish.name} grew to level ${fish.level}!`);
        }

        return messages;
    }

    // Heal a fish to full HP, clear status effects
    static fullHeal(fish) {
        fish.hp = fish.maxHp;
        fish.poisoned = null;
        fish.buffs = [];
    }

    // Revive a fainted fish to a percentage of max HP
    static revive(fish, hpPercent) {
        if (fish.hp > 0) return false;
        fish.hp = Math.floor(fish.maxHp * hpPercent);
        fish.poisoned = null;
        fish.buffs = [];
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
    }
}
