import ConfigLoader from './ConfigLoader.js';
import EquipmentSystem from './EquipmentSystem.js';
import { TEXT_STYLES, makeStyle } from '../constants/textStyles.js';
import { UIButton } from '../ui/index.js';

const RARITY_COLORS = {
    standard: 0x888888,
    magic: 0x44aa44,
    rare: 0x9944cc,
    unique: 0xffd700
};

const RARITY_HEX = {
    standard: '#888888',
    magic: '#44aa44',
    rare: '#9944cc',
    unique: '#ffd700'
};

const ROW_MEMBERS = {
    0: [0],
    1: [0, 1],
    2: [1],
    3: [1, 2],
    4: [2]
};

export default class EquipmentRenderer {

    static getItemRarityColor(rarity) {
        return RARITY_COLORS[rarity] || RARITY_COLORS.standard;
    }

    static renderGrid(scene, grid, config) {
        const { x: ox, y: oy, cellSize = 48, depth = 1006, gridWidth = 3, gridHeight = 5 } = config;
        const els = [];

        const gfx = scene.add.graphics().setDepth(depth).setScrollFactor(0);

        // Draw cell borders
        for (let r = 0; r < gridHeight; r++) {
            for (let c = 0; c < gridWidth; c++) {
                const cx = ox + c * cellSize;
                const cy = oy + r * cellSize;
                gfx.lineStyle(1, 0x554433, 0.6);
                gfx.strokeRect(cx, cy, cellSize, cellSize);
            }
        }
        els.push(gfx);

        // Draw placed items
        const occupied = new Map(); // "col,row" -> entry
        for (const entry of grid) {
            const itemConfig = ConfigLoader.getEquipmentItem(entry.itemId);
            if (!itemConfig) continue;
            const cells = EquipmentSystem.getShapeCells(itemConfig.shape, entry.rotation, entry.flipped);
            for (const [c, r] of cells) {
                occupied.set(`${entry.col + c},${entry.row + r}`, { entry, itemConfig });
            }
        }

        // Fill occupied cells with rarity color
        const fillGfx = scene.add.graphics().setDepth(depth).setScrollFactor(0);
        for (const [key, { itemConfig }] of occupied) {
            const [c, r] = key.split(',').map(Number);
            const cx = ox + c * cellSize;
            const cy = oy + r * cellSize;
            const color = this.getItemRarityColor(itemConfig.rarity);
            fillGfx.fillStyle(color, 0.3);
            fillGfx.fillRect(cx + 1, cy + 1, cellSize - 2, cellSize - 2);
        }
        els.push(fillGfx);

        // Render item sprites/fallbacks at each item's anchor cell
        const rendered = new Set();
        for (const entry of grid) {
            if (rendered.has(entry.itemId)) continue;
            rendered.add(entry.itemId);
            const itemConfig = ConfigLoader.getEquipmentItem(entry.itemId);
            if (!itemConfig) continue;
            const cells = EquipmentSystem.getShapeCells(itemConfig.shape, entry.rotation, entry.flipped);
            // Render sprite at center of bounding box
            let minC = Infinity, maxC = -Infinity, minR = Infinity, maxR = -Infinity;
            for (const [c, r] of cells) {
                minC = Math.min(minC, entry.col + c);
                maxC = Math.max(maxC, entry.col + c);
                minR = Math.min(minR, entry.row + r);
                maxR = Math.max(maxR, entry.row + r);
            }
            const centerX = ox + (minC + maxC + 1) * cellSize / 2;
            const centerY = oy + (minR + maxR + 1) * cellSize / 2;
            els.push(...this.renderItemSprite(scene, itemConfig, centerX, centerY, cellSize * 0.7, depth + 1));
        }

        return els;
    }

    static renderRowLabels(scene, party, config) {
        const { x: ox, y: oy, cellSize = 48, depth = 1006, gridHeight = 5 } = config;
        const els = [];

        for (let r = 0; r < gridHeight; r++) {
            const members = ROW_MEMBERS[r] || [];
            const cy = oy + r * cellSize + cellSize / 2;

            for (let mi = 0; mi < members.length; mi++) {
                const fish = party[members[mi]];
                if (!fish) continue;
                const px = ox - 38 - mi * 20;
                const py = cy - (members.length > 1 ? 6 - mi * 12 : 0);
                const spriteKey = `fish_${fish.speciesId || fish.id}`;
                if (scene.textures.exists(spriteKey)) {
                    const img = scene.add.image(px, py, spriteKey)
                        .setScale(0.35).setDepth(depth).setScrollFactor(0);
                    els.push(img);
                } else {
                    const gfx = scene.add.graphics().setDepth(depth).setScrollFactor(0);
                    gfx.fillStyle(fish.color || 0x6688aa, 1);
                    gfx.fillCircle(px, py, 8);
                    els.push(gfx);
                    const lbl = scene.add.text(px, py, (fish.name || '?')[0],
                        makeStyle(TEXT_STYLES.BODY_SMALL, { fontSize: '9px', color: '#ffffff' }))
                        .setOrigin(0.5).setDepth(depth + 1).setScrollFactor(0);
                    els.push(lbl);
                }
            }
        }

        return els;
    }

    static renderStash(scene, stash, config) {
        const { x: ox, y: oy, depth = 1006, cellSize = 40, gap = 8, maxCols = 5, stashCapacity = 15 } = config;
        const els = [];

        // Cell counter
        let usedCells = 0;
        for (const item of stash) {
            const cfg = ConfigLoader.getEquipmentItem(item.id || item.itemId);
            if (!cfg) continue;
            const cells = EquipmentSystem.getShapeCells(cfg.shape, 0, false);
            usedCells += cells.length;
        }
        const counter = scene.add.text(ox, oy - 14, `${usedCells}/${stashCapacity}`,
            makeStyle(TEXT_STYLES.BODY_SMALL, { color: '#aaaaaa' }))
            .setDepth(depth + 1).setScrollFactor(0);
        els.push(counter);

        // Mini tetromino previews in wrap layout
        for (let i = 0; i < stash.length; i++) {
            const item = stash[i];
            const cfg = ConfigLoader.getEquipmentItem(item.id || item.itemId);
            if (!cfg) continue;
            const col = i % maxCols;
            const row = Math.floor(i / maxCols);
            const sx = ox + col * (cellSize + gap);
            const sy = oy + row * (cellSize + gap);

            const color = this.getItemRarityColor(cfg.rarity);
            const cells = EquipmentSystem.getShapeCells(cfg.shape, 0, false);

            // Find bounds for centering
            let maxC = 0, maxR = 0;
            for (const [c, r] of cells) { maxC = Math.max(maxC, c); maxR = Math.max(maxR, r); }
            const miniSize = Math.min(cellSize / (maxC + 1), cellSize / (maxR + 1), 10);
            const offX = sx + (cellSize - (maxC + 1) * miniSize) / 2;
            const offY = sy + (cellSize - (maxR + 1) * miniSize) / 2;

            const gfx = scene.add.graphics().setDepth(depth).setScrollFactor(0);
            for (const [c, r] of cells) {
                gfx.fillStyle(color, 0.8);
                gfx.fillRect(offX + c * miniSize, offY + r * miniSize, miniSize - 1, miniSize - 1);
            }
            els.push(gfx);

            // Make stash item tappable
            const hitZone = scene.add.zone(sx + cellSize / 2, sy + cellSize / 2, cellSize, cellSize)
                .setDepth(depth + 2).setScrollFactor(0).setInteractive();
            hitZone._stashIndex = i;
            hitZone._stashItem = item;
            els.push(hitZone);
        }

        return els;
    }

    static renderGhostPiece(scene, item, col, row, valid, config) {
        const { x: ox, y: oy, cellSize = 48, depth = 1008 } = config;
        const els = [];
        const cfg = ConfigLoader.getEquipmentItem(item.id || item.itemId);
        if (!cfg) return els;

        const cells = EquipmentSystem.getShapeCells(cfg.shape, item.rotation || 0, item.flipped || false);
        const color = valid ? this.getItemRarityColor(cfg.rarity) : 0xff3333;
        const alpha = valid ? 0.35 : 0.4;

        const gfx = scene.add.graphics().setDepth(depth).setScrollFactor(0);
        for (const [c, r] of cells) {
            const cx = ox + (col + c) * cellSize;
            const cy = oy + (row + r) * cellSize;
            gfx.fillStyle(color, alpha);
            gfx.fillRect(cx + 1, cy + 1, cellSize - 2, cellSize - 2);
            gfx.lineStyle(1, color, 0.7);
            gfx.strokeRect(cx + 1, cy + 1, cellSize - 2, cellSize - 2);
        }
        els.push(gfx);

        return els;
    }

    static renderTooltip(scene, item, position, mode, snapshot, party, config) {
        const { depth = 1007 } = config;
        const els = [];
        const cfg = ConfigLoader.getEquipmentItem(item.id || item.itemId);
        if (!cfg) return els;

        const { x: tx, y: ty } = position;
        const rarityColor = RARITY_HEX[cfg.rarity] || '#888888';

        const lines = [];
        lines.push({ text: cfg.name, style: makeStyle(TEXT_STYLES.TITLE_SMALL, { color: rarityColor }) });
        lines.push({ text: `[${cfg.rarity}]`, style: makeStyle(TEXT_STYLES.BODY_SMALL, { color: rarityColor }) });

        if (mode === 'edit') {
            for (const buff of (cfg.buffs || [])) {
                lines.push({ text: `${buff.type.toUpperCase()} +${buff.baseValue}`, style: makeStyle(TEXT_STYLES.BODY_SMALL, { color: '#ccccee' }) });
            }
            if (cfg.buyPrice) {
                const balance = ConfigLoader.getEquipmentBalance();
                const sellPrice = Math.floor(cfg.buyPrice * (balance.sellPriceMultiplier || 0.5));
                lines.push({ text: `Sell: ${sellPrice}g`, style: makeStyle(TEXT_STYLES.GOLD) });
            }
            if (cfg.zone) {
                lines.push({ text: cfg.zone.replace(/_/g, ' '), style: makeStyle(TEXT_STYLES.FLAVOR) });
            }
        } else if (mode === 'readonly' && snapshot) {
            const itemSnap = snapshot.items.find(s => s.itemId === (item.itemId || item.id));
            if (itemSnap) {
                for (const buff of itemSnap.buffs) {
                    const fish = party[buff.partyIdx];
                    const name = fish ? fish.name : `Fish ${buff.partyIdx + 1}`;
                    const synTag = buff.synergy ? ' x2' : '';
                    lines.push({
                        text: `${name}: ${buff.type.toUpperCase()} +${buff.computedValue}${synTag}`,
                        style: makeStyle(TEXT_STYLES.BODY_SMALL, {
                            color: buff.synergy ? '#ffd700' : '#ccccee'
                        })
                    });
                }
            }
        }

        // Background panel
        const lineHeight = 16;
        const padX = 8, padY = 6;
        const panelW = 160;
        const panelH = lines.length * lineHeight + padY * 2;
        const bg = scene.add.graphics().setDepth(depth).setScrollFactor(0);
        bg.fillStyle(0x1a1a2e, 0.95);
        bg.fillRoundedRect(tx, ty, panelW, panelH, 4);
        bg.lineStyle(1, RARITY_COLORS[cfg.rarity] || 0x888888, 0.6);
        bg.strokeRoundedRect(tx, ty, panelW, panelH, 4);
        els.push(bg);

        for (let i = 0; i < lines.length; i++) {
            const txt = scene.add.text(tx + padX, ty + padY + i * lineHeight, lines[i].text, lines[i].style)
                .setDepth(depth + 1).setScrollFactor(0);
            els.push(txt);
        }

        return els;
    }

    static renderActionButtons(scene, actions, config) {
        const { x: ox, y: oy, depth = 1007, spacing = 70 } = config;
        const els = [];
        const totalW = (actions.length - 1) * spacing;
        const startX = ox - totalW / 2;

        for (let i = 0; i < actions.length; i++) {
            const { label, onClick } = actions[i];
            const btn = UIButton.create(scene, {
                x: startX + i * spacing, y: oy,
                label: `[ ${label} ]`,
                style: makeStyle(TEXT_STYLES.BUTTON, {
                    fontSize: '10px', stroke: '#000000', strokeThickness: 2
                }),
                depth,
                hoverColor: '#ffffff',
                onClick
            });
            els.push(btn);
        }

        return els;
    }

    static renderItemSprite(scene, itemConfig, x, y, size, depth) {
        const els = [];
        const texKey = `item_${itemConfig.id}`;
        if (scene.textures.exists(texKey)) {
            const img = scene.add.image(x, y, texKey)
                .setDisplaySize(size, size)
                .setDepth(depth).setScrollFactor(0);
            els.push(img);
        } else {
            const color = this.getItemRarityColor(itemConfig.rarity);
            const gfx = scene.add.graphics().setDepth(depth).setScrollFactor(0);
            gfx.fillStyle(color, 0.6);
            gfx.fillRoundedRect(x - size / 2, y - size / 2, size, size, 3);
            els.push(gfx);

            const initials = (itemConfig.name || '?').split(' ').map(w => w[0]).join('').slice(0, 2);
            const txt = scene.add.text(x, y, initials,
                makeStyle(TEXT_STYLES.BODY_SMALL, { fontSize: '10px', color: '#ffffff', fontStyle: 'bold' }))
                .setOrigin(0.5).setDepth(depth + 1).setScrollFactor(0);
            els.push(txt);
        }
        return els;
    }

    static renderStatPreview(scene, party, currentGrid, item, col, row, config) {
        const { x: ox, y: oy, cellSize = 48, depth = 1008, gridWidth = 3, gridHeight = 5 } = config;
        const els = [];

        const placement = { valid: true };
        const testResult = EquipmentSystem.canPlace(currentGrid, item, col, row, gridWidth, gridHeight);
        if (!testResult.valid) return els;

        const itemConfig = ConfigLoader.getEquipmentItem(item.id || item.itemId);
        if (!itemConfig) return els;

        const cells = EquipmentSystem.getShapeCells(itemConfig.shape, item.rotation || 0, item.flipped || false);
        const placedCells = cells.map(([c, r]) => [col + c, row + r]);
        const affected = EquipmentSystem.getAffectedPartyMembers(placedCells, party.length);

        // Show +stat indicators next to affected rows
        const balance = ConfigLoader.getEquipmentBalance();
        const zoneIndex = ['sewers', 'goblin_caves', 'bone_crypts', 'deep_dungeon',
            'shadow_realm', 'ancient_chambers', 'dungeon_heart'].indexOf(itemConfig.zone);
        const zoneMult = zoneIndex >= 0 ? (balance.zoneMultipliers[zoneIndex] || 1.0) : 1.0;

        for (const partyIdx of affected) {
            const fish = party[partyIdx];
            if (!fish) continue;
            const previewLines = [];
            for (const buff of (itemConfig.buffs || [])) {
                const hasSynergy = EquipmentSystem.detectSynergy(fish, buff.type);
                const synMult = hasSynergy ? (balance.synergyMultiplier || 2.0) : 1.0;
                const value = Math.floor(buff.baseValue * zoneMult * synMult);
                const synTag = hasSynergy ? '!' : '';
                previewLines.push(`+${value}${buff.type.slice(0, 3)}${synTag}`);
            }
            if (previewLines.length === 0) continue;

            // Position next to the row label area
            const rowForMember = Object.entries(ROW_MEMBERS).find(([, members]) => members.includes(partyIdx));
            if (!rowForMember) continue;
            const displayRow = parseInt(rowForMember[0]);
            const py = oy + displayRow * cellSize + cellSize / 2;
            const px = ox + gridWidth * cellSize + 6;

            const txt = scene.add.text(px, py, previewLines.join(' '),
                makeStyle(TEXT_STYLES.BODY_SMALL, { fontSize: '9px', color: '#88ff88' }))
                .setOrigin(0, 0.5).setDepth(depth).setScrollFactor(0);
            els.push(txt);
        }

        return els;
    }
}

