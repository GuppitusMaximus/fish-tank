import ConfigLoader from '../systems/ConfigLoader.js';
import SaveSystem from '../systems/SaveSystem.js';
import PartySystem from '../systems/PartySystem.js';
import EncounterSystem from '../systems/EncounterSystem.js';
import { ITEMS, MAX_INVENTORY } from '../data/items.js';
import { getBackgroundKey } from '../utils/zones.js';
import { getZoneByFloor, getCharacterTheme } from '../data/themes.js';
import SpriteAnimator from '../effects/SpriteAnimator.js';
import WaterEffect from '../effects/WaterEffect.js';
import { TEXT_STYLES, makeStyle } from '../constants/textStyles.js';
import { loadZoneTheme, unloadZoneTheme } from '../systems/ThemeAssetLoader.js';
import { UIButton, UILayout } from '../ui/index.js';

export default class FloorScene extends Phaser.Scene {
    constructor() {
        super('FloorScene');
    }

    init(data) {
        this.gameState = data.gameState;
        this.result = data.result || null;
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

        // Fresh entry — start encounter for current floor
        this._startEncounter();
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

        this._startEncounter();
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

    _startEncounter() {
        const gs = this.gameState;

        if (gs.floor > 100) {
            this.scene.start('VictoryScene', { gameState: gs });
            return;
        }

        const encounterType = EncounterSystem.getEncounterType(gs.floor);

        let monsters;
        if (encounterType === 'boss') {
            monsters = [EncounterSystem.generateBoss(gs.floor)];
        } else {
            monsters = EncounterSystem.generatePack(gs.floor);
        }

        this.scene.start('BattleScene', { gameState: gs, monsters });
    }

    _handleDefeat() {
        const gs = this.gameState;
        for (const f of gs.party) PartySystem.fullHeal(f);
        gs.floor = gs.campFloor;
        delete gs._transitionQueue;
        delete gs._pendingAdvance;
        this.scene.start('CampScene', { gameState: gs });
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
            const ownedIds = gs.party.map(f => f.speciesId);
            const available = Object.values(ConfigLoader.getAllFish()).filter(s => !ownedIds.includes(s.id));
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
                this._startEncounter();
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
                this._startEncounter();
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
                this._startEncounter();
            }
        });
    }
}
