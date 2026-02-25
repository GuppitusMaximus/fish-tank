import ConfigLoader from '../systems/ConfigLoader.js';
import SaveSystem from '../systems/SaveSystem.js';
import PartySystem from '../systems/PartySystem.js';
import EncounterSystem from '../systems/EncounterSystem.js';
import EconomySystem from '../systems/EconomySystem.js';
import { generateGhostParty } from '../systems/GhostGenerator.js';
import { ITEMS, MAX_INVENTORY } from '../data/items.js';
import { getBackgroundKey } from '../utils/zones.js';
import { getZoneByFloor, getCharacterTheme } from '../data/themes.js';
import SpriteAnimator from '../effects/SpriteAnimator.js';
import WaterEffect from '../effects/WaterEffect.js';
import { TEXT_STYLES, makeStyle } from '../constants/textStyles.js';
import { loadZoneTheme, unloadZoneTheme } from '../systems/ThemeAssetLoader.js';
import { UIButton, UIPanel, UILayout } from '../ui/index.js';

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

        // Handle victory — check transitions before advancing
        if (this.result === 'victory') {
            const floorInZone = EncounterSystem.getFloorInZone(gs.floor);
            const transitions = EncounterSystem.getTransitions(floorInZone);

            if (transitions.length > 0) {
                gs._transitionQueue = transitions;
                gs._pendingAdvance = true;
                this._processTransitions();
                return;
            }

            this._advanceAndRoute();
            return;
        }

        // Returning from a transition scene (camp/shop)
        if (gs._transitionQueue && gs._transitionQueue.length > 0) {
            this._processTransitions();
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

    _processTransitions() {
        const gs = this.gameState;
        const next = gs._transitionQueue.shift();

        if (next === 'camp') {
            this.scene.start('CampScene', { gameState: gs });
        } else if (next === 'shop') {
            this.scene.start('ShopScene', { gameState: gs });
        }
    }

    _showZoneView() {
        const W = this.scale.width;
        const H = this.scale.height;
        const gs = this.gameState;
        const zone = getZoneByFloor(gs.floor);

        this.children.removeAll();

        // Zone background with ambient effects
        const bgKey = getBackgroundKey(gs.floor);
        UILayout.sceneBackground(this, bgKey, { effects: true });
        UILayout.overlay(this, { alpha: 0.3, depth: 0 });

        // Zone name
        this.add.text(W / 2, H * 0.08, zone.name,
            makeStyle(TEXT_STYLES.TITLE_MEDIUM, { fontSize: '18px' })
        ).setOrigin(0.5);

        // Floor counter
        this.add.text(W / 2, H * 0.15, 'Floor ' + gs.floor,
            makeStyle(TEXT_STYLES.BODY, { color: '#cccccc' })
        ).setOrigin(0.5);

        // Flavor text
        if (zone.flavor) {
            this.add.text(W / 2, H * 0.22, zone.flavor,
                makeStyle(TEXT_STYLES.BODY_SMALL, { color: '#888899', fontStyle: 'italic' })
            ).setOrigin(0.5);
        }

        // Delve Deeper action card
        const cardY = H * 0.52;
        const cardImg = this.add.image(W / 2, cardY, 'card_delve')
            .setOrigin(0.5);

        // Scale card to fit screen — max 60% width, max 35% height
        const maxW = W * 0.6;
        const maxH = H * 0.35;
        const cardScale = Math.min(maxW / cardImg.width, maxH / cardImg.height, 1);
        cardImg.setScale(cardScale);
        cardImg.setInteractive({ useHandCursor: true });

        // Hover effect
        cardImg.on('pointerover', () => {
            this.tweens.add({
                targets: cardImg,
                scaleX: cardScale * 1.05, scaleY: cardScale * 1.05,
                duration: 150, ease: 'Sine.Out'
            });
        });
        cardImg.on('pointerout', () => {
            this.tweens.add({
                targets: cardImg,
                scaleX: cardScale, scaleY: cardScale,
                duration: 150, ease: 'Sine.Out'
            });
        });

        // Click — start encounter
        cardImg.on('pointerdown', () => {
            this.children.removeAll();
            this._startEncounter();
        });

        // Compact party HP at bottom
        const partyY = H * 0.82;
        gs.party.forEach((f, i) => {
            const x = W / (gs.party.length + 1) * (i + 1);
            const alive = f.hp > 0;
            const color = alive ? '#ccccee' : '#ff6666';

            this.add.text(x, partyY, f.name,
                makeStyle(TEXT_STYLES.BODY_SMALL, { fontSize: '9px', color })
            ).setOrigin(0.5);

            // HP bar
            const barW = 40;
            const barH = 3;
            this.add.rectangle(x, partyY + 10, barW, barH, 0x333333);
            if (alive) {
                const fillW = (f.hp / f.maxHp) * barW;
                const hpColor = f.hp / f.maxHp > 0.5 ? 0x44ff44 : (f.hp / f.maxHp > 0.25 ? 0xffaa00 : 0xff4444);
                this.add.rectangle(x - (barW - fillW) / 2, partyY + 10, fillW, barH, hpColor);
            }
        });
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
                        this._processTransitions();
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
