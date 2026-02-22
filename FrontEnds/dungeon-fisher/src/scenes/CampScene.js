import PartySystem from '../systems/PartySystem.js';
import SaveSystem from '../systems/SaveSystem.js';
import { getBackgroundKey, coverBackground } from '../utils/zones.js';
import { addEffects } from '../effects/BackgroundEffects.js';
import { TEXT_STYLES, makeStyle } from '../constants/textStyles.js';
import { getZoneByFloor, getCharacterTheme, accentHex } from '../data/themes.js';
import { themedPanel } from '../ui/ThemedPanel.js';

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
        coverBackground(this, bgKey);
        addEffects(this, bgKey);
        this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.4);

        const zone = getZoneByFloor(gs.floor);
        const character = getCharacterTheme(gs.fisherId);
        this.zone = zone;
        themedPanel(this, 4, 4, W - 8, 42, zone);
        themedPanel(this, 4, 52, W - 8, gs.party.length * 22 + 32, zone);

        // Title
        this.add.text(W / 2, 15, 'CAMP \u2014 Floor ' + gs.floor,
            makeStyle(TEXT_STYLES.TITLE_MEDIUM, { fontSize: '16px', color: accentHex(zone) })
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
            makeStyle(TEXT_STYLES.GOLD, { color: accentHex(character) })
        ).setOrigin(0.5);

        // Party order section
        this.orderStartY = y + 35;
        this.orderObjects = [];
        this.renderPartyOrder();

        // Continue button
        const contY = Math.max(this.orderEndY + 22, H - 30);
        const contBtn = this.add.text(W / 2, contY, '[ CONTINUE ]',
            makeStyle(TEXT_STYLES.BUTTON, { fontSize: '15px' })
        ).setOrigin(0.5).setInteractive({ useHandCursor: true });
        contBtn.on('pointerover', () => contBtn.setColor('#ffffff'));
        contBtn.on('pointerout', () => contBtn.setColor('#aaaacc'));
        contBtn.on('pointerdown', () => this.scene.start('FloorScene', { gameState: gs }));
    }

    renderPartyOrder() {
        const W = this.scale.width;
        const gs = this.gameState;

        this.orderObjects.forEach(obj => obj.destroy());
        this.orderObjects = [];

        let y = this.orderStartY;

        const orderH = 31 + gs.party.length * 18 + 4;
        const orderPanel = themedPanel(this, 4, this.orderStartY - 4, W - 8, orderH, this.zone);
        this.orderObjects.push(orderPanel);

        const header = this.add.text(W / 2, y, 'PARTY ORDER',
            makeStyle(TEXT_STYLES.TITLE_MEDIUM, { fontSize: '13px', color: accentHex(this.zone) })
        ).setOrigin(0.5);
        this.orderObjects.push(header);
        y += 15;

        const sub = this.add.text(W / 2, y, 'First fish takes damage first',
            makeStyle(TEXT_STYLES.BODY, { color: '#888888', fontSize: '10px' })
        ).setOrigin(0.5);
        this.orderObjects.push(sub);
        y += 16;

        gs.party.forEach((f, i) => {
            const nameTxt = this.add.text(20, y, f.name + ' Lv.' + f.level,
                makeStyle(TEXT_STYLES.FISH_NAME, { fontSize: '12px' })
            );
            this.orderObjects.push(nameTxt);

            if (i === 0) {
                const frontTxt = this.add.text(20 + nameTxt.width + 6, y, '(FRONT)',
                    makeStyle(TEXT_STYLES.BODY, { fontSize: '10px', color: '#f0c040' })
                );
                this.orderObjects.push(frontTxt);
            }

            if (i > 0) {
                const upBtn = this.add.text(W - 50, y, '\u25b2',
                    makeStyle(TEXT_STYLES.BUTTON, { fontSize: '12px' })
                ).setInteractive({ useHandCursor: true });
                upBtn.on('pointerover', () => upBtn.setColor('#ffffff'));
                upBtn.on('pointerout', () => upBtn.setColor('#aaaacc'));
                upBtn.on('pointerdown', () => {
                    [gs.party[i - 1], gs.party[i]] = [gs.party[i], gs.party[i - 1]];
                    SaveSystem.save(gs);
                    this.renderPartyOrder();
                });
                this.orderObjects.push(upBtn);
            }

            if (i < gs.party.length - 1) {
                const dnBtn = this.add.text(W - 30, y, '\u25bc',
                    makeStyle(TEXT_STYLES.BUTTON, { fontSize: '12px' })
                ).setInteractive({ useHandCursor: true });
                dnBtn.on('pointerover', () => dnBtn.setColor('#ffffff'));
                dnBtn.on('pointerout', () => dnBtn.setColor('#aaaacc'));
                dnBtn.on('pointerdown', () => {
                    [gs.party[i], gs.party[i + 1]] = [gs.party[i + 1], gs.party[i]];
                    SaveSystem.save(gs);
                    this.renderPartyOrder();
                });
                this.orderObjects.push(dnBtn);
            }

            y += 18;
        });

        this.orderEndY = y;
    }
}
