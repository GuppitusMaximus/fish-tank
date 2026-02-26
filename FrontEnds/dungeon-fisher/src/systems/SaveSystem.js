import { VERSION, SAVE_FORMAT_VERSION } from '../version.js';
import ConfigLoader from './ConfigLoader.js';

const SAVE_KEY = 'fathom-fall-save';

export default class SaveSystem {

    // Save complete game state
    static save(gameState) {
        const data = {
            version: SAVE_FORMAT_VERSION,
            gameVersion: VERSION,
            savedAt: Date.now(),
            floor: gameState.floor,
            gold: gameState.gold,
            party: gameState.party,
            inventory: gameState.inventory,
            campFloor: gameState.campFloor,
            fisherId: gameState.fisherId || 'andy',
            pveDeathCount: gameState.pveDeathCount || 0,
            pvpLossCount: gameState.pvpLossCount || 0,
            roster: gameState.roster || [],
            companion: gameState.companion || null,
            equipment: gameState.equipment || { grid: [], stash: [], harmonyPosition: { row: 4, col: 1 } },
            equipmentDelta: gameState.equipmentDelta || null
        };
        try {
            localStorage.setItem(SAVE_KEY, JSON.stringify(data));
            return true;
        } catch (e) {
            console.warn('Save failed:', e);
            return false;
        }
    }

    // Load game state. Returns null if no save exists.
    static load() {
        try {
            const raw = localStorage.getItem(SAVE_KEY);
            if (!raw) return null;
            const data = JSON.parse(raw);
            if (data.version !== SAVE_FORMAT_VERSION) {
                const migrated = this.migrate(data);
                if (!migrated) return null;
                localStorage.setItem(SAVE_KEY, JSON.stringify(migrated));
                return migrated;
            }
            return data;
        } catch (e) {
            console.warn('Load failed:', e);
            return null;
        }
    }

    // Migrate save data from older versions to current version.
    // Returns migrated data or null if migration is not possible.
    static migrate(data) {
        // v1 → v2: add fisherId
        if (data.version === 1) {
            data.fisherId = 'andy';
            data.version = 2;
        }

        // v2 → v3: replace multi-move system with single specialMove
        if (data.version === 2) {
            for (const fish of data.party) {
                const species = ConfigLoader.getFish(fish.speciesId);
                if (species) {
                    fish.moves = [species.specialMove];
                } else {
                    console.warn(`Unknown species '${fish.speciesId}' during migration, defaulting to bubble_volley`);
                    fish.moves = ['bubble_volley'];
                }
                delete fish.pendingMove;
            }
            data.version = 3;
        }

        // v3 → v4: add shield/healPower stats, species-specific growth recompute, new effect types, new game fields
        if (data.version === 3) {
            for (const fish of data.party) {
                const species = ConfigLoader.getFish(fish.speciesId);
                if (species) {
                    fish.maxHp = species.baseHp + (fish.level - 1) * species.growth.hp;
                    fish.atk = species.baseAtk + (fish.level - 1) * species.growth.atk;
                    fish.def = species.baseDef + (fish.level - 1) * species.growth.def;
                    fish.spd = species.baseSpd + (fish.level - 1) * species.growth.spd;
                    fish.shield = species.baseShield + (fish.level - 1) * species.growth.shield;
                    fish.maxShield = fish.shield;
                    fish.healPower = species.baseHealPower + (fish.level - 1) * species.growth.healPower;
                    if (fish.hp > 0) fish.hp = Math.min(fish.hp, fish.maxHp);
                } else {
                    fish.shield = 0; fish.maxShield = 0; fish.healPower = 0;
                }
                fish.poisoned = null; fish.buffs = [];
                fish.burn = null; fish.curses = []; fish.hots = []; fish.poisons = [];
            }
            data.pveDeathCount = 0;
            data.pvpLossCount = 0;
            data.roster = [];
            data.companion = null;
            data.version = 4;
        }

        // v4 → v5: add equipment grid fields
        if (data.version === 4) {
            data.equipment = {
                grid: [],
                stash: [],
                harmonyPosition: { row: 4, col: 1 }
            };
            data.equipmentDelta = null;
            data.version = 5;
        }

        if (data.version === SAVE_FORMAT_VERSION) return data;

        console.warn(`Unknown save version ${data.version}, cannot migrate`);
        return null;
    }

    // Check if a save exists
    static hasSave() {
        return localStorage.getItem(SAVE_KEY) !== null;
    }

    // Delete save
    static deleteSave() {
        localStorage.removeItem(SAVE_KEY);
    }
}
