import PartySystem from '../systems/PartySystem.js';
import SaveSystem from '../systems/SaveSystem.js';

export default class CampScene extends Phaser.Scene {
    constructor() {
        super('CampScene');
    }

    init(data) {
        this.gameState = data.gameState;
    }

    create() {
        const W = this.scale.width;
        const H = this.scale.height;
        const gs = this.gameState;

        // Title
        this.add.text(W / 2, 15, 'CAMP \u2014 Floor ' + gs.floor, {
            fontSize: '12px', fontFamily: 'monospace', color: '#f0c040', fontStyle: 'bold'
        }).setOrigin(0.5);

        this.add.text(W / 2, 35, 'Your party rests by the fire...', {
            fontSize: '9px', fontFamily: 'monospace', color: '#888888'
        }).setOrigin(0.5);

        // Capture old HP before healing
        const oldHp = gs.party.map(f => ({ hp: f.hp, maxHp: f.maxHp, fainted: f.hp <= 0 }));

        // Heal all fish
        for (const f of gs.party) PartySystem.fullHeal(f);

        // Set checkpoint and save
        gs.campFloor = gs.floor;
        SaveSystem.save(gs);

        // Show party with before → after HP
        const isPortrait = this.registry.get('isPortrait');
        const hpColX = isPortrait ? Math.floor(W * 0.45) : 140;
        let y = 60;
        gs.party.forEach((f, i) => {
            const old = oldHp[i];
            const before = old.fainted ? 'FAINTED' : old.hp + '/' + old.maxHp;
            this.add.text(20, y, f.name + '  Lv.' + f.level, {
                fontSize: '8px', fontFamily: 'monospace', color: '#88ccff'
            });
            this.add.text(hpColX, y, before + ' \u2192 ' + f.hp + '/' + f.maxHp, {
                fontSize: '8px', fontFamily: 'monospace', color: '#88cc88'
            });
            this.add.text(W - 30, y, '\u2713', {
                fontSize: '10px', fontFamily: 'monospace', color: '#44ff44'
            });
            y += 18;
        });

        // Checkpoint message
        this.add.text(W / 2, y + 15, 'Checkpoint saved!', {
            fontSize: '9px', fontFamily: 'monospace', color: '#ccaa66'
        }).setOrigin(0.5);

        // Continue button
        const contBtn = this.add.text(W / 2, H - 30, '[ CONTINUE ]', {
            fontSize: '11px', fontFamily: 'monospace', color: '#aaaacc'
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        contBtn.on('pointerover', () => contBtn.setColor('#ffffff'));
        contBtn.on('pointerout', () => contBtn.setColor('#aaaacc'));
        contBtn.on('pointerdown', () => this.scene.start('FloorScene', { gameState: gs }));
    }
}
