// Each fish species definition
// Stats are base stats at level 1. On level up: HP +5, ATK +2, DEF +1, SPD +1
// starterMoves: move IDs the fish knows at level 1
// learnableMoves: [{ level, moveId }] — moves learned on level up

const FISH_SPECIES = [
    {
        id: 'guppy',
        name: 'Guppy',
        description: 'A reliable starter. Balanced stats.',
        baseHp: 30, baseAtk: 8, baseDef: 5, baseSpd: 6,
        starterMoves: ['splash'],
        learnableMoves: [{ level: 3, moveId: 'tackle' }, { level: 6, moveId: 'bubble_shot' }],
        color: 0xe8734a,  // orange (placeholder sprite color)
        shopPrice: 0,     // starter, not sold in shop
        isStarter: true
    },
    {
        id: 'pufferfish',
        name: 'Pufferfish',
        description: 'Tanky. High HP, strong defense, slow.',
        baseHp: 45, baseAtk: 5, baseDef: 9, baseSpd: 3,
        starterMoves: ['tackle'],
        learnableMoves: [{ level: 3, moveId: 'harden' }, { level: 6, moveId: 'poison_bite' }],
        color: 0xf0c040,  // yellow
        shopPrice: 60,
        isStarter: true
    },
    {
        id: 'swordfish',
        name: 'Swordfish',
        description: 'Glass cannon. Hits hard, fragile.',
        baseHp: 22, baseAtk: 14, baseDef: 3, baseSpd: 8,
        starterMoves: ['fin_slash'],
        learnableMoves: [{ level: 3, moveId: 'deep_strike' }, { level: 6, moveId: 'tidal_crush' }],
        color: 0x4a90d9,  // blue
        shopPrice: 80,
        isStarter: true
    },
    {
        id: 'clownfish',
        name: 'Clownfish',
        description: 'Speedy. Always acts first.',
        baseHp: 28, baseAtk: 7, baseDef: 5, baseSpd: 10,
        starterMoves: ['tackle'],
        learnableMoves: [{ level: 3, moveId: 'bubble_shot' }, { level: 6, moveId: 'fin_slash' }],
        color: 0xe05080,  // pink-red
        shopPrice: 70,
        isStarter: false
    },
    {
        id: 'anglerfish',
        name: 'Anglerfish',
        description: 'Deep dweller. Strong special attacks.',
        baseHp: 32, baseAtk: 10, baseDef: 6, baseSpd: 4,
        starterMoves: ['splash'],
        learnableMoves: [{ level: 3, moveId: 'thunder_jolt' }, { level: 6, moveId: 'deep_strike' }],
        color: 0x3a5060,  // dark teal
        shopPrice: 90,
        isStarter: false
    },
    {
        id: 'barracuda',
        name: 'Barracuda',
        description: 'Aggressive hunter. Fast and strong.',
        baseHp: 26, baseAtk: 12, baseDef: 4, baseSpd: 9,
        starterMoves: ['fin_slash'],
        learnableMoves: [{ level: 3, moveId: 'tackle' }, { level: 6, moveId: 'tidal_crush' }],
        color: 0x5a5a5a,  // silver
        shopPrice: 100,
        isStarter: false
    },
    {
        id: 'jellyfish',
        name: 'Jellyfish',
        description: 'Venomous. Poisons enemies over time.',
        baseHp: 25, baseAtk: 6, baseDef: 7, baseSpd: 7,
        starterMoves: ['poison_bite'],
        learnableMoves: [{ level: 3, moveId: 'heal_splash' }, { level: 6, moveId: 'thunder_jolt' }],
        color: 0x9b6dcc,  // purple
        shopPrice: 85,
        isStarter: false
    },
    {
        id: 'seahorse',
        name: 'Seahorse',
        description: 'Supportive. Can heal itself in battle.',
        baseHp: 35, baseAtk: 5, baseDef: 6, baseSpd: 5,
        starterMoves: ['heal_splash'],
        learnableMoves: [{ level: 3, moveId: 'bubble_shot' }, { level: 6, moveId: 'harden' }],
        color: 0x50c878,  // green
        shopPrice: 75,
        isStarter: false
    },
    {
        id: 'manta_ray',
        name: 'Manta Ray',
        description: 'Sturdy all-rounder. No weaknesses.',
        baseHp: 38, baseAtk: 9, baseDef: 7, baseSpd: 5,
        starterMoves: ['tackle'],
        learnableMoves: [{ level: 3, moveId: 'tidal_crush' }, { level: 6, moveId: 'heal_splash' }],
        color: 0x3068a8,  // dark blue
        shopPrice: 120,
        isStarter: false
    },
    {
        id: 'golden_koi',
        name: 'Golden Koi',
        description: 'Rare and powerful. Excellent stats.',
        baseHp: 34, baseAtk: 11, baseDef: 8, baseSpd: 7,
        starterMoves: ['bubble_shot'],
        learnableMoves: [{ level: 3, moveId: 'thunder_jolt' }, { level: 6, moveId: 'deep_strike' }],
        color: 0xffd700,  // gold
        shopPrice: 200,
        isStarter: false
    }
];

export default FISH_SPECIES;
