import EconomySystem from '../systems/EconomySystem.js';
import { ITEMS, MAX_INVENTORY } from '../data/items.js';

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

        // Header
        this.add.text(10, 8, 'SHOP', {
            fontSize: '16px', fontFamily: 'monospace', color: '#f0c040', fontStyle: 'bold'
        });
        this.add.text(W - 10, 8, 'Gold: ' + gs.gold, {
            fontSize: '14px', fontFamily: 'monospace', color: '#f0c040'
        }).setOrigin(1, 0);
        this.add.text(W - 10, 22, 'Items: ' + gs.inventory.length + '/' + MAX_INVENTORY, {
            fontSize: '11px', fontFamily: 'monospace', color: '#888888'
        }).setOrigin(1, 0);
        this.add.text(10, 22, 'Party: ' + gs.party.length + '/3', {
            fontSize: '11px', fontFamily: 'monospace', color: '#888888'
        });

        // Items section
        let y = 40;
        this.add.text(10, y, '-- ITEMS --', {
            fontSize: '12px', fontFamily: 'monospace', color: '#666688'
        });
        y += 16;

        const itemKeys = Object.keys(ITEMS);
        for (const key of itemKeys) {
            const item = ITEMS[key];
            const canBuy = gs.gold >= item.price && gs.inventory.length < MAX_INVENTORY;

            this.add.text(10, y, item.name + ' (' + item.price + 'g)', {
                fontSize: '12px', fontFamily: 'monospace', color: canBuy ? '#ccccee' : '#555555'
            });

            if (isPortrait) {
                this.add.text(20, y + 13, item.description, {
                    fontSize: '10px', fontFamily: 'monospace', color: '#555577'
                });
            } else {
                this.add.text(195, y, item.description, {
                    fontSize: '10px', fontFamily: 'monospace', color: '#555577'
                });
            }

            if (canBuy) {
                const btn = this.add.text(W - 25, y + 1, 'BUY', {
                    fontSize: '11px', fontFamily: 'monospace', color: '#88cc88',
                    backgroundColor: '#2a2a4a', padding: { x: 5, y: 2 }
                }).setOrigin(0.5, 0).setInteractive({ useHandCursor: true });
                btn.on('pointerover', () => btn.setColor('#ffffff'));
                btn.on('pointerout', () => btn.setColor('#88cc88'));
                btn.on('pointerdown', () => {
                    if (EconomySystem.buyItem(gs, key)) this.buildShop();
                });
            }
            y += isPortrait ? 28 : 16;
        }

        // Fish section
        y += 6;
        this.add.text(10, y, '-- FISH --', {
            fontSize: '12px', fontFamily: 'monospace', color: '#666688'
        });
        y += 16;

        const shopFish = EconomySystem.getShopFish(gs);
        if (shopFish.length === 0) {
            this.add.text(10, y, gs.party.length >= 3 ? 'Party full!' : 'No fish available', {
                fontSize: '12px', fontFamily: 'monospace', color: '#555555'
            });
            y += isPortrait ? 28 : 16;
        } else {
            for (const species of shopFish) {
                const canBuy = gs.gold >= species.shopPrice && gs.party.length < 3;

                this.add.text(10, y, species.name + ' (' + species.shopPrice + 'g)', {
                    fontSize: '12px', fontFamily: 'monospace', color: canBuy ? '#ccccee' : '#555555'
                });

                if (isPortrait) {
                    this.add.text(20, y + 13, 'HP:' + species.baseHp + ' ATK:' + species.baseAtk +
                        ' DEF:' + species.baseDef + ' SPD:' + species.baseSpd, {
                        fontSize: '10px', fontFamily: 'monospace', color: '#555577'
                    });
                } else {
                    this.add.text(195, y, 'HP:' + species.baseHp + ' ATK:' + species.baseAtk +
                        ' DEF:' + species.baseDef + ' SPD:' + species.baseSpd, {
                        fontSize: '10px', fontFamily: 'monospace', color: '#555577'
                    });
                }

                if (canBuy) {
                    const btn = this.add.text(W - 25, y + 1, 'BUY', {
                        fontSize: '11px', fontFamily: 'monospace', color: '#88cc88',
                        backgroundColor: '#2a2a4a', padding: { x: 5, y: 2 }
                    }).setOrigin(0.5, 0).setInteractive({ useHandCursor: true });
                    btn.on('pointerover', () => btn.setColor('#ffffff'));
                    btn.on('pointerout', () => btn.setColor('#88cc88'));
                    btn.on('pointerdown', () => {
                        if (EconomySystem.buyFish(gs, species.id)) this.buildShop();
                    });
                }
                y += isPortrait ? 28 : 16;
            }
        }

        // Back button
        const backBtn = this.add.text(W / 2, H - 18, '[ BACK ]', {
            fontSize: '14px', fontFamily: 'monospace', color: '#aaaacc'
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        backBtn.on('pointerover', () => backBtn.setColor('#ffffff'));
        backBtn.on('pointerout', () => backBtn.setColor('#aaaacc'));
        backBtn.on('pointerdown', () => this.scene.start('FloorScene', { gameState: gs }));
    }
}
