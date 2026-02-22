/**
 * Zone-aware ambient background effects.
 * Call addEffects() after placing the background but BEFORE dark overlays.
 * Call cleanup() or let scene shutdown handle it.
 */

import { ZONE_THEMES } from '../data/themes.js';

const ZONE_BY_BG_KEY = {};
for (const zone of Object.values(ZONE_THEMES)) {
    ZONE_BY_BG_KEY[zone.bgKey] = zone;
}

export function addEffects(scene, bgKey) {
    const W = scene.scale.width;
    const H = scene.scale.height;
    const zone = ZONE_BY_BG_KEY[bgKey];
    const preset = zone ? zone.ambient : null;
    if (!preset) return { cleanup: () => {} };

    const emitters = [];

    // Create particle textures if not already present
    if (!scene.textures.exists('particle_soft')) {
        const gfx = scene.make.graphics({ add: false });
        gfx.fillStyle(0xffffff, 0.6);
        gfx.fillCircle(6, 6, 6);
        gfx.fillStyle(0xffffff, 0.3);
        gfx.fillCircle(6, 6, 3);
        gfx.generateTexture('particle_soft', 12, 12);
        gfx.destroy();
    }
    if (!scene.textures.exists('particle_dot')) {
        const gfx = scene.make.graphics({ add: false });
        gfx.fillStyle(0xffffff, 1);
        gfx.fillCircle(2, 2, 2);
        gfx.generateTexture('particle_dot', 4, 4);
        gfx.destroy();
    }

    // Floating particles (embers, spores, wisps depending on zone)
    const p = preset.particles;
    const particleEmitter = scene.add.particles(0, 0, 'particle_dot', {
        x: { min: 0, max: W },
        y: { min: H * 0.1, max: H * 0.9 },
        lifespan: 5000,
        speedY: { min: p.speedY[0], max: p.speedY[1] },
        speedX: { min: -6, max: 6 },
        scale: { start: 0.8, end: 0.2 },
        alpha: { start: 0.7, end: 0 },
        tint: p.tints,
        frequency: p.frequency,
        quantity: p.quantity || 2,
        blendMode: 'ADD'
    });
    emitters.push(particleEmitter);

    // Mist / fog layer rising from bottom (not all zones have this)
    if (preset.mist) {
        const m = preset.mist;
        const mistEmitter = scene.add.particles(0, 0, 'particle_soft', {
            x: { min: 0, max: W },
            y: { min: H * m.y[0], max: H * m.y[1] },
            lifespan: 6000,
            speedY: { min: -14, max: -5 },
            speedX: { min: -5, max: 5 },
            scale: { start: 0.7, end: 0.15 },
            alpha: { start: 0.5, end: 0 },
            tint: m.tints,
            frequency: m.frequency || 150,
            quantity: m.quantity || 2,
            blendMode: 'ADD'
        });
        emitters.push(mistEmitter);
    }

    // Ambient light pulse overlay
    const ambientRect = scene.add.rectangle(
        W / 2, H / 2, W, H,
        preset.ambientColor, preset.ambientAlpha
    );
    scene.tweens.add({
        targets: ambientRect,
        alpha: { from: preset.ambientAlpha * 0.5, to: preset.ambientAlpha * 3.0 },
        duration: 2500,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut'
    });

    return {
        cleanup: () => {
            emitters.forEach(e => e.destroy());
            ambientRect.destroy();
        }
    };
}
