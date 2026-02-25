import ConfigLoader from '../systems/ConfigLoader.js';
import SaveSystem from '../systems/SaveSystem.js';
import PartySystem from '../systems/PartySystem.js';
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
        const panelH = 72 + gs.party.length * 18;
        const panelMargin = 8;
        const infoPanelTheme = { ...zone };
        delete infoPanelTheme.compositeKey;
        delete infoPanelTheme.pieceSize;
        infoPanelTheme.atlasKey = zone.atlasKey + '_sm';
        // Translucent fill behind hollow atlas border
        this.add.rectangle(W / 2, panelH / 2, W - panelMargin * 2, panelH, 0x000000, 0.5)
            .setDepth(0).setScrollFactor(0);
        new UIPanel(this, {
            x: panelMargin, y: 0, width: W - panelMargin * 2, height: panelH,
            theme: infoPanelTheme, cornerSize: 10, padding: 0, alpha: 1, fx: false
        });

        // Gold + Inventory
        const character = getCharacterTheme(gs.fisherId);
        this.add.text(W / 2, 34, 'Gold: ' + gs.gold + '   Items: ' + gs.inventory.length + '/' + MAX_INVENTORY,
            makeStyle(TEXT_STYLES.GOLD, { fontSize: '12px', color: accentHex(character) })
        ).setOrigin(0.5).setDepth(2);

        // Party display with HP bars
        const isPortrait = this.registry.get('isPortrait');
        const barX = isPortrait ? Math.floor(W * 0.4) : 120;
        const barW = isPortrait ? Math.floor(W * 0.22) : 60;

        const partyList = new UIList(this, { x: 10, y: 48, spacing: 18 });
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

        // Flavor text — centered between shop and camp cards
        const flavorY = topY + cardH / 2;
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

        cards.forEach((card, cardIndex) => {
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
            const panel = new UIPanel(this, {
                x: cx, y: cy, width: cardW, height: cardH,
                theme: cardTheme, depth: 2, padding: 0, cornerSize: 10, fx: false
            });

            // Card image — flush against top border, inset at bottom for label
            const topInset = 2;
            const bottomInset = 10;
            const sideInset = 10;

            // Dark scrim inside card border for image contrast
            const scrimX = cx + sideInset;
            const scrimY = cy + topInset;
            const scrimW = cardW - sideInset * 2;
            const scrimH = cardH - topInset - bottomInset;
            const cardScrim = this.add.rectangle(scrimX + scrimW / 2, scrimY + scrimH / 2, scrimW, scrimH, 0x000000, 0.5)
                .setDepth(2.5).setScrollFactor(0);

            const contentH = cardH - topInset - bottomInset;
            const img = this.add.image(midX, cy + topInset + contentH / 2, card.key);
            const baseImgScale = Math.min((cardW - sideInset * 2) / img.width, contentH / img.height);
            img.setScale(baseImgScale).setDepth(3).setScrollFactor(0);

            const labelY = cy + cardH - bottomInset - 7;
            const label = this.add.text(midX, labelY, card.label,
                makeStyle(TEXT_STYLES.BUTTON, { fontSize: '10px', color: card.color, stroke: '#000000', strokeThickness: 2 })
            ).setOrigin(0.5).setDepth(4);

            // Scrim behind label for readability
            const lw = label.displayWidth + 8;
            const lh = label.displayHeight + 4;
            const labelScrim = this.add.rectangle(midX, labelY, lw, lh, 0x000000, 0.5)
                .setOrigin(0.5).setDepth(3.5).setScrollFactor(0);

            // Personality overlay — stays invisible until entrance completes
            let personalityOverlay = null;
            if (card.type === 'delve') {
                personalityOverlay = this.add.rectangle(midX, midY, cardW, cardH, 0x880000, 0)
                    .setDepth(4.5).setScrollFactor(0);
            } else if (card.type === 'camp') {
                personalityOverlay = this.add.rectangle(midX, midY, cardW, cardH, 0x886622, 0)
                    .setDepth(4.5).setScrollFactor(0);
            }

            // Collect visual elements for animation
            const uiElements = [panel.bg, cardScrim, label, labelScrim];
            if (personalityOverlay) uiElements.push(personalityOverlay);
            const allElements = [...uiElements, img];

            // --- Slide-in entrance animation ---
            const entranceDelay = cardIndex * 150;
            let slideX = 0, slideY = 0;
            if (card.type === 'shop') { slideX = -W * 0.5; }
            else if (card.type === 'delve') { slideY = H * 0.8; }
            else if (card.type === 'camp') { slideX = W * 0.5; }

            allElements.forEach(el => {
                el.setAlpha(0);
                el.x += slideX;
                el.y += slideY;
            });

            this.tweens.add({
                targets: allElements,
                x: `-=${slideX}`,
                y: `-=${slideY}`,
                duration: 400,
                ease: 'Back.easeOut',
                delay: entranceDelay,
                onComplete: () => {
                    this.time.delayedCall(500, () => {
                        this._startPersonality(card.type, personalityOverlay, scrimX, scrimY, scrimW, scrimH);
                    });
                }
            });
            this.tweens.add({
                targets: [panel.bg, cardScrim, label, labelScrim, img],
                alpha: 1,
                duration: 200,
                delay: entranceDelay
            });
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

            // --- Hover feedback: scale + tint ---
            hit.on('pointerover', () => {
                label.setTint(0xffffff);
                img.setTint(0xdddddd);
                this.tweens.add({
                    targets: uiElements,
                    scaleX: 1.05, scaleY: 1.05,
                    duration: 150, ease: 'Sine.easeOut'
                });
                this.tweens.add({
                    targets: img,
                    scaleX: baseImgScale * 1.05, scaleY: baseImgScale * 1.05,
                    duration: 150, ease: 'Sine.easeOut'
                });
            });
            hit.on('pointerout', () => {
                label.clearTint();
                img.clearTint();
                this.tweens.add({
                    targets: uiElements,
                    scaleX: 1, scaleY: 1,
                    duration: 150, ease: 'Sine.easeOut'
                });
                this.tweens.add({
                    targets: img,
                    scaleX: baseImgScale, scaleY: baseImgScale,
                    duration: 150, ease: 'Sine.easeOut'
                });
            });

            if (card.type === 'delve') {
                hit.on('pointerdown', () => {
                    const monster = this._generateMonster(gs.floor);
                    this._transitionTo('delve', () => this.scene.start('BattleScene', { gameState: gs, monster }));
                });
            } else if (card.type === 'shop') {
                hit.on('pointerdown', () => {
                    this._transitionTo('shop', () => {
                        gs.nextShopFloor = gs.floor + 1 + Math.floor(Math.random() * 3);
                        this.scene.start('ShopScene', { gameState: gs });
                    });
                });
            } else if (card.type === 'camp') {
                hit.on('pointerdown', () => {
                    this._transitionTo('camp', () => this.scene.start('CampScene', { gameState: gs }));
                });
            }
        });

        // Floor counter — bottom center with atlas border
        const floorLabel = this.add.text(W / 2, 0, 'Floor ' + gs.floor,
            makeStyle(TEXT_STYLES.TITLE_MEDIUM, { fontSize: '14px', color: accentHex(zone) })
        ).setOrigin(0.5).setDepth(8);
        const floorPadX = 16;
        const floorPanelW = floorLabel.displayWidth + floorPadX * 2;
        const floorPanelX = W / 2 - floorPanelW / 2;
        const floorLabelY = H - 5 - floorLabel.displayHeight / 2;
        const floorPanelY = floorLabelY - floorLabel.displayHeight / 2 - 5 - 10;
        floorLabel.setPosition(W / 2, floorLabelY);
        const floorTheme = { ...zone };
        delete floorTheme.compositeKey;
        delete floorTheme.pieceSize;
        floorTheme.atlasKey = zone.atlasKey + '_sm';
        // Scrim behind floor counter for readability
        this.add.rectangle(W / 2, (floorPanelY + H + 20) / 2, floorPanelW, H - floorPanelY + 20, 0x000000, 0.6)
            .setDepth(6).setScrollFactor(0);
        new UIPanel(this, {
            x: floorPanelX, y: floorPanelY, width: floorPanelW, height: H - floorPanelY + 20,
            theme: floorTheme, depth: 7, padding: 0, cornerSize: 10, fx: false
        });

    }

    _generateMonster(floor) {
        const allMonsters = ConfigLoader.getAllMonsters();
        const available = Object.values(allMonsters).filter(m => floor >= m.floorRange[0] && floor <= m.floorRange[1]);
        const template = available[Math.floor(Math.random() * available.length)];
        const s = template.statScaling;
        return {
            id: template.id,
            name: template.name,
            color: Number(template.color),
            hp: Math.floor(s.hp.base + floor * s.hp.perFloor),
            maxHp: Math.floor(s.hp.base + floor * s.hp.perFloor),
            atk: Math.floor(s.atk.base + floor * s.atk.perFloor),
            def: Math.floor(s.def.base + floor * s.def.perFloor),
            spd: Math.floor(s.spd.base + floor * s.spd.perFloor),
            specialMove: template.specialMove,
            goldReward: Math.floor(template.goldReward.base + floor * template.goldReward.perFloor),
            xpReward: Math.floor(template.xpReward.base + floor * template.xpReward.perFloor)
        };
    }

    _startPersonality(type, overlay, scrimX, scrimY, scrimW, scrimH) {
        if (type === 'delve' && overlay) {
            this.tweens.add({
                targets: overlay,
                alpha: { from: 0, to: 0.4 },
                duration: 1500,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
        } else if (type === 'shop') {
            if (this.textures.exists('particle_dot')) {
                this.add.particles(0, 0, 'particle_dot', {
                    x: { min: scrimX, max: scrimX + scrimW },
                    y: { min: scrimY, max: scrimY + scrimH },
                    lifespan: 1200,
                    frequency: 800,
                    quantity: 2,
                    scale: { start: 0.8, end: 0 },
                    alpha: { start: 1.0, end: 0 },
                    speedY: { min: -15, max: -5 },
                    speedX: { min: -3, max: 3 },
                    tint: [0xffd700, 0xffee88, 0xffffff],
                    blendMode: 'ADD',
                    depth: 4.5
                }).setScrollFactor(0);
            } else {
                console.warn('particle_dot texture missing — shop sparkles disabled');
            }
        } else if (type === 'camp' && overlay) {
            const flicker = () => {
                if (!overlay.scene) return;
                const targetAlpha = 0.15 + Math.random() * 0.3;
                const duration = 200 + Math.random() * 200;
                this.tweens.add({
                    targets: overlay,
                    alpha: targetAlpha,
                    duration: duration,
                    ease: 'Sine.easeInOut',
                    onComplete: flicker
                });
            };
            flicker();
        }
    }

    _transitionTo(type, callback) {
        // Disable all hit zones to prevent double-clicks
        this.input.enabled = false;

        const W = this.scale.width;
        const H = this.scale.height;

        if (type === 'delve') {
            // Aggressive: camera shake → white flash → fade to black
            this.cameras.main.shake(200, 0.01);
            this.time.delayedCall(200, () => {
                const flash = this.add.rectangle(W / 2, H / 2, W + 20, H + 20, 0xffffff, 0)
                    .setDepth(100).setScrollFactor(0);
                this.tweens.add({
                    targets: flash,
                    alpha: 1,
                    duration: 100,
                    onComplete: () => {
                        flash.setFillStyle(0x000000, 0);
                        const black = this.add.rectangle(W / 2, H / 2, W + 20, H + 20, 0x000000, 0)
                            .setDepth(101).setScrollFactor(0);
                        this.tweens.add({
                            targets: black,
                            alpha: 1,
                            duration: 300,
                            onComplete: () => callback()
                        });
                    }
                });
            });
        } else if (type === 'shop') {
            // Calm dissolve: smooth fade to black
            const black = this.add.rectangle(W / 2, H / 2, W + 20, H + 20, 0x000000, 0)
                .setDepth(100).setScrollFactor(0);
            this.tweens.add({
                targets: black,
                alpha: 1,
                duration: 500,
                ease: 'Sine.InOut',
                onComplete: () => callback()
            });
        } else if (type === 'camp') {
            // Warm fade: amber → black
            const warm = this.add.rectangle(W / 2, H / 2, W + 20, H + 20, 0x442200, 0)
                .setDepth(100).setScrollFactor(0);
            this.tweens.add({
                targets: warm,
                alpha: 1,
                duration: 400,
                ease: 'Sine.InOut',
                onComplete: () => {
                    const black = this.add.rectangle(W / 2, H / 2, W + 20, H + 20, 0x000000, 0)
                        .setDepth(101).setScrollFactor(0);
                    this.tweens.add({
                        targets: black,
                        alpha: 1,
                        duration: 300,
                        ease: 'Sine.InOut',
                        onComplete: () => callback()
                    });
                }
            });
        }
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
            const available = Object.values(ConfigLoader.getAllFish()).filter(s => !ownedIds.includes(s.id));
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
