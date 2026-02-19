import { generateMonster } from '../data/monsters.js';
import SaveSystem from '../systems/SaveSystem.js';

export default class FloorScene extends Phaser.Scene {
    constructor() {
        super('FloorScene');
    }

    init(data) {
        this.gameState = data.gameState;
    }

    create() {
        const { width, height } = this.scale;
        const gs = this.gameState;

        this.add.text(width / 2, 20, `Floor ${gs.floor} / 100`, {
            fontSize: '12px', fontFamily: 'monospace', color: '#f0c040'
        }).setOrigin(0.5);

        this.add.text(width / 2, 35, `Gold: ${gs.gold}`, {
            fontSize: '9px', fontFamily: 'monospace', color: '#cccc80'
        }).setOrigin(0.5);

        // Battle button
        const battleBtn = this.add.text(width / 2, height * 0.45, '[ ENTER BATTLE ]', {
            fontSize: '11px', fontFamily: 'monospace', color: '#aaaacc'
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        battleBtn.on('pointerover', () => battleBtn.setColor('#ffffff'));
        battleBtn.on('pointerout', () => battleBtn.setColor('#aaaacc'));
        battleBtn.on('pointerdown', () => {
            const monster = generateMonster(gs.floor);
            this.scene.start('BattleScene', { gameState: gs, monster });
        });

        // Shop button
        const shopBtn = this.add.text(width / 2, height * 0.58, '[ SHOP ]', {
            fontSize: '11px', fontFamily: 'monospace', color: '#aaaacc'
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        shopBtn.on('pointerover', () => shopBtn.setColor('#ffffff'));
        shopBtn.on('pointerout', () => shopBtn.setColor('#aaaacc'));
        shopBtn.on('pointerdown', () => {
            this.scene.start('ShopScene', { gameState: gs });
        });

        // Camp button
        const campBtn = this.add.text(width / 2, height * 0.71, '[ CAMP ]', {
            fontSize: '11px', fontFamily: 'monospace', color: '#aaaacc'
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        campBtn.on('pointerover', () => campBtn.setColor('#ffffff'));
        campBtn.on('pointerout', () => campBtn.setColor('#aaaacc'));
        campBtn.on('pointerdown', () => {
            this.scene.start('CampScene', { gameState: gs });
        });

        // Party display
        let yPos = height * 0.85;
        gs.party.forEach((fish, i) => {
            const status = fish.hp > 0 ? `${fish.hp}/${fish.maxHp}` : 'FAINTED';
            this.add.text(10, yPos + i * 12, `${fish.name} Lv.${fish.level} HP:${status}`, {
                fontSize: '7px', fontFamily: 'monospace', color: fish.hp > 0 ? '#88cc88' : '#cc4444'
            });
        });

        SaveSystem.save(gs);
    }
}
