import ConfigLoader from '../systems/ConfigLoader.js';
import SaveSystem from '../systems/SaveSystem.js';
import PartySystem from '../systems/PartySystem.js';
import EncounterSystem from '../systems/EncounterSystem.js';
import EconomySystem from '../systems/EconomySystem.js';
import EquipmentSystem from '../systems/EquipmentSystem.js';
import { generateGhostParty } from '../systems/GhostGenerator.js';
import { ITEMS, MAX_INVENTORY } from '../data/items.js';
import { getBackgroundKey, getShopCardKey, getShopName } from '../utils/zones.js';
import { getZoneByFloor, getCharacterTheme, accentHex } from '../data/themes.js';
import SpriteAnimator from '../effects/SpriteAnimator.js';
import WaterEffect from '../effects/WaterEffect.js';
import { TEXT_STYLES, makeStyle } from '../constants/textStyles.js';
import { loadZoneTheme, unloadZoneTheme } from '../systems/ThemeAssetLoader.js';
import { UIButton, UIPanel, UIList, UILayout } from '../ui/index.js';

export default class FloorScene extends Phaser.Scene {
    constructor() {
        super('FloorScene');
    }

    init(data) {
        this.gameState = data.gameState;
        this.result = data.result || null;
        this.isPvp = data.isPvp || false;
    }

    create() {
        const gs = this.gameState;
        SaveSystem.save(gs);

        const zone = getZoneByFloor(gs.floor);

        const prevZone = this.registry.get('previousZone');
        if (prevZone && prevZone.id !== zone.id) {
            unloadZoneTheme(this, prevZone);
        }
        this.registry.set('previousZone', zone);

        loadZoneTheme(this, zone, () => this._onZoneReady());
    }

    _onZoneReady() {
        const gs = this.gameState;
        const zone = getZoneByFloor(gs.floor);
        this.registry.set('currentZone', zone);
        this.registry.set('currentCharacter', getCharacterTheme(gs.fisherId));

        // Reset PvE death counter at zone start
        const config = ConfigLoader.getEncounterConfig();
        if (gs.floor % config.floorsPerZone === 1) {
            gs.pveDeathCount = 0;
        }

        // Handle defeat
        if (this.result === 'party_dead') {
            this._handleDefeat();
            return;
        }

        // Handle victory — set up transitions if any, then show zone hub
        if (this.result === 'victory') {
            const floorInZone = EncounterSystem.getFloorInZone(gs.floor);
            const transitions = EncounterSystem.getTransitions(floorInZone);
            if (transitions.length > 0) {
                gs._transitionQueue = transitions;
                gs._pendingAdvance = true;
            }
            // Show zone hub — cards reflect available transitions
            if (gs._pendingAdvance) {
                this._showZoneView();
            } else {
                this._advanceAndRoute();
            }
            return;
        }

        // Returning from transition — show hub with remaining cards
        if (gs._transitionQueue && gs._transitionQueue.length > 0) {
            this._showZoneView();
            return;
        }

        // All transitions done — advance if pending
        if (gs._pendingAdvance) {
            delete gs._pendingAdvance;
            this._advanceAndRoute();
            return;
        }

        // Fresh entry — show zone hub
        this._showZoneView();
    }

    _advanceAndRoute() {
        const gs = this.gameState;
        gs.floor++;

        if (gs.floor > 100) {
            this.scene.start('VictoryScene', { gameState: gs });
            return;
        }

        // Floor reward every 10 floors
        if (gs.floor > 1 && gs.floor % 10 === 0) {
            this._showFloorReward();
            return;
        }

        this._showZoneView();
    }

    _showZoneView() {
        this.children.removeAll();
        this.tweens.killAll();

        const W = this.scale.width;
        const H = this.scale.height;
        const gs = this.gameState;

        // Zone background
        const bgKey = getBackgroundKey(gs.floor);
        UILayout.sceneBackground(this, bgKey, { effects: true });

        const zone = getZoneByFloor(gs.floor);

        // Top info panel with sm atlas border
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

        // Action cards — adapted for encounter system
        const cards = [
            { type: 'delve', key: 'card_delve', label: 'Delve Deeper', color: '#ffcc88',
              shimmer: { base: [230, 180, 110], range: [25, 50, 40] } },
        ];
        if (gs._transitionQueue && gs._transitionQueue.includes('shop')) {
            cards.push({ type: 'shop', key: getShopCardKey(gs.floor), label: getShopName(gs.floor), color: '#ffdd66',
                shimmer: { base: [230, 210, 80], range: [25, 45, 40] } });
        }
        if (gs._transitionQueue && gs._transitionQueue.includes('camp')) {
            cards.push({ type: 'camp', key: 'card_camp', label: 'Make Camp', color: '#bbee88',
                shimmer: { base: [140, 230, 120], range: [30, 25, 30] } });
        }

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

            // Nineslice panel with thin-border atlas
            const cardTheme = { ...zone };
            delete cardTheme.compositeKey;
            delete cardTheme.pieceSize;
            cardTheme.atlasKey = zone.atlasKey + '_sm';
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

            // Card click handlers — adapted for encounter system
            if (card.type === 'delve') {
                hit.on('pointerdown', () => {
                    this._transitionTo('delve', () => {
                        if (gs._pendingAdvance) {
                            delete gs._transitionQueue;
                            delete gs._pendingAdvance;
                            gs.floor++;
                            if (gs.floor > 100) {
                                this.scene.start('VictoryScene', { gameState: gs });
                                return;
                            }
                            if (gs.floor > 1 && gs.floor % 10 === 0) {
                                this._showFloorReward();
                                return;
                            }
                        }
                        this._startEncounter();
                    });
                });
            } else if (card.type === 'shop') {
                hit.on('pointerdown', () => {
                    this._transitionTo('shop', () => {
                        if (gs._transitionQueue) {
                            const idx = gs._transitionQueue.indexOf('shop');
                            if (idx !== -1) gs._transitionQueue.splice(idx, 1);
                        }
                        this.scene.start('ShopScene', { gameState: gs });
                    });
                });
            } else if (card.type === 'camp') {
                hit.on('pointerdown', () => {
                    this._transitionTo('camp', () => {
                        if (gs._transitionQueue) {
                            const idx = gs._transitionQueue.indexOf('camp');
                            if (idx !== -1) gs._transitionQueue.splice(idx, 1);
                        }
                        this.scene.start('CampScene', { gameState: gs });
                    });
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

    _transitionTo(type, callback) {
        this.input.enabled = false;
        const W = this.scale.width;
        const H = this.scale.height;

        if (type === 'delve') {
            this.cameras.main.shake(200, 0.01);
            this.time.delayedCall(200, () => {
                const flash = this.add.rectangle(W / 2, H / 2, W + 20, H + 20, 0xffffff, 0)
                    .setDepth(100).setScrollFactor(0);
                this.tweens.add({
                    targets: flash, alpha: 1, duration: 100,
                    onComplete: () => {
                        flash.setFillStyle(0x000000, 0);
                        const black = this.add.rectangle(W / 2, H / 2, W + 20, H + 20, 0x000000, 0)
                            .setDepth(101).setScrollFactor(0);
                        this.tweens.add({ targets: black, alpha: 1, duration: 300, onComplete: () => callback() });
                    }
                });
            });
        } else if (type === 'shop') {
            const black = this.add.rectangle(W / 2, H / 2, W + 20, H + 20, 0x000000, 0)
                .setDepth(100).setScrollFactor(0);
            this.tweens.add({ targets: black, alpha: 1, duration: 500, ease: 'Sine.InOut', onComplete: () => callback() });
        } else if (type === 'camp') {
            const warm = this.add.rectangle(W / 2, H / 2, W + 20, H + 20, 0x442200, 0)
                .setDepth(100).setScrollFactor(0);
            this.tweens.add({
                targets: warm, alpha: 1, duration: 400, ease: 'Sine.InOut',
                onComplete: () => {
                    const black = this.add.rectangle(W / 2, H / 2, W + 20, H + 20, 0x000000, 0)
                        .setDepth(101).setScrollFactor(0);
                    this.tweens.add({ targets: black, alpha: 1, duration: 300, ease: 'Sine.InOut', onComplete: () => callback() });
                }
            });
        }
    }

    _startPersonality(type, overlay, scrimX, scrimY, scrimW, scrimH) {
        if (type === 'delve' && overlay) {
            this.tweens.add({
                targets: overlay,
                alpha: { from: 0, to: 0.4 },
                duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
            });
        } else if (type === 'shop') {
            if (this.textures.exists('particle_dot')) {
                this.add.particles(0, 0, 'particle_dot', {
                    x: { min: scrimX, max: scrimX + scrimW },
                    y: { min: scrimY, max: scrimY + scrimH },
                    lifespan: 1200, frequency: 800, quantity: 2,
                    scale: { start: 0.8, end: 0 }, alpha: { start: 1.0, end: 0 },
                    speedY: { min: -15, max: -5 }, speedX: { min: -3, max: 3 },
                    tint: [0xffd700, 0xffee88, 0xffffff],
                    blendMode: 'ADD', depth: 4.5
                }).setScrollFactor(0);
            }
        } else if (type === 'camp' && overlay) {
            const flicker = () => {
                if (!overlay.scene) return;
                const targetAlpha = 0.15 + Math.random() * 0.3;
                const duration = 200 + Math.random() * 200;
                this.tweens.add({
                    targets: overlay, alpha: targetAlpha,
                    duration, ease: 'Sine.easeInOut', onComplete: flicker
                });
            };
            flicker();
        }
    }

    _startEncounter() {
        const gs = this.gameState;

        if (gs.floor > 100) {
            this.scene.start('VictoryScene', { gameState: gs });
            return;
        }

        const encounterType = EncounterSystem.getEncounterType(gs.floor);

        if (encounterType === 'pvp') {
            this._startPvpEncounter();
            return;
        }

        let monsters;
        if (encounterType === 'boss') {
            monsters = [EncounterSystem.generateBoss(gs.floor)];
        } else {
            monsters = EncounterSystem.generatePack(gs.floor);
        }

        this.scene.start('BattleScene', { gameState: gs, monsters });
    }

    _startPvpEncounter() {
        const gs = this.gameState;
        const ghostConfig = generateGhostParty(gs.floor);

        const wrappedGhostParty = ghostConfig.fish.map(gf => {
            const fish = PartySystem.createFishAtLevel(gf.speciesId, gf.level);
            if (!fish) return null;
            return {
                id: fish.speciesId,
                speciesId: fish.speciesId,
                name: fish.name,
                color: fish.color,
                hp: fish.hp,
                maxHp: fish.maxHp,
                atk: fish.atk,
                def: fish.def,
                spd: fish.spd,
                shield: fish.shield || 0,
                maxShield: fish.maxShield || 0,
                healPower: fish.healPower || 0,
                specialMove: fish.moves[0],
                healingBehavior: null,
                goldReward: 0,
                xpReward: 0
            };
        }).filter(Boolean);

        if (wrappedGhostParty.length === 0) {
            this._advanceAndRoute();
            return;
        }

        this.scene.start('BattleScene', {
            gameState: gs,
            monsters: wrappedGhostParty,
            isPvp: true
        });
    }

    _handleDefeat() {
        const gs = this.gameState;
        const config = ConfigLoader.getEncounterConfig();

        if (this.isPvp) {
            // PvP loss
            gs.pvpLossCount = (gs.pvpLossCount || 0) + 1;
            gs.gold -= Math.floor(gs.gold * (config.pvpGoldLossPercent || 0.1));
            if (gs.gold < 0) gs.gold = 0;

            if (gs.pvpLossCount >= (config.maxPvpLosses || 4)) {
                this._roguelikeWipe();
                return;
            }

            // Clear combat state and advance to next zone
            for (const f of gs.party) PartySystem.clearCombatState(f);
            delete gs._transitionQueue;
            delete gs._pendingAdvance;
            this._advanceAndRoute();
        } else {
            // PvE death
            gs.pveDeathCount = (gs.pveDeathCount || 0) + 1;

            // Award half XP to living fish only
            const encounterType = EncounterSystem.getEncounterType(gs.floor);
            const rewards = EncounterSystem.calculateRewards(gs.floor, encounterType, 1);
            const halfXp = Math.floor(rewards.xp * (config.pveDeathXpMultiplier || 0.5));
            for (const f of gs.party) {
                if (f.hp > 0) {
                    PartySystem.awardXP(f, halfXp);
                }
            }
            if (gs.companion && gs.companion.hp > 0) {
                PartySystem.awardXP(gs.companion, halfXp);
            }

            // Equipment destruction — zone 6+ only (FR-13)
            if (gs.equipment && gs.equipment.grid.length > 0) {
                const zoneId = getZoneByFloor(gs.floor).id;
                const balance = ConfigLoader.getEquipmentBalance();
                const destructionChance = (balance.itemDestructionChance || {})[zoneId] || 0;
                if (destructionChance > 0) {
                    const deadIndices = gs.party
                        .map((f, i) => f.hp <= 0 ? i : -1)
                        .filter(i => i >= 0);
                    const atRiskItems = EquipmentSystem.getItemsTouchingPartyMembers(
                        gs.equipment.grid, deadIndices
                    ).filter(item => !item.indestructible);
                    if (atRiskItems.length > 0 && Math.random() < destructionChance) {
                        const victim = atRiskItems[Math.floor(Math.random() * atRiskItems.length)];
                        gs.equipment.grid = EquipmentSystem.removeItem(gs.equipment.grid, victim.itemId);
                    }
                }
            }

            // Full heal party
            for (const f of gs.party) PartySystem.fullHeal(f);
            if (gs.companion) PartySystem.fullHeal(gs.companion);

            // Set camp checkpoint
            gs.campFloor = gs.floor;

            if (gs.pveDeathCount >= (config.maxPveDeaths || 4)) {
                this._roguelikeWipe();
                return;
            }

            // Clear combat state and show post-battle results
            for (const f of gs.party) PartySystem.clearCombatState(f);
            delete gs._transitionQueue;
            delete gs._pendingAdvance;

            this._showPostBattleResults(halfXp, 0, true);
        }
    }

    _roguelikeWipe() {
        const gs = this.gameState;

        // Clear all equipment except Harmony on permadeath wipe (FR-17, AC-32)
        if (gs.equipment) {
            gs.equipment.grid = gs.equipment.grid.filter(item => item.itemId === 'harmony');
            const harmony = gs.equipment.grid.find(item => item.itemId === 'harmony');
            if (harmony) {
                harmony.col = 1;
                harmony.row = 4;
                harmony.rotation = 0;
                harmony.flipped = false;
            }
            gs.equipment.stash = [];
        }

        SaveSystem.deleteSave();

        const W = this.scale.width;
        const H = this.scale.height;

        this.children.removeAll();
        const bgKey = getBackgroundKey(gs.floor);
        UILayout.sceneBackground(this, bgKey, { effects: false });
        UILayout.overlay(this, { alpha: 0.7, depth: 0 });

        this.add.text(W / 2, H * 0.3, 'RUN ENDED',
            makeStyle(TEXT_STYLES.TITLE_MEDIUM, { color: '#ff4444' })
        ).setOrigin(0.5);

        const reason = (gs.pvpLossCount >= (ConfigLoader.getEncounterConfig().maxPvpLosses || 4))
            ? 'Too many PvP losses!'
            : 'Too many deaths!';
        this.add.text(W / 2, H * 0.45, reason,
            makeStyle(TEXT_STYLES.BODY, { color: '#cccccc' })
        ).setOrigin(0.5);

        this.add.text(W / 2, H * 0.55, 'Floor ' + gs.floor + ' reached',
            makeStyle(TEXT_STYLES.BODY_SMALL, { color: '#888888' })
        ).setOrigin(0.5);

        UIButton.create(this, {
            x: W / 2, y: H * 0.7,
            label: '[ TITLE SCREEN ]',
            style: TEXT_STYLES.BUTTON,
            hoverColor: '#ffffff',
            onClick: () => this.scene.start('TitleScene')
        });
    }

    _showPostBattleResults(xpGained, goldGained, wasDefeat) {
        const W = this.scale.width;
        const H = this.scale.height;
        const gs = this.gameState;
        const isPortrait = this.registry.get('isPortrait');

        this.children.removeAll();
        const bgKey = getBackgroundKey(gs.floor);
        UILayout.sceneBackground(this, bgKey, { effects: true });
        UILayout.overlay(this, { alpha: 0.5, depth: 0 });

        const headerText = wasDefeat ? 'Defeat...' : 'Victory!';
        const headerColor = wasDefeat ? '#ff8888' : '#88ff88';
        this.add.text(W / 2, H * 0.06, headerText,
            makeStyle(TEXT_STYLES.TITLE_MEDIUM, { fontSize: '16px', color: headerColor })
        ).setOrigin(0.5);

        // Rewards line
        const rewardParts = [];
        if (xpGained > 0) rewardParts.push('+' + xpGained + ' XP');
        if (goldGained > 0) rewardParts.push('+' + goldGained + 'g');
        if (wasDefeat) rewardParts.push('(half XP, no gold)');
        if (rewardParts.length > 0) {
            this.add.text(W / 2, H * 0.14, rewardParts.join('  '),
                makeStyle(TEXT_STYLES.BODY_SMALL, { color: '#aaaacc' })
            ).setOrigin(0.5);
        }

        // Party status
        const startY = H * 0.22;
        const spacing = isPortrait ? 30 : 24;
        gs.party.forEach((f, i) => {
            const y = startY + i * spacing;
            const alive = f.hp > 0;
            const color = alive ? '#ccccee' : '#ff6666';
            const status = alive ? `HP: ${f.hp}/${f.maxHp}` : 'FAINTED';
            this.add.text(10, y, `${f.name} - ${status}`,
                makeStyle(TEXT_STYLES.BODY_SMALL, { fontSize: '11px', color })
            );

            // HP bar
            const barX = isPortrait ? 10 : 180;
            const barY = y + (isPortrait ? 13 : 0);
            const barW = isPortrait ? W - 20 : 80;
            const barH = 4;
            this.add.rectangle(barX + barW / 2, barY + barH / 2, barW, barH, 0x333333);
            if (alive) {
                const fillW = (f.hp / f.maxHp) * barW;
                const hpColor = f.hp / f.maxHp > 0.5 ? 0x44ff44 : (f.hp / f.maxHp > 0.25 ? 0xffaa00 : 0xff4444);
                this.add.rectangle(barX + fillW / 2, barY + barH / 2, fillW, barH, hpColor);
            }
        });

        // Inventory items for use
        const itemStartY = startY + gs.party.length * spacing + 10;
        if (gs.inventory.length > 0) {
            this.add.text(10, itemStartY, 'USE ITEMS:',
                makeStyle(TEXT_STYLES.BODY_SMALL, { fontSize: '10px', color: '#888899' })
            );

            this._itemButtons = [];
            gs.inventory.forEach((itemId, idx) => {
                const item = ITEMS[itemId];
                if (!item) return;
                const y = itemStartY + 14 + idx * (isPortrait ? 18 : 15);

                this.add.text(10, y, `${item.name}`,
                    makeStyle(TEXT_STYLES.BODY_SMALL, { fontSize: '10px', color: '#aaaacc' })
                );

                const btn = UIButton.create(this, {
                    x: W - 30, y: y + 2,
                    label: 'USE',
                    style: makeStyle(TEXT_STYLES.BUTTON, { fontSize: '10px' }),
                    color: '#88cc88',
                    hoverColor: '#ffffff',
                    onClick: () => this._showTargetSelection(idx)
                });
                this._itemButtons.push(btn);
            });
        }

        // Continue button
        const continueY = Math.min(H * 0.88, itemStartY + (gs.inventory.length + 1) * 18 + 20);
        UIButton.create(this, {
            x: W / 2, y: continueY,
            label: '[ CONTINUE ]',
            style: makeStyle(TEXT_STYLES.BUTTON, { fontSize: '14px' }),
            hoverColor: '#ffffff',
            onClick: () => {
                this.children.removeAll();
                if (wasDefeat) {
                    this._advanceAndRoute();
                } else {
                    const floorInZone = EncounterSystem.getFloorInZone(gs.floor);
                    const transitions = EncounterSystem.getTransitions(floorInZone);
                    if (transitions.length > 0) {
                        gs._transitionQueue = transitions;
                        gs._pendingAdvance = true;
                    }
                    if (gs._pendingAdvance) {
                        this._showZoneView();
                    } else {
                        this._advanceAndRoute();
                    }
                }
            }
        });
    }

    _showTargetSelection(inventoryIndex) {
        const gs = this.gameState;
        const itemId = gs.inventory[inventoryIndex];
        const item = ITEMS[itemId];
        if (!item) return;

        if (this._targetModal) {
            for (const el of this._targetModal) el.destroy();
        }
        this._targetModal = [];

        const W = this.scale.width;
        const H = this.scale.height;

        const blocker = UILayout.overlay(this, { depth: 100, alpha: 0.6 });
        blocker.setInteractive();
        blocker.on('pointerdown', () => {});
        this._targetModal.push(blocker);

        const panelX = 20;
        const panelY = H * 0.25;
        const panelW = W - 40;
        const panelH = gs.party.length * 28 + 50;
        const zone = getZoneByFloor(gs.floor);
        const panel = new UIPanel(this, {
            x: panelX, y: panelY, width: panelW, height: panelH,
            theme: zone, alpha: 0.95, depth: 101, childDepth: 101, padding: 0
        });
        this._targetModal.push(panel);

        const header = this.add.text(W / 2, panelY + 8, 'Use ' + item.name + ' on:',
            makeStyle(TEXT_STYLES.BODY_SMALL, { color: '#ccccee' })
        ).setOrigin(0.5).setDepth(102);
        this._targetModal.push(header);

        gs.party.forEach((f, i) => {
            const y = panelY + 28 + i * 28;
            const canUse = this._canUseItemOn(item, f);
            const color = canUse ? '#ccccee' : '#555555';

            const txt = this.add.text(panelX + 10, y, `${f.name} (HP: ${f.hp}/${f.maxHp})`,
                makeStyle(TEXT_STYLES.BODY_SMALL, { fontSize: '11px', color })
            ).setDepth(102);
            this._targetModal.push(txt);

            if (canUse) {
                const btn = UIButton.create(this, {
                    x: panelX + panelW - 20, y: y + 2,
                    label: 'USE',
                    style: makeStyle(TEXT_STYLES.BUTTON, { fontSize: '10px' }),
                    depth: 102,
                    color: '#88cc88',
                    hoverColor: '#ffffff',
                    onClick: () => {
                        EconomySystem.useItem(gs, inventoryIndex, f);
                        this._closeTargetModal();
                        this.children.removeAll();
                        this._showPostBattleResults(0, 0, false);
                    }
                });
                this._targetModal.push(btn);
            }
        });

        const closeBtn = UIButton.create(this, {
            x: W / 2, y: panelY + panelH - 12,
            label: '[ CANCEL ]',
            style: makeStyle(TEXT_STYLES.BUTTON, { fontSize: '11px' }),
            depth: 102,
            hoverColor: '#ffffff',
            onClick: () => this._closeTargetModal()
        });
        this._targetModal.push(closeBtn);
    }

    _canUseItemOn(item, fish) {
        if (item.type === 'heal') return fish.hp > 0 && fish.hp < fish.maxHp;
        if (item.type === 'revive') return fish.hp <= 0;
        if (item.type === 'shield_potion') return true;
        return false;
    }

    _closeTargetModal() {
        if (this._targetModal) {
            for (const el of this._targetModal) el.destroy();
            this._targetModal = [];
        }
    }

    // --- Floor Rewards (every 10 floors) ---

    _showFloorReward() {
        const W = this.scale.width;
        const H = this.scale.height;
        const gs = this.gameState;

        const bgKey = getBackgroundKey(gs.floor);
        UILayout.sceneBackground(this, bgKey, { effects: true });
        UILayout.overlay(this, { alpha: 0.4, depth: 0 });

        this.add.text(W / 2, H * 0.12, 'Floor ' + gs.floor + ' Reward!',
            TEXT_STYLES.TITLE_MEDIUM
        ).setOrigin(0.5);

        if (gs.party.length < 3) {
            const ownedIds = new Set([
                ...gs.party.map(f => f.speciesId),
                ...(gs.roster || []).map(f => f.speciesId)
            ]);
            const available = Object.values(ConfigLoader.getAllFish()).filter(s => !ownedIds.has(s.id));
            if (available.length > 0) {
                const species = available[Math.floor(Math.random() * available.length)];
                this._showFishReward(species);
                return;
            }
        }

        const choices = ['potion', 'super_potion', 'revive'];
        const itemId = choices[Math.floor(Math.random() * choices.length)];
        this._showItemReward(itemId);
    }

    _showFishReward(species) {
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
                this._showZoneView();
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
                this._showZoneView();
            }
        });
    }

    _showItemReward(itemId) {
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
                this._showZoneView();
            }
        });
    }
}
