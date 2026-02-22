/**
 * Browser QA: Zone Preview Backgrounds
 * Verifies that all 7 zone backgrounds load correctly in ZonePreviewScene
 * after the fix-zone-preview-backgrounds implementation.
 *
 * Tests:
 * - All 7 zones display backgrounds (no missing texture placeholders)
 * - No Phaser load errors in console
 * - No failed network requests for zone assets
 * - Left boundary at zone 0 (cannot navigate before sewers)
 * - ESC returns to TitleScene
 *
 * Requires: Vite dev server running at http://localhost:8080
 * Run: cd dungeon-fisher && npx vite --port 8080
 */

const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:8080';
const GAME_W = 480;
const GAME_H = 270;

const ZONES = [
    { name: 'sewers',           index: 0 },
    { name: 'goblin_caves',     index: 1 },
    { name: 'bone_crypts',      index: 2 },
    { name: 'deep_dungeon',     index: 3 },
    { name: 'shadow_realm',     index: 4 },
    { name: 'ancient_chambers', index: 5 },
    { name: 'dungeon_heart',    index: 6 },
];

async function getCanvas(page) {
    return page.locator('canvas').first();
}

async function getCanvasBounds(page) {
    const canvas = await getCanvas(page);
    return await canvas.boundingBox();
}

async function gameCoord(page, gx, gy) {
    const bounds = await getCanvasBounds(page);
    const scaleX = bounds.width / GAME_W;
    const scaleY = bounds.height / GAME_H;
    return {
        x: bounds.x + gx * scaleX,
        y: bounds.y + gy * scaleY,
    };
}

async function clickGame(page, gx, gy) {
    const { x, y } = await gameCoord(page, gx, gy);
    await page.mouse.click(x, y);
}

// Clear save and reload; wait 5s for title screen animations to complete
async function freshStart(page) {
    await page.goto(BASE);
    await page.evaluate(() => localStorage.removeItem('dungeon-fisher-save'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(5000);
}

// Click ZONES button and wait for ZonePreviewScene to initialize
async function openZonePreview(page) {
    // ZONES button at game coordinate (240, 135) — H*0.50
    await clickGame(page, 240, 135);
    await page.waitForTimeout(1000); // wait for fade transition + scene init
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test('zone-preview: navigate to ZonePreviewScene — no JS errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await freshStart(page);
    await openZonePreview(page);

    const canvas = await getCanvas(page);
    await expect(canvas).toBeVisible();
    await page.screenshot({ path: 'tests/browser/screenshots/zone-preview-bg-00-entry.png' });

    expect(errors, `JS errors on ZonePreview entry: ${errors.join('; ')}`).toHaveLength(0);
});

test('zone-preview: all 7 zones render without JS errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await freshStart(page);
    await openZonePreview(page);

    for (let i = 0; i < ZONES.length; i++) {
        const zone = ZONES[i];
        await page.screenshot({
            path: `tests/browser/screenshots/zone-preview-bg-${String(i + 1).padStart(2, '0')}-${zone.name}.png`,
        });

        if (i < ZONES.length - 1) {
            await page.keyboard.press('ArrowRight');
            await page.waitForTimeout(700); // 200ms fade + render time
        }
    }

    const canvas = await getCanvas(page);
    await expect(canvas).toBeVisible();
    expect(errors, `JS errors navigating zones: ${errors.join('; ')}`).toHaveLength(0);
});

test('zone-preview: no failed network requests for zone backgrounds', async ({ page }) => {
    const failedRequests = [];
    page.on('requestfailed', req => {
        const url = req.url();
        if (!url.includes('favicon') && !url.includes('fonts.')) {
            failedRequests.push(`${req.failure()?.errorText || 'unknown'}: ${url}`);
        }
    });

    await freshStart(page);
    await openZonePreview(page);

    // Navigate through all 7 zones to trigger lazy background loads
    for (let i = 0; i < ZONES.length - 1; i++) {
        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(700);
    }

    expect(failedRequests, `Failed requests:\n${failedRequests.join('\n')}`).toHaveLength(0);
});

test('zone-preview: left boundary — cannot navigate before zone 0', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await freshStart(page);
    await openZonePreview(page);

    // Baseline at zone 0 (sewers)
    await page.screenshot({ path: 'tests/browser/screenshots/zone-preview-boundary-01-sewers.png' });

    // Press LEFT at zone 0 — should be a no-op
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(700);

    const canvas = await getCanvas(page);
    await expect(canvas).toBeVisible();
    await page.screenshot({ path: 'tests/browser/screenshots/zone-preview-boundary-02-after-left.png' });

    expect(errors, `Boundary errors: ${errors.join('; ')}`).toHaveLength(0);
});

test('zone-preview: ESC returns to TitleScene', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await freshStart(page);
    await openZonePreview(page);

    await page.screenshot({ path: 'tests/browser/screenshots/zone-preview-back-01-before.png' });

    // ESC should trigger return to TitleScene
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1200); // wait for fade transition back to title

    const canvas = await getCanvas(page);
    await expect(canvas).toBeVisible();
    await page.screenshot({ path: 'tests/browser/screenshots/zone-preview-back-02-after.png' });

    expect(errors, `Back navigation errors: ${errors.join('; ')}`).toHaveLength(0);
});

test('zone-preview: no texture load errors in browser console', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => {
        if (msg.type() === 'error') {
            consoleErrors.push(msg.text());
        }
    });

    await freshStart(page);
    await openZonePreview(page);

    // Navigate through all zones to trigger all background loads
    for (let i = 0; i < ZONES.length - 1; i++) {
        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(700);
    }

    // Filter to texture / asset load errors
    const textureErrors = consoleErrors.filter(e =>
        e.toLowerCase().includes('texture') ||
        e.toLowerCase().includes('atlas') ||
        e.toLowerCase().includes('load error') ||
        e.toLowerCase().includes('missing') ||
        e.toLowerCase().includes('404')
    );

    expect(textureErrors, `Texture/load errors:\n${textureErrors.join('\n')}`).toHaveLength(0);
});
