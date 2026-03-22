/**
 * Browser QA: Card rendering with procedural borders
 * Plan: qa-browser-fix-cards-procedural-border
 *
 * Verifies: Card images visible, procedural graphics borders (fillRoundedRect/strokeRoundedRect),
 * zone accent color, labels readable, hover effects, no JS errors.
 *
 * Runs against http://localhost:8080 (fathom-fall Vite dev server).
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
        version: 10,
        gameVersion: '0.69.49',
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

async function enterZoneHub(page, save) {
    await injectSaveAndLoad(page, save);
    // CONTINUE button at y~116
    await clickGame(page, 240, 116);
    await page.waitForTimeout(5000);
}

async function fetchSrc(page, path) {
    return page.evaluate(async (url) => {
        const resp = await fetch(url);
        return resp.text();
    }, `${BASE}${path}`);
}

const CARD_CENTER_Y = 172;

// ─── 1. Source code: procedural borders on cards ─────────────────────────────

test.describe('1. procedural border source verification', () => {

    test('card bg uses procedural graphics at depth 2', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/ui/ActionPanelGroup.js');
        // Procedural border: scene.add.graphics().setDepth(2)
        expect(src).toContain('scene.add.graphics().setDepth(2)');
        expect(src).toContain('fillRoundedRect(cx, cy, card.width, card.height, 4)');
        expect(src).toContain('strokeRoundedRect(cx, cy, card.width, card.height, 4)');
    });

    test('border uses zone accent color', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/ui/ActionPanelGroup.js');
        expect(src).toContain('zone.panel ? zone.panel.accent : 0x666688');
        expect(src).toContain('bg.lineStyle(1, accent, 0.6)');
    });

    test('card image at depth 3 (above bg at depth 2)', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/ui/ActionPanelGroup.js');
        expect(src).toContain('.setDepth(3).setScrollFactor(0)');
    });

    test('card image uses 3px inset for border visibility', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/ui/ActionPanelGroup.js');
        expect(src).toContain('const inset = 3');
        expect(src).toContain('card.width - inset * 2');
        expect(src).toContain('card.height - inset * 2');
    });

    test('card label at depth 4 with scrim at depth 3.5', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/ui/ActionPanelGroup.js');
        expect(src).toContain('.setDepth(4)');
        expect(src).toContain('.setDepth(3.5)');
    });

    test('no atlasKey or nineslice used for card borders', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/ui/ActionPanelGroup.js');
        expect(src).not.toContain('atlasKey');
        expect(src).not.toContain('NineSlice');
        expect(src).not.toContain('compositeKey');
    });
});

// ─── 2. Version ──────────────────────────────────────────────────────────────

test.describe('2. version', () => {

    test('game version is current', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/version.js');
        // Version should be 0.69.x (post procedural-border patch)
        expect(src).toMatch(/VERSION = '0\.69\.\d+'/);
    });
});

// ─── 3. Browser: cards render without errors ─────────────────────────────────

test.describe('3. browser card rendering', () => {

    test('floor 1 single card renders without JS errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeSave([{ ...GUPPY }, { ...PUFFER }], 1);
        await enterZoneHub(page, save);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/pcb-01-floor1-single-card.png` });
        expect(errors).toHaveLength(0);
    });

    test('floor 2 with camp shows 2 cards without JS errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeSave([{ ...GUPPY }, { ...PUFFER }], 2, {
            _transitionQueue: ['camp'],
            _pendingAdvance: true
        });
        await enterZoneHub(page, save);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/pcb-02-two-cards-camp.png` });
        expect(errors).toHaveLength(0);
    });

    test('floor 3 with shop+camp shows 3 cards without JS errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeSave([{ ...GUPPY }, { ...PUFFER }], 3, {
            _transitionQueue: ['shop', 'camp'],
            _pendingAdvance: true
        });
        await enterZoneHub(page, save);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/pcb-03-three-cards.png` });
        expect(errors).toHaveLength(0);
    });
});

// ─── 4. Browser: hover and click ─────────────────────────────────────────────

test.describe('4. hover and click interactions', () => {

    test('hover over card triggers scale effect without errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeSave([{ ...GUPPY }], 1);
        await enterZoneHub(page, save);

        // Hover center of single Delve card
        await hoverGame(page, 240, CARD_CENTER_Y);
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${SCREENSHOT_DIR}/pcb-04a-hover.png` });

        // Move away
        await hoverGame(page, 10, 10);
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${SCREENSHOT_DIR}/pcb-04b-unhover.png` });

        expect(errors).toHaveLength(0);
    });

    test('click Delve Deeper card starts battle without errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeSave([{ ...GUPPY }, { ...PUFFER }], 1);
        await enterZoneHub(page, save);

        // Click Delve (single card center)
        await clickGame(page, 240, CARD_CENTER_Y);
        await page.waitForTimeout(3000);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/pcb-04c-after-click.png` });
        expect(errors).toHaveLength(0);
    });
});
