import PartySystem from '../systems/PartySystem.js';
import SaveSystem from '../systems/SaveSystem.js';
import { getBackgroundKey } from '../utils/zones.js';
import { TEXT_STYLES, makeStyle } from '../constants/textStyles.js';
import { getZoneByFloor, getCharacterTheme, accentHex } from '../data/themes.js';
import { UIPanel, UIButton, UIList, UILayout } from '../ui/index.js';

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
        UILayout.sceneBackground(this, bgKey, { effects: true });
        UILayout.overlay(this, { alpha: 0.4, depth: 0 });

        const zone = getZoneByFloor(gs.floor);
        const character = getCharacterTheme(gs.fisherId);
        this.zone = zone;

        // Title panel
        new UIPanel(this, {
            x: 4, y: 4, width: W - 8, height: 42, theme: zone, padding: 0
        });
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

        // Party HP panel
        new UIPanel(this, {
            x: 4, y: 52, width: W - 8, height: gs.party.length * 22 + 32, theme: zone, padding: 0
        });

        // Show party with before → after HP
        const isPortrait = this.registry.get('isPortrait');
        const hpColX = isPortrait ? Math.floor(W * 0.45) : 140;

        const hpList = new UIList(this, { x: 20, y: 60, spacing: 22 });
        gs.party.forEach((f, i) => {
            const old = oldHp[i];
            const before = old.fainted ? 'FAINTED' : old.hp + '/' + old.maxHp;
            hpList.addRow((x, y) => [
                this.add.text(x, y, f.name + '  Lv.' + f.level,
                    makeStyle(TEXT_STYLES.FISH_NAME, { fontSize: '12px' })
                ),
                this.add.text(hpColX, y, before + ' \u2192 ' + f.hp + '/' + f.maxHp,
                    makeStyle(TEXT_STYLES.BODY, { fontSize: '12px', color: '#88cc88' })
                ),
                this.add.text(W - 30, y, '\u2713',
                    makeStyle(TEXT_STYLES.BODY, { fontSize: '14px', color: '#44ff44' })
                )
            ]);
        });

        // Checkpoint message
        this.add.text(W / 2, hpList.bottomY + 15, 'Checkpoint saved!',
            makeStyle(TEXT_STYLES.GOLD, { color: accentHex(character) })
        ).setOrigin(0.5);

        // Party order section
        this.orderStartY = hpList.bottomY + 35;
        this.orderObjects = [];
        this.renderPartyOrder();

        // Continue button
        const contY = Math.max(this.orderEndY + 22, H - 30);
        UIButton.create(this, {
            x: W / 2, y: contY,
            label: '[ CONTINUE ]',
            style: makeStyle(TEXT_STYLES.BUTTON, { fontSize: '15px' }),
            hoverColor: '#ffffff',
            onClick: () => this.scene.start('FloorScene', { gameState: gs })
        });
    }

    renderPartyOrder() {
        const W = this.scale.width;
        const gs = this.gameState;

        for (const obj of this.orderObjects) {
            if (obj && obj.destroy) obj.destroy();
        }
        this.orderObjects = [];

        let y = this.orderStartY;

        const orderH = 31 + gs.party.length * 18 + 4;
        const orderPanel = new UIPanel(this, {
            x: 4, y: this.orderStartY - 4, width: W - 8, height: orderH,
            theme: this.zone, padding: 0
        });
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

        const orderList = new UIList(this, { x: 20, y, spacing: 18 });
        this.orderObjects.push(orderList);

        gs.party.forEach((f, i) => {
            orderList.addRow((x, rowY) => {
                const row = [];
                const nameTxt = this.add.text(x, rowY, f.name + ' Lv.' + f.level,
                    makeStyle(TEXT_STYLES.FISH_NAME, { fontSize: '12px' })
                );
                row.push(nameTxt);

                if (i === 0) {
                    row.push(this.add.text(x + nameTxt.width + 6, rowY, '(FRONT)',
                        makeStyle(TEXT_STYLES.BODY, { fontSize: '10px', color: '#f0c040' })
                    ));
                }

                if (i > 0) {
                    const upBtn = UIButton.create(this, {
                        x: W - 50, y: rowY,
                        label: '\u25b2',
                        style: makeStyle(TEXT_STYLES.BUTTON, { fontSize: '12px' }),
                        hoverColor: '#ffffff',
                        origin: { x: 0, y: 0 },
                        onClick: () => {
                            [gs.party[i - 1], gs.party[i]] = [gs.party[i], gs.party[i - 1]];
                            SaveSystem.save(gs);
                            this.renderPartyOrder();
                        }
                    });
                    this.orderObjects.push(upBtn);
                }

                if (i < gs.party.length - 1) {
                    const dnBtn = UIButton.create(this, {
                        x: W - 30, y: rowY,
                        label: '\u25bc',
                        style: makeStyle(TEXT_STYLES.BUTTON, { fontSize: '12px' }),
                        hoverColor: '#ffffff',
                        origin: { x: 0, y: 0 },
                        onClick: () => {
                            [gs.party[i], gs.party[i + 1]] = [gs.party[i + 1], gs.party[i]];
                            SaveSystem.save(gs);
                            this.renderPartyOrder();
                        }
                    });
                    this.orderObjects.push(dnBtn);
                }

                return row;
            });
        });

        this.orderEndY = orderList.bottomY;
    }
}
