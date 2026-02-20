import FISHERS from '../data/fishers.js';
import { coverBackground } from '../utils/zones.js';
import { TEXT_STYLES, makeStyle } from '../constants/textStyles.js';

export default class CharacterSelectScene extends Phaser.Scene {
    constructor() {
        super('CharacterSelectScene');
    }

    create() {
        const { width, height } = this.scale;
        const isPortrait = this.registry.get('isPortrait');

        // Background — same as TitleScene
        coverBackground(this, 'bg_title', 'contain');
        this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.6);

        // Header
        this.add.text(width / 2, height * 0.08, 'Choose your Fisher',
            makeStyle(TEXT_STYLES.TITLE_SMALL)
        ).setOrigin(0.5);

        const fisher = FISHERS[0];

        if (isPortrait) {
            this._layoutPortrait(fisher, width, height);
        } else {
            this._layoutLandscape(fisher, width, height);
        }
    }

    _layoutPortrait(fisher, width, height) {
        // Portrait image — centered
        const portrait = this.add.image(width / 2, height * 0.32, fisher.portrait);
        portrait.setDisplaySize(100, 100);

        // Name
        this.add.text(width / 2, height * 0.52,
            fisher.name,
            makeStyle(TEXT_STYLES.FISH_NAME, { fontSize: '16px', color: '#ffffff' })
        ).setOrigin(0.5);

        // Description
        this.add.text(width / 2, height * 0.62,
            fisher.description,
            makeStyle(TEXT_STYLES.BODY, { wordWrap: { width: width * 0.8 }, align: 'center' })
        ).setOrigin(0.5);

        // Select button
        const btn = this.add.text(width / 2, height * 0.82, '[ SELECT ]',
            makeStyle(TEXT_STYLES.BUTTON, { fontSize: '16px' })
        ).setOrigin(0.5).setInteractive({ useHandCursor: true });

        btn.on('pointerover', () => btn.setColor('#ffffff'));
        btn.on('pointerout', () => btn.setColor('#aaaacc'));
        btn.on('pointerdown', () => {
            this.scene.start('TitleScene', { selectedFisher: fisher.id });
        });
    }

    _layoutLandscape(fisher, width, height) {
        // Portrait image — left-center
        const portrait = this.add.image(width * 0.3, height * 0.5, fisher.portrait);
        portrait.setDisplaySize(80, 80);

        // Name — right side
        this.add.text(width * 0.65, height * 0.3,
            fisher.name,
            makeStyle(TEXT_STYLES.FISH_NAME, { fontSize: '16px', color: '#ffffff' })
        ).setOrigin(0.5);

        // Description — right side
        this.add.text(width * 0.65, height * 0.5,
            fisher.description,
            makeStyle(TEXT_STYLES.BODY, { wordWrap: { width: width * 0.4 }, align: 'center' })
        ).setOrigin(0.5);

        // Select button — right side bottom
        const btn = this.add.text(width * 0.65, height * 0.78, '[ SELECT ]',
            makeStyle(TEXT_STYLES.BUTTON, { fontSize: '16px' })
        ).setOrigin(0.5).setInteractive({ useHandCursor: true });

        btn.on('pointerover', () => btn.setColor('#ffffff'));
        btn.on('pointerout', () => btn.setColor('#aaaacc'));
        btn.on('pointerdown', () => {
            this.scene.start('TitleScene', { selectedFisher: fisher.id });
        });
    }
}
