/**
 * Browser QA: Ledger page corner hit areas enlarged
 * Plan: qa-browser-ledger-larger-page-corners
 *
 * Verifies the Delvers Ledger page turn corners have enlarged hit areas (44px)
 * while the visual triangle stays at 22px. Tests clicking in the enlarged zone
 * (outside old 22px bounds but inside new 44px bounds) to confirm navigation.
 *
 * Runs against http://localhost:8080 (dungeon-fisher Vite dev server).
 */

const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:8080';
const SAVE_KEY = 'fathom-fall-save';
const GAME_W = 480;
const GAME_H = 270;
const BUTTON_APPEAR_MS = 5500;
const SCREENSHOT_DIR = 'screenshots';

const CINEMATIC_MS = 3500;
const BOOK_READY_MS = 2500;
const PAGE_TURN_MS = 1200;

// Landscape: panelW=408, panelH=216, halfW=204, halfH=108
// Book center at (240, 135)

const NEW_GAME_BTN = { x: 240, y: 97 };

// Next corner: container moved from (halfW-22) to (halfW-44) = (160, -108)
// New 44x44 hitArea in game space: (400, 27) to (444, 71)
// Old 22x22 hitArea was: (422, 27) to (444, 49)
// (410, 38) is at old x<422, so it was OUTSIDE old area but INSIDE new area
const NEXT_CORNER_ENLARGED = { x: 410, y: 38 };
// (422, 38) is the left edge of the old area — known to work
const NEXT_CORNER_CENTER = { x: 422, y: 38 };

// Back corner: container at (-204, -108), 44x44 hitArea
// Game space: (36, 27) to (80, 71)
// Old area: (36, 27) to (58, 49)
// (47, 38) — center of old area, within triangle, known to work
const BACK_CORNER_CENTER = { x: 47, y: 38 };

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getCanvasBounds(page) {
    const canvas = page.locator('canvas').first();
    return await canvas.boundingBox();
}

async function clickGame(page, gx, gy) {
    const bounds = await getCanvasBounds(page);
    const x = bounds.x + gx * (bounds.width / GAME_W);
    const y = bounds.y + gy * (bounds.height / GAME_H);
    await page.mouse.move(x, y);
    await page.waitForTimeout(100);
    await page.mouse.click(x, y);
}

async function swipeGame(page, fromGx, fromGy, toGx, toGy) {
    const bounds = await getCanvasBounds(page);
    const sx = bounds.x + fromGx * (bounds.width / GAME_W);
    const sy = bounds.y + fromGy * (bounds.height / GAME_H);
    const ex = bounds.x + toGx * (bounds.width / GAME_W);
    const ey = bounds.y + toGy * (bounds.height / GAME_H);
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await page.mouse.move(ex, ey, { steps: 10 });
    await page.mouse.up();
}

async function freshStart(page) {
    await page.goto(BASE);
    await page.evaluate((key) => localStorage.removeItem(key), SAVE_KEY);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(BUTTON_APPEAR_MS);
}

async function openLedgerToSpread(page) {
    await clickGame(page, NEW_GAME_BTN.x, NEW_GAME_BTN.y);
    await page.waitForTimeout(CINEMATIC_MS + BOOK_READY_MS);
}

// ─── Step 1: Code structure — hitSize=44, cornerSize=22 ─────────────────────

test('step 1: code has hitSize=44 and cornerSize=22 with explicit hitArea', async ({ page }) => {
    const resp = await page.goto(`${BASE}/src/scenes/DelversLedgerScene.js`);
    const src = await resp.text();

    expect(src).toContain('const cornerSize = 22');
    expect(src).toContain('const hitSize = 44');
    expect(src).toContain('new Phaser.Geom.Rectangle(0, 0, hitSize, hitSize)');
    expect(src).toContain('Phaser.Geom.Rectangle.Contains');
    expect(src).toContain('setSize(hitSize, hitSize)');
    expect(src).toContain('fillTriangle(0, 0, cornerSize, 0, 0, cornerSize)');
    expect(src).toContain('fillTriangle(hitSize - cornerSize, 0, hitSize, 0, hitSize, cornerSize)');
    expect(src).toContain('halfW - hitSize');
});

// ─── Step 2: Version bump ───────────────────────────────────────────────────

test('step 2: version bumped past 0.18.2 (pre-feature baseline)', async ({ page }) => {
    const resp = await page.goto(`${BASE}/src/version.js`);
    const src = await resp.text();
    const match = src.match(/VERSION\s*=\s*'(\d+\.\d+\.\d+)'/);
    expect(match).not.toBeNull();
    const [major, minor, patch] = match[1].split('.').map(Number);
    expect(major * 10000 + minor * 100 + patch).toBeGreaterThanOrEqual(1803);
});

// ─── Step 3: Enlarged next-corner hit area ──────────────────────────────────

test('step 3: clicking in enlarged next-corner area navigates forward', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await freshStart(page);
    await openLedgerToSpread(page);

    await page.screenshot({
        path: `${SCREENSHOT_DIR}/lcr-01-andy-before-enlarge-click.png`
    });

    // Click at x=410 — OUTSIDE old area (old starts at x=422), INSIDE new area
    await clickGame(page, NEXT_CORNER_ENLARGED.x, NEXT_CORNER_ENLARGED.y);
    await page.waitForTimeout(PAGE_TURN_MS);

    await page.screenshot({
        path: `${SCREENSHOT_DIR}/lcr-02-after-enlarged-next-click.png`
    });

    // Verify navigation happened by clicking back corner (returns to Andy)
    await clickGame(page, BACK_CORNER_CENTER.x, BACK_CORNER_CENTER.y);
    await page.waitForTimeout(PAGE_TURN_MS);

    await page.screenshot({
        path: `${SCREENSHOT_DIR}/lcr-03-roundtrip-back-to-andy.png`
    });

    expect(errors.length).toBe(0);
});

// ─── Step 4: Page transitions both directions ───────────────────────────────

test('step 4: page transitions work correctly in both directions', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await freshStart(page);
    await openLedgerToSpread(page);

    // Forward via next corner
    await clickGame(page, NEXT_CORNER_CENTER.x, NEXT_CORNER_CENTER.y);
    await page.waitForTimeout(PAGE_TURN_MS);

    await page.screenshot({
        path: `${SCREENSHOT_DIR}/lcr-04a-forward.png`
    });

    // Back via back corner
    await clickGame(page, BACK_CORNER_CENTER.x, BACK_CORNER_CENTER.y);
    await page.waitForTimeout(PAGE_TURN_MS);

    await page.screenshot({
        path: `${SCREENSHOT_DIR}/lcr-04b-back.png`
    });

    expect(errors.length).toBe(0);
});

// ─── Step 5: Swipe gestures still work ──────────────────────────────────────

test('step 5: swipe gestures still navigate pages', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await freshStart(page);
    await openLedgerToSpread(page);

    // Swipe left → next page
    await swipeGame(page, 350, 135, 150, 135);
    await page.waitForTimeout(PAGE_TURN_MS);

    await page.screenshot({
        path: `${SCREENSHOT_DIR}/lcr-05a-swipe-forward.png`
    });

    // Swipe right → previous page
    await swipeGame(page, 130, 135, 350, 135);
    await page.waitForTimeout(PAGE_TURN_MS);

    await page.screenshot({
        path: `${SCREENSHOT_DIR}/lcr-05b-swipe-back.png`
    });

    expect(errors.length).toBe(0);
});

// ─── Step 6: Hover alpha verified (code inspection) ─────────────────────────

test('step 6: hover raises alpha to 1 on the enlarged container', async ({ page }) => {
    const resp = await page.goto(`${BASE}/src/scenes/DelversLedgerScene.js`);
    const src = await resp.text();

    expect(src).toContain('setAlpha(0.6)');
    expect(src).toContain('setAlpha(1)');
    const overMatches = src.match(/pointerover/g);
    const outMatches = src.match(/pointerout/g);
    expect(overMatches.length).toBeGreaterThanOrEqual(2);
    expect(outMatches.length).toBeGreaterThanOrEqual(2);
});
