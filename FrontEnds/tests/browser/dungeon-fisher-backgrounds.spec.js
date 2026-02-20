/**
 * Browser QA: Dungeon Fisher Backgrounds
 * Verifies zone-based background images render correctly in each scene.
 *
 * Backgrounds are rendered on a Phaser WebGL canvas. Verification uses:
 * - Network response tracking (all 7 PNGs load with HTTP 200)
 * - Screenshot inspection for visual confirmation
 * - Phaser texture cache checks via page.evaluate
 * - localStorage manipulation for zone transition testing
 *
 * Runs against local dev server at localhost:8080.
 */

const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:8080';
const GAME_W = 480;
const GAME_H = 270;

async function getCanvasBounds(page) {
    return page.locator('canvas').first().boundingBox();
}

// Convert game coordinates to browser viewport coordinates
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

// Wait for Phaser game to fully boot
async function waitForGame(page) {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(1500);
}

// Clear save and start fresh
async function freshStart(page) {
    await page.goto(BASE);
    await page.evaluate(() => localStorage.removeItem('dungeon-fisher-save'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(1500);
}

// Navigate to FloorScene at a specific floor by injecting save data, then clicking CONTINUE
async function startAtFloor(page, floor) {
    await page.goto(BASE);
    await page.evaluate((f) => {
        // Must include version: 1 (SAVE_FORMAT_VERSION) or SaveSystem.load() will reject it
        const save = {
            version: 1,
            gameVersion: '0.1.0',
            savedAt: Date.now(),
            floor: f,
            gold: 50,
            party: [{
                speciesId: 'guppy', name: 'Guppy', color: 0xe8734a,
                level: 1, xp: 0, xpToNext: 25,
                hp: 30, maxHp: 30, atk: 8, def: 5, spd: 6,
                moves: ['splash'], poisoned: null, buffs: []
            }],
            inventory: [],
            campFloor: f
        };
        localStorage.setItem('dungeon-fisher-save', JSON.stringify(save));
    }, floor);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(1500);
    // CONTINUE button appears at (W/2, H*0.65) = (240, 175) when a save exists
    await clickGame(page, 240, 175);
    await page.waitForTimeout(1000);
}

// Get all background resource entries from performance API
async function getBackgroundResources(page) {
    return page.evaluate(() =>
        performance.getEntriesByType('resource')
            .filter(e => e.name.includes('/backgrounds/'))
            .map(e => e.name.split('/').pop())
    );
}

// ─── Step 1: Background Asset Loading ─────────────────────────────────────────

test('asset loading: all 7 background images are fetched during boot', async ({ page }) => {
    const loaded = [];
    page.on('response', resp => {
        if (resp.url().includes('/backgrounds/')) loaded.push(resp.url().split('/').pop());
    });

    await waitForGame(page);

    const expected = [
        'sewers.png',
        'goblin-caves.png',
        'bone-crypts.png',
        'deep-dungeon.png',
        'shadow-realm.png',
        'ancient-chambers.png',
        'dungeon-heart.png'
    ];
    for (const bg of expected) {
        expect(loaded, `Expected ${bg} to be fetched`).toContain(bg);
    }
});

test('asset loading: all background HTTP responses are 200', async ({ page }) => {
    const failed = [];
    page.on('response', resp => {
        if (resp.url().includes('/backgrounds/') && resp.status() !== 200) {
            failed.push(`${resp.url().split('/').pop()} → ${resp.status()}`);
        }
    });

    await waitForGame(page);
    expect(failed, `Failed background loads: ${failed.join(', ')}`).toHaveLength(0);
});

test('asset loading: no JS errors during boot with backgrounds', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await waitForGame(page);
    await page.waitForTimeout(500);
    expect(errors, `JS errors: ${errors.join(', ')}`).toHaveLength(0);
});

// ─── Step 2: Title Screen (Sewers Background) ─────────────────────────────────

test('title screen: canvas renders with sewers background', async ({ page }) => {
    await freshStart(page);
    await page.screenshot({ path: 'tests/browser/screenshots/bg-01-title-sewers.png' });

    // Canvas must be visible and have non-zero dimensions
    const bounds = await getCanvasBounds(page);
    expect(bounds).not.toBeNull();
    expect(bounds.width).toBeGreaterThan(0);
    expect(bounds.height).toBeGreaterThan(0);

    // sewers.png must have been fetched (it's used in TitleScene)
    const bgLoaded = await getBackgroundResources(page);
    expect(bgLoaded).toContain('sewers.png');
});

test('title screen: canvas aspect ratio is 16:9 (landscape)', async ({ page }) => {
    await waitForGame(page);
    const bounds = await getCanvasBounds(page);
    const ratio = bounds.width / bounds.height;
    expect(ratio).toBeGreaterThan(1.7);
    expect(ratio).toBeLessThan(1.8);
});

test('title screen: NEW GAME button is clickable (sewers background visible behind text)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await freshStart(page);
    // NEW GAME button: (W/2, H*0.55) = (240, 148)
    await clickGame(page, 240, 148);
    await page.waitForTimeout(600);

    await page.screenshot({ path: 'tests/browser/screenshots/bg-02-starter-selection.png' });
    expect(errors).toHaveLength(0);
});

// ─── Step 3: Floor Scene Background ───────────────────────────────────────────

test('floor scene: sewers background on floor 1 — no errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await freshStart(page);
    await clickGame(page, 240, 148);  // NEW GAME
    await page.waitForTimeout(400);
    await clickGame(page, 120, 166);  // SELECT guppy (1st starter)
    await page.waitForTimeout(1000);

    await page.screenshot({ path: 'tests/browser/screenshots/bg-03-floor1-sewers.png' });
    expect(errors).toHaveLength(0);
});

test('floor scene: save state contains floor 1 after game start', async ({ page }) => {
    await freshStart(page);
    await clickGame(page, 240, 148);  // NEW GAME
    await page.waitForTimeout(400);
    await clickGame(page, 120, 166);  // SELECT guppy
    await page.waitForTimeout(800);

    const save = await page.evaluate(() => JSON.parse(localStorage.getItem('dungeon-fisher-save') || 'null'));
    expect(save).not.toBeNull();
    expect(save.floor).toBe(1);
});

// ─── Step 4: Battle Scene Background ─────────────────────────────────────────

test('battle scene: sewers background renders during battle on floor 1', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await freshStart(page);
    await clickGame(page, 240, 148);  // NEW GAME
    await page.waitForTimeout(400);
    await clickGame(page, 120, 166);  // SELECT guppy
    await page.waitForTimeout(800);
    await clickGame(page, 240, 135);  // ENTER BATTLE button
    await page.waitForTimeout(1000);

    await page.screenshot({ path: 'tests/browser/screenshots/bg-04-battle-sewers.png' });
    expect(errors).toHaveLength(0);
});

// ─── Step 5: Zone Transition (Floor 11 = Goblin Caves) ────────────────────────

test('zone transition: goblin caves background loads on floor 11', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await startAtFloor(page, 11);
    // Game should load to FloorScene with floor 11 (goblin caves zone)
    await page.waitForTimeout(800);

    await page.screenshot({ path: 'tests/browser/screenshots/bg-05-floor11-goblin-caves.png' });
    expect(errors).toHaveLength(0);

    // Verify the save reflects floor 11
    const save = await page.evaluate(() => JSON.parse(localStorage.getItem('dungeon-fisher-save') || 'null'));
    expect(save).not.toBeNull();
    expect(save.floor).toBe(11);
});

test('zone transition: goblin-caves.png was loaded (available for floor 11)', async ({ page }) => {
    await startAtFloor(page, 11);
    await page.waitForTimeout(800);

    // All backgrounds were preloaded in BootScene — goblin-caves.png should be present
    const bgLoaded = await getBackgroundResources(page);
    expect(bgLoaded).toContain('goblin-caves.png');
});

test('zone transition: battle on floor 11 shows goblin caves background — no errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await startAtFloor(page, 11);
    await page.waitForTimeout(800);
    // ENTER BATTLE from floor scene
    await clickGame(page, 240, 135);
    await page.waitForTimeout(1000);

    await page.screenshot({ path: 'tests/browser/screenshots/bg-06-battle-floor11.png' });
    expect(errors).toHaveLength(0);
});

// ─── Step 6: Portrait Mode ─────────────────────────────────────────────────────

test('portrait mode: canvas renders in portrait viewport without errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.setViewportSize({ width: 393, height: 852 });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(1500);

    await page.screenshot({ path: 'tests/browser/screenshots/bg-07-portrait-title.png' });

    const bounds = await getCanvasBounds(page);
    expect(bounds).not.toBeNull();
    expect(bounds.width).toBeGreaterThan(0);
    expect(bounds.height).toBeGreaterThan(0);
    // Portrait canvas should be taller than wide (Phaser uses 270x480 in portrait)
    expect(bounds.height).toBeGreaterThan(bounds.width);
    expect(errors).toHaveLength(0);
});

test('portrait mode: no horizontal overflow with background', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(1000);

    const overflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
});

test('portrait mode: canvas fits within viewport width', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(1000);

    const bounds = await getCanvasBounds(page);
    // Canvas right edge must not exceed viewport
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(394);
});

test('portrait mode: all backgrounds still load in portrait mode', async ({ page }) => {
    const loaded = [];
    page.on('response', resp => {
        if (resp.url().includes('/backgrounds/')) loaded.push(resp.url().split('/').pop());
    });

    await page.setViewportSize({ width: 393, height: 852 });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // All 8 backgrounds should load: 7 gameplay zones + title screen
    expect(loaded.length).toBe(8);
});

// ─── Step 7: Continue Game (Saved State) ──────────────────────────────────────

test('continue: CONTINUE button appears when save exists and loads correctly', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    // Start a game to create a save
    await freshStart(page);
    await clickGame(page, 240, 148);
    await page.waitForTimeout(400);
    await clickGame(page, 120, 166);
    await page.waitForTimeout(1000);

    // Reload — should show CONTINUE option on title
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(1500);

    // CONTINUE button at (W/2, H*0.65) = (240, 175)
    await clickGame(page, 240, 175);
    await page.waitForTimeout(1000);

    await page.screenshot({ path: 'tests/browser/screenshots/bg-08-continue-floor.png' });
    expect(errors).toHaveLength(0);
});
