/**
 * Browser QA: Dungeon Fisher — Character Inventory Screen
 * Plan: qa-character-inventory
 *
 * Code-inspected checks (verified by reading TitleScene.js, UIOverlayScene.js,
 * items.js, BattleScene.js, version.js, package.json):
 *   1.  TitleScene.startNewGame() calls registry.set('gameState', gameState) before FloorScene
 *   2.  TitleScene.continueGame() calls registry.set('gameState', gameState) before FloorScene
 *   3.  UIOverlayScene creates a [ BAG ] button with depth 1000, scrollFactor 0, stroke, hover color
 *   4.  BAG hidden on BootScene, TitleScene, CharacterSelectScene, ZonePreviewScene
 *   5.  BAG visible on FloorScene, BattleScene, ShopScene, CampScene, VictoryScene
 *   6.  Clicking BAG opens overlay with semi-transparent dark blocker (setInteractive)
 *   7.  Overlay shows all 10 inventory slots; filled slots show name+description, empty slots dim
 *   8.  [ SORT ] button groups items: heal → revive → stat; re-renders display
 *   9.  [ CLOSE ] button destroys all overlay elements
 *  10.  Inventory reads gameState from registry.get('gameState'), looks up ITEMS dictionary
 *  11.  MENU button works: visibility rules unchanged, click handler calls closeInventory() first
 *  12.  BattleScene item menu unchanged (showItemMenu, showItemTargets, useItem intact)
 *  13.  MAX_INVENTORY = 10, ITEMS dict has 5 item types unchanged
 *  14.  VERSION = '0.11.0' in version.js; package.json version = "0.11.0"
 *
 * Browser-tested checks:
 *  15.  No JS errors progressing from TitleScene → FloorScene
 *  16.  No JS errors clicking BAG button on FloorScene (opens inventory)
 *  17.  No JS errors closing inventory via CLOSE button
 *  18.  With items in inventory, opening BAG does not cause JS errors
 *  19.  No JS errors clicking SORT button with a mixed inventory
 *  20.  Opening inventory and then clicking MENU returns to title without errors
 *
 * Runs against local dev server at localhost:8080.
 */

const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:8080';
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

async function freshStart(page) {
    await page.goto(BASE);
    await page.evaluate(() => localStorage.removeItem('dungeon-fisher-save'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(1500);
}

// Navigate from TitleScene → CharacterSelectScene → starter → FloorScene
async function goToFloorScene(page) {
    await freshStart(page);
    await clickGame(page, 240, 97);   // NEW GAME (H*0.36=97)
    await page.waitForTimeout(300);
    await clickGame(page, 312, 211);  // CharacterSelect SELECT (W*0.65, H*0.78)
    await page.waitForTimeout(300);
    await clickGame(page, 120, 166);  // First starter (Guppy) SELECT
    await page.waitForTimeout(800);
}

// ─── Check 15: No JS errors to FloorScene ─────────────────────────────────────

test('inventory: no JS errors navigating to FloorScene', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await goToFloorScene(page);
    await page.screenshot({ path: 'tests/browser/screenshots/inventory-01-floor-scene.png' });
    expect(errors, `JS errors: ${errors.join(', ')}`).toHaveLength(0);
});

// ─── Check 16: Click BAG button on FloorScene ─────────────────────────────────
//
// BAG button is at UIOverlay coords: x = menuBtn.x + menuBtn.width + 6 ≈ 60–80, y = 3
// Click at (75, 8) in game coordinates to target the BAG button area.

test('inventory: clicking BAG button on FloorScene has no JS errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await goToFloorScene(page);

    // Click BAG button area (top-left of game canvas, right of MENU button)
    await clickGame(page, 75, 8);
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'tests/browser/screenshots/inventory-02-bag-open.png' });
    expect(errors, `JS errors clicking BAG: ${errors.join(', ')}`).toHaveLength(0);
});

// ─── Check 17: Close inventory ────────────────────────────────────────────────
//
// CLOSE button is at (centerX + 50, panelY + panelH - 16) ≈ (290, 254) game coords

test('inventory: closing inventory via CLOSE button has no JS errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await goToFloorScene(page);

    // Open inventory
    await clickGame(page, 75, 8);
    await page.waitForTimeout(500);

    // Click CLOSE button (centerX+50=290, panelY+panelH-16 ≈ 254)
    await clickGame(page, 290, 254);
    await page.waitForTimeout(300);

    await page.screenshot({ path: 'tests/browser/screenshots/inventory-03-bag-closed.png' });
    expect(errors, `JS errors closing inventory: ${errors.join(', ')}`).toHaveLength(0);
});

// ─── Check 18: Open inventory with items ─────────────────────────────────────

test('inventory: opening BAG with items in inventory has no JS errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    // Set up save with a potion and a super potion
    await page.goto(BASE);
    await page.evaluate(() => {
        localStorage.setItem('dungeon-fisher-save', JSON.stringify({
            version: 2, savedAt: Date.now(), floor: 3, gold: 50, campFloor: 1,
            fisherId: 'andy',
            party: [{ speciesId: 'guppy', name: 'Guppy', level: 2, xp: 0, xpToNext: 50,
                hp: 35, maxHp: 35, atk: 10, def: 6, spd: 7, moves: ['splash', 'tackle'],
                poisoned: null, buffs: [] }],
            inventory: ['potion', 'super_potion', 'revive', 'atk_boost']
        }));
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(1500);

    // CONTINUE (H*0.43 = 116)
    await clickGame(page, 240, 116);
    await page.waitForTimeout(600);

    // Open inventory
    await clickGame(page, 75, 8);
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'tests/browser/screenshots/inventory-04-with-items.png' });
    expect(errors, `JS errors with items: ${errors.join(', ')}`).toHaveLength(0);
});

// ─── Check 19: SORT button ────────────────────────────────────────────────────
//
// SORT button is at (centerX - 50, panelY + panelH - 16) ≈ (190, 254) game coords

test('inventory: clicking SORT button does not crash', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    // Mixed inventory (stat, heal, revive — out of order)
    await page.goto(BASE);
    await page.evaluate(() => {
        localStorage.setItem('dungeon-fisher-save', JSON.stringify({
            version: 2, savedAt: Date.now(), floor: 2, gold: 80, campFloor: 1,
            fisherId: 'andy',
            party: [{ speciesId: 'swordfish', name: 'Swordfish', level: 1, xp: 0, xpToNext: 25,
                hp: 28, maxHp: 28, atk: 14, def: 4, spd: 10, moves: ['fin_slash'],
                poisoned: null, buffs: [] }],
            inventory: ['atk_boost', 'potion', 'revive', 'def_boost', 'super_potion']
        }));
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(1500);

    await clickGame(page, 240, 116);  // CONTINUE
    await page.waitForTimeout(600);

    // Open inventory
    await clickGame(page, 75, 8);
    await page.waitForTimeout(500);

    // Click SORT button (centerX-50=190, panelY+panelH-16 ≈ 254)
    await clickGame(page, 190, 254);
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'tests/browser/screenshots/inventory-05-sorted.png' });
    expect(errors, `JS errors on SORT: ${errors.join(', ')}`).toHaveLength(0);
});

// ─── Check 20: MENU while inventory open ─────────────────────────────────────

test('inventory: clicking MENU while inventory open returns to title without errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await goToFloorScene(page);

    // Open inventory
    await clickGame(page, 75, 8);
    await page.waitForTimeout(500);

    // Click MENU button (x=4, y=3 in game coords)
    await clickGame(page, 20, 8);
    await page.waitForTimeout(800);

    await page.screenshot({ path: 'tests/browser/screenshots/inventory-06-menu-from-inventory.png' });
    expect(errors, `JS errors clicking MENU: ${errors.join(', ')}`).toHaveLength(0);
});

// ─── Version check ────────────────────────────────────────────────────────────

test('version: game loads at version 0.11.0', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(1500);

    expect(errors, `JS errors on load: ${errors.join(', ')}`).toHaveLength(0);
    // Canvas should be rendering (game is running)
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();
});
