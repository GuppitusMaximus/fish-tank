// Monster type templates. Actual stats are scaled by floor.
const MONSTER_TYPES = [
    { id: 'sewer_rat',    name: 'Sewer Rat',    color: 0x8b7355, floorRange: [1, 15],  moves: ['tackle'] },
    { id: 'cave_bat',     name: 'Cave Bat',     color: 0x4a3a5a, floorRange: [1, 20],  moves: ['tackle', 'fin_slash'] },
    { id: 'goblin',       name: 'Goblin',       color: 0x4a8a3a, floorRange: [10, 30], moves: ['tackle', 'fin_slash'] },
    { id: 'spider',       name: 'Giant Spider',  color: 0x2a2a2a, floorRange: [10, 35], moves: ['poison_bite', 'tackle'] },
    { id: 'skeleton',     name: 'Skeleton',      color: 0xd0d0c0, floorRange: [20, 45], moves: ['fin_slash', 'tackle'] },
    { id: 'slime',        name: 'Slime',         color: 0x30c060, floorRange: [20, 50], moves: ['splash', 'poison_bite'] },
    { id: 'ogre',         name: 'Ogre',          color: 0x6a5a30, floorRange: [30, 60], moves: ['tidal_crush', 'tackle'] },
    { id: 'wraith',       name: 'Wraith',        color: 0x6060a0, floorRange: [40, 70], moves: ['thunder_jolt', 'deep_strike'] },
    { id: 'golem',        name: 'Golem',         color: 0x808080, floorRange: [45, 75], moves: ['tidal_crush', 'harden'] },
    { id: 'demon',        name: 'Demon',         color: 0xc03030, floorRange: [55, 85], moves: ['deep_strike', 'thunder_jolt'] },
    { id: 'dragon',       name: 'Dragon',        color: 0xc06020, floorRange: [65, 95], moves: ['tidal_crush', 'deep_strike'] },
    { id: 'shadow_lord',  name: 'Shadow Lord',   color: 0x2a1a3a, floorRange: [75, 99], moves: ['deep_strike', 'thunder_jolt', 'poison_bite'] },
    { id: 'dungeon_lord', name: 'Dungeon Lord',  color: 0xff2020, floorRange: [100, 100], moves: ['deep_strike', 'tidal_crush', 'thunder_jolt'] }
];

// Generate a monster for a given floor
// Stats scale linearly with floor number
function generateMonster(floor) {
    // Filter to monster types available on this floor
    const available = MONSTER_TYPES.filter(m => floor >= m.floorRange[0] && floor <= m.floorRange[1]);
    const template = available[Math.floor(Math.random() * available.length)];

    return {
        id: template.id,
        name: template.name,
        color: template.color,
        hp: Math.floor(15 + floor * 1.8),
        maxHp: Math.floor(15 + floor * 1.8),
        atk: Math.floor(4 + floor * 0.35),
        def: Math.floor(2 + floor * 0.22),
        spd: Math.floor(3 + floor * 0.15),
        moves: template.moves,
        goldReward: Math.floor(5 + floor * 0.8),
        xpReward: Math.floor(10 + floor * 1.5)
    };
}

export { MONSTER_TYPES, generateMonster };
