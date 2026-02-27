/**
 * Browser QA: Fix scrimX undefined in card personality animation
 * Plan: qa-browser-fix-cards-procedural-border-scrimx
 *
 * Verifies: _startPersonality called with cx/cy/cardW/cardH instead of
 * removed scrimX/Y/W/H variables, no ReferenceError, personality effects
 * activate after card entrance animations complete.
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
        gameVersion: '0.18.2',
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
    // Wait for entrance animations + personality delay (400ms entrance + 500ms delay + buffer)
    await page.waitForTimeout(6000);
}

async function fetchSrc(page, path) {
    return page.evaluate(async (url) => {
        const resp = await fetch(url);
        return resp.text();
    }, `${BASE}${path}`);
}

// ─── 1. Source: _startPersonality called with cx/cy/cardW/cardH ──────────────

test.describe('1. scrimX fix source verification', () => {

    test('_startPersonality call uses cx, cy, cardW, cardH parameters', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        expect(src).toContain('this._startPersonality(card.type, personalityOverlay, cx, cy, cardW, cardH)');
    });

    test('no external scrimX variable reference at call site', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        // The call should NOT use scrimX as an argument
        expect(src).not.toContain('this._startPersonality(card.type, personalityOverlay, scrimX');
    });

    test('version bumped to 0.18.2', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/version.js');
        expect(src).toContain("VERSION = '0.18.2'");
    });
});

// ─── 2. Browser: personality animations activate without errors ──────────────

test.describe('2. personality animations after entrance', () => {

    test('delve card personality activates without scrimX ReferenceError', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        // Floor 1: only delve card
        const save = makeSave([{ ...GUPPY }, { ...PUFFER }], 1);
        await enterFloorScene(page, save);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/scrimx-01-delve-personality.png` });

        // No ReferenceError for scrimX
        const scrimXErrors = errors.filter(e => e.includes('scrimX'));
        expect(scrimXErrors).toHaveLength(0);
        // No errors at all
        expect(errors).toHaveLength(0);
    });

    test('camp card personality activates without errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        // Floor 2 with camp transition
        const save = makeSave([{ ...GUPPY }, { ...PUFFER }], 2, {
            _transitionQueue: ['camp'],
            _pendingAdvance: true
        });
        await enterFloorScene(page, save);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/scrimx-02-camp-personality.png` });

        const scrimXErrors = errors.filter(e => e.includes('scrimX'));
        expect(scrimXErrors).toHaveLength(0);
        expect(errors).toHaveLength(0);
    });

    test('shop card personality (gold particles) activates without errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        // Floor 3 with shop+camp transitions — all 3 card types
        const save = makeSave([{ ...GUPPY }, { ...PUFFER }], 3, {
            _transitionQueue: ['shop', 'camp'],
            _pendingAdvance: true
        });
        await enterFloorScene(page, save);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/scrimx-03-shop-personality.png` });

        const scrimXErrors = errors.filter(e => e.includes('scrimX'));
        expect(scrimXErrors).toHaveLength(0);
        expect(errors).toHaveLength(0);
    });

    test('all 3 card types together — no errors after personalities start', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeSave([{ ...GUPPY }, { ...PUFFER }], 3, {
            _transitionQueue: ['shop', 'camp'],
            _pendingAdvance: true
        });
        await enterFloorScene(page, save);

        // Wait extra time for all personality effects to be running
        await page.waitForTimeout(2000);
        await page.screenshot({ path: `${SCREENSHOT_DIR}/scrimx-04-all-personalities.png` });

        const scrimXErrors = errors.filter(e => e.includes('scrimX'));
        expect(scrimXErrors).toHaveLength(0);
        expect(errors).toHaveLength(0);
    });
});
