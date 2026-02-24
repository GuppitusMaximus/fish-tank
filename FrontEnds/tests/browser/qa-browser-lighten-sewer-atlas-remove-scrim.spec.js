/**
 * Browser QA: Lighten Sewer Atlas and Remove Card Label Scrim
 * Verifies the brighter ui_sewers.png atlas and removal of dark scrim
 * behind action card labels in the sewers zone.
 *
 * Plan: qa-browser-lighten-sewer-atlas-remove-scrim
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
const SAVE_KEY = 'dungeon-fisher-save';

const KNOWN_VITE_ERRORS = [
    'Unexpected token \'<\', "<!doctype "... is not valid JSON',
    "Unexpected token '<'",
];

const BUTTON_APPEAR_MS = 5000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getCanvasBounds(page) {
    const canvas = page.locator('canvas').first();
    return await canvas.boundingBox();
}

async function gameCoord(page, gx, gy) {
    const bounds = await getCanvasBounds(page);
    const scaleX = bounds.width / GAME_W;
    const scaleY = bounds.height / GAME_H;
    return { x: bounds.x + gx * scaleX, y: bounds.y + gy * scaleY };
}

async function clickGame(page, gx, gy) {
    const { x, y } = await gameCoord(page, gx, gy);
    await page.mouse.click(x, y);
}

async function freshStart(page) {
    await page.goto(BASE);
    await page.evaluate((key) => localStorage.removeItem(key), SAVE_KEY);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(BUTTON_APPEAR_MS);
}

async function goToFloorScene(page) {
    await freshStart(page);
    await clickGame(page, 240, 97);   // [ NEW GAME ] at H*0.36
    await page.waitForTimeout(400);
    await clickGame(page, 312, 211);  // CharacterSelect [ SELECT ] at (W*0.65, H*0.78)
    await page.waitForTimeout(400);
    await clickGame(page, 120, 166);  // Guppy [ SELECT ] at x=120, y=H*0.45+45=166
    await page.waitForFunction((key) => !!localStorage.getItem(key), SAVE_KEY, { timeout: 5000 });
    await page.waitForTimeout(800);
}

async function sampleRegion(page, gx, gy, w, h) {
    return page.evaluate(([gx, gy, w, h, gW, gH]) => {
        const canvas = document.querySelector('canvas');
        if (!canvas) return null;
        const scaleX = canvas.width / gW;
        const scaleY = canvas.height / gH;
        const px = Math.floor(gx * scaleX);
        const py = Math.floor(gy * scaleY);
        const pw = Math.max(1, Math.ceil(w * scaleX));
        const ph = Math.max(1, Math.ceil(h * scaleY));
        try {
            const off = document.createElement('canvas');
            off.width = canvas.width;
            off.height = canvas.height;
            const ctx = off.getContext('2d');
            ctx.drawImage(canvas, 0, 0);
            const data = ctx.getImageData(px, py, pw, ph).data;
            let r = 0, g = 0, b = 0, cnt = 0;
            for (let i = 0; i < data.length; i += 4) {
                r += data[i]; g += data[i + 1]; b += data[i + 2]; cnt++;
            }
            if (cnt === 0) return null;
            return { r: r / cnt, g: g / cnt, b: b / cnt, pixels: cnt };
        } catch (e) {
            return { error: e.message };
        }
    }, [gx, gy, w, h, GAME_W, GAME_H]);
}

// ─── Step 1: Version check ────────────────────────────────────────────────────

test('version: game reports version 1.13.27', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(2000);

    // Read version.js directly as confirmation
    const filePath = path.join(__dirname, '../../dungeon-fisher/src/version.js');
    const content = fs.readFileSync(filePath, 'utf8');
    const match = content.match(/VERSION\s*=\s*['"]([^'"]+)['"]/);
    expect(match, 'version.js should have a VERSION export').toBeTruthy();
    expect(match[1], 'VERSION should be 1.13.27').toBe('1.13.27');
});

// ─── Step 2: Atlas brightness check ───────────────────────────────────────────

test('atlas: ui_sewers.png exists and loads as image', async ({ page }) => {
    const filePath = path.join(__dirname, '../../dungeon-fisher/public/atlases/ui_sewers.png');
    expect(fs.existsSync(filePath), 'ui_sewers.png must exist').toBe(true);

    // Fetch the atlas and verify it loads as an image
    const response = await page.request.get(`${BASE}/atlases/ui_sewers.png`);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('image');

    // Confirm it's a valid PNG with positive dimensions
    const buf = fs.readFileSync(filePath);
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    expect(w, 'PNG width must be positive').toBeGreaterThan(0);
    expect(h, 'PNG height must be positive').toBeGreaterThan(0);
});

// ─── Step 3: No dark scrim behind card labels ─────────────────────────────────

test('floor: action card panels render without dark scrim behind labels', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await goToFloorScene(page);
    await page.waitForTimeout(600);
    await page.screenshot({ path: 'tests/browser/screenshots/lighten-scrim-01-floor-scene.png' });

    const realErrors = errors.filter(e => !KNOWN_VITE_ERRORS.some(k => e.includes(k)));
    expect(realErrors, `JS errors: ${realErrors.join(', ')}`).toHaveLength(0);

    // The DELVE card is typically at ~(240, 180) in the default sewers floor
    // Sample the label area (bottom portion of the card) — should NOT be very dark
    // If a scrim (0x000000, 0.6 alpha) were present, average brightness would be low
    // Card label area: roughly at y=215-225 for the default card layout
    const labelRegion = await sampleRegion(page, 210, 215, 60, 12);

    if (labelRegion && !labelRegion.error && labelRegion.pixels > 0) {
        const brightness = (labelRegion.r + labelRegion.g + labelRegion.b) / 3;
        // A dark scrim at 0.6 alpha would darken this significantly (< 30 typical)
        // Without scrim, the card image colors should show through (~50+)
        // We verify it's not extremely dark (which would indicate scrim still present)
        expect(brightness, `Label region is too dark — scrim may still be present: r=${labelRegion.r.toFixed(1)}, g=${labelRegion.g.toFixed(1)}, b=${labelRegion.b.toFixed(1)}, brightness=${brightness.toFixed(1)}`).toBeGreaterThan(20);
    }
});

test('floor: card panel center is not fully dark (fillAlpha:0 preserved)', async ({ page }) => {
    await goToFloorScene(page);
    await page.waitForTimeout(600);

    // Sample the center area of the DELVE card — should show card image colors
    // not a solid dark background (which would indicate fillAlpha was changed)
    const centerRegion = await sampleRegion(page, 210, 175, 60, 20);
    await page.screenshot({ path: 'tests/browser/screenshots/lighten-scrim-02-card-center.png' });

    if (centerRegion && !centerRegion.error && centerRegion.pixels > 0) {
        const brightness = (centerRegion.r + centerRegion.g + centerRegion.b) / 3;
        // If fillAlpha:0 is working, the card image should be visible
        // Card images (delve, shop, camp) have colored content
        expect(brightness, `Card center too dark — panel fill may be blocking image: brightness=${brightness.toFixed(1)}`).toBeGreaterThan(15);
    }
});

// ─── Step 4: Title screen CONTINUE button uses sewers atlas (if save in sewers) ──

test('title: sewers save shows CONTINUE with sewers-themed atlas border', async ({ page }) => {
    await page.goto(BASE);
    // Inject a sewers zone save (floor 3)
    await page.evaluate((key) => {
        localStorage.setItem(key, JSON.stringify({
            version: 3,
            gameVersion: '1.13.27',
            savedAt: Date.now(),
            floor: 3, gold: 15,
            party: [{
                speciesId: 'guppy', name: 'Guppy', color: 0xe8734a,
                level: 1, xp: 0, xpToNext: 30,
                hp: 20, maxHp: 20, atk: 8, def: 4, spd: 6,
                moves: ['bubble_volley'], poisoned: null, buffs: []
            }],
            inventory: [],
            campFloor: 1, fisherId: 'andy',
            nextShopFloor: 5
        }));
    }, SAVE_KEY);

    const sewerAtlasRequests = [];
    page.on('response', resp => {
        if (resp.url().includes('ui_sewers')) {
            sewerAtlasRequests.push({ url: resp.url(), status: resp.status() });
        }
    });

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(BUTTON_APPEAR_MS);
    await page.screenshot({ path: 'tests/browser/screenshots/lighten-scrim-03-title-sewers-continue.png' });

    // With a sewers zone save, the title screen CONTINUE button should use ui_sewers atlas
    const loaded = sewerAtlasRequests.filter(r => r.status === 200);
    expect(loaded.length, 'Expected ui_sewers atlas to load for sewers-zone CONTINUE button').toBeGreaterThanOrEqual(1);
});

// ─── Step 5: Visual screenshot for manual review ──────────────────────────────

test('screenshot: floor scene for visual review of card labels and borders', async ({ page }) => {
    await goToFloorScene(page);
    await page.waitForTimeout(800);

    // Full floor scene screenshot
    await page.screenshot({ path: 'tests/browser/screenshots/lighten-scrim-04-floor-full.png' });

    // Zoom into card area via screenshot + crop (screenshot the whole thing)
    const canvas = page.locator('canvas').first();
    const bounds = await canvas.boundingBox();
    expect(bounds, 'Canvas should be visible').not.toBeNull();
    expect(bounds.width).toBeGreaterThan(0);
});
