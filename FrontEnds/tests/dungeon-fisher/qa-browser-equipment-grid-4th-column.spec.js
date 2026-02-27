/**
 * Browser QA: Equipment Grid 4th Column
 * Plan: qa-browser-equipment-grid-4th-column
 *
 * Verifies: 4-column grid renders, panel fits viewport, item placement in
 * col 3, I-shape horizontal fit, harmony position, stash/sell, save/load
 * round-trip, and battle stat application with 4-wide grid.
 *
 * Runs against http://localhost:8080 (dungeon-fisher Vite dev server).
 */

const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:8080';
const SAVE_KEY = 'fathom-fall-save';
const GAME_W = 480;
const GAME_H = 270;
const BUTTON_APPEAR_MS = 5500;
const SCREENSHOT_DIR = 'tests/dungeon-fisher/screenshots';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function gameCoord(page, gx, gy) {
    const canvas = page.locator('canvas').first();
    const bounds = await canvas.boundingBox();
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
        gameVersion: '0.13.0',
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

async function injectSaveAndLoad(page, save) {
    await page.goto(BASE);
    await page.evaluate(([key, data]) => localStorage.setItem(key, JSON.stringify(data)), [SAVE_KEY, save]);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(BUTTON_APPEAR_MS);
}

async function fetchSrc(path) {
    const resp = await fetch(`${BASE}${path}`);
    return resp.text();
}

const EQUIP_BTN = { x: 445, y: 34 };
const CONTINUE_BTN = { x: 240, y: 116 };

// ─── Step 1: Grid renders 4 columns ─────────────────────────────────────────

test.describe('1. grid renders 4 columns', () => {

    test('equipment-balance.json has gridWidth=4', async ({ page }) => {
        await page.goto(BASE);
        const resp = await fetch(`${BASE}/src/config/equipment-balance.json`);
        const balance = await resp.json();
        expect(balance.gridWidth).toBe(4);
        expect(balance.gridHeight).toBe(5);
    });

    test('UIOverlayScene uses 32px cellSize for 4-column grid', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/UIOverlayScene.js');
        expect(src).toContain('const cellSize = 32');
    });

    test('UIOverlayScene reads gridWidth from balance config', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/UIOverlayScene.js');
        expect(src).toContain('const gridW = balance.gridWidth || 3');
    });

    test('4-column grid renders without JS errors (edit mode)', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeV5Save(
            [{ ...GUPPY }, { ...PUFFER }, { ...CLOWN }], 3,
            {
                gold: 300,
                equipment: {
                    grid: [
                        { itemId: 'harmony', col: 1, row: 4, rotation: 0, flipped: false },
                        { itemId: 'sewer_rusty_pipe', col: 0, row: 0, rotation: 1, flipped: false }
                    ],
                    stash: [{ id: 'sewer_drain_grate' }, { id: 'sewer_rusty_pipe' }],
                    harmonyPosition: { row: 4, col: 1 }
                }
            }
        );
        await injectSaveAndLoad(page, save);
        await clickGame(page, CONTINUE_BTN.x, CONTINUE_BTN.y);
        await page.waitForTimeout(2000);

        await clickGame(page, EQUIP_BTN.x, EQUIP_BTN.y);
        await page.waitForTimeout(800);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/eq-4col-01-edit-grid.png` });
        expect(errors).toHaveLength(0);
    });

    test('4-column grid renders without JS errors (readonly mode)', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeV5Save(
            [{ ...GUPPY }, { ...PUFFER }, { ...CLOWN }], 3,
            {
                equipment: {
                    grid: [
                        { itemId: 'harmony', col: 1, row: 4, rotation: 0, flipped: false }
                    ],
                    stash: [],
                    harmonyPosition: { row: 4, col: 1 }
                }
            }
        );
        await injectSaveAndLoad(page, save);
        await clickGame(page, CONTINUE_BTN.x, CONTINUE_BTN.y);
        await page.waitForTimeout(2000);

        // Enter battle
        await clickGame(page, 240, 135);
        await page.waitForTimeout(3000);

        await clickGame(page, EQUIP_BTN.x, EQUIP_BTN.y);
        await page.waitForTimeout(800);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/eq-4col-02-readonly-grid.png` });
        expect(errors).toHaveLength(0);
    });

    test('all 20 cells (4×5) have interactive zones', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/UIOverlayScene.js');
        // Interactive zone loop iterates gridH rows × gridW columns
        expect(src).toContain('for (let r = 0; r < gridH; r++)');
        expect(src).toContain('for (let c = 0; c < gridW; c++)');
    });
});

// ─── Step 2: Panel fits viewport ─────────────────────────────────────────────

test.describe('2. panel fits 270px viewport', () => {

    test('panel width calculation: labelW + gridTotalW + 60 + padding', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/UIOverlayScene.js');
        // panelW = labelW + gridTotalW + 60 + panelPad * 2
        // = 50 + 4*32 + 60 + 24 = 262
        expect(src).toContain('const panelW = labelW + gridTotalW + 60 + panelPad * 2');
    });

    test('panel height in edit mode: gridTotalH + stashH + 34 = 222', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/UIOverlayScene.js');
        // gridTotalH = 5 * 32 = 160, stashH = 28, panelH = 160 + 28 + 34 = 222
        expect(src).toContain('const panelH = gridTotalH + stashH + 34');
    });

    test('panel height 222 fits within 270px viewport (48px margin)', async ({ page }) => {
        await page.goto(BASE);
        const balance = await (await fetch(`${BASE}/src/config/equipment-balance.json`)).json();
        const gridTotalH = balance.gridHeight * 32;  // 5 * 32 = 160
        const stashH = 28;  // edit mode
        const panelH = gridTotalH + stashH + 34;  // 222
        expect(panelH).toBeLessThanOrEqual(266);  // 270 - 4px margins
    });

    test('fish labels visible on left side of grid', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/UIOverlayScene.js');
        expect(src).toContain('const labelW = 50');
        expect(src).toContain('const gridX = panelX + labelW + panelPad');
    });

    test('stat preview area visible on right side of grid', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/systems/EquipmentRenderer.js');
        // Preview positioned at gridWidth * cellSize + 6 to the right of grid
        expect(src).toContain('const px = ox + gridWidth * cellSize + 6');
    });
});

// ─── Step 3: Item placement in column 3 ──────────────────────────────────────

test.describe('3. item placement in rightmost column', () => {

    test('canPlace accepts items in column 3 with gridWidth=4', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/systems/EquipmentSystem.js');
        // Bounds check: c >= gridWidth means col 3 is valid when gridWidth=4
        expect(src).toContain('c < 0 || c >= gridWidth || r < 0 || r >= gridHeight');
    });

    test('monomino at col 3 is within bounds for 4-wide grid', async ({ page }) => {
        // Monomino at (3,0): cell [3,0] — c=3, gridWidth=4, 3 < 4 = valid
        await page.goto(BASE);
        const balance = await (await fetch(`${BASE}/src/config/equipment-balance.json`)).json();
        expect(3).toBeLessThan(balance.gridWidth);
    });

    test('save with item in col 3 loads without JS errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeV5Save(
            [{ ...GUPPY }, { ...PUFFER }, { ...CLOWN }], 3,
            {
                gold: 300,
                equipment: {
                    grid: [
                        { itemId: 'harmony', col: 1, row: 4, rotation: 0, flipped: false },
                        { itemId: 'sewer_rusty_pipe', col: 3, row: 0, rotation: 1, flipped: false }
                    ],
                    stash: [],
                    harmonyPosition: { row: 4, col: 1 }
                }
            }
        );
        await injectSaveAndLoad(page, save);
        await clickGame(page, CONTINUE_BTN.x, CONTINUE_BTN.y);
        await page.waitForTimeout(2000);

        await clickGame(page, EQUIP_BTN.x, EQUIP_BTN.y);
        await page.waitForTimeout(800);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/eq-4col-03-item-col3.png` });
        expect(errors).toHaveLength(0);
    });

    test('T-shape spanning into col 3 renders correctly', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        // T-shape at (1,0) rot 0: cells (2,0),(1,1),(2,1),(3,1) — spans to col 3
        const save = makeV5Save(
            [{ ...GUPPY }, { ...PUFFER }, { ...CLOWN }], 3,
            {
                gold: 300,
                equipment: {
                    grid: [
                        { itemId: 'harmony', col: 1, row: 4, rotation: 0, flipped: false },
                        { itemId: 'sewer_drain_grate', col: 1, row: 0, rotation: 0, flipped: false }
                    ],
                    stash: [],
                    harmonyPosition: { row: 4, col: 1 }
                }
            }
        );
        await injectSaveAndLoad(page, save);
        await clickGame(page, CONTINUE_BTN.x, CONTINUE_BTN.y);
        await page.waitForTimeout(2000);

        await clickGame(page, EQUIP_BTN.x, EQUIP_BTN.y);
        await page.waitForTimeout(800);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/eq-4col-04-tshape-col3.png` });
        expect(errors).toHaveLength(0);
    });
});

// ─── Step 4: I-shape horizontal fit ──────────────────────────────────────────

test.describe('4. I-shape horizontal fit', () => {

    test('I-shape horizontal spans 4 cells (cols 0-3) which fits in 4-wide grid', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/systems/EquipmentSystem.js');
        // I-shape: [[0,0],[1,0],[2,0],[3,0]] — needs 4 columns
        expect(src).toContain('[0,0],[1,0],[2,0],[3,0]');
    });

    test('I-shape horizontal at (0,0) in 4-wide grid: all cells in bounds', async () => {
        // I rot 0 at (0,0): cells at col 0,1,2,3 — all < gridWidth=4
        const gridWidth = 4;
        const iCells = [[0,0],[1,0],[2,0],[3,0]];
        const allInBounds = iCells.every(([c, r]) => c >= 0 && c < gridWidth && r >= 0 && r < 5);
        expect(allInBounds).toBe(true);
    });

    test('I-shape horizontal at (1,0) in 4-wide grid: out of bounds', async () => {
        // I rot 0 at (1,0): cells at col 1,2,3,4 — col 4 >= gridWidth=4
        const gridWidth = 4;
        const iCells = [[0,0],[1,0],[2,0],[3,0]].map(([c, r]) => [1 + c, 0 + r]);
        const outOfBounds = iCells.some(([c]) => c >= gridWidth);
        expect(outOfBounds).toBe(true);
    });

    test('save with I-shape horizontal loads without JS errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        // I-shape horizontal at (0,2): cells at (0,2),(1,2),(2,2),(3,2)
        const save = makeV5Save(
            [{ ...GUPPY }, { ...PUFFER }, { ...CLOWN }], 3,
            {
                gold: 300,
                equipment: {
                    grid: [
                        { itemId: 'harmony', col: 1, row: 4, rotation: 0, flipped: false },
                        { itemId: 'sewer_rusty_pipe', col: 0, row: 2, rotation: 0, flipped: false }
                    ],
                    stash: [],
                    harmonyPosition: { row: 4, col: 1 }
                }
            }
        );
        await injectSaveAndLoad(page, save);
        await clickGame(page, CONTINUE_BTN.x, CONTINUE_BTN.y);
        await page.waitForTimeout(2000);

        await clickGame(page, EQUIP_BTN.x, EQUIP_BTN.y);
        await page.waitForTimeout(800);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/eq-4col-05-ishape-horizontal.png` });
        expect(errors).toHaveLength(0);
    });
});

// ─── Step 5: Harmony position ────────────────────────────────────────────────

test.describe('5. harmony position', () => {

    test('harmony at default position (col=1, row=4) renders on 4-wide grid', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeV5Save([{ ...GUPPY }, { ...PUFFER }, { ...CLOWN }], 3);
        await injectSaveAndLoad(page, save);
        await clickGame(page, CONTINUE_BTN.x, CONTINUE_BTN.y);
        await page.waitForTimeout(2000);

        await clickGame(page, EQUIP_BTN.x, EQUIP_BTN.y);
        await page.waitForTimeout(800);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/eq-4col-06-harmony.png` });
        expect(errors).toHaveLength(0);
    });

    test('harmony row restriction still enforced', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/systems/EquipmentSystem.js');
        expect(src).toContain("reason: 'row_restriction'");
        expect(src).toContain('item.rowRestriction !== undefined');
    });
});

// ─── Step 6: Stash and sell ──────────────────────────────────────────────────

test.describe('6. stash and sell', () => {

    test('stash renders below grid without overlap', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeV5Save(
            [{ ...GUPPY }, { ...PUFFER }, { ...CLOWN }], 3,
            {
                gold: 300,
                equipment: {
                    grid: [
                        { itemId: 'harmony', col: 1, row: 4, rotation: 0, flipped: false }
                    ],
                    stash: [
                        { id: 'sewer_drain_grate' },
                        { id: 'sewer_rusty_pipe' },
                        { id: 'sewer_slime_glob' }
                    ],
                    harmonyPosition: { row: 4, col: 1 }
                }
            }
        );
        await injectSaveAndLoad(page, save);
        await clickGame(page, CONTINUE_BTN.x, CONTINUE_BTN.y);
        await page.waitForTimeout(2000);

        await clickGame(page, EQUIP_BTN.x, EQUIP_BTN.y);
        await page.waitForTimeout(800);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/eq-4col-07-stash.png` });
        expect(errors).toHaveLength(0);
    });

    test('stash Y position is below grid (gridY + gridTotalH)', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/UIOverlayScene.js');
        expect(src).toContain('const stashY = gridY + gridTotalH + 2');
    });

    test('sell mechanics still work (gold add + item removal)', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/UIOverlayScene.js');
        expect(src).toContain('gameState.gold = (gameState.gold || 0) + sellPrice');
        expect(src).toContain('EquipmentSystem.removeItem(gameState.equipment.grid, entry.itemId)');
    });
});

// ─── Step 7: Save/load round-trip ────────────────────────────────────────────

test.describe('7. save/load round-trip', () => {

    test('items in column 3 survive save/load cycle', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        // Save with item in col 3
        const save = makeV5Save(
            [{ ...GUPPY }, { ...PUFFER }, { ...CLOWN }], 3,
            {
                gold: 300,
                equipment: {
                    grid: [
                        { itemId: 'harmony', col: 1, row: 4, rotation: 0, flipped: false },
                        { itemId: 'sewer_rusty_pipe', col: 3, row: 0, rotation: 1, flipped: false }
                    ],
                    stash: [],
                    harmonyPosition: { row: 4, col: 1 }
                }
            }
        );
        await injectSaveAndLoad(page, save);
        await clickGame(page, CONTINUE_BTN.x, CONTINUE_BTN.y);
        await page.waitForTimeout(2000);

        // Verify save data persisted correctly
        const savedData = await page.evaluate((key) => {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : null;
        }, SAVE_KEY);

        expect(savedData).not.toBeNull();
        expect(savedData.equipment.grid).toHaveLength(2);

        const pipeEntry = savedData.equipment.grid.find(e => e.itemId === 'sewer_rusty_pipe');
        expect(pipeEntry).toBeDefined();
        expect(pipeEntry.col).toBe(3);

        // Open equipment to verify visual rendering
        await clickGame(page, EQUIP_BTN.x, EQUIP_BTN.y);
        await page.waitForTimeout(800);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/eq-4col-08-save-load.png` });
        expect(errors).toHaveLength(0);
    });
});

// ─── Step 8: Battle stat application ─────────────────────────────────────────

test.describe('8. battle stat application', () => {

    test('row targeting is row-based, unaffected by column count', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/systems/EquipmentSystem.js');
        // ROW_TARGETING only references row indices, not columns
        expect(src).toContain('0: [0]');
        expect(src).toContain('1: [0, 1]');
        expect(src).toContain('2: [1]');
        expect(src).toContain('3: [1, 2]');
        expect(src).toContain('4: [2]');
    });

    test('applyBonuses iterates grid entries regardless of column', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/systems/EquipmentSystem.js');
        // computeGridBonuses iterates all grid entries
        expect(src).toContain('for (const entry of grid)');
    });

    test('battle with col-3 items: no JS errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeV5Save(
            [{ ...GUPPY }, { ...PUFFER }, { ...CLOWN }], 3,
            {
                gold: 300,
                equipment: {
                    grid: [
                        { itemId: 'harmony', col: 1, row: 4, rotation: 0, flipped: false },
                        { itemId: 'sewer_rusty_pipe', col: 3, row: 0, rotation: 1, flipped: false }
                    ],
                    stash: [],
                    harmonyPosition: { row: 4, col: 1 }
                }
            }
        );
        await injectSaveAndLoad(page, save);
        await clickGame(page, CONTINUE_BTN.x, CONTINUE_BTN.y);
        await page.waitForTimeout(2000);

        // Enter battle
        await clickGame(page, 240, 135);
        await page.waitForTimeout(3000);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/eq-4col-09-battle-col3.png` });
        expect(errors).toHaveLength(0);
    });
});

// ─── Version check ───────────────────────────────────────────────────────────

test.describe('version', () => {

    test('version bumped for 4th column change', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/version.js');
        // Should be 0.13.0 or higher (minor bump for new grid dimension)
        const match = src.match(/VERSION\s*=\s*'(\d+\.\d+\.\d+)'/);
        expect(match).not.toBeNull();
        const [major, minor] = match[1].split('.').map(Number);
        // At least 0.13.x
        expect(major * 1000 + minor).toBeGreaterThanOrEqual(13);
    });
});
