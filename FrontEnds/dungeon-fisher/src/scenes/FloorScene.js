import { generateMonster } from '../data/monsters.js';
import SaveSystem from '../systems/SaveSystem.js';
import PartySystem from '../systems/PartySystem.js';
import FISH_SPECIES from '../data/fish.js';
import { ITEMS, MAX_INVENTORY } from '../data/items.js';
import { getBackgroundKey, coverBackground, getShopCardKey, getShopName } from '../utils/zones.js';
import { getZoneByFloor, getCharacterTheme, accentHex } from '../data/themes.js';
import { addEffects } from '../effects/BackgroundEffects.js';
import SpriteAnimator from '../effects/SpriteAnimator.js';
import WaterEffect from '../effects/WaterEffect.js';
import { TEXT_STYLES, makeStyle } from '../constants/textStyles.js';
import { themedPanel } from '../ui/ThemedPanel.js';
import { loadZoneTheme, unloadZoneTheme } from '../systems/ThemeAssetLoader.js';

export default class FloorScene extends Phaser.Scene {
    constructor() {
        super('FloorScene');
    }

    init(data) {
        this.gameState = data.gameState;
        this.fromBattle = !!data.fromBattle;
    }

    create() {
        const gs = this.gameState;

        // Auto-save
        SaveSystem.save(gs);

        const zone = getZoneByFloor(gs.floor);

        // Unload previous zone's atlas to free GPU memory
        const prevZone = this.registry.get('previousZone');
        if (prevZone && prevZone.id !== zone.id) {
            unloadZoneTheme(this, prevZone);
        }
        this.registry.set('previousZone', zone);

        // Always wait for zone assets (bg + atlas) before building the scene
        loadZoneTheme(this, zone, () => this.onZoneReady());
    }

    onZoneReady() {
        const gs = this.gameState;

        // Floor reward check (every 10 floors, only when arriving from battle)
        if (this.fromBattle && gs.floor > 1 && gs.floor % 10 === 0) {
            this.showFloorReward();
            return;
        }

        this.buildFloorUI();
    }

    buildFloorUI() {
        const W = this.scale.width;
        const H = this.scale.height;
        const gs = this.gameState;

        // Zone background
        const bgKey = getBackgroundKey(gs.floor);
        coverBackground(this, bgKey);
        addEffects(this, bgKey);

        const zone = getZoneByFloor(gs.floor);
        this.registry.set('currentZone', zone);
        this.registry.set('currentCharacter', getCharacterTheme(gs.fisherId));

        // Top info panel
        themedPanel(this, 0, 0, W, 56 + gs.party.length * 18, zone);

        // Flavor text with warm shimmer sweep
        const flavorTxt = this.add.text(W / 2, 10, getZoneByFloor(gs.floor).flavor,
            makeStyle(TEXT_STYLES.FLAVOR, { color: '#ffffff' })
        ).setOrigin(0.5);
        this.tweens.addCounter({
            from: 0, to: Math.PI * 2,
            duration: 3000,
            repeat: -1,
            onUpdate: (tween) => {
                const p = tween.getValue();
                const l1 = 0.5 + 0.5 * Math.sin(p);
                const l2 = 0.5 + 0.5 * Math.sin(p - 1.5);
                const c1 = Phaser.Display.Color.GetColor(200 + l1 * 55, 80 + l1 * 80, 30 + l1 * 30);
                const c2 = Phaser.Display.Color.GetColor(200 + l2 * 55, 80 + l2 * 80, 30 + l2 * 30);
                flavorTxt.setTint(c1, c2, c1, c2);
            }
        });

        // Floor title
        this.add.text(W / 2, 26, 'Floor ' + gs.floor + ' / 100',
            makeStyle(TEXT_STYLES.TITLE_MEDIUM, { fontSize: '16px', color: accentHex(zone) })
        ).setOrigin(0.5);

        // Gold + Inventory
        const character = getCharacterTheme(gs.fisherId);
        this.add.text(W / 2, 42, 'Gold: ' + gs.gold + '   Items: ' + gs.inventory.length + '/' + MAX_INVENTORY,
            makeStyle(TEXT_STYLES.GOLD, { fontSize: '12px', color: accentHex(character) })
        ).setOrigin(0.5);

        // Party display with HP bars
        const isPortrait = this.registry.get('isPortrait');
        const barX = isPortrait ? Math.floor(W * 0.4) : 120;
        const barW = isPortrait ? Math.floor(W * 0.22) : 60;
        let py = 56;
        gs.party.forEach(fish => {
            const alive = fish.hp > 0;
            this.add.text(10, py, fish.name + ' Lv.' + fish.level,
                makeStyle(TEXT_STYLES.BODY_SMALL, { color: alive ? '#88ccff' : '#cc4444' })
            );

            // HP bar background
            this.add.graphics().fillStyle(0x333333, 1).fillRect(barX, py + 1, barW, 6);

            // HP bar fill
            if (alive) {
                const ratio = Math.max(0, fish.hp / fish.maxHp);
                const color = ratio > 0.5 ? 0x33cc33 : ratio > 0.25 ? 0xcccc33 : 0xcc3333;
                this.add.graphics().fillStyle(color, 1).fillRect(barX, py + 1, ratio * barW, 6);
            }

            // HP text
            this.add.text(barX + barW + 5, py, alive ? fish.hp + '/' + fish.maxHp : 'FAINTED',
                makeStyle(TEXT_STYLES.BODY_SMALL, { color: alive ? '#aaaaaa' : '#cc4444' })
            );
            py += 18;
        });

        // Action cards
        const shopAvailable = gs.floor >= (gs.nextShopFloor || 1);
        const cards = [{ type: 'delve', key: 'card_delve', label: 'Delve Deeper', color: '#cc9966' }];
        if (shopAvailable) {
            cards.push({ type: 'shop', key: getShopCardKey(gs.floor), label: getShopName(gs.floor), color: '#ccaa44' });
        }
        cards.push({ type: 'camp', key: 'card_camp', label: 'Make Camp', color: '#88aa66' });

        const cardH = Math.min(90, H - py - 50);
        const cardW = Math.floor(cardH * 0.85);

        // Inverted pyramid: shop/camp top row, delve below center
        const delveY = Math.floor(H * 0.67) - cardH / 2;
        const topY = delveY - cardH - 8;

        const positions = {};
        positions['delve'] = { x: Math.floor((W - cardW) / 2), y: delveY };
        if (shopAvailable) {
            const spread = cardW + 12;
            positions['shop'] = { x: Math.floor(W / 2 - spread - cardW / 2), y: topY };
            positions['camp'] = { x: Math.floor(W / 2 + spread - cardW / 2), y: topY };
        } else {
            positions['camp'] = { x: Math.floor((W - cardW) / 2), y: topY };
        }

        cards.forEach((card) => {
            const pos = positions[card.type];
            const cx = pos.x;
            const cy = pos.y;
            const midX = cx + cardW / 2;
            const midY = cy + cardH / 2;

            // Panel frame
            themedPanel(this, cx, cy, cardW, cardH, zone);

            // Inset matching the NineSlice corner size for this card
            const inset = Math.min(32, Math.floor(Math.min(cardW, cardH) / 4));

            // Card image — fit within the border's content area
            const contentH = cardH - inset * 2;
            const labelSpace = 14;
            const img = this.add.image(midX, cy + inset + (contentH - labelSpace) / 2, card.key);
            const imgScale = Math.min((cardW - inset * 2) / img.width, (contentH - labelSpace) / img.height);
            img.setScale(imgScale);

            // Label — inside the bottom content area, with stroke for readability
            const label = this.add.text(midX, cy + cardH - inset - 2, card.label,
                makeStyle(TEXT_STYLES.BUTTON, { fontSize: '10px', color: card.color, stroke: '#000000', strokeThickness: 2 })
            ).setOrigin(0.5);

            // Hit zone
            const hit = this.add.rectangle(midX, midY, cardW, cardH, 0xffffff, 0)
                .setInteractive({ useHandCursor: true });

            hit.on('pointerover', () => {
                label.setColor('#ffffff');
                img.setTint(0xdddddd);
            });
            hit.on('pointerout', () => {
                label.setColor(card.color);
                img.clearTint();
            });

            if (card.type === 'delve') {
                hit.on('pointerdown', () => {
                    const monster = generateMonster(gs.floor);
                    this.scene.start('BattleScene', { gameState: gs, monster: monster });
                });
            } else if (card.type === 'shop') {
                hit.on('pointerdown', () => {
                    gs.nextShopFloor = gs.floor + 1 + Math.floor(Math.random() * 3);
                    this.scene.start('ShopScene', { gameState: gs });
                });
            } else if (card.type === 'camp') {
                hit.on('pointerdown', () => {
                    this.scene.start('CampScene', { gameState: gs });
                });
            }
        });
    }

    showFloorReward() {
        const W = this.scale.width;
        const H = this.scale.height;
        const gs = this.gameState;

        // Zone background
        const bgKey = getBackgroundKey(gs.floor);
        coverBackground(this, bgKey);
        addEffects(this, bgKey);
        this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.4);

        this.add.text(W / 2, H * 0.12, 'Floor ' + gs.floor + ' Reward!',
            TEXT_STYLES.TITLE_MEDIUM
        ).setOrigin(0.5);

        // Offer a free fish if party has room, otherwise a free item
        if (gs.party.length < 3) {
            const ownedIds = gs.party.map(f => f.speciesId);
            const available = FISH_SPECIES.filter(s => !ownedIds.includes(s.id));
            if (available.length > 0) {
                const species = available[Math.floor(Math.random() * available.length)];
                this.showFishReward(species);
                return;
            }
        }

        // Give a free item
        const choices = ['potion', 'super_potion', 'revive'];
        const itemId = choices[Math.floor(Math.random() * choices.length)];
        this.showItemReward(itemId);
    }

    showFishReward(species) {
        const W = this.scale.width;
        const H = this.scale.height;
        const gs = this.gameState;

        this.add.text(W / 2, H * 0.3, 'A wild ' + species.name + ' wants to join!',
            TEXT_STYLES.BODY
        ).setOrigin(0.5);

        this.add.text(W / 2, H * 0.4, 'HP:' + species.baseHp + ' ATK:' + species.baseAtk +
            ' DEF:' + species.baseDef + ' SPD:' + species.baseSpd,
            TEXT_STYLES.BODY_SMALL
        ).setOrigin(0.5);

        new WaterEffect(this, W / 2, H * 0.52, { width: 80, height: 35 });
        const recruitImg = this.add.image(W / 2, H * 0.52, 'fish_' + species.id).setScale(0.75);
        new SpriteAnimator(this, recruitImg).idle();

        const acceptBtn = this.add.text(W / 2 - 60, H * 0.7, '[ ACCEPT ]',
            makeStyle(TEXT_STYLES.BUTTON, { color: '#88cc88' })
        ).setOrigin(0.5).setInteractive({ useHandCursor: true });
        acceptBtn.on('pointerover', () => acceptBtn.setColor('#ffffff'));
        acceptBtn.on('pointerout', () => acceptBtn.setColor('#88cc88'));
        acceptBtn.on('pointerdown', () => {
            gs.party.push(PartySystem.createFish(species.id));
            this.children.removeAll();
            this.buildFloorUI();
        });

        const declineBtn = this.add.text(W / 2 + 60, H * 0.7, '[ DECLINE ]',
            makeStyle(TEXT_STYLES.BUTTON, { color: '#888888' })
        ).setOrigin(0.5).setInteractive({ useHandCursor: true });
        declineBtn.on('pointerover', () => declineBtn.setColor('#ffffff'));
        declineBtn.on('pointerout', () => declineBtn.setColor('#888888'));
        declineBtn.on('pointerdown', () => {
            this.children.removeAll();
            this.buildFloorUI();
        });
    }

    showItemReward(itemId) {
        const W = this.scale.width;
        const H = this.scale.height;
        const gs = this.gameState;
        const item = ITEMS[itemId];

        this.add.text(W / 2, H * 0.4, 'You found a ' + item.name + '!',
            makeStyle(TEXT_STYLES.BODY, { fontSize: '14px' })
        ).setOrigin(0.5);

        const takeBtn = this.add.text(W / 2, H * 0.6, '[ TAKE ]',
            makeStyle(TEXT_STYLES.BUTTON, { fontSize: '15px', color: '#88cc88' })
        ).setOrigin(0.5).setInteractive({ useHandCursor: true });
        takeBtn.on('pointerover', () => takeBtn.setColor('#ffffff'));
        takeBtn.on('pointerout', () => takeBtn.setColor('#88cc88'));
        takeBtn.on('pointerdown', () => {
            if (gs.inventory.length < MAX_INVENTORY) {
                gs.inventory.push(itemId);
            }
            this.children.removeAll();
            this.buildFloorUI();
        });
    }
}
