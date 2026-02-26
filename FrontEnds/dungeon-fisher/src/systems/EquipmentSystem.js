import ConfigLoader from './ConfigLoader.js';

const SHAPES = {
    I: [[0,0],[1,0],[2,0],[3,0]],
    O: [[0,0],[1,0],[0,1],[1,1]],
    T: [[1,0],[0,1],[1,1],[2,1]],
    S: [[1,0],[2,0],[0,1],[1,1]],
    Z: [[0,0],[1,0],[1,1],[2,1]],
    L: [[2,0],[0,1],[1,1],[2,1]],
    J: [[0,0],[0,1],[1,1],[2,1]],
    monomino: [[0,0]]
};

const ZONE_ORDER = [
    'sewers', 'goblin_caves', 'bone_crypts', 'deep_dungeon',
    'shadow_realm', 'ancient_chambers', 'dungeon_heart'
];

const STAT_BUFFS = new Set(['atk', 'def', 'spd', 'hp', 'shield', 'healPower']);
const ACTION_EFFECTS = new Set(['poison', 'burn', 'curse', 'hot', 'healing']);

const ROW_TARGETING = {
    0: [0],
    1: [0, 1],
    2: [1],
    3: [1, 2],
    4: [2]
};

const SYNERGY_MAP = {
    poison: ['poison'],
    burn: ['burn_aoe', 'burn'],
    curse: ['curse'],
    hot: ['heal_hot'],
    healing: ['heal_hot'],
    shield: ['shield_grant']
};

export default class EquipmentSystem {

    static getShapeCells(shape, rotation = 0, flipped = false) {
        let cells = (SHAPES[shape] || SHAPES.monomino).map(([c, r]) => [c, r]);

        if (flipped) {
            const maxCol = Math.max(...cells.map(([c]) => c));
            cells = cells.map(([c, r]) => [maxCol - c, r]);
        }

        const rot = ((rotation % 4) + 4) % 4;
        for (let i = 0; i < rot; i++) {
            cells = cells.map(([c, r]) => [-r, c]);
            const minCol = Math.min(...cells.map(([c]) => c));
            const minRow = Math.min(...cells.map(([, r]) => r));
            cells = cells.map(([c, r]) => [c - minCol, r - minRow]);
        }

        return cells;
    }

    static getPlacedCells(item, col, row) {
        const cells = this.getShapeCells(item.shape, item.rotation || 0, item.flipped || false);
        return cells.map(([c, r]) => [col + c, row + r]);
    }

    static canPlace(grid, item, col, row, gridWidth, gridHeight) {
        const cells = this.getPlacedCells(item, col, row);

        for (const [c, r] of cells) {
            if (c < 0 || c >= gridWidth || r < 0 || r >= gridHeight) {
                return { valid: false, reason: 'out_of_bounds' };
            }
        }

        if (item.rowRestriction !== undefined) {
            for (const [, r] of cells) {
                if (r !== item.rowRestriction) {
                    return { valid: false, reason: 'row_restriction' };
                }
            }
        }

        const occupied = this.getOccupiedCells(grid);
        for (const [c, r] of cells) {
            if (occupied.has(`${c},${r}`)) {
                return { valid: false, reason: 'overlap' };
            }
        }

        return { valid: true, reason: null };
    }

    static placeItem(grid, item, col, row) {
        return [...grid, {
            itemId: item.id,
            col,
            row,
            rotation: item.rotation || 0,
            flipped: item.flipped || false
        }];
    }

    static removeItem(grid, itemId) {
        return grid.filter(entry => entry.itemId !== itemId);
    }

    static getOccupiedCells(grid) {
        const occupied = new Set();
        for (const entry of grid) {
            const itemConfig = ConfigLoader.getEquipmentItem(entry.itemId);
            if (!itemConfig) continue;
            const cells = this.getShapeCells(itemConfig.shape, entry.rotation, entry.flipped);
            for (const [c, r] of cells) {
                occupied.add(`${entry.col + c},${entry.row + r}`);
            }
        }
        return occupied;
    }

    static getAffectedPartyMembers(cells, partySize) {
        const affected = new Set();
        for (const [, row] of cells) {
            const targets = ROW_TARGETING[row];
            if (targets) {
                for (const idx of targets) {
                    if (idx < partySize) affected.add(idx);
                }
            }
        }
        return affected;
    }

    static aggregateStats(grid, party) {
        const balance = ConfigLoader.getEquipmentBalance();
        const statBonuses = {};
        const actionEffects = {};

        for (let i = 0; i < party.length; i++) {
            statBonuses[i] = { atk: 0, def: 0, spd: 0, maxHp: 0, maxShield: 0, healPower: 0 };
            actionEffects[i] = [];
        }

        for (const entry of grid) {
            const itemConfig = ConfigLoader.getEquipmentItem(entry.itemId);
            if (!itemConfig) continue;

            const cells = this.getShapeCells(itemConfig.shape, entry.rotation, entry.flipped);
            const placedCells = cells.map(([c, r]) => [entry.col + c, entry.row + r]);
            const affected = this.getAffectedPartyMembers(placedCells, party.length);

            const zoneIndex = ZONE_ORDER.indexOf(itemConfig.zone);
            const zoneMultiplier = zoneIndex >= 0 ? (balance.zoneMultipliers[zoneIndex] || 1.0) : 1.0;

            for (const partyIdx of affected) {
                const fish = party[partyIdx];

                for (const buff of (itemConfig.buffs || [])) {
                    const hasSynergy = this.detectSynergy(fish, buff.type);
                    const synergyMult = hasSynergy ? (balance.synergyMultiplier || 2.0) : 1.0;
                    const value = Math.floor(buff.baseValue * zoneMultiplier * synergyMult);

                    if (STAT_BUFFS.has(buff.type)) {
                        const statKey = buff.type === 'hp' ? 'maxHp'
                            : buff.type === 'shield' ? 'maxShield'
                            : buff.type;
                        statBonuses[partyIdx][statKey] += value;
                    } else if (ACTION_EFFECTS.has(buff.type)) {
                        const effect = this._createActionEffect(buff.type, value);
                        if (effect) actionEffects[partyIdx].push(effect);
                    }
                }
            }
        }

        return { statBonuses, actionEffects };
    }

    static _createActionEffect(buffType, value) {
        switch (buffType) {
            case 'poison':
                return { type: 'poison', damagePerTick: value, ticks: 3, interval: 1000 };
            case 'burn':
                return { type: 'burn', damage: value };
            case 'curse':
                return { type: 'curse', percent: value / 100, duration: 5 };
            case 'hot':
            case 'healing':
                return { type: 'hot', baseHealAmount: value, ticks: 3, scalingFactor: 0.1 };
            default:
                return null;
        }
    }

    static detectSynergy(fish, buffType) {
        if (!fish || !fish.moves || fish.moves.length === 0) return false;
        if (!SYNERGY_MAP[buffType]) return false;

        const move = ConfigLoader.getMove(fish.moves[0]);
        if (!move || !move.effect) return false;

        return SYNERGY_MAP[buffType].includes(move.effect.type);
    }

    static getHarmonyBonus(grid, party) {
        const harmonyEntry = grid.find(entry => entry.itemId === 'harmony');
        if (!harmonyEntry) return null;

        const companion = party[2];
        if (!companion) return null;

        const baseDamage = Math.floor(companion.atk * 0.5);

        const harmonyConfig = ConfigLoader.getEquipmentItem(harmonyEntry.itemId);
        if (!harmonyConfig) return null;

        const harmonyCells = this.getShapeCells(
            harmonyConfig.shape, harmonyEntry.rotation, harmonyEntry.flipped
        ).map(([c, r]) => [harmonyEntry.col + c, harmonyEntry.row + r]);

        const cellToItem = new Map();
        for (const entry of grid) {
            if (entry.itemId === 'harmony') continue;
            const config = ConfigLoader.getEquipmentItem(entry.itemId);
            if (!config) continue;
            const cells = this.getShapeCells(config.shape, entry.rotation, entry.flipped);
            for (const [c, r] of cells) {
                cellToItem.set(`${entry.col + c},${entry.row + r}`, { entry, config });
            }
        }

        const visitedItems = new Set();
        const adjacencyBonuses = [];
        const balance = ConfigLoader.getEquipmentBalance();

        for (const [col, row] of harmonyCells) {
            const neighbors = [[col - 1, row], [col + 1, row], [col, row - 1], [col, row + 1]];
            for (const [nc, nr] of neighbors) {
                const adjacent = cellToItem.get(`${nc},${nr}`);
                if (!adjacent || visitedItems.has(adjacent.entry.itemId)) continue;
                visitedItems.add(adjacent.entry.itemId);

                const zoneIndex = ZONE_ORDER.indexOf(adjacent.config.zone);
                const zoneMultiplier = zoneIndex >= 0
                    ? (balance.zoneMultipliers[zoneIndex] || 1.0) : 1.0;

                for (const buff of (adjacent.config.buffs || [])) {
                    if (STAT_BUFFS.has(buff.type)) {
                        const value = Math.floor(buff.baseValue * zoneMultiplier);
                        adjacencyBonuses.push({
                            itemId: adjacent.entry.itemId,
                            stat: buff.type,
                            value
                        });
                    }
                }
            }
        }

        const totalDamage = baseDamage + adjacencyBonuses.reduce((sum, b) => sum + b.value, 0);

        return { baseDamage, adjacencyBonuses, totalDamage };
    }

    static applyBonuses(party, grid) {
        const { statBonuses, actionEffects } = this.aggregateStats(grid, party);
        const harmonyBonus = this.getHarmonyBonus(grid, party);

        const delta = {};
        const snapshot = { items: [], harmony: harmonyBonus };

        for (const entry of grid) {
            const itemConfig = ConfigLoader.getEquipmentItem(entry.itemId);
            if (!itemConfig) continue;

            const cells = this.getShapeCells(itemConfig.shape, entry.rotation, entry.flipped);
            const placedCells = cells.map(([c, r]) => [entry.col + c, entry.row + r]);
            const affected = this.getAffectedPartyMembers(placedCells, party.length);

            const balance = ConfigLoader.getEquipmentBalance();
            const zoneIndex = ZONE_ORDER.indexOf(itemConfig.zone);
            const zoneMultiplier = zoneIndex >= 0
                ? (balance.zoneMultipliers[zoneIndex] || 1.0) : 1.0;

            const itemSnapshot = {
                itemId: entry.itemId,
                name: itemConfig.name,
                rarity: itemConfig.rarity,
                affectedMembers: [...affected],
                buffs: []
            };

            for (const partyIdx of affected) {
                const fish = party[partyIdx];
                for (const buff of (itemConfig.buffs || [])) {
                    const hasSynergy = this.detectSynergy(fish, buff.type);
                    const synergyMult = hasSynergy
                        ? (balance.synergyMultiplier || 2.0) : 1.0;
                    const value = Math.floor(buff.baseValue * zoneMultiplier * synergyMult);

                    itemSnapshot.buffs.push({
                        partyIdx,
                        type: buff.type,
                        baseValue: buff.baseValue,
                        computedValue: value,
                        synergy: hasSynergy
                    });
                }
            }

            snapshot.items.push(itemSnapshot);
        }

        for (let i = 0; i < party.length; i++) {
            const bonuses = statBonuses[i];
            if (!bonuses) continue;

            delta[i] = { atk: 0, def: 0, spd: 0, maxHp: 0, maxShield: 0, healPower: 0 };
            const fish = party[i];

            if (bonuses.atk) { fish.atk += bonuses.atk; delta[i].atk = bonuses.atk; }
            if (bonuses.def) { fish.def += bonuses.def; delta[i].def = bonuses.def; }
            if (bonuses.spd) { fish.spd += bonuses.spd; delta[i].spd = bonuses.spd; }
            if (bonuses.healPower) { fish.healPower += bonuses.healPower; delta[i].healPower = bonuses.healPower; }

            if (bonuses.maxHp) {
                const ratio = fish.hp / fish.maxHp;
                fish.maxHp += bonuses.maxHp;
                fish.hp = Math.floor(fish.maxHp * ratio);
                delta[i].maxHp = bonuses.maxHp;
            }

            if (bonuses.maxShield) {
                fish.maxShield += bonuses.maxShield;
                fish.shield += bonuses.maxShield;
                delta[i].maxShield = bonuses.maxShield;
            }

            fish._equipActionEffects = actionEffects[i] || [];
        }

        if (harmonyBonus && party[2]) {
            party[2]._harmonyAttack = harmonyBonus;
        }

        return { delta, snapshot };
    }

    static revertBonuses(party, delta) {
        for (const [idxStr, bonuses] of Object.entries(delta)) {
            const i = parseInt(idxStr);
            const fish = party[i];
            if (!fish) continue;

            if (bonuses.atk) fish.atk -= bonuses.atk;
            if (bonuses.def) fish.def -= bonuses.def;
            if (bonuses.spd) fish.spd -= bonuses.spd;
            if (bonuses.healPower) fish.healPower -= bonuses.healPower;

            if (bonuses.maxHp) {
                fish.maxHp -= bonuses.maxHp;
                fish.hp = Math.min(fish.hp, fish.maxHp);
            }

            if (bonuses.maxShield) {
                fish.maxShield -= bonuses.maxShield;
                fish.shield = Math.min(fish.shield, fish.maxShield);
            }

            delete fish._equipActionEffects;
            delete fish._harmonyAttack;
        }
    }

    static getActionEffects(partyMember, grid) {
        if (partyMember._equipActionEffects) {
            return partyMember._equipActionEffects;
        }
        return [];
    }

    static getItemsTouchingPartyMembers(grid, partyIndices) {
        const result = [];
        const targetIndices = new Set(partyIndices);

        for (const entry of grid) {
            const itemConfig = ConfigLoader.getEquipmentItem(entry.itemId);
            if (!itemConfig) continue;

            const cells = this.getShapeCells(itemConfig.shape, entry.rotation, entry.flipped);
            const placedCells = cells.map(([c, r]) => [entry.col + c, entry.row + r]);
            const affected = this.getAffectedPartyMembers(placedCells, 3);

            for (const idx of affected) {
                if (targetIndices.has(idx)) {
                    result.push({ ...itemConfig, itemId: entry.itemId });
                    break;
                }
            }
        }

        return result;
    }

    static canFitInStash(stash, item, stashCapacity) {
        let currentCells = 0;
        for (const stashItem of stash) {
            const config = ConfigLoader.getEquipmentItem(stashItem.id || stashItem.itemId);
            if (!config) continue;
            currentCells += (SHAPES[config.shape] || SHAPES.monomino).length;
        }

        const itemCells = (SHAPES[item.shape] || SHAPES.monomino).length;
        return (currentCells + itemCells) <= stashCapacity;
    }

    static rollBossDrop(zoneId) {
        const balance = ConfigLoader.getEquipmentBalance();
        const weights = balance.rarityDropWeights[zoneId];
        if (!weights) return null;

        const roll = Math.random() * 100;
        let rarity;
        if (roll < weights.standard) {
            rarity = 'standard';
        } else if (roll < weights.standard + weights.magic) {
            rarity = 'magic';
        } else {
            rarity = 'rare';
        }

        const zoneItems = ConfigLoader.getZoneItems(zoneId);
        const candidates = Object.values(zoneItems).filter(item => item.rarity === rarity);

        if (candidates.length === 0) return null;
        return candidates[Math.floor(Math.random() * candidates.length)];
    }
}
