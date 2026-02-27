import ConfigLoader from '../systems/ConfigLoader.js';
import { TEXT_STYLES, makeStyle } from '../constants/textStyles.js';
import { LEDGER_THEME, PAGE_THEME, getZoneByFloor } from '../data/themes.js';
import { UILayout } from '../ui/index.js';
import { themedPanel } from '../ui/ThemedPanel.js';
import { coverBackground } from '../utils/zones.js';

export default class DelversLedgerScene extends Phaser.Scene {
    constructor() {
        super('DelversLedgerScene');
    }

    create(data) {
        const { width, height } = this.scale;
        this._isPortrait = this.registry.get('isPortrait');
        this._transitioning = false;
        this._bookOpen = false;

        this._pages = [
            { fisherId: 'andy', selectable: true },
            { fisherId: null, comingSoon: true, selectable: false }
        ];
        this._currentPage = 0;

        UILayout.sceneBackground(this, 'bg_title');
        UILayout.overlay(this, { alpha: 0.7 });

        this._setupSewerBg(width, height);

        const panelW = Math.round(width * 0.85);
        const panelH = Math.round(height * (this._isPortrait ? 0.75 : 0.80));
        this._bookW = panelW;
        this._bookH = panelH;

        const cx = Math.round(width / 2);
        const cy = Math.round(height / 2);
        this._bookContainer = this.add.container(cx, cy).setDepth(5);

        this._coverContainer = this.add.container(0, 0);
        this._bookContainer.add(this._coverContainer);
        this._buildCover(panelW, panelH);

        this._pageContainer = this.add.container(0, 0);
        this._pageContainer.setVisible(false);
        this._bookContainer.add(this._pageContainer);
        this._buildPageContent(panelW, panelH, this._pages[0]);

        this._buildPageCorners(panelW, panelH);
        this._setupSwipeGesture();

        this._animateEntrance(cy);
    }

    _setupSewerBg(width, height) {
        const zone1 = getZoneByFloor(1);
        if (!zone1 || !this.textures.exists(zone1.bgKey)) {
            this._sewerBg = null;
            return;
        }
        this._sewerBg = coverBackground(this, zone1.bgKey);
        this._sewerBg.setDepth(2).setVisible(false);
        this._sewerOverlay = this.add.rectangle(
            Math.round(width / 2), Math.round(height / 2),
            width, height, 0x000000, 0.3
        ).setDepth(3).setVisible(false);
    }

    _buildCover(w, h) {
        const bg = themedPanel(this,
            Math.round(-w / 2), Math.round(-h / 2), w, h,
            LEDGER_THEME, { depth: 0, alpha: 0.95, fx: false, borderRadius: 0 }
        );
        this._coverContainer.add(bg);

        const title = this.add.text(0, Math.round(-h * 0.15),
            "The Delver's\nLedger",
            makeStyle(TEXT_STYLES.TITLE_SMALL, {
                fontSize: '18px', align: 'center', color: '#c4a35a'
            })
        ).setOrigin(0.5);
        this._coverContainer.add(title);

        const prompt = this.add.text(0, Math.round(h * 0.15),
            'Tap to Open',
            makeStyle(TEXT_STYLES.BODY_SMALL, { color: '#8a7a5a' })
        ).setOrigin(0.5);
        this._coverContainer.add(prompt);

        this.tweens.add({
            targets: prompt,
            alpha: { from: 1, to: 0.3 },
            duration: 1200,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.InOut'
        });
    }

    _buildPageCorners(w, h) {
        const cornerSize = 22;
        const halfW = Math.round(w / 2);
        const halfH = Math.round(h / 2);

        this._backCorner = this.add.container(-halfW, -halfH);
        const backGfx = this.add.graphics();
        backGfx.fillStyle(0xb8a878, 1);
        backGfx.fillTriangle(0, 0, cornerSize, 0, 0, cornerSize);
        backGfx.lineStyle(1, 0x5a4a32, 0.5);
        backGfx.lineBetween(cornerSize, 0, 0, cornerSize);
        this._backCorner.add(backGfx);
        this._backCorner.setSize(cornerSize, cornerSize);
        this._backCorner.setInteractive({ useHandCursor: true });
        this._backCorner.setAlpha(0.6);
        this._backCorner.on('pointerover', () => this._backCorner.setAlpha(1));
        this._backCorner.on('pointerout', () => this._backCorner.setAlpha(0.6));
        this._backCorner.on('pointerdown', () => this._navigateToPage(-1));
        this._backCorner.setVisible(false);
        this._bookContainer.add(this._backCorner);

        this._nextCorner = this.add.container(halfW - cornerSize, -halfH);
        const nextGfx = this.add.graphics();
        nextGfx.fillStyle(0xb8a878, 1);
        nextGfx.fillTriangle(0, 0, cornerSize, 0, cornerSize, cornerSize);
        nextGfx.lineStyle(1, 0x5a4a32, 0.5);
        nextGfx.lineBetween(0, 0, cornerSize, cornerSize);
        this._nextCorner.add(nextGfx);
        this._nextCorner.setSize(cornerSize, cornerSize);
        this._nextCorner.setInteractive({ useHandCursor: true });
        this._nextCorner.setAlpha(0.6);
        this._nextCorner.on('pointerover', () => this._nextCorner.setAlpha(1));
        this._nextCorner.on('pointerout', () => this._nextCorner.setAlpha(0.6));
        this._nextCorner.on('pointerdown', () => this._navigateToPage(1));
        this._nextCorner.setVisible(false);
        this._bookContainer.add(this._nextCorner);
    }

    _setupSwipeGesture() {
        this._swipeStartX = 0;
        this.input.on('pointerdown', (pointer) => {
            this._swipeStartX = pointer.x;
        });
        this.input.on('pointerup', (pointer) => {
            const dx = pointer.x - this._swipeStartX;
            const threshold = this.scale.width * 0.15;
            if (dx < -threshold) this._navigateToPage(1);
            else if (dx > threshold) this._navigateToPage(-1);
        });
    }

    _buildPageContent(w, h, page) {
        this._pageContainer.removeAll(true);

        const bg = themedPanel(this,
            Math.round(-w / 2), Math.round(-h / 2), w, h,
            PAGE_THEME, { depth: 0, alpha: 0.95, fx: false, borderRadius: 0 }
        );
        this._pageContainer.add(bg);

        if (page.comingSoon) {
            if (this._isPortrait) {
                this._buildComingSoonPortrait(w, h);
            } else {
                this._buildComingSoonLandscape(w, h);
            }
            return;
        }

        const fisher = ConfigLoader.getCharacter(page.fisherId);
        if (!fisher) return;

        if (this._isPortrait) {
            this._buildPortraitContent(fisher, w, h, page.selectable);
        } else {
            this._buildLandscapeContent(fisher, w, h, page.selectable);
        }
    }

    _buildComingSoonPortrait(w, h) {
        const silhouette = this.add.graphics();
        silhouette.fillStyle(0x333333, 0.3);
        silhouette.fillCircle(0, Math.round(-h * 0.1), 25);
        silhouette.fillRoundedRect(-20, Math.round(-h * 0.1) + 20, 40, 55, 5);
        this._pageContainer.add(silhouette);

        const title = this.add.text(0, Math.round(h * 0.1),
            'Coming Soon',
            makeStyle(TEXT_STYLES.TITLE_SMALL, {
                fontSize: '16px', color: '#c4a35a', align: 'center'
            })
        ).setOrigin(0.5).setAlpha(0.5);
        this._pageContainer.add(title);

        const subtitle = this.add.text(0, Math.round(h * 0.1) + 25,
            'A new delver awaits...',
            makeStyle(TEXT_STYLES.BODY_SMALL, {
                fontSize: '11px', color: '#8a7a5a', align: 'center'
            })
        ).setOrigin(0.5).setAlpha(0.5);
        this._pageContainer.add(subtitle);
    }

    _buildComingSoonLandscape(w, h) {
        const leftCx = Math.round(-w / 4);
        const rightCx = Math.round(w / 4);

        const divider = this.add.rectangle(0, 0, 1, Math.round(h * 0.8), 0x5a4a32)
            .setAlpha(0.6);
        this._pageContainer.add(divider);

        const silhouette = this.add.graphics();
        silhouette.fillStyle(0x333333, 0.3);
        silhouette.fillCircle(leftCx, Math.round(-h * 0.12), 25);
        silhouette.fillRoundedRect(leftCx - 20, Math.round(-h * 0.12) + 20, 40, 55, 5);
        this._pageContainer.add(silhouette);

        const title = this.add.text(rightCx, Math.round(-h * 0.1),
            'Coming Soon',
            makeStyle(TEXT_STYLES.TITLE_SMALL, {
                fontSize: '16px', color: '#c4a35a', align: 'center'
            })
        ).setOrigin(0.5).setAlpha(0.5);
        this._pageContainer.add(title);

        const subtitle = this.add.text(rightCx, Math.round(-h * 0.1) + 25,
            'A new delver awaits...',
            makeStyle(TEXT_STYLES.BODY_SMALL, {
                fontSize: '11px', color: '#8a7a5a', align: 'center'
            })
        ).setOrigin(0.5).setAlpha(0.5);
        this._pageContainer.add(subtitle);
    }

    _navigateToPage(direction) {
        if (this._transitioning || !this._bookOpen) return;
        const newPage = this._currentPage + direction;
        if (newPage < 0 || newPage >= this._pages.length) return;

        this._transitioning = true;
        const half = 250;

        this.tweens.add({
            targets: this._pageContainer,
            scaleX: 0,
            duration: half,
            ease: 'Sine.easeIn',
            onComplete: () => {
                this._currentPage = newPage;
                this._buildPageContent(this._bookW, this._bookH, this._pages[newPage]);
                this._updateCornerVisibility();

                this.tweens.add({
                    targets: this._pageContainer,
                    scaleX: 1,
                    duration: half,
                    ease: 'Sine.easeOut',
                    onComplete: () => {
                        this._transitioning = false;
                    }
                });
            }
        });
    }

    _updateCornerVisibility() {
        if (this._backCorner) {
            this._backCorner.setVisible(this._currentPage > 0);
        }
        if (this._nextCorner) {
            this._nextCorner.setVisible(this._currentPage < this._pages.length - 1);
        }
    }

    _buildPortraitContent(fisher, w, h, selectable) {
        const contentW = Math.round(w * 0.85);
        let y = Math.round(-h / 2) + 20;

        if (this.textures.exists(fisher.portrait)) {
            const portrait = this.add.image(0, y + 40, fisher.portrait)
                .setDisplaySize(80, 80);
            this._pageContainer.add(portrait);
            y += 90;
        }

        const name = this.add.text(0, y,
            fisher.name,
            makeStyle(TEXT_STYLES.FISH_NAME, { fontSize: '14px', color: '#c4a35a' })
        ).setOrigin(0.5);
        this._pageContainer.add(name);
        y += 20;

        if (fisher.lore) {
            const lore = this.add.text(0, y,
                fisher.lore,
                makeStyle(TEXT_STYLES.FLAVOR, {
                    fontSize: '11px', wordWrap: { width: contentW },
                    align: 'center', color: '#aaa088'
                })
            ).setOrigin(0.5, 0);
            this._pageContainer.add(lore);
            y += lore.displayHeight + 12;
        }

        if (fisher.mechanics) {
            const mech = this.add.text(0, y,
                fisher.mechanics,
                makeStyle(TEXT_STYLES.BODY_SMALL, {
                    fontSize: '10px', wordWrap: { width: contentW },
                    align: 'center', color: '#888878'
                })
            ).setOrigin(0.5, 0);
            this._pageContainer.add(mech);
        }

        if (selectable) {
            this._addSelectButton(0, Math.round(h / 2 - 22), fisher.id);
        }
    }

    _buildLandscapeContent(fisher, w, h, selectable) {
        const leftCx = Math.round(-w / 4);
        const rightCx = Math.round(w / 4);
        const rightContentW = Math.round(w * 0.4);

        const divider = this.add.rectangle(0, 0, 1, Math.round(h * 0.8), 0x5a4a32)
            .setAlpha(0.6);
        this._pageContainer.add(divider);

        if (this.textures.exists(fisher.portrait)) {
            const portrait = this.add.image(leftCx, Math.round(-h * 0.12), fisher.portrait)
                .setDisplaySize(80, 80);
            this._pageContainer.add(portrait);
        }

        const name = this.add.text(leftCx, Math.round(h * 0.22),
            fisher.name,
            makeStyle(TEXT_STYLES.FISH_NAME, { fontSize: '13px', color: '#c4a35a' })
        ).setOrigin(0.5);
        this._pageContainer.add(name);

        let ry = Math.round(-h / 2) + 16;

        if (fisher.lore) {
            const lore = this.add.text(rightCx, ry,
                fisher.lore,
                makeStyle(TEXT_STYLES.FLAVOR, {
                    fontSize: '11px', wordWrap: { width: rightContentW },
                    align: 'center', color: '#aaa088'
                })
            ).setOrigin(0.5, 0);
            this._pageContainer.add(lore);
            ry += lore.displayHeight + 10;
        }

        if (fisher.mechanics) {
            const mech = this.add.text(rightCx, ry,
                fisher.mechanics,
                makeStyle(TEXT_STYLES.BODY_SMALL, {
                    fontSize: '10px', wordWrap: { width: rightContentW },
                    align: 'center', color: '#888878'
                })
            ).setOrigin(0.5, 0);
            this._pageContainer.add(mech);
        }

        if (selectable) {
            this._addSelectButton(rightCx, Math.round(h / 2 - 20), fisher.id);
        }
    }

    _addSelectButton(x, y, fisherId) {
        const btn = this.add.text(x, y, '[ SELECT ]',
            makeStyle(TEXT_STYLES.BUTTON, { fontSize: '14px', color: '#c4a35a' })
        ).setOrigin(0.5).setInteractive({ useHandCursor: true });

        btn.on('pointerover', () => btn.setColor('#ffffff'));
        btn.on('pointerout', () => btn.setColor('#c4a35a'));
        btn.on('pointerdown', () => this._rapidFlipToStarters(fisherId));
        this._pageContainer.add(btn);
    }

    _animateEntrance(targetY) {
        const { height } = this.scale;
        this._bookContainer.y = height + this._bookH / 2;
        this._bookContainer.setAlpha(0);

        this.tweens.add({
            targets: this._bookContainer,
            y: targetY,
            duration: 600,
            ease: 'Back.easeOut',
            onComplete: () => {
                this.time.delayedCall(800, () => this._flipCoverOpen());
            }
        });

        this.tweens.add({
            targets: this._bookContainer,
            alpha: 1,
            duration: 300
        });
    }

    _flipCoverOpen() {
        this._flipPage(this._coverContainer, this._pageContainer, 'forward', 600, () => {
            this._bookOpen = true;
            this._updateCornerVisibility();
        });
    }

    _flipPage(fromContainer, toContainer, direction, duration, onComplete) {
        if (this._transitioning) return;
        this._transitioning = true;

        const half = Math.round(duration / 2);

        this.tweens.add({
            targets: fromContainer,
            scaleX: 0,
            duration: half,
            ease: 'Sine.easeIn',
            onComplete: () => {
                fromContainer.setVisible(false);
                toContainer.setVisible(true);
                toContainer.scaleX = 0;

                this.tweens.add({
                    targets: toContainer,
                    scaleX: 1,
                    duration: half,
                    ease: 'Sine.easeOut',
                    onComplete: () => {
                        this._transitioning = false;
                        if (onComplete) onComplete();
                    }
                });
            }
        });
    }

    _rapidFlipToStarters(fisherId) {
        if (this._transitioning) return;

        const w = this._bookW;
        const h = this._bookH;
        const durations = [400, 300, 200, 150];

        const blanks = [];
        for (let i = 0; i < durations.length - 1; i++) {
            const blank = this.add.container(0, 0);
            const rect = this.add.rectangle(0, 0, w - 12, h - 12, PAGE_THEME.panel.fill)
                .setAlpha(0.95);
            blank.add(rect);
            blank.setVisible(false);
            this._bookContainer.add(blank);
            blanks.push(blank);
        }

        const sequence = [this._pageContainer, ...blanks];
        let step = 0;

        const flipNext = () => {
            if (step >= durations.length - 1) {
                this._transitioning = true;
                this.tweens.add({
                    targets: sequence[step],
                    scaleX: 0,
                    duration: Math.round(durations[step] / 2),
                    ease: 'Sine.easeIn',
                    onComplete: () => {
                        this.scene.start('TitleScene', { selectedFisher: fisherId });
                    }
                });
                return;
            }

            this._flipPage(sequence[step], sequence[step + 1], 'forward', durations[step], () => {
                step++;
                flipNext();
            });
        };

        flipNext();
    }

    _closeBook(onComplete) {
        if (this._transitioning) return;
        this._transitioning = true;
        this._bookOpen = false;
        if (this._backCorner) this._backCorner.setVisible(false);
        if (this._nextCorner) this._nextCorner.setVisible(false);

        const half = 200;

        this.tweens.add({
            targets: this._pageContainer,
            scaleX: 0,
            duration: half,
            ease: 'Sine.easeIn',
            onComplete: () => {
                this._pageContainer.setVisible(false);
                this._coverContainer.setVisible(true);
                this._coverContainer.scaleX = 0;

                this.tweens.add({
                    targets: this._coverContainer,
                    scaleX: 1,
                    duration: half,
                    ease: 'Sine.easeOut',
                    onComplete: () => {
                        this.time.delayedCall(300, () => {
                            const { height } = this.scale;
                            this.tweens.add({
                                targets: this._bookContainer,
                                y: height + this._bookH / 2,
                                duration: 500,
                                ease: 'Cubic.easeIn',
                                onComplete: () => {
                                    this._transitioning = false;
                                    if (onComplete) onComplete();
                                }
                            });
                        });
                    }
                });
            }
        });
    }

    _sewerTransition() {
        if (this._sewerBg) {
            this._sewerBg.setVisible(true);
            if (this._sewerOverlay) this._sewerOverlay.setVisible(true);
        }

        this.cameras.main.zoomTo(2.5, 1200, 'Cubic.easeIn');

        this.time.delayedCall(600, () => {
            this.cameras.main.fadeOut(600, 0, 0, 0);
        });

        this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.start('TitleScene', { selectedFisher: 'andy' });
        });
    }
}
