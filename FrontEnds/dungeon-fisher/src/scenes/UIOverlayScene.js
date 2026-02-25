import { VERSION } from '../version.js';
import { TEXT_STYLES, makeStyle } from '../constants/textStyles.js';
import { ITEMS, MAX_INVENTORY } from '../data/items.js';
import EconomySystem from '../systems/EconomySystem.js';
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

        this.inventoryElements = [];

        this._useAllowedScenes = new Set(['FloorScene', 'CampScene', 'ShopScene']);
        this._currentScene = null;

        const menuHiddenScenes = new Set(['BootScene', 'TitleScene']);
        const bagHiddenScenes = new Set(['BootScene', 'TitleScene', 'CharacterSelectScene', 'ZonePreviewScene']);

        for (const s of this.scene.manager.scenes) {
            if (s.scene.key === 'UIOverlay') continue;
            s.sys.events.on('start', () => {
                this._currentScene = s.scene.key;
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
        const canUseItems = this._useAllowedScenes.has(this._currentScene);

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
                    const descX = x + (isPortrait ? 80 : 120);
                    const descText = this.add.text(descX, y, item.description,
                        makeStyle(TEXT_STYLES.BODY_SMALL))
                        .setDepth(1002);

                    const row = [nameText, descText];

                    if (canUseItems) {
                        const useBtn = UIButton.create(this, {
                            x: panelX + panelW - 16, y: y + 2,
                            label: 'USE',
                            style: makeStyle(TEXT_STYLES.BUTTON, {
                                fontSize: '10px', stroke: '#000000', strokeThickness: 1
                            }),
                            depth: 1003,
                            origin: { x: 1, y: 0 },
                            color: '#88cc88',
                            hoverColor: '#ffffff',
                            onClick: () => this._showTargetSelection(i)
                        });
                        row.push(useBtn);
                    }

                    return row;
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

    _showTargetSelection(inventoryIndex) {
        const gameState = this.registry.get('gameState');
        if (!gameState) return;
        const itemId = gameState.inventory[inventoryIndex];
        const item = ITEMS[itemId];
        if (!item) return;

        if (this._targetElements) {
            for (const el of this._targetElements) el.destroy();
        }
        this._targetElements = [];

        const { width: W, height: H } = this.scale;

        const blocker = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.5)
            .setDepth(1010).setScrollFactor(0).setInteractive();
        blocker.on('pointerdown', () => {});
        this._targetElements.push(blocker);

        const panelX = 30;
        const panelY = H * 0.2;
        const panelW = W - 60;
        const panelH = gameState.party.length * 28 + 50;
        const character = this.registry.get('currentCharacter') || TITLE_THEME;
        const panel = new UIPanel(this, {
            x: panelX, y: panelY, width: panelW, height: panelH,
            theme: character, alpha: 0.95, depth: 1011, childDepth: 1011, padding: 0
        });
        this._targetElements.push(panel);

        const headerTxt = this.add.text(W / 2, panelY + 10, 'Use ' + item.name + ' on:',
            makeStyle(TEXT_STYLES.BODY_SMALL, { color: accentHex(character) })
        ).setOrigin(0.5).setDepth(1012).setScrollFactor(0);
        this._targetElements.push(headerTxt);

        gameState.party.forEach((f, i) => {
            const y = panelY + 30 + i * 28;
            const canUse = this._canUseItemOn(item, f);
            const color = canUse ? '#ccccee' : '#555555';

            const txt = this.add.text(panelX + 10, y, `${f.name} (HP: ${f.hp}/${f.maxHp})`,
                makeStyle(TEXT_STYLES.BODY_SMALL, { fontSize: '11px', color })
            ).setDepth(1012).setScrollFactor(0);
            this._targetElements.push(txt);

            if (canUse) {
                const btn = UIButton.create(this, {
                    x: panelX + panelW - 15, y: y + 2,
                    label: 'USE',
                    style: makeStyle(TEXT_STYLES.BUTTON, { fontSize: '10px' }),
                    depth: 1012,
                    origin: { x: 1, y: 0 },
                    color: '#88cc88',
                    hoverColor: '#ffffff',
                    onClick: () => {
                        EconomySystem.useItem(gameState, inventoryIndex, f);
                        this._closeTargetSelection();
                        this.closeInventory();
                        this.openInventory();
                    }
                });
                this._targetElements.push(btn);
            }
        });

        const cancelBtn = UIButton.create(this, {
            x: W / 2, y: panelY + panelH - 12,
            label: '[ CANCEL ]',
            style: makeStyle(TEXT_STYLES.BUTTON, { fontSize: '11px', stroke: '#000000', strokeThickness: 2 }),
            depth: 1012,
            hoverColor: '#ffffff',
            onClick: () => this._closeTargetSelection()
        });
        this._targetElements.push(cancelBtn);
    }

    _canUseItemOn(item, fish) {
        if (item.type === 'heal') return fish.hp > 0 && fish.hp < fish.maxHp;
        if (item.type === 'revive') return fish.hp <= 0;
        if (item.type === 'shield_potion') return true;
        return false;
    }

    _closeTargetSelection() {
        if (this._targetElements) {
            for (const el of this._targetElements) el.destroy();
            this._targetElements = [];
        }
    }

    closeInventory() {
        this._closeTargetSelection();
        for (const el of this.inventoryElements) el.destroy();
        this.inventoryElements = [];
    }

    sortInventory(gameState) {
        const typeOrder = { heal: 0, revive: 1, shield_potion: 2 };
        gameState.inventory.sort((a, b) => {
            const ta = typeOrder[ITEMS[a]?.type] ?? 99;
            const tb = typeOrder[ITEMS[b]?.type] ?? 99;
            return ta - tb;
        });
    }
}
