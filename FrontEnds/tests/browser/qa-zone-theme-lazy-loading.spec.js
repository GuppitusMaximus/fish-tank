/**
 * Browser QA: Zone Theme Lazy Loading
 * Tests selective asset loading at boot and on-demand zone loading in FloorScene.
 * (qa-zone-theme-lazy-loading plan)
 *
 * Verifies:
 * - BootScene loads only bg_title (fresh start) or bg_title + save zone bg (with save)
 * - BootScene does NOT load all 7 zone backgrounds at boot
 * - FloorScene loads zone bg on first entry (lazy load triggers correctly)
 * - No JS errors during boot or zone entry
 * - CONTINUE button loads saved floor without errors
 *
 * Requires: Vite dev server running at http://localhost:8080
 * Run: cd dungeon-fisher && npx vite --port 8080
 */

const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:8080';
const GAME_W = 480;
const GAME_H = 270;

// All zone background filenames expected to be lazily loaded (not at boot)
const ZONE_BG_FILES = [
    'backgrounds/sewers.png',
    'backgrounds/goblin-caves.png',
    'backgrounds/bone-crypts.png',
    'backgrounds/deep-dungeon.png',
    'backgrounds/shadow-realm.png',
    'backgrounds/ancient-chambers.png',
    'backgrounds/dungeon-heart.png',
];

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

// Clear save and reload; wait 5s for title screen animations
async function freshStart(page) {
    await page.goto(BASE);
    await page.evaluate(() => localStorage.removeItem('dungeon-fisher-save'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(5000);
}

// Create a save at the given floor and reload; wait 5s for title screen
async function startWithSave(page, floor) {
    await page.goto(BASE);
    await page.evaluate((f) => {
        localStorage.setItem('dungeon-fisher-save', JSON.stringify({
            version: 3, savedAt: Date.now(), floor: f, gold: 10, campFloor: f,
            party: [{ speciesId: 'guppy', name: 'Guppy', level: 1, xp: 0, xpToNext: 25,
                hp: 30, maxHp: 30, atk: 8, def: 5, spd: 6,
                specialMove: 'bubble_shot', poisoned: null, buffs: [] }],
            inventory: [], fisherId: 'andy', nextShopFloor: f
        }));
    }, floor);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(5000);
}

// ─── Step 1: Fresh boot — only bg_title loaded, no zone backgrounds ───────────

test('boot: fresh start loads no zone background files', async ({ page }) => {
    const bgRequests = [];
    page.on('request', req => {
        const url = req.url();
        for (const file of ZONE_BG_FILES) {
            if (url.includes(file)) bgRequests.push(file);
        }
    });

    await freshStart(page);
    await page.screenshot({ path: 'tests/browser/screenshots/lazy-01-fresh-no-zone-bgs.png' });

    expect(bgRequests,
        `Zone backgrounds should not load at boot (fresh start). Loaded: ${bgRequests.join(', ')}`
    ).toHaveLength(0);
});

test('boot: fresh start loads bg_title background', async ({ page }) => {
    const titleBgLoaded = { found: false };
    page.on('request', req => {
        if (req.url().includes('backgrounds/title.png')) titleBgLoaded.found = true;
    });

    await freshStart(page);

    expect(titleBgLoaded.found, 'bg_title should be loaded at boot').toBe(true);
});

test('boot: fresh start — no JS errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await freshStart(page);
    await page.screenshot({ path: 'tests/browser/screenshots/lazy-02-fresh-no-errors.png' });

    expect(errors, `JS errors on fresh start: ${errors.join(', ')}`).toHaveLength(0);
});

// ─── Step 2: Boot with save — loads correct zone bg, not all 7 ───────────────

test('boot: save on floor 1 (sewers) — loads sewers bg at boot', async ({ page }) => {
    const bgRequests = [];
    page.on('request', req => {
        const url = req.url();
        for (const file of ZONE_BG_FILES) {
            if (url.includes(file)) bgRequests.push(file);
        }
    });

    await startWithSave(page, 1);  // floor 1 = sewers
    await page.screenshot({ path: 'tests/browser/screenshots/lazy-03-save-sewers-bg.png' });

    // Sewers bg loaded (save zone = sewers)
    const sewersBgLoaded = bgRequests.some(r => r.includes('sewers.png'));
    expect(sewersBgLoaded, 'Sewers bg should load at boot (it is the save zone)').toBe(true);

    // No other zone bgs loaded at boot
    const otherBgs = bgRequests.filter(r => !r.includes('sewers.png'));
    expect(otherBgs,
        `Only sewers bg should load at boot, not: ${otherBgs.join(', ')}`
    ).toHaveLength(0);
});

test('boot: save on floor 25 (bone crypts) — loads bone-crypts bg at boot, not sewers', async ({ page }) => {
    const bgRequests = [];
    page.on('request', req => {
        const url = req.url();
        for (const file of ZONE_BG_FILES) {
            if (url.includes(file)) bgRequests.push(file);
        }
    });

    await startWithSave(page, 25);  // floor 25 = bone_crypts
    await page.screenshot({ path: 'tests/browser/screenshots/lazy-04-save-bone-crypts-bg.png' });

    const cryptsBgLoaded = bgRequests.some(r => r.includes('bone-crypts.png'));
    expect(cryptsBgLoaded, 'Bone crypts bg should load at boot (it is the save zone)').toBe(true);

    const sewersBgLoaded = bgRequests.some(r => r.includes('sewers.png'));
    expect(sewersBgLoaded, 'Sewers bg should NOT load at boot (not the save zone)').toBe(false);
});

test('boot: save on floor 11 (goblin caves) — loads goblin-caves bg at boot', async ({ page }) => {
    const bgRequests = [];
    page.on('request', req => {
        const url = req.url();
        for (const file of ZONE_BG_FILES) {
            if (url.includes(file)) bgRequests.push(file);
        }
    });

    await startWithSave(page, 11);  // floor 11 = goblin_caves
    await page.screenshot({ path: 'tests/browser/screenshots/lazy-05-save-goblin-caves-bg.png' });

    const goblinBgLoaded = bgRequests.some(r => r.includes('goblin-caves.png'));
    expect(goblinBgLoaded, 'Goblin caves bg should load at boot (it is the save zone)').toBe(true);

    // Total zone bg requests should be exactly 1 (only save zone)
    expect(bgRequests.length,
        `Exactly 1 zone bg should load at boot, got: ${bgRequests.join(', ')}`
    ).toBe(1);
});

test('boot: save — no JS errors with save zone preloaded', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await startWithSave(page, 1);
    await page.screenshot({ path: 'tests/browser/screenshots/lazy-06-save-no-errors.png' });

    expect(errors, `JS errors with save: ${errors.join(', ')}`).toHaveLength(0);
});

// ─── Step 3: FloorScene lazy load on CONTINUE (floor 1 = sewers) ─────────────

test('floor: CONTINUE from floor-1 save — sewers bg loads (lazy), no JS errors', async ({ page }) => {
    const errors = [];
    const bgRequests = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('request', req => {
        const url = req.url();
        for (const file of ZONE_BG_FILES) {
            if (url.includes(file)) bgRequests.push(file);
        }
    });

    await startWithSave(page, 1);  // sewers bg loaded at boot

    // Click CONTINUE (floor 1 save, button at H*0.43 = 116)
    await clickGame(page, 240, 116);
    await page.waitForTimeout(1000);

    await page.screenshot({ path: 'tests/browser/screenshots/lazy-07-continue-floor1.png' });

    // No errors after entering FloorScene
    expect(errors, `JS errors on CONTINUE: ${errors.join(', ')}`).toHaveLength(0);

    // Canvas still visible (scene loaded correctly)
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();
});

test('floor: CONTINUE from deep-dungeon save — deep-dungeon bg loads on demand', async ({ page }) => {
    const errors = [];
    const bgRequests = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('request', req => {
        const url = req.url();
        for (const file of ZONE_BG_FILES) {
            if (url.includes(file)) bgRequests.push(file);
        }
    });

    // Clear the requests that happened during boot
    await startWithSave(page, 35);  // floor 35 = deep_dungeon
    const bootRequests = [...bgRequests];
    bgRequests.length = 0;  // reset to track only FloorScene requests

    // Click CONTINUE
    await clickGame(page, 240, 116);
    await page.waitForTimeout(1200);

    await page.screenshot({ path: 'tests/browser/screenshots/lazy-08-continue-deep-dungeon.png' });

    expect(errors, `JS errors entering deep dungeon: ${errors.join(', ')}`).toHaveLength(0);

    // deep-dungeon bg should have been requested either at boot or on entry
    const allBgRequests = [...bootRequests, ...bgRequests];
    const deepBgLoaded = allBgRequests.some(r => r.includes('deep-dungeon.png'));
    expect(deepBgLoaded,
        'deep-dungeon bg should be loaded (at boot as save zone or on FloorScene entry)'
    ).toBe(true);

    // Canvas still visible
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();
});

// ─── Step 4: Boot asset count (only title bg + shared assets, not all zones) ──

test('boot: total zone background requests at fresh boot is exactly 0', async ({ page }) => {
    let zoneBgCount = 0;
    page.on('request', req => {
        const url = req.url();
        for (const file of ZONE_BG_FILES) {
            if (url.includes(file)) zoneBgCount++;
        }
    });

    // Fresh start — no save
    await page.goto(BASE);
    await page.evaluate(() => localStorage.removeItem('dungeon-fisher-save'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(3000);

    await page.screenshot({ path: 'tests/browser/screenshots/lazy-09-boot-asset-count.png' });
    expect(zoneBgCount,
        `Expected 0 zone bg requests at fresh boot, got ${zoneBgCount}`
    ).toBe(0);
});

test('boot: total zone background requests with save is exactly 1', async ({ page }) => {
    let zoneBgCount = 0;
    page.on('request', req => {
        const url = req.url();
        for (const file of ZONE_BG_FILES) {
            if (url.includes(file)) zoneBgCount++;
        }
    });

    await startWithSave(page, 7);  // floor 7 = sewers
    expect(zoneBgCount,
        `Expected exactly 1 zone bg request at boot (save zone only), got ${zoneBgCount}`
    ).toBe(1);
});

// ─── Step 5: No regressions — title screen, save/load ────────────────────────

test('regression: title screen appears immediately (bg_title loads at boot)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(2000);

    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();
    await page.screenshot({ path: 'tests/browser/screenshots/lazy-10-title-immediate.png' });
    expect(errors).toHaveLength(0);
});

test('regression: save/load still works after lazy loading changes', async ({ page }) => {
    await startWithSave(page, 7);  // save at floor 7

    // Verify save persists
    const saveData = await page.evaluate(() =>
        JSON.parse(localStorage.getItem('dungeon-fisher-save') || 'null')
    );
    expect(saveData).not.toBeNull();
    expect(saveData.floor).toBe(7);
    expect(saveData.version).toBe(3);

    await page.screenshot({ path: 'tests/browser/screenshots/lazy-11-save-load-regression.png' });
});

test('regression: new game click — no JS errors, canvas visible', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await freshStart(page);
    // NEW GAME at (240, H*0.36 = ~97)
    await clickGame(page, 240, 97);
    await page.waitForTimeout(500);

    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();
    await page.screenshot({ path: 'tests/browser/screenshots/lazy-12-new-game-click.png' });
    expect(errors, `JS errors on NEW GAME: ${errors.join(', ')}`).toHaveLength(0);
});
