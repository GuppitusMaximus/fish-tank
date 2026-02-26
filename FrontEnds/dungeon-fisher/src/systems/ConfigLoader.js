let _data = null;
let _strict = false;

function parseColor(obj) {
    if (obj && typeof obj.color === 'string') {
        return { ...obj, color: Number(obj.color) };
    }
    return obj;
}

function validate(category, id, config) {
    const issues = [];

    if (!config) {
        issues.push(`${category}/${id}: config is null/undefined`);
    } else if (config.id && config.id !== id) {
        issues.push(`${category}/${id}: id field '${config.id}' does not match key '${id}'`);
    }

    if (issues.length > 0) {
        if (_strict) {
            throw new Error(`ConfigLoader validation failed:\n${issues.join('\n')}`);
        } else {
            issues.forEach(msg => console.warn(`[ConfigLoader] ${msg}`));
        }
    }
}

const ConfigLoader = {
    init(rawData, options = {}) {
        _strict = !!options.strict;
        _data = rawData;

        for (const [id, config] of Object.entries(_data.fish || {})) {
            validate('fish', id, config);
        }
        for (const [id, config] of Object.entries(_data.monsters || {})) {
            validate('monsters', id, config);
        }
        for (const [id, config] of Object.entries(_data.characters || {})) {
            validate('characters', id, config);
        }
        for (const [id, config] of Object.entries(_data.moves || {})) {
            validate('moves', id, config);
        }
    },

    getFish(id) {
        if (!_data) return null;
        const config = _data.fish[id];
        if (!config) {
            if (_strict) throw new Error(`ConfigLoader: fish '${id}' not found`);
            console.warn(`[ConfigLoader] fish '${id}' not found`);
            return null;
        }
        return parseColor(config);
    },

    getAllFish() {
        if (!_data) return {};
        const result = {};
        for (const [id, config] of Object.entries(_data.fish)) {
            result[id] = parseColor(config);
        }
        return result;
    },

    getMonster(id) {
        if (!_data) return null;
        const config = _data.monsters[id];
        if (!config) {
            if (_strict) throw new Error(`ConfigLoader: monster '${id}' not found`);
            console.warn(`[ConfigLoader] monster '${id}' not found`);
            return null;
        }
        return parseColor(config);
    },

    getAllMonsters() {
        if (!_data) return {};
        const result = {};
        for (const [id, config] of Object.entries(_data.monsters)) {
            result[id] = parseColor(config);
        }
        return result;
    },

    getMove(id) {
        if (!_data) return null;
        const config = (_data.moves || {})[id];
        if (!config) {
            if (_strict) throw new Error(`ConfigLoader: move '${id}' not found`);
            console.warn(`[ConfigLoader] move '${id}' not found`);
            return null;
        }
        return config;
    },

    getMoves() {
        if (!_data) return {};
        return _data.moves || {};
    },

    getCombatConfig() {
        if (!_data) return {};
        return _data.combat || {};
    },

    getEncounterConfig() {
        if (!_data) return {};
        return _data.encounters || {};
    },

    getCharacter(id) {
        if (!_data) return null;
        const config = (_data.characters || {})[id];
        if (!config) {
            if (_strict) throw new Error(`ConfigLoader: character '${id}' not found`);
            console.warn(`[ConfigLoader] character '${id}' not found`);
            return null;
        }
        if (config.companion) {
            return { ...config, companion: parseColor(config.companion) };
        }
        return config;
    },

    getEquipmentItem(id) {
        if (!_data) return null;
        const config = (_data.equipmentItems || {})[id];
        if (!config) {
            console.warn(`[ConfigLoader] equipment item '${id}' not found`);
            return null;
        }
        return config;
    },

    getAllEquipmentItems() {
        if (!_data) return {};
        return _data.equipmentItems || {};
    },

    getEquipmentBalance() {
        if (!_data) return {};
        return _data.equipmentBalance || {};
    },

    getZoneItems(zoneId) {
        if (!_data) return {};
        const all = _data.equipmentItems || {};
        const result = {};
        for (const [id, config] of Object.entries(all)) {
            if (config.zone === zoneId) {
                result[id] = config;
            }
        }
        return result;
    }
};

export default ConfigLoader;
