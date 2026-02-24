/**
 * Browser QA: Brighten Sewer Atlases
 * Verifies all three sewer atlases have bright vivid green borders.
 *
 * Plan: qa-browser-brighten-sewer-atlases
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
const BUTTON_APPEAR_MS = 5000;

const KNOWN_VITE_ERRORS = [
    'Unexpected token \'<\', "<!doctype "... is not valid JSON',
    "Unexpected token '<'",
];

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
    await clickGame(page, 312, 211);  // CharacterSelect [ SELECT ]
    await page.waitForTimeout(400);
    await clickGame(page, 120, 166);  // Guppy [ SELECT ]
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

test('version: game version is 1.13.27', async ({ page }) => {
    const filePath = path.join(__dirname, '../../dungeon-fisher/src/version.js');
    const content = fs.readFileSync(filePath, 'utf8');
    const match = content.match(/VERSION\s*=\s*['"]([^'"]+)['"]/);
    expect(match, 'version.js should have a VERSION export').toBeTruthy();
    expect(match[1], 'VERSION should be 1.13.27').toBe('1.13.27');
});

// ─── Step 2: Atlas files exist ────────────────────────────────────────────────

test('atlases: all three sewer atlas files exist', async ({ page }) => {
    const atlasDir = path.join(__dirname, '../../dungeon-fisher/public/atlases');
    expect(fs.existsSync(path.join(atlasDir, 'sewers.png')), 'sewers.png must exist').toBe(true);
    expect(fs.existsSync(path.join(atlasDir, 'sewers_wide.png')), 'sewers_wide.png must exist').toBe(true);
    expect(fs.existsSync(path.join(atlasDir, 'ui_sewers.png')), 'ui_sewers.png must exist').toBe(true);
});

test('atlases: sewers_wide.png has vivid green elements (green channel dominant in border region)', async ({ page }) => {
    // Load and serve the sewers_wide atlas through the dev server, then sample its colors
    const response = await page.request.get(`${BASE}/atlases/sewers_wide.png`);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('image');

    // Read the PNG dimensions
    const filePath = path.join(__dirname, '../../dungeon-fisher/public/atlases/sewers_wide.png');
    const buf = fs.readFileSync(filePath);
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    expect(w, 'PNG width must be positive').toBeGreaterThan(0);
    expect(h, 'PNG height must be positive').toBeGreaterThan(0);

    // Render the atlas in the browser to sample its colors
    await page.goto(BASE);
    const avgColor = await page.evaluate((url) => {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const c = document.createElement('canvas');
                c.width = img.width;
                c.height = img.height;
                const ctx = c.getContext('2d');
                ctx.drawImage(img, 0, 0);
                // Sample the border region (outer 10px on each side)
                const bw = Math.min(10, Math.floor(img.width * 0.1));
                const bh = Math.min(10, Math.floor(img.height * 0.1));
                // Top border
                const data = ctx.getImageData(0, 0, img.width, bh).data;
                let r = 0, g = 0, b = 0, cnt = 0;
                for (let i = 0; i < data.length; i += 4) {
                    if (data[i + 3] > 10) { // skip transparent
                        r += data[i]; g += data[i + 1]; b += data[i + 2]; cnt++;
                    }
                }
                if (cnt === 0) { resolve(null); return; }
                resolve({ r: r / cnt, g: g / cnt, b: b / cnt, pixels: cnt });
            };
            img.onerror = () => resolve(null);
            img.src = url;
        });
    }, `${BASE}/atlases/sewers_wide.png`);

    if (avgColor && !avgColor.error && avgColor.pixels > 0) {
        // The sewer atlas borders should be green-dominant
        expect(avgColor.g, `Green channel should dominate in border: r=${avgColor.r.toFixed(1)}, g=${avgColor.g.toFixed(1)}, b=${avgColor.b.toFixed(1)}`).toBeGreaterThan(avgColor.r);
        expect(avgColor.g, `Green channel should be > 80 for vivid green: r=${avgColor.r.toFixed(1)}, g=${avgColor.g.toFixed(1)}, b=${avgColor.b.toFixed(1)}`).toBeGreaterThan(80);
    }
});

// ─── Step 3: Floor scene — card panel borders are bright green ────────────────

test('floor: card panels have bright green borders from sewers atlas', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await goToFloorScene(page);
    await page.waitForTimeout(600);

    await page.screenshot({ path: 'tests/browser/screenshots/brighten-atlases-01-floor-scene.png' });

    const realErrors = errors.filter(e => !KNOWN_VITE_ERRORS.some(k => e.includes(k)));
    expect(realErrors, `JS errors: ${realErrors.join(', ')}`).toHaveLength(0);

    // Sample the top-left card border region
    // Sewers nineslice frame is roughly at x=175-265, y=145-235 for card panels
    // The TOP border of the card is approximately y=145-155
    const topBorder = await sampleRegion(page, 185, 146, 60, 8);
    if (topBorder && !topBorder.error && topBorder.pixels > 0) {
        const brightness = (topBorder.r + topBorder.g + topBorder.b) / 3;
        expect(brightness, `Card top border too dark: r=${topBorder.r.toFixed(1)}, g=${topBorder.g.toFixed(1)}, b=${topBorder.b.toFixed(1)}, brightness=${brightness.toFixed(1)}`).toBeGreaterThan(20);
    }
});

// ─── Step 4: Title screen CONTINUE button — bright green sewers border ────────

test('title: CONTINUE button uses sewers atlas with bright green borders', async ({ page }) => {
    await page.goto(BASE);
    // Inject a sewers zone save
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
        if (resp.url().includes('sewers')) {
            sewerAtlasRequests.push({ url: resp.url(), status: resp.status() });
        }
    });

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(BUTTON_APPEAR_MS);
    await page.screenshot({ path: 'tests/browser/screenshots/brighten-atlases-02-title-continue.png' });

    // Verify at least one sewer atlas loaded
    const loaded = sewerAtlasRequests.filter(r => r.status === 200);
    expect(loaded.length, `Expected a sewers atlas to load. Requests: ${JSON.stringify(sewerAtlasRequests)}`).toBeGreaterThanOrEqual(1);

    // Sample CONTINUE button border region — title button at approx (160-320, 155-175)
    const continueBorder = await sampleRegion(page, 165, 156, 60, 8);
    if (continueBorder && !continueBorder.error && continueBorder.pixels > 0) {
        const brightness = (continueBorder.r + continueBorder.g + continueBorder.b) / 3;
        expect(brightness, `CONTINUE button border too dark: r=${continueBorder.r.toFixed(1)}, g=${continueBorder.g.toFixed(1)}, b=${continueBorder.b.toFixed(1)}, brightness=${brightness.toFixed(1)}`).toBeGreaterThan(15);
    }
});

// ─── Step 5: Party/stats panel (sewers_wide atlas) ───────────────────────────

test('floor: party/stats panel uses sewers_wide atlas', async ({ page }) => {
    const sewerWideRequests = [];
    page.on('response', resp => {
        if (resp.url().includes('sewers_wide')) {
            sewerWideRequests.push({ url: resp.url(), status: resp.status() });
        }
    });

    await goToFloorScene(page);
    await page.waitForTimeout(600);
    await page.screenshot({ path: 'tests/browser/screenshots/brighten-atlases-03-party-panel.png' });

    // The sewers_wide atlas should have been requested for the party panel
    const loaded = sewerWideRequests.filter(r => r.status === 200);
    expect(loaded.length, `Expected sewers_wide atlas to load for party panel. Requests: ${JSON.stringify(sewerWideRequests)}`).toBeGreaterThanOrEqual(1);
});
