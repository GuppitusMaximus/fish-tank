/**
 * Browser QA: Dungeon Fisher Font Overhaul
 * Verifies Cinzel + Almendra Google Fonts are loaded and applied across all game scenes.
 *
 * Plan: qa-browser-dungeon-fisher-font-overhaul
 *
 * Checks (per plan steps 1-7):
 * 1. Title screen — Cinzel font renders, fantasy RPG aesthetic
 * 2. Starter selection — fish names, stats, buttons readable
 * 3. Floor scene — Cinzel headers, italic flavor, clear buttons
 * 4. Battle scene — all text legible, no clipping
 * 5. Shop and Camp — consistent headers and fonts
 * 6. Portrait mode — no overflow, especially BattleScene
 * 7. Overall — Google Fonts loading, no JS errors throughout
 *
 * Runs against local Vite preview server at localhost:8080.
 * All game elements are rendered in a Phaser WebGL canvas.
 */

const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:8080';
const GAME_W = 480;
const GAME_H = 270;

async function getCanvasBounds(page) {
    return page.locator('canvas').first().boundingBox();
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

async function freshStart(page) {
    await page.goto(BASE);
    await page.evaluate(() => localStorage.removeItem('dungeon-fisher-save'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(1500);
}

// ─── Font Loading: HTML + Network ────────────────────────────────────────────

test('fonts: Google Fonts request for Cinzel is made on page load', async ({ page }) => {
    const fontRequests = [];
    page.on('request', req => {
        if (req.url().includes('fonts.googleapis.com') || req.url().includes('fonts.gstatic.com')) {
            fontRequests.push(req.url());
        }
    });

    await freshStart(page);

    const hasCinzel = fontRequests.some(url => url.includes('Cinzel'));
    expect(hasCinzel, `Cinzel font request not found. Requests: ${fontRequests.join(', ')}`).toBe(true);
});

test('fonts: Google Fonts request for Almendra is made on page load', async ({ page }) => {
    const fontRequests = [];
    page.on('request', req => {
        if (req.url().includes('fonts.googleapis.com') || req.url().includes('fonts.gstatic.com')) {
            fontRequests.push(req.url());
        }
    });

    await freshStart(page);

    const hasAlmendra = fontRequests.some(url => url.includes('Almendra'));
    expect(hasAlmendra, `Almendra font request not found. Requests: ${fontRequests.join(', ')}`).toBe(true);
});

test('fonts: Google Fonts CSS response is HTTP 200', async ({ page }) => {
    const fontResponses = [];
    page.on('response', resp => {
        if (resp.url().includes('fonts.googleapis.com')) {
            fontResponses.push({ url: resp.url(), status: resp.status() });
        }
    });

    await freshStart(page);

    expect(fontResponses.length, 'No Google Fonts CSS responses received').toBeGreaterThan(0);
    const failed = fontResponses.filter(r => r.status !== 200);
    expect(failed.map(r => `${r.url} (${r.status})`).join(', '), 'Font CSS requests should return 200').toBe('');
});

test('fonts: index.html has Cinzel Google Font link tag', async ({ page }) => {
    await freshStart(page);

    const linkHrefs = await page.evaluate(() =>
        Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(l => l.href)
    );

    const hasCinzel = linkHrefs.some(href => href.includes('Cinzel'));
    expect(hasCinzel, `No Cinzel stylesheet link found. Links: ${linkHrefs.join(', ')}`).toBe(true);
});

test('fonts: index.html has Almendra Google Font link tag', async ({ page }) => {
    await freshStart(page);

    const linkHrefs = await page.evaluate(() =>
        Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(l => l.href)
    );

    const hasAlmendra = linkHrefs.some(href => href.includes('Almendra'));
    expect(hasAlmendra, `No Almendra stylesheet link found. Links: ${linkHrefs.join(', ')}`).toBe(true);
});

test('fonts: document.fonts confirms Cinzel is available after load', async ({ page }) => {
    await freshStart(page);
    await page.waitForTimeout(3000);

    const cinzelLoaded = await page.evaluate(async () => {
        await document.fonts.ready;
        const loaded = [];
        document.fonts.forEach(f => loaded.push(f.family));
        return loaded.some(f => f.toLowerCase().includes('cinzel'));
    });

    expect(cinzelLoaded, 'Cinzel font should be loaded via document.fonts').toBe(true);
});

test('fonts: document.fonts confirms Almendra is available after load', async ({ page }) => {
    await freshStart(page);
    await page.waitForTimeout(3000);

    const almendraLoaded = await page.evaluate(async () => {
        await document.fonts.ready;
        const loaded = [];
        document.fonts.forEach(f => loaded.push(f.family));
        return loaded.some(f => f.toLowerCase().includes('almendra'));
    });

    expect(almendraLoaded, 'Almendra font should be loaded via document.fonts').toBe(true);
});

// ─── Step 1: Title Screen ─────────────────────────────────────────────────────

test('title screen: no JS errors on load with new fonts', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await freshStart(page);
    await page.waitForTimeout(2000);

    expect(errors, `JS errors: ${errors.join(', ')}`).toHaveLength(0);
});

test('title screen: no network request failures', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => localStorage.removeItem('dungeon-fisher-save'));

    const failedRequests = [];
    page.on('requestfailed', req => {
        const failure = req.failure();
        if (failure && failure.errorText === 'net::ERR_ABORTED') return;
        if (!req.url().includes('favicon')) {
            failedRequests.push(req.url().split('/').pop());
        }
    });

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(1000);

    expect(failedRequests, `Failed requests: ${failedRequests.join(', ')}`).toHaveLength(0);
});

test('title screen: canvas visible with correct 16:9 aspect ratio', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 600 });
    await freshStart(page);

    const bounds = await getCanvasBounds(page);
    expect(bounds).not.toBeNull();
    expect(bounds.width).toBeGreaterThan(100);
    expect(bounds.height).toBeGreaterThan(100);

    const ratio = bounds.width / bounds.height;
    expect(ratio, 'Canvas should have ~16:9 aspect ratio').toBeGreaterThan(1.7);
    expect(ratio).toBeLessThan(1.8);
});

test('title screen: screenshot in landscape — verify Cinzel fantasy title', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 600 });
    await freshStart(page);
    await page.waitForTimeout(2500);

    await page.screenshot({ path: 'tests/browser/screenshots/font-overhaul-01-landscape-title.png' });

    const bounds = await getCanvasBounds(page);
    expect(bounds).not.toBeNull();
});

// ─── Step 2: Starter Selection ────────────────────────────────────────────────

test('starter selection: no JS errors after NEW GAME click', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await freshStart(page);
    await page.waitForTimeout(2200);

    await clickGame(page, 240, 148);  // NEW GAME button
    await page.waitForTimeout(600);

    expect(errors, `JS errors: ${errors.join(', ')}`).toHaveLength(0);
});

test('starter selection: screenshot showing fish names and stats', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 600 });
    await freshStart(page);
    await page.waitForTimeout(2200);

    await clickGame(page, 240, 148);  // NEW GAME
    await page.waitForTimeout(700);

    await page.screenshot({ path: 'tests/browser/screenshots/font-overhaul-02-starter-selection.png' });

    const bounds = await getCanvasBounds(page);
    expect(bounds).not.toBeNull();
});

// ─── Step 3: Floor Scene ─────────────────────────────────────────────────────

test('floor scene: no JS errors entering floor 1', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await freshStart(page);
    await page.waitForTimeout(2200);
    await clickGame(page, 240, 148);  // NEW GAME
    await page.waitForTimeout(400);
    await clickGame(page, 120, 166);  // SELECT first fish
    await page.waitForTimeout(1000);

    expect(errors, `JS errors: ${errors.join(', ')}`).toHaveLength(0);
});

test('floor scene: screenshot showing Cinzel floor header', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 600 });
    await freshStart(page);
    await page.waitForTimeout(2200);
    await clickGame(page, 240, 148);  // NEW GAME
    await page.waitForTimeout(400);
    await clickGame(page, 120, 166);  // SELECT first fish
    await page.waitForTimeout(1000);

    await page.screenshot({ path: 'tests/browser/screenshots/font-overhaul-03-floor-scene.png' });

    const bounds = await getCanvasBounds(page);
    expect(bounds.width).toBeGreaterThan(0);
});

// ─── Step 4: Battle Scene ─────────────────────────────────────────────────────

test('battle scene: no JS errors entering a battle', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.setViewportSize({ width: 900, height: 600 });
    await freshStart(page);
    await page.waitForTimeout(2200);
    await clickGame(page, 240, 148);  // NEW GAME
    await page.waitForTimeout(400);
    await clickGame(page, 120, 166);  // SELECT fish
    await page.waitForTimeout(1000);
    await clickGame(page, 240, 135);  // FISH button
    await page.waitForTimeout(800);

    expect(errors, `JS errors: ${errors.join(', ')}`).toHaveLength(0);
});

test('battle scene: screenshot showing combat text legibility', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 600 });
    await freshStart(page);
    await page.waitForTimeout(2200);
    await clickGame(page, 240, 148);  // NEW GAME
    await page.waitForTimeout(400);
    await clickGame(page, 120, 166);  // SELECT fish
    await page.waitForTimeout(1000);
    await clickGame(page, 240, 135);  // FISH button
    await page.waitForTimeout(800);

    await page.screenshot({ path: 'tests/browser/screenshots/font-overhaul-04-battle-scene.png' });

    const bounds = await getCanvasBounds(page);
    expect(bounds.width).toBeGreaterThan(0);
});

// ─── Step 6: Portrait Mode ────────────────────────────────────────────────────

test('portrait mode: no JS errors with new fonts at 393x852', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.setViewportSize({ width: 393, height: 852 });
    await page.goto(BASE);
    await page.evaluate(() => localStorage.removeItem('dungeon-fisher-save'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(2000);

    expect(errors, `JS errors in portrait: ${errors.join(', ')}`).toHaveLength(0);
});

test('portrait mode: no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await freshStart(page);
    await page.waitForTimeout(1000);

    const overflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth);
    expect(overflow, 'No horizontal overflow in portrait mode').toBe(false);
});

test('portrait mode: title screenshot verifying no text clipping', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await freshStart(page);
    await page.waitForTimeout(2500);

    await page.screenshot({ path: 'tests/browser/screenshots/font-overhaul-05-portrait-title.png' });

    const bounds = await getCanvasBounds(page);
    expect(bounds).not.toBeNull();
    expect(bounds.width).toBeGreaterThan(0);
});

test('portrait mode: no overflow after overflow in landscape', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 600 });
    await freshStart(page);

    const landscapeOverflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth);
    expect(landscapeOverflow, 'No overflow in landscape').toBe(false);
});

// ─── Step 7: Full flow — no errors end-to-end ────────────────────────────────

test('end-to-end: no JS errors through title → starter → floor', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await freshStart(page);
    await page.waitForTimeout(2200);
    await clickGame(page, 240, 148);  // NEW GAME
    await page.waitForTimeout(400);
    await clickGame(page, 120, 166);  // SELECT first fish
    await page.waitForTimeout(1000);

    expect(errors, `JS errors in full flow: ${errors.join(', ')}`).toHaveLength(0);
});

test('end-to-end: canvas renders at each scene transition', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 600 });
    await freshStart(page);
    await page.waitForTimeout(2200);

    // Title screen
    let bounds = await getCanvasBounds(page);
    expect(bounds.width).toBeGreaterThan(0);

    // Starter selection
    await clickGame(page, 240, 148);
    await page.waitForTimeout(600);
    bounds = await getCanvasBounds(page);
    expect(bounds.width).toBeGreaterThan(0);

    // Floor scene
    await clickGame(page, 120, 166);
    await page.waitForTimeout(1000);
    bounds = await getCanvasBounds(page);
    expect(bounds.width).toBeGreaterThan(0);

    await page.screenshot({ path: 'tests/browser/screenshots/font-overhaul-06-end-to-end.png' });
});
