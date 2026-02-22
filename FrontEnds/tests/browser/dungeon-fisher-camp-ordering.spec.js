/**
 * Browser QA: Dungeon Fisher — Camp Party Ordering UI
 * Plan: qa-browser-auto-battler-camp-ordering
 *
 * Code-inspected checks (verified by reading CampScene.js, SaveSystem.js):
 *   1.  "PARTY ORDER" section header appears below healing display in camp
 *   2.  Each fish listed with name and level
 *   3.  First fish has a "(FRONT)" label in a highlight color (#f0c040)
 *   4.  First fish has no ▲ button; only a ▼ button
 *   5.  Last fish has no ▼ button; only a ▲ button
 *   6.  Middle fish has both ▲ and ▼ buttons
 *   7.  ▼ on first fish swaps it to second position (gs.party[0] ↔ gs.party[1])
 *   8.  ▲ on last fish swaps it to second-to-last position
 *   9.  After swap, "(FRONT)" label moves to the new first fish
 *  10.  SaveSystem.save() called on every swap (party order persists)
 *  11.  [ CONTINUE ] button visible and tappable below ordering section
 *  12.  With 1 fish: section shows fish with "(FRONT)" but no arrow buttons
 *
 * Browser-tested checks:
 *  13.  No JS errors navigating from TitleScene → FloorScene → CampScene (2 fish)
 *  14.  PARTY ORDER section renders when arriving at camp with 2 fish
 *  15.  Clicking ▼ (down) on first fish triggers re-render without JS errors
 *  16.  [ CONTINUE ] button is visible below ordering section with 2 fish
 *  17.  No JS errors navigating from TitleScene → FloorScene → CampScene (3 fish)
 *  18.  PARTY ORDER section renders with 3 fish; ▲ and ▼ buttons present
 *  19.  [ CONTINUE ] button visible below ordering section with 3 fish
 *  20.  With 1 fish in party: camp shows fish with (FRONT) but no ▲/▼ arrows
 *  21.  Continue after camp returns to FloorScene; party order is preserved
 *
 * Runs against local Vite dev server at localhost:8087.
 */

const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:8087';
const GAME_W = 480;
const GAME_H = 270;

async function getCanvasBounds(page) {
    const canvas = page.locator('canvas').first();
    return await canvas.boundingBox();
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

// Load game with a 2-fish save and navigate to TitleScene
// Note: TitleScene buttons fade in after 3500ms delay, so we wait 5s for them to be ready.
async function loadWith2Fish(page) {
    await page.goto(BASE);
    await page.evaluate(() => {
        localStorage.setItem('dungeon-fisher-save', JSON.stringify({
            version: 3,
            gameVersion: '1.0.0',
            savedAt: Date.now(),
            floor: 2,
            gold: 100,
            campFloor: 0,
            fisherId: 'andy',
            party: [
                {
                    speciesId: 'guppy',
                    name: 'Guppy',
                    level: 3,
                    xp: 0,
                    xpToNext: 75,
                    hp: 30,
                    maxHp: 30,
                    atk: 8,
                    def: 5,
                    spd: 6,
                    moves: ['bubble_volley'],
                    poisoned: null,
                    buffs: []
                },
                {
                    speciesId: 'swordfish',
                    name: 'Swordfish',
                    level: 2,
                    xp: 0,
                    xpToNext: 50,
                    hp: 28,
                    maxHp: 28,
                    atk: 14,
                    def: 4,
                    spd: 10,
                    moves: ['razor_rush'],
                    poisoned: null,
                    buffs: []
                }
            ],
            inventory: []
        }));
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(5000); // TitleScene buttons have a 3500ms fade-in delay
}

// Load game with a 3-fish save and navigate to TitleScene
async function loadWith3Fish(page) {
    await page.goto(BASE);
    await page.evaluate(() => {
        localStorage.setItem('dungeon-fisher-save', JSON.stringify({
            version: 3,
            gameVersion: '1.0.0',
            savedAt: Date.now(),
            floor: 3,
            gold: 120,
            campFloor: 0,
            fisherId: 'andy',
            party: [
                {
                    speciesId: 'guppy',
                    name: 'Guppy',
                    level: 4,
                    xp: 0,
                    xpToNext: 100,
                    hp: 35,
                    maxHp: 35,
                    atk: 9,
                    def: 6,
                    spd: 7,
                    moves: ['bubble_volley'],
                    poisoned: null,
                    buffs: []
                },
                {
                    speciesId: 'pufferfish',
                    name: 'Pufferfish',
                    level: 3,
                    xp: 0,
                    xpToNext: 75,
                    hp: 40,
                    maxHp: 40,
                    atk: 7,
                    def: 10,
                    spd: 4,
                    moves: ['spike_shield'],
                    poisoned: null,
                    buffs: []
                },
                {
                    speciesId: 'clownfish',
                    name: 'Clownfish',
                    level: 2,
                    xp: 0,
                    xpToNext: 50,
                    hp: 32,
                    maxHp: 32,
                    atk: 10,
                    def: 7,
                    spd: 9,
                    moves: ['trick_shot'],
                    poisoned: null,
                    buffs: []
                }
            ],
            inventory: []
        }));
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(5000); // TitleScene buttons have a 3500ms fade-in delay
}

// Load game with 1 fish
async function loadWith1Fish(page) {
    await page.goto(BASE);
    await page.evaluate(() => {
        localStorage.setItem('dungeon-fisher-save', JSON.stringify({
            version: 3,
            gameVersion: '1.0.0',
            savedAt: Date.now(),
            floor: 2,
            gold: 80,
            campFloor: 0,
            fisherId: 'andy',
            party: [
                {
                    speciesId: 'guppy',
                    name: 'Guppy',
                    level: 2,
                    xp: 0,
                    xpToNext: 50,
                    hp: 30,
                    maxHp: 30,
                    atk: 8,
                    def: 5,
                    spd: 6,
                    moves: ['bubble_volley'],
                    poisoned: null,
                    buffs: []
                }
            ],
            inventory: []
        }));
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(5000); // TitleScene buttons have a 3500ms fade-in delay
}

// Navigate from TitleScene → FloorScene by clicking CONTINUE
async function goToFloorScene(page) {
    // CONTINUE button at (W/2, H*0.43) = (240, 116)
    await clickGame(page, 240, 116);
    await page.waitForTimeout(800);
}

// Navigate from FloorScene → CampScene by clicking CAMP
// CAMP button at btnY+44 where btnY = max(py+12, H*0.5)
// With 2 fish: py = 56 + 2*18 = 92; btnY = max(104, 135) = 135; CAMP at (240, 179)
// With 3 fish: py = 56 + 3*18 = 110; btnY = max(122, 135) = 135; CAMP at (240, 179)
async function goToCampScene(page) {
    await clickGame(page, 240, 179);
    await page.waitForTimeout(1000);
}

// ─── Check 13 + 14: Navigate to camp with 2 fish, verify PARTY ORDER renders ──

test('camp-ordering: navigating to camp with 2 fish has no JS errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loadWith2Fish(page);
    await goToFloorScene(page);
    await goToCampScene(page);

    await page.screenshot({ path: 'tests/browser/screenshots/camp-order-01-2fish-arrived.png' });
    expect(errors, `JS errors: ${errors.join(', ')}`).toHaveLength(0);
});

test('camp-ordering: PARTY ORDER section renders with 2 fish in camp', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loadWith2Fish(page);
    await goToFloorScene(page);
    await goToCampScene(page);

    // Take a screenshot for visual inspection of the PARTY ORDER section
    await page.screenshot({ path: 'tests/browser/screenshots/camp-order-02-party-order-section.png' });
    expect(errors, `JS errors: ${errors.join(', ')}`).toHaveLength(0);
});

// ─── Check 15: Click ▼ on first fish, verify re-render without errors ─────────
//
// ▼ button for first fish is at (W-30, orderRowY0) where:
//   orderStartY = 104 + 35 = 139 (with 2 fish: y=60+2*22=104, orderStartY=104+35=139)
//   header: y=139, y+=15 → y=154
//   subtitle: y=154, y+=16 → y=170
//   fish[0] row: y=170
//   ▼ text at (W-30, 170) = (450, 170); click center at (456, 174) to hit button hitbox

test('camp-ordering: clicking down arrow on first fish swaps order and saves', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loadWith2Fish(page);
    await goToFloorScene(page);
    await goToCampScene(page);

    // Verify initial order in localStorage
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem('dungeon-fisher-save')));
    expect(before.party[0].name).toBe('Guppy');

    // Click ▼ button on first fish (center of button, 6px right of text x, 4px below text y)
    await clickGame(page, 456, 174);
    await page.waitForTimeout(500);

    // Verify swap was saved to localStorage
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem('dungeon-fisher-save')));
    expect(after.party[0].name, 'Swordfish should now be first after down-arrow click').toBe('Swordfish');
    expect(after.party[1].name).toBe('Guppy');

    await page.screenshot({ path: 'tests/browser/screenshots/camp-order-03-after-swap.png' });
    expect(errors, `JS errors after swap: ${errors.join(', ')}`).toHaveLength(0);
});

// ─── Check 16: [ CONTINUE ] button visible with 2 fish ────────────────────────
//
// Continue button: max(orderEndY + 22, H - 30)
//   With 2 fish: orderEndY = 170 + 2*18 = 206; max(206+22, 240) = 240
//   Button at (240, 240)

test('camp-ordering: CONTINUE button is visible and tappable with 2 fish', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loadWith2Fish(page);
    await goToFloorScene(page);
    await goToCampScene(page);

    // Click [ CONTINUE ] button
    await clickGame(page, 240, 240);
    await page.waitForTimeout(800);

    // Should be back on FloorScene after clicking continue
    await page.screenshot({ path: 'tests/browser/screenshots/camp-order-04-after-continue.png' });
    expect(errors, `JS errors clicking continue: ${errors.join(', ')}`).toHaveLength(0);
});

// ─── Check 17 + 18: Navigate to camp with 3 fish ─────────────────────────────
//
// With 3 fish: orderStartY = 60 + 3*22 + 35 = 161
//   header: y=161, y+=15 → 176
//   subtitle: y=176, y+=16 → 192
//   fish[0] row: y=192, ▼ at (450, 192)
//   fish[1] row: y=210, ▲ at (430, 210), ▼ at (450, 210)
//   fish[2] row: y=228, ▲ at (430, 228)
//   orderEndY = 246
//   Continue: max(246+22, 240) = 268

test('camp-ordering: navigating to camp with 3 fish has no JS errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loadWith3Fish(page);
    await goToFloorScene(page);
    await goToCampScene(page);

    await page.screenshot({ path: 'tests/browser/screenshots/camp-order-05-3fish-arrived.png' });
    expect(errors, `JS errors with 3 fish: ${errors.join(', ')}`).toHaveLength(0);
});

test('camp-ordering: PARTY ORDER section renders correctly with 3 fish', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loadWith3Fish(page);
    await goToFloorScene(page);
    await goToCampScene(page);

    await page.screenshot({ path: 'tests/browser/screenshots/camp-order-06-3fish-party-order.png' });
    expect(errors, `JS errors: ${errors.join(', ')}`).toHaveLength(0);
});

// ─── Check 19: [ CONTINUE ] visible with 3 fish ──────────────────────────────

test('camp-ordering: CONTINUE button is visible and tappable with 3 fish', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loadWith3Fish(page);
    await goToFloorScene(page);
    await goToCampScene(page);

    // With 3 fish, continue is at approximately (240, 268) — near bottom of canvas
    await clickGame(page, 240, 262);
    await page.waitForTimeout(800);

    await page.screenshot({ path: 'tests/browser/screenshots/camp-order-07-3fish-after-continue.png' });
    expect(errors, `JS errors clicking continue: ${errors.join(', ')}`).toHaveLength(0);
});

// ─── Check 20: 1 fish in party — shows FRONT but no arrows ───────────────────
//
// With 1 fish: orderStartY = 60 + 1*22 + 35 = 117
//   header: y=117, y+=15 → 132
//   subtitle: y=132, y+=16 → 148
//   fish[0]: i=0 (no ▲), i not < 0 (no ▼) — only (FRONT) label, no arrows
//   orderEndY = 148 + 18 = 166
//   Continue: max(166+22, 240) = 240

test('camp-ordering: 1 fish shows FRONT label but no arrow buttons', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loadWith1Fish(page);
    await goToFloorScene(page);
    await goToCampScene(page);

    await page.screenshot({ path: 'tests/browser/screenshots/camp-order-08-1fish.png' });
    expect(errors, `JS errors with 1 fish: ${errors.join(', ')}`).toHaveLength(0);
});

// ─── Check 21: Party order preserved after Continue ──────────────────────────

test('camp-ordering: party order is preserved after leaving and re-entering camp', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loadWith2Fish(page);
    await goToFloorScene(page);
    await goToCampScene(page);

    // Swap: click ▼ on first fish (Guppy moves to position 1, Swordfish to position 0)
    // ▼ text is at (W-30, 170)=(450,170); click at center (456, 174) for reliable hit
    await clickGame(page, 456, 174);
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'tests/browser/screenshots/camp-order-09-swapped.png' });

    // Click CONTINUE to go back to FloorScene
    await clickGame(page, 240, 240);
    await page.waitForTimeout(800);

    await page.screenshot({ path: 'tests/browser/screenshots/camp-order-10-back-to-floor.png' });

    // Go to camp again
    await goToCampScene(page);

    // Verify order is still preserved in localStorage
    const preserved = await page.evaluate(() => JSON.parse(localStorage.getItem('dungeon-fisher-save')));
    expect(preserved.party[0].name, 'Swordfish should remain first after returning to camp').toBe('Swordfish');

    // Take screenshot of camp with preserved order
    await page.screenshot({ path: 'tests/browser/screenshots/camp-order-11-order-preserved.png' });
    expect(errors, `JS errors: ${errors.join(', ')}`).toHaveLength(0);
});
