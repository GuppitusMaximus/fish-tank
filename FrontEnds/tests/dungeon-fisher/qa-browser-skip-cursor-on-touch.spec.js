/**
 * Browser QA: Skip software cursor on touch devices
 *
 * Verifies that CursorManager.attach() returns early on touch-primary
 * devices (pointer: coarse), preventing the software cursor sprite from
 * appearing. Desktop (pointer: fine) should still show the custom cursor.
 *
 * Runs against http://localhost:8080 (dungeon-fisher Vite dev/preview server).
 */

const { test, expect, devices } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:8080';
const GAME_W = 480;
const GAME_H = 270;
const SAVE_KEY = 'fathom-fall-save';
const BUTTON_APPEAR_MS = 5500;
const SCREENSHOT_DIR = 'tests/dungeon-fisher/screenshots';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getCanvasBounds(page) {
    const canvas = page.locator('canvas').first();
    return await canvas.boundingBox();
}

async function clickGame(page, gx, gy) {
    const bounds = await getCanvasBounds(page);
    const scaleX = bounds.width / GAME_W;
    const scaleY = bounds.height / GAME_H;
    await page.mouse.click(bounds.x + gx * scaleX, bounds.y + gy * scaleY);
}

async function moveToGame(page, gx, gy) {
    const bounds = await getCanvasBounds(page);
    const scaleX = bounds.width / GAME_W;
    const scaleY = bounds.height / GAME_H;
    await page.mouse.move(bounds.x + gx * scaleX, bounds.y + gy * scaleY);
}

function makeSave(party, floor = 1, extras = {}) {
    return {
        version: 5,
        gameVersion: '0.20.0',
        savedAt: Date.now(),
        floor, gold: 200,
        party, inventory: [],
        campFloor: extras.campFloor || 1,
        nextShopFloor: extras.nextShopFloor || floor,
        fisherId: 'andy',
        pveDeathCount: 0,
        pvpLossCount: 0,
        roster: extras.roster || [],
        companion: null,
        equipment: { grid: [], stash: [], harmonyPosition: { row: 4, col: 1 } },
        equipmentDelta: null
    };
}

function makeParty() {
    return [{
        speciesId: 'guppy', name: 'Guppy', color: 0xe8734a,
        level: 10, xp: 0, xpToNext: 125,
        hp: 120, maxHp: 120, atk: 28, def: 16, spd: 14,
        shield: 0, maxShield: 0, healPower: 0,
        moves: ['bubble_volley'],
        poisoned: null, buffs: [], burn: null, curses: [], hots: [], poisons: []
    }];
}

async function loadSave(page, saveData) {
    await page.goto(BASE);
    await page.evaluate(({ key, data }) => {
        localStorage.setItem(key, JSON.stringify(data));
    }, { key: SAVE_KEY, data: saveData });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(BUTTON_APPEAR_MS);
}

async function getCanvasCursor(page) {
    return await page.evaluate(() => {
        const canvas = document.querySelector('canvas');
        return canvas ? canvas.style.cursor : null;
    });
}

// ─── Step 1: Code inspection — guard exists ─────────────────────────────────

test('step1: CursorManager.attach() has pointer:coarse guard before detach()', async () => {
    const src = fs.readFileSync(
        path.resolve(__dirname, '../../dungeon-fisher/src/ui/CursorManager.js'),
        'utf-8'
    );

    // Guard must exist
    expect(src).toContain("matchMedia?.('(pointer: coarse)')?.matches");

    // Guard must be before this.detach() — find their line positions
    const lines = src.split('\n');
    let guardLine = -1;
    let detachLine = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('pointer: coarse')) guardLine = i;
        if (guardLine >= 0 && detachLine < 0 && lines[i].includes('this.detach()')) detachLine = i;
    }
    expect(guardLine, 'Guard line should be found').toBeGreaterThan(-1);
    expect(detachLine, 'detach() line should be found after guard').toBeGreaterThan(guardLine);
});

test('step1b: guard uses optional chaining for safety', async () => {
    const src = fs.readFileSync(
        path.resolve(__dirname, '../../dungeon-fisher/src/ui/CursorManager.js'),
        'utf-8'
    );

    // Must use ?. on both matchMedia and .matches
    expect(src).toMatch(/window\.matchMedia\?\.\(.+\)\?\.matches/);
});

// ─── Step 2: Touch device — cursor NOT hidden ───────────────────────────────

test('step2: touch device does not activate software cursor', async ({ browser }) => {
    const iPhone = devices['iPhone 13'];
    const context = await browser.newContext({
        ...iPhone,
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loadSave(page, makeSave(makeParty(), 1));

    // Tap CONTINUE to enter FloorScene
    const bounds = await getCanvasBounds(page);
    const scaleX = bounds.width / GAME_W;
    const scaleY = bounds.height / GAME_H;
    await page.tap('canvas', { position: { x: 240 * scaleX, y: 116 * scaleY } });
    await page.waitForTimeout(4500);

    // On touch device, CursorManager.attach() should have returned early,
    // so the canvas cursor should NOT be 'none'
    const cursor = await getCanvasCursor(page);
    expect(cursor, 'Touch device: cursor should NOT be none (guard returned early)').not.toBe('none');

    await page.screenshot({ path: `${SCREENSHOT_DIR}/touch-01-floor-no-cursor.png` });
    expect(errors.filter(e => /cursor|texture/i.test(e)),
        `Touch cursor errors: ${errors.join(' | ')}`).toHaveLength(0);

    await context.close();
});

// ─── Step 3: Desktop — cursor IS hidden (no regression) ─────────────────────

test('step3: desktop still shows software cursor (no regression)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loadSave(page, makeSave(makeParty(), 1));

    // Click CONTINUE to enter FloorScene
    await clickGame(page, 240, 116);
    await page.waitForTimeout(4500);

    // Move mouse to non-interactive area
    await moveToGame(page, 10, 10);
    await page.waitForTimeout(500);

    // Desktop: CursorManager.attach() should run normally, hiding the CSS cursor
    const cursor = await getCanvasCursor(page);
    expect(cursor, 'Desktop: cursor should be none (software cursor active)').toBe('none');

    await page.screenshot({ path: `${SCREENSHOT_DIR}/touch-02-desktop-cursor-hidden.png` });
    expect(errors.filter(e => /cursor|texture/i.test(e)),
        `Desktop cursor errors: ${errors.join(' | ')}`).toHaveLength(0);
});

// ─── Step 4: No changes to other CursorManager methods ─────────────────────

test('step4: idle bob, _onMove, _onDown methods remain intact', async () => {
    const src = fs.readFileSync(
        path.resolve(__dirname, '../../dungeon-fisher/src/ui/CursorManager.js'),
        'utf-8'
    );

    // Core methods should still exist
    expect(src).toContain('_onMove(pointer)');
    expect(src).toContain('_onDown()');
    expect(src).toContain('_startIdleBob(scene)');
    expect(src).toContain('_ensureSprite()');
    expect(src).toContain('detach(optScene)');

    // Idle bob should still use addCounter with sin wave
    expect(src).toContain('Math.sin(tween.getValue())');

    // Click animation should still use angle tween
    expect(src).toContain('angle: { from: 0, to: 15 }');
});

// ─── Step 5: Version bumped ─────────────────────────────────────────────────

test('step5: version was bumped for touch cursor fix', async () => {
    const content = fs.readFileSync(
        path.resolve(__dirname, '../../dungeon-fisher/src/version.js'),
        'utf-8'
    );

    const match = content.match(/VERSION\s*=\s*'(\d+)\.(\d+)\.(\d+)'/);
    expect(match, 'VERSION string should be present').toBeTruthy();

    const [, major, minor, patch] = match.map(Number);
    // Should be at least 0.20.8 (the version that includes this fix)
    const versionNum = major * 10000 + minor * 100 + patch;
    expect(versionNum, `VERSION ${major}.${minor}.${patch} should be >= 0.20.8`).toBeGreaterThanOrEqual(2008);
});
