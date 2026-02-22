const loadedZones = new Set();

/**
 * Load a zone's theme assets (background + atlas) if not already loaded.
 * Gracefully no-ops when atlas files don't exist yet.
 *
 * @param {Phaser.Scene} scene - any active scene (its loader is used)
 * @param {object} zoneTheme - zone theme object from themes.js
 * @param {function} [onComplete] - callback invoked when loading finishes (or immediately if already loaded)
 */
export function loadZoneTheme(scene, zoneTheme, onComplete) {
    if (loadedZones.has(zoneTheme.id)) {
        if (onComplete) onComplete();
        return;
    }

    const needsBg = !scene.textures.exists(zoneTheme.bgKey);
    const needsAtlas = zoneTheme.atlasKey && !scene.textures.exists(zoneTheme.atlasKey);

    if (!needsBg && !needsAtlas) {
        loadedZones.add(zoneTheme.id);
        if (onComplete) onComplete();
        return;
    }

    if (needsBg) {
        const filename = zoneTheme.bgKey.replace('bg_', '');
        scene.load.image(zoneTheme.bgKey, `backgrounds/${filename}.png`);
    }
    if (needsAtlas) {
        scene.load.atlas(
            zoneTheme.atlasKey,
            `atlases/${zoneTheme.id}.png`,
            `atlases/${zoneTheme.id}.json`
        );
    }

    scene.load.once('complete', () => {
        loadedZones.add(zoneTheme.id);
        if (onComplete) onComplete();
    });

    // Suppress error when atlas files don't exist yet — panel falls back to DungeonPanel graphics
    if (needsAtlas) {
        scene.load.once('loaderror', (file) => {
            if (file.key === zoneTheme.atlasKey) {
                console.debug(`[ThemeAssetLoader] Atlas not found for ${zoneTheme.id}, using fallback`);
            }
        });
    }

    scene.load.start();
}

/**
 * Unload a zone's theme atlas to free GPU texture memory.
 * Does NOT unload the zone background (it's small enough to keep).
 *
 * @param {Phaser.Scene} scene
 * @param {object} zoneTheme
 */
export function unloadZoneTheme(scene, zoneTheme) {
    if (!loadedZones.has(zoneTheme.id)) return;
    if (zoneTheme.atlasKey && scene.textures.exists(zoneTheme.atlasKey)) {
        scene.textures.remove(zoneTheme.atlasKey);
    }
    loadedZones.delete(zoneTheme.id);
}

/**
 * Check if a zone's theme assets are loaded.
 */
export function isZoneLoaded(zoneId) {
    return loadedZones.has(zoneId);
}
