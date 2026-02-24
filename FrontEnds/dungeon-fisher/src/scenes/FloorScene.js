import { generateMonster } from '../data/monsters.js';
import SaveSystem from '../systems/SaveSystem.js';
import PartySystem from '../systems/PartySystem.js';
import FISH_SPECIES from '../data/fish.js';
import { ITEMS, MAX_INVENTORY } from '../data/items.js';
import { getBackgroundKey, getShopCardKey, getShopName } from '../utils/zones.js';
import { getZoneByFloor, getCharacterTheme, accentHex } from '../data/themes.js';
import SpriteAnimator from '../effects/SpriteAnimator.js';
import WaterEffect from '../effects/WaterEffect.js';
import { TEXT_STYLES, makeStyle } from '../constants/textStyles.js';
import { loadZoneTheme, unloadZoneTheme } from '../systems/ThemeAssetLoader.js';
import { UIPanel, UIButton, UIList, UILayout } from '../ui/index.js';

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
        UILayout.sceneBackground(this, bgKey, { effects: true });

        const zone = getZoneByFloor(gs.floor);
        this.registry.set('currentZone', zone);
        this.registry.set('currentCharacter', getCharacterTheme(gs.fisherId));

        // Top info panel
        const panelH = 48 + gs.party.length * 18;
        const panelMargin = 8;
        const infoPanelTheme = zone.wideAtlasKey && this.textures.exists(zone.wideAtlasKey)
            ? { ...zone, atlasKey: zone.wideAtlasKey }
            : zone;
        new UIPanel(this, {
            x: panelMargin, y: 0, width: W - panelMargin * 2, height: panelH,
            theme: infoPanelTheme, cornerSize: 10, padding: 0
        });

        // Floor title
        this.add.text(W / 2, 14, 'Floor ' + gs.floor + ' / 100',
            makeStyle(TEXT_STYLES.TITLE_MEDIUM, { fontSize: '16px', color: accentHex(zone) })
        ).setOrigin(0.5).setDepth(2);

        // Gold + Inventory
        const character = getCharacterTheme(gs.fisherId);
        this.add.text(W / 2, 30, 'Gold: ' + gs.gold + '   Items: ' + gs.inventory.length + '/' + MAX_INVENTORY,
            makeStyle(TEXT_STYLES.GOLD, { fontSize: '12px', color: accentHex(character) })
        ).setOrigin(0.5).setDepth(2);

        // Party display with HP bars
        const isPortrait = this.registry.get('isPortrait');
        const barX = isPortrait ? Math.floor(W * 0.4) : 120;
        const barW = isPortrait ? Math.floor(W * 0.22) : 60;

        const partyList = new UIList(this, { x: 10, y: 42, spacing: 18 });
        gs.party.forEach(fish => {
            const alive = fish.hp > 0;
            partyList.addRow((x, y) => {
                const row = [];
                row.push(this.add.text(x, y, fish.name + ' Lv.' + fish.level,
                    makeStyle(TEXT_STYLES.BODY_SMALL, { color: alive ? '#88ccff' : '#cc4444' })
                ).setDepth(2));

                // HP bar background
                row.push(this.add.graphics().fillStyle(0x333333, 1).fillRect(barX, y + 1, barW, 6).setDepth(2));

                // HP bar fill
                if (alive) {
                    const ratio = Math.max(0, fish.hp / fish.maxHp);
                    const color = ratio > 0.5 ? 0x33cc33 : ratio > 0.25 ? 0xcccc33 : 0xcc3333;
                    row.push(this.add.graphics().fillStyle(color, 1).fillRect(barX, y + 1, ratio * barW, 6).setDepth(2));
                }

                // HP text
                row.push(this.add.text(barX + barW + 5, y, alive ? fish.hp + '/' + fish.maxHp : 'FAINTED',
                    makeStyle(TEXT_STYLES.BODY_SMALL, { color: alive ? '#aaaaaa' : '#cc4444' })
                ).setDepth(2));
                return row;
            });
        });

        // Flavor text — centered in background (archway area)
        const flavorY = Math.floor(H * 0.42);
        const flavorTxt = this.add.text(W / 2, flavorY, getZoneByFloor(gs.floor).flavor,
            makeStyle(TEXT_STYLES.FLAVOR, {
                color: '#ffffff',
                fontSize: '14px',
                align: 'center',
                wordWrap: { width: 100 }
            })
        ).setOrigin(0.5).setDepth(6);

        // Animated scrim layers behind flavor text
        const fw = flavorTxt.displayWidth;
        const fh = flavorTxt.displayHeight;
        const fpad = 6;

        // Outer soft glow (largest, most transparent)
        const vign3 = this.add.rectangle(W / 2, flavorY, fw + fpad * 6, fh + fpad * 6, 0x000000, 0.15)
            .setDepth(3);
        // Middle layer
        const vign2 = this.add.rectangle(W / 2, flavorY, fw + fpad * 4, fh + fpad * 4, 0x000000, 0.25)
            .setDepth(3);
        // Inner layer (darkest)
        const scrim = this.add.rectangle(W / 2, flavorY, fw + fpad * 2, fh + fpad * 2, 0x000000, 0.45)
            .setDepth(5);

        // Zone-colored glow border
        const accentColor = zone.panel.accent;
        const glowBorder = this.add.rectangle(W / 2, flavorY, fw + fpad * 3, fh + fpad * 3, accentColor, 0.2)
            .setDepth(4);

        // Expanding reveal — scrim layers start collapsed, expand out
        [vign3, vign2, scrim, glowBorder].forEach(r => r.setScale(0, 1));
        flavorTxt.setAlpha(0);

        this.tweens.add({
            targets: [scrim, vign2, vign3, glowBorder],
            scaleX: 1,
            duration: 600,
            ease: 'Back.easeOut',
            onComplete: () => {
                this.tweens.add({ targets: flavorTxt, alpha: 1, duration: 400 });
            }
        });

        // Breathing pulse — scrim alpha oscillates slowly
        this.tweens.add({
            targets: scrim,
            alpha: { from: 0.35, to: 0.55 },
            duration: 2000,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        this.tweens.add({
            targets: glowBorder,
            alpha: { from: 0.1, to: 0.3 },
            duration: 2000,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        // Floating drift — scrim + text bob gently
        const floatTargets = [vign3, vign2, scrim, glowBorder, flavorTxt];
        this.tweens.add({
            targets: floatTargets,
            y: '-=2',
            duration: 2500,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        // Warm shimmer sweep
        this.tweens.addCounter({
            from: 0, to: Math.PI * 2,
            duration: 3000,
            repeat: -1,
            onUpdate: (tween) => {
                const p = tween.getValue();
                const l1 = 0.5 + 0.5 * Math.sin(p);
                const l2 = 0.5 + 0.5 * Math.sin(p - 1.5);
                const s = zone.shimmer;
                const c1 = Phaser.Display.Color.GetColor(s.base[0] + l1 * s.range[0], s.base[1] + l1 * s.range[1], s.base[2] + l1 * s.range[2]);
                const c2 = Phaser.Display.Color.GetColor(s.base[0] + l2 * s.range[0], s.base[1] + l2 * s.range[1], s.base[2] + l2 * s.range[2]);
                flavorTxt.setTint(c1, c2, c1, c2);
            }
        });

        // Action cards
        const shopAvailable = gs.floor >= (gs.nextShopFloor || 1);
        const cards = [
            { type: 'delve', key: 'card_delve', label: 'Delve Deeper', color: '#ffcc88',
              shimmer: { base: [230, 180, 110], range: [25, 50, 40] } },
        ];
        if (shopAvailable) {
            cards.push({ type: 'shop', key: getShopCardKey(gs.floor), label: getShopName(gs.floor), color: '#ffdd66',
                shimmer: { base: [230, 210, 80], range: [25, 45, 40] } });
        }
        cards.push({ type: 'camp', key: 'card_camp', label: 'Make Camp', color: '#bbee88',
            shimmer: { base: [140, 230, 120], range: [30, 25, 30] } });

        const cardH = Math.min(84, H - partyList.bottomY - 50);
        const cardW = Math.floor(cardH * 0.85);

        const margin = 8;
        const delveY = Math.floor(H * 0.74) - cardH / 2;
        const topY = delveY - cardH - 8;

        const positions = {
            'shop':  { x: margin, y: topY },
            'delve': { x: Math.floor((W - cardW) / 2), y: delveY },
            'camp':  { x: W - cardW - margin, y: topY }
        };

        cards.forEach((card) => {
            const pos = positions[card.type];
            const cx = pos.x;
            const cy = pos.y;
            const midX = cx + cardW / 2;
            const midY = cy + cardH / 2;

            // Nineslice panel with thin-border atlas — sized for small cards
            const cardTheme = { ...zone };
            delete cardTheme.compositeKey;
            delete cardTheme.pieceSize;
            cardTheme.atlasKey = 'atlas_sewers_sm';
            new UIPanel(this, {
                x: cx, y: cy, width: cardW, height: cardH,
                theme: cardTheme, depth: 2, padding: 0, cornerSize: 10
            });

            // Card image — on top of panel, inset to show border
            const inset = 10;
            const contentH = cardH - inset * 2;
            const img = this.add.image(midX, cy + inset + contentH / 2, card.key);
            const imgScale = Math.min((cardW - inset * 2) / img.width, contentH / img.height);
            img.setScale(imgScale).setDepth(3).setScrollFactor(0);

            const labelY = cy + cardH - inset - 7;
            const label = this.add.text(midX, labelY, card.label,
                makeStyle(TEXT_STYLES.BUTTON, { fontSize: '10px', color: card.color, stroke: '#000000', strokeThickness: 2 })
            ).setOrigin(0.5).setDepth(4);
            // Per-card shimmer tween
            const sh = card.shimmer;
            this.tweens.addCounter({
                from: 0, to: Math.PI * 2,
                duration: 3000,
                repeat: -1,
                onUpdate: (tween) => {
                    const p = tween.getValue();
                    const l1 = 0.5 + 0.5 * Math.sin(p);
                    const l2 = 0.5 + 0.5 * Math.sin(p - 1.5);
                    const c1 = Phaser.Display.Color.GetColor(sh.base[0] + l1 * sh.range[0], sh.base[1] + l1 * sh.range[1], sh.base[2] + l1 * sh.range[2]);
                    const c2 = Phaser.Display.Color.GetColor(sh.base[0] + l2 * sh.range[0], sh.base[1] + l2 * sh.range[1], sh.base[2] + l2 * sh.range[2]);
                    label.setTint(c1, c2, c1, c2);
                }
            });

            // Hit zone
            const hit = this.add.rectangle(midX, midY, cardW, cardH, 0xffffff, 0)
                .setDepth(5).setInteractive({ useHandCursor: true });

            hit.on('pointerover', () => {
                label.setTint(0xffffff);
                img.setTint(0xdddddd);
            });
            hit.on('pointerout', () => {
                label.clearTint();
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
        UILayout.sceneBackground(this, bgKey, { effects: true });
        UILayout.overlay(this, { alpha: 0.4, depth: 0 });

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

        UIButton.create(this, {
            x: W / 2 - 60, y: H * 0.7,
            label: '[ ACCEPT ]',
            style: makeStyle(TEXT_STYLES.BUTTON),
            color: '#88cc88',
            hoverColor: '#ffffff',
            onClick: () => {
                gs.party.push(PartySystem.createFish(species.id));
                this.children.removeAll();
                this.buildFloorUI();
            }
        });

        UIButton.create(this, {
            x: W / 2 + 60, y: H * 0.7,
            label: '[ DECLINE ]',
            style: makeStyle(TEXT_STYLES.BUTTON),
            color: '#888888',
            hoverColor: '#ffffff',
            onClick: () => {
                this.children.removeAll();
                this.buildFloorUI();
            }
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

        UIButton.create(this, {
            x: W / 2, y: H * 0.6,
            label: '[ TAKE ]',
            style: makeStyle(TEXT_STYLES.BUTTON, { fontSize: '15px' }),
            color: '#88cc88',
            hoverColor: '#ffffff',
            onClick: () => {
                if (gs.inventory.length < MAX_INVENTORY) {
                    gs.inventory.push(itemId);
                }
                this.children.removeAll();
                this.buildFloorUI();
            }
        });
    }
}
