import SaveSystem from '../systems/SaveSystem.js';
import PartySystem from '../systems/PartySystem.js';
import FISH_SPECIES from '../data/fish.js';
import { VERSION } from '../version.js';

export default class TitleScene extends Phaser.Scene {
    constructor() {
        super('TitleScene');
    }

    create() {
        const { width, height } = this.scale;

        // Sewers background (starting zone)
        this.add.image(width / 2, height / 2, 'bg_sewers').setDisplaySize(width, height);
        this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.5);

        // Title text
        this.add.text(width / 2, height * 0.25, 'DUNGEON FISHER', {
            fontSize: '28px',
            fontFamily: 'monospace',
            color: '#f0c040',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        this.add.text(width / 2, height * 0.35, 'A Turn-Based Fish RPG', {
            fontSize: '14px',
            fontFamily: 'monospace',
            color: '#8888aa'
        }).setOrigin(0.5);

        // New Game button
        const newBtn = this.add.text(width / 2, height * 0.55, '[ NEW GAME ]', {
            fontSize: '16px',
            fontFamily: 'monospace',
            color: '#aaaacc'
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        newBtn.on('pointerover', () => newBtn.setColor('#ffffff'));
        newBtn.on('pointerout', () => newBtn.setColor('#aaaacc'));
        newBtn.on('pointerdown', () => this.showStarterSelection());

        // Version label
        this.add.text(width - 5, height - 5, `v${VERSION}`, {
            fontSize: '10px',
            fontFamily: 'monospace',
            color: '#555566'
        }).setOrigin(1, 1);

        // Continue button (only if save exists)
        if (SaveSystem.hasSave()) {
            const contBtn = this.add.text(width / 2, height * 0.65, '[ CONTINUE ]', {
                fontSize: '16px',
                fontFamily: 'monospace',
                color: '#aaaacc'
            }).setOrigin(0.5).setInteractive({ useHandCursor: true });

            contBtn.on('pointerover', () => contBtn.setColor('#ffffff'));
            contBtn.on('pointerout', () => contBtn.setColor('#aaaacc'));
            contBtn.on('pointerdown', () => this.continueGame());
        }
    }

    showStarterSelection() {
        // Clear scene
        this.children.removeAll();

        const { width, height } = this.scale;

        // Sewers background with dark overlay for readability
        this.add.image(width / 2, height / 2, 'bg_sewers').setDisplaySize(width, height);
        this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.6);

        this.add.text(width / 2, 20, 'Choose your starter fish:', {
            fontSize: '15px',
            fontFamily: 'monospace',
            color: '#ccccee'
        }).setOrigin(0.5);

        const isPortrait = this.registry.get('isPortrait');
        const starters = FISH_SPECIES.filter(s => s.isStarter);

        if (isPortrait) {
            starters.forEach((species, i) => {
                const y = height * 0.2 + i * (height * 0.22);

                this.add.image(45, y, `fish_${species.id}`).setScale(0.5);

                this.add.text(85, y - 16, species.name, {
                    fontSize: '13px', fontFamily: 'monospace', color: '#ffffff'
                });
                this.add.text(85, y - 4, `HP:${species.baseHp} ATK:${species.baseAtk} DEF:${species.baseDef}`, {
                    fontSize: '10px', fontFamily: 'monospace', color: '#888888'
                });
                this.add.text(85, y + 6, `SPD:${species.baseSpd}`, {
                    fontSize: '10px', fontFamily: 'monospace', color: '#888888'
                });

                const btn = this.add.text(width - 40, y, '[ SELECT ]', {
                    fontSize: '12px', fontFamily: 'monospace', color: '#aaaacc'
                }).setOrigin(0.5).setInteractive({ useHandCursor: true });
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

                this.add.text(x, y + 5, species.name, {
                    fontSize: '13px', fontFamily: 'monospace', color: '#ffffff'
                }).setOrigin(0.5);

                this.add.text(x, y + 18, `HP:${species.baseHp} ATK:${species.baseAtk} DEF:${species.baseDef} SPD:${species.baseSpd}`, {
                    fontSize: '10px', fontFamily: 'monospace', color: '#888888'
                }).setOrigin(0.5);

                this.add.text(x, y + 28, species.description, {
                    fontSize: '10px', fontFamily: 'monospace', color: '#666688',
                    wordWrap: { width: 110 }, align: 'center'
                }).setOrigin(0.5);

                const btn = this.add.text(x, y + 45, '[ SELECT ]', {
                    fontSize: '12px', fontFamily: 'monospace', color: '#aaaacc'
                }).setOrigin(0.5).setInteractive({ useHandCursor: true });
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
