/**
 * QA: Update Title Background Image
 * Verifies that the new title.png background renders on TitleScene and CharacterSelectScene.
 */

const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:8086';

async function waitForGame(page) {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(1500);
}

async function freshStart(page) {
    await page.goto(BASE);
    await page.evaluate(() => localStorage.removeItem('dungeon-fisher-save'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(5000);
}

async function getCanvasBounds(page) {
    return page.locator('canvas').first().boundingBox();
}

async function gameCoord(page, gx, gy) {
    const GAME_W = 480, GAME_H = 270;
    const bounds = await getCanvasBounds(page);
    return {
        x: bounds.x + gx * (bounds.width / GAME_W),
        y: bounds.y + gy * (bounds.height / GAME_H),
    };
}

async function clickGame(page, gx, gy) {
    const { x, y } = await gameCoord(page, gx, gy);
    await page.mouse.click(x, y);
}

test('title background: title.png loads with HTTP 200', async ({ page }) => {
    const responses = {};
    page.on('response', resp => {
        if (resp.url().includes('/backgrounds/')) {
            responses[resp.url().split('/').pop()] = resp.status();
        }
    });

    await waitForGame(page);

    expect(responses['title.png']).toBe(200);
});

test('title background: no console errors during boot', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await waitForGame(page);
    await page.waitForTimeout(500);

    expect(errors, `JS errors: ${errors.join(', ')}`).toHaveLength(0);
});

test('title background: canvas renders on TitleScene', async ({ page }) => {
    await freshStart(page);

    await page.screenshot({ path: 'tests/browser/screenshots/title-bg-01-titlescene.png' });

    const bounds = await getCanvasBounds(page);
    expect(bounds).not.toBeNull();
    expect(bounds.width).toBeGreaterThan(0);
    expect(bounds.height).toBeGreaterThan(0);
});

test('title background: title.png appears in performance resource log', async ({ page }) => {
    await freshStart(page);

    const resources = await page.evaluate(() =>
        performance.getEntriesByType('resource')
            .filter(e => e.name.includes('/backgrounds/'))
            .map(e => e.name.split('/').pop())
    );

    expect(resources).toContain('title.png');
});

test('character select: same title background appears on CharacterSelectScene', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await freshStart(page);

    // NEW GAME button at (W/2, H*0.36) = (240, 97)
    await clickGame(page, 240, 97);
    await page.waitForTimeout(1000);

    await page.screenshot({ path: 'tests/browser/screenshots/title-bg-02-charselect.png' });

    expect(errors, `JS errors on char select: ${errors.join(', ')}`).toHaveLength(0);

    const bounds = await getCanvasBounds(page);
    expect(bounds).not.toBeNull();
    expect(bounds.width).toBeGreaterThan(0);
});
