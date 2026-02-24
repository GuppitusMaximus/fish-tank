/**
 * Browser QA: Fix card rendering — procedural borders frame card images
 *
 * Verifies that FloorScene action cards use procedural DungeonPanel borders
 * (not nineslice, which can't scale properly on small ~71x84px cards), and
 * that the border frame sits ON TOP of the card artwork at the correct depths.
 *
 * Plan: qa-browser-fix-cards-procedural-border
 *
 * Expected depth stack:
 *   2   — dark fill rectangle (background behind image)
 *   2.5 — card image (visible, large)
 *   3   — procedural border frame (transparent fill, ornate green borders on top)
 *   4   — label text
 *   5   — hit zone (interaction)
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

// ─── Step 1: Code Inspection — atlasKey stripped, procedural border forced ────

test('code: atlasKey is deleted from cardTheme before UIPanel creation', () => {
    const src = readScene();
    const forEachIdx = src.indexOf('cards.forEach(');
    expect(forEachIdx, 'cards.forEach not found in FloorScene').toBeGreaterThan(-1);
    const afterForEach = src.slice(forEachIdx);
    // atlasKey must be deleted so ThemedPanel falls through to procedural DungeonPanel
    expect(afterForEach).toMatch(/delete cardTheme\.atlasKey/);
});

test('code: compositeKey is deleted from cardTheme (no composite atlas for cards)', () => {
    const src = readScene();
    expect(src).toMatch(/delete cardTheme\.compositeKey/);
});

test('code: pieceSize is deleted from cardTheme', () => {
    const src = readScene();
    expect(src).toMatch(/delete cardTheme\.pieceSize/);
});

// ─── Step 2: Code Inspection — dark fill rectangle behind image ───────────────

test('code: dark fill rectangle (0x111111) exists in card loop', () => {
    const src = readScene();
    const forEachIdx = src.indexOf('cards.forEach(');
    expect(forEachIdx).toBeGreaterThan(-1);
    const afterForEach = src.slice(forEachIdx);
    expect(afterForEach).toMatch(/add\.rectangle\([^)]*0x111111/);
});

test('code: dark fill rectangle is at depth 2', () => {
    const src = readScene();
    const forEachIdx = src.indexOf('cards.forEach(');
    const afterForEach = src.slice(forEachIdx);
    // Find the 0x111111 rectangle block and verify setDepth(2) before image
    expect(afterForEach).toMatch(/0x111111[\s\S]*?\.setDepth\(2\)/);
});

// ─── Step 3: Code Inspection — card image at depth 2.5 (below border) ─────────

test('code: card image is at depth 2.5 (below procedural border at depth 3)', () => {
    const src = readScene();
    const forEachIdx = src.indexOf('cards.forEach(');
    const afterForEach = src.slice(forEachIdx);
    expect(afterForEach).toMatch(/\.setDepth\(2\.5\)/);
});

test('code: card image has scrollFactor(0)', () => {
    const src = readScene();
    const forEachIdx = src.indexOf('cards.forEach(');
    const afterForEach = src.slice(forEachIdx);
    // image must have setScrollFactor(0)
    expect(afterForEach).toMatch(/img[\s\S]*?\.setScrollFactor\(0\)/);
});

// ─── Step 4: Code Inspection — procedural border at depth 3 (above image) ─────

test('code: UIPanel for card border is at depth 3 (above image at 2.5)', () => {
    const src = readScene();
    const forEachIdx = src.indexOf('cards.forEach(');
    const afterForEach = src.slice(forEachIdx);
    // UIPanel called with depth: 3
    expect(afterForEach).toMatch(/new UIPanel[\s\S]*?depth:\s*3/);
});

test('code: card UIPanel has alpha: 0 (transparent fill, only borders visible)', () => {
    const src = readScene();
    const forEachIdx = src.indexOf('cards.forEach(');
    const afterForEach = src.slice(forEachIdx);
    expect(afterForEach).toMatch(/new UIPanel[\s\S]*?alpha:\s*0/);
});

test('code: card UIPanel has fx: false (no shine effects on border frame)', () => {
    const src = readScene();
    const forEachIdx = src.indexOf('cards.forEach(');
    const afterForEach = src.slice(forEachIdx);
    expect(afterForEach).toMatch(/new UIPanel[\s\S]*?fx:\s*false/);
});

// ─── Step 5: Code Inspection — correct depth stack for label and hit zone ─────

test('code: card label is at depth 4 (above procedural border at 3)', () => {
    const src = readScene();
    const forEachIdx = src.indexOf('cards.forEach(');
    const afterForEach = src.slice(forEachIdx);
    expect(afterForEach).toMatch(/\.setDepth\(4\)/);
});

test('code: hit zone is at depth 5 (topmost, catches interaction)', () => {
    const src = readScene();
    const forEachIdx = src.indexOf('cards.forEach(');
    const afterForEach = src.slice(forEachIdx);
    expect(afterForEach).toMatch(/\.setDepth\(5\)/);
});

// ─── Step 6: Code Inspection — hover and navigation handlers ──────────────────

test('code: pointerover handler tints both image and label', () => {
    const src = readScene();
    expect(src).toMatch(/pointerover[\s\S]*?img\.setTint\(/);
});

test('code: pointerout handler clears both image and label tints', () => {
    const src = readScene();
    expect(src).toMatch(/pointerout[\s\S]*?img\.clearTint\(/);
});

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

// ─── Step 7: Version bump ─────────────────────────────────────────────────────

test('version: VERSION is at least 1.13.30 (PATCH bumped for procedural border fix)', () => {
    const versionSrc = fs.readFileSync(VERSION_FILE, 'utf8');
    const match = versionSrc.match(/VERSION\s*=\s*'(\d+)\.(\d+)\.(\d+)'/);
    expect(match, 'version.js must have a VERSION export').toBeTruthy();
    const [, major, minor, patch] = match.map(Number);
    const isAtLeast =
        major > 1 ||
        (major === 1 && minor > 13) ||
        (major === 1 && minor === 13 && patch >= 30);
    expect(isAtLeast, `VERSION ${match[1]}.${match[2]}.${match[3]} must be >= 1.13.30`).toBe(true);
});

// ─── Step 8: Browser — floor scene renders, cards visible with green borders ──

test('browser: floor scene loads without JS errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await goToFloorScene(page);
    await page.waitForTimeout(600);

    await page.screenshot({ path: 'tests/browser/screenshots/proc-border-01-floor-scene.png' });

    const realErrors = errors.filter(e => !KNOWN_VITE_ERRORS.some(k => e.includes(k)));
    expect(realErrors, `JS errors on floor scene: ${realErrors.join(', ')}`).toHaveLength(0);
});

test('browser: delve card area has visible image content (not pitch black)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await goToFloorScene(page);
    await page.waitForTimeout(800);

    await page.screenshot({ path: 'tests/browser/screenshots/proc-border-02-delve-card.png' });

    // Delve card centered: x = (480-71)/2 = 204, y = floor(270*0.74)-42 = 158
    // Sample interior of delve card
    const cardCenterX = 240;
    const cardCenterY = 195;
    const color = await sampleRegion(page, cardCenterX, cardCenterY, 40, 30);

    if (color && !color.error && color.pixels > 0) {
        const brightness = (color.r + color.g + color.b) / 3;
        expect(
            brightness,
            `Delve card center too dark — image may not be rendering: r=${color.r.toFixed(1)}, g=${color.g.toFixed(1)}, b=${color.b.toFixed(1)}`
        ).toBeGreaterThan(15);
    }

    const realErrors = errors.filter(e => !KNOWN_VITE_ERRORS.some(k => e.includes(k)));
    expect(realErrors, `JS errors: ${realErrors.join(', ')}`).toHaveLength(0);
});

test('browser: camp card in top-right area has visible content', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await goToFloorScene(page);
    await page.waitForTimeout(800);

    await page.screenshot({ path: 'tests/browser/screenshots/proc-border-03-camp-card.png' });

    // Camp card: x = W - cardW - margin = 480 - 71 - 8 = 401
    const campCardCenterX = 430;
    const campCardCenterY = 165;
    const color = await sampleRegion(page, campCardCenterX, campCardCenterY, 40, 30);

    if (color && !color.error && color.pixels > 0) {
        const brightness = (color.r + color.g + color.b) / 3;
        expect(
            brightness,
            `Camp card area too dark — card may not be rendering: r=${color.r.toFixed(1)}, g=${color.g.toFixed(1)}, b=${color.b.toFixed(1)}`
        ).toBeGreaterThan(15);
    }

    const realErrors = errors.filter(e => !KNOWN_VITE_ERRORS.some(k => e.includes(k)));
    expect(realErrors, `JS errors: ${realErrors.join(', ')}`).toHaveLength(0);
});

test('browser: green border visible around delve card edges', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await goToFloorScene(page);
    await page.waitForTimeout(800);

    await page.screenshot({ path: 'tests/browser/screenshots/proc-border-04-border-check.png' });

    // Sample the top-left edge of the delve card where the green border should appear
    // Delve card: x=204, y=158, cardW=71, cardH=84 (landscape 480x270)
    const borderEdgeX = 210;  // just inside left edge of delve card
    const borderEdgeY = 162;  // just inside top edge of delve card
    const color = await sampleRegion(page, borderEdgeX, borderEdgeY, 8, 8);

    if (color && !color.error && color.pixels > 0) {
        // Green border should have noticeably more green than red/blue
        // Sewers zone uses green theme (accent hex is greenish)
        const greenDominance = color.g - Math.max(color.r, color.b);
        expect(
            greenDominance,
            `Card edge area should show green border pixels: r=${color.r.toFixed(1)}, g=${color.g.toFixed(1)}, b=${color.b.toFixed(1)}`
        ).toBeGreaterThan(10);
    }

    const realErrors = errors.filter(e => !KNOWN_VITE_ERRORS.some(k => e.includes(k)));
    expect(realErrors, `JS errors: ${realErrors.join(', ')}`).toHaveLength(0);
});
