import { getZoneByFloor } from '../data/themes.js';
import SaveSystem from '../systems/SaveSystem.js';

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

        // Fisher portraits
        const fishers = ['andy'];
        for (const id of fishers) {
            this.load.image(`fisher_${id}`, `sprites/fishers/${id}.png`);
        }

        // Character emblems
        this.load.image('emblem_andy', 'sprites/emblems/andy.png');

        // Background images — load only title + save zone at boot (others load on demand)
        this.load.image('bg_title', 'backgrounds/title.png');
        this.load.image('atlas_title', 'atlases/title.png');
        if (SaveSystem.hasSave()) {
            const saveData = SaveSystem.load();
            if (saveData) {
                const zone = getZoneByFloor(saveData.floor);
                if (zone.bgKey !== 'bg_title') {
                    const filename = zone.bgKey.replace('bg_', '');
                    this.load.image(zone.bgKey, `backgrounds/${filename}.png`);
                }
                if (zone.atlasKey) {
                    this.load.image(zone.atlasKey, `atlases/${zone.id}.png`);
                }
            }
        }

        // Action card images
        this.load.image('card_delve', 'images/card_delve.png');
        this.load.image('card_camp', 'images/card_camp.png');
        this.load.image('card_shop_sewers', 'images/card_shop_sewers.png');
        this.load.image('card_shop_goblin', 'images/card_shop_goblin.png');
        this.load.image('card_shop_crypts', 'images/card_shop_crypts.png');
        this.load.image('card_shop_deep', 'images/card_shop_deep.png');
        this.load.image('card_shop_shadow', 'images/card_shop_shadow.png');
        this.load.image('card_shop_ancient', 'images/card_shop_ancient.png');
        this.load.image('card_shop_heart', 'images/card_shop_heart.png');

        // Shop backgrounds
        this.load.image('bg_shop_sewers', 'backgrounds/shop_sewers.png');

        // Merchant sprites
        this.load.image('merchant_rat', 'sprites/merchants/rat_merchant.png');
    }

    create() {
        this.scene.launch('UIOverlay');
        this.scene.start('TitleScene');
    }
}
