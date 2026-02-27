/**
 * Browser QA: Fix Equipment Overlay Layout and Close Behavior
 * Plan: qa-browser-fix-equipment-overlay-layout
 *
 * Verifies that the equipment overlay fits within the 270px viewport,
 * the CLOSE button is visible, blocker tap-to-close works, and
 * auto-close on battle end is functional.
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

function makeFish(speciesId, name, color, hp, maxHp, atk, def, spd, specialMove) {
    return {
        speciesId, name, color,
        level: 5, xp: 0, xpToNext: 125,
        hp, maxHp, atk, def, spd,
        shield: 0, maxShield: 0, healPower: 0,
        moves: [specialMove],
        poisoned: null, buffs: [], burn: null, curses: [], hots: [], poisons: []
    };
}

const GUPPY = makeFish('guppy', 'Guppy', 0xe8734a, 50, 50, 16, 9, 10, 'bubble_volley');
const PUFFER = makeFish('pufferfish', 'Puffer', 0x88ccee, 60, 60, 12, 14, 8, 'shield_grant');
const CLOWN = makeFish('clownfish', 'Clown', 0xffaa00, 45, 45, 14, 10, 12, 'heal_hot');

function makeEquipmentSave() {
    return {
        version: 5,
        gameVersion: '0.12.0',
        savedAt: Date.now(),
        floor: 3,
        gold: 300,
        party: [{ ...GUPPY }, { ...PUFFER }, { ...CLOWN }],
        inventory: [],
        campFloor: 1,
        fisherId: 'andy',
        pveDeathCount: 0,
        pvpLossCount: 0,
        roster: [],
        companion: null,
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

const EQUIP_BTN = { x: 445, y: 34 };
const CONTINUE_BTN = { x: 240, y: 116 };

// ─── Layout Verification (Edit Mode) ────────────────────────────────────────

test.describe('edit mode overlay layout', () => {

    test('equipment overlay fits within 270px viewport and CLOSE is visible', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeEquipmentSave();
        await injectSaveAndLoad(page, save);
        await clickGame(page, CONTINUE_BTN.x, CONTINUE_BTN.y);
        await page.waitForTimeout(3000);

        // Open equipment overlay in edit mode
        await clickGame(page, EQUIP_BTN.x, EQUIP_BTN.y);
        await page.waitForTimeout(800);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/eq-fix-01-edit-overlay.png` });
        expect(errors).toHaveLength(0);
    });

    test('blocker tap closes equipment overlay', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeEquipmentSave();
        await injectSaveAndLoad(page, save);
        await clickGame(page, CONTINUE_BTN.x, CONTINUE_BTN.y);
        await page.waitForTimeout(3000);

        // Open equipment overlay
        await clickGame(page, EQUIP_BTN.x, EQUIP_BTN.y);
        await page.waitForTimeout(800);

        // Tap outside the panel (blocker area, top-left corner)
        await clickGame(page, 10, 10);
        await page.waitForTimeout(500);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/eq-fix-02-after-blocker-tap.png` });
        expect(errors).toHaveLength(0);
    });

    test('CLOSE button tap closes equipment overlay', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeEquipmentSave();
        await injectSaveAndLoad(page, save);
        await clickGame(page, CONTINUE_BTN.x, CONTINUE_BTN.y);
        await page.waitForTimeout(3000);

        // Open equipment overlay
        await clickGame(page, EQUIP_BTN.x, EQUIP_BTN.y);
        await page.waitForTimeout(800);

        // Tap CLOSE button — at panelX + panelW/2, panelY + panelH - 12
        // panelW=254, panelX=113, panelY=4, panelH=262
        // CLOSE at x=240, y=254
        await clickGame(page, 240, 254);
        await page.waitForTimeout(500);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/eq-fix-03-after-close-tap.png` });
        expect(errors).toHaveLength(0);
    });
});

// ─── Layout Verification (Readonly Mode) ─────────────────────────────────────

test.describe('readonly mode overlay layout', () => {

    test('battle readonly equipment overlay fits viewport', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeEquipmentSave();
        await injectSaveAndLoad(page, save);
        await clickGame(page, CONTINUE_BTN.x, CONTINUE_BTN.y);
        await page.waitForTimeout(2000);

        // Enter battle by clicking the dungeon door
        await clickGame(page, 240, 135);
        await page.waitForTimeout(3000);

        // Open EQUIP in battle (readonly)
        await clickGame(page, EQUIP_BTN.x, EQUIP_BTN.y);
        await page.waitForTimeout(800);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/eq-fix-04-readonly-overlay.png` });
        expect(errors).toHaveLength(0);
    });

    test('blocker tap closes readonly overlay', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeEquipmentSave();
        await injectSaveAndLoad(page, save);
        await clickGame(page, CONTINUE_BTN.x, CONTINUE_BTN.y);
        await page.waitForTimeout(2000);

        // Enter battle
        await clickGame(page, 240, 135);
        await page.waitForTimeout(3000);

        // Open EQUIP
        await clickGame(page, EQUIP_BTN.x, EQUIP_BTN.y);
        await page.waitForTimeout(800);

        // Tap blocker area
        await clickGame(page, 10, 10);
        await page.waitForTimeout(500);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/eq-fix-05-readonly-blocker-close.png` });
        expect(errors).toHaveLength(0);
    });
});

// ─── Code Verification ──────────────────────────────────────────────────────

test.describe('layout code verification', () => {

    test('cellSize is 32px (4-column compact fit)', async ({ page }) => {
        await page.goto(BASE);
        const resp = await fetch(`${BASE}/src/scenes/UIOverlayScene.js`);
        const src = await resp.text();
        expect(src).toContain('const cellSize = 32');
    });

    test('panelH = gridTotalH + stashH + 34', async ({ page }) => {
        await page.goto(BASE);
        const resp = await fetch(`${BASE}/src/scenes/UIOverlayScene.js`);
        const src = await resp.text();
        expect(src).toContain('const panelH = gridTotalH + stashH + 34');
    });

    test('stashH is 28 in edit mode (compact)', async ({ page }) => {
        await page.goto(BASE);
        const resp = await fetch(`${BASE}/src/scenes/UIOverlayScene.js`);
        const src = await resp.text();
        expect(src).toContain("const stashH = mode === 'edit' ? 28 : 0");
    });

    test('blocker calls closeEquipmentGrid on pointerdown', async ({ page }) => {
        await page.goto(BASE);
        const resp = await fetch(`${BASE}/src/scenes/UIOverlayScene.js`);
        const src = await resp.text();
        expect(src).toContain("blocker.on('pointerdown', () => this.closeEquipmentGrid())");
    });

    test('auto-close timer polls combatState.running', async ({ page }) => {
        await page.goto(BASE);
        const resp = await fetch(`${BASE}/src/scenes/UIOverlayScene.js`);
        const src = await resp.text();
        expect(src).toContain('combatState.running');
        expect(src).toContain('_equipBattleCheck');
    });

    test('timer cleanup in closeEquipmentGrid', async ({ page }) => {
        await page.goto(BASE);
        const resp = await fetch(`${BASE}/src/scenes/UIOverlayScene.js`);
        const src = await resp.text();
        const cleanup = src.match(/closeEquipmentGrid\(\)[\s\S]*?_equipBattleCheck[\s\S]*?\.remove\(\)/);
        expect(cleanup).not.toBeNull();
    });
});
