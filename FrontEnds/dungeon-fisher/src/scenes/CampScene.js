import PartySystem from '../systems/PartySystem.js';
import SaveSystem from '../systems/SaveSystem.js';
import { getBackgroundKey } from '../utils/zones.js';
import { TEXT_STYLES, makeStyle } from '../constants/textStyles.js';

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

        // Zone background
        const bgKey = getBackgroundKey(gs.floor);
        this.add.image(W / 2, H / 2, bgKey).setDisplaySize(W, H);
        this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.4);

        // Title
        this.add.text(W / 2, 15, 'CAMP \u2014 Floor ' + gs.floor,
            makeStyle(TEXT_STYLES.TITLE_MEDIUM, { fontSize: '16px' })
        ).setOrigin(0.5);

        this.add.text(W / 2, 35, 'Your party rests by the fire...',
            makeStyle(TEXT_STYLES.BODY, { color: '#888888' })
        ).setOrigin(0.5);

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
            this.add.text(20, y, f.name + '  Lv.' + f.level,
                makeStyle(TEXT_STYLES.FISH_NAME, { fontSize: '12px' })
            );
            this.add.text(hpColX, y, before + ' \u2192 ' + f.hp + '/' + f.maxHp,
                makeStyle(TEXT_STYLES.BODY, { fontSize: '12px', color: '#88cc88' })
            );
            this.add.text(W - 30, y, '\u2713',
                makeStyle(TEXT_STYLES.BODY, { fontSize: '14px', color: '#44ff44' })
            );
            y += 22;
        });

        // Checkpoint message
        this.add.text(W / 2, y + 15, 'Checkpoint saved!',
            makeStyle(TEXT_STYLES.GOLD, { color: '#ccaa66' })
        ).setOrigin(0.5);

        // Continue button
        const contBtn = this.add.text(W / 2, H - 30, '[ CONTINUE ]',
            makeStyle(TEXT_STYLES.BUTTON, { fontSize: '15px' })
        ).setOrigin(0.5).setInteractive({ useHandCursor: true });
        contBtn.on('pointerover', () => contBtn.setColor('#ffffff'));
        contBtn.on('pointerout', () => contBtn.setColor('#aaaacc'));
        contBtn.on('pointerdown', () => this.scene.start('FloorScene', { gameState: gs }));
    }
}
