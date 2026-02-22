import SaveSystem from '../systems/SaveSystem.js';
import PartySystem from '../systems/PartySystem.js';
import FISH_SPECIES from '../data/fish.js';
import { coverBackground } from '../utils/zones.js';
import SpriteAnimator from '../effects/SpriteAnimator.js';
import { TEXT_STYLES, makeStyle } from '../constants/textStyles.js';
import { themedPanel } from '../ui/ThemedPanel.js';
import { TITLE_THEME, getZoneByFloor } from '../data/themes.js';

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

        // Title background with slow Ken Burns zoom
        this.bg = coverBackground(this, 'bg_title', 'contain');
        this.bg.setDepth(0);
        this.tweens.add({
            targets: this.bg,
            scaleX: this.bg.scaleX * 1.08,
            scaleY: this.bg.scaleY * 1.08,
            duration: 18000,
            ease: 'Sine.InOut',
            yoyo: true,
            repeat: -1
        });

        // Dark overlay
        const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.4);
        overlay.setDepth(1);

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
        const titleText = this.add.text(width / 2, height * 0.13, 'DUNGEON\nDELVERS',
            makeStyle(TEXT_STYLES.TITLE_LARGE, { align: 'center', fontFamily: "'MedievalSharp', 'Georgia', serif", fontSize: '32px' })
        ).setOrigin(0.5).setAlpha(0).setScale(0.3).setDepth(0).setBlendMode('ADD');

        // Phase 1: Glow into existence behind the overlay (0-2s)
        this.tweens.add({
            targets: titleText,
            alpha: 0.6,
            scaleX: 0.7,
            scaleY: 0.7,
            duration: 2000,
            ease: 'Sine.InOut',
            onComplete: () => {
                // Phase 2: Break through to the foreground (2-3.5s)
                titleText.setDepth(10);
                titleText.setBlendMode(Phaser.BlendModes.NORMAL);

                this.tweens.add({
                    targets: titleText,
                    alpha: 1,
                    scaleX: 1,
                    scaleY: 1,
                    duration: 1500,
                    ease: 'Sine.Out',
                    onComplete: () => {
                        // Gold shimmer sweep
                        this.tweens.addCounter({
                            from: 0,
                            to: Math.PI * 2,
                            duration: 3500,
                            repeat: -1,
                            onUpdate: (tween) => {
                                const p = tween.getValue();
                                const l1 = 0.5 + 0.5 * Math.sin(p);
                                const l2 = 0.5 + 0.5 * Math.sin(p - 1.5);
                                const c1 = Phaser.Display.Color.GetColor(200 + l1 * 55, 170 + l1 * 50, 30 + l1 * 40);
                                const c2 = Phaser.Display.Color.GetColor(200 + l2 * 55, 170 + l2 * 50, 30 + l2 * 40);
                                titleText.setTint(c1, c2, c1, c2);
                            }
                        });

                        // Rising dungeon energy particles
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
                        }).setDepth(9);

                        // Subtle breathing pulse
                        this.tweens.add({
                            targets: titleText,
                            scaleX: { from: 1.0, to: 1.02 },
                            scaleY: { from: 1.0, to: 1.02 },
                            duration: 2000,
                            yoyo: true,
                            repeat: -1,
                            ease: 'Sine.InOut'
                        });

                    }
                });
            }
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
        const masterPad = 20;
        const masterW = 180;
        const masterH = (lastBtnY - firstBtnY) + 36 + masterPad * 2;
        const masterX = width / 2 - masterW / 2;
        const masterY = firstBtnY - 18 - masterPad;
        const masterPanel = themedPanel(this, masterX, masterY, masterW, masterH, TITLE_THEME, { depth: 5 });
        masterPanel.setAlpha(0);
        this.tweens.add({
            targets: masterPanel,
            alpha: 0.6,
            duration: 800,
            delay: 3200,
            ease: 'Sine.InOut'
        });

        // Animated title buttons
        this._createTitleButton(width / 2, height * 0.36, 'NEW GAME',
            () => this.scene.start('CharacterSelectScene'), 3500, '16px', TITLE_THEME);

        if (SaveSystem.hasSave()) {
            this._createTitleButton(width / 2, height * 0.43, 'CONTINUE',
                () => this.continueGame(), 3700, '16px', continueTheme);
        }

        this._createTitleButton(width / 2, height * 0.50, 'ZONES',
            () => this.scene.start('ZonePreviewScene'), 3900, '14px', TITLE_THEME);

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

    _createTitleButton(x, y, label, callback, delay, fontSize = '16px', theme = TITLE_THEME) {
        const text = this.add.text(x, y + 15, label,
            makeStyle(TEXT_STYLES.BUTTON, { fontSize })
        ).setOrigin(0.5).setAlpha(0).setDepth(10);

        // Themed panel behind text
        const padX = 22, padY = 8;
        const pw = text.width + padX * 2;
        const ph = text.height + padY * 2;
        const panel = themedPanel(this, x - pw / 2, y + 15 - ph / 2, pw, ph, theme, { depth: 9 });
        panel.setAlpha(0);

        // Extend hit area to cover full panel
        text.setInteractive(
            new Phaser.Geom.Rectangle(text.width / 2 - pw / 2, text.height / 2 - ph / 2, pw, ph),
            Phaser.Geom.Rectangle.Contains
        );
        text.input.cursor = 'pointer';

        // Hover effects
        let hoverTween = null;
        text.on('pointerover', () => {
            text.setColor('#ffffff');
            if (hoverTween) hoverTween.stop();
            hoverTween = this.tweens.add({
                targets: text,
                scaleX: 1.08,
                scaleY: 1.08,
                duration: 150,
                ease: 'Back.Out'
            });
            panel.setAlpha(1);
        });
        text.on('pointerout', () => {
            text.setColor('#aaaacc');
            if (hoverTween) hoverTween.stop();
            hoverTween = this.tweens.add({
                targets: text,
                scaleX: 1,
                scaleY: 1,
                duration: 150
            });
            panel.setAlpha(0.7);
        });
        text.on('pointerdown', () => this._transitionTo(callback));

        // Entrance: slide up + fade in
        this.tweens.add({
            targets: [text, panel],
            y: '-=15',
            alpha: { from: 0, to: 0.7 },
            duration: 600,
            delay: delay,
            ease: 'Back.Out',
            onComplete: () => {
                text.setAlpha(1);
                // Idle: subtle panel breathing
                this.tweens.add({
                    targets: panel,
                    alpha: { from: 0.6, to: 0.8 },
                    duration: 2500,
                    yoyo: true,
                    repeat: -1,
                    ease: 'Sine.InOut'
                });
            }
        });

        return { text, panel };
    }

    _transitionTo(callback) {
        this.tweens.killAll();
        if (this.mistEmitter) { this.mistEmitter.destroy(); this.mistEmitter = null; }
        if (this.crystalEmitter) { this.crystalEmitter.destroy(); this.crystalEmitter = null; }
        if (this.dripEmitter) { this.dripEmitter.destroy(); this.dripEmitter = null; }
        callback();
    }

    showStarterSelection() {
        // Clear scene
        this.children.removeAll();

        const { width, height } = this.scale;

        // Title background with dark overlay for readability
        coverBackground(this, 'bg_title', 'contain');
        this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.6);

        this.add.text(width / 2, 20, 'Choose your starter fish:',
            makeStyle(TEXT_STYLES.TITLE_SMALL, { color: '#ccccee' })
        ).setOrigin(0.5);

        const isPortrait = this.registry.get('isPortrait');
        const starters = FISH_SPECIES.filter(s => s.isStarter);

        if (isPortrait) {
            starters.forEach((species, i) => {
                const y = height * 0.2 + i * (height * 0.22);

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

                const btn = this.add.text(width - 40, y, '[ SELECT ]',
                    makeStyle(TEXT_STYLES.BUTTON, { fontSize: '12px' })
                ).setOrigin(0.5).setInteractive({ useHandCursor: true });
                btn.on('pointerover', () => btn.setColor('#ffffff'));
                btn.on('pointerout', () => btn.setColor('#aaaacc'));
                btn.on('pointerdown', () => this.startNewGame(species.id));
            });
        } else {
            const startX = width / 2 - (starters.length - 1) * 60;

            starters.forEach((species, i) => {
                const x = startX + i * 120;
                const y = height * 0.45;

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

                const btn = this.add.text(x, y + 45, '[ SELECT ]',
                    makeStyle(TEXT_STYLES.BUTTON, { fontSize: '12px' })
                ).setOrigin(0.5).setInteractive({ useHandCursor: true });
                btn.on('pointerover', () => btn.setColor('#ffffff'));
                btn.on('pointerout', () => btn.setColor('#aaaacc'));
                btn.on('pointerdown', () => this.startNewGame(species.id));
            });
        }
    }

    startNewGame(starterSpeciesId) {
        SaveSystem.deleteSave();
        const starterFish = PartySystem.createFish(starterSpeciesId);

        const gameState = {
            floor: 1,
            gold: 0,
            party: [starterFish],
            inventory: [],
            campFloor: 1,
            nextShopFloor: 1,
            fisherId: this._selectedFisher || 'andy'
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
            nextShopFloor: saveData.nextShopFloor || saveData.floor,
            fisherId: saveData.fisherId || 'andy'
        };

        this.registry.set('gameState', gameState);
        this.scene.start('FloorScene', { gameState });
    }
}
