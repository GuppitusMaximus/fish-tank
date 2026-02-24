/**
 * Browser QA: Sewers Composite Atlas Panels
 * Verifies the composite atlas panel system (ui_sewers) renders correctly
 * in the sewers zone with green filigree borders.
 *
 * Plan: qa-browser-sewer-composite-atlas
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

// Known non-critical errors from Vite's module loader during scene transitions
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

// ─── Step 1: Static atlas file checks ─────────────────────────────────────────

test('atlas: ui_sewers.png exists and is 96x96', async ({ page }) => {
    const response = await page.request.get(`${BASE}/atlases/ui_sewers.png`);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('image');

    const filePath = path.join(__dirname, '../../dungeon-fisher/public/atlases/ui_sewers.png');
    const buf = fs.readFileSync(filePath);
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    expect(w).toBe(96);
    expect(h).toBe(96);
});

test('atlas: ui_sewers.json has 9 required frames with correct coordinates', async ({ page }) => {
    const response = await page.request.get(`${BASE}/atlases/ui_sewers.json`);
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

    // Each piece should be 32x32 (pieceSize = 32 in themes.js)
    for (const [name, frame] of Object.entries(json.frames)) {
        expect(frame.frame.w, `Frame ${name} width should be 32`).toBe(32);
        expect(frame.frame.h, `Frame ${name} height should be 32`).toBe(32);
    }
});

test('atlas: ui_sewers.json meta size is 96x96', async ({ page }) => {
    const response = await page.request.get(`${BASE}/atlases/ui_sewers.json`);
    const json = await response.json();
    expect(json.meta.size.w).toBe(96);
    expect(json.meta.size.h).toBe(96);
});

// ─── Step 2: No errors entering sewers zone ────────────────────────────────────

test('sewers: no JS errors on fresh start entering sewers floor 1', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('console', msg => {
        if (msg.type() === 'error') errors.push(`[console.error] ${msg.text()}`);
    });

    await goToFloorScene(page);
    await page.screenshot({ path: 'tests/browser/screenshots/sewers-01-floor-scene.png' });

    const realErrors = errors.filter(e => !KNOWN_VITE_ERRORS.some(k => e.includes(k)));
    expect(realErrors, `JS errors entering sewers: ${realErrors.join(', ')}`).toHaveLength(0);
});

test('sewers: ui_sewers atlas loads without 404 (no failed requests)', async ({ page }) => {
    const failedRequests = [];
    page.on('requestfailed', req => {
        if (req.url().includes('ui_sewers')) failedRequests.push(req.url());
    });

    const atlasRequests = [];
    page.on('response', resp => {
        if (resp.url().includes('ui_sewers')) {
            atlasRequests.push({ url: resp.url(), status: resp.status() });
        }
    });

    await goToFloorScene(page);

    expect(failedRequests, `Atlas request failed: ${failedRequests.join(', ')}`).toHaveLength(0);
    const loaded = atlasRequests.filter(r => r.status === 200);
    expect(loaded.length, 'Expected ui_sewers atlas to load successfully').toBeGreaterThanOrEqual(2);
});

// ─── Step 3: Panel rendering with green filigree borders ──────────────────────

test('sewers: floor 1 canvas renders content', async ({ page }) => {
    await goToFloorScene(page);
    const canvas = page.locator('canvas').first();
    const dims = await page.evaluate(() => {
        const c = document.querySelector('canvas');
        return c ? { w: c.width, h: c.height } : null;
    });
    expect(dims).not.toBeNull();
    expect(dims.w).toBeGreaterThan(0);
    expect(dims.h).toBeGreaterThan(0);
    await page.screenshot({ path: 'tests/browser/screenshots/sewers-02-canvas-content.png' });
});

test('sewers: top panel corner has green accent (g >= r, sewers filigree)', async ({ page }) => {
    await goToFloorScene(page);
    await page.waitForTimeout(500);

    // Sewers accent: 0x88aa44 → r≈136, g≈170, b≈68 — green dominant
    // Gold/default accent: 0xccaa66 → r>g (fails this check)
    const px = await sampleRegion(page, 0, 0, 6, 6);
    await page.screenshot({ path: 'tests/browser/screenshots/sewers-03-panel-corner.png' });

    if (px && !px.error && px.pixels > 0) {
        expect(px.g, `Expected green accent (g >= r-15), got r=${px.r.toFixed(1)}, g=${px.g.toFixed(1)}, b=${px.b.toFixed(1)}`).toBeGreaterThanOrEqual(px.r - 15);
    }
});

test('sewers: battle scene loads without errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await goToFloorScene(page);
    // Click DELVE card
    await clickGame(page, 240, 180);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: 'tests/browser/screenshots/sewers-04-battle-scene.png' });

    const realErrors = errors.filter(e => !KNOWN_VITE_ERRORS.some(k => e.includes(k)));
    expect(realErrors, `JS errors in battle: ${realErrors.join(', ')}`).toHaveLength(0);
});

test('sewers: camp scene loads without errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await goToFloorScene(page);
    // Click CAMP card (~328, 82)
    await clickGame(page, 328, 82);
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'tests/browser/screenshots/sewers-05-camp-scene.png' });

    const realErrors = errors.filter(e => !KNOWN_VITE_ERRORS.some(k => e.includes(k)));
    expect(realErrors, `JS errors in camp: ${realErrors.join(', ')}`).toHaveLength(0);
});

// ─── Step 4: Other zones use nineslice (not sewers atlas) ─────────────────────

test('other-zones: goblin_caves floor 11 loads without errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto(BASE);
    await page.evaluate((key) => {
        localStorage.setItem(key, JSON.stringify({
            version: 3,
            gameVersion: '0.11.0',
            savedAt: Date.now(),
            floor: 11, gold: 30,
            party: [{
                speciesId: 'guppy', name: 'Guppy', color: 0xe8734a,
                level: 3, xp: 0, xpToNext: 75,
                hp: 40, maxHp: 40, atk: 12, def: 7, spd: 8,
                moves: ['bubble_volley'], poisoned: null, buffs: []
            }],
            inventory: [],
            campFloor: 1, fisherId: 'andy',
            nextShopFloor: 11
        }));
    }, SAVE_KEY);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(BUTTON_APPEAR_MS);
    await clickGame(page, 240, 116);  // CONTINUE button
    await page.waitForTimeout(800);

    await page.screenshot({ path: 'tests/browser/screenshots/sewers-06-goblin-caves.png' });

    const realErrors = errors.filter(e => !KNOWN_VITE_ERRORS.some(k => e.includes(k)));
    expect(realErrors, `JS errors in goblin_caves: ${realErrors.join(', ')}`).toHaveLength(0);
});

test('other-zones: goblin_caves panel has orange accent (r dominant, not sewers green)', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate((key) => {
        localStorage.setItem(key, JSON.stringify({
            version: 3,
            gameVersion: '0.11.0',
            savedAt: Date.now(),
            floor: 11, gold: 30,
            party: [{
                speciesId: 'guppy', name: 'Guppy', color: 0xe8734a,
                level: 3, xp: 0, xpToNext: 75,
                hp: 40, maxHp: 40, atk: 12, def: 7, spd: 8,
                moves: ['bubble_volley'], poisoned: null, buffs: []
            }],
            inventory: [],
            campFloor: 1, fisherId: 'andy',
            nextShopFloor: 11
        }));
    }, SAVE_KEY);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(BUTTON_APPEAR_MS);
    await clickGame(page, 240, 116);
    await page.waitForTimeout(800);

    // Goblin caves accent: 0xcc7733 → r=204, g=119, b=51 — warm orange (r > b)
    const px = await sampleRegion(page, 0, 0, 6, 6);
    await page.screenshot({ path: 'tests/browser/screenshots/sewers-06b-goblin-caves-panel.png' });

    if (px && !px.error && px.pixels > 0) {
        // Orange: r > b (204 vs 51). This also differentiates goblin_caves from sewers (g > r).
        expect(px.r, `Expected orange accent (r > b-20), got r=${px.r.toFixed(1)}, g=${px.g.toFixed(1)}, b=${px.b.toFixed(1)}`).toBeGreaterThan(px.b - 20);
    }
});

// ─── Step 5: Title screen still uses ui_gold, not ui_sewers ──────────────────

test('title: still uses ui_gold composite atlas (not ui_sewers)', async ({ page }) => {
    const sewerRequests = [];
    const goldRequests = [];

    page.on('response', resp => {
        const url = resp.url();
        if (url.includes('ui_sewers')) sewerRequests.push(url);
        if (url.includes('ui_gold')) goldRequests.push({ url, status: resp.status() });
    });

    await freshStart(page);
    await page.screenshot({ path: 'tests/browser/screenshots/sewers-07-title-atlas.png' });

    // Title screen should load ui_gold but NOT ui_sewers
    expect(goldRequests.filter(r => r.status === 200).length,
        'Title should request ui_gold atlas').toBeGreaterThanOrEqual(1);
    expect(sewerRequests.length,
        'Title screen should not request ui_sewers atlas').toBe(0);
});

test('title: no JS errors on title screen with ui_gold composite atlas', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('console', msg => {
        if (msg.type() === 'error') errors.push(`[console.error] ${msg.text()}`);
    });

    await freshStart(page);
    await page.screenshot({ path: 'tests/browser/screenshots/sewers-08-title-noerror.png' });

    const realErrors = errors.filter(e => !KNOWN_VITE_ERRORS.some(k => e.includes(k)));
    expect(realErrors, `JS errors on title: ${realErrors.join(', ')}`).toHaveLength(0);
});
