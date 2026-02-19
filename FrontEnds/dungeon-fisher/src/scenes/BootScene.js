export default class BootScene extends Phaser.Scene {
    constructor() {
        super('BootScene');
    }

    create() {
        // Generate placeholder sprites as colored rectangles
        // Fish sprites: 32x16 colored rectangles with a simple tail shape
        // Monster sprites: 24x24 colored rectangles

        const fishColors = [
            { id: 'guppy', color: 0xe8734a },
            { id: 'pufferfish', color: 0xf0c040 },
            { id: 'swordfish', color: 0x4a90d9 },
            { id: 'clownfish', color: 0xe05080 },
            { id: 'anglerfish', color: 0x3a5060 },
            { id: 'barracuda', color: 0x5a5a5a },
            { id: 'jellyfish', color: 0x9b6dcc },
            { id: 'seahorse', color: 0x50c878 },
            { id: 'manta_ray', color: 0x3068a8 },
            { id: 'golden_koi', color: 0xffd700 }
        ];

        // Generate fish placeholder textures
        for (const fish of fishColors) {
            const gfx = this.make.graphics({ x: 0, y: 0, add: false });
            // Body
            gfx.fillStyle(fish.color, 1);
            gfx.fillEllipse(16, 8, 28, 14);
            // Eye
            gfx.fillStyle(0xffffff, 1);
            gfx.fillCircle(24, 6, 3);
            gfx.fillStyle(0x000000, 1);
            gfx.fillCircle(25, 5, 1.5);
            // Tail
            gfx.fillStyle(fish.color, 0.7);
            gfx.fillTriangle(0, 2, 0, 14, 8, 8);
            gfx.generateTexture(`fish_${fish.id}`, 32, 16);
            gfx.destroy();
        }

        // Generate monster placeholder textures
        const monsterColors = [
            { id: 'sewer_rat', color: 0x8b7355 },
            { id: 'cave_bat', color: 0x4a3a5a },
            { id: 'goblin', color: 0x4a8a3a },
            { id: 'spider', color: 0x2a2a2a },
            { id: 'skeleton', color: 0xd0d0c0 },
            { id: 'slime', color: 0x30c060 },
            { id: 'ogre', color: 0x6a5a30 },
            { id: 'wraith', color: 0x6060a0 },
            { id: 'golem', color: 0x808080 },
            { id: 'demon', color: 0xc03030 },
            { id: 'dragon', color: 0xc06020 },
            { id: 'shadow_lord', color: 0x2a1a3a },
            { id: 'dungeon_lord', color: 0xff2020 }
        ];

        for (const monster of monsterColors) {
            const gfx = this.make.graphics({ x: 0, y: 0, add: false });
            gfx.fillStyle(monster.color, 1);
            gfx.fillRect(2, 2, 20, 20);
            // Eyes
            gfx.fillStyle(0xff0000, 1);
            gfx.fillCircle(8, 8, 2);
            gfx.fillCircle(16, 8, 2);
            gfx.generateTexture(`monster_${monster.id}`, 24, 24);
            gfx.destroy();
        }

        // Generate UI placeholder textures
        const uiGfx = this.make.graphics({ x: 0, y: 0, add: false });
        // Button background
        uiGfx.fillStyle(0x2a2a4a, 1);
        uiGfx.fillRoundedRect(0, 0, 100, 24, 4);
        uiGfx.lineStyle(1, 0x4a4a8a, 1);
        uiGfx.strokeRoundedRect(0, 0, 100, 24, 4);
        uiGfx.generateTexture('button_bg', 100, 24);
        uiGfx.destroy();

        this.scene.start('TitleScene');
    }
}
