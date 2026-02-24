/**
 * Browser QA: Fix card panels — use nineslice for small cards, images on top
 *
 * Verifies that FloorScene action cards use nineslice panel frames (not the
 * composite atlas which produces oversized 32px corner pieces on small cards),
 * and that card artwork images are visible on top of the panel frame.
 *
 * Plan: qa-browser-fix-card-panels-use-nineslice
 *
 * Code inspection tests run anywhere.
 * Browser tests require: Vite dev server at http://localhost:8080
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

// ─── Code Inspection Helpers ──────────────────────────────────────────────────

const FLOOR_SCENE = path.resolve(__dirname, '../../dungeon-fisher/src/scenes/FloorScene.js');
const VERSION_FILE = path.resolve(__dirname, '../../dungeon-fisher/src/version.js');

function readScene() {
    return fs.readFileSync(FLOOR_SCENE, 'utf8');
}

// ─── Browser Helpers ──────────────────────────────────────────────────────────

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
            let r = 0, g = 0, b = 0, a = 0, cnt = 0;
            for (let i = 0; i < data.length; i += 4) {
                r += data[i]; g += data[i + 1]; b += data[i + 2]; a += data[i + 3]; cnt++;
            }
            if (cnt === 0) return null;
            return { r: r / cnt, g: g / cnt, b: b / cnt, a: a / cnt, pixels: cnt };
        } catch (e) {
            return { error: e.message };
        }
    }, [gx, gy, w, h, GAME_W, GAME_H]);
}

// ─── Step 1: Code Inspection — compositeKey removed from card theme ───────────

test('code: compositeKey is deleted from cardTheme before UIPanel creation', () => {
    const src = readScene();
    // Must delete compositeKey so ThemedPanel falls through to nineslice
    expect(src).toMatch(/delete cardTheme\.compositeKey/);
});

test('code: pieceSize is deleted from cardTheme (not needed for nineslice)', () => {
    const src = readScene();
    expect(src).toMatch(/delete cardTheme\.pieceSize/);
});

// ─── Step 2: Code Inspection — no opaque fill rectangle covering card image ──

test('code: no opaque fill rectangle (0x111111, alpha 1) in card loop', () => {
    const src = readScene();
    const forEachIdx = src.indexOf('cards.forEach(');
    expect(forEachIdx).toBeGreaterThan(-1);
    const afterForEach = src.slice(forEachIdx);
    // The old approach used an opaque 0x111111 rect — this must be gone
    expect(afterForEach).not.toMatch(/add\.rectangle\([^)]*0x111111,\s*1\)/);
});

// ─── Step 3: Code Inspection — card image rendered above panel frame ──────────

test('code: card image is created inside cards.forEach loop', () => {
    const src = readScene();
    const forEachIdx = src.indexOf('cards.forEach(');
    const afterForEach = src.slice(forEachIdx);
    expect(afterForEach).toMatch(/this\.add\.image\(/);
});

test('code: card image uses card.key texture', () => {
    const src = readScene();
    expect(src).toMatch(/this\.add\.image\(.*card\.key\)/s);
});

test('code: card image depth is 3 (above UIPanel at depth 2)', () => {
    const src = readScene();
    const forEachIdx = src.indexOf('cards.forEach(');
    const afterForEach = src.slice(forEachIdx);
    // img.setDepth(3) must appear inside the forEach
    expect(afterForEach).toMatch(/\.setDepth\(3\)/);
});

test('code: card label depth is 4 (above image at depth 3)', () => {
    const src = readScene();
    const forEachIdx = src.indexOf('cards.forEach(');
    const afterForEach = src.slice(forEachIdx);
    expect(afterForEach).toMatch(/\.setDepth\(4\)/);
});

test('code: hit zone depth is 5 (topmost, catches interaction)', () => {
    const src = readScene();
    const forEachIdx = src.indexOf('cards.forEach(');
    const afterForEach = src.slice(forEachIdx);
    expect(afterForEach).toMatch(/\.setDepth\(5\)/);
});

// ─── Step 4: Code Inspection — hover handlers set tints on both image and label

test('code: pointerover handler tints the card image', () => {
    const src = readScene();
    expect(src).toMatch(/pointerover[\s\S]*?img\.setTint\(/);
});

test('code: pointerout handler clears image tint', () => {
    const src = readScene();
    expect(src).toMatch(/pointerout[\s\S]*?img\.clearTint\(/);
});

// ─── Step 5: Code Inspection — all three card types navigate correctly ────────

test('code: delve card navigates to BattleScene', () => {
    const src = readScene();
    expect(src).toMatch(/card\.type === 'delve'[\s\S]*?scene\.start\('BattleScene'/);
});

test('code: shop card navigates to ShopScene', () => {
    const src = readScene();
    expect(src).toMatch(/card\.type === 'shop'[\s\S]*?scene\.start\('ShopScene'/);
});

test('code: camp card navigates to CampScene', () => {
    const src = readScene();
    expect(src).toMatch(/card\.type === 'camp'[\s\S]*?scene\.start\('CampScene'/);
});

// ─── Step 6: Version bump ─────────────────────────────────────────────────────

test('version: VERSION is at least 1.13.28 (PATCH bumped for nineslice fix)', () => {
    const versionSrc = fs.readFileSync(VERSION_FILE, 'utf8');
    const match = versionSrc.match(/VERSION\s*=\s*'(\d+)\.(\d+)\.(\d+)'/);
    expect(match, 'version.js must have a VERSION export').toBeTruthy();
    const [, major, minor, patch] = match.map(Number);
    const isAtLeast =
        major > 1 ||
        (major === 1 && minor > 13) ||
        (major === 1 && minor === 13 && patch >= 28);
    expect(isAtLeast, `VERSION ${match[1]} must be >= 1.13.28`).toBe(true);
});

// ─── Step 7: Browser — card panels render and images are visible ──────────────

test('browser: floor scene loads without JS errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await goToFloorScene(page);
    await page.waitForTimeout(600);

    await page.screenshot({ path: 'tests/browser/screenshots/nineslice-01-floor-scene.png' });

    const realErrors = errors.filter(e => !KNOWN_VITE_ERRORS.some(k => e.includes(k)));
    expect(realErrors, `JS errors on floor scene: ${realErrors.join(', ')}`).toHaveLength(0);
});

test('browser: delve card area is not pure black — image pixels are visible', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await goToFloorScene(page);
    await page.waitForTimeout(800);

    await page.screenshot({ path: 'tests/browser/screenshots/nineslice-02-delve-card.png' });

    // Delve card is centered horizontally at ~(W-cardW)/2 .. center
    // At 480x270, cardH ~ min(84, 270-panelH-50). panelH~36+18=54, cardH~84
    // cardW = floor(84*0.85) = 71. Delve centered: x = (480-71)/2 = 204
    // Card positioned at y = floor(H*0.74) - cardH/2 = 200 - 42 = 158
    // Sample the center of the delve card image area
    const cardCenterX = 240; // horizontal center
    const cardCenterY = 195; // mid-floor area
    const color = await sampleRegion(page, cardCenterX, cardCenterY, 40, 30);

    if (color && !color.error && color.pixels > 0) {
        const brightness = (color.r + color.g + color.b) / 3;
        // If a card image is showing, it should not be pitch black
        // The delve card image (card_delve) should have some visible content
        expect(brightness, `Delve card center too dark — image may not be rendering: r=${color.r.toFixed(1)}, g=${color.g.toFixed(1)}, b=${color.b.toFixed(1)}`).toBeGreaterThan(15);
    }

    const realErrors = errors.filter(e => !KNOWN_VITE_ERRORS.some(k => e.includes(k)));
    expect(realErrors, `JS errors: ${realErrors.join(', ')}`).toHaveLength(0);
});

test('browser: camp card is visible in top-right area', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await goToFloorScene(page);
    await page.waitForTimeout(800);

    await page.screenshot({ path: 'tests/browser/screenshots/nineslice-03-camp-card.png' });

    // Camp card is at top-right: x = W - cardW - margin = 480 - 71 - 8 = 401
    // y = topY (above delve card). Sample right side of canvas near camp card
    const campCardCenterX = 430;
    const campCardCenterY = 165;
    const color = await sampleRegion(page, campCardCenterX, campCardCenterY, 40, 30);

    if (color && !color.error && color.pixels > 0) {
        const brightness = (color.r + color.g + color.b) / 3;
        expect(brightness, `Camp card area too dark — card may not be rendering: r=${color.r.toFixed(1)}, g=${color.g.toFixed(1)}, b=${color.b.toFixed(1)}`).toBeGreaterThan(15);
    }

    const realErrors = errors.filter(e => !KNOWN_VITE_ERRORS.some(k => e.includes(k)));
    expect(realErrors, `JS errors: ${realErrors.join(', ')}`).toHaveLength(0);
});
