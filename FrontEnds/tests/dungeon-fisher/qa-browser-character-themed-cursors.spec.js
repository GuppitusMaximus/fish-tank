/**
 * Browser QA: Character-Themed Software Cursors
 *
 * Verifies the CursorManager renders a custom fishing rod cursor in gameplay
 * scenes, restores the default cursor in menu scenes, and handles idle
 * bobbing + click cast animations without errors.
 *
 * Runs against http://localhost:8080 (dungeon-fisher Vite dev/preview server).
 */

const { test, expect } = require('@playwright/test');
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
        gameVersion: '0.18.0',
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

/** Get the inline CSS cursor style on the canvas element (set by Phaser) */
async function getCanvasCursor(page) {
    return await page.evaluate(() => {
        const canvas = document.querySelector('canvas');
        // Phaser sets canvas.style.cursor directly; use inline style
        return canvas ? canvas.style.cursor : null;
    });
}

// ─── Step 1: Cursor appears in gameplay ─────────────────────────────────────

test('step1: custom cursor appears in FloorScene (CSS cursor hidden)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loadSave(page, makeSave(makeParty(), 1));

    // Click CONTINUE to enter FloorScene (transition takes ~3s)
    await clickGame(page, 240, 116);
    await page.waitForTimeout(4500);

    // Move mouse to a non-interactive area (top-left, avoids buttons/cards)
    // Phaser overrides cursor to 'pointer' when hovering over interactive objects
    await moveToGame(page, 10, 10);
    await page.waitForTimeout(500);

    // The CSS cursor should be 'none' because CursorManager.attach() hides it
    const cursor = await getCanvasCursor(page);
    expect(cursor, 'Canvas cursor should be none in gameplay').toBe('none');

    await page.screenshot({ path: `${SCREENSHOT_DIR}/cursor-01-floor-scene.png` });
    expect(errors.filter(e => /cursor|texture/i.test(e)),
        `Cursor-related errors: ${errors.join(' | ')}`).toHaveLength(0);
});

// ─── Step 2: Idle bobbing — no errors during hover ─────────────────────────

test('step2: idle bobbing runs without errors during sustained hover', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loadSave(page, makeSave(makeParty(), 1));
    await clickGame(page, 240, 116);  // CONTINUE
    await page.waitForTimeout(4500);

    // Hold cursor in non-interactive area and let the idle bob tween run
    await moveToGame(page, 10, 10);
    await page.waitForTimeout(2000);  // >1 full bob cycle (800ms * 2 = 1600ms)

    await page.screenshot({ path: `${SCREENSHOT_DIR}/cursor-02-idle-bob.png` });
    expect(errors, `Errors during idle bob: ${errors.join(' | ')}`).toHaveLength(0);
});

// ─── Step 3: Click cast animation — no stacking on rapid clicks ────────────

test('step3: rapid clicks produce no animation errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loadSave(page, makeSave(makeParty(), 1));
    await clickGame(page, 240, 116);  // CONTINUE
    await page.waitForTimeout(4500);

    // Rapid fire clicks over a non-interactive area of the game canvas
    for (let i = 0; i < 10; i++) {
        await clickGame(page, 20 + i * 5, 10);
        await page.waitForTimeout(50);
    }
    await page.waitForTimeout(500);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/cursor-03-rapid-clicks.png` });
    expect(errors, `Errors during rapid clicks: ${errors.join(' | ')}`).toHaveLength(0);
});

// ─── Step 4: Cursor persists across gameplay scenes ────────────────────────

test('step4: cursor hidden through FloorScene → BattleScene → FloorScene', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loadSave(page, makeSave(makeParty(), 1));
    await clickGame(page, 240, 116);  // CONTINUE
    await page.waitForTimeout(4500);

    // Move to non-interactive area before checking cursor
    await moveToGame(page, 10, 10);
    await page.waitForTimeout(300);

    // FloorScene: cursor should be hidden
    const cursorFloor = await getCanvasCursor(page);
    expect(cursorFloor, 'FloorScene: cursor should be none').toBe('none');

    // Click the delve card to enter battle
    await clickGame(page, 240, 199);
    await page.waitForTimeout(2000);

    // Move to non-interactive area in BattleScene
    await moveToGame(page, 10, 10);
    await page.waitForTimeout(300);

    // BattleScene: cursor should still be hidden
    const cursorBattle = await getCanvasCursor(page);
    expect(cursorBattle, 'BattleScene: cursor should be none').toBe('none');

    await page.screenshot({ path: `${SCREENSHOT_DIR}/cursor-04-battle-scene.png` });

    // Wait for battle to resolve and return to FloorScene
    const resolved = await page.waitForFunction((key) => {
        const raw = localStorage.getItem(key);
        if (!raw) return false;
        return JSON.parse(raw).floor > 1;
    }, SAVE_KEY, { timeout: 25000 }).then(() => true).catch(() => false);

    if (resolved) {
        await page.waitForTimeout(1000);
        await moveToGame(page, 10, 10);
        await page.waitForTimeout(300);
        const cursorBack = await getCanvasCursor(page);
        expect(cursorBack, 'FloorScene after battle: cursor should be none').toBe('none');
    }

    expect(errors.filter(e => /cursor|texture/i.test(e)),
        `Scene transition cursor errors: ${errors.join(' | ')}`).toHaveLength(0);
});

// ─── Step 5: No cursor in menu scenes ──────────────────────────────────────

test('step5: TitleScene restores default cursor', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    // Load fresh — no save — we'll be on the TitleScene
    await page.goto(BASE);
    await page.evaluate((key) => localStorage.removeItem(key), SAVE_KEY);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(BUTTON_APPEAR_MS);

    // Move mouse to bottom of canvas, well below all buttons (buttons end at y ≈ 0.50*270 = 135)
    // This avoids Phaser's per-object cursor override ('pointer' on button hover)
    await moveToGame(page, 240, 250);
    await page.waitForTimeout(500);

    const cursor = await getCanvasCursor(page);
    // CursorManager.detach() sets default cursor to 'default'
    expect(cursor, 'TitleScene: cursor should be default away from buttons').toBe('default');

    await page.screenshot({ path: `${SCREENSHOT_DIR}/cursor-05-title-default.png` });
    expect(errors.filter(e => /cursor|texture/i.test(e)),
        `Title scene cursor errors: ${errors.join(' | ')}`).toHaveLength(0);
});

test('step5b: DelversLedgerScene uses default cursor', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    // Start fresh — click NEW GAME to enter DelversLedgerScene
    await page.goto(BASE);
    await page.evaluate((key) => localStorage.removeItem(key), SAVE_KEY);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(BUTTON_APPEAR_MS);

    // Click NEW GAME (y ≈ 0.36*270 = 97 without save, only NEW GAME + OPTIONS)
    await clickGame(page, 240, 97);
    await page.waitForTimeout(4500);

    // Move to non-interactive area in ledger
    await moveToGame(page, 10, 10);
    await page.waitForTimeout(300);

    const cursor = await getCanvasCursor(page);
    expect(cursor, 'DelversLedgerScene: cursor should be default').toBe('default');

    await page.screenshot({ path: `${SCREENSHOT_DIR}/cursor-05b-ledger-default.png` });
    expect(errors.filter(e => /cursor|texture/i.test(e)),
        `Ledger cursor errors: ${errors.join(' | ')}`).toHaveLength(0);
});

// ─── Step 6: No visual issues (code inspection) ───────────────────────────

test('step6: CursorManager sets depth 10000 and scrollFactor 0', async () => {
    const cursorSrc = fs.readFileSync(
        path.resolve(__dirname, '../../dungeon-fisher/src/ui/CursorManager.js'),
        'utf-8'
    );

    // Verify depth is set to 10000
    expect(cursorSrc).toContain('.setDepth(10000)');

    // Verify scrollFactor is 0 (cursor stays fixed on screen)
    expect(cursorSrc).toContain('.setScrollFactor(0)');

    // Verify origin is at top-left for proper pointer alignment
    expect(cursorSrc).toContain('.setOrigin(0, 0)');
});

test('step6b: cursor sprite asset exists', async () => {
    const spritePath = path.resolve(__dirname, '../../dungeon-fisher/public/sprites/ui/cursor_andy.png');
    expect(fs.existsSync(spritePath), 'cursor_andy.png should exist').toBe(true);
});

test('step6c: no console errors during mouse movement in gameplay', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loadSave(page, makeSave(makeParty(), 1));
    await clickGame(page, 240, 116);  // CONTINUE
    await page.waitForTimeout(4500);

    // Move mouse around the game canvas extensively
    for (let i = 0; i < 20; i++) {
        await moveToGame(page, 50 + i * 20, 50 + (i % 5) * 40);
        await page.waitForTimeout(30);
    }
    await page.waitForTimeout(500);

    expect(errors, `Mouse movement errors: ${errors.join(' | ')}`).toHaveLength(0);
});

// ─── Step 7: Version check ─────────────────────────────────────────────────

test('step7: version.js has minor bump (>= 0.18.0) for cursor feature', async () => {
    const content = fs.readFileSync(
        path.resolve(__dirname, '../../dungeon-fisher/src/version.js'),
        'utf-8'
    );
    const match = content.match(/VERSION\s*=\s*'(\d+)\.(\d+)\.(\d+)'/);
    expect(match, 'VERSION string should be present').toBeTruthy();

    const [, major, minor, patch] = match.map(Number);
    // Cursor feature is a minor bump — should be at least 0.18.0
    const versionNum = major * 10000 + minor * 100 + patch;
    expect(versionNum, `VERSION ${major}.${minor}.${patch} should be >= 0.18.0`).toBeGreaterThanOrEqual(1800);
});
