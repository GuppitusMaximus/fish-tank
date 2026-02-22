import { VERSION } from '../version.js';
import { TEXT_STYLES, makeStyle } from '../constants/textStyles.js';
import { ITEMS, MAX_INVENTORY } from '../data/items.js';
import { themedPanel } from '../ui/ThemedPanel.js';
import { TITLE_THEME, accentHex } from '../data/themes.js';

export default class UIOverlayScene extends Phaser.Scene {
    constructor() {
        super('UIOverlay');
    }

    create() {
        const { width, height } = this.scale;
        const verTxt = this.add.text(width - 4, height - 3, `v${VERSION}`, TEXT_STYLES.VERSION)
            .setOrigin(1, 1)
            .setDepth(1000)
            .setScrollFactor(0);
        const menuBtn = this.add.text(4, height - 18, '[ MENU ]', makeStyle(TEXT_STYLES.BUTTON, {
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

        const bagBtn = this.add.text(menuBtn.x + menuBtn.width + 6, height - 18, '[ BAG ]', makeStyle(TEXT_STYLES.BUTTON, {
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

        // Scrim sized to actual button bounds
        const mb = menuBtn.getBounds();
        const bb = bagBtn.getBounds();
        this._scrimX = mb.x - 4;
        this._scrimW = (bb.x + bb.width) - mb.x + 8;
        this._scrimH = Math.max(mb.height, bb.height) + 6;
        this._scrimY = mb.y + mb.height / 2;
        const scrimTheme = this.registry.get('currentZone') || TITLE_THEME;
        this.btnScrim = themedPanel(this, this._scrimX, this._scrimY - this._scrimH / 2, this._scrimW, this._scrimH, scrimTheme, { depth: 999 });
        this.btnScrim.setVisible(false);

        this.inventoryElements = [];

        const menuHiddenScenes = new Set(['BootScene', 'TitleScene']);
        const bagHiddenScenes = new Set(['BootScene', 'TitleScene', 'CharacterSelectScene', 'ZonePreviewScene']);

        for (const s of this.scene.manager.scenes) {
            if (s.scene.key === 'UIOverlay') continue;
            s.sys.events.on('start', () => {
                this.menuBtn.setVisible(!menuHiddenScenes.has(s.scene.key));
                this.btnScrim.setVisible(!bagHiddenScenes.has(s.scene.key));
                this.bagBtn.setVisible(!bagHiddenScenes.has(s.scene.key));
                this.closeInventory();
            });
        }

        this.registry.events.on('changedata-currentZone', (parent, value) => {
            if (this.btnScrim) { this.btnScrim.destroy(); }
            this.btnScrim = themedPanel(this, this._scrimX, this._scrimY - this._scrimH / 2,
                this._scrimW, this._scrimH, value, { depth: 999 });
        });
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

        const character = this.registry.get('currentCharacter') || TITLE_THEME;
        const bg = themedPanel(this, panelX, panelY, panelW, panelH, character, { alpha: 0.95, depth: 1002 });
        bg.setScrollFactor(0);
        this.inventoryElements.push(bg);

        const centerX = W / 2;
        const contentLeft = panelX + 12;

        const emblemKey = character.emblemKey;
        let headerX = centerX;
        if (emblemKey && this.textures.exists(emblemKey)) {
            const emblem = this.add.image(centerX - 46, panelY + 16, emblemKey)
                .setScale(0.5).setDepth(1002).setScrollFactor(0);
            this.inventoryElements.push(emblem);
            headerX = centerX + 6;
        }

        const header = this.add.text(headerX, panelY + 12, 'INVENTORY',
            makeStyle(TEXT_STYLES.TITLE_SMALL, { color: accentHex(character) }))
            .setOrigin(0.5).setDepth(1002).setScrollFactor(0);
        this.inventoryElements.push(header);

        const count = gameState.inventory.length;
        const countText = this.add.text(panelX + panelW - 12, panelY + 12, `${count}/${MAX_INVENTORY}`,
            makeStyle(TEXT_STYLES.BODY_SMALL, { color: accentHex(character) }))
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
                    makeStyle(TEXT_STYLES.BODY, { color: accentHex(character) }))
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
