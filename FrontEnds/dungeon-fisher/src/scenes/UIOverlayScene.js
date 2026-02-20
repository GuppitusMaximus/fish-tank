import { VERSION } from '../version.js';
import { TEXT_STYLES, makeStyle } from '../constants/textStyles.js';

export default class UIOverlayScene extends Phaser.Scene {
    constructor() {
        super('UIOverlay');
    }

    create() {
        const { width, height } = this.scale;
        this.add.text(width - 4, height - 3, `v${VERSION}`, TEXT_STYLES.VERSION)
            .setOrigin(1, 1)
            .setDepth(1000)
            .setScrollFactor(0);

        const menuBtn = this.add.text(4, 3, '[ MENU ]', makeStyle(TEXT_STYLES.BUTTON, {
            fontSize: '11px',
            stroke: '#000000',
            strokeThickness: 2
        }))
            .setDepth(1000)
            .setScrollFactor(0)
            .setInteractive({ useHandCursor: true });

        menuBtn.on('pointerover', () => menuBtn.setColor('#ffffff'));
        menuBtn.on('pointerout', () => menuBtn.setColor('#aaaacc'));

        menuBtn.on('pointerdown', () => {
            const scenesToStop = [
                'CharacterSelectScene', 'FloorScene', 'BattleScene',
                'ShopScene', 'CampScene', 'VictoryScene', 'ZonePreviewScene'
            ];
            for (const key of scenesToStop) {
                if (this.scene.isActive(key)) {
                    this.scene.stop(key);
                }
            }
            this.scene.run('TitleScene');
        });

        this.menuBtn = menuBtn;
        menuBtn.setVisible(false);

        const hiddenScenes = new Set(['BootScene', 'TitleScene']);

        for (const s of this.scene.manager.scenes) {
            if (s.scene.key === 'UIOverlay') continue;
            s.sys.events.on('start', () => {
                this.menuBtn.setVisible(!hiddenScenes.has(s.scene.key));
            });
        }
    }
}
