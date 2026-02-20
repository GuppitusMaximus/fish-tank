import SaveSystem from '../systems/SaveSystem.js';
import PartySystem from '../systems/PartySystem.js';
import FISH_SPECIES from '../data/fish.js';
import { VERSION } from '../version.js';
import { coverBackground } from '../utils/zones.js';
import { TEXT_STYLES, makeStyle } from '../constants/textStyles.js';

export default class TitleScene extends Phaser.Scene {
    constructor() {
        super('TitleScene');
    }

    create() {
        const { width, height } = this.scale;

        this._createParticleTextures();

        // Title background with slow Ken Burns zoom
        this.bg = coverBackground(this, 'bg_title');
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
        for (let i = 0; i < 10; i++) {
            const star = this.add.image(
                Phaser.Math.Between(width * 0.1, width * 0.9),
                Phaser.Math.Between(height * 0.02, height * 0.25),
                'particle_dot'
            ).setAlpha(Phaser.Math.FloatBetween(0.2, 1.0)).setScale(0.5).setDepth(2);

            this.tweens.add({
                targets: star,
                alpha: { from: 0.2, to: 1.0 },
                duration: Phaser.Math.Between(1000, 3000),
                yoyo: true,
                repeat: -1,
                delay: Phaser.Math.Between(0, 2000)
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
        const titleText = this.add.text(width / 2, height * 0.22, 'DUNGEON\nFISHER',
            makeStyle(TEXT_STYLES.TITLE_LARGE, { align: 'center' })
        ).setOrigin(0.5).setAlpha(0).setScale(2.0).setDepth(0).setBlendMode('ADD');

        // Phase 1: Glow into existence behind the overlay (0-2s)
        this.tweens.add({
            targets: titleText,
            alpha: 0.6,
            scaleX: 1.5,
            scaleY: 1.5,
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
                        // Gentle glow pulse
                        this.tweens.add({
                            targets: titleText,
                            alpha: { from: 0.85, to: 1.0 },
                            duration: 1500,
                            yoyo: true,
                            repeat: -1
                        });

                        // Water dripping from the letters
                        const bounds = titleText.getBounds();
                        this.dripEmitter = this.add.particles(0, 0, 'particle_dot', {
                            x: { min: bounds.left + 5, max: bounds.right - 5 },
                            y: bounds.bottom,
                            lifespan: 2000,
                            speedY: { min: 20, max: 50 },
                            speedX: { min: -2, max: 2 },
                            scale: { start: 0.6, end: 0.2 },
                            alpha: { start: 0.7, end: 0 },
                            tint: [0x44aaff, 0x66ccff, 0x88ddff],
                            frequency: 150,
                            quantity: 1,
                            gravityY: 40,
                            blendMode: 'ADD'
                        });
                        this.dripEmitter.setDepth(10);
                    }
                });
            }
        });

        // Buttons fade in after a short delay
        const newBtn = this.add.text(width / 2, height * 0.36, '[ NEW GAME ]',
            makeStyle(TEXT_STYLES.BUTTON, { fontSize: '16px' })
        ).setOrigin(0.5).setInteractive({ useHandCursor: true }).setAlpha(0).setDepth(10);

        newBtn.on('pointerover', () => newBtn.setColor('#ffffff'));
        newBtn.on('pointerout', () => newBtn.setColor('#aaaacc'));
        newBtn.on('pointerdown', () => this._transitionTo(() => this.showStarterSelection()));

        this.tweens.add({
            targets: newBtn,
            alpha: 1,
            duration: 500,
            delay: 3500
        });

        if (SaveSystem.hasSave()) {
            const contBtn = this.add.text(width / 2, height * 0.43, '[ CONTINUE ]',
                makeStyle(TEXT_STYLES.BUTTON, { fontSize: '16px' })
            ).setOrigin(0.5).setInteractive({ useHandCursor: true }).setAlpha(0).setDepth(10);

            contBtn.on('pointerover', () => contBtn.setColor('#ffffff'));
            contBtn.on('pointerout', () => contBtn.setColor('#aaaacc'));
            contBtn.on('pointerdown', () => this._transitionTo(() => this.continueGame()));

            this.tweens.add({
                targets: contBtn,
                alpha: 1,
                duration: 500,
                delay: 3500
            });
        }

        const zonesBtn = this.add.text(width / 2, height * 0.50, '[ ZONES ]',
            makeStyle(TEXT_STYLES.BUTTON, { fontSize: '14px' })
        ).setOrigin(0.5).setInteractive({ useHandCursor: true }).setAlpha(0).setDepth(10);
        zonesBtn.on('pointerover', () => zonesBtn.setColor('#ffffff'));
        zonesBtn.on('pointerout', () => zonesBtn.setColor('#aaaacc'));
        zonesBtn.on('pointerdown', () => this._transitionTo(() => this.scene.start('ZonePreviewScene')));

        this.tweens.add({
            targets: zonesBtn,
            alpha: 1,
            duration: 500,
            delay: 3500
        });

        // Version label
        this.add.text(width - 5, height - 5, `v${VERSION}`, TEXT_STYLES.VERSION).setOrigin(1, 1).setDepth(10);
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
        coverBackground(this, 'bg_title');
        this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.6);

        this.add.text(width / 2, 20, 'Choose your starter fish:',
            makeStyle(TEXT_STYLES.TITLE_SMALL, { color: '#ccccee' })
        ).setOrigin(0.5);

        const isPortrait = this.registry.get('isPortrait');
        const starters = FISH_SPECIES.filter(s => s.isStarter);

        if (isPortrait) {
            starters.forEach((species, i) => {
                const y = height * 0.2 + i * (height * 0.22);

                this.add.image(45, y, `fish_${species.id}`).setScale(0.5);

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

                this.add.image(x, y - 20, `fish_${species.id}`).setScale(0.5);

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
            campFloor: 1
        };

        SaveSystem.save(gameState);
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
            campFloor: saveData.campFloor
        };

        this.scene.start('FloorScene', { gameState });
    }
}
