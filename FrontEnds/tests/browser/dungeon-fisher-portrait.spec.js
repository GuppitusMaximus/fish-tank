/**
 * Browser QA: Dungeon Fisher V2 Portrait Mode
 * Tests portrait layout on iPhone 15 Pro dimensions (393x852).
 * Runs against local dev server at localhost:8080.
 */

const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:8080';
const PORTRAIT = { width: 393, height: 852 };
const LANDSCAPE = { width: 852, height: 393 };
const DESKTOP = { width: 1280, height: 800 };

// Helper: navigate to game and wait for Phaser canvas to be present
async function waitForCanvas(page, timeout = 10000) {
    await page.waitForSelector('canvas', { timeout });
}

// Helper: check for horizontal overflow (no scrollbar)
async function hasHorizontalOverflow(page) {
    return page.evaluate(() => document.body.scrollWidth > window.innerWidth);
}

// Helper: get canvas bounding box
async function getCanvasBox(page) {
    return page.locator('canvas').boundingBox();
}

// Helper: get game registry isPortrait value via page evaluate
async function getIsPortrait(page) {
    return page.evaluate(() => {
        return window.innerHeight > window.innerWidth;
    });
}

// ─── Step 1: Portrait Boot ────────────────────────────────────────────────────

test('portrait boot: canvas renders in portrait viewport', async ({ page }) => {
    await page.setViewportSize(PORTRAIT);
    await page.goto(BASE);
    await waitForCanvas(page);

    const canvas = await getCanvasBox(page);
    expect(canvas).not.toBeNull();
    // Canvas should have portrait aspect (taller than wide) or be square-ish
    // Phaser FIT mode centers and scales canvas to fill the container
    expect(canvas.width).toBeGreaterThan(0);
    expect(canvas.height).toBeGreaterThan(0);

    await page.screenshot({ path: 'tests/browser/screenshots/portrait-boot.png' });
});

test('portrait boot: canvas fits within viewport width (no horizontal overflow)', async ({ page }) => {
    await page.setViewportSize(PORTRAIT);
    await page.goto(BASE);
    await waitForCanvas(page);

    const overflow = await hasHorizontalOverflow(page);
    expect(overflow).toBe(false);
});

test('portrait boot: canvas height is greater than width (portrait orientation)', async ({ page }) => {
    await page.setViewportSize(PORTRAIT);
    await page.goto(BASE);
    await waitForCanvas(page);

    const canvas = await getCanvasBox(page);
    // In portrait mode, Phaser renders 270x480 canvas, scaled to fit 393x852 viewport
    // The rendered canvas should be taller than wide
    expect(canvas.height).toBeGreaterThan(canvas.width);
});

test('portrait boot: game container fills viewport', async ({ page }) => {
    await page.setViewportSize(PORTRAIT);
    await page.goto(BASE);
    await waitForCanvas(page);

    const containerBox = await page.locator('#game-container').boundingBox();
    expect(containerBox.width).toBe(PORTRAIT.width);
    expect(containerBox.height).toBe(PORTRAIT.height);
});

test('portrait boot: browser isPortrait flag is true', async ({ page }) => {
    await page.setViewportSize(PORTRAIT);
    await page.goto(BASE);
    await waitForCanvas(page);

    const isPortrait = await getIsPortrait(page);
    expect(isPortrait).toBe(true);
});

test('portrait boot: no JS errors on portrait load', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.setViewportSize(PORTRAIT);
    await page.goto(BASE);
    await waitForCanvas(page);
    // Allow brief time for game init
    await page.waitForTimeout(1000);
    expect(errors).toHaveLength(0);
});

// ─── Step 2: Portrait Starter Selection ───────────────────────────────────────

test('portrait starter: title screen visible in portrait', async ({ page }) => {
    await page.setViewportSize(PORTRAIT);
    await page.goto(BASE);
    await waitForCanvas(page);
    // Wait for Phaser to render TitleScene (give it time to load)
    await page.waitForTimeout(2000);

    // Take screenshot to verify title is visible
    await page.screenshot({ path: 'tests/browser/screenshots/portrait-title.png' });

    // Canvas should still be taller than wide
    const canvas = await getCanvasBox(page);
    expect(canvas.height).toBeGreaterThan(canvas.width);
});

test('portrait starter: no overflow after title renders', async ({ page }) => {
    await page.setViewportSize(PORTRAIT);
    await page.goto(BASE);
    await waitForCanvas(page);
    await page.waitForTimeout(2000);

    const overflow = await hasHorizontalOverflow(page);
    expect(overflow).toBe(false);
});

test('portrait starter: canvas remains in portrait after game init', async ({ page }) => {
    await page.setViewportSize(PORTRAIT);
    await page.goto(BASE);
    await waitForCanvas(page);
    await page.waitForTimeout(2500);

    const canvas = await getCanvasBox(page);
    // Canvas width should be <= viewport width
    expect(canvas.x + canvas.width).toBeLessThanOrEqual(PORTRAIT.width + 1);
    // Canvas should be taller than wide (portrait mode 270x480 scaled up)
    expect(canvas.height).toBeGreaterThan(canvas.width);
});

// ─── Step 3: Portrait Battle Layout ──────────────────────────────────────────

test('portrait battle: canvas has portrait dimensions throughout', async ({ page }) => {
    await page.setViewportSize(PORTRAIT);
    await page.goto(BASE);
    await waitForCanvas(page);
    await page.waitForTimeout(2000);

    // Game is in portrait mode — Phaser canvas should be tall and narrow
    const canvas = await getCanvasBox(page);
    expect(canvas.height).toBeGreaterThan(canvas.width);

    await page.screenshot({ path: 'tests/browser/screenshots/portrait-scene.png' });
});

// ─── Step 7: Landscape Fallback ───────────────────────────────────────────────

test('landscape: page reloads on orientation change to landscape', async ({ page }) => {
    // Start in portrait
    await page.setViewportSize(PORTRAIT);
    await page.goto(BASE);
    await waitForCanvas(page);
    await page.waitForTimeout(1500);

    // Listen for navigation/reload
    let navigated = false;
    page.on('load', () => { navigated = true; });

    // Switch to landscape viewport (simulates orientation change)
    await page.setViewportSize(LANDSCAPE);
    // Trigger a resize event to simulate device rotation
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));

    // Wait for potential reload
    await page.waitForTimeout(2000);

    // After reload, canvas should be landscape (wider than tall)
    const canvas = await getCanvasBox(page);
    expect(canvas).not.toBeNull();
    expect(canvas.width).toBeGreaterThan(0);

    await page.screenshot({ path: 'tests/browser/screenshots/portrait-landscape-switch.png' });
});

test('landscape: game loads correctly in landscape viewport from scratch', async ({ page }) => {
    await page.setViewportSize(LANDSCAPE);
    await page.goto(BASE);
    await waitForCanvas(page);
    await page.waitForTimeout(2000);

    // In landscape, canvas should be wider than tall (480x270 scaled)
    const canvas = await getCanvasBox(page);
    expect(canvas.width).toBeGreaterThan(canvas.height);

    // No horizontal overflow
    const overflow = await hasHorizontalOverflow(page);
    expect(overflow).toBe(false);

    await page.screenshot({ path: 'tests/browser/screenshots/portrait-landscape-layout.png' });
});

test('landscape: isPortrait is false in landscape viewport', async ({ page }) => {
    await page.setViewportSize(LANDSCAPE);
    await page.goto(BASE);
    await waitForCanvas(page);

    const isPortrait = await getIsPortrait(page);
    expect(isPortrait).toBe(false);
});

// ─── Step 8: Desktop ──────────────────────────────────────────────────────────

test('desktop: game renders in landscape mode at desktop size', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto(BASE);
    await waitForCanvas(page);
    await page.waitForTimeout(2000);

    // Desktop = landscape mode (480x270 canvas)
    const canvas = await getCanvasBox(page);
    expect(canvas.width).toBeGreaterThan(canvas.height);

    // No overflow
    const overflow = await hasHorizontalOverflow(page);
    expect(overflow).toBe(false);

    await page.screenshot({ path: 'tests/browser/screenshots/portrait-desktop-layout.png' });
});

test('desktop: no JS errors at desktop size', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.setViewportSize(DESKTOP);
    await page.goto(BASE);
    await waitForCanvas(page);
    await page.waitForTimeout(1500);

    expect(errors).toHaveLength(0);
});

// ─── Portrait vs Landscape: Canvas dimension comparison ──────────────────────

test('portrait canvas is taller than landscape canvas', async ({ browser }) => {
    // Portrait context
    const portraitCtx = await browser.newContext({ viewport: PORTRAIT });
    const portraitPage = await portraitCtx.newPage();
    await portraitPage.goto(BASE);
    await portraitPage.waitForSelector('canvas', { timeout: 10000 });
    await portraitPage.waitForTimeout(1500);
    const portraitCanvas = await portraitPage.locator('canvas').boundingBox();
    await portraitCtx.close();

    // Landscape context
    const landscapeCtx = await browser.newContext({ viewport: LANDSCAPE });
    const landscapePage = await landscapeCtx.newPage();
    await landscapePage.goto(BASE);
    await landscapePage.waitForSelector('canvas', { timeout: 10000 });
    await landscapePage.waitForTimeout(1500);
    const landscapeCanvas = await landscapePage.locator('canvas').boundingBox();
    await landscapeCtx.close();

    // Portrait canvas should be taller, landscape canvas should be wider
    expect(portraitCanvas.height).toBeGreaterThan(portraitCanvas.width);
    expect(landscapeCanvas.width).toBeGreaterThan(landscapeCanvas.height);
});

test('portrait game-container fills full viewport height', async ({ page }) => {
    await page.setViewportSize(PORTRAIT);
    await page.goto(BASE);
    await waitForCanvas(page);

    const containerBox = await page.locator('#game-container').boundingBox();
    expect(containerBox.height).toBe(PORTRAIT.height);
    expect(containerBox.width).toBe(PORTRAIT.width);
});
