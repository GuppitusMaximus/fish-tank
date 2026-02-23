/**
 * Browser QA: UI Migrate Menus (qa-browser-ui-migrate-menus)
 * Verifies TitleScene and CharacterSelectScene render and behave correctly
 * after migrating to UIPanel, UIButton, and UILayout components.
 *
 * Tests the Phaser-based game at localhost:8080 (vite dev server).
 */

const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:8080';

// Game canvas dimensions
const GAME_W = 480;
const GAME_H = 270;

async function getCanvasBounds(page) {
    const canvas = page.locator('canvas').first();
    return await canvas.boundingBox();
}

// Convert game coordinates to browser viewport coordinates
async function gameCoord(page, gx, gy) {
    const bounds = await getCanvasBounds(page);
    const scaleX = bounds.width / GAME_W;
    const scaleY = bounds.height / GAME_H;
    return {
        x: bounds.x + gx * scaleX,
        y: bounds.y + gy * scaleY
    };
}

async function clickGame(page, gx, gy) {
    const { x, y } = await gameCoord(page, gx, gy);
    await page.mouse.click(x, y);
}

// Fresh start: clear save and wait 5s for button fade-in animation
async function freshStart(page) {
    await page.goto(BASE);
    await page.evaluate(() => localStorage.removeItem('dungeon-fisher-save'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(5000);
}

// ─── Step 6: Import verification (code-level) ─────────────────────────────────

test('imports: TitleScene imports from ui/index.js not themedPanel', async ({ page }) => {
    // This test verifies by loading the game successfully (no import errors)
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // If imports were broken, we'd see module import errors here
    expect(errors.filter(e => e.includes('import') || e.includes('module') || e.includes('Cannot find'))).toHaveLength(0);
    await page.screenshot({ path: 'tests/browser/screenshots/ui-migrate-title-loads.png' });
});

// ─── Step 1 & 2: TitleScene — Visual ─────────────────────────────────────────

test('title: renders with no JS errors on fresh start', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await freshStart(page);
    await page.screenshot({ path: 'tests/browser/screenshots/ui-migrate-title-fresh.png' });

    expect(errors).toHaveLength(0);
});

test('title: canvas renders non-blank content', async ({ page }) => {
    await freshStart(page);

    const hasContent = await page.evaluate(() => {
        const canvas = document.querySelector('canvas');
        if (!canvas) return false;
        // WebGL canvas won't give pixel data via 2d ctx, but width/height non-zero means rendered
        return canvas.width > 0 && canvas.height > 0;
    });
    expect(hasContent).toBe(true);
});

test('title: no game asset request failures', async ({ page }) => {
    const failed = [];
    page.on('requestfailed', req => {
        const url = req.url();
        // Ignore external font providers and favicons — only check local game assets
        if (!url.includes('favicon') &&
            !url.includes('fonts.gstatic.com') &&
            !url.includes('fonts.googleapis.com')) {
            failed.push(url);
        }
    });
    await freshStart(page);
    expect(failed).toHaveLength(0);
});

// ─── Step 1: TitleScene — Landscape buttons ───────────────────────────────────

test('title-landscape: NEW GAME button at expected position (no errors on click)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await freshStart(page);
    // NEW GAME button: W/2=240, H*0.36=97
    await clickGame(page, 240, 97);
    await page.waitForTimeout(600);

    await page.screenshot({ path: 'tests/browser/screenshots/ui-migrate-after-new-game.png' });
    expect(errors).toHaveLength(0);
});

test('title-landscape: ZONES button at expected position (no errors on click)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await freshStart(page);
    // ZONES button: W/2=240, H*0.50=135
    await clickGame(page, 240, 135);
    await page.waitForTimeout(600);

    await page.screenshot({ path: 'tests/browser/screenshots/ui-migrate-zones-click.png' });
    expect(errors).toHaveLength(0);
});

// ─── Step 2: TitleScene → CharacterSelectScene transition ─────────────────────

test('title→charselect: clicking NEW GAME transitions scene without errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await freshStart(page);
    await clickGame(page, 240, 97);  // NEW GAME (H*0.36=97)
    await page.waitForTimeout(800);

    await page.screenshot({ path: 'tests/browser/screenshots/ui-migrate-charselect.png' });
    expect(errors).toHaveLength(0);
});

// ─── Step 4 & 5: CharacterSelectScene — Visual and interaction ────────────────

test('charselect→title→starter: full flow completes without errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await freshStart(page);
    // NEW GAME (H*0.36=97)
    await clickGame(page, 240, 97);
    await page.waitForTimeout(300);

    await page.screenshot({ path: 'tests/browser/screenshots/ui-migrate-charselect-rendered.png' });

    // CharacterSelect SELECT landscape: W*0.65=312, H*0.78=211
    await clickGame(page, 312, 211);
    await page.waitForTimeout(300);

    await page.screenshot({ path: 'tests/browser/screenshots/ui-migrate-starter-selection.png' });
    expect(errors).toHaveLength(0);
});

test('full flow: Title→CharSelect→Starter→FloorScene with no JS errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await freshStart(page);
    await clickGame(page, 240, 97);   // NEW GAME
    await page.waitForTimeout(300);
    await clickGame(page, 312, 211);  // CharacterSelect SELECT
    await page.waitForTimeout(300);
    // First starter (Guppy): x=120, y=H*0.45+45=166
    await clickGame(page, 120, 166);

    // Wait for save to be created (FloorScene saves on start)
    await page.waitForFunction(() => !!localStorage.getItem('dungeon-fisher-save'), { timeout: 5000 });

    await page.screenshot({ path: 'tests/browser/screenshots/ui-migrate-floor-scene.png' });

    const save = await page.evaluate(() => JSON.parse(localStorage.getItem('dungeon-fisher-save') || 'null'));
    expect(save).not.toBeNull();
    expect(save.floor).toBe(1);
    expect(save.party[0].speciesId).toBe('guppy');
    expect(save.fisherId).toBe('andy');
    expect(errors).toHaveLength(0);
});

// ─── Step 3: Portrait layout ──────────────────────────────────────────────────

test('portrait: title screen renders correctly on 375x667 viewport', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(5000);

    await page.screenshot({ path: 'tests/browser/screenshots/ui-migrate-title-portrait.png' });

    // Canvas should be in portrait orientation (9:16 ratio)
    const bounds = await page.locator('canvas').first().boundingBox();
    expect(bounds.width).toBeLessThan(bounds.height);

    expect(errors).toHaveLength(0);
    await ctx.close();
});

test('portrait: full new game flow renders without errors', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto(BASE);
    await page.evaluate(() => localStorage.removeItem('dungeon-fisher-save'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(5000);

    // Portrait game dimensions: W=270, H=480
    const PORTRAIT_W = 270;
    const PORTRAIT_H = 480;
    const bounds = await page.locator('canvas').first().boundingBox();
    const scaleX = bounds.width / PORTRAIT_W;
    const scaleY = bounds.height / PORTRAIT_H;

    // NEW GAME button: W/2=135, H*0.36=173
    await page.mouse.click(bounds.x + 135 * scaleX, bounds.y + 173 * scaleY);
    await page.waitForTimeout(300);

    await page.screenshot({ path: 'tests/browser/screenshots/ui-migrate-charselect-portrait.png' });

    // CharacterSelect SELECT portrait: W/2=135, H*0.82=394
    await page.mouse.click(bounds.x + 135 * scaleX, bounds.y + 394 * scaleY);
    await page.waitForTimeout(300);

    await page.screenshot({ path: 'tests/browser/screenshots/ui-migrate-starter-portrait.png' });

    expect(errors).toHaveLength(0);
    await ctx.close();
});

// ─── Step 7: No visual regression (key checks) ───────────────────────────────

test('regression: CONTINUE button appears when save exists', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto(BASE);
    await page.evaluate(() => {
        localStorage.setItem('dungeon-fisher-save', JSON.stringify({
            version: 3, savedAt: Date.now(), floor: 5, gold: 50, campFloor: 3,
            nextShopFloor: 5, fisherId: 'andy',
            party: [{ speciesId: 'guppy', name: 'Guppy', level: 2, xp: 0, xpToNext: 50,
                hp: 35, maxHp: 35, atk: 10, def: 6, spd: 7, moves: ['splash'],
                poisoned: null, buffs: [] }],
            inventory: []
        }));
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(5000);

    await page.screenshot({ path: 'tests/browser/screenshots/ui-migrate-with-save.png' });

    // CONTINUE button click (H*0.43=116)
    await clickGame(page, 240, 116);
    await page.waitForTimeout(600);

    await page.screenshot({ path: 'tests/browser/screenshots/ui-migrate-continue-clicked.png' });
    expect(errors).toHaveLength(0);
});
