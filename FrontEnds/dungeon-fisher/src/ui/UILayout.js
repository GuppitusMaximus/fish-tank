import { coverBackground } from '../utils/zones.js';
import { addEffects } from '../effects/BackgroundEffects.js';

export function overlay(scene, opts = {}) {
    const W = scene.scale.width;
    const H = scene.scale.height;
    const color = opts.color ?? 0x000000;
    const alpha = opts.alpha ?? 0.5;
    const depth = opts.depth ?? 1;

    const rect = scene.add.rectangle(W / 2, H / 2, W, H, color, alpha);
    rect.setDepth(depth);
    rect.setScrollFactor(0);
    return rect;
}

export function sceneBackground(scene, bgKey, opts = {}) {
    const mode = opts.mode || 'cover';
    const bg = coverBackground(scene, bgKey, mode);

    let effectsHandle = null;
    if (opts.effects) {
        effectsHandle = addEffects(scene, bgKey);
    }

    let overlayRect = null;
    if (opts.overlay != null && opts.overlay !== false) {
        overlayRect = overlay(scene, { alpha: opts.overlay });
    }

    return { bg, overlay: overlayRect, effectsHandle };
}
