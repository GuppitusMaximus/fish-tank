import { VERSION } from '../version.js';
import { TEXT_STYLES, makeStyle } from '../constants/textStyles.js';
import { ITEMS, MAX_INVENTORY } from '../data/items.js';

export default class UIOverlayScene extends Phaser.Scene {
    constructor() {
        super('UIOverlay');
    }

    create() {
        const { width, height } = this.scale;
        this.add.text(width - 4, height - 3, `v${VERSION}`, TEXT_STYLES.VERSION)
            .setOrigin(1, 1)
            .setDepth(1000)
            .setScrollFactor(0);

        const menuBtn = this.add.text(4, 3, '[ MENU ]', makeStyle(TEXT_STYLES.BUTTON, {
            fontSize: '11px',
            stroke: '#000000',
            strokeThickness: 2
        }))
            .setDepth(1000)
            .setScrollFactor(0)
            .setInteractive({ useHandCursor: true });

        menuBtn.on('pointerover', () => menuBtn.setColor('#ffffff'));
        menuBtn.on('pointerout', () => menuBtn.setColor('#aaaacc'));

        menuBtn.on('pointerdown', () => {
            this.closeInventory();
            const scenesToStop = [
                'TitleScene', 'CharacterSelectScene', 'FloorScene', 'BattleScene',
                'ShopScene', 'CampScene', 'VictoryScene', 'ZonePreviewScene'
            ];
            for (const key of scenesToStop) {
                if (this.scene.isActive(key)) {
                    this.scene.stop(key);
                }
            }
            this.scene.run('TitleScene', {});
        });

        this.menuBtn = menuBtn;
        menuBtn.setVisible(false);

        const bagBtn = this.add.text(menuBtn.x + menuBtn.width + 6, 3, '[ BAG ]', makeStyle(TEXT_STYLES.BUTTON, {
            fontSize: '11px',
            stroke: '#000000',
            strokeThickness: 2
        }))
            .setDepth(1000)
            .setScrollFactor(0)
            .setInteractive({ useHandCursor: true });

        bagBtn.on('pointerover', () => bagBtn.setColor('#ffffff'));
        bagBtn.on('pointerout', () => bagBtn.setColor('#aaaacc'));
        bagBtn.on('pointerdown', () => this.toggleInventory());

        this.bagBtn = bagBtn;
        bagBtn.setVisible(false);

        this.inventoryElements = [];

        const menuHiddenScenes = new Set(['BootScene', 'TitleScene']);
        const bagHiddenScenes = new Set(['BootScene', 'TitleScene', 'CharacterSelectScene', 'ZonePreviewScene']);

        for (const s of this.scene.manager.scenes) {
            if (s.scene.key === 'UIOverlay') continue;
            s.sys.events.on('start', () => {
                this.menuBtn.setVisible(!menuHiddenScenes.has(s.scene.key));
                this.bagBtn.setVisible(!bagHiddenScenes.has(s.scene.key));
                this.closeInventory();
            });
        }
    }

    toggleInventory() {
        if (this.inventoryElements.length > 0) {
            this.closeInventory();
        } else {
            this.openInventory();
        }
    }

    openInventory() {
        const gameState = this.registry.get('gameState');
        if (!gameState) return;

        const { width: W, height: H } = this.scale;
        const isPortrait = this.registry.get('isPortrait');

        const blocker = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.6)
            .setDepth(1001)
            .setScrollFactor(0)
            .setInteractive();
        blocker.on('pointerdown', () => {});
        this.inventoryElements.push(blocker);

        const panelX = isPortrait ? 15 : 30;
        const panelY = isPortrait ? 30 : 20;
        const panelW = W - panelX * 2;
        const panelH = H - panelY * 2;

        const bg = this.add.graphics().setDepth(1002).setScrollFactor(0);
        bg.fillStyle(0x1a1a2e, 0.95);
        bg.fillRect(panelX, panelY, panelW, panelH);
        bg.lineStyle(1, 0x4a4a8a, 1);
        bg.strokeRect(panelX, panelY, panelW, panelH);
        this.inventoryElements.push(bg);

        const centerX = W / 2;
        const contentLeft = panelX + 12;

        const header = this.add.text(centerX, panelY + 12, 'INVENTORY',
            makeStyle(TEXT_STYLES.TITLE_SMALL))
            .setOrigin(0.5).setDepth(1002).setScrollFactor(0);
        this.inventoryElements.push(header);

        const count = gameState.inventory.length;
        const countText = this.add.text(panelX + panelW - 12, panelY + 12, `${count}/${MAX_INVENTORY}`,
            makeStyle(TEXT_STYLES.BODY_SMALL, { color: '#ccccee' }))
            .setOrigin(1, 0).setDepth(1002).setScrollFactor(0);
        this.inventoryElements.push(countText);

        const slotStartY = panelY + 32;
        const slotSpacing = isPortrait ? 22 : 18;

        for (let i = 0; i < MAX_INVENTORY; i++) {
            const y = slotStartY + i * slotSpacing;
            const itemId = gameState.inventory[i];

            if (itemId) {
                const item = ITEMS[itemId];
                const nameText = this.add.text(contentLeft, y, `${i + 1}. ${item.name}`,
                    makeStyle(TEXT_STYLES.BODY, { color: '#ccaa66' }))
                    .setDepth(1002).setScrollFactor(0);
                this.inventoryElements.push(nameText);

                const descX = contentLeft + (isPortrait ? 100 : 140);
                const descText = this.add.text(descX, y, item.description,
                    makeStyle(TEXT_STYLES.BODY_SMALL))
                    .setDepth(1002).setScrollFactor(0);
                this.inventoryElements.push(descText);
            } else {
                const emptyText = this.add.text(contentLeft, y, `${i + 1}. - empty -`,
                    makeStyle(TEXT_STYLES.BODY_SMALL, { color: '#555566' }))
                    .setDepth(1002).setScrollFactor(0);
                this.inventoryElements.push(emptyText);
            }
        }

        const btnY = panelY + panelH - 16;

        const sortBtn = this.add.text(centerX - 50, btnY, '[ SORT ]',
            makeStyle(TEXT_STYLES.BUTTON, { fontSize: '12px', stroke: '#000000', strokeThickness: 2 }))
            .setOrigin(0.5).setDepth(1002).setScrollFactor(0)
            .setInteractive({ useHandCursor: true });
        sortBtn.on('pointerover', () => sortBtn.setColor('#ffffff'));
        sortBtn.on('pointerout', () => sortBtn.setColor('#aaaacc'));
        sortBtn.on('pointerdown', () => {
            this.sortInventory(gameState);
            this.closeInventory();
            this.openInventory();
        });
        this.inventoryElements.push(sortBtn);

        const closeBtn = this.add.text(centerX + 50, btnY, '[ CLOSE ]',
            makeStyle(TEXT_STYLES.BUTTON, { fontSize: '12px', stroke: '#000000', strokeThickness: 2 }))
            .setOrigin(0.5).setDepth(1002).setScrollFactor(0)
            .setInteractive({ useHandCursor: true });
        closeBtn.on('pointerover', () => closeBtn.setColor('#ffffff'));
        closeBtn.on('pointerout', () => closeBtn.setColor('#aaaacc'));
        closeBtn.on('pointerdown', () => this.closeInventory());
        this.inventoryElements.push(closeBtn);
    }

    closeInventory() {
        for (const el of this.inventoryElements) el.destroy();
        this.inventoryElements = [];
    }

    sortInventory(gameState) {
        const typeOrder = { heal: 0, revive: 1, stat: 2 };
        gameState.inventory.sort((a, b) => {
            const ta = typeOrder[ITEMS[a]?.type] ?? 99;
            const tb = typeOrder[ITEMS[b]?.type] ?? 99;
            return ta - tb;
        });
    }
}
