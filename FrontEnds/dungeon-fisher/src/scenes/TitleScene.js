import SaveSystem from '../systems/SaveSystem.js';
import PartySystem from '../systems/PartySystem.js';
import FISH_SPECIES from '../data/fish.js';
import { coverBackground } from '../utils/zones.js';
import SpriteAnimator from '../effects/SpriteAnimator.js';
import { TEXT_STYLES, makeStyle } from '../constants/textStyles.js';

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
                        // Zone color cycle shimmer
                        const zonePalettes = [
                            [0x88cc44, 0x66aa33],  // Sewers
                            [0xff8833, 0xff6622],  // Goblin Caves
                            [0xaa88cc, 0x8866aa],  // Bone Crypts
                            [0x44dddd, 0x33bbcc],  // Deep Dungeon
                            [0xcc44ff, 0x44ffcc],  // Shadow Realm
                            [0x66aaff, 0xaaccff],  // Ancient Chambers
                            [0xff3344, 0xcc2233]   // Dungeon Heart
                        ];
                        const lerpColor = (a, b, t) => {
                            const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
                            const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
                            return Phaser.Display.Color.GetColor(
                                ar + (br - ar) * t,
                                ag + (bg - ag) * t,
                                ab + (bb - ab) * t
                            );
                        };
                        this.tweens.addCounter({
                            from: 0,
                            to: 7,
                            duration: 21000,
                            repeat: -1,
                            onUpdate: (tween) => {
                                const v = tween.getValue();
                                const idx = Math.floor(v) % 7;
                                const next = (idx + 1) % 7;
                                const t = v - Math.floor(v);
                                const c1 = lerpColor(zonePalettes[idx][0], zonePalettes[next][0], t);
                                const c2 = lerpColor(zonePalettes[idx][1], zonePalettes[next][1], t);
                                titleText.setTint(c1, c2, c2, c1);
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

        // Buttons fade in after a short delay
        const newBtn = this.add.text(width / 2, height * 0.36, '[ NEW GAME ]',
            makeStyle(TEXT_STYLES.BUTTON, { fontSize: '16px' })
        ).setOrigin(0.5).setInteractive({ useHandCursor: true }).setAlpha(0).setDepth(10);

        newBtn.on('pointerover', () => newBtn.setColor('#ffffff'));
        newBtn.on('pointerout', () => newBtn.setColor('#aaaacc'));
        newBtn.on('pointerdown', () => this._transitionTo(() => this.scene.start('CharacterSelectScene')));

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
