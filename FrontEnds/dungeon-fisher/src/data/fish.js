// Each fish species definition
// Stats are base stats at level 1. On level up: HP +5, ATK +2, DEF +1, SPD +1
// specialMove: the unique special move ID for this species

const FISH_SPECIES = [
    {
        id: 'guppy',
        name: 'Guppy',
        description: 'A reliable starter. Balanced stats.',
        baseHp: 30, baseAtk: 8, baseDef: 5, baseSpd: 6,
        specialMove: 'bubble_volley',
        color: 0xe8734a,
        shopPrice: 0,
        isStarter: true
    },
    {
        id: 'pufferfish',
        name: 'Pufferfish',
        description: 'Tanky. High HP, strong defense, slow.',
        baseHp: 45, baseAtk: 5, baseDef: 9, baseSpd: 3,
        specialMove: 'spike_shield',
        color: 0xf0c040,
        shopPrice: 60,
        isStarter: true
    },
    {
        id: 'swordfish',
        name: 'Swordfish',
        description: 'Glass cannon. Hits hard, fragile.',
        baseHp: 22, baseAtk: 14, baseDef: 3, baseSpd: 8,
        specialMove: 'deep_strike',
        color: 0x4a90d9,
        shopPrice: 80,
        isStarter: true
    },
    {
        id: 'clownfish',
        name: 'Clownfish',
        description: 'Speedy. Always acts first.',
        baseHp: 28, baseAtk: 7, baseDef: 5, baseSpd: 10,
        specialMove: 'trick_shot',
        color: 0xe05080,
        shopPrice: 70,
        isStarter: false
    },
    {
        id: 'anglerfish',
        name: 'Anglerfish',
        description: 'Deep dweller. Strong special attacks.',
        baseHp: 32, baseAtk: 10, baseDef: 6, baseSpd: 4,
        specialMove: 'abyssal_beam',
        color: 0x3a5060,
        shopPrice: 90,
        isStarter: false
    },
    {
        id: 'barracuda',
        name: 'Barracuda',
        description: 'Aggressive hunter. Fast and strong.',
        baseHp: 26, baseAtk: 12, baseDef: 4, baseSpd: 9,
        specialMove: 'razor_rush',
        color: 0x5a5a5a,
        shopPrice: 100,
        isStarter: false
    },
    {
        id: 'jellyfish',
        name: 'Jellyfish',
        description: 'Venomous. Poisons enemies over time.',
        baseHp: 25, baseAtk: 6, baseDef: 7, baseSpd: 7,
        specialMove: 'venom_sting',
        color: 0x9b6dcc,
        shopPrice: 85,
        isStarter: false
    },
    {
        id: 'seahorse',
        name: 'Seahorse',
        description: 'Supportive. Can heal itself in battle.',
        baseHp: 35, baseAtk: 5, baseDef: 6, baseSpd: 5,
        specialMove: 'healing_tide',
        color: 0x50c878,
        shopPrice: 75,
        isStarter: false
    },
    {
        id: 'manta_ray',
        name: 'Manta Ray',
        description: 'Sturdy all-rounder. No weaknesses.',
        baseHp: 38, baseAtk: 9, baseDef: 7, baseSpd: 5,
        specialMove: 'tidal_crush',
        color: 0x3068a8,
        shopPrice: 120,
        isStarter: false
    },
    {
        id: 'golden_koi',
        name: 'Golden Koi',
        description: 'Rare and powerful. Excellent stats.',
        baseHp: 34, baseAtk: 11, baseDef: 8, baseSpd: 7,
        specialMove: 'golden_aura',
        color: 0xffd700,
        shopPrice: 200,
        isStarter: false
    }
];

export default FISH_SPECIES;
