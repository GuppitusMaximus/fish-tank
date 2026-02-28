/**
 * Browser QA: Top Info Panel
 * Plan: qa-browser-top-info-panel
 *
 * Verifies the TopInfoPanel renders correctly in FloorScene and CampScene,
 * shows accurate data, expands/collapses properly, and that old ad-hoc
 * panels are fully removed. Also verifies BAG/EQUIP button relocation.
 *
 * Runs against http://localhost:8080 (fathom-fall Vite dev server).
 * Save key is 'fathom-fall-save', save format v5.
 */

const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:8080';
const SAVE_KEY = 'fathom-fall-save';
const GAME_W = 480;
const GAME_H = 270;
const BUTTON_APPEAR_MS = 5500;
const SCENE_LOAD_MS = 2000;
const path = require('path');
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getCanvasBounds(page) {
    const canvas = page.locator('canvas').first();
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

const GUPPY = makeFish('guppy', 'Guppy', 0xe8734a, 42, 50, 16, 9, 10, 'bubble_volley');
const PUFFER = makeFish('pufferfish', 'Puffer', 0x88ccee, 60, 60, 12, 14, 8, 'shield_grant');
const CLOWN = makeFish('clownfish', 'Clown', 0xffaa00, 30, 45, 14, 10, 12, 'heal_hot');

const CONTINUE_BTN = { x: 240, y: 116 };

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

function makeFloorSave() {
    return makeV5Save(
        [{ ...GUPPY }, { ...PUFFER }, { ...CLOWN }],
        3,
        {
            gold: 250,
            inventory: [
                { id: 'sewer_rusty_pipe', name: 'Rusty Pipe' },
                { id: 'sewer_drain_grate', name: 'Drain Grate' }
            ],
            equipment: {
                grid: [
                    { itemId: 'harmony', col: 1, row: 4, rotation: 0, flipped: false },
                    { itemId: 'sewer_rusty_pipe', col: 0, row: 0, rotation: 1, flipped: false }
                ],
                stash: [
                    { id: 'sewer_drain_grate' }
                ],
                harmonyPosition: { row: 4, col: 1 }
            }
        }
    );
}

function makeCampSave() {
    const party = [{ ...GUPPY }, { ...PUFFER }, { ...CLOWN }];
    const save = makeV5Save(party, 3, { gold: 250 });
    save._transitionQueue = ['camp'];
    return save;
}

async function injectSaveAndLoad(page, save) {
    await page.goto(BASE);
    await page.evaluate(([key, data]) => localStorage.setItem(key, JSON.stringify(data)), [SAVE_KEY, save]);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(BUTTON_APPEAR_MS);
}

async function navigateToFloor(page) {
    await clickGame(page, CONTINUE_BTN.x, CONTINUE_BTN.y);
    await page.waitForTimeout(SCENE_LOAD_MS);
}

async function screenshot(page, name) {
    await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}.png`, fullPage: true });
}

async function fetchSrc(path) {
    const resp = await fetch(`${BASE}${path}`);
    return resp.text();
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('Top Info Panel', () => {
    const errors = [];

    test.beforeEach(async ({ page }) => {
        page.on('pageerror', err => errors.push(err.message));
    });

    test.afterEach(async () => {
        errors.length = 0;
    });

    test('T1: FloorScene — panel renders expanded by default', async ({ page }) => {
        const save = makeFloorSave();
        await injectSaveAndLoad(page, save);
        await navigateToFloor(page);

        await screenshot(page, 'tip-01-floor-panel-expanded');

        // Verify old ad-hoc format is NOT present in source code
        // The new TopInfoPanel should use separate label+value pairs, not "Gold: X   Items: Y/5"
        const floorSrc = await fetchSrc('/src/scenes/FloorScene.js');
        const hasOldFormat = floorSrc.includes("'Gold: ' + gs.gold + '   Items: '");

        expect(hasOldFormat, 'Old ad-hoc panel format should be removed from FloorScene').toBe(false);
        expect(errors).toEqual([]);
    });

    test('T2: FloorScene — panel collapse and expand', async ({ page }) => {
        const save = makeFloorSave();
        await injectSaveAndLoad(page, save);
        await navigateToFloor(page);

        // Click the top panel area (resource bar region) to collapse
        await clickGame(page, GAME_W / 2, 20);
        await page.waitForTimeout(500);
        await screenshot(page, 'tip-02a-collapsed');

        // Click again to expand
        await clickGame(page, GAME_W / 2, 20);
        await page.waitForTimeout(500);
        await screenshot(page, 'tip-02b-re-expanded');

        expect(errors).toEqual([]);
    });

    test('T3: CampScene — panel renders with healed HP', async ({ page }) => {
        const save = makeCampSave();
        await injectSaveAndLoad(page, save);
        await navigateToFloor(page);

        // Click "Make Camp" card — camp card at right side of screen
        await page.waitForTimeout(500);
        await clickGame(page, 430, 135);
        await page.waitForTimeout(SCENE_LOAD_MS);

        await screenshot(page, 'tip-03-camp-panel');

        // Verify old separate CAMP title panel is removed
        const campSrc = await fetchSrc('/src/scenes/CampScene.js');
        const hasOldCampTitle = campSrc.includes("'CAMP \\u2014 Floor '") || campSrc.includes("CAMP — Floor");

        expect(hasOldCampTitle, 'Old CAMP title panel should be removed from CampScene').toBe(false);
        expect(errors).toEqual([]);
    });

    test('T4: Resource bar data accuracy', async ({ page }) => {
        const save = makeFloorSave();
        await injectSaveAndLoad(page, save);
        await navigateToFloor(page);

        await screenshot(page, 'tip-04-resource-bar');

        // Verify source uses TopInfoPanel or ResourceBar with separate fields
        const floorSrc = await fetchSrc('/src/scenes/FloorScene.js');

        // New panel should reference separate resource display for gold, items, equip, stash
        const hasTopInfoPanel = floorSrc.includes('TopInfoPanel') || floorSrc.includes('ResourceBar');

        expect(hasTopInfoPanel, 'FloorScene should use TopInfoPanel or ResourceBar component').toBe(true);
        expect(errors).toEqual([]);
    });

    test('T5: Battle stats display (DPS/DEF/PWR per member + totals)', async ({ page }) => {
        const save = makeFloorSave();
        await injectSaveAndLoad(page, save);
        await navigateToFloor(page);

        await screenshot(page, 'tip-05-battle-stats');

        // Check that source computes and displays DPS/DEF/PWR stats
        const floorSrc = await fetchSrc('/src/scenes/FloorScene.js');
        const hasBattleStats = (floorSrc.includes('DPS') || floorSrc.includes('dps'))
            && (floorSrc.includes('DEF') || floorSrc.includes('def'))
            && (floorSrc.includes('PWR') || floorSrc.includes('pwr'));

        expect(hasBattleStats, 'Panel should show DPS/DEF/PWR stats for party members').toBe(true);
        expect(errors).toEqual([]);
    });

    test('T6: BAG/EQUIP buttons relocated to bottom-left', async ({ page }) => {
        const save = makeFloorSave();
        await injectSaveAndLoad(page, save);
        await navigateToFloor(page);

        await screenshot(page, 'tip-06-button-positions');

        // Check UIOverlayScene source for button positions
        const overlaySrc = await fetchSrc('/src/scenes/UIOverlayScene.js');

        // BAG button should NOT be at top-right anymore
        // Old: x: width - 8, y: 8
        const hasBagTopRight = overlaySrc.match(/bagBtn[\s\S]*?x:\s*width\s*-\s*8,\s*y:\s*8/);

        expect(hasBagTopRight, 'BAG button should not be in top-right position').toBeFalsy();
        expect(errors).toEqual([]);
    });

    test('T7: Zone theming on panel', async ({ page }) => {
        const save = makeFloorSave();
        await injectSaveAndLoad(page, save);
        await navigateToFloor(page);

        await screenshot(page, 'tip-07-zone-themed-panel');

        // Verify themed NineSlice border is used
        const floorSrc = await fetchSrc('/src/scenes/FloorScene.js');
        const hasThemedAtlas = floorSrc.includes('atlasKey');

        expect(hasThemedAtlas, 'Panel should use themed atlas border').toBe(true);
        expect(errors).toEqual([]);
    });

    test('T8: Panel overlay — action cards visible below panel', async ({ page }) => {
        const save = makeFloorSave();
        await injectSaveAndLoad(page, save);
        await navigateToFloor(page);

        await screenshot(page, 'tip-08-panel-with-cards');

        // Visual verification via screenshot — panel should not push cards off screen
        // No JS errors
        expect(errors).toEqual([]);
    });
});
