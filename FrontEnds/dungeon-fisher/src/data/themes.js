export const ZONE_THEMES = {
    sewers: {
        id: 'sewers',
        name: 'The Sewers',
        floorRange: [1, 10],
        bgKey: 'bg_sewers',
        flavor: 'Damp sewers echo around you...',
        panel: {
            fill: 0x0a1a0a,
            outer: 0x4a6a3a,
            inner: 0x334422,
            accent: 0x88aa44,
        },
        ambient: {
            particles: { tints: [0x88cc44, 0x66aa33, 0xaaee55], speedY: [-18, -8], frequency: 140, quantity: 2 },
            ambientColor: 0x44aa44, ambientAlpha: 0.10,
            mist: { tints: [0x88aa66, 0xaabb88, 0x669944], y: [0.65, 1.0], frequency: 150, quantity: 2 }
        },
        shimmer: { base: [40, 180, 40], range: [30, 75, 30] },
        atlasKey: 'atlas_sewers',
        wideAtlasKey: 'atlas_sewers_wide',
        compositeKey: 'ui_sewers',
        pieceSize: 32,
        shop: {
            cardKey: 'card_shop_sewers',
            bgKey: 'bg_shop_sewers',
            merchantKey: 'merchant_rat',
            name: "Rat's Bargains",
        },
    },
    goblin_caves: {
        id: 'goblin_caves',
        name: 'Goblin Caves',
        floorRange: [11, 20],
        bgKey: 'bg_goblin-caves',
        flavor: 'Goblin laughter echoes in the dark...',
        panel: {
            fill: 0x1a0f0a,
            outer: 0x8a5a2a,
            inner: 0x553311,
            accent: 0xcc7733,
        },
        ambient: {
            particles: { tints: [0xff8833, 0xffaa44, 0xff6622, 0xffcc66], speedY: [-25, -10], frequency: 100, quantity: 3 },
            ambientColor: 0xff6600, ambientAlpha: 0.10,
            mist: { tints: [0x553322, 0x664433], y: [0.7, 1.0], frequency: 250, quantity: 1 }
        },
        shimmer: { base: [200, 100, 30], range: [55, 60, 30] },
        atlasKey: 'atlas_goblin_caves',
        shop: {
            cardKey: 'card_shop_goblin',
            bgKey: null,
            merchantKey: null,
            name: 'Goblin Bazaar',
        },
    },
    bone_crypts: {
        id: 'bone_crypts',
        name: 'Bone Crypts',
        floorRange: [21, 30],
        bgKey: 'bg_bone-crypts',
        flavor: 'Bones crunch underfoot...',
        panel: {
            fill: 0x12081a,
            outer: 0xaa99bb,
            inner: 0x443355,
            accent: 0xcc99ee,
        },
        ambient: {
            particles: { tints: [0xaa88cc, 0x8866aa, 0xcc99ee], speedY: [-10, -3], frequency: 200, quantity: 2 },
            ambientColor: 0x6633aa, ambientAlpha: 0.12,
            mist: { tints: [0x9977bb, 0x886699, 0x7755aa], y: [0.5, 1.0], frequency: 150, quantity: 2 }
        },
        shimmer: { base: [160, 100, 180], range: [40, 55, 40] },
        atlasKey: 'atlas_bone_crypts',
        shop: {
            cardKey: 'card_shop_crypts',
            bgKey: null,
            merchantKey: null,
            name: 'Crypt Dealer',
        },
    },
    deep_dungeon: {
        id: 'deep_dungeon',
        name: 'Deep Dungeon',
        floorRange: [31, 50],
        bgKey: 'bg_deep-dungeon',
        flavor: 'The air grows heavy...',
        panel: {
            fill: 0x0a0f1a,
            outer: 0x5a7a8a,
            inner: 0x223344,
            accent: 0x66ccdd,
        },
        ambient: {
            particles: { tints: [0x44dddd, 0x33bbcc, 0x66eeff, 0x22aacc], speedY: [-28, -12], frequency: 120, quantity: 2 },
            ambientColor: 0x33cccc, ambientAlpha: 0.10,
            mist: { tints: [0x66ccdd, 0x88ddee, 0x44bbcc], y: [0.6, 1.0], frequency: 140, quantity: 2 }
        },
        shimmer: { base: [50, 180, 200], range: [30, 55, 40] },
        atlasKey: 'atlas_deep_dungeon',
        shop: {
            cardKey: 'card_shop_deep',
            bgKey: null,
            merchantKey: null,
            name: 'Underdeep Trader',
        },
    },
    shadow_realm: {
        id: 'shadow_realm',
        name: 'Shadow Realm',
        floorRange: [51, 70],
        bgKey: 'bg_shadow-realm',
        flavor: 'Shadows move on their own...',
        panel: {
            fill: 0x0f0a1a,
            outer: 0x7744aa,
            inner: 0x332255,
            accent: 0xcc66ff,
        },
        ambient: {
            particles: { tints: [0xcc44ff, 0x44ffcc, 0x88ddff, 0xee66ff], speedY: [-14, -5], frequency: 150, quantity: 2 },
            ambientColor: 0x6644cc, ambientAlpha: 0.14,
            mist: { tints: [0x6633aa, 0x442288], y: [0.6, 1.0], frequency: 180, quantity: 2 }
        },
        shimmer: { base: [170, 50, 200], range: [55, 40, 55] },
        atlasKey: 'atlas_shadow_realm',
        shop: {
            cardKey: 'card_shop_shadow',
            bgKey: null,
            merchantKey: null,
            name: 'Shadow Broker',
        },
    },
    ancient_chambers: {
        id: 'ancient_chambers',
        name: 'Ancient Chambers',
        floorRange: [71, 90],
        bgKey: 'bg_ancient-chambers',
        flavor: 'Ancient power radiates from the walls...',
        panel: {
            fill: 0x1a150a,
            outer: 0xaa8844,
            inner: 0x554422,
            accent: 0xddaa55,
        },
        ambient: {
            particles: { tints: [0x66aaff, 0xaaccff, 0xffffff, 0x88bbff], speedY: [-12, -4], frequency: 180, quantity: 2 },
            ambientColor: 0x4488ff, ambientAlpha: 0.12,
            mist: { tints: [0x4466aa, 0x5577bb], y: [0.65, 1.0], frequency: 200, quantity: 1 }
        },
        shimmer: { base: [200, 160, 60], range: [55, 60, 30] },
        atlasKey: 'atlas_ancient_chambers',
        shop: {
            cardKey: 'card_shop_ancient',
            bgKey: null,
            merchantKey: null,
            name: 'Elder Reliquary',
        },
    },
    dungeon_heart: {
        id: 'dungeon_heart',
        name: 'Dungeon Heart',
        floorRange: [91, 100],
        bgKey: 'bg_dungeon-heart',
        flavor: "The dungeon's heart beats...",
        panel: {
            fill: 0x0a0408,
            outer: 0xaa2233,
            inner: 0x441122,
            accent: 0xff4455,
        },
        ambient: {
            particles: { tints: [0xff3344, 0xcc2233, 0xff6666, 0xff4455], speedY: [-20, -8], frequency: 90, quantity: 3 },
            ambientColor: 0xcc0022, ambientAlpha: 0.15,
            mist: { tints: [0x332244, 0x221133, 0x441155], y: [0.5, 1.0], frequency: 120, quantity: 2 }
        },
        shimmer: { base: [200, 40, 50], range: [55, 40, 30] },
        atlasKey: 'atlas_dungeon_heart',
        shop: {
            cardKey: 'card_shop_heart',
            bgKey: null,
            merchantKey: null,
            name: "Heart's Toll",
        },
    },
};

export const TITLE_THEME = {
    id: 'title',
    name: 'Dungeon Gate',
    bgKey: 'bg_title',
    panel: {
        fill: 0x0a0a1e,
        outer: 0x8a7a5a,
        inner: 0x554433,
        accent: 0xccaa66,
    },
    atlasKey: 'atlas_title',
    compositeKey: 'ui_gold',
    pieceSize: 32,
};

export const CHARACTER_THEMES = {
    andy: {
        id: 'andy',
        name: 'Andy the Abyss Angler',
        accent: 0x88ccff,
        emblemKey: 'emblem_andy',
        panelTint: 0x1a2a3a,
        panel: {
            fill: 0x0a1520,
            outer: 0x4477aa,
            inner: 0x1a2a3a,
            accent: 0x88ccff,
        },
    },
    saba: {
        id: 'saba',
        name: 'Saba the Divine',
        accent: 0xf0d888,
        emblemKey: 'emblem_saba',
        panelTint: 0x2a2218,
        panel: {
            fill: 0x1a150e,
            outer: 0xaa8844,
            inner: 0x2a2218,
            accent: 0xf0d888,
        },
    },
};

export const LEDGER_THEME = {
    id: 'ledger',
    name: "Delver's Ledger",
    panel: {
        fill: 0x1a0e08,
        outer: 0x6b4226,
        inner: 0x3d2414,
        accent: 0xc4a35a,
    },
};

export const PAGE_THEME = {
    id: 'ledger_page',
    name: 'Ledger Page',
    panel: {
        fill: 0x2a2218,
        outer: 0x5a4a32,
        inner: 0x3a3020,
        accent: 0x1a1008,
    },
};

const ZONE_LIST = Object.values(ZONE_THEMES).sort((a, b) => a.floorRange[0] - b.floorRange[0]);

export function getZoneByFloor(floor) {
    for (let i = ZONE_LIST.length - 1; i >= 0; i--) {
        if (floor >= ZONE_LIST[i].floorRange[0]) return ZONE_LIST[i];
    }
    return ZONE_LIST[0];
}

export function getZoneTheme(zoneId) {
    return ZONE_THEMES[zoneId] || null;
}

export function getCharacterTheme(charId) {
    return CHARACTER_THEMES[charId] || CHARACTER_THEMES.andy;
}

export function accentHex(theme) {
    return '#' + theme.panel.accent.toString(16).padStart(6, '0');
}
