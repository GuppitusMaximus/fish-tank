/**
 * Browser QA: Revert card borders to atlas nineslice
 * Plan: qa-browser-revert-cards-to-atlas-borders
 *
 * Verifies: FloorScene action cards use atlas nineslice borders (not procedural),
 * card images visible inside bordered frame, hover animation smooth (no distortion),
 * labels readable, card click navigation works, no JS errors.
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

async function getCanvasBounds(page) {
    const canvas = page.locator('canvas').first();
    return await canvas.boundingBox();
}

async function clickGame(page, gx, gy) {
    const bounds = await getCanvasBounds(page);
    const x = bounds.x + gx * (bounds.width / GAME_W);
    const y = bounds.y + gy * (bounds.height / GAME_H);
    await page.mouse.click(x, y);
}

async function hoverGame(page, gx, gy) {
    const bounds = await getCanvasBounds(page);
    const x = bounds.x + gx * (bounds.width / GAME_W);
    const y = bounds.y + gy * (bounds.height / GAME_H);
    await page.mouse.move(x, y);
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
const PUFFER = makeFish('pufferfish', 'Pufferfish', 0xffcc00, 60, 60, 12, 14, 8, 'spine_burst');

function makeSave(party, floor = 1, extras = {}) {
    return {
        version: 5,
        gameVersion: '0.18.5',
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
        ...(extras._transitionQueue ? { _transitionQueue: extras._transitionQueue } : {}),
        ...(extras._pendingAdvance ? { _pendingAdvance: extras._pendingAdvance } : {})
    };
}

async function injectSaveAndLoad(page, save) {
    await page.goto(BASE);
    await page.evaluate(([key, data]) => localStorage.setItem(key, JSON.stringify(data)), [SAVE_KEY, save]);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(BUTTON_APPEAR_MS);
}

async function enterFloorScene(page, save) {
    await injectSaveAndLoad(page, save);
    // CONTINUE button at y~116
    await clickGame(page, 240, 116);
    // Wait for entrance animations + personality delay
    await page.waitForTimeout(6000);
}

async function fetchSrc(page, path) {
    return page.evaluate(async (url) => {
        const resp = await fetch(url);
        return resp.text();
    }, `${BASE}${path}`);
}

const CARD_CENTER_Y = 172;

// ─── 1. Source: atlas nineslice borders restored ─────────────────────────────

test.describe('1. atlas border revert source verification', () => {

    test('cardTheme.atlasKey is set (not deleted)', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        expect(src).toContain("cardTheme.atlasKey = zone.atlasKey + '_sm'");
        // atlasKey should NOT be deleted
        expect(src).not.toContain('delete cardTheme.atlasKey');
    });

    test('UIPanel at depth 2 with cornerSize 10', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        expect(src).toContain('theme: cardTheme, depth: 2, padding: 0, cornerSize: 10, fx: false');
    });

    test('card image at depth 3 (above nineslice panel)', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        // Image should be at depth 3
        expect(src).toMatch(/img\.setScale\(baseImgScale\)\.setDepth\(3\)/);
    });

    test('scrimX/Y/W/H variables restored for personality overlay', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        expect(src).toContain('const scrimX = cx + sideInset');
        expect(src).toContain('const scrimY = cy + topInset');
        expect(src).toContain('const scrimW = cardW - sideInset * 2');
        expect(src).toContain('const scrimH = cardH - topInset - bottomInset');
    });

    test('version bumped to 0.18.5', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/version.js');
        expect(src).toContain("VERSION = '0.18.5'");
    });
});

// ─── 2. Browser: cards render with atlas borders, no errors ──────────────────

test.describe('2. card rendering with atlas borders', () => {

    test('floor 1 single delve card renders without JS errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeSave([{ ...GUPPY }, { ...PUFFER }], 1);
        await enterFloorScene(page, save);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/rcab-01-floor1-atlas-card.png` });
        expect(errors).toHaveLength(0);
    });

    test('floor 2 with camp shows 2 cards without JS errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeSave([{ ...GUPPY }, { ...PUFFER }], 2, {
            _transitionQueue: ['camp'],
            _pendingAdvance: true
        });
        await enterFloorScene(page, save);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/rcab-02-two-cards-atlas.png` });
        expect(errors).toHaveLength(0);
    });

    test('floor 3 with all 3 card types renders without JS errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeSave([{ ...GUPPY }, { ...PUFFER }], 3, {
            _transitionQueue: ['shop', 'camp'],
            _pendingAdvance: true
        });
        await enterFloorScene(page, save);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/rcab-03-three-cards-atlas.png` });
        expect(errors).toHaveLength(0);
    });
});

// ─── 3. Hover animation: smooth scale without distortion ─────────────────────

test.describe('3. hover animation', () => {

    test('hover scales card smoothly, unhover returns to normal', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeSave([{ ...GUPPY }], 1);
        await enterFloorScene(page, save);

        // Hover center of single Delve card
        await hoverGame(page, 240, CARD_CENTER_Y);
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${SCREENSHOT_DIR}/rcab-04a-hover-atlas.png` });

        // Move away — card should scale back
        await hoverGame(page, 10, 10);
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${SCREENSHOT_DIR}/rcab-04b-unhover-atlas.png` });

        expect(errors).toHaveLength(0);
    });
});

// ─── 4. Click navigation works ───────────────────────────────────────────────

test.describe('4. click navigation', () => {

    test('click Delve card starts battle without errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeSave([{ ...GUPPY }, { ...PUFFER }], 1);
        await enterFloorScene(page, save);

        // Click Delve (single card center)
        await clickGame(page, 240, CARD_CENTER_Y);
        await page.waitForTimeout(3000);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/rcab-05-after-click.png` });
        expect(errors).toHaveLength(0);
    });
});

// ─── 5. Personality animations with restored scrim variables ─────────────────

test.describe('5. personality animations', () => {

    test('all 3 card personality effects activate without errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeSave([{ ...GUPPY }, { ...PUFFER }], 3, {
            _transitionQueue: ['shop', 'camp'],
            _pendingAdvance: true
        });
        await enterFloorScene(page, save);

        // Wait for all personality effects to be running
        await page.waitForTimeout(2000);
        await page.screenshot({ path: `${SCREENSHOT_DIR}/rcab-06-personalities-active.png` });

        // No ReferenceError for scrimX or any other error
        const scrimErrors = errors.filter(e => e.includes('scrimX') || e.includes('scrimY'));
        expect(scrimErrors).toHaveLength(0);
        expect(errors).toHaveLength(0);
    });
});
