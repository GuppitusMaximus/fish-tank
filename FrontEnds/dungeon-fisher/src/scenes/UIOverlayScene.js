import { VERSION } from '../version.js';
import { TEXT_STYLES, makeStyle } from '../constants/textStyles.js';
import { ITEMS, MAX_INVENTORY } from '../data/items.js';
import EconomySystem from '../systems/EconomySystem.js';
import EquipmentSystem from '../systems/EquipmentSystem.js';
import EquipmentRenderer from '../systems/EquipmentRenderer.js';
import ConfigLoader from '../systems/ConfigLoader.js';
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
                this.closeEquipmentGrid();
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

        this.equipBtn = UIButton.create(this, {
            x: width - 8, y: 28,
            label: '[ EQUIP ]',
            style: makeStyle(TEXT_STYLES.BUTTON, {
                fontSize: '11px',
                stroke: '#000000',
                strokeThickness: 2
            }),
            depth: 999,
            origin: { x: 1, y: 0 },
            hoverColor: '#ffffff',
            onClick: () => this.toggleEquipmentGrid()
        });
        this.equipBtn.setVisible(false);

        this.inventoryElements = [];
        this.equipmentElements = [];
        this._equipMode = null;
        this._selectedItem = null;
        this._heldItem = null;
        this._ghostCells = [];
        this._tooltipEls = [];
        this._actionBtnEls = [];
        this._statPreviewEls = [];

        this._useAllowedScenes = new Set(['FloorScene', 'CampScene', 'ShopScene']);
        this._equipEditScenes = new Set(['FloorScene', 'CampScene', 'ShopScene']);
        this._currentScene = null;

        const menuHiddenScenes = new Set(['BootScene', 'TitleScene']);
        const bagHiddenScenes = new Set(['BootScene', 'TitleScene', 'CharacterSelectScene', 'ZonePreviewScene']);
        const equipHiddenScenes = new Set(['BootScene', 'TitleScene', 'CharacterSelectScene', 'ZonePreviewScene']);

        for (const s of this.scene.manager.scenes) {
            if (s.scene.key === 'UIOverlay') continue;
            s.sys.events.on('start', () => {
                this._currentScene = s.scene.key;
                this.menuBtn.setVisible(!menuHiddenScenes.has(s.scene.key));
                this.bagBtn.setVisible(!bagHiddenScenes.has(s.scene.key));
                this.equipBtn.setVisible(!equipHiddenScenes.has(s.scene.key));
                this.closeInventory();
                this.closeEquipmentGrid();
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
        this.closeEquipmentGrid();
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

    // ── Equipment Grid Overlay ──

    toggleEquipmentGrid() {
        if (this._equipMode) {
            this.closeEquipmentGrid();
        } else {
            const mode = this._currentScene === 'BattleScene' ? 'readonly' : 'edit';
            this.openEquipmentGrid(mode);
        }
    }

    openEquipmentGrid(mode) {
        this.closeInventory();
        this.closeEquipmentGrid();

        const gameState = this.registry.get('gameState');
        if (!gameState || !gameState.equipment) return;

        this._equipMode = mode;
        this._selectedItem = null;
        this._heldItem = null;

        const { width: W, height: H } = this.scale;
        const balance = ConfigLoader.getEquipmentBalance();
        const gridW = balance.gridWidth || 3;
        const gridH = balance.gridHeight || 5;
        const cellSize = 48;

        // Blocker
        const blocker = UILayout.overlay(this, { depth: 1004, alpha: 0.6 });
        blocker.setInteractive();
        blocker.on('pointerdown', () => {});
        this.equipmentElements.push(blocker);

        // Panel
        const panelPad = 12;
        const gridTotalW = gridW * cellSize;
        const gridTotalH = gridH * cellSize;
        const labelW = 50;
        const stashH = mode === 'edit' ? 100 : 0;
        const btnAreaH = mode === 'edit' ? 30 : 0;
        const panelW = labelW + gridTotalW + 60 + panelPad * 2;
        const panelH = gridTotalH + stashH + btnAreaH + 50;
        const panelX = Math.max(4, (W - panelW) / 2);
        const panelY = Math.max(4, (H - panelH) / 2);

        const character = this.registry.get('currentCharacter') || TITLE_THEME;
        const panel = new UIPanel(this, {
            x: panelX, y: panelY, width: panelW, height: panelH,
            theme: character, alpha: 0.95, depth: 1005, childDepth: 1005, padding: 0
        });
        this.equipmentElements.push(panel);

        // Header
        const header = this.add.text(panelX + panelW / 2, panelY + 10, 'EQUIPMENT',
            makeStyle(TEXT_STYLES.TITLE_SMALL, { color: accentHex(character) }))
            .setOrigin(0.5).setDepth(1006).setScrollFactor(0);
        this.equipmentElements.push(header);

        if (mode === 'readonly') {
            const tag = this.add.text(panelX + panelW - 10, panelY + 10, '[VIEW]',
                makeStyle(TEXT_STYLES.BODY_SMALL, { color: '#666688' }))
                .setOrigin(1, 0).setDepth(1006).setScrollFactor(0);
            this.equipmentElements.push(tag);
        }

        // Grid position
        const gridX = panelX + labelW + panelPad;
        const gridY = panelY + 28;
        this._gridConfig = { x: gridX, y: gridY, cellSize, depth: 1006, gridWidth: gridW, gridHeight: gridH };

        // Render grid
        const gridEls = EquipmentRenderer.renderGrid(this, gameState.equipment.grid, this._gridConfig);
        this.equipmentElements.push(...gridEls);

        // Row labels
        const labelEls = EquipmentRenderer.renderRowLabels(this, gameState.party, this._gridConfig);
        this.equipmentElements.push(...labelEls);

        // Grid cell tap zones
        for (let r = 0; r < gridH; r++) {
            for (let c = 0; c < gridW; c++) {
                const zone = this.add.zone(
                    gridX + c * cellSize + cellSize / 2,
                    gridY + r * cellSize + cellSize / 2,
                    cellSize, cellSize
                ).setDepth(1008).setScrollFactor(0).setInteractive();
                zone.on('pointerdown', () => this._onGridCellTap(c, r));
                this.equipmentElements.push(zone);
            }
        }

        // Stash (edit mode only)
        if (mode === 'edit') {
            const stashY = gridY + gridTotalH + 10;
            const stashLabel = this.add.text(panelX + panelPad, stashY - 14, 'STASH',
                makeStyle(TEXT_STYLES.BODY_SMALL, { color: accentHex(character) }))
                .setDepth(1006).setScrollFactor(0);
            this.equipmentElements.push(stashLabel);

            const stashEls = EquipmentRenderer.renderStash(this, gameState.equipment.stash, {
                x: panelX + panelPad, y: stashY,
                depth: 1006, cellSize: 40, gap: 8, maxCols: 5,
                stashCapacity: balance.stashCellCapacity || 15
            });
            this.equipmentElements.push(...stashEls);

            // Wire stash item taps
            for (const el of stashEls) {
                if (el._stashItem) {
                    el.on('pointerdown', () => this._onStashItemTap(el._stashItem, el._stashIndex));
                }
            }
        }

        // Close button
        const closeBtnY = panelY + panelH - 16;
        const closeBtn = UIButton.create(this, {
            x: panelX + panelW / 2, y: closeBtnY,
            label: '[ CLOSE ]',
            style: makeStyle(TEXT_STYLES.BUTTON, { fontSize: '12px', stroke: '#000000', strokeThickness: 2 }),
            depth: 1007,
            hoverColor: '#ffffff',
            onClick: () => this.closeEquipmentGrid()
        });
        this.equipmentElements.push(closeBtn);

        // Pause combat in readonly mode
        if (mode === 'readonly') {
            const battleScene = this.scene.get('BattleScene');
            if (battleScene && battleScene.pauseCombat) {
                battleScene.pauseCombat();
            }
            this._battleAutoCloseCheck = this.time.addEvent({
                delay: 500,
                loop: true,
                callback: () => {
                    const bs = this.scene.get('BattleScene');
                    if (!bs || !bs.combatState || !bs.combatState.running) {
                        this.closeEquipmentGrid();
                    }
                }
            });
        }
    }

    closeEquipmentGrid() {
        if (this._equipMode === 'readonly') {
            const battleScene = this.scene.get('BattleScene');
            if (battleScene && battleScene.resumeCombat) {
                battleScene.resumeCombat();
            }
        }
        if (this._battleAutoCloseCheck) {
            this._battleAutoCloseCheck.remove(false);
            this._battleAutoCloseCheck = null;
        }

        // If holding an item, return it to its original grid position
        this._heldItem = null;
        this._selectedItem = null;
        this._equipMode = null;

        this._clearGhostPiece();
        this._clearTooltip();
        this._clearActionButtons();
        this._clearStatPreview();

        for (const el of this.equipmentElements) el.destroy();
        this.equipmentElements = [];
    }

    _refreshEquipmentDisplay() {
        const mode = this._equipMode;
        if (!mode) return;
        this.closeEquipmentGrid();
        this.openEquipmentGrid(mode);
    }

    _onStashItemTap(item, index) {
        if (this._equipMode !== 'edit') return;
        this._clearTooltip();
        this._clearActionButtons();
        this._clearGhostPiece();
        this._clearStatPreview();
        this._heldItem = null;

        const cfg = ConfigLoader.getEquipmentItem(item.id || item.itemId);
        if (!cfg) return;

        this._selectedItem = { ...cfg, id: cfg.id, rotation: 0, flipped: false, _stashIndex: index };

        // Tooltip
        const { x: gx, y: gy, cellSize, gridWidth } = this._gridConfig;
        this._tooltipEls = EquipmentRenderer.renderTooltip(this, this._selectedItem,
            { x: gx + gridWidth * cellSize + 6, y: gy }, 'edit', null, null, { depth: 1007 });
        this.equipmentElements.push(...this._tooltipEls);

        // Action buttons: Rotate, Flip
        this._actionBtnEls = EquipmentRenderer.renderActionButtons(this, [
            { label: 'ROTATE', onClick: () => this._rotateItem() },
            { label: 'FLIP', onClick: () => this._flipItem() }
        ], { x: gx + (gridWidth * cellSize) / 2, y: gy + this._gridConfig.gridHeight * cellSize + 80, depth: 1007 });
        this.equipmentElements.push(...this._actionBtnEls);
    }

    _onGridItemTap(entry) {
        this._clearTooltip();
        this._clearActionButtons();
        this._clearGhostPiece();
        this._clearStatPreview();

        const cfg = ConfigLoader.getEquipmentItem(entry.itemId);
        if (!cfg) return;

        const gameState = this.registry.get('gameState');
        const { x: gx, y: gy, cellSize, gridWidth } = this._gridConfig;

        if (this._equipMode === 'readonly') {
            const snapshot = gameState.equipmentSnapshot || null;
            this._tooltipEls = EquipmentRenderer.renderTooltip(this, entry,
                { x: gx + gridWidth * cellSize + 6, y: gy }, 'readonly', snapshot, gameState.party, { depth: 1007 });
            this.equipmentElements.push(...this._tooltipEls);
            return;
        }

        // Edit mode
        this._selectedItem = { ...cfg, id: cfg.id, rotation: entry.rotation, flipped: entry.flipped, _gridEntry: entry };

        this._tooltipEls = EquipmentRenderer.renderTooltip(this, entry,
            { x: gx + gridWidth * cellSize + 6, y: gy }, 'edit', null, null, { depth: 1007 });
        this.equipmentElements.push(...this._tooltipEls);

        const isHarmony = entry.itemId === 'harmony';
        const actions = [];
        if (!isHarmony) {
            actions.push({ label: 'SELL', onClick: () => this._sellItem(entry) });
            actions.push({ label: 'DISCARD', onClick: () => this._discardItem(entry) });
        }
        actions.push({ label: 'PICK UP', onClick: () => this._pickUpItem(entry) });

        this._actionBtnEls = EquipmentRenderer.renderActionButtons(this, actions, {
            x: gx + (gridWidth * cellSize) / 2,
            y: gy + this._gridConfig.gridHeight * cellSize + 80,
            depth: 1007
        });
        this.equipmentElements.push(...this._actionBtnEls);
    }

    _onGridCellTap(col, row) {
        const gameState = this.registry.get('gameState');
        if (!gameState || !gameState.equipment) return;

        // Check if tapping an occupied cell (select that item)
        const grid = gameState.equipment.grid;
        for (const entry of grid) {
            const cfg = ConfigLoader.getEquipmentItem(entry.itemId);
            if (!cfg) continue;
            const cells = EquipmentSystem.getShapeCells(cfg.shape, entry.rotation, entry.flipped);
            for (const [c, r] of cells) {
                if (entry.col + c === col && entry.row + r === row) {
                    if (!this._selectedItem && !this._heldItem) {
                        this._onGridItemTap(entry);
                        return;
                    }
                }
            }
        }

        // If we have a selected stash item or held item, show ghost piece
        const item = this._heldItem || this._selectedItem;
        if (!item || this._equipMode !== 'edit') return;

        const balance = ConfigLoader.getEquipmentBalance();
        const gridWidth = balance.gridWidth || 3;
        const gridHeight = balance.gridHeight || 5;

        // For held items, exclude the held item from the grid for placement check
        let checkGrid = grid;
        if (this._heldItem && this._heldItem._gridEntry) {
            checkGrid = EquipmentSystem.removeItem(grid, this._heldItem._gridEntry.itemId);
        }

        const result = EquipmentSystem.canPlace(checkGrid, item, col, row, gridWidth, gridHeight);

        this._clearGhostPiece();
        this._clearStatPreview();
        this._ghostCells = EquipmentRenderer.renderGhostPiece(this, item, col, row, result.valid, this._gridConfig);
        this.equipmentElements.push(...this._ghostCells);

        // Stat preview
        if (result.valid) {
            this._statPreviewEls = EquipmentRenderer.renderStatPreview(
                this, gameState.party, checkGrid, item, col, row, this._gridConfig);
            this.equipmentElements.push(...this._statPreviewEls);
        }

        // Update action buttons for placement
        this._clearActionButtons();
        const actions = [
            { label: 'ROTATE', onClick: () => this._rotateItem() },
            { label: 'FLIP', onClick: () => this._flipItem() }
        ];
        if (result.valid) {
            actions.push({ label: 'CONFIRM', onClick: () => this._confirmPlacement(col, row) });
        }
        const { x: gx, y: gy, cellSize } = this._gridConfig;
        this._actionBtnEls = EquipmentRenderer.renderActionButtons(this, actions, {
            x: gx + (gridWidth * cellSize) / 2,
            y: gy + gridHeight * cellSize + 80,
            depth: 1007
        });
        this.equipmentElements.push(...this._actionBtnEls);
    }

    _confirmPlacement(col, row) {
        const gameState = this.registry.get('gameState');
        if (!gameState || !gameState.equipment) return;

        const item = this._heldItem || this._selectedItem;
        if (!item) return;

        // If held from grid, remove old placement first
        if (this._heldItem && this._heldItem._gridEntry) {
            gameState.equipment.grid = EquipmentSystem.removeItem(
                gameState.equipment.grid, this._heldItem._gridEntry.itemId);
        }
        // If from stash, remove from stash
        else if (this._selectedItem && this._selectedItem._stashIndex !== undefined) {
            gameState.equipment.stash.splice(this._selectedItem._stashIndex, 1);
        }

        gameState.equipment.grid = EquipmentSystem.placeItem(gameState.equipment.grid, item, col, row);

        this._selectedItem = null;
        this._heldItem = null;
        this._refreshEquipmentDisplay();
    }

    _rotateItem() {
        const item = this._heldItem || this._selectedItem;
        if (!item) return;
        item.rotation = ((item.rotation || 0) + 1) % 4;
        // Re-render ghost if visible
        this._clearGhostPiece();
        this._clearStatPreview();
    }

    _flipItem() {
        const item = this._heldItem || this._selectedItem;
        if (!item) return;
        item.flipped = !item.flipped;
        this._clearGhostPiece();
        this._clearStatPreview();
    }

    _sellItem(entry) {
        const gameState = this.registry.get('gameState');
        if (!gameState || !gameState.equipment) return;

        const cfg = ConfigLoader.getEquipmentItem(entry.itemId);
        if (!cfg) return;

        const balance = ConfigLoader.getEquipmentBalance();
        const sellPrice = Math.floor((cfg.buyPrice || 0) * (balance.sellPriceMultiplier || 0.5));
        gameState.gold = (gameState.gold || 0) + sellPrice;
        gameState.equipment.grid = EquipmentSystem.removeItem(gameState.equipment.grid, entry.itemId);

        this._selectedItem = null;
        this._refreshEquipmentDisplay();
    }

    _discardItem(entry) {
        this._clearActionButtons();
        const { x: gx, y: gy, cellSize } = this._gridConfig;
        const gridWidth = (ConfigLoader.getEquipmentBalance().gridWidth || 3);
        const gridHeight = (ConfigLoader.getEquipmentBalance().gridHeight || 5);

        // Confirmation prompt
        const confirmEls = [];
        const confirmTxt = this.add.text(
            gx + (gridWidth * cellSize) / 2, gy + gridHeight * cellSize + 65,
            'Destroy this item permanently?',
            makeStyle(TEXT_STYLES.BODY_SMALL, { color: '#ff6666' })
        ).setOrigin(0.5).setDepth(1008).setScrollFactor(0);
        confirmEls.push(confirmTxt);

        const yesBtn = UIButton.create(this, {
            x: gx + (gridWidth * cellSize) / 2 - 40,
            y: gy + gridHeight * cellSize + 82,
            label: '[ YES ]',
            style: makeStyle(TEXT_STYLES.BUTTON, { fontSize: '10px', stroke: '#000000', strokeThickness: 2 }),
            depth: 1008, color: '#ff6666', hoverColor: '#ffffff',
            onClick: () => {
                const gs = this.registry.get('gameState');
                if (gs && gs.equipment) {
                    gs.equipment.grid = EquipmentSystem.removeItem(gs.equipment.grid, entry.itemId);
                }
                for (const el of confirmEls) el.destroy();
                this._selectedItem = null;
                this._refreshEquipmentDisplay();
            }
        });
        confirmEls.push(yesBtn);

        const noBtn = UIButton.create(this, {
            x: gx + (gridWidth * cellSize) / 2 + 40,
            y: gy + gridHeight * cellSize + 82,
            label: '[ NO ]',
            style: makeStyle(TEXT_STYLES.BUTTON, { fontSize: '10px', stroke: '#000000', strokeThickness: 2 }),
            depth: 1008, hoverColor: '#ffffff',
            onClick: () => {
                for (const el of confirmEls) el.destroy();
            }
        });
        confirmEls.push(noBtn);

        this.equipmentElements.push(...confirmEls);
    }

    _pickUpItem(entry) {
        const gameState = this.registry.get('gameState');
        if (!gameState || !gameState.equipment) return;

        const cfg = ConfigLoader.getEquipmentItem(entry.itemId);
        if (!cfg) return;

        this._heldItem = { ...cfg, id: cfg.id, rotation: entry.rotation, flipped: entry.flipped, _gridEntry: entry };
        this._selectedItem = null;

        this._clearTooltip();
        this._clearActionButtons();
        this._clearGhostPiece();
        this._clearStatPreview();

        // Show rotate/flip buttons for repositioning
        const { x: gx, y: gy, cellSize } = this._gridConfig;
        const gridWidth = (ConfigLoader.getEquipmentBalance().gridWidth || 3);
        const gridHeight = (ConfigLoader.getEquipmentBalance().gridHeight || 5);
        this._actionBtnEls = EquipmentRenderer.renderActionButtons(this, [
            { label: 'ROTATE', onClick: () => this._rotateItem() },
            { label: 'FLIP', onClick: () => this._flipItem() }
        ], { x: gx + (gridWidth * cellSize) / 2, y: gy + gridHeight * cellSize + 80, depth: 1007 });
        this.equipmentElements.push(...this._actionBtnEls);
    }

    _clearGhostPiece() {
        for (const el of this._ghostCells) el.destroy();
        this._ghostCells = [];
    }

    _clearTooltip() {
        for (const el of this._tooltipEls) el.destroy();
        this._tooltipEls = [];
    }

    _clearActionButtons() {
        for (const el of this._actionBtnEls) el.destroy();
        this._actionBtnEls = [];
    }

    _clearStatPreview() {
        for (const el of this._statPreviewEls) el.destroy();
        this._statPreviewEls = [];
    }
}
