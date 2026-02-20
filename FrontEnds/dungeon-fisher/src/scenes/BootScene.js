export default class BootScene extends Phaser.Scene {
    constructor() {
        super('BootScene');
    }

    preload() {
        // Fish sprites (128x64)
        const fish = [
            'guppy', 'pufferfish', 'swordfish', 'clownfish', 'anglerfish',
            'barracuda', 'jellyfish', 'seahorse', 'manta_ray', 'golden_koi'
        ];
        for (const id of fish) {
            this.load.image(`fish_${id}`, `sprites/fish/${id}.png`);
        }

        // Monster sprites (128x128)
        const monsters = [
            'sewer_rat', 'cave_bat', 'goblin', 'spider', 'skeleton', 'slime',
            'ogre', 'wraith', 'golem', 'demon', 'dragon', 'shadow_lord', 'dungeon_lord'
        ];
        for (const id of monsters) {
            this.load.image(`monster_${id}`, `sprites/monsters/${id}.png`);
        }
    }

    create() {
        this.scene.start('TitleScene');
    }
}
