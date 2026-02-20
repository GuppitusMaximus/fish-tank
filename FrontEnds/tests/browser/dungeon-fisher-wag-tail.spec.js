/**
 * Browser QA: Dungeon Fisher Dog Tail Wag Animation
 * Verifies the tail-wag overlay implementation from plan: dungeon-fisher-wag-tail
 *
 * Checks:
 * - tail-wag.png is fetched during boot (HTTP 200)
 * - All backgrounds including tail-wag load successfully
 * - No JS errors during title screen load (tail tween setup)
 * - Scene transition cleans up without tween errors
 *
 * Runs against local dev server at localhost:8080.
 */

const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:8080';

async function freshStart(page) {
    await page.goto(BASE);
    await page.evaluate(() => localStorage.removeItem('dungeon-fisher-save'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(1500);
}

// ─── Step 1: tail-wag.png asset loads ────────────────────────────────────────

test('tail wag: tail-wag.png is fetched during boot', async ({ page }) => {
    const loaded = [];
    page.on('response', resp => {
        if (resp.url().includes('/backgrounds/')) loaded.push(resp.url().split('/').pop());
    });

    await freshStart(page);

    expect(loaded, 'tail-wag.png should be loaded by BootScene').toContain('tail-wag.png');
});

test('tail wag: tail-wag.png HTTP response is 200', async ({ page }) => {
    const responses = {};
    page.on('response', resp => {
        if (resp.url().includes('/backgrounds/')) {
            responses[resp.url().split('/').pop()] = resp.status();
        }
    });

    await freshStart(page);

    expect(responses['tail-wag.png'], 'tail-wag.png should return HTTP 200').toBe(200);
});

// ─── Step 2: No JS errors during title screen with tail wag ──────────────────

test('tail wag: no JS errors during title screen load', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await freshStart(page);
    // Allow extra time for all tweens (zoom, tail wag rotation, Ken Burns sync) to start
    await page.waitForTimeout(2000);

    expect(errors, `JS errors: ${errors.join(', ')}`).toHaveLength(0);
});

test('tail wag: no network failures during boot (tail-wag.png accessible)', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => localStorage.removeItem('dungeon-fisher-save'));

    const failedRequests = [];
    page.on('requestfailed', req => {
        const failure = req.failure();
        if (failure && failure.errorText === 'net::ERR_ABORTED') return;
        if (!req.url().includes('favicon')) failedRequests.push(req.url().split('/').pop());
    });

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(1000);

    expect(failedRequests, `Failed requests: ${failedRequests.join(', ')}`).toHaveLength(0);
});

// ─── Step 3: Scene transition cleanup ────────────────────────────────────────

test('tail wag: no JS errors when transitioning to starter selection', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await freshStart(page);
    await page.waitForTimeout(2000);

    // Click NEW GAME at game coords (240, 148) = (W/2, H*0.55)
    const canvas = await page.locator('canvas').first().boundingBox();
    const GAME_W = 480, GAME_H = 270;
    const scaleX = canvas.width / GAME_W;
    const scaleY = canvas.height / GAME_H;
    await page.mouse.click(canvas.x + 240 * scaleX, canvas.y + 148 * scaleY);
    await page.waitForTimeout(800);

    await page.screenshot({ path: 'tests/browser/screenshots/wag-tail-01-after-transition.png' });
    expect(errors, `Errors after transition: ${errors.join(', ')}`).toHaveLength(0);
});

// ─── Step 4: Visual screenshot capture ───────────────────────────────────────

test('tail wag: screenshot at 1s (tail wag visible on title)', async ({ page }) => {
    await freshStart(page);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'tests/browser/screenshots/wag-tail-02-title-1s.png' });

    const bounds = await page.locator('canvas').first().boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds.width).toBeGreaterThan(0);
});

// ─── Step 5: Portrait mode ────────────────────────────────────────────────────

test('tail wag: tail-wag.png loads in portrait viewport', async ({ page }) => {
    const loaded = [];
    page.on('response', resp => {
        if (resp.url().includes('/backgrounds/')) loaded.push(resp.url().split('/').pop());
    });

    await page.setViewportSize({ width: 393, height: 852 });
    await page.goto(BASE);
    await page.evaluate(() => localStorage.removeItem('dungeon-fisher-save'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(1500);

    expect(loaded, 'tail-wag.png should load in portrait mode').toContain('tail-wag.png');
    await page.screenshot({ path: 'tests/browser/screenshots/wag-tail-03-portrait.png' });
});

test('tail wag: no JS errors in portrait mode', async ({ page }) => {
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
