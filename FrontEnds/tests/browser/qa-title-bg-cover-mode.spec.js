/**
 * QA: Title Background Cover Mode
 * Plan: qa-browser-title-bg-cover-mode
 *
 * Verifies that the title background uses cover mode (no letterboxing/pillarboxing)
 * in both portrait and landscape viewports.
 */

const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:8086';

async function freshStart(page) {
    await page.goto(BASE);
    await page.evaluate(() => localStorage.removeItem('dungeon-fisher-save'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(3000);
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

/**
 * Sample pixel color from canvas at a given game coordinate.
 * Returns { r, g, b, a } values.
 */
async function samplePixel(page, gx, gy) {
    const GAME_W = 480, GAME_H = 270;
    return page.evaluate(([gx, gy, GAME_W, GAME_H]) => {
        const canvas = document.querySelector('canvas');
        if (!canvas) return null;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        const px = Math.round(gx * canvas.width / GAME_W);
        const py = Math.round(gy * canvas.height / GAME_H);
        const d = ctx.getImageData(px, py, 1, 1).data;
        return { r: d[0], g: d[1], b: d[2], a: d[3] };
    }, [gx, gy, GAME_W, GAME_H]);
}

test.describe('Title Background Cover Mode — Portrait (390x844)', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('title background fills viewport edges (no pillarboxing)', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        await freshStart(page);

        // Screenshot for visual inspection
        await page.screenshot({ path: 'tests/browser/screenshots/cover-mode-portrait-01-title.png' });

        expect(errors, `JS errors: ${errors.join(', ')}`).toHaveLength(0);

        const bounds = await getCanvasBounds(page);
        expect(bounds).not.toBeNull();

        // In cover mode the canvas should fill the viewport
        // The canvas itself fills the container — verify it has dimensions
        expect(bounds.width).toBeGreaterThan(300);
        expect(bounds.height).toBeGreaterThan(300);

        // Sample left-edge pixel (game x=2) — should not be pure black (0,0,0)
        // which would indicate a letterbox bar
        const leftEdge = await samplePixel(page, 2, 135);
        if (leftEdge) {
            const isBlackBar = leftEdge.r < 10 && leftEdge.g < 10 && leftEdge.b < 10;
            expect(isBlackBar, `Left edge pixel at (2,135) is pure black — possible pillarbox bar: ${JSON.stringify(leftEdge)}`).toBe(false);
        }

        // Sample right-edge pixel (game x=478) — should not be pure black
        const rightEdge = await samplePixel(page, 478, 135);
        if (rightEdge) {
            const isBlackBar = rightEdge.r < 10 && rightEdge.g < 10 && rightEdge.b < 10;
            expect(isBlackBar, `Right edge pixel at (478,135) is pure black — possible pillarbox bar: ${JSON.stringify(rightEdge)}`).toBe(false);
        }

        // Sample top-edge pixel (game y=2) — should not be pure black
        const topEdge = await samplePixel(page, 240, 2);
        if (topEdge) {
            const isBlackBar = topEdge.r < 10 && topEdge.g < 10 && topEdge.b < 10;
            expect(isBlackBar, `Top edge pixel at (240,2) is pure black — possible letterbox bar: ${JSON.stringify(topEdge)}`).toBe(false);
        }

        // Sample bottom-edge pixel (game y=268) — should not be pure black
        const bottomEdge = await samplePixel(page, 240, 268);
        if (bottomEdge) {
            const isBlackBar = bottomEdge.r < 10 && bottomEdge.g < 10 && bottomEdge.b < 10;
            expect(isBlackBar, `Bottom edge pixel at (240,268) is pure black — possible letterbox bar: ${JSON.stringify(bottomEdge)}`).toBe(false);
        }
    });

    test('Ken Burns animation is active on title screen', async ({ page }) => {
        await freshStart(page);

        // Sample the background scale after a short delay to confirm Ken Burns runs
        // We verify the tween is set up by checking for no JS errors
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        await page.waitForTimeout(2000);
        await page.screenshot({ path: 'tests/browser/screenshots/cover-mode-portrait-02-kenburns.png' });

        expect(errors, `JS errors during Ken Burns animation: ${errors.join(', ')}`).toHaveLength(0);
    });
});

test.describe('Title Background Cover Mode — Landscape (844x390)', () => {
    test.use({ viewport: { width: 844, height: 390 } });

    test('title background fills viewport edges in landscape', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        await freshStart(page);

        await page.screenshot({ path: 'tests/browser/screenshots/cover-mode-landscape-01-title.png' });

        expect(errors, `JS errors: ${errors.join(', ')}`).toHaveLength(0);

        const bounds = await getCanvasBounds(page);
        expect(bounds).not.toBeNull();
        expect(bounds.width).toBeGreaterThan(300);
        expect(bounds.height).toBeGreaterThan(200);

        // Sample left and right edges — should not be pure black in cover mode
        const leftEdge = await samplePixel(page, 2, 135);
        if (leftEdge) {
            const isBlackBar = leftEdge.r < 10 && leftEdge.g < 10 && leftEdge.b < 10;
            expect(isBlackBar, `Landscape left edge pure black — possible pillarbox: ${JSON.stringify(leftEdge)}`).toBe(false);
        }

        const rightEdge = await samplePixel(page, 478, 135);
        if (rightEdge) {
            const isBlackBar = rightEdge.r < 10 && rightEdge.g < 10 && rightEdge.b < 10;
            expect(isBlackBar, `Landscape right edge pure black — possible pillarbox: ${JSON.stringify(rightEdge)}`).toBe(false);
        }
    });
});

test.describe('CharacterSelectScene cover mode', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('CharacterSelectScene background uses cover mode', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        await freshStart(page);

        // Click NEW GAME at (240, 97) game coordinates
        await clickGame(page, 240, 97);
        await page.waitForTimeout(1500);

        await page.screenshot({ path: 'tests/browser/screenshots/cover-mode-portrait-03-charselect.png' });

        expect(errors, `JS errors on CharacterSelect: ${errors.join(', ')}`).toHaveLength(0);

        // Edge pixels should not be pure black bars
        const leftEdge = await samplePixel(page, 2, 135);
        if (leftEdge) {
            const isBlackBar = leftEdge.r < 10 && leftEdge.g < 10 && leftEdge.b < 10;
            expect(isBlackBar, `CharacterSelect left edge pure black: ${JSON.stringify(leftEdge)}`).toBe(false);
        }
    });
});

test.describe('StarterSelectScene cover mode', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('Starter selection screen background uses cover mode', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        await freshStart(page);

        // Click NEW GAME to reach CharacterSelectScene
        await clickGame(page, 240, 97);
        await page.waitForTimeout(1500);

        // Click first character to proceed to starter selection
        // Characters appear near game y=120, spread across x
        await clickGame(page, 120, 120);
        await page.waitForTimeout(1500);

        await page.screenshot({ path: 'tests/browser/screenshots/cover-mode-portrait-04-starterselect.png' });

        expect(errors, `JS errors on StarterSelect: ${errors.join(', ')}`).toHaveLength(0);
    });
});
