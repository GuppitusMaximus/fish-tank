import { ZONE_THEMES, TITLE_THEME, getZoneByFloor } from '../data/themes.js';

export { getZoneByFloor } from '../data/themes.js';

export function getBackgroundKey(floor) {
    return getZoneByFloor(floor).bgKey;
}

export function coverBackground(scene, key, mode = 'cover') {
    const W = scene.scale.width;
    const H = scene.scale.height;
    const img = scene.add.image(W / 2, H / 2, key);
    const scale = mode === 'contain'
        ? Math.min(W / img.width, H / img.height)
        : Math.max(W / img.width, H / img.height);
    img.setScale(scale);
    return img;
}

export const BACKGROUND_KEYS = [
    ...Object.values(ZONE_THEMES).map(z => z.bgKey),
    TITLE_THEME.bgKey
];

export function getShopCardKey(floor) {
    return getZoneByFloor(floor).shop.cardKey;
}

export function getShopBackground(floor) {
    return getZoneByFloor(floor).shop.bgKey;
}

export function getShopMerchant(floor) {
    return getZoneByFloor(floor).shop.merchantKey;
}

export function getShopName(floor) {
    const zone = getZoneByFloor(floor);
    return zone.shop.name || zone.name;
}
