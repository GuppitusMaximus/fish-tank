// Monster type templates. Actual stats are scaled by floor.
const MONSTER_TYPES = [
    { id: 'sewer_rat',    name: 'Sewer Rat',    color: 0x8b7355, floorRange: [1, 15],    specialMove: 'gnaw' },
    { id: 'cave_bat',     name: 'Cave Bat',     color: 0x4a3a5a, floorRange: [1, 20],    specialMove: 'sonic_screech' },
    { id: 'goblin',       name: 'Goblin',       color: 0x4a8a3a, floorRange: [10, 30],   specialMove: 'dagger_throw' },
    { id: 'spider',       name: 'Giant Spider',  color: 0x2a2a2a, floorRange: [10, 35],   specialMove: 'web_venom' },
    { id: 'skeleton',     name: 'Skeleton',      color: 0xd0d0c0, floorRange: [20, 45],   specialMove: 'bone_throw' },
    { id: 'slime',        name: 'Slime',         color: 0x30c060, floorRange: [20, 50],   specialMove: 'acid_splash' },
    { id: 'ogre',         name: 'Ogre',          color: 0x6a5a30, floorRange: [30, 60],   specialMove: 'ground_slam' },
    { id: 'wraith',       name: 'Wraith',        color: 0x6060a0, floorRange: [40, 70],   specialMove: 'shadow_bolt' },
    { id: 'golem',        name: 'Golem',         color: 0x808080, floorRange: [45, 75],   specialMove: 'stone_crush' },
    { id: 'demon',        name: 'Demon',         color: 0xc03030, floorRange: [55, 85],   specialMove: 'hellfire' },
    { id: 'dragon',       name: 'Dragon',        color: 0xc06020, floorRange: [65, 95],   specialMove: 'fire_breath' },
    { id: 'shadow_lord',  name: 'Shadow Lord',   color: 0x2a1a3a, floorRange: [75, 99],   specialMove: 'dark_nova' },
    { id: 'dungeon_lord', name: 'Dungeon Lord',  color: 0xff2020, floorRange: [100, 100], specialMove: 'cataclysm' }
];

// Generate a monster for a given floor
// Stats scale linearly with floor number (rebalanced for multi-attacker auto combat)
function generateMonster(floor) {
    const available = MONSTER_TYPES.filter(m => floor >= m.floorRange[0] && floor <= m.floorRange[1]);
    const template = available[Math.floor(Math.random() * available.length)];

    return {
        id: template.id,
        name: template.name,
        color: template.color,
        hp: Math.floor(75 + floor * 9),
        maxHp: Math.floor(75 + floor * 9),
        atk: Math.floor(6 + floor * 0.6),
        def: Math.floor(2 + floor * 0.25),
        spd: Math.floor(3 + floor * 0.12),
        specialMove: template.specialMove,
        goldReward: Math.floor(5 + floor * 0.8),
        xpReward: Math.floor(10 + floor * 1.5)
    };
}

export { MONSTER_TYPES, generateMonster };
