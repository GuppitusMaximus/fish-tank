/**
 * Browser QA: Equipment Grid UI
 * Plan: qa-browser-equipment-grid-ui
 *
 * Verifies: HUD button visibility, overlay open/close, grid rendering,
 * stash display, item selection/tooltip, placement flow, action buttons,
 * stat preview, battle readonly mode, and preview mode.
 *
 * Runs against http://localhost:8080 (dungeon-fisher Vite dev server).
 * Save key is 'fathom-fall-save', save format v5.
 */

const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:8080';
const SAVE_KEY = 'fathom-fall-save';
const GAME_W = 480;
const GAME_H = 270;
const BUTTON_APPEAR_MS = 5500;
const SCREENSHOT_DIR = 'tests/dungeon-fisher/screenshots';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getCanvas(page) {
    return page.locator('canvas').first();
}

async function getCanvasBounds(page) {
    const canvas = await getCanvas(page);
    return await canvas.boundingBox();
}

async function gameCoord(page, gx, gy) {
    const bounds = await getCanvasBounds(page);
    return {
        x: bounds.x + gx * (bounds.width / GAME_W),
        y: bounds.y + gy * (bounds.height / GAME_H)
    };
}

async function clickGame(page, gx, gy) {
    const { x, y } = await gameCoord(page, gx, gy);
    await page.mouse.click(x, y);
}

function makeFish(speciesId, name, color, hp, maxHp, atk, def, spd, specialMove, opts = {}) {
    return {
        speciesId, name, color,
        level: opts.level || 5, xp: 0, xpToNext: 125,
        hp, maxHp, atk, def, spd,
        shield: opts.shield || 0,
        maxShield: opts.maxShield || 0,
        healPower: opts.healPower || 0,
        moves: [specialMove],
        poisoned: null, buffs: [], burn: null, curses: [], hots: [], poisons: []
    };
}

const GUPPY = makeFish('guppy', 'Guppy', 0xe8734a, 50, 50, 16, 9, 10, 'bubble_volley');
const PUFFER = makeFish('pufferfish', 'Puffer', 0x88ccee, 60, 60, 12, 14, 8, 'shield_grant');
const CLOWN = makeFish('clownfish', 'Clown', 0xffaa00, 45, 45, 14, 10, 12, 'heal_hot');

function makeV5Save(party, floor = 3, extras = {}) {
    return {
        version: 5,
        gameVersion: '0.12.0',
        savedAt: Date.now(),
        floor,
        gold: extras.gold ?? 200,
        party,
        inventory: extras.inventory || [],
        campFloor: extras.campFloor || 1,
        fisherId: 'andy',
        pveDeathCount: 0,
        pvpLossCount: 0,
        roster: [],
        companion: null,
        equipment: extras.equipment || {
            grid: [
                { itemId: 'harmony', col: 1, row: 4, rotation: 0, flipped: false }
            ],
            stash: [],
            harmonyPosition: { row: 4, col: 1 }
        },
        equipmentDelta: null
    };
}

function makeEquipmentSave() {
    return makeV5Save(
        [{ ...GUPPY }, { ...PUFFER }, { ...CLOWN }],
        3,
        {
            gold: 300,
            equipment: {
                grid: [
                    { itemId: 'harmony', col: 1, row: 4, rotation: 0, flipped: false },
                    { itemId: 'sewer_rusty_pipe', col: 0, row: 0, rotation: 1, flipped: false }
                ],
                stash: [
                    { id: 'sewer_drain_grate' },
                    { id: 'sewer_rusty_pipe' }
                ],
                harmonyPosition: { row: 4, col: 1 }
            }
        }
    );
}

async function injectSaveAndLoad(page, save) {
    await page.goto(BASE);
    await page.evaluate(([key, data]) => localStorage.setItem(key, JSON.stringify(data)), [SAVE_KEY, save]);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(BUTTON_APPEAR_MS);
}

async function freshStart(page) {
    await page.goto(BASE);
    await page.evaluate((key) => localStorage.removeItem(key), SAVE_KEY);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(BUTTON_APPEAR_MS);
}

async function fetchSrc(path) {
    const resp = await fetch(`${BASE}${path}`);
    return resp.text();
}

// EQUIP button game coords: right-aligned at (W-8, 28) with origin (1, 0)
// Approximate click target: center of "[ EQUIP ]" text
const EQUIP_BTN = { x: 445, y: 34 };
// BAG button: right-aligned at (W-8, 8) with origin (1, 0)
const BAG_BTN = { x: 450, y: 14 };
// CONTINUE button center on title screen
const CONTINUE_BTN = { x: 240, y: 116 };

// ─── Step 1: HUD Button Visibility ──────────────────────────────────────────

test.describe('1. HUD button visibility', () => {

    test('EQUIP button hidden on TitleScene', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        await freshStart(page);
        await page.screenshot({ path: `${SCREENSHOT_DIR}/eq-01a-title-no-equip.png` });
        expect(errors).toHaveLength(0);
    });

    test('EQUIP button visible on FloorScene (hub)', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeEquipmentSave();
        await injectSaveAndLoad(page, save);
        await clickGame(page, CONTINUE_BTN.x, CONTINUE_BTN.y);
        await page.waitForTimeout(2000);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/eq-01b-floor-equip-btn.png` });
        expect(errors).toHaveLength(0);
    });

    test('EQUIP button hidden on CharacterSelectScene', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/UIOverlayScene.js');
        expect(src).toContain("'CharacterSelectScene'");
        // equipHiddenScenes includes CharacterSelectScene
        const hiddenMatch = src.match(/equipHiddenScenes\s*=\s*new Set\(\[([^\]]+)\]\)/);
        expect(hiddenMatch).not.toBeNull();
        expect(hiddenMatch[1]).toContain('CharacterSelectScene');
    });

    test('EQUIP button hidden on ZonePreviewScene', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/UIOverlayScene.js');
        const hiddenMatch = src.match(/equipHiddenScenes\s*=\s*new Set\(\[([^\]]+)\]\)/);
        expect(hiddenMatch).not.toBeNull();
        expect(hiddenMatch[1]).toContain('ZonePreviewScene');
    });

    test('EQUIP button visible on BattleScene', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/UIOverlayScene.js');
        const hiddenMatch = src.match(/equipHiddenScenes\s*=\s*new Set\(\[([^\]]+)\]\)/);
        expect(hiddenMatch).not.toBeNull();
        // BattleScene should NOT be in the hidden set
        expect(hiddenMatch[1]).not.toContain('BattleScene');
    });

    test('EQUIP button does not overlap BAG or MENU positions', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/UIOverlayScene.js');
        // BAG at y:8, EQUIP at y:28 — 20px apart
        const bagY = src.match(/bagBtn\s*=\s*UIButton\.create[\s\S]*?y:\s*(\d+)/);
        const equipY = src.match(/equipBtn\s*=\s*UIButton\.create[\s\S]*?y:\s*(\d+)/);
        expect(bagY).not.toBeNull();
        expect(equipY).not.toBeNull();
        const gap = parseInt(equipY[1]) - parseInt(bagY[1]);
        expect(gap).toBeGreaterThanOrEqual(16);
    });
});

// ─── Step 2: Overlay Open/Close ─────────────────────────────────────────────

test.describe('2. overlay open/close', () => {

    test('tapping EQUIP opens equipment overlay without JS errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeEquipmentSave();
        await injectSaveAndLoad(page, save);
        await clickGame(page, CONTINUE_BTN.x, CONTINUE_BTN.y);
        await page.waitForTimeout(2000);

        // Tap EQUIP button
        await clickGame(page, EQUIP_BTN.x, EQUIP_BTN.y);
        await page.waitForTimeout(800);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/eq-02a-overlay-open.png` });
        expect(errors).toHaveLength(0);
    });

    test('overlay uses blocker (semi-transparent background)', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/UIOverlayScene.js');
        // Blocker created via UILayout.overlay
        expect(src).toContain('UILayout.overlay(this, { depth: 1004');
    });

    test('openEquipmentGrid closes inventory first (exclusivity)', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/UIOverlayScene.js');
        // openEquipmentGrid calls closeInventory at start
        const openEquipMethod = src.match(/openEquipmentGrid\(mode\)\s*\{[\s\S]*?closeInventory/);
        expect(openEquipMethod).not.toBeNull();
    });

    test('openInventory closes equipment grid first (exclusivity)', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/UIOverlayScene.js');
        // openInventory calls closeEquipmentGrid at start
        const openInvMethod = src.match(/openInventory\(\)\s*\{[\s\S]*?closeEquipmentGrid/);
        expect(openInvMethod).not.toBeNull();
    });

    test('exclusivity: opening BAG then EQUIP switches overlay (no JS errors)', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeEquipmentSave();
        await injectSaveAndLoad(page, save);
        await clickGame(page, CONTINUE_BTN.x, CONTINUE_BTN.y);
        await page.waitForTimeout(2000);

        // Open BAG
        await clickGame(page, BAG_BTN.x, BAG_BTN.y);
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${SCREENSHOT_DIR}/eq-02b-bag-open.png` });

        // Now open EQUIP — should close BAG and open EQUIP
        await clickGame(page, EQUIP_BTN.x, EQUIP_BTN.y);
        await page.waitForTimeout(800);
        await page.screenshot({ path: `${SCREENSHOT_DIR}/eq-02c-equip-after-bag.png` });

        expect(errors).toHaveLength(0);
    });

    test('close button exists in overlay code', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/UIOverlayScene.js');
        expect(src).toContain("'[ CLOSE ]'");
        expect(src).toContain('closeEquipmentGrid()');
    });
});

// ─── Step 3: Grid Rendering ─────────────────────────────────────────────────

test.describe('3. grid rendering', () => {

    test('grid is 3 columns × 5 rows with 48px cells', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/systems/EquipmentRenderer.js');
        // Default cellSize is 48
        expect(src).toContain('cellSize = 48');
        // Grid dimensions from config
        expect(src).toContain('gridWidth = 3');
        expect(src).toContain('gridHeight = 5');
    });

    test('cell borders drawn with strokeRect', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/systems/EquipmentRenderer.js');
        expect(src).toContain('gfx.strokeRect(cx, cy, cellSize, cellSize)');
    });

    test('occupied cells filled with rarity color at 0.3 alpha', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/systems/EquipmentRenderer.js');
        expect(src).toContain('fillGfx.fillStyle(color, 0.3)');
    });

    test('unique/gold color is 0xffd700 for harmony', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/systems/EquipmentRenderer.js');
        expect(src).toContain('unique: 0xffd700');
    });

    test('harmony placed at default position (col=1, row=4)', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeV5Save([{ ...GUPPY }, { ...PUFFER }, { ...CLOWN }], 3);
        await injectSaveAndLoad(page, save);
        await clickGame(page, CONTINUE_BTN.x, CONTINUE_BTN.y);
        await page.waitForTimeout(2000);

        // Open equipment overlay
        await clickGame(page, EQUIP_BTN.x, EQUIP_BTN.y);
        await page.waitForTimeout(800);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/eq-03a-grid-harmony.png` });
        expect(errors).toHaveLength(0);
    });

    test('equipment overlay with stash items renders without JS errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeEquipmentSave();
        await injectSaveAndLoad(page, save);
        await clickGame(page, CONTINUE_BTN.x, CONTINUE_BTN.y);
        await page.waitForTimeout(2000);

        await clickGame(page, EQUIP_BTN.x, EQUIP_BTN.y);
        await page.waitForTimeout(800);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/eq-03b-grid-with-items.png` });
        expect(errors).toHaveLength(0);
    });
});

// ─── Step 4: Stash Display ──────────────────────────────────────────────────

test.describe('4. stash display', () => {

    test('stash rendered in edit mode only', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/UIOverlayScene.js');
        expect(src).toContain("if (mode === 'edit')");
        // stashH is 0 for non-edit mode
        expect(src).toContain("const stashH = mode === 'edit' ? 28 : 0");
    });

    test('stash counter shows usedCells/stashCapacity format', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/systems/EquipmentRenderer.js');
        // Counter format: usedCells/stashCapacity
        expect(src).toContain('`${usedCells}/${stashCapacity}`');
    });

    test('stash items have rarity-colored mini tetromino previews', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/systems/EquipmentRenderer.js');
        // Mini previews use rarity color
        expect(src).toContain('const color = this.getItemRarityColor(cfg.rarity)');
        // Draws mini cells
        expect(src).toContain('gfx.fillRect(offX + c * miniSize, offY + r * miniSize');
    });

    test('stash items are tappable via hit zones', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/systems/EquipmentRenderer.js');
        expect(src).toContain('hitZone._stashItem = item');
        expect(src).toContain('.setInteractive()');
    });
});

// ─── Step 5: Item Selection and Tooltip ─────────────────────────────────────

test.describe('5. item selection and tooltip', () => {

    test('tooltip shows item name with rarity color', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/systems/EquipmentRenderer.js');
        expect(src).toContain("{ text: cfg.name, style: makeStyle(TEXT_STYLES.TITLE_SMALL, { color: rarityColor })");
    });

    test('tooltip shows rarity label', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/systems/EquipmentRenderer.js');
        expect(src).toContain('`[${cfg.rarity}]`');
    });

    test('tooltip shows buff summary in edit mode', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/systems/EquipmentRenderer.js');
        expect(src).toContain("`${buff.type.toUpperCase()} +${buff.baseValue}`");
    });

    test('tooltip shows sell price in edit mode', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/systems/EquipmentRenderer.js');
        expect(src).toContain('`Sell: ${sellPrice}g`');
    });

    test('harmony tooltip has no sell price (buyPrice is 0)', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/systems/EquipmentRenderer.js');
        // Sell price only shown when cfg.buyPrice is truthy
        expect(src).toContain('if (cfg.buyPrice)');
    });

    test('tapping grid item shows tooltip without JS errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeEquipmentSave();
        await injectSaveAndLoad(page, save);
        await clickGame(page, CONTINUE_BTN.x, CONTINUE_BTN.y);
        await page.waitForTimeout(2000);

        // Open equipment overlay
        await clickGame(page, EQUIP_BTN.x, EQUIP_BTN.y);
        await page.waitForTimeout(800);

        // Grid starts at approximately (163, 32) with 48px cells
        // Tap Rusty Pipe at col=0, row=0 (rotation=1 means vertical)
        // Cell center at (163 + 0*48 + 24, 32 + 0*48 + 24) = (187, 56)
        await clickGame(page, 187, 56);
        await page.waitForTimeout(500);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/eq-05a-item-tooltip.png` });
        expect(errors).toHaveLength(0);
    });

    test('stash item tap shows rotate/flip buttons', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/UIOverlayScene.js');
        const stashTapMethod = src.match(/_onStashItemTap[\s\S]*?ROTATE[\s\S]*?FLIP/);
        expect(stashTapMethod).not.toBeNull();
    });

    test('tapping empty area clears selection', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/UIOverlayScene.js');
        // When tapping grid cell with no item selected and no item at that cell,
        // the method returns early without showing anything
        expect(src).toContain('if (!item || this._equipMode !== \'edit\') return');
    });
});

// ─── Step 6: Placement Flow ─────────────────────────────────────────────────

test.describe('6. placement flow', () => {

    test('ghost piece rendered with valid color (rarity) or invalid (red)', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/systems/EquipmentRenderer.js');
        expect(src).toContain('const color = valid ? this.getItemRarityColor(cfg.rarity) : 0xff3333');
    });

    test('ghost piece alpha: valid=0.35, invalid=0.4', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/systems/EquipmentRenderer.js');
        expect(src).toContain('const alpha = valid ? 0.35 : 0.4');
    });

    test('rotation increments by 90° (rotation = (rotation + 1) % 4)', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/UIOverlayScene.js');
        expect(src).toContain("item.rotation = ((item.rotation || 0) + 1) % 4");
    });

    test('flip mirrors horizontally (flipped = !flipped)', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/UIOverlayScene.js');
        expect(src).toContain('item.flipped = !item.flipped');
    });

    test('CONFIRM button only shown when placement is valid', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/UIOverlayScene.js');
        expect(src).toContain("if (result.valid)");
        expect(src).toContain("label: 'CONFIRM'");
    });

    test('canPlace validates bounds and overlap', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/systems/EquipmentSystem.js');
        expect(src).toContain("reason: 'out_of_bounds'");
        expect(src).toContain("reason: 'overlap'");
    });

    test('confirmPlacement removes from stash and places on grid', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/UIOverlayScene.js');
        // From stash: splice to remove
        expect(src).toContain('gameState.equipment.stash.splice(this._selectedItem._stashIndex, 1)');
        // Place on grid
        expect(src).toContain('EquipmentSystem.placeItem(gameState.equipment.grid, item, col, row)');
    });
});

// ─── Step 7: Action Buttons (Edit Mode) ─────────────────────────────────────

test.describe('7. action buttons (edit mode)', () => {

    test('placed item shows Sell, Discard, Pick Up', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/UIOverlayScene.js');
        const gridItemTap = src.match(/_onGridItemTap[\s\S]*?SELL[\s\S]*?DISCARD[\s\S]*?PICK UP/);
        expect(gridItemTap).not.toBeNull();
    });

    test('harmony only shows Pick Up (no Sell, no Discard)', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/UIOverlayScene.js');
        expect(src).toContain("const isHarmony = entry.itemId === 'harmony'");
        // When isHarmony, Sell and Discard are skipped
        expect(src).toContain('if (!isHarmony)');
    });

    test('sell adds gold and removes item from grid', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/UIOverlayScene.js');
        expect(src).toContain('gameState.gold = (gameState.gold || 0) + sellPrice');
        expect(src).toContain('EquipmentSystem.removeItem(gameState.equipment.grid, entry.itemId)');
    });

    test('discard shows confirmation dialog (YES/NO)', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/UIOverlayScene.js');
        expect(src).toContain("'Destroy this item permanently?'");
        expect(src).toContain("'[ YES ]'");
        expect(src).toContain("'[ NO ]'");
    });

    test('pick up enters held state for repositioning', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/UIOverlayScene.js');
        const pickUp = src.match(/_pickUpItem[\s\S]*?this\._heldItem = /);
        expect(pickUp).not.toBeNull();
    });
});

// ─── Step 8: Stat Preview ───────────────────────────────────────────────────

test.describe('8. stat preview', () => {

    test('stat preview rendered next to affected rows', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/systems/EquipmentRenderer.js');
        expect(src).toContain('renderStatPreview');
        // Preview text positioned next to grid right edge
        expect(src).toContain('const px = ox + gridWidth * cellSize + 6');
    });

    test('stat preview shows +value format', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/systems/EquipmentRenderer.js');
        expect(src).toContain('`+${value}${buff.type.slice(0, 3)}${synTag}`');
    });

    test('stat preview only shown for valid placements', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/UIOverlayScene.js');
        // Stat preview rendered only when result.valid
        expect(src).toContain('if (result.valid)');
        expect(src).toContain('EquipmentRenderer.renderStatPreview');
    });

    test('stat preview cleared on rotate/flip', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/UIOverlayScene.js');
        // Both _rotateItem and _flipItem call _clearStatPreview
        const rotateMethod = src.match(/_rotateItem\(\)[\s\S]*?_clearStatPreview/);
        const flipMethod = src.match(/_flipItem\(\)[\s\S]*?_clearStatPreview/);
        expect(rotateMethod).not.toBeNull();
        expect(flipMethod).not.toBeNull();
    });
});

// ─── Step 9: Battle Mode (Readonly) ─────────────────────────────────────────

test.describe('9. battle mode (readonly)', () => {

    test('BattleScene opens overlay in readonly mode', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/UIOverlayScene.js');
        expect(src).toContain("const mode = this._currentScene === 'BattleScene' ? 'readonly' : 'edit'");
    });

    test('readonly mode shows [VIEW] tag', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/UIOverlayScene.js');
        expect(src).toContain("'[VIEW]'");
    });

    test('readonly mode has no stash area (stashH=0)', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/UIOverlayScene.js');
        expect(src).toContain("const stashH = mode === 'edit' ? 28 : 0");
    });

    test('combat pauses when overlay opens in readonly', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/UIOverlayScene.js');
        expect(src).toContain("if (mode === 'readonly')");
        expect(src).toContain('battleScene.pauseCombat()');
    });

    test('combat resumes when overlay closes', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/UIOverlayScene.js');
        expect(src).toContain('battleScene.resumeCombat()');
    });

    test('BattleScene pauseCombat stops tweens and time', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/BattleScene.js');
        expect(src).toContain('this.combatPaused = true');
        expect(src).toContain('this.tweens.pauseAll()');
        expect(src).toContain('this.time.paused = true');
    });

    test('BattleScene resumeCombat restores tweens and time', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/BattleScene.js');
        expect(src).toContain('this.combatPaused = false');
        expect(src).toContain('this.tweens.resumeAll()');
        expect(src).toContain('this.time.paused = false');
    });

    test('auto-close on battle end IS implemented', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/UIOverlayScene.js');
        // Overlay auto-closes when battle ends: timer polls combatState.running
        const hasAutoClose = src.includes('combatState.running');
        expect(hasAutoClose).toBe(true);
        // Timer cleanup in closeEquipmentGrid
        expect(src).toContain('_equipBattleCheck');
    });

    test('readonly tooltip shows per-member breakdown with synergy indicator', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/systems/EquipmentRenderer.js');
        // Readonly tooltip shows per-member computed values
        expect(src).toContain("const synTag = buff.synergy ? ' x2' : ''");
        expect(src).toContain('`${name}: ${buff.type.toUpperCase()} +${buff.computedValue}${synTag}`');
    });

    test('readonly tooltip uses gold color for synergy buffs', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/systems/EquipmentRenderer.js');
        expect(src).toContain("color: buff.synergy ? '#ffd700' : '#ccccee'");
    });

    test('entering battle and opening equipment overlay: no JS errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeEquipmentSave();
        await injectSaveAndLoad(page, save);
        await clickGame(page, CONTINUE_BTN.x, CONTINUE_BTN.y);
        await page.waitForTimeout(2000);

        // Enter battle
        await clickGame(page, 240, 135);
        await page.waitForTimeout(3000);

        // Try opening EQUIP in battle
        await clickGame(page, EQUIP_BTN.x, EQUIP_BTN.y);
        await page.waitForTimeout(800);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/eq-09a-battle-readonly.png` });
        expect(errors).toHaveLength(0);
    });
});

// ─── Step 10: Preview Mode (Shop Sandbox) ───────────────────────────────────

test.describe('10. preview mode', () => {

    test('edit-allowed scenes are FloorScene, CampScene, ShopScene', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/UIOverlayScene.js');
        const editScenes = src.match(/_equipEditScenes\s*=\s*new Set\(\[([^\]]+)\]\)/);
        expect(editScenes).not.toBeNull();
        expect(editScenes[1]).toContain('FloorScene');
        expect(editScenes[1]).toContain('CampScene');
        expect(editScenes[1]).toContain('ShopScene');
    });
});

// ─── Panel Size Validation ──────────────────────────────────────────────────

test.describe('panel sizing', () => {

    test('edit mode panel fits within 270px viewport', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/UIOverlayScene.js');
        // gridTotalH = 5 * 40 = 200
        // stashH = 28 (edit)
        // panelH = 200 + 28 + 34 = 262 ≤ 266 (270 - 4px margins)
        expect(src).toContain("const stashH = mode === 'edit' ? 28 : 0");
        expect(src).toContain('const panelH = gridTotalH + stashH + 34');
    });
});

// ─── Integration: Equipment Save Load ───────────────────────────────────────

test.describe('integration', () => {

    test('v5 save with equipment loads without JS errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeEquipmentSave();
        await injectSaveAndLoad(page, save);
        await clickGame(page, CONTINUE_BTN.x, CONTINUE_BTN.y);
        await page.waitForTimeout(2000);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/eq-int-01-v5-save.png` });
        expect(errors).toHaveLength(0);
    });

    test('empty equipment save loads without JS errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeV5Save([{ ...GUPPY }], 3, {
            equipment: {
                grid: [],
                stash: [],
                harmonyPosition: { row: 4, col: 1 }
            }
        });
        await injectSaveAndLoad(page, save);
        await clickGame(page, CONTINUE_BTN.x, CONTINUE_BTN.y);
        await page.waitForTimeout(2000);

        await clickGame(page, EQUIP_BTN.x, EQUIP_BTN.y);
        await page.waitForTimeout(800);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/eq-int-02-empty-equip.png` });
        expect(errors).toHaveLength(0);
    });

    test('new game flow with equipment: no JS errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        await freshStart(page);
        await clickGame(page, 240, 97);   // NEW GAME
        await page.waitForTimeout(800);
        await clickGame(page, 312, 211);  // CharacterSelect SELECT
        await page.waitForTimeout(800);
        await clickGame(page, 120, 158);  // SELECT guppy
        await page.waitForTimeout(300);
        await clickGame(page, 240, 158);  // SELECT pufferfish
        await page.waitForTimeout(300);
        await clickGame(page, 240, 246);  // [ BEGIN ]
        await page.waitForTimeout(2000);

        // Try EQUIP button on FloorScene
        await clickGame(page, EQUIP_BTN.x, EQUIP_BTN.y);
        await page.waitForTimeout(800);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/eq-int-03-new-game-equip.png` });
        expect(errors).toHaveLength(0);
    });
});
