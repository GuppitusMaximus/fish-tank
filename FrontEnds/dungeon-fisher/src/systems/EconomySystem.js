import { ITEMS, MAX_INVENTORY } from '../data/items.js';
import FISH_SPECIES from '../data/fish.js';
import PartySystem from './PartySystem.js';

export default class EconomySystem {

    // Buy an item. Returns true if successful.
    static buyItem(gameState, itemId) {
        const item = ITEMS[itemId];
        if (!item) return false;
        if (gameState.gold < item.price) return false;
        if (gameState.inventory.length >= MAX_INVENTORY) return false;

        gameState.gold -= item.price;
        gameState.inventory.push(itemId);
        return true;
    }

    // Buy a fish. Returns the new fish if successful, null otherwise.
    static buyFish(gameState, speciesId) {
        const species = FISH_SPECIES.find(s => s.id === speciesId);
        if (!species) return null;
        if (gameState.gold < species.shopPrice) return null;
        if (gameState.party.length >= 3) return null;

        // Check if player already has this species
        if (gameState.party.some(f => f.speciesId === speciesId)) return null;

        gameState.gold -= species.shopPrice;
        const fish = PartySystem.createFish(speciesId);
        gameState.party.push(fish);
        return fish;
    }

    // Use an item from inventory. Returns result message or null if failed.
    static useItem(gameState, inventoryIndex, targetFish) {
        if (inventoryIndex < 0 || inventoryIndex >= gameState.inventory.length) return null;
        const itemId = gameState.inventory[inventoryIndex];
        const item = ITEMS[itemId];

        if (item.type === 'heal') {
            if (targetFish.hp <= 0) return null;  // can't heal fainted fish
            if (targetFish.hp >= targetFish.maxHp) return null;  // already full
            const healing = Math.min(item.power, targetFish.maxHp - targetFish.hp);
            targetFish.hp += healing;
            gameState.inventory.splice(inventoryIndex, 1);
            return `${targetFish.name} recovered ${healing} HP!`;
        }

        if (item.type === 'revive') {
            if (targetFish.hp > 0) return null;  // not fainted
            PartySystem.revive(targetFish, item.power);
            gameState.inventory.splice(inventoryIndex, 1);
            return `${targetFish.name} was revived!`;
        }

        if (item.type === 'stat') {
            targetFish[item.stat] += item.amount;
            if (item.stat === 'hp') targetFish.maxHp += item.amount;
            gameState.inventory.splice(inventoryIndex, 1);
            return `${targetFish.name}'s ${item.stat.toUpperCase()} increased by ${item.amount}!`;
        }

        return null;
    }

    // Get list of fish available in shop (species not already in party)
    static getShopFish(gameState) {
        const ownedSpecies = gameState.party.map(f => f.speciesId);
        return FISH_SPECIES.filter(s => !s.isStarter && !ownedSpecies.includes(s.id) && s.shopPrice > 0);
    }
}
