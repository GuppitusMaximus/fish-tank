import { VERSION, SAVE_FORMAT_VERSION } from '../version.js';

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
            campFloor: gameState.campFloor  // last camp checkpoint
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
                // Re-save with current version
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
        // Future version migrations go here as chained if-blocks:
        // if (data.version === 1) { /* migrate v1 → v2 */; data.version = 2; }
        // if (data.version === 2) { /* migrate v2 → v3 */; data.version = 3; }
        // For now, v1 is the only version — no migrations needed yet.
        // If we can't recognize the version at all, discard.
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
