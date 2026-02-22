import { VERSION, SAVE_FORMAT_VERSION } from '../version.js';
import FISH_SPECIES from '../data/fish.js';

const SAVE_KEY = 'dungeon-fisher-save';

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
            fisherId: gameState.fisherId || 'andy'
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
                const species = FISH_SPECIES.find(s => s.id === fish.speciesId);
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
