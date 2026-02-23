import FISHERS from '../data/fishers.js';
import { TEXT_STYLES, makeStyle } from '../constants/textStyles.js';
import { TITLE_THEME } from '../data/themes.js';
import { UIPanel, UIButton, UILayout } from '../ui/index.js';

export default class CharacterSelectScene extends Phaser.Scene {
    constructor() {
        super('CharacterSelectScene');
    }

    create() {
        const { width, height } = this.scale;
        const isPortrait = this.registry.get('isPortrait');

        UILayout.sceneBackground(this, 'bg_title');
        UILayout.overlay(this, { alpha: 0.6, depth: 0 });

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
        new UIPanel(this, {
            x: width * 0.075, y: height * 0.15,
            width: width * 0.85, height: height * 0.75,
            theme: TITLE_THEME, depth: 1, alpha: 0.7
        });

        const portrait = this.add.image(width / 2, height * 0.32, fisher.portrait);
        portrait.setDisplaySize(100, 100).setDepth(2);

        this.add.text(width / 2, height * 0.52,
            fisher.name,
            makeStyle(TEXT_STYLES.FISH_NAME, { fontSize: '16px', color: '#ffffff' })
        ).setOrigin(0.5).setDepth(2);

        this.add.text(width / 2, height * 0.62,
            fisher.description,
            makeStyle(TEXT_STYLES.BODY, { wordWrap: { width: width * 0.8 }, align: 'center' })
        ).setOrigin(0.5).setDepth(2);

        UIButton.create(this, {
            x: width / 2, y: height * 0.82,
            label: '[ SELECT ]',
            style: makeStyle(TEXT_STYLES.BUTTON, { fontSize: '16px' }),
            depth: 1,
            hoverColor: '#ffffff',
            onClick: () => this.scene.start('TitleScene', { selectedFisher: fisher.id })
        });
    }

    _layoutLandscape(fisher, width, height) {
        new UIPanel(this, {
            x: width * 0.075, y: height * 0.1,
            width: width * 0.85, height: height * 0.8,
            theme: TITLE_THEME, depth: 1, alpha: 0.7
        });

        const portrait = this.add.image(width * 0.3, height * 0.5, fisher.portrait);
        portrait.setDisplaySize(80, 80).setDepth(2);

        this.add.text(width * 0.65, height * 0.3,
            fisher.name,
            makeStyle(TEXT_STYLES.FISH_NAME, { fontSize: '16px', color: '#ffffff' })
        ).setOrigin(0.5).setDepth(2);

        this.add.text(width * 0.65, height * 0.5,
            fisher.description,
            makeStyle(TEXT_STYLES.BODY, { wordWrap: { width: width * 0.4 }, align: 'center' })
        ).setOrigin(0.5).setDepth(2);

        UIButton.create(this, {
            x: width * 0.65, y: height * 0.78,
            label: '[ SELECT ]',
            style: makeStyle(TEXT_STYLES.BUTTON, { fontSize: '16px' }),
            depth: 1,
            hoverColor: '#ffffff',
            onClick: () => this.scene.start('TitleScene', { selectedFisher: fisher.id })
        });
    }
}
