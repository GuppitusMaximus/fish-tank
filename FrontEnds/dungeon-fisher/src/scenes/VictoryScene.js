import SaveSystem from '../systems/SaveSystem.js';

export default class VictoryScene extends Phaser.Scene {
    constructor() {
        super('VictoryScene');
    }

    init(data) {
        this.gameState = data.gameState;
    }

    create() {
        const W = this.scale.width;
        const H = this.scale.height;
        const gs = this.gameState;

        // Title
        this.add.text(W / 2, H * 0.15, '\u2605  DUNGEON CLEARED  \u2605', {
            fontSize: '20px', fontFamily: 'monospace', color: '#ffd700', fontStyle: 'bold'
        }).setOrigin(0.5);

        this.add.text(W / 2, H * 0.28, 'You conquered all 100 floors!', {
            fontSize: '14px', fontFamily: 'monospace', color: '#cccccc'
        }).setOrigin(0.5);

        // Final party
        this.add.text(W / 2, H * 0.4, 'Final Party:', {
            fontSize: '13px', fontFamily: 'monospace', color: '#aaaacc'
        }).setOrigin(0.5);

        const isPortrait = this.registry.get('isPortrait');
        if (isPortrait) {
            gs.party.forEach((f, i) => {
                this.add.text(W / 2, H * 0.46 + i * 16, f.name + ' Lv.' + f.level, {
                    fontSize: '12px', fontFamily: 'monospace', color: '#88ccff'
                }).setOrigin(0.5);
            });
        } else {
            const partyLine = gs.party.map(f => f.name + ' Lv.' + f.level).join('  \u2022  ');
            this.add.text(W / 2, H * 0.5, partyLine, {
                fontSize: '12px', fontFamily: 'monospace', color: '#88ccff'
            }).setOrigin(0.5);
        }

        // Gold
        this.add.text(W / 2, H * 0.62, 'Gold earned: ' + gs.gold.toLocaleString(), {
            fontSize: '13px', fontFamily: 'monospace', color: '#f0c040'
        }).setOrigin(0.5);

        // Play again
        const btn = this.add.text(W / 2, H * 0.78, '[ PLAY AGAIN ]', {
            fontSize: '16px', fontFamily: 'monospace', color: '#aaaacc'
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        btn.on('pointerover', () => btn.setColor('#ffffff'));
        btn.on('pointerout', () => btn.setColor('#aaaacc'));
        btn.on('pointerdown', () => {
            SaveSystem.deleteSave();
            this.scene.start('TitleScene');
        });
    }
}
