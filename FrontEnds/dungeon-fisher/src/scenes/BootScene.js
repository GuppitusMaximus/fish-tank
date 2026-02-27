import { getZoneByFloor } from '../data/themes.js';
import SaveSystem from '../systems/SaveSystem.js';
import ConfigLoader from '../systems/ConfigLoader.js';

const fishConfigs = import.meta.glob('../config/fish/*.json', { eager: true });
const monsterConfigs = import.meta.glob('../config/monsters/*.json', { eager: true });
const characterConfigs = import.meta.glob('../config/characters/*.json', { eager: true });
import movesConfig from '../config/moves.json';
import combatConfig from '../config/combat.json';
import encountersConfig from '../config/encounters.json';
import equipmentItemsConfig from '../config/equipment-items.json';
import equipmentBalanceConfig from '../config/equipment-balance.json';

export default class BootScene extends Phaser.Scene {
    constructor() {
        super('BootScene');
    }

    preload() {
        // Initialize ConfigLoader FIRST — save migration depends on it
        const fishData = {};
        for (const [path, mod] of Object.entries(fishConfigs)) {
            const data = mod.default;
            fishData[data.id] = data;
        }
        const monsterData = {};
        for (const [path, mod] of Object.entries(monsterConfigs)) {
            const data = mod.default;
            monsterData[data.id] = data;
        }
        const characterData = {};
        for (const [path, mod] of Object.entries(characterConfigs)) {
            const data = mod.default;
            characterData[data.id] = data;
        }
        ConfigLoader.init({
            fish: fishData,
            monsters: monsterData,
            characters: characterData,
            moves: movesConfig,
            combat: combatConfig,
            encounters: encountersConfig,
            equipmentItems: equipmentItemsConfig,
            equipmentBalance: equipmentBalanceConfig
        });

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
        this.load.atlas('ui_gold', 'atlases/ui_gold.png', 'atlases/ui_gold.json');
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
                if (zone.compositeKey) {
                    this.load.atlas(zone.compositeKey, `atlases/${zone.compositeKey}.png`, `atlases/${zone.compositeKey}.json`);
                }
                if (zone.wideAtlasKey) {
                    this.load.image(zone.wideAtlasKey, `atlases/${zone.id}_wide.png`);
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

        // Small panel atlas for card-sized UI (thin borders)
        this.load.image('atlas_sewers_sm', 'atlases/sewers_sm.png');
        this.load.image('atlas_title_sm', 'atlases/title_sm.png');

        // Shop backgrounds
        this.load.image('bg_shop_sewers', 'backgrounds/shop_sewers.png');

        // Merchant sprites
        this.load.image('merchant_rat', 'sprites/merchants/rat_merchant.png');
    }

    create() {
        this.textures.each((key) => {
            if (key !== '__DEFAULT' && key !== '__MISSING' && key !== '__WHITE') {
                const tex = this.textures.get(key);
                tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
            }
        });

        this._generateEffectIcons();

        this.scene.launch('UIOverlay');
        this.scene.start('TitleScene');
    }

    _generateEffectIcons() {
        const size = 10;
        const icons = [
            { key: 'icon_poison', draw: (g) => {
                g.fillStyle(0x00cc00, 1);
                g.fillCircle(5, 4, 3);
                g.fillTriangle(5, 4, 3, 9, 7, 9);
            }},
            { key: 'icon_burn', draw: (g) => {
                g.fillStyle(0xff6600, 1);
                g.fillTriangle(5, 1, 1, 9, 9, 9);
                g.fillStyle(0xffcc00, 1);
                g.fillTriangle(5, 4, 3, 9, 7, 9);
            }},
            { key: 'icon_curse', draw: (g) => {
                g.fillStyle(0x9900cc, 1);
                g.fillTriangle(5, 1, 1, 5, 5, 9);
                g.fillTriangle(5, 1, 9, 5, 5, 9);
            }},
            { key: 'icon_shield', draw: (g) => {
                g.fillStyle(0x4488ff, 1);
                g.fillTriangle(5, 9, 1, 3, 9, 3);
                g.fillRect(1, 1, 8, 3);
                g.fillStyle(0x2266cc, 1);
                g.fillRect(2, 2, 6, 2);
            }},
            { key: 'icon_hot', draw: (g) => {
                g.fillStyle(0x00ff88, 1);
                g.fillRect(4, 1, 2, 8);
                g.fillRect(1, 4, 8, 2);
            }},
            { key: 'icon_buff_atk', draw: (g) => {
                g.fillStyle(0xff4444, 1);
                g.fillTriangle(5, 1, 1, 7, 9, 7);
                g.fillRect(3, 6, 4, 3);
            }},
            { key: 'icon_buff_def', draw: (g) => {
                g.fillStyle(0x4488ff, 1);
                g.fillTriangle(5, 1, 1, 7, 9, 7);
                g.fillRect(3, 6, 4, 3);
            }},
            { key: 'icon_buff_spd', draw: (g) => {
                g.fillStyle(0xffcc00, 1);
                g.fillTriangle(5, 1, 1, 7, 9, 7);
                g.fillRect(3, 6, 4, 3);
            }}
        ];

        for (const icon of icons) {
            const g = this.make.graphics({ x: 0, y: 0, add: false });
            icon.draw(g);
            g.generateTexture(icon.key, size, size);
            g.destroy();
        }
    }
}
