import ConfigLoader from './ConfigLoader.js';

export default class EncounterSystem {

    static getEncounterType(floor) {
        const config = ConfigLoader.getEncounterConfig();
        const idx = (floor - 1) % config.floorsPerZone;
        return config.zonePattern[idx];
    }

    static getTransitions(floorInZone) {
        const config = ConfigLoader.getEncounterConfig();
        const idx = floorInZone - 1;
        const encounterType = config.zonePattern[idx];

        if (encounterType === 'boss') {
            const t = config.transitions.boss;
            return Array.isArray(t) ? [...t] : [t];
        }

        if (encounterType === 'pack' && idx % 3 === 1) {
            return [config.transitions.pack_pair];
        }

        return [];
    }

    static generatePack(floor) {
        const config = ConfigLoader.getEncounterConfig();
        const allMonsters = ConfigLoader.getAllMonsters();
        const available = Object.values(allMonsters).filter(
            m => floor >= m.floorRange[0] && floor <= m.floorRange[1]
        );

        if (available.length === 0) {
            return [this._createMonster(Object.values(allMonsters)[0], floor, 1)];
        }

        const size = Math.floor(Math.random() * (config.packSize.max - config.packSize.min + 1)) + config.packSize.min;
        const multiplier = config.packStatMultiplier[String(size)] || 1;

        const pack = [];
        for (let i = 0; i < size; i++) {
            const template = available[Math.floor(Math.random() * available.length)];
            pack.push(this._createMonster(template, floor, multiplier));
        }
        return pack;
    }

    static generateBoss(floor) {
        const config = ConfigLoader.getEncounterConfig();
        const allMonsters = ConfigLoader.getAllMonsters();
        const available = Object.values(allMonsters).filter(
            m => floor >= m.floorRange[0] && floor <= m.floorRange[1]
        );

        if (available.length === 0) {
            return this._createBossMonster(Object.values(allMonsters)[0], floor, config.bossStatMultiplier);
        }

        const template = available[Math.floor(Math.random() * available.length)];
        return this._createBossMonster(template, floor, config.bossStatMultiplier);
    }

    static calculateRewards(floor, encounterType, packSize) {
        const config = ConfigLoader.getEncounterConfig();
        const baseGold = 8 + floor * 2;
        const baseXp = 10 + floor * 3;

        let key;
        if (encounterType === 'boss') key = 'boss';
        else if (encounterType === 'pvp') key = 'pvp';
        else key = 'pack' + packSize;

        const mult = config.rewardMultiplier[key] || { xp: 1, gold: 1 };
        return {
            xp: Math.floor(baseXp * mult.xp),
            gold: Math.floor(baseGold * mult.gold)
        };
    }

    static getZoneNumber(floor) {
        const config = ConfigLoader.getEncounterConfig();
        return Math.ceil(floor / config.floorsPerZone);
    }

    static getFloorInZone(floor) {
        const config = ConfigLoader.getEncounterConfig();
        return ((floor - 1) % config.floorsPerZone) + 1;
    }

    static _createMonster(template, floor, statMultiplier) {
        const s = template.statScaling;
        return {
            id: template.id,
            name: template.name,
            color: template.color,
            hp: Math.floor((s.hp.base + floor * s.hp.perFloor) * statMultiplier),
            maxHp: Math.floor((s.hp.base + floor * s.hp.perFloor) * statMultiplier),
            atk: Math.floor((s.atk.base + floor * s.atk.perFloor) * statMultiplier),
            def: Math.floor((s.def.base + floor * s.def.perFloor) * statMultiplier),
            spd: Math.floor((s.spd.base + floor * s.spd.perFloor) * statMultiplier),
            shield: s.shield ? Math.floor((s.shield.base + floor * s.shield.perFloor) * statMultiplier) : 0,
            maxShield: s.shield ? Math.floor((s.shield.base + floor * s.shield.perFloor) * statMultiplier) : 0,
            healPower: s.healPower ? Math.floor(s.healPower.base + floor * s.healPower.perFloor) : 0,
            specialMove: template.specialMove,
            healingBehavior: template.healingBehavior || null,
            goldReward: Math.floor(template.goldReward.base + floor * template.goldReward.perFloor),
            xpReward: Math.floor(template.xpReward.base + floor * template.xpReward.perFloor)
        };
    }

    static _createBossMonster(template, floor, bm) {
        const s = template.statScaling;
        return {
            id: template.id,
            name: template.name,
            color: template.color,
            hp: Math.floor((s.hp.base + floor * s.hp.perFloor) * bm.hp),
            maxHp: Math.floor((s.hp.base + floor * s.hp.perFloor) * bm.hp),
            atk: Math.floor((s.atk.base + floor * s.atk.perFloor) * bm.atk),
            def: Math.floor((s.def.base + floor * s.def.perFloor) * bm.def),
            spd: Math.floor((s.spd.base + floor * s.spd.perFloor) * bm.spd),
            shield: s.shield ? Math.floor((s.shield.base + floor * s.shield.perFloor) * (bm.hp || 1)) : 0,
            maxShield: s.shield ? Math.floor((s.shield.base + floor * s.shield.perFloor) * (bm.hp || 1)) : 0,
            healPower: s.healPower ? Math.floor(s.healPower.base + floor * s.healPower.perFloor) : 0,
            specialMove: template.specialMove,
            healingBehavior: template.healingBehavior || null,
            goldReward: Math.floor(template.goldReward.base + floor * template.goldReward.perFloor),
            xpReward: Math.floor(template.xpReward.base + floor * template.xpReward.perFloor)
        };
    }
}
