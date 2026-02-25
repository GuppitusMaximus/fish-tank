import { ITEMS, MAX_INVENTORY } from '../data/items.js';
import ConfigLoader from './ConfigLoader.js';
import PartySystem from './PartySystem.js';
import EncounterSystem from './EncounterSystem.js';

export default class EconomySystem {

    static buyItem(gameState, itemId) {
        const item = ITEMS[itemId];
        if (!item) return false;
        if (gameState.inventory.length >= MAX_INVENTORY) return false;

        const zone = EncounterSystem.getZoneNumber(gameState.floor);
        const price = this.getZoneScaledPrice(itemId, zone);
        if (gameState.gold < price) return false;

        gameState.gold -= price;
        gameState.inventory.push(itemId);
        return true;
    }

    static buyFish(gameState, speciesId) {
        const species = ConfigLoader.getFish(speciesId);
        if (!species) return null;

        const zone = EncounterSystem.getZoneNumber(gameState.floor);
        const price = this.getZoneScaledFishPrice(zone);
        if (gameState.gold < price) return null;

        if (gameState.party.some(f => f.speciesId === speciesId)) return null;
        if ((gameState.roster || []).some(f => f.speciesId === speciesId)) return null;

        gameState.gold -= price;
        const fish = PartySystem.createFishAtLevel(speciesId, zone * 2);
        PartySystem.addToRoster(gameState, fish);
        return fish;
    }

    static useItem(gameState, inventoryIndex, targetFish) {
        if (inventoryIndex < 0 || inventoryIndex >= gameState.inventory.length) return null;
        const itemId = gameState.inventory[inventoryIndex];
        const item = ITEMS[itemId];

        if (item.type === 'heal') {
            if (targetFish.hp <= 0) return null;
            if (targetFish.hp >= targetFish.maxHp) return null;
            const zone = EncounterSystem.getZoneNumber(gameState.floor);
            const amount = this.getZoneScaledHeal(itemId, zone);
            const healing = Math.min(amount, targetFish.maxHp - targetFish.hp);
            targetFish.hp += healing;
            gameState.inventory.splice(inventoryIndex, 1);
            return `${targetFish.name} recovered ${healing} HP!`;
        }

        if (item.type === 'revive') {
            if (targetFish.hp > 0) return null;
            PartySystem.revive(targetFish, item.power);
            gameState.inventory.splice(inventoryIndex, 1);
            return `${targetFish.name} was revived!`;
        }

        if (item.type === 'shield_potion') {
            const scaling = ConfigLoader.getEncounterConfig().shopScaling;
            const zone = EncounterSystem.getZoneNumber(gameState.floor);
            const amount = scaling ? scaling.shieldPotionAmount.base + zone * scaling.shieldPotionAmount.perZone : item.power;
            targetFish.bonusShield = (targetFish.bonusShield || 0) + amount;
            gameState.inventory.splice(inventoryIndex, 1);
            return `${targetFish.name} gained ${amount} bonus shield!`;
        }

        return null;
    }

    static useHealItem(gameState, inventoryIndex, targetFish, zone) {
        if (inventoryIndex < 0 || inventoryIndex >= gameState.inventory.length) return null;
        const itemId = gameState.inventory[inventoryIndex];
        const item = ITEMS[itemId];
        if (item.type !== 'heal') return null;
        if (targetFish.hp <= 0) return null;
        if (targetFish.hp >= targetFish.maxHp) return null;

        const amount = this.getZoneScaledHeal(itemId, zone);
        const healing = Math.min(amount, targetFish.maxHp - targetFish.hp);
        targetFish.hp += healing;
        gameState.inventory.splice(inventoryIndex, 1);
        return `${targetFish.name} recovered ${healing} HP!`;
    }

    static getShopFish(gameState) {
        const ownedSpecies = new Set([
            ...gameState.party.map(f => f.speciesId),
            ...(gameState.roster || []).map(f => f.speciesId)
        ]);
        const allFish = Object.values(ConfigLoader.getAllFish());
        return allFish.filter(s => !s.isStarter && !ownedSpecies.has(s.id) && s.shopPrice > 0);
    }

    static getZoneScaledPrice(itemId, zone) {
        const scaling = ConfigLoader.getEncounterConfig().shopScaling;
        if (!scaling) return ITEMS[itemId]?.price || 0;

        if (itemId === 'potion' || itemId === 'super_potion') {
            const base = scaling.potionCost.base + zone * scaling.potionCost.perZone;
            return Math.floor(itemId === 'super_potion' ? base * 2 : base);
        }
        if (itemId === 'revive') {
            return Math.floor(scaling.reviveCost.base + zone * scaling.reviveCost.perZone);
        }
        if (itemId === 'shield_potion') {
            return Math.floor(scaling.shieldPotionCost.base + zone * scaling.shieldPotionCost.perZone);
        }
        return ITEMS[itemId]?.price || 0;
    }

    static getZoneScaledHeal(itemId, zone) {
        const scaling = ConfigLoader.getEncounterConfig().shopScaling;
        if (!scaling) return ITEMS[itemId]?.power || 30;
        const base = scaling.potionHeal.base + zone * scaling.potionHeal.perZone;
        return Math.floor(itemId === 'super_potion' ? base * 2 : base);
    }

    static getZoneScaledFishPrice(zone) {
        const scaling = ConfigLoader.getEncounterConfig().shopScaling;
        if (!scaling) return 100;
        return Math.floor(scaling.fishCostBase.base + zone * scaling.fishCostBase.perZone);
    }
}
