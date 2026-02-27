import EconomySystem from '../systems/EconomySystem.js';
import EncounterSystem from '../systems/EncounterSystem.js';
import EquipmentSystem from '../systems/EquipmentSystem.js';
import EquipmentRenderer from '../systems/EquipmentRenderer.js';
import ConfigLoader from '../systems/ConfigLoader.js';
import { ITEMS, MAX_INVENTORY } from '../data/items.js';
import { getBackgroundKey, coverBackground, getShopBackground } from '../utils/zones.js';
import { addEffects } from '../effects/BackgroundEffects.js';
import { TEXT_STYLES, makeStyle } from '../constants/textStyles.js';
import { getZoneByFloor, getCharacterTheme, accentHex } from '../data/themes.js';
import { UIPanel, UIButton, UIList, UILayout } from '../ui/index.js';
import CursorManager from '../ui/CursorManager.js';

export default class ShopScene extends Phaser.Scene {
    constructor() {
        super('ShopScene');
    }

    init(data) {
        this.gameState = data.gameState;
        this._shopTab = 'items';
        this._shopEquipment = null;
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
        const zone = EncounterSystem.getZoneNumber(gs.floor);

        // Zone background — conditional pattern kept inline
        const shopBgKey = getShopBackground(gs.floor);
        const bgKey = shopBgKey || getBackgroundKey(gs.floor);
        coverBackground(this, bgKey);
        if (!shopBgKey) addEffects(this, bgKey);
        UILayout.overlay(this, { alpha: 0.55, depth: 0 });

        const zoneTheme = getZoneByFloor(gs.floor);
        const character = getCharacterTheme(gs.fisherId);

        // Header panel
        const headerPanel = new UIPanel(this, {
            x: 4, y: 2, width: W - 8, height: 34, theme: zoneTheme, padding: 0
        });
        headerPanel.addText('SHOP',
            makeStyle(TEXT_STYLES.TITLE_MEDIUM, { fontSize: '16px', color: accentHex(zoneTheme) }),
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
            x: 4, y: 38, width: W - 8, height: H - 62, theme: zoneTheme, padding: 0
        });

        // Tab buttons
        const hasEquipment = gs.equipment != null;
        if (hasEquipment) {
            const tabY = 40;
            const itemsActive = this._shopTab === 'items';
            const equipActive = this._shopTab === 'equipment';

            UIButton.create(this, {
                x: W * 0.25, y: tabY,
                label: '[ ITEMS ]',
                style: makeStyle(TEXT_STYLES.BUTTON, { fontSize: '11px' }),
                color: itemsActive ? accentHex(zoneTheme) : '#555555',
                hoverColor: '#ffffff',
                onClick: () => { this._shopTab = 'items'; this.buildShop(); }
            });
            UIButton.create(this, {
                x: W * 0.75, y: tabY,
                label: '[ EQUIPMENT ]',
                style: makeStyle(TEXT_STYLES.BUTTON, { fontSize: '11px' }),
                color: equipActive ? accentHex(zoneTheme) : '#555555',
                hoverColor: '#ffffff',
                onClick: () => { this._shopTab = 'equipment'; this.buildShop(); }
            });
        }

        const contentY = hasEquipment ? 56 : 40;

        if (this._shopTab === 'items' || !hasEquipment) {
            this._buildItemsTab(contentY, W, H, gs, isPortrait, zone, zoneTheme);
        } else {
            this._buildEquipmentTab(contentY, W, H, gs, zoneTheme);
        }

        // Back button
        UIButton.create(this, {
            x: W / 2, y: H - 18,
            label: '[ BACK ]',
            style: TEXT_STYLES.BUTTON,
            hoverColor: '#ffffff',
            onClick: () => this.scene.start('FloorScene', { gameState: gs })
        });

        CursorManager.attach(this, gs.fisherId);
    }

    _buildItemsTab(startY, W, H, gs, isPortrait, zone, zoneTheme) {
        // Items section
        this.add.text(10, startY, '-- ITEMS --',
            makeStyle(TEXT_STYLES.BODY_SMALL, { fontSize: '12px', color: accentHex(zoneTheme) })
        );

        const itemList = new UIList(this, {
            x: 10, y: startY + 16, spacing: isPortrait ? 28 : 16
        });

        const itemKeys = Object.keys(ITEMS);
        for (const key of itemKeys) {
            const item = ITEMS[key];
            const price = EconomySystem.getZoneScaledPrice(key, zone);
            const canBuy = gs.gold >= price && gs.inventory.length < MAX_INVENTORY;

            itemList.addRow((x, y) => {
                const row = [];
                row.push(this.add.text(x, y, item.name + ' (' + price + 'g)',
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
            makeStyle(TEXT_STYLES.BODY_SMALL, { fontSize: '12px', color: accentHex(zoneTheme) })
        );

        const fishList = new UIList(this, {
            x: 10, y: fishHeaderY + 16, spacing: isPortrait ? 28 : 16
        });

        const shopFish = EconomySystem.getShopFish(gs);
        const fishPrice = EconomySystem.getZoneScaledFishPrice(zone);

        if (shopFish.length === 0) {
            fishList.addRow((x, y) => [
                this.add.text(x, y, 'No fish available',
                    makeStyle(TEXT_STYLES.BODY, { fontSize: '12px', color: '#555555' })
                )
            ]);
        } else {
            for (const species of shopFish) {
                const canBuy = gs.gold >= fishPrice;

                fishList.addRow((x, y) => {
                    const row = [];
                    row.push(this.add.text(x, y, species.name + ' (' + fishPrice + 'g) Lv.' + (zone * 2),
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
                            onClick: () => {
                                const result = EconomySystem.buyFish(gs, species.id);
                                if (result) {
                                    this.buildShop();
                                    this._showMessage('Added to Roster!');
                                }
                            }
                        });
                        row.push(btn.text);
                    }
                    return row;
                });
            }
        }
    }

    _buildEquipmentTab(startY, W, H, gs, zoneTheme) {
        const RARITY_HEX = { standard: '#888888', magic: '#44aa44', rare: '#9944cc', unique: '#ffd700' };
        const zoneId = getZoneByFloor(gs.floor).id;
        const balance = ConfigLoader.getEquipmentBalance();
        const stashCapacity = balance.stashCellCapacity || 15;

        // Generate equipment on first tab switch
        if (!this._shopEquipment) {
            const count = balance.shopEquipmentCount || 3;
            const zoneItems = ConfigLoader.getZoneItems(zoneId);
            const candidates = Object.values(zoneItems);
            this._shopEquipment = [];
            const used = new Set();
            for (let i = 0; i < count && candidates.length > 0; i++) {
                const available = candidates.filter(c => !used.has(c.id));
                if (available.length === 0) break;
                const pick = available[Math.floor(Math.random() * available.length)];
                used.add(pick.id);
                this._shopEquipment.push(pick);
            }
        }

        if (this._shopEquipment.length === 0) {
            this.add.text(W / 2, startY + 30, 'No equipment available',
                makeStyle(TEXT_STYLES.BODY, { fontSize: '12px', color: '#555555' })
            ).setOrigin(0.5);
            return;
        }

        const itemH = 80;
        for (let i = 0; i < this._shopEquipment.length; i++) {
            const item = this._shopEquipment[i];
            const y = startY + i * (itemH + 6);
            const rarityColor = RARITY_HEX[item.rarity] || '#888888';
            const price = item.buyPrice || 0;
            const canFit = EquipmentSystem.canFitInStash(gs.equipment.stash, item, stashCapacity);
            const canBuy = gs.gold >= price && canFit;

            // Item name
            this.add.text(50, y + 4, item.name,
                makeStyle(TEXT_STYLES.BODY, { fontSize: '12px', color: rarityColor })
            );

            // Rarity label
            this.add.text(50, y + 20, '[' + item.rarity + ']',
                makeStyle(TEXT_STYLES.BODY_SMALL, { fontSize: '10px', color: rarityColor })
            );

            // Mini shape preview
            EquipmentRenderer.renderItemSprite(this, item, 28, y + 30, 30, 2);

            // Buff summary
            const buffParts = (item.buffs || []).map(b => '+' + b.baseValue + ' ' + b.type.toUpperCase());
            if (buffParts.length > 0) {
                this.add.text(50, y + 36, buffParts.join(', '),
                    makeStyle(TEXT_STYLES.BODY_SMALL, { fontSize: '10px', color: '#ccccee' })
                );
            }

            // Price
            this.add.text(50, y + 52, price + 'g',
                makeStyle(TEXT_STYLES.GOLD, { fontSize: '11px' })
            );

            // Preview button — opens equipment grid overlay
            UIButton.create(this, {
                x: W - 65, y: y + 14,
                label: 'PREVIEW',
                style: makeStyle(TEXT_STYLES.BUTTON, {
                    fontSize: '10px', backgroundColor: '#2a2a4a', padding: { x: 4, y: 2 }
                }),
                color: '#8888cc',
                hoverColor: '#ffffff',
                onClick: () => {
                    // Add item to stash temporarily for preview, then open grid
                    const uiOverlay = this.scene.get('UIOverlay');
                    if (uiOverlay && uiOverlay.openEquipmentGrid) {
                        uiOverlay.openEquipmentGrid('edit');
                    }
                }
            });

            // Buy button
            const buyLabel = !canFit ? 'FULL' : 'BUY';
            const buyColor = canBuy ? '#88cc88' : '#555555';
            UIButton.create(this, {
                x: W - 25, y: y + 14,
                label: buyLabel,
                style: makeStyle(TEXT_STYLES.BUTTON, {
                    fontSize: '11px', backgroundColor: '#2a2a4a', padding: { x: 5, y: 2 }
                }),
                color: buyColor,
                hoverColor: canBuy ? '#ffffff' : '#555555',
                origin: { x: 0.5, y: 0 },
                onClick: () => {
                    if (canBuy && EconomySystem.buyEquipment(gs, item.id)) {
                        this._shopEquipment.splice(i, 1);
                        this.buildShop();
                        this._showMessage('Added to Stash!');
                    }
                }
            });

            // Separator line
            if (i < this._shopEquipment.length - 1) {
                const sep = this.add.graphics();
                sep.lineStyle(1, 0x554433, 0.3);
                sep.lineBetween(10, y + itemH - 2, W - 10, y + itemH - 2);
            }
        }
    }

    _showMessage(text) {
        const W = this.scale.width;
        const msg = this.add.text(W / 2, 50, text,
            makeStyle(TEXT_STYLES.BODY, { fontSize: '12px', color: '#88cc88' })
        ).setOrigin(0.5).setDepth(10);
        this.tweens.add({
            targets: msg,
            alpha: 0,
            y: msg.y - 15,
            duration: 1500,
            onComplete: () => msg.destroy()
        });
    }
}
