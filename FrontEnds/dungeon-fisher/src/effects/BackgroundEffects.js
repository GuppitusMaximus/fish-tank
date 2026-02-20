/**
 * Zone-aware ambient background effects.
 * Call addEffects() after placing the background but BEFORE dark overlays.
 * Call cleanup() or let scene shutdown handle it.
 */

const ZONE_PRESETS = {
    'bg_sewers': {
        particles: { tints: [0x88cc44, 0x66aa33], speedY: [-12, -6], frequency: 300 },
        ambientColor: 0x44aa44, ambientAlpha: 0.06,
        mist: { tints: [0x88aa66, 0xaabb88], y: [0.75, 1.0] }
    },
    'bg_goblin-caves': {
        particles: { tints: [0xff8833, 0xffaa44, 0xff6622], speedY: [-18, -8], frequency: 200 },
        ambientColor: 0xff6600, ambientAlpha: 0.05,
        mist: null
    },
    'bg_bone-crypts': {
        particles: { tints: [0xaa88cc, 0x8866aa], speedY: [-6, -2], frequency: 500 },
        ambientColor: 0x6633aa, ambientAlpha: 0.06,
        mist: { tints: [0x9977bb, 0x886699], y: [0.6, 1.0] }
    },
    'bg_deep-dungeon': {
        particles: { tints: [0x44dddd, 0x33bbcc, 0x66eeff], speedY: [-20, -10], frequency: 250 },
        ambientColor: 0x33cccc, ambientAlpha: 0.05,
        mist: { tints: [0x66ccdd, 0x88ddee], y: [0.7, 1.0] }
    },
    'bg_shadow-realm': {
        particles: { tints: [0xcc44ff, 0x44ffcc, 0x88ddff], speedY: [-10, -4], frequency: 350 },
        ambientColor: 0x6644cc, ambientAlpha: 0.07,
        mist: null
    },
    'bg_ancient-chambers': {
        particles: { tints: [0x66aaff, 0xaaccff, 0xffffff], speedY: [-8, -3], frequency: 400 },
        ambientColor: 0x4488ff, ambientAlpha: 0.06,
        mist: null
    },
    'bg_dungeon-heart': {
        particles: { tints: [0xff3344, 0xcc2233, 0xff6666], speedY: [-14, -6], frequency: 200 },
        ambientColor: 0xcc0022, ambientAlpha: 0.08,
        mist: { tints: [0x332244, 0x221133], y: [0.65, 1.0] }
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
        y: { min: H * 0.2, max: H * 0.8 },
        lifespan: 4000,
        speedY: { min: p.speedY[0], max: p.speedY[1] },
        speedX: { min: -4, max: 4 },
        scale: { start: 0.5, end: 0.1 },
        alpha: { start: 0.5, end: 0 },
        tint: p.tints,
        frequency: p.frequency,
        quantity: 1,
        blendMode: 'ADD'
    });
    emitters.push(particleEmitter);

    // Mist / fog layer rising from bottom (not all zones have this)
    if (preset.mist) {
        const m = preset.mist;
        const mistEmitter = scene.add.particles(0, 0, 'particle_soft', {
            x: { min: 0, max: W },
            y: { min: H * m.y[0], max: H * m.y[1] },
            lifespan: 5000,
            speedY: { min: -10, max: -4 },
            speedX: { min: -3, max: 3 },
            scale: { start: 0.4, end: 0.1 },
            alpha: { start: 0.3, end: 0 },
            tint: m.tints,
            frequency: 350,
            quantity: 1,
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
        alpha: { from: preset.ambientAlpha, to: preset.ambientAlpha * 2.5 },
        duration: 3000,
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
