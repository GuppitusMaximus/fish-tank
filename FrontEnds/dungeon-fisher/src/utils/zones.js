export function getBackgroundKey(floor) {
    if (floor <= 10) return 'bg_sewers';
    if (floor <= 20) return 'bg_goblin-caves';
    if (floor <= 30) return 'bg_bone-crypts';
    if (floor <= 50) return 'bg_deep-dungeon';
    if (floor <= 70) return 'bg_shadow-realm';
    if (floor <= 90) return 'bg_ancient-chambers';
    return 'bg_dungeon-heart';
}

export const BACKGROUND_KEYS = [
    'bg_sewers',
    'bg_goblin-caves',
    'bg_bone-crypts',
    'bg_deep-dungeon',
    'bg_shadow-realm',
    'bg_ancient-chambers',
    'bg_dungeon-heart'
];
