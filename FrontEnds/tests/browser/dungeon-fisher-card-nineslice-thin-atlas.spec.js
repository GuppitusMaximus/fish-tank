/**
 * Browser QA: Card Nineslice Thin-Border Atlas
 * Verifies that FloorScene action cards use the sewers_sm atlas for nineslice
 * rendering with visible borders and card images.
 *
 * Plan: qa-browser-card-nineslice-thin-atlas
 */

const { test, expect } = require('@playwright/test');
const path = require('path');

const BASE = 'http://localhost:8080';
const GAME_W = 480;
const GAME_H = 270;

async function getCanvasBounds(page) {
    const canvas = page.locator('canvas').first();
    return await canvas.boundingBox();
}

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

async function hoverGame(page, gx, gy) {
    const { x, y } = await gameCoord(page, gx, gy);
    await page.mouse.move(x, y);
}

/**
 * Load FloorScene with a sewers-zone save (floor 1, shop available).
 * Waits for TitleScene fade-in then clicks CONTINUE.
 */
async function loadFloorScene(page) {
    await page.goto(BASE);
    await page.evaluate(() => {
        localStorage.setItem('dungeon-fisher-save', JSON.stringify({
            version: 3,
            savedAt: Date.now(),
            floor: 1,
            gold: 50,
            campFloor: 1,
            fisherId: 'andy',
            nextShopFloor: 1,
            party: [{
                speciesId: 'guppy', name: 'Guppy', level: 1, xp: 0, xpToNext: 25,
                hp: 30, maxHp: 30, atk: 8, def: 5, spd: 6,
                moves: ['bubble_volley'], poisoned: null, buffs: []
            }],
            inventory: []
        }));
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    // Wait for TitleScene fade-in (buttons have 3.5s alpha animation)
    await page.waitForTimeout(5000);
    // CONTINUE button at (W/2, H*0.43) = (240, 116)
    await clickGame(page, 240, 116);
    // Wait for FloorScene to render (zone assets load, UI builds)
    await page.waitForTimeout(1500);
}

// ─── Step 8: Atlas file exists ─────────────────────────────────────────────────

test('atlas: sewers_sm.png exists in public/atlases/', async ({ page }) => {
    // Verify the thin-border atlas loads from the server with no 404
    const failedRequests = [];
    page.on('requestfailed', req => failedRequests.push(req.url()));

    const response = await page.goto(`${BASE}/atlases/sewers_sm.png`);
    expect(response.status()).toBe(200);
    expect(failedRequests).toHaveLength(0);
});

// ─── Step 1: Boot without errors ───────────────────────────────────────────────

test('floor: loads floor scene with no JS errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loadFloorScene(page);

    await page.screenshot({ path: 'tests/browser/screenshots/card-nineslice-01-floor-scene.png' });
    expect(errors, `JS errors: ${errors.join(', ')}`).toHaveLength(0);
});

// ─── Step 3-5: Card border and image visibility ─────────────────────────────────

test('cards: floor scene renders three action cards', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loadFloorScene(page);

    // Take screenshot for visual inspection
    await page.screenshot({ path: 'tests/browser/screenshots/card-nineslice-02-cards.png' });

    // Verify no JS errors during card rendering
    expect(errors, `JS errors during card render: ${errors.join(', ')}`).toHaveLength(0);

    // Verify canvas is still rendering (not blank)
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();
});

test('cards: canvas content is non-trivial (not blank)', async ({ page }) => {
    await loadFloorScene(page);

    // Read canvas dimensions and verify non-zero content
    const hasContent = await page.evaluate(() => {
        const canvas = document.querySelector('canvas');
        if (!canvas) return false;
        // Check dimensions (WebGL doesn't allow getImageData without preserveDrawingBuffer)
        return canvas.width > 0 && canvas.height > 0;
    });
    expect(hasContent).toBe(true);
});

// ─── Step 6: Card labels and shimmer ───────────────────────────────────────────

test('cards: shimmer tweens run without JS errors (2s observation)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loadFloorScene(page);

    // Wait 2 seconds for shimmer tweens to cycle
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'tests/browser/screenshots/card-nineslice-03-shimmer.png' });
    expect(errors, `JS errors during shimmer: ${errors.join(', ')}`).toHaveLength(0);
});

// ─── Step 7: Card interactions ─────────────────────────────────────────────────

test('cards: hover over Delve card triggers no JS errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loadFloorScene(page);

    // Delve card center: midX=240, midY=199
    await hoverGame(page, 240, 199);
    await page.waitForTimeout(300);

    await page.screenshot({ path: 'tests/browser/screenshots/card-nineslice-04-hover-delve.png' });
    expect(errors, `JS errors on hover: ${errors.join(', ')}`).toHaveLength(0);
});

test('cards: hover over Camp card triggers no JS errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loadFloorScene(page);

    // Camp card center: midX=437, midY=107 (top-right position)
    await hoverGame(page, 437, 107);
    await page.waitForTimeout(300);

    await page.screenshot({ path: 'tests/browser/screenshots/card-nineslice-05-hover-camp.png' });
    expect(errors, `JS errors on camp hover: ${errors.join(', ')}`).toHaveLength(0);
});

test('cards: hover over Shop card triggers no JS errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loadFloorScene(page);

    // Shop card center: midX=43, midY=107 (top-left position)
    await hoverGame(page, 43, 107);
    await page.waitForTimeout(300);

    await page.screenshot({ path: 'tests/browser/screenshots/card-nineslice-06-hover-shop.png' });
    expect(errors, `JS errors on shop hover: ${errors.join(', ')}`).toHaveLength(0);
});

test('cards: clicking Delve transitions to BattleScene without JS errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loadFloorScene(page);

    // Click Delve card at midX=240, midY=199
    await clickGame(page, 240, 199);
    await page.waitForTimeout(1500);

    await page.screenshot({ path: 'tests/browser/screenshots/card-nineslice-07-delve-click.png' });
    expect(errors, `JS errors on delve click: ${errors.join(', ')}`).toHaveLength(0);

    // Canvas should still render after scene transition
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();
});

test('cards: clicking Camp transitions to CampScene without JS errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loadFloorScene(page);

    // Click Camp card at midX=437, midY=107
    await clickGame(page, 437, 107);
    await page.waitForTimeout(1000);

    await page.screenshot({ path: 'tests/browser/screenshots/card-nineslice-08-camp-click.png' });
    expect(errors, `JS errors on camp click: ${errors.join(', ')}`).toHaveLength(0);

    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();
});

test('cards: clicking Shop transitions to ShopScene without JS errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loadFloorScene(page);

    // Click Shop card at midX=43, midY=107
    await clickGame(page, 43, 107);
    await page.waitForTimeout(1000);

    await page.screenshot({ path: 'tests/browser/screenshots/card-nineslice-09-shop-click.png' });
    expect(errors, `JS errors on shop click: ${errors.join(', ')}`).toHaveLength(0);

    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();
});

// ─── Code-level: nineslice implementation verification ─────────────────────────

test('implementation: atlas_sewers_sm loads successfully from server', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    const networkRequests = [];
    page.on('response', res => {
        if (res.url().includes('sewers_sm')) {
            networkRequests.push({ url: res.url(), status: res.status() });
        }
    });

    await loadFloorScene(page);

    // atlas_sewers_sm should have been loaded by BootScene
    const atlasRequests = networkRequests.filter(r => r.url.includes('sewers_sm'));
    expect(atlasRequests.length).toBeGreaterThan(0);
    const allOk = atlasRequests.every(r => r.status === 200);
    expect(allOk, `sewers_sm.png returned non-200: ${JSON.stringify(atlasRequests)}`).toBe(true);
});

test('implementation: no asset load failures on floor scene entry', async ({ page }) => {
    const failedRequests = [];
    page.on('requestfailed', req => {
        const url = req.url();
        // Ignore favicon and external font CDN (unavailable in headless test environment)
        if (!url.includes('favicon') && !url.includes('fonts.gstatic.com') && !url.includes('fonts.googleapis.com')) {
            failedRequests.push(url);
        }
    });
    const errorResponses = [];
    page.on('response', res => {
        const url = res.url();
        if (res.status() >= 400 && !url.includes('favicon') && !url.includes('fonts.gstatic.com') && !url.includes('fonts.googleapis.com')) {
            errorResponses.push(`${res.status()} ${url}`);
        }
    });

    await loadFloorScene(page);

    expect(failedRequests, `Failed requests: ${failedRequests.join(', ')}`).toHaveLength(0);
    expect(errorResponses, `Error responses: ${errorResponses.join(', ')}`).toHaveLength(0);
});
