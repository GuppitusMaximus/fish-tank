/**
 * Browser QA: Fix Atlas Load Error Regression Test
 * Verifies fix for bug zone-theme-title-screen-atlas-load-error.
 *
 * The fix adds a `loaderror` listener in ThemeAssetLoader.js to suppress the
 * "Unexpected token '<'" JSON parse error when atlas files are missing.
 *
 * Note: This test runs against the production site (https://the-fish-tank.com)
 * because the fix relies on HTTP 404 responses for missing atlas files.
 * The Vite dev server returns HTTP 200 (SPA fallback) for missing files,
 * which bypasses the loaderror handler and still triggers the JSON parse error.
 * GitHub Pages correctly returns 404, so the loaderror handler fires and
 * suppresses the error.
 *
 * Before the fix: clicking CONTINUE (which triggers FloorScene → atlas load)
 * would fire a pageerror with "Unexpected token '<'".
 * After the fix: no pageerror fires; the loader gracefully falls back.
 */

const { test, expect } = require('@playwright/test');

const BASE = 'https://the-fish-tank.com/dungeon-fisher';
const GAME_W = 480;
const GAME_H = 270;

async function getCanvasBounds(page) {
    const canvas = page.locator('canvas').first();
    return await canvas.boundingBox();
}

async function clickGame(page, gx, gy) {
    const bounds = await getCanvasBounds(page);
    const scaleX = bounds.width / GAME_W;
    const scaleY = bounds.height / GAME_H;
    await page.mouse.click(
        bounds.x + gx * scaleX,
        bounds.y + gy * scaleY
    );
}

async function startWithSave(page, floor) {
    await page.goto(BASE);
    await page.evaluate((f) => {
        localStorage.setItem('dungeon-fisher-save', JSON.stringify({
            version: 3, savedAt: Date.now(), floor: f, gold: 10, campFloor: f,
            party: [{ speciesId: 'guppy', name: 'Guppy', level: 1, xp: 0, xpToNext: 25,
                hp: 30, maxHp: 30, atk: 8, def: 5, spd: 6,
                specialMove: 'bubble_shot', poisoned: null, buffs: [] }],
            inventory: [], fisherId: 'andy', nextShopFloor: f
        }));
    }, floor);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(5000);
}

// ─── Regression: No JS errors when clicking CONTINUE (triggers FloorScene + atlas load) ─────────

test('fix: no pageerror when clicking CONTINUE with floor-1 save', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    // Create floor-1 (sewers zone) save and load title screen
    await startWithSave(page, 1);

    // Click CONTINUE — this triggers FloorScene which calls ThemeAssetLoader
    // which previously threw "Unexpected token '<'" when atlas JSON was missing
    await clickGame(page, 240, 116);  // CONTINUE at (240, 116) — H*0.43
    await page.waitForTimeout(1000);

    await page.screenshot({ path: 'tests/browser/screenshots/fix-atlas-01-continue-no-error.png' });

    // No JSON parse error should fire
    const jsonErrors = errors.filter(e => e.includes('Unexpected token') || e.includes('JSON'));
    expect(jsonErrors, `JSON parse errors after CONTINUE: ${jsonErrors.join(', ')}`).toHaveLength(0);

    // No pageerrors at all
    expect(errors, `JS errors after CONTINUE: ${errors.join(', ')}`).toHaveLength(0);
});

test('fix: canvas still visible after CONTINUE click (FloorScene loads)', async ({ page }) => {
    await startWithSave(page, 1);

    await clickGame(page, 240, 116);  // CONTINUE
    await page.waitForTimeout(1000);

    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();

    await page.screenshot({ path: 'tests/browser/screenshots/fix-atlas-02-canvas-visible.png' });
});

test('fix: no pageerror on CONTINUE with floor-11 save (goblin caves zone)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await startWithSave(page, 11);  // goblin_caves zone
    await clickGame(page, 240, 116);  // CONTINUE
    await page.waitForTimeout(1000);

    await page.screenshot({ path: 'tests/browser/screenshots/fix-atlas-03-goblin-caves-continue.png' });

    expect(errors, `JS errors (goblin caves CONTINUE): ${errors.join(', ')}`).toHaveLength(0);
});

test('fix: no pageerror on CONTINUE with floor-21 save (bone crypts zone)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await startWithSave(page, 21);  // bone_crypts zone
    await clickGame(page, 240, 116);  // CONTINUE
    await page.waitForTimeout(1000);

    await page.screenshot({ path: 'tests/browser/screenshots/fix-atlas-04-bone-crypts-continue.png' });

    expect(errors, `JS errors (bone crypts CONTINUE): ${errors.join(', ')}`).toHaveLength(0);
});
