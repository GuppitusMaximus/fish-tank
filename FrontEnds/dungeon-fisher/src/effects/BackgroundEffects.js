/**
 * Zone-aware ambient background effects.
 * Call addEffects() after placing the background but BEFORE dark overlays.
 * Call cleanup() or let scene shutdown handle it.
 */

const ZONE_PRESETS = {
    'bg_sewers': {
        particles: { tints: [0x88cc44, 0x66aa33, 0xaaee55], speedY: [-18, -8], frequency: 140, quantity: 2 },
        ambientColor: 0x44aa44, ambientAlpha: 0.10,
        mist: { tints: [0x88aa66, 0xaabb88, 0x669944], y: [0.65, 1.0], frequency: 150, quantity: 2 }
    },
    'bg_goblin-caves': {
        particles: { tints: [0xff8833, 0xffaa44, 0xff6622, 0xffcc66], speedY: [-25, -10], frequency: 100, quantity: 3 },
        ambientColor: 0xff6600, ambientAlpha: 0.10,
        mist: { tints: [0x553322, 0x664433], y: [0.7, 1.0], frequency: 250, quantity: 1 }
    },
    'bg_bone-crypts': {
        particles: { tints: [0xaa88cc, 0x8866aa, 0xcc99ee], speedY: [-10, -3], frequency: 200, quantity: 2 },
        ambientColor: 0x6633aa, ambientAlpha: 0.12,
        mist: { tints: [0x9977bb, 0x886699, 0x7755aa], y: [0.5, 1.0], frequency: 150, quantity: 2 }
    },
    'bg_deep-dungeon': {
        particles: { tints: [0x44dddd, 0x33bbcc, 0x66eeff, 0x22aacc], speedY: [-28, -12], frequency: 120, quantity: 2 },
        ambientColor: 0x33cccc, ambientAlpha: 0.10,
        mist: { tints: [0x66ccdd, 0x88ddee, 0x44bbcc], y: [0.6, 1.0], frequency: 140, quantity: 2 }
    },
    'bg_shadow-realm': {
        particles: { tints: [0xcc44ff, 0x44ffcc, 0x88ddff, 0xee66ff], speedY: [-14, -5], frequency: 150, quantity: 2 },
        ambientColor: 0x6644cc, ambientAlpha: 0.14,
        mist: { tints: [0x6633aa, 0x442288], y: [0.6, 1.0], frequency: 180, quantity: 2 }
    },
    'bg_ancient-chambers': {
        particles: { tints: [0x66aaff, 0xaaccff, 0xffffff, 0x88bbff], speedY: [-12, -4], frequency: 180, quantity: 2 },
        ambientColor: 0x4488ff, ambientAlpha: 0.12,
        mist: { tints: [0x4466aa, 0x5577bb], y: [0.65, 1.0], frequency: 200, quantity: 1 }
    },
    'bg_dungeon-heart': {
        particles: { tints: [0xff3344, 0xcc2233, 0xff6666, 0xff4455], speedY: [-20, -8], frequency: 90, quantity: 3 },
        ambientColor: 0xcc0022, ambientAlpha: 0.15,
        mist: { tints: [0x332244, 0x221133, 0x441155], y: [0.5, 1.0], frequency: 120, quantity: 2 }
    }
};

export function addEffects(scene, bgKey) {
    const W = scene.scale.width;
    const H = scene.scale.height;
    const preset = ZONE_PRESETS[bgKey];
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
