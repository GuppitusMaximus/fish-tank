import EconomySystem from '../systems/EconomySystem.js';
import { ITEMS, MAX_INVENTORY } from '../data/items.js';
import { getBackgroundKey, coverBackground, getShopBackground } from '../utils/zones.js';
import { addEffects } from '../effects/BackgroundEffects.js';
import { TEXT_STYLES, makeStyle } from '../constants/textStyles.js';
import { getZoneByFloor, getCharacterTheme, accentHex } from '../data/themes.js';
import { UIPanel, UIButton, UIList, UILayout } from '../ui/index.js';

export default class ShopScene extends Phaser.Scene {
    constructor() {
        super('ShopScene');
    }

    init(data) {
        this.gameState = data.gameState;
    }

    create() {
        this.buildShop();
    }

    buildShop() {
        this.children.removeAll();
        const W = this.scale.width;
        const H = this.scale.height;
        const gs = this.gameState;
        const isPortrait = this.registry.get('isPortrait');

        // Zone background — conditional pattern kept inline
        const shopBgKey = getShopBackground(gs.floor);
        const bgKey = shopBgKey || getBackgroundKey(gs.floor);
        coverBackground(this, bgKey);
        if (!shopBgKey) addEffects(this, bgKey);
        UILayout.overlay(this, { alpha: 0.55, depth: 0 });

        const zone = getZoneByFloor(gs.floor);
        const character = getCharacterTheme(gs.fisherId);

        // Header panel
        const headerPanel = new UIPanel(this, {
            x: 4, y: 2, width: W - 8, height: 34, theme: zone, padding: 0
        });
        headerPanel.addText('SHOP',
            makeStyle(TEXT_STYLES.TITLE_MEDIUM, { fontSize: '16px', color: accentHex(zone) }),
            { offsetX: 6, offsetY: 6 }
        );
        headerPanel.addText('Gold: ' + gs.gold,
            makeStyle(TEXT_STYLES.GOLD, { fontSize: '14px', color: accentHex(character) }),
            { align: 'right', offsetX: -6, offsetY: 6 }
        );
        headerPanel.addText('Items: ' + gs.inventory.length + '/' + MAX_INVENTORY,
            TEXT_STYLES.BODY_SMALL,
            { align: 'right', offsetX: -6, offsetY: 20 }
        );
        headerPanel.addText('Party: ' + gs.party.length + '/3',
            TEXT_STYLES.BODY_SMALL,
            { offsetX: 6, offsetY: 20 }
        );

        // Content panel
        new UIPanel(this, {
            x: 4, y: 38, width: W - 8, height: H - 62, theme: zone, padding: 0
        });

        // Items section
        this.add.text(10, 40, '-- ITEMS --',
            makeStyle(TEXT_STYLES.BODY_SMALL, { fontSize: '12px', color: accentHex(zone) })
        );

        const itemList = new UIList(this, {
            x: 10, y: 56, spacing: isPortrait ? 28 : 16
        });

        const itemKeys = Object.keys(ITEMS);
        for (const key of itemKeys) {
            const item = ITEMS[key];
            const canBuy = gs.gold >= item.price && gs.inventory.length < MAX_INVENTORY;

            itemList.addRow((x, y) => {
                const row = [];
                row.push(this.add.text(x, y, item.name + ' (' + item.price + 'g)',
                    makeStyle(TEXT_STYLES.BODY, { fontSize: '12px', color: canBuy ? '#ccccee' : '#555555' })
                ));

                if (isPortrait) {
                    row.push(this.add.text(x + 10, y + 13, item.description,
                        makeStyle(TEXT_STYLES.BODY_SMALL, { fontSize: '10px', color: '#555577' })
                    ));
                } else {
                    row.push(this.add.text(195, y, item.description,
                        makeStyle(TEXT_STYLES.BODY_SMALL, { fontSize: '10px', color: '#555577' })
                    ));
                }

                if (canBuy) {
                    const btn = UIButton.create(this, {
                        x: W - 25, y: y + 1,
                        label: 'BUY',
                        style: makeStyle(TEXT_STYLES.BUTTON, {
                            fontSize: '11px', backgroundColor: '#2a2a4a', padding: { x: 5, y: 2 }
                        }),
                        color: '#88cc88',
                        hoverColor: '#ffffff',
                        origin: { x: 0.5, y: 0 },
                        onClick: () => { if (EconomySystem.buyItem(gs, key)) this.buildShop(); }
                    });
                    row.push(btn.text);
                }
                return row;
            });
        }

        // Fish section
        const fishHeaderY = itemList.bottomY + 6;
        this.add.text(10, fishHeaderY, '-- FISH --',
            makeStyle(TEXT_STYLES.BODY_SMALL, { fontSize: '12px', color: accentHex(zone) })
        );

        const fishList = new UIList(this, {
            x: 10, y: fishHeaderY + 16, spacing: isPortrait ? 28 : 16
        });

        const shopFish = EconomySystem.getShopFish(gs);
        if (shopFish.length === 0) {
            fishList.addRow((x, y) => [
                this.add.text(x, y, gs.party.length >= 3 ? 'Party full!' : 'No fish available',
                    makeStyle(TEXT_STYLES.BODY, { fontSize: '12px', color: '#555555' })
                )
            ]);
        } else {
            for (const species of shopFish) {
                const canBuy = gs.gold >= species.shopPrice && gs.party.length < 3;

                fishList.addRow((x, y) => {
                    const row = [];
                    row.push(this.add.text(x, y, species.name + ' (' + species.shopPrice + 'g)',
                        makeStyle(TEXT_STYLES.BODY, { fontSize: '12px', color: canBuy ? '#ccccee' : '#555555' })
                    ));

                    if (isPortrait) {
                        row.push(this.add.text(x + 10, y + 13, 'HP:' + species.baseHp + ' ATK:' + species.baseAtk +
                            ' DEF:' + species.baseDef + ' SPD:' + species.baseSpd,
                            makeStyle(TEXT_STYLES.BODY_SMALL, { fontSize: '10px', color: '#555577' })
                        ));
                    } else {
                        row.push(this.add.text(195, y, 'HP:' + species.baseHp + ' ATK:' + species.baseAtk +
                            ' DEF:' + species.baseDef + ' SPD:' + species.baseSpd,
                            makeStyle(TEXT_STYLES.BODY_SMALL, { fontSize: '10px', color: '#555577' })
                        ));
                    }

                    if (canBuy) {
                        const btn = UIButton.create(this, {
                            x: W - 25, y: y + 1,
                            label: 'BUY',
                            style: makeStyle(TEXT_STYLES.BUTTON, {
                                fontSize: '11px', backgroundColor: '#2a2a4a', padding: { x: 5, y: 2 }
                            }),
                            color: '#88cc88',
                            hoverColor: '#ffffff',
                            origin: { x: 0.5, y: 0 },
                            onClick: () => { if (EconomySystem.buyFish(gs, species.id)) this.buildShop(); }
                        });
                        row.push(btn.text);
                    }
                    return row;
                });
            }
        }

        // Back button
        UIButton.create(this, {
            x: W / 2, y: H - 18,
            label: '[ BACK ]',
            style: TEXT_STYLES.BUTTON,
            hoverColor: '#ffffff',
            onClick: () => this.scene.start('FloorScene', { gameState: gs })
        });
    }
}
