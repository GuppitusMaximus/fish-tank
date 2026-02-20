import { generateMonster } from '../data/monsters.js';
import SaveSystem from '../systems/SaveSystem.js';
import PartySystem from '../systems/PartySystem.js';
import FISH_SPECIES from '../data/fish.js';
import { ITEMS, MAX_INVENTORY } from '../data/items.js';

export default class FloorScene extends Phaser.Scene {
    constructor() {
        super('FloorScene');
    }

    init(data) {
        this.gameState = data.gameState;
        this.fromBattle = !!data.fromBattle;
    }

    create() {
        const W = this.scale.width;
        const H = this.scale.height;
        const gs = this.gameState;

        // Auto-save
        SaveSystem.save(gs);

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

        // Flavor text
        this.add.text(W / 2, 10, this.getFlavorText(gs.floor), {
            fontSize: '7px', fontFamily: 'monospace', color: '#666688', fontStyle: 'italic'
        }).setOrigin(0.5);

        // Floor title
        this.add.text(W / 2, 26, 'Floor ' + gs.floor + ' / 100', {
            fontSize: '12px', fontFamily: 'monospace', color: '#f0c040'
        }).setOrigin(0.5);

        // Gold + Inventory
        this.add.text(W / 2, 42, 'Gold: ' + gs.gold + '   Items: ' + gs.inventory.length + '/' + MAX_INVENTORY, {
            fontSize: '8px', fontFamily: 'monospace', color: '#cccc80'
        }).setOrigin(0.5);

        // Party display with HP bars
        const isPortrait = this.registry.get('isPortrait');
        const barX = isPortrait ? Math.floor(W * 0.4) : 120;
        const barW = isPortrait ? Math.floor(W * 0.22) : 60;
        let py = 56;
        gs.party.forEach(fish => {
            const alive = fish.hp > 0;
            this.add.text(10, py, fish.name + ' Lv.' + fish.level, {
                fontSize: '7px', fontFamily: 'monospace', color: alive ? '#88ccff' : '#cc4444'
            });

            // HP bar background
            this.add.graphics().fillStyle(0x333333, 1).fillRect(barX, py + 1, barW, 6);

            // HP bar fill
            if (alive) {
                const ratio = Math.max(0, fish.hp / fish.maxHp);
                const color = ratio > 0.5 ? 0x33cc33 : ratio > 0.25 ? 0xcccc33 : 0xcc3333;
                this.add.graphics().fillStyle(color, 1).fillRect(barX, py + 1, ratio * barW, 6);
            }

            // HP text
            this.add.text(barX + barW + 5, py, alive ? fish.hp + '/' + fish.maxHp : 'FAINTED', {
                fontSize: '7px', fontFamily: 'monospace', color: alive ? '#aaaaaa' : '#cc4444'
            });
            py += 14;
        });

        // Action buttons
        const btnY = Math.max(py + 12, H * 0.5);
        const battleBtn = this.add.text(W / 2, btnY, '[ ENTER BATTLE ]', {
            fontSize: '11px', fontFamily: 'monospace', color: '#aaaacc'
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        battleBtn.on('pointerover', () => battleBtn.setColor('#ffffff'));
        battleBtn.on('pointerout', () => battleBtn.setColor('#aaaacc'));
        battleBtn.on('pointerdown', () => {
            const monster = generateMonster(gs.floor);
            this.scene.start('BattleScene', { gameState: gs, monster: monster });
        });

        const shopBtn = this.add.text(W / 2, btnY + 22, '[ SHOP ]', {
            fontSize: '11px', fontFamily: 'monospace', color: '#aaaacc'
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        shopBtn.on('pointerover', () => shopBtn.setColor('#ffffff'));
        shopBtn.on('pointerout', () => shopBtn.setColor('#aaaacc'));
        shopBtn.on('pointerdown', () => this.scene.start('ShopScene', { gameState: gs }));

        const campBtn = this.add.text(W / 2, btnY + 44, '[ CAMP ]', {
            fontSize: '11px', fontFamily: 'monospace', color: '#aaaacc'
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        campBtn.on('pointerover', () => campBtn.setColor('#ffffff'));
        campBtn.on('pointerout', () => campBtn.setColor('#aaaacc'));
        campBtn.on('pointerdown', () => this.scene.start('CampScene', { gameState: gs }));
    }

    getFlavorText(floor) {
        if (floor <= 10) return 'Damp sewers echo around you...';
        if (floor <= 20) return 'Goblin laughter echoes in the dark...';
        if (floor <= 30) return 'Bones crunch underfoot...';
        if (floor <= 50) return 'The air grows heavy...';
        if (floor <= 70) return 'Shadows move on their own...';
        if (floor <= 90) return 'Ancient power radiates from the walls...';
        return "The dungeon's heart beats...";
    }

    showFloorReward() {
        const W = this.scale.width;
        const H = this.scale.height;
        const gs = this.gameState;

        this.add.text(W / 2, H * 0.12, 'Floor ' + gs.floor + ' Reward!', {
            fontSize: '14px', fontFamily: 'monospace', color: '#ffd700', fontStyle: 'bold'
        }).setOrigin(0.5);

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

        this.add.text(W / 2, H * 0.3, 'A wild ' + species.name + ' wants to join!', {
            fontSize: '9px', fontFamily: 'monospace', color: '#ccccee'
        }).setOrigin(0.5);

        this.add.text(W / 2, H * 0.4, 'HP:' + species.baseHp + ' ATK:' + species.baseAtk +
            ' DEF:' + species.baseDef + ' SPD:' + species.baseSpd, {
            fontSize: '7px', fontFamily: 'monospace', color: '#888888'
        }).setOrigin(0.5);

        this.add.image(W / 2, H * 0.52, 'fish_' + species.id).setScale(3);

        const acceptBtn = this.add.text(W / 2 - 60, H * 0.7, '[ ACCEPT ]', {
            fontSize: '10px', fontFamily: 'monospace', color: '#88cc88'
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        acceptBtn.on('pointerover', () => acceptBtn.setColor('#ffffff'));
        acceptBtn.on('pointerout', () => acceptBtn.setColor('#88cc88'));
        acceptBtn.on('pointerdown', () => {
            gs.party.push(PartySystem.createFish(species.id));
            this.children.removeAll();
            this.buildFloorUI();
        });

        const declineBtn = this.add.text(W / 2 + 60, H * 0.7, '[ DECLINE ]', {
            fontSize: '10px', fontFamily: 'monospace', color: '#888888'
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
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

        this.add.text(W / 2, H * 0.4, 'You found a ' + item.name + '!', {
            fontSize: '10px', fontFamily: 'monospace', color: '#ccccee'
        }).setOrigin(0.5);

        const takeBtn = this.add.text(W / 2, H * 0.6, '[ TAKE ]', {
            fontSize: '11px', fontFamily: 'monospace', color: '#88cc88'
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
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
