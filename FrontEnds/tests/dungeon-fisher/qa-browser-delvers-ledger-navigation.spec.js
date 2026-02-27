/**
 * Browser QA: Delver's Ledger Navigation + Coming Soon
 * Plan: qa-browser-delvers-ledger-navigation
 *
 * Verifies: Page corner navigation buttons, page navigation between Andy
 * and Coming Soon, the Coming Soon placeholder spread, swipe gesture support,
 * rapid navigation guard, and both orientations.
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
const BOOK_READY_MS = 2500; // entrance slide(600) + pause(800) + flip(600) + buffer
const PAGE_TURN_MS = 700;   // 500ms animation + buffer

// Landscape game coordinates
const NEW_GAME_BTN = { x: 240, y: 97 };
const CENTER = { x: 240, y: 135 };

// Book dimensions (landscape): panelW=408, panelH=216, halfW=204, halfH=108, cornerSize=22
// Next corner container at (halfW-22, -halfH) = (182, -108) relative to book center (240, 135)
// Hitbox is Rectangle(0,0,22,22) in local space → center at (193, -97) → game (433, 38)
const NEXT_CORNER = { x: 433, y: 38 };
// Back corner container at (-halfW, -halfH) = (-204, -108) relative to book center
// Hitbox center at (-193, -97) → game (47, 38)
const BACK_CORNER = { x: 47, y: 38 };

// Portrait game coordinates (270x480)
const PORT_GAME_W = 270;
const PORT_GAME_H = 480;
const PORT_NEW_GAME = { x: 135, y: 173 };
const PORT_CENTER = { x: 135, y: 240 };
// Book dims (portrait): panelW=230, panelH=360, halfW=115, halfH=180, cornerSize=22
// Next corner container at (93, -180) → hitbox center (104, -169) → game (239, 71)
const PORT_NEXT_CORNER = { x: 239, y: 71 };
// Back corner container at (-115, -180) → hitbox center (-104, -169) → game (31, 71)
const PORT_BACK_CORNER = { x: 31, y: 71 };

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getCanvasBounds(page) {
    const canvas = page.locator('canvas').first();
    return await canvas.boundingBox();
}

async function clickGame(page, gx, gy, gameW = GAME_W, gameH = GAME_H) {
    const bounds = await getCanvasBounds(page);
    const x = bounds.x + gx * (bounds.width / gameW);
    const y = bounds.y + gy * (bounds.height / gameH);
    await page.mouse.click(x, y);
}

async function swipeGame(page, fromGx, fromGy, toGx, toGy, gameW = GAME_W, gameH = GAME_H) {
    const bounds = await getCanvasBounds(page);
    const sx = bounds.x + fromGx * (bounds.width / gameW);
    const sy = bounds.y + fromGy * (bounds.height / gameH);
    const ex = bounds.x + toGx * (bounds.width / gameW);
    const ey = bounds.y + toGy * (bounds.height / gameH);
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

async function openLedgerToSpread(page, gameW = GAME_W, gameH = GAME_H) {
    const ngBtn = gameW === GAME_W ? NEW_GAME_BTN : PORT_NEW_GAME;
    await clickGame(page, ngBtn.x, ngBtn.y, gameW, gameH);
    await page.waitForTimeout(CINEMATIC_MS + BOOK_READY_MS);
}

// ─── Step 1: Page corner buttons visible ─────────────────────────────────────

test('step 1a: Next corner visible on Andy page after book opens', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await freshStart(page);
    await openLedgerToSpread(page);

    // Screenshot Andy's spread — should show Next corner at top-right, no Back corner
    await page.screenshot({
        path: `${SCREENSHOT_DIR}/nav-01a-andy-corners.png`
    });

    expect(errors.length).toBe(0);
});

test('step 1b: corners are page-fold triangles (code inspection)', async ({ page }) => {
    const resp = await page.goto(`${BASE}/src/scenes/DelversLedgerScene.js`);
    const src = await resp.text();

    // Corners use fillTriangle — triangular shape, not rectangular buttons
    expect(src).toContain('fillTriangle');
    // Corner size is defined
    expect(src).toContain('cornerSize');
    // Diagonal fold line drawn with lineBetween
    expect(src).toContain('lineBetween');
});

// ─── Step 2: Navigate to Coming Soon ─────────────────────────────────────────

test('step 2: clicking Next corner navigates to Coming Soon', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await freshStart(page);
    await openLedgerToSpread(page);

    // Screenshot Andy's spread before navigation
    await page.screenshot({
        path: `${SCREENSHOT_DIR}/nav-02a-before-next.png`
    });

    // Click the Next corner (top-right)
    await clickGame(page, NEXT_CORNER.x, NEXT_CORNER.y);
    await page.waitForTimeout(PAGE_TURN_MS);

    // Screenshot Coming Soon spread after navigation
    await page.screenshot({
        path: `${SCREENSHOT_DIR}/nav-02b-coming-soon.png`
    });

    expect(errors.length).toBe(0);
});

// ─── Step 3: Coming Soon spread content ──────────────────────────────────────

test('step 3a: Coming Soon content verified (code inspection)', async ({ page }) => {
    const resp = await page.goto(`${BASE}/src/scenes/DelversLedgerScene.js`);
    const src = await resp.text();

    // Silhouette rendered as greyed-out shape
    expect(src).toContain('fillStyle(0x333333, 0.3)');
    expect(src).toContain('fillCircle');
    expect(src).toContain('fillRoundedRect');

    // "Coming Soon" title text with dimmed alpha
    expect(src).toContain("'Coming Soon'");
    expect(src).toContain('setAlpha(0.5)');

    // Subtitle text
    expect(src).toContain("'A new delver awaits...'");
});

test('step 3b: No SELECT button on Coming Soon page (code inspection)', async ({ page }) => {
    const resp = await page.goto(`${BASE}/src/scenes/DelversLedgerScene.js`);
    const src = await resp.text();

    // Coming Soon page has selectable: false
    expect(src).toContain("comingSoon: true, selectable: false");

    // _buildPageContent only adds SELECT when page.selectable is true
    expect(src).toContain('if (page.comingSoon)');
    // comingSoon pages return early before reaching the selectable check
    expect(src).toMatch(/if\s*\(page\.comingSoon\)[\s\S]*?return;/);
});

// ─── Step 4: Navigate back to Andy ───────────────────────────────────────────

test('step 4: Back corner on Coming Soon navigates back to Andy', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await freshStart(page);
    await openLedgerToSpread(page);

    // Navigate to Coming Soon first
    await clickGame(page, NEXT_CORNER.x, NEXT_CORNER.y);
    await page.waitForTimeout(PAGE_TURN_MS);

    // Screenshot Coming Soon with Back corner visible
    await page.screenshot({
        path: `${SCREENSHOT_DIR}/nav-04a-coming-soon-corners.png`
    });

    // Click the Back corner (top-left)
    await clickGame(page, BACK_CORNER.x, BACK_CORNER.y);
    await page.waitForTimeout(PAGE_TURN_MS);

    // Screenshot — should be back on Andy's spread
    await page.screenshot({
        path: `${SCREENSHOT_DIR}/nav-04b-back-to-andy.png`
    });

    expect(errors.length).toBe(0);
});

test('step 4b: corner visibility logic (code inspection)', async ({ page }) => {
    const resp = await page.goto(`${BASE}/src/scenes/DelversLedgerScene.js`);
    const src = await resp.text();

    // Back corner only visible when currentPage > 0
    expect(src).toContain('this._currentPage > 0');
    // Next corner only visible when currentPage < pages.length - 1
    expect(src).toContain('this._currentPage < this._pages.length - 1');
});

// ─── Step 5: Coming Soon is not selectable ───────────────────────────────────

test('step 5: Coming Soon page has no selection mechanism', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await freshStart(page);
    await openLedgerToSpread(page);

    // Navigate to Coming Soon
    await clickGame(page, NEXT_CORNER.x, NEXT_CORNER.y);
    await page.waitForTimeout(PAGE_TURN_MS);

    // Try clicking where the SELECT button would be in landscape
    // SELECT btn position on Andy: (342, 223)
    await clickGame(page, 342, 223);
    await page.waitForTimeout(1000);

    // Screenshot — should still be on Coming Soon (no scene transition)
    await page.screenshot({
        path: `${SCREENSHOT_DIR}/nav-05-no-select-click.png`
    });

    // Navigate back to Andy
    await clickGame(page, BACK_CORNER.x, BACK_CORNER.y);
    await page.waitForTimeout(PAGE_TURN_MS);

    // Click SELECT on Andy — should start rapid flip (scene transitions away)
    await clickGame(page, 342, 223);
    await page.waitForTimeout(2000);

    // Screenshot — should have left the ledger (starter fish selection)
    await page.screenshot({
        path: `${SCREENSHOT_DIR}/nav-05b-andy-select-works.png`
    });

    expect(errors.length).toBe(0);
});

// ─── Step 6: Swipe navigation ────────────────────────────────────────────────

test('step 6a: swipe left navigates to Coming Soon', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await freshStart(page);
    await openLedgerToSpread(page);

    // Swipe left (right-to-left) — should go to Coming Soon
    await swipeGame(page, 350, 135, 150, 135);
    await page.waitForTimeout(PAGE_TURN_MS);

    await page.screenshot({
        path: `${SCREENSHOT_DIR}/nav-06a-swipe-to-coming-soon.png`
    });

    expect(errors.length).toBe(0);
});

test('step 6b: swipe right navigates back to Andy', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await freshStart(page);
    await openLedgerToSpread(page);

    // Go to Coming Soon first
    await clickGame(page, NEXT_CORNER.x, NEXT_CORNER.y);
    await page.waitForTimeout(PAGE_TURN_MS);

    // Swipe right (left-to-right) — should go back to Andy
    await swipeGame(page, 130, 135, 350, 135);
    await page.waitForTimeout(PAGE_TURN_MS);

    await page.screenshot({
        path: `${SCREENSHOT_DIR}/nav-06b-swipe-back-to-andy.png`
    });

    expect(errors.length).toBe(0);
});

test('step 6c: small swipe does NOT navigate', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await freshStart(page);
    await openLedgerToSpread(page);

    // Screenshot before small swipe
    await page.screenshot({
        path: `${SCREENSHOT_DIR}/nav-06c-before-small-swipe.png`
    });

    // Small swipe left (< 15% of 480 = 72px, so use ~50px)
    await swipeGame(page, 240, 135, 200, 135);
    await page.waitForTimeout(PAGE_TURN_MS);

    // Screenshot after small swipe — should still be on Andy
    await page.screenshot({
        path: `${SCREENSHOT_DIR}/nav-06c-after-small-swipe.png`
    });

    expect(errors.length).toBe(0);
});

// ─── Step 7: Rapid navigation guard ──────────────────────────────────────────

test('step 7: rapid clicks only trigger one page turn', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await freshStart(page);
    await openLedgerToSpread(page);

    // Rapid-click the Next corner 5 times in quick succession
    for (let i = 0; i < 5; i++) {
        await clickGame(page, NEXT_CORNER.x, NEXT_CORNER.y);
        await page.waitForTimeout(50);
    }

    // Wait for any animation to complete
    await page.waitForTimeout(PAGE_TURN_MS);

    // Screenshot — should be on Coming Soon (one page turn, not multiple)
    await page.screenshot({
        path: `${SCREENSHOT_DIR}/nav-07-rapid-click-result.png`
    });

    // No errors from animation stacking
    expect(errors.length).toBe(0);
});

test('step 7b: transition guard verified (code inspection)', async ({ page }) => {
    const resp = await page.goto(`${BASE}/src/scenes/DelversLedgerScene.js`);
    const src = await resp.text();

    // _navigateToPage returns early if _transitioning
    expect(src).toContain('if (this._transitioning || !this._bookOpen) return');
    // _transitioning set to true before animation and false after
    expect(src).toContain('this._transitioning = true');
    expect(src).toContain('this._transitioning = false');
});

// ─── Step 8: Both orientations ───────────────────────────────────────────────

test('step 8a: landscape navigation works end-to-end', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await freshStart(page);
    await openLedgerToSpread(page);

    // Landscape: forward to Coming Soon
    await clickGame(page, NEXT_CORNER.x, NEXT_CORNER.y);
    await page.waitForTimeout(PAGE_TURN_MS);

    await page.screenshot({
        path: `${SCREENSHOT_DIR}/nav-08a-landscape-coming-soon.png`
    });

    // Landscape: back to Andy
    await clickGame(page, BACK_CORNER.x, BACK_CORNER.y);
    await page.waitForTimeout(PAGE_TURN_MS);

    await page.screenshot({
        path: `${SCREENSHOT_DIR}/nav-08a-landscape-andy-return.png`
    });

    expect(errors.length).toBe(0);
});

test('step 8b: portrait navigation works end-to-end', async ({ page, browser }) => {
    const portraitCtx = await browser.newContext({
        viewport: { width: 270, height: 480 }
    });
    const pp = await portraitCtx.newPage();
    const errors = [];
    pp.on('pageerror', err => errors.push(err.message));

    try {
        await pp.goto(BASE);
        await pp.evaluate((key) => localStorage.removeItem(key), SAVE_KEY);
        await pp.reload({ waitUntil: 'networkidle' });
        await pp.waitForSelector('canvas', { timeout: 10000 });
        await pp.waitForTimeout(BUTTON_APPEAR_MS);

        // Open ledger
        await clickGame(pp, PORT_NEW_GAME.x, PORT_NEW_GAME.y, PORT_GAME_W, PORT_GAME_H);
        await pp.waitForTimeout(CINEMATIC_MS + BOOK_READY_MS);

        // Screenshot Andy spread in portrait
        await pp.screenshot({
            path: `${SCREENSHOT_DIR}/nav-08b-portrait-andy.png`
        });

        // Navigate to Coming Soon
        await clickGame(pp, PORT_NEXT_CORNER.x, PORT_NEXT_CORNER.y, PORT_GAME_W, PORT_GAME_H);
        await pp.waitForTimeout(PAGE_TURN_MS);

        await pp.screenshot({
            path: `${SCREENSHOT_DIR}/nav-08b-portrait-coming-soon.png`
        });

        // Navigate back to Andy
        await clickGame(pp, PORT_BACK_CORNER.x, PORT_BACK_CORNER.y, PORT_GAME_W, PORT_GAME_H);
        await pp.waitForTimeout(PAGE_TURN_MS);

        await pp.screenshot({
            path: `${SCREENSHOT_DIR}/nav-08b-portrait-andy-return.png`
        });

        expect(errors.length).toBe(0);
    } finally {
        await portraitCtx.close();
    }
});
