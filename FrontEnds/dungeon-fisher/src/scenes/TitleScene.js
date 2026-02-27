import SaveSystem from '../systems/SaveSystem.js';
import PartySystem from '../systems/PartySystem.js';
import ConfigLoader from '../systems/ConfigLoader.js';
import EquipmentSystem from '../systems/EquipmentSystem.js';
import SpriteAnimator from '../effects/SpriteAnimator.js';
import { TEXT_STYLES, makeStyle } from '../constants/textStyles.js';
import { TITLE_THEME, getZoneByFloor, getCharacterTheme, accentHex } from '../data/themes.js';
import { UIPanel, UIButton, UILayout } from '../ui/index.js';

export default class TitleScene extends Phaser.Scene {
    constructor() {
        super('TitleScene');
    }

    create(data) {
        if (data && data.selectedFisher) {
            this._selectedFisher = data.selectedFisher;
            this.showStarterSelection();
            return;
        }

        const { width, height } = this.scale;

        this._createParticleTextures();

        // Solid backdrop to prevent transparency bleed-through
        this.add.rectangle(width / 2, height / 2, width * 2, height * 2, 0x000000).setDepth(-1);

        // Title background with slow Ken Burns zoom
        const { bg } = UILayout.sceneBackground(this, 'bg_title');
        this.bg = bg;
        this.bg.setDepth(0);
        this.tweens.add({
            targets: this.bg,
            scaleX: this.bg.scaleX * 1.12,
            scaleY: this.bg.scaleY * 1.12,
            x: this.bg.x + 5,
            y: this.bg.y - 3,
            duration: 22000,
            ease: 'Sine.InOut',
            yoyo: true,
            repeat: -1
        });

        // Capture bg base values before Ken Burns modifies them
        const bgBase = { sx: this.bg.scaleX, sy: this.bg.scaleY, x: this.bg.x, y: this.bg.y };

        // Dark overlay
        this.darkOverlay = UILayout.overlay(this, { alpha: 0.4 });

        // Rising mist particles from the abyss (bottom third)
        this.mistEmitter = this.add.particles(0, 0, 'particle_soft', {
            x: { min: 0, max: width },
            y: { min: height * 0.7, max: height },
            lifespan: 4000,
            speedY: { min: -15, max: -8 },
            speedX: { min: -5, max: 5 },
            scale: { start: 0.4, end: 0.1 },
            alpha: { start: 0.4, end: 0 },
            tint: [0xaaddff, 0xccddff, 0xeeeeff],
            frequency: 200,
            quantity: 1,
            blendMode: 'ADD'
        });
        this.mistEmitter.setDepth(2);

        // Twinkling stars in the sky area
        for (let i = 0; i < 18; i++) {
            const star = this.add.image(
                Phaser.Math.Between(width * 0.05, width * 0.95),
                Phaser.Math.Between(height * 0.02, height * 0.30),
                'particle_dot'
            ).setAlpha(Phaser.Math.FloatBetween(0.1, 0.8))
             .setScale(Phaser.Math.FloatBetween(0.3, 0.6))
             .setTint(Phaser.Utils.Array.GetRandom([0xffffff, 0xccddff, 0xaabbee]))
             .setDepth(2);

            this.tweens.add({
                targets: star,
                alpha: { from: 0.1, to: Phaser.Math.FloatBetween(0.7, 1.0) },
                scale: { from: star.scale * 0.5, to: star.scale * 1.3 },
                duration: Phaser.Math.Between(600, 3000),
                yoyo: true,
                repeat: -1,
                delay: Phaser.Math.Between(0, 3000),
                ease: 'Sine.InOut'
            });
        }

        // Floating crystal embers in mid-section (abyss walls)
        this.crystalEmitter = this.add.particles(0, 0, 'particle_dot', {
            x: { min: 0, max: width },
            y: { min: height * 0.4, max: height * 0.7 },
            lifespan: 5000,
            speedY: { min: -8, max: -3 },
            speedX: { min: -3, max: 3 },
            scale: { start: 0.5, end: 0.1 },
            alpha: { start: 0.6, end: 0 },
            tint: [0x40ffcc, 0x60ddff, 0x80aaff],
            frequency: 500,
            quantity: 1,
            blendMode: 'ADD'
        });
        this.crystalEmitter.setDepth(2);

        // Title text — emerges from the stars
        const titleText = this.add.text(width / 2, height * 0.13, 'FATHOM\nFALL',
            makeStyle(TEXT_STYLES.TITLE_LARGE, { align: 'center', fontFamily: "'MedievalSharp', 'Georgia', serif", fontSize: '32px' })
        ).setOrigin(0.5).setAlpha(0).setScale(0.3).setDepth(10);
        this._titleText = titleText;

        // Title text emerges — smooth fade and scale up
        this.tweens.add({
            targets: titleText,
            alpha: 1,
            scaleX: 1,
            scaleY: 1,
            duration: 3500,
            ease: 'Sine.InOut',
            onComplete: () => this._initTitleEffects()
        });

        // Determine Continue button theme from save data
        let continueTheme = TITLE_THEME;
        if (SaveSystem.hasSave()) {
            const saveData = SaveSystem.load();
            if (saveData) {
                continueTheme = getZoneByFloor(saveData.floor);
            }
        }

        // Master container wrapping all title buttons
        const firstBtnY = height * 0.36;
        const lastBtnY = height * 0.50;
        const masterPad = 24;
        const masterW = width * 0.65;
        const masterH = (lastBtnY - firstBtnY) + 36 + masterPad * 2;
        const masterX = width / 2 - masterW / 2;
        const masterY = firstBtnY - 18 - masterPad;
        const masterPanel = new UIPanel(this, {
            x: masterX, y: masterY, width: masterW, height: masterH,
            theme: TITLE_THEME, depth: 5, fx: false, borderRadius: 10
        });
        // Container for unified shine across panel + buttons
        const titleContainer = this.add.container(0, 0);
        this.titleContainer = titleContainer;
        titleContainer.setDepth(10);
        titleContainer.add(masterPanel.bg);

        this._masterPanelBg = masterPanel.bg;
        this._masterBounds = { x: masterX, y: masterY, w: masterW, h: masterH };

        masterPanel.bg.setAlpha(0);
        this.tweens.add({
            targets: masterPanel.bg,
            alpha: 0.9,
            duration: 800,
            delay: 3200,
            ease: 'Sine.InOut',
            onComplete: () => this._initPanelEffects()
        });

        // Animated title buttons
        this._buttons = [];
        this._buttons.push(this._createTitleButton(width / 2, height * 0.36, 'NEW GAME',
            () => this.scene.start('DelversLedgerScene'), 3500, '16px', TITLE_THEME, null, 20, 10, 8, titleContainer));

        if (SaveSystem.hasSave()) {
            const saveData = SaveSystem.load();
            const charTheme = getCharacterTheme(saveData?.fisherId || 'andy');
            this._buttons.push(this._createTitleButton(width / 2, height * 0.43, 'CONTINUE',
                () => this.continueGame(), 3700, '16px', continueTheme, accentHex(charTheme), 20, 10, 8, titleContainer));
        }

        this._buttons.push(this._createTitleButton(width / 2, height * 0.50, 'OPTIONS',
            () => {}, 3900, '14px', TITLE_THEME, null, 20, 10, 8, titleContainer));

        // Click/tap to skip intro animations
        this._introSkipped = false;
        this.input.on('pointerdown', () => {
            if (this._introSkipped) return;
            this._introSkipped = true;
            this._skipIntro(bgBase);
        });
        this.time.delayedCall(4500, () => { this._introSkipped = true; });
    }

    _createParticleTextures() {
        if (!this.textures.exists('particle_soft')) {
            const gfx = this.make.graphics({ add: false });
            gfx.fillStyle(0xffffff, 0.6);
            gfx.fillCircle(6, 6, 6);
            gfx.fillStyle(0xffffff, 0.3);
            gfx.fillCircle(6, 6, 3);
            gfx.generateTexture('particle_soft', 12, 12);
            gfx.destroy();
        }
        if (!this.textures.exists('particle_dot')) {
            const gfx = this.make.graphics({ add: false });
            gfx.fillStyle(0xffffff, 1);
            gfx.fillCircle(2, 2, 2);
            gfx.generateTexture('particle_dot', 4, 4);
            gfx.destroy();
        }
    }

    _createTitleButton(x, y, label, callback, delay, fontSize = '16px', theme = TITLE_THEME, textColor = null, padX = 10, padY = 4, cornerSize = undefined, container = null) {
        const btnColor = textColor || '#aaaacc';
        const btnTheme = { ...theme };
        delete btnTheme.compositeKey;
        delete btnTheme.pieceSize;
        if (btnTheme.id === 'title') {
            btnTheme.atlasKey = 'atlas_title_sm';
        }
        const btn = UIButton.create(this, {
            x, y,
            label,
            style: makeStyle(TEXT_STYLES.BUTTON, { fontSize, color: btnColor }),
            color: btnColor,
            theme: btnTheme,
            depth: 9,
            padX,
            padY,
            cornerSize,
            hoverColor: '#ffffff',
            hoverScale: 1.08,
            onClick: () => this._transitionTo(callback)
        });

        btn.text.setAlpha(0);
        if (btn.panel) btn.panel.setAlpha(0);

        this.tweens.add({
            targets: [btn.text, btn.panel].filter(Boolean),
            alpha: { from: 0, to: 1 },
            duration: 500,
            delay,
            ease: 'Sine.InOut',
            onComplete: () => {
                if (btn.panel) btn.panel.setAlpha(0.85);
            }
        });

        if (container) {
            if (btn.panel) container.add(btn.panel);
            container.add(btn.text);
        }

        return btn;
    }

    _initTitleEffects() {
        if (this._titleEffectsReady) return;
        this._titleEffectsReady = true;

        const titleText = this._titleText;
        const titleContainer = this.titleContainer;

        this.tweens.addCounter({
            from: 0,
            to: Math.PI * 2,
            duration: 2500,
            repeat: -1,
            onUpdate: (tween) => {
                const p = tween.getValue();
                const l1 = 0.5 + 0.5 * Math.sin(p);
                const l2 = 0.5 + 0.5 * Math.sin(p - 1.5);
                const c1 = Phaser.Display.Color.GetColor(100 + l1 * 155, 110 + l1 * 145, 140 + l1 * 115);
                const c2 = Phaser.Display.Color.GetColor(100 + l2 * 155, 110 + l2 * 145, 140 + l2 * 115);
                titleText.setTint(c1, c2, c1, c2);
            }
        });

        const bounds = titleText.getBounds();
        this.add.particles(0, 0, 'particle_dot', {
            x: { min: bounds.left, max: bounds.right },
            y: bounds.bottom + 5,
            lifespan: 2500,
            speedY: { min: -30, max: -12 },
            speedX: { min: -3, max: 3 },
            scale: { start: 0.6, end: 0.1 },
            alpha: { start: 0.7, end: 0 },
            tint: [0x88cc44, 0xff8833, 0xaa88cc, 0x44dddd, 0xcc44ff, 0x66aaff, 0xff3344],
            frequency: 120,
            quantity: 1,
            blendMode: 'ADD'
        }).setDepth(11);

        const titleGlow = titleText.preFX.addGlow(0xaabbff, 0, 0, false, 0.05, 6);
        this.tweens.add({
            targets: titleText,
            scaleX: 1.02,
            scaleY: 1.02,
            duration: 2000,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.InOut'
        });
        this.tweens.add({
            targets: titleGlow,
            outerStrength: 1,
            duration: 2000,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.InOut'
        });

        titleContainer.add(titleText);
        titleText.setDepth(20);
    }

    _initPanelEffects() {
        if (this._panelEffectsReady) return;
        this._panelEffectsReady = true;

        const titleContainer = this.titleContainer;
        const { x: mx, y: my, w: mw, h: mh } = this._masterBounds;

        if (titleContainer.postFX) {
            titleContainer.postFX.addShine(0.7, 0.5, 5);
        }

        const corners = [
            { x: mx + 16, y: my + 16 },
            { x: mx + mw - 16, y: my + 16 },
            { x: mx + 16, y: my + mh - 16 },
            { x: mx + mw - 16, y: my + mh - 16 }
        ];
        corners.forEach(corner => {
            this.add.particles(corner.x, corner.y, 'particle_dot', {
                lifespan: 800,
                speed: { min: 2, max: 8 },
                scale: { start: 0.5, end: 0 },
                alpha: { start: 1, end: 0 },
                tint: [0xffd700, 0xffee88, 0xffffff],
                frequency: 1500,
                quantity: 1,
                blendMode: 'ADD'
            }).setDepth(11);
        });
    }

    _skipIntro(bgBase) {
        this.tweens.killAll();

        // Title text — final state
        this._titleText.setAlpha(1).setScale(1);
        this._initTitleEffects();

        // Panel — final state
        this._masterPanelBg.setAlpha(0.9);
        this._initPanelEffects();

        // Buttons — final state
        this._buttons.forEach(btn => {
            btn.text.setAlpha(1);
            if (btn.panel) btn.panel.setAlpha(0.85);
        });

        // Restart Ken Burns
        this.bg.setScale(bgBase.sx, bgBase.sy);
        this.bg.setPosition(bgBase.x, bgBase.y);
        this.tweens.add({
            targets: this.bg,
            scaleX: bgBase.sx * 1.12,
            scaleY: bgBase.sy * 1.12,
            x: bgBase.x + 5,
            y: bgBase.y - 3,
            duration: 22000,
            ease: 'Sine.InOut',
            yoyo: true,
            repeat: -1
        });
    }

    _transitionTo(callback) {
        this.tweens.killAll();
        if (this.mistEmitter) { this.mistEmitter.destroy(); this.mistEmitter = null; }
        if (this.crystalEmitter) { this.crystalEmitter.destroy(); this.crystalEmitter = null; }

        const bg = this.bg;
        const baseScaleX = bg.scaleX;
        const baseScaleY = bg.scaleY;
        const baseY = bg.y;

        // Fade out UI
        this.tweens.add({
            targets: this.titleContainer,
            alpha: 0,
            duration: 400,
            ease: 'Sine.InOut'
        });

        // Continuous zoom — single tween, no stutter
        this.tweens.add({
            targets: bg,
            scaleX: baseScaleX * 3.5,
            scaleY: baseScaleY * 3.5,
            duration: 2500,
            ease: 'Cubic.In'
        });

        // POV arc — lifted up, then thrown down into the pit
        this.tweens.add({
            targets: bg,
            y: baseY + 35,
            duration: 900,
            ease: 'Sine.InOut',
            onComplete: () => {
                // Plunge into the pit
                this.tweens.add({
                    targets: bg,
                    y: baseY - 100,
                    duration: 900,
                    ease: 'Cubic.In'
                });
                // Tunnel vision — darkness closes in from edges
                const { width, height } = this.scale;
                const texKey = '__tunnel_vignette';
                if (this.textures.exists(texKey)) this.textures.remove(texKey);
                const canvasTex = this.textures.createCanvas(texKey, width, height);
                const ctx = canvasTex.getContext();
                this.add.image(width / 2, height / 2, texKey)
                    .setDepth(100).setScrollFactor(0);
                const maxR = Math.max(width, height) * 0.8;
                const tunnel = { r: maxR };
                this.tweens.add({
                    targets: tunnel,
                    r: 0,
                    duration: 800,
                    ease: 'Cubic.In',
                    onUpdate: () => {
                        ctx.clearRect(0, 0, width, height);
                        ctx.globalCompositeOperation = 'source-over';
                        ctx.fillStyle = '#000000';
                        ctx.fillRect(0, 0, width, height);
                        if (tunnel.r > 0) {
                            ctx.globalCompositeOperation = 'destination-out';
                            const grad = ctx.createRadialGradient(
                                width / 2, height / 2, 0,
                                width / 2, height / 2, tunnel.r
                            );
                            grad.addColorStop(0, 'rgba(0,0,0,1)');
                            grad.addColorStop(0.5, 'rgba(0,0,0,1)');
                            grad.addColorStop(1, 'rgba(0,0,0,0)');
                            ctx.fillStyle = grad;
                            ctx.fillRect(0, 0, width, height);
                        }
                        canvasTex.refresh();
                    },
                    onComplete: () => {
                        ctx.globalCompositeOperation = 'source-over';
                        ctx.fillStyle = '#000000';
                        ctx.fillRect(0, 0, width, height);
                        canvasTex.refresh();
                        this.time.delayedCall(400, () => callback());
                    }
                });
            }
        });
    }

    showStarterSelection() {
        this.children.removeAll();
        this._selectedStarters = [];

        const { width, height } = this.scale;
        const fisherId = this._selectedFisher || 'andy';
        const character = ConfigLoader.getCharacter(fisherId);
        const maxPicks = character ? character.partySlots.fish : 2;

        UILayout.sceneBackground(this, 'bg_title');
        UILayout.overlay(this, { alpha: 0.6, depth: 0 });

        this.add.text(width / 2, 20, `Pick ${maxPicks} starter fish:`,
            makeStyle(TEXT_STYLES.TITLE_SMALL, { color: '#ccccee' })
        ).setOrigin(0.5);

        const starters = Object.values(ConfigLoader.getAllFish()).filter(s => s.isStarter);
        this._starterButtons = [];
        this._starterChecks = [];

        const isPortrait = this.registry.get('isPortrait');

        if (isPortrait) {
            starters.forEach((species, i) => {
                const y = height * 0.17 + i * (height * 0.18);

                const fishImg = this.add.image(45, y, `fish_${species.id}`).setScale(0.5);
                new SpriteAnimator(this, fishImg).idle();

                this.add.text(85, y - 16, species.name,
                    makeStyle(TEXT_STYLES.FISH_NAME, { color: '#ffffff' })
                );
                this.add.text(85, y - 4, `HP:${species.baseHp} ATK:${species.baseAtk} DEF:${species.baseDef}`,
                    makeStyle(TEXT_STYLES.BODY_SMALL, { fontSize: '10px' })
                );
                this.add.text(85, y + 6, `SPD:${species.baseSpd}`,
                    makeStyle(TEXT_STYLES.BODY_SMALL, { fontSize: '10px' })
                );

                const check = this.add.text(width - 70, y, '', makeStyle(TEXT_STYLES.BODY, { fontSize: '14px', color: '#44ff44' }));
                this._starterChecks.push(check);

                const btn = UIButton.create(this, {
                    x: width - 40, y,
                    label: '[ SELECT ]',
                    style: makeStyle(TEXT_STYLES.BUTTON, { fontSize: '12px' }),
                    hoverColor: '#ffffff',
                    onClick: () => this._toggleStarter(species.id, i, maxPicks)
                });
                this._starterButtons.push(btn);
            });
        } else {
            const startX = width / 2 - (starters.length - 1) * 60;

            starters.forEach((species, i) => {
                const x = startX + i * 120;
                const y = height * 0.38;

                const fishImg = this.add.image(x, y - 20, `fish_${species.id}`).setScale(0.5);
                new SpriteAnimator(this, fishImg).idle();

                this.add.text(x, y + 5, species.name,
                    makeStyle(TEXT_STYLES.FISH_NAME, { color: '#ffffff' })
                ).setOrigin(0.5);

                this.add.text(x, y + 18, `HP:${species.baseHp} ATK:${species.baseAtk} DEF:${species.baseDef} SPD:${species.baseSpd}`,
                    makeStyle(TEXT_STYLES.BODY_SMALL, { fontSize: '10px' })
                ).setOrigin(0.5);

                this.add.text(x, y + 28, species.description,
                    makeStyle(TEXT_STYLES.FLAVOR, { fontSize: '10px', wordWrap: { width: 110 }, align: 'center' })
                ).setOrigin(0.5);

                const check = this.add.text(x, y + 42, '', makeStyle(TEXT_STYLES.BODY, { fontSize: '14px', color: '#44ff44' })).setOrigin(0.5);
                this._starterChecks.push(check);

                const btn = UIButton.create(this, {
                    x, y: y + 55,
                    label: '[ SELECT ]',
                    style: makeStyle(TEXT_STYLES.BUTTON, { fontSize: '12px' }),
                    hoverColor: '#ffffff',
                    onClick: () => this._toggleStarter(species.id, i, maxPicks)
                });
                this._starterButtons.push(btn);
            });
        }

        // Show companion preview
        const compY = isPortrait ? height * 0.17 + starters.length * (height * 0.18) + 10 : height * 0.78;
        if (character && character.companion) {
            const comp = character.companion;
            this.add.text(width / 2, compY, `Companion: ${comp.name}`,
                makeStyle(TEXT_STYLES.FISH_NAME, { fontSize: '12px', color: '#a1887f' })
            ).setOrigin(0.5);
            this.add.text(width / 2, compY + 14, `HP:${comp.baseHp} ATK:${comp.baseAtk} DEF:${comp.baseDef} SPD:${comp.baseSpd}`,
                makeStyle(TEXT_STYLES.BODY_SMALL, { fontSize: '10px' })
            ).setOrigin(0.5);
        }

        // GO button (hidden until enough picks)
        const goY = compY + 35;
        this._goBtn = UIButton.create(this, {
            x: width / 2, y: goY,
            label: '[ BEGIN ]',
            style: makeStyle(TEXT_STYLES.BUTTON, { fontSize: '15px' }),
            hoverColor: '#ffffff',
            onClick: () => this.startNewGame(this._selectedStarters)
        });
        this._goBtn.text.setAlpha(0.3);
        if (this._goBtn.panel) this._goBtn.panel.setAlpha(0.3);
        this._goBtnEnabled = false;
    }

    _toggleStarter(speciesId, index, maxPicks) {
        const idx = this._selectedStarters.indexOf(speciesId);
        if (idx >= 0) {
            this._selectedStarters.splice(idx, 1);
            this._starterChecks[index].setText('');
        } else {
            if (this._selectedStarters.length >= maxPicks) return;
            this._selectedStarters.push(speciesId);
            this._starterChecks[index].setText('\u2713');
        }

        const ready = this._selectedStarters.length === maxPicks;
        const alpha = ready ? 1 : 0.3;
        this._goBtn.text.setAlpha(alpha);
        if (this._goBtn.panel) this._goBtn.panel.setAlpha(alpha);
        this._goBtnEnabled = ready;
    }

    startNewGame(starterSpeciesIds) {
        SaveSystem.deleteSave();
        const fisherId = this._selectedFisher || 'andy';
        const character = ConfigLoader.getCharacter(fisherId);

        const ids = Array.isArray(starterSpeciesIds) ? starterSpeciesIds : [starterSpeciesIds];
        const party = ids.map(id => PartySystem.createFish(id));
        const dog = PartySystem.createCompanion(fisherId);
        if (dog) party.push(dog);

        const gameState = {
            floor: 1,
            gold: character ? character.startingGold : 0,
            party,
            inventory: [],
            campFloor: 1,
            fisherId,
            roster: [],
            companion: dog,
            pveDeathCount: 0,
            pvpLossCount: 0,
            equipment: {
                grid: [{ itemId: 'harmony', col: 1, row: 4, rotation: 0, flipped: false }],
                stash: [],
                harmonyPosition: { row: 4, col: 1 }
            },
            equipmentDelta: null,
            equipmentSnapshot: null
        };

        SaveSystem.save(gameState);
        this.registry.set('gameState', gameState);
        this.scene.start('FloorScene', { gameState });
    }

    continueGame() {
        const saveData = SaveSystem.load();
        if (!saveData) return;

        const gameState = {
            floor: saveData.floor,
            gold: saveData.gold,
            party: saveData.party,
            inventory: saveData.inventory,
            campFloor: saveData.campFloor,
            fisherId: saveData.fisherId || 'andy',
            roster: saveData.roster || [],
            companion: saveData.companion || null,
            pveDeathCount: saveData.pveDeathCount || 0,
            pvpLossCount: saveData.pvpLossCount || 0,
            equipment: saveData.equipment || {
                grid: [{ itemId: 'harmony', col: 1, row: 4, rotation: 0, flipped: false }],
                stash: [],
                harmonyPosition: { row: 4, col: 1 }
            },
            equipmentDelta: saveData.equipmentDelta || null,
            equipmentSnapshot: null
        };

        // Interrupted battle recovery: revert equipment bonuses if browser was closed mid-battle
        if (gameState.equipmentDelta) {
            EquipmentSystem.revertBonuses(gameState.party, gameState.equipmentDelta);
            gameState.equipmentDelta = null;
        }

        this.registry.set('gameState', gameState);
        this.scene.start('FloorScene', { gameState });
    }
}
