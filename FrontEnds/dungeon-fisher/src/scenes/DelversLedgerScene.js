import ConfigLoader from '../systems/ConfigLoader.js';
import { TEXT_STYLES, makeStyle } from '../constants/textStyles.js';
import { LEDGER_THEME, PAGE_THEME } from '../data/themes.js';
import { UIPanel, UIButton, UILayout } from '../ui/index.js';

export default class DelversLedgerScene extends Phaser.Scene {
    constructor() {
        super('DelversLedgerScene');
    }

    create(data) {
        const { width, height } = this.scale;
        this._isPortrait = this.registry.get('isPortrait');
        this._elements = [];
        this._showCover(width, height);
    }

    _showCover(width, height) {
        const { bg } = UILayout.sceneBackground(this, 'bg_title');
        this._elements.push(bg);

        const overlay = UILayout.overlay(this, { alpha: 0.7 });
        this._elements.push(overlay);

        const panelW = Math.round(width * 0.85);
        const panelH = Math.round(height * 0.75);
        const panelX = Math.round((width - panelW) / 2);
        const panelY = Math.round((height - panelH) / 2);

        const panel = new UIPanel(this, {
            x: panelX, y: panelY, width: panelW, height: panelH,
            theme: LEDGER_THEME, depth: 1, alpha: 0.95
        });
        this._elements.push(panel);

        const title = this.add.text(Math.round(width / 2), Math.round(panelY + panelH * 0.35),
            "The Delver's\nLedger",
            makeStyle(TEXT_STYLES.TITLE_SMALL, {
                fontSize: '18px',
                align: 'center',
                color: '#c4a35a'
            })
        ).setOrigin(0.5).setDepth(2);
        this._elements.push(title);

        const prompt = this.add.text(Math.round(width / 2), Math.round(panelY + panelH * 0.65),
            'Tap to Open',
            makeStyle(TEXT_STYLES.BODY_SMALL, { color: '#8a7a5a' })
        ).setOrigin(0.5).setDepth(2);
        this._elements.push(prompt);

        this.tweens.add({
            targets: prompt,
            alpha: { from: 1, to: 0.3 },
            duration: 1200,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.InOut'
        });

        this.input.once('pointerdown', () => this._openBook());
        this.time.delayedCall(3000, () => this._openBook());
        this._coverOpened = false;
    }

    _openBook() {
        if (this._coverOpened) return;
        this._coverOpened = true;

        for (const el of this._elements) el.destroy();
        this._elements = [];
        this.tweens.killAll();

        this._showCharacterSpread('andy');
    }

    _showCharacterSpread(fisherId) {
        const { width, height } = this.scale;
        const fisher = ConfigLoader.getCharacter(fisherId);
        if (!fisher) return;

        const { bg } = UILayout.sceneBackground(this, 'bg_title');
        this._elements.push(bg);

        const overlay = UILayout.overlay(this, { alpha: 0.7 });
        this._elements.push(overlay);

        if (this._isPortrait) {
            this._layoutPortrait(fisher, width, height);
        } else {
            this._layoutLandscape(fisher, width, height);
        }
    }

    _layoutPortrait(fisher, width, height) {
        const panelW = Math.round(width * 0.85);
        const panelH = Math.round(height * 0.85);
        const panelX = Math.round((width - panelW) / 2);
        const panelY = Math.round((height - panelH) / 2);

        const panel = new UIPanel(this, {
            x: panelX, y: panelY, width: panelW, height: panelH,
            theme: PAGE_THEME, depth: 1, alpha: 0.95
        });
        this._elements.push(panel);

        const contentW = Math.round(panelW * 0.85);
        const cx = Math.round(width / 2);
        let y = panelY + 20;

        if (this.textures.exists(fisher.portrait)) {
            const portrait = this.add.image(cx, y + 40, fisher.portrait)
                .setDisplaySize(80, 80).setDepth(2);
            this._elements.push(portrait);
            y += 90;
        }

        const name = this.add.text(cx, y,
            fisher.name,
            makeStyle(TEXT_STYLES.FISH_NAME, { fontSize: '14px', color: '#c4a35a' })
        ).setOrigin(0.5).setDepth(2);
        this._elements.push(name);
        y += 20;

        if (fisher.lore) {
            const lore = this.add.text(cx, y,
                fisher.lore,
                makeStyle(TEXT_STYLES.FLAVOR, {
                    fontSize: '11px',
                    wordWrap: { width: contentW },
                    align: 'center',
                    color: '#aaa088'
                })
            ).setOrigin(0.5, 0).setDepth(2);
            this._elements.push(lore);
            y += lore.displayHeight + 12;
        }

        if (fisher.mechanics) {
            const mech = this.add.text(cx, y,
                fisher.mechanics,
                makeStyle(TEXT_STYLES.BODY_SMALL, {
                    fontSize: '10px',
                    wordWrap: { width: contentW },
                    align: 'center',
                    color: '#888878'
                })
            ).setOrigin(0.5, 0).setDepth(2);
            this._elements.push(mech);
        }

        const selectBtn = UIButton.create(this, {
            x: cx, y: Math.round(panelY + panelH - 22),
            label: '[ SELECT ]',
            style: makeStyle(TEXT_STYLES.BUTTON, { fontSize: '14px', color: '#c4a35a' }),
            depth: 2,
            hoverColor: '#ffffff',
            onClick: () => this.scene.start('TitleScene', { selectedFisher: fisher.id })
        });
        this._elements.push(selectBtn);
    }

    _layoutLandscape(fisher, width, height) {
        const panelW = Math.round(width * 0.85);
        const panelH = Math.round(height * 0.80);
        const panelX = Math.round((width - panelW) / 2);
        const panelY = Math.round((height - panelH) / 2);

        const panel = new UIPanel(this, {
            x: panelX, y: panelY, width: panelW, height: panelH,
            theme: PAGE_THEME, depth: 1, alpha: 0.95
        });
        this._elements.push(panel);

        const midX = Math.round(panelX + panelW / 2);
        const leftCx = Math.round(panelX + panelW * 0.25);
        const rightCx = Math.round(panelX + panelW * 0.75);
        const rightContentW = Math.round(panelW * 0.4);

        const divider = this.add.rectangle(midX, Math.round(panelY + panelH / 2), 1, Math.round(panelH * 0.8), 0x5a4a32)
            .setDepth(2).setAlpha(0.6);
        this._elements.push(divider);

        if (this.textures.exists(fisher.portrait)) {
            const portrait = this.add.image(leftCx, Math.round(panelY + panelH * 0.38), fisher.portrait)
                .setDisplaySize(80, 80).setDepth(2);
            this._elements.push(portrait);
        }

        const name = this.add.text(leftCx, Math.round(panelY + panelH * 0.72),
            fisher.name,
            makeStyle(TEXT_STYLES.FISH_NAME, { fontSize: '13px', color: '#c4a35a' })
        ).setOrigin(0.5).setDepth(2);
        this._elements.push(name);

        let ry = panelY + 16;

        if (fisher.lore) {
            const lore = this.add.text(rightCx, ry,
                fisher.lore,
                makeStyle(TEXT_STYLES.FLAVOR, {
                    fontSize: '11px',
                    wordWrap: { width: rightContentW },
                    align: 'center',
                    color: '#aaa088'
                })
            ).setOrigin(0.5, 0).setDepth(2);
            this._elements.push(lore);
            ry += lore.displayHeight + 10;
        }

        if (fisher.mechanics) {
            const mech = this.add.text(rightCx, ry,
                fisher.mechanics,
                makeStyle(TEXT_STYLES.BODY_SMALL, {
                    fontSize: '10px',
                    wordWrap: { width: rightContentW },
                    align: 'center',
                    color: '#888878'
                })
            ).setOrigin(0.5, 0).setDepth(2);
            this._elements.push(mech);
        }

        const selectBtn = UIButton.create(this, {
            x: rightCx, y: Math.round(panelY + panelH - 20),
            label: '[ SELECT ]',
            style: makeStyle(TEXT_STYLES.BUTTON, { fontSize: '14px', color: '#c4a35a' }),
            depth: 2,
            hoverColor: '#ffffff',
            onClick: () => this.scene.start('TitleScene', { selectedFisher: fisher.id })
        });
        this._elements.push(selectBtn);
    }
}
