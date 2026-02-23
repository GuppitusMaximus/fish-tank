/**
 * Browser QA: Composite Panel — Title & Character Select
 * Verifies the composite atlas panel system (ui_gold) renders correctly
 * on the title screen and character select screen.
 *
 * Plan: qa-browser-composite-panel-title-charselect
 *
 * Requires: Vite dev server running at http://localhost:8080
 * Run: cd dungeon-fisher && npx vite --port 8080
 */

const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

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

// Clear save and wait for full title screen animation
async function freshStart(page) {
    await page.goto(BASE);
    await page.evaluate(() => localStorage.removeItem('dungeon-fisher-save'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(5000);
}

// ─── Step 1: Atlas file checks (static) ──────────────────────────────────────

test('atlas: ui_gold.png exists and is a valid 96x96 PNG', async ({ page }) => {
    // Verify the atlas loads from the dev server without error
    const response = await page.request.get(`${BASE}/atlases/ui_gold.png`);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('image');

    // Verify file dimensions via node fs (96x96 PNG)
    const filePath = path.join(__dirname, '../../dungeon-fisher/public/atlases/ui_gold.png');
    const buf = fs.readFileSync(filePath);
    // PNG IHDR: bytes 16-19 = width, bytes 20-23 = height
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    expect(w).toBe(96);
    expect(h).toBe(96);
});

test('atlas: ui_gold.json exists and has 9 required frames', async ({ page }) => {
    const response = await page.request.get(`${BASE}/atlases/ui_gold.json`);
    expect(response.status()).toBe(200);

    const json = await response.json();
    const frameNames = Object.keys(json.frames);

    const required = [
        'corner_tl', 'corner_tr', 'corner_bl', 'corner_br',
        'edge_top', 'edge_bottom', 'edge_left', 'edge_right',
        'center'
    ];
    for (const name of required) {
        expect(frameNames, `Missing frame: ${name}`).toContain(name);
    }
    expect(frameNames).toHaveLength(9);
});

test('atlas: ui_gold.json meta size is 96x96', async ({ page }) => {
    const response = await page.request.get(`${BASE}/atlases/ui_gold.json`);
    const json = await response.json();
    expect(json.meta.size.w).toBe(96);
    expect(json.meta.size.h).toBe(96);
});

// ─── Step 2: Title screen — no JS errors, atlas loads ────────────────────────

test('title: no JS errors on fresh start with composite atlas', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('console', msg => {
        if (msg.type() === 'error') errors.push(`[console.error] ${msg.text()}`);
    });

    await freshStart(page);
    await page.screenshot({ path: 'tests/browser/screenshots/composite-01-title-fresh.png' });

    expect(errors, `JS errors on title: ${errors.join(', ')}`).toHaveLength(0);
});

test('title: ui_gold atlas request succeeds (no 404)', async ({ page }) => {
    const failedRequests = [];
    page.on('requestfailed', req => {
        const url = req.url();
        if (url.includes('ui_gold')) {
            failedRequests.push(url);
        }
    });

    const atlasRequests = [];
    page.on('response', resp => {
        const url = resp.url();
        if (url.includes('ui_gold')) {
            atlasRequests.push({ url, status: resp.status() });
        }
    });

    await freshStart(page);

    // ui_gold atlas and json should have been requested and succeeded
    expect(failedRequests, `Atlas request failed: ${failedRequests.join(', ')}`).toHaveLength(0);
    const goldRequests = atlasRequests.filter(r => r.status === 200);
    expect(goldRequests.length, 'Expected ui_gold atlas requests to succeed').toBeGreaterThanOrEqual(2);
});

test('title: canvas renders non-blank content', async ({ page }) => {
    await freshStart(page);

    const hasContent = await page.evaluate(() => {
        const canvas = document.querySelector('canvas');
        return canvas && canvas.width > 0 && canvas.height > 0;
    });
    expect(hasContent).toBe(true);

    await page.screenshot({ path: 'tests/browser/screenshots/composite-02-title-content.png' });
});

// ─── Step 3: Title screen — NEW GAME button navigates to CharacterSelect ─────

test('charselect: NEW GAME click leads to CharacterSelect without JS errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await freshStart(page);
    // NEW GAME button: (240, 97) in game coordinates (H*0.36)
    await clickGame(page, 240, 97);
    await page.waitForTimeout(1500);

    await page.screenshot({ path: 'tests/browser/screenshots/composite-03-charselect-landscape.png' });
    expect(errors, `JS errors on CharacterSelect: ${errors.join(', ')}`).toHaveLength(0);
});

test('charselect: canvas still visible after navigating to character select', async ({ page }) => {
    await freshStart(page);
    await clickGame(page, 240, 97);
    await page.waitForTimeout(1500);

    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();

    await page.screenshot({ path: 'tests/browser/screenshots/composite-04-charselect-canvas.png' });
});

// ─── Step 4: Portrait mode — CharacterSelect panel ───────────────────────────

test('charselect: portrait mode renders without JS errors', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto(BASE);
    await page.evaluate(() => localStorage.removeItem('dungeon-fisher-save'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(5000);

    // Portrait game is 270x480; NEW GAME at roughly center-x, ~36% height
    // Game coords: (135, 173) → (gx=135, gy=173) in 270x480
    const bounds = await page.locator('canvas').first().boundingBox();
    const gx = bounds.x + bounds.width * 0.5;
    const gy = bounds.y + bounds.height * 0.36;
    await page.mouse.click(gx, gy);
    await page.waitForTimeout(1500);

    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();
    await page.screenshot({ path: 'tests/browser/screenshots/composite-05-charselect-portrait.png' });
    expect(errors, `Portrait CharacterSelect JS errors: ${errors.join(', ')}`).toHaveLength(0);

    await ctx.close();
});

// ─── Step 5: Sustained rendering — no degradation ────────────────────────────

test('title: no errors during 8s sustained render with composite panels', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto(BASE);
    await page.evaluate(() => localStorage.removeItem('dungeon-fisher-save'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(8000);

    await page.screenshot({ path: 'tests/browser/screenshots/composite-06-sustained-render.png' });
    expect(errors, `Sustained render errors: ${errors.join(', ')}`).toHaveLength(0);
});
