import { VERSION } from '../version.js';
import { TEXT_STYLES, makeStyle } from '../constants/textStyles.js';
import { ITEMS, MAX_INVENTORY } from '../data/items.js';
import { UIPanel, UIButton, UIList, UILayout } from '../ui/index.js';
import { TITLE_THEME, accentHex } from '../data/themes.js';

export default class UIOverlayScene extends Phaser.Scene {
    constructor() {
        super('UIOverlay');
    }

    create() {
        const { width, height } = this.scale;
        const verTxt = this.add.text(width - 5, height - 5, `v${VERSION}`, TEXT_STYLES.VERSION)
            .setOrigin(1, 1)
            .setDepth(1000)
            .setScrollFactor(0);

        this.add.rectangle(
            verTxt.x - verTxt.displayWidth / 2,
            verTxt.y - verTxt.displayHeight / 2,
            verTxt.displayWidth + 2,
            verTxt.displayHeight + 2,
            0x000000, 0.6
        ).setOrigin(0.5).setDepth(999).setScrollFactor(0);

        this.menuBtn = UIButton.create(this, {
            x: 4, y: height - 18,
            label: '[ MENU ]',
            style: makeStyle(TEXT_STYLES.BUTTON, {
                fontSize: '11px',
                stroke: '#000000',
                strokeThickness: 2
            }),
            depth: 999,
            origin: { x: 0, y: 0 },
            hoverColor: '#ffffff',
            onClick: () => {
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
            }
        });
        this.menuBtn.setVisible(false);

        this.bagBtn = UIButton.create(this, {
            x: width - 8, y: 8,
            label: '[ BAG ]',
            style: makeStyle(TEXT_STYLES.BUTTON, {
                fontSize: '11px',
                stroke: '#000000',
                strokeThickness: 2
            }),
            depth: 999,
            origin: { x: 1, y: 0 },
            hoverColor: '#ffffff',
            onClick: () => this.toggleInventory()
        });
        this.bagBtn.setVisible(false);

        // Zone atlas panel behind menu button
        const mb = this.menuBtn.text.getBounds();
        this._scrimX = mb.x - 14;
        this._scrimW = mb.width + 28;
        this._scrimH = mb.height + 20;
        this._scrimY = mb.y + mb.height / 2;
        const scrimZone = this.registry.get('currentZone') || TITLE_THEME;
        const scrimTheme = { ...scrimZone };
        delete scrimTheme.compositeKey;
        delete scrimTheme.pieceSize;
        scrimTheme.atlasKey = scrimZone.atlasKey ? scrimZone.atlasKey + '_sm' : 'atlas_sewers_sm';
        this.btnScrim = new UIPanel(this, {
            x: this._scrimX, y: this._scrimY - this._scrimH / 2,
            width: this._scrimW, height: this._scrimH,
            theme: scrimTheme, depth: 997, padding: 0, cornerSize: 10, fx: false
        });
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
            const newTheme = { ...value };
            delete newTheme.compositeKey;
            delete newTheme.pieceSize;
            newTheme.atlasKey = value.atlasKey ? value.atlasKey + '_sm' : 'atlas_sewers_sm';
            if (this.btnScrim) { this.btnScrim.destroy(); }
            this.btnScrim = new UIPanel(this, {
                x: this._scrimX, y: this._scrimY - this._scrimH / 2,
                width: this._scrimW, height: this._scrimH,
                theme: newTheme, depth: 997, padding: 0, cornerSize: 10, fx: false
            });
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

        const blocker = UILayout.overlay(this, { depth: 1001, alpha: 0.6 });
        blocker.setInteractive();
        blocker.on('pointerdown', () => {});
        this.inventoryElements.push(blocker);

        const panelX = isPortrait ? 15 : 30;
        const panelY = isPortrait ? 30 : 20;
        const panelW = W - panelX * 2;
        const panelH = H - panelY * 2;

        const character = this.registry.get('currentCharacter') || TITLE_THEME;
        const panel = new UIPanel(this, {
            x: panelX, y: panelY, width: panelW, height: panelH,
            theme: character, alpha: 0.95, depth: 1002, childDepth: 1002, padding: 0
        });
        this.inventoryElements.push(panel);

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

        const list = new UIList(this, {
            x: contentLeft, y: slotStartY, spacing: slotSpacing, depth: 1002
        });
        for (let i = 0; i < MAX_INVENTORY; i++) {
            const itemId = gameState.inventory[i];
            list.addRow((x, y) => {
                if (itemId) {
                    const item = ITEMS[itemId];
                    const nameText = this.add.text(x, y, `${i + 1}. ${item.name}`,
                        makeStyle(TEXT_STYLES.BODY, { color: accentHex(character) }))
                        .setDepth(1002);
                    const descX = x + (isPortrait ? 100 : 140);
                    const descText = this.add.text(descX, y, item.description,
                        makeStyle(TEXT_STYLES.BODY_SMALL))
                        .setDepth(1002);
                    return [nameText, descText];
                } else {
                    const emptyText = this.add.text(x, y, `${i + 1}. - empty -`,
                        makeStyle(TEXT_STYLES.BODY_SMALL, { color: '#555566' }))
                        .setDepth(1002);
                    return [emptyText];
                }
            });
        }
        this.inventoryElements.push(list);

        const btnY = panelY + panelH - 16;

        const sortBtn = UIButton.create(this, {
            x: centerX - 50, y: btnY,
            label: '[ SORT ]',
            style: makeStyle(TEXT_STYLES.BUTTON, { fontSize: '12px', stroke: '#000000', strokeThickness: 2 }),
            depth: 1001,
            hoverColor: '#ffffff',
            onClick: () => {
                this.sortInventory(gameState);
                this.closeInventory();
                this.openInventory();
            }
        });
        this.inventoryElements.push(sortBtn);

        const closeBtn = UIButton.create(this, {
            x: centerX + 50, y: btnY,
            label: '[ CLOSE ]',
            style: makeStyle(TEXT_STYLES.BUTTON, { fontSize: '12px', stroke: '#000000', strokeThickness: 2 }),
            depth: 1001,
            hoverColor: '#ffffff',
            onClick: () => this.closeInventory()
        });
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
