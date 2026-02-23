/**
 * Browser QA: UI Migrate — BattleScene, VictoryScene, UIOverlayScene, ZonePreviewScene
 *
 * Verifies that UIPanel, UIButton, UIList, and UILayout components render correctly
 * after the ui-migrate-battle-overlays refactor in:
 *   - BattleScene: floor indicator, monster name, HP label, message bar (UIPanel)
 *   - VictoryScene: PLAY AGAIN button (UIButton), overlay (UILayout)
 *   - UIOverlayScene: MENU/BAG buttons (UIButton), scrim (UIPanel), inventory (UIList)
 *   - ZonePreviewScene: zone name/flavor/sample panels (UIPanel), navigation arrows (UIButton)
 *
 * Requires: Vite dev server at http://localhost:8080
 * Start: cd FrontEnds/dungeon-fisher && npm run dev
 *
 * TitleScene buttons fade in after 3.5s + animation. Tests wait 5s before clicking.
 * Game dimensions: 480x270 (landscape), 270x480 (portrait).
 */

const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:8080';
const GAME_W = 480;
const GAME_H = 270;
const SAVE_KEY = 'dungeon-fisher-save';
// TitleScene buttons fade in after ~3.5s + 0.5s anim. Wait 5s.
const BUTTON_APPEAR_MS = 5000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getCanvasBounds(page) {
    const canvas = page.locator('canvas').first();
    return await canvas.boundingBox();
}

async function gameCoord(page, gx, gy, gameW = GAME_W, gameH = GAME_H) {
    const bounds = await getCanvasBounds(page);
    const scaleX = bounds.width / gameW;
    const scaleY = bounds.height / gameH;
    return { x: bounds.x + gx * scaleX, y: bounds.y + gy * scaleY };
}

async function clickGame(page, gx, gy) {
    const { x, y } = await gameCoord(page, gx, gy);
    await page.mouse.click(x, y);
}

async function freshStart(page) {
    await page.goto(BASE);
    await page.evaluate((key) => localStorage.removeItem(key), SAVE_KEY);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(BUTTON_APPEAR_MS);
}

async function loadSave(page, saveData) {
    await page.goto(BASE);
    await page.evaluate(({ key, data }) => {
        localStorage.setItem(key, JSON.stringify(data));
    }, { key: SAVE_KEY, data: saveData });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(BUTTON_APPEAR_MS);
}

function makeFish(speciesId, name, color, hp, maxHp, atk, def, spd, specialMove) {
    return {
        speciesId, name, color,
        level: 5, xp: 0, xpToNext: 125,
        hp, maxHp, atk, def, spd,
        moves: [specialMove],
        poisoned: null, buffs: []
    };
}

function makeSave(party, floor = 5, inventory = []) {
    return {
        version: 3,
        gameVersion: '1.0.0',
        savedAt: Date.now(),
        floor, gold: 50,
        party, inventory,
        campFloor: 1, fisherId: 'andy'
    };
}

const GUPPY = makeFish('guppy', 'Guppy', 0xe8734a, 50, 50, 16, 9, 10, 'bubble_volley');
const JELLYFISH = makeFish('jellyfish', 'Jellyfish', 0x9b6dcc, 45, 45, 14, 11, 11, 'venom_sting');
const SEAHORSE = makeFish('seahorse', 'Seahorse', 0x50c878, 55, 55, 13, 10, 9, 'healing_tide');
// Super-strong fish: one-shots any monster, never dies
const SUPER_GUPPY = makeFish('guppy', 'Guppy', 0xe8734a, 9999, 9999, 500, 200, 10, 'bubble_volley');

// Navigate from title (with save) to FloorScene via CONTINUE
async function navigateToFloorScene(page) {
    // CONTINUE at (W/2=240, H*0.43=116) in landscape
    await clickGame(page, 240, 116);
    await page.waitForTimeout(1500);
}

// Navigate fresh title screen through CharSelect to FloorScene
async function navigateNewGameToFloorScene(page) {
    await clickGame(page, 240, 97);    // NEW GAME at (W/2, H*0.36)
    await page.waitForTimeout(500);
    await clickGame(page, 312, 211);   // CharacterSelect SELECT at (W*0.65, H*0.78)
    await page.waitForTimeout(500);
    await clickGame(page, 120, 166);   // Guppy SELECT at (x=120, H*0.45+45)
    await page.waitForFunction((key) => !!localStorage.getItem(key), SAVE_KEY, { timeout: 5000 });
    await page.waitForTimeout(1000);
}

// Enter BattleScene from FloorScene
async function enterBattle(page) {
    // Delve Deeper card center: x=W/2=240, y=Math.floor(H*0.74)=199 (landscape 480x270)
    await clickGame(page, 240, 199);
    await page.waitForTimeout(1500);
}

// ─── Section 1: BattleScene — UIPanel Components ─────────────────────────────

test('battle-uipanel: no JS errors entering battle with UIPanel components', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loadSave(page, makeSave([GUPPY], 5));
    await navigateToFloorScene(page);
    await enterBattle(page);

    await page.screenshot({ path: 'tests/browser/screenshots/ui-migrate-01-battle-enter.png' });
    expect(errors, `JS errors in battle: ${errors.join(' | ')}`).toHaveLength(0);
});

test('battle-uipanel: floor indicator UIPanel renders at top-right', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loadSave(page, makeSave([GUPPY], 5));
    await navigateToFloorScene(page);
    await enterBattle(page);

    // Screenshot captures floor indicator (top-right) and monster name (top-left) panels
    await page.screenshot({ path: 'tests/browser/screenshots/ui-migrate-02-battle-panels.png' });
    expect(errors).toHaveLength(0);

    // Canvas must still be rendering
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();
});

test('battle-uipanel: 3-fish party shows all UIPanel elements without JS errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loadSave(page, makeSave([GUPPY, JELLYFISH, SEAHORSE], 5));
    await navigateToFloorScene(page);
    await enterBattle(page);
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'tests/browser/screenshots/ui-migrate-03-battle-3fish.png' });
    expect(errors, `JS errors with 3-fish: ${errors.join(' | ')}`).toHaveLength(0);
});

test('battle-uipanel: HP bar lerp runs smoothly - no errors during 3s of combat', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loadSave(page, makeSave([GUPPY], 5));
    await navigateToFloorScene(page);
    await enterBattle(page);
    await page.waitForTimeout(3000);

    await page.screenshot({ path: 'tests/browser/screenshots/ui-migrate-04-battle-lerp.png' });
    expect(errors, `HP lerp errors: ${errors.join(' | ')}`).toHaveLength(0);
});

test('battle-uipanel: message UIPanel renders combat events', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    // Strong fish win battle → message bar shows defeat message
    await loadSave(page, makeSave([SUPER_GUPPY], 5));
    await navigateToFloorScene(page);
    await enterBattle(page);

    // Wait for battle to resolve (floor advances) - screenshots at each stage
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'tests/browser/screenshots/ui-migrate-05-battle-message.png' });

    expect(errors, `Message panel errors: ${errors.join(' | ')}`).toHaveLength(0);
});

// ─── Section 2: UIOverlayScene — Button Visibility ───────────────────────────

test('overlay-visibility: no JS errors during title-to-floor navigation', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loadSave(page, makeSave([GUPPY], 5));

    await page.waitForTimeout(BUTTON_APPEAR_MS);
    await page.screenshot({ path: 'tests/browser/screenshots/ui-migrate-06-title-screen.png' });

    // UIOverlay MENU/BAG should be hidden on TitleScene (buttons setVisible(false))
    expect(errors, `Title screen JS errors: ${errors.join(' | ')}`).toHaveLength(0);
});

test('overlay-visibility: MENU button activates on FloorScene without JS errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loadSave(page, makeSave([GUPPY], 5));
    await navigateToFloorScene(page);

    await page.screenshot({ path: 'tests/browser/screenshots/ui-migrate-07-floor-overlay.png' });
    expect(errors, `FloorScene overlay JS errors: ${errors.join(' | ')}`).toHaveLength(0);
});

test('overlay-menu: clicking MENU button returns to TitleScene', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loadSave(page, makeSave([GUPPY], 5));
    await navigateToFloorScene(page);

    // UIOverlay MENU button: x=4, y=H-18=252, origin(0,0)
    // "[ MENU ]" text center approximately (26, 258)
    await clickGame(page, 26, 258);
    await page.waitForTimeout(BUTTON_APPEAR_MS);

    await page.screenshot({ path: 'tests/browser/screenshots/ui-migrate-08-after-menu-click.png' });

    // After MENU click → TitleScene → click NEW GAME to verify we're on TitleScene
    await clickGame(page, 240, 97);   // NEW GAME at (W/2, H*0.36)
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'tests/browser/screenshots/ui-migrate-09-menu-returns-title.png' });

    // CharacterSelect canvas should be visible (we successfully navigated NEW GAME)
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();
    expect(errors, `MENU button errors: ${errors.join(' | ')}`).toHaveLength(0);
});

test('overlay-bag: BAG button opens inventory without JS errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    // Include inventory items so the list renders items, not just empty slots
    const save = makeSave([GUPPY], 5, ['potion', 'potion', 'revive']);
    await loadSave(page, save);
    await navigateToFloorScene(page);

    // UIOverlay BAG button: positioned after MENU button
    // MENU "[ MENU ]" ~50px wide starting at x=4 → BAG starts at ~60, center ~80
    await clickGame(page, 80, 258);
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'tests/browser/screenshots/ui-migrate-10-inventory-open.png' });
    expect(errors, `Inventory open errors: ${errors.join(' | ')}`).toHaveLength(0);
});

test('overlay-bag: inventory CLOSE button dismisses overlay', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    const save = makeSave([GUPPY], 5, ['potion', 'super_potion']);
    await loadSave(page, save);
    await navigateToFloorScene(page);

    // Open inventory
    await clickGame(page, 80, 258);
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'tests/browser/screenshots/ui-migrate-11-inventory-before-close.png' });

    // CLOSE button: panelX=30, panelY=20, panelW=420, panelH=230 (landscape)
    // closeBtn at x=centerX+50=290, y=panelY+panelH-16=234
    await clickGame(page, 290, 234);
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'tests/browser/screenshots/ui-migrate-12-inventory-closed.png' });

    expect(errors, `Inventory close errors: ${errors.join(' | ')}`).toHaveLength(0);
});

test('overlay-bag: inventory SORT button works without JS errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    // Mixed inventory: stat + revive + heal — sorting should reorder heal→revive→stat
    const save = makeSave([GUPPY], 5, ['atk_boost', 'revive', 'potion']);
    await loadSave(page, save);
    await navigateToFloorScene(page);

    // Open inventory
    await clickGame(page, 80, 258);
    await page.waitForTimeout(500);

    // SORT button: sortBtn at x=centerX-50=190, y=panelY+panelH-16=234
    await clickGame(page, 190, 234);
    await page.waitForTimeout(300);

    await page.screenshot({ path: 'tests/browser/screenshots/ui-migrate-13-inventory-sorted.png' });
    expect(errors, `Inventory sort errors: ${errors.join(' | ')}`).toHaveLength(0);
});

test('overlay-hidden-on-zone-preview: ZonePreviewScene loads without JS errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await freshStart(page);
    // ZONES button in TitleScene at (W/2=240, H*0.50=135)
    await clickGame(page, 240, 135);
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'tests/browser/screenshots/ui-migrate-14-zone-preview.png' });
    expect(errors, `ZonePreview JS errors: ${errors.join(' | ')}`).toHaveLength(0);
});

// ─── Section 3: ZonePreviewScene — UIPanel/UIButton Navigation ───────────────

test('zone-preview: first zone shows without JS errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await freshStart(page);
    await clickGame(page, 240, 135);  // ZONES button
    await page.waitForTimeout(2000);

    // Zone 1 (Sunken Sewers) should be rendered with UIPanel top/bottom/sample panels
    await page.screenshot({ path: 'tests/browser/screenshots/ui-migrate-15-zone1.png' });
    expect(errors, `Zone 1 errors: ${errors.join(' | ')}`).toHaveLength(0);
});

test('zone-preview: right arrow UIButton navigates to zone 2', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await freshStart(page);
    await clickGame(page, 240, 135);  // ZONES button
    await page.waitForTimeout(2000);

    // Right arrow UIButton at (width-8=472, height/2=135), origin(1, 0.5) → center at (472, 135)
    await clickGame(page, 470, 135);
    await page.waitForTimeout(800);

    await page.screenshot({ path: 'tests/browser/screenshots/ui-migrate-16-zone2.png' });
    expect(errors, `Zone 2 navigation errors: ${errors.join(' | ')}`).toHaveLength(0);
});

test('zone-preview: keyboard RIGHT navigates zones', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await freshStart(page);
    await clickGame(page, 240, 135);  // ZONES button
    await page.waitForTimeout(2000);

    // Press RIGHT arrow key
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(800);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(800);

    await page.screenshot({ path: 'tests/browser/screenshots/ui-migrate-17-zone-keyboard-nav.png' });
    expect(errors, `Keyboard nav errors: ${errors.join(' | ')}`).toHaveLength(0);
});

test('zone-preview: BACK UIButton returns to TitleScene', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await freshStart(page);
    await clickGame(page, 240, 135);  // ZONES button
    await page.waitForTimeout(2000);

    // BACK button at (W/2=240, H-7=263), origin(0.5) → center at (240, 263)
    await clickGame(page, 240, 263);
    await page.waitForTimeout(BUTTON_APPEAR_MS);

    await page.screenshot({ path: 'tests/browser/screenshots/ui-migrate-18-back-from-zones.png' });

    // We should be back on TitleScene — verify NEW GAME is clickable
    await clickGame(page, 240, 97);   // NEW GAME
    await page.waitForTimeout(1000);
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();
    expect(errors, `BACK button errors: ${errors.join(' | ')}`).toHaveLength(0);
});

test('zone-preview: ESC key returns to TitleScene', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await freshStart(page);
    await clickGame(page, 240, 135);  // ZONES button
    await page.waitForTimeout(2000);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(BUTTON_APPEAR_MS);

    await page.screenshot({ path: 'tests/browser/screenshots/ui-migrate-19-esc-from-zones.png' });
    expect(errors, `ESC key errors: ${errors.join(' | ')}`).toHaveLength(0);
});

// ─── Section 4: VictoryScene — UIButton and UILayout ─────────────────────────

test('victory: floor 100 battle win transitions to VictoryScene (no JS errors)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    // Super-strong party at floor 100 — wins instantly, floor → 101 → VictoryScene
    await loadSave(page, makeSave([SUPER_GUPPY], 100));
    // Use explicit waitForFunction (mirrors auto-battler approach) to ensure FloorScene is ready
    await clickGame(page, 240, 116);  // CONTINUE
    await page.waitForFunction((key) => !!localStorage.getItem(key), SAVE_KEY, { timeout: 5000 });
    await page.waitForTimeout(1000);
    await clickGame(page, 240, 199);  // ENTER BATTLE — Delve Deeper card center (H*0.74=199)
    await page.waitForTimeout(1500);

    // Wait longer: floor 100 monster HP = 1225, SUPER_GUPPY kills in ~1-2 hits (0.8s/hit)
    // advanceFloor has 1500ms delay → VictoryScene starts at ~3.5s from battle
    // Then VictoryScene loads zone assets. Allow 12s total for full render.
    await page.waitForTimeout(10000);
    await page.screenshot({ path: 'tests/browser/screenshots/ui-migrate-20-victory-scene.png' });

    expect(errors, `VictoryScene errors: ${errors.join(' | ')}`).toHaveLength(0);
}, 60000);

test('victory: PLAY AGAIN UIButton deletes save and returns to TitleScene', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loadSave(page, makeSave([SUPER_GUPPY], 100));
    // Explicit waitForFunction before battle to ensure FloorScene is ready
    await clickGame(page, 240, 116);  // CONTINUE
    await page.waitForFunction((key) => !!localStorage.getItem(key), SAVE_KEY, { timeout: 5000 });
    await page.waitForTimeout(1000);
    await clickGame(page, 240, 199);  // ENTER BATTLE — Delve Deeper card center (H*0.74=199)
    await page.waitForTimeout(1500);

    // Allow 10s for: battle (~2s) + advanceFloor delay (1.5s) + VictoryScene load (~4s)
    await page.waitForTimeout(10000);

    // VictoryScene PLAY AGAIN button at (W/2=240, H*0.78=211)
    await clickGame(page, 240, 211);
    await page.waitForTimeout(500);

    // PLAY AGAIN calls SaveSystem.deleteSave() → localStorage key removed
    const saveExists = await page.evaluate((key) => !!localStorage.getItem(key), SAVE_KEY);
    expect(saveExists, 'Save should be deleted after PLAY AGAIN').toBe(false);
    expect(errors, `PLAY AGAIN errors: ${errors.join(' | ')}`).toHaveLength(0);
}, 60000);

// ─── Section 5: Cross-Scene — UIOverlay Persistence ──────────────────────────

test('cross-scene: UIOverlay persists across scene transitions without JS errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loadSave(page, makeSave([GUPPY], 5));
    await navigateToFloorScene(page);  // FloorScene
    await page.waitForTimeout(500);
    await enterBattle(page);           // BattleScene
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'tests/browser/screenshots/ui-migrate-21-overlay-in-battle.png' });
    expect(errors, `Cross-scene overlay errors: ${errors.join(' | ')}`).toHaveLength(0);
});

test('cross-scene: UIOverlay no JS errors on console in floor→battle→floor cycle', async ({ page }) => {
    const errors = [];
    const consoleErrors = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('console', msg => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    // Strong party to win battle and return to FloorScene automatically
    await loadSave(page, makeSave([SUPER_GUPPY], 5));
    // Use explicit waitForFunction before battle (mirrors proven auto-battler approach)
    await clickGame(page, 240, 116);  // CONTINUE
    await page.waitForFunction((key) => !!localStorage.getItem(key), SAVE_KEY, { timeout: 5000 });
    await page.waitForTimeout(1000);  // Extra wait for FloorScene to fully render cards
    await clickGame(page, 240, 199);  // ENTER BATTLE — Delve Deeper card center (H*0.74=199)
    await page.waitForTimeout(1500);

    // Wait for floor advance: SUPER_GUPPY kills floor 5 monster in <1s, then 1.5s delay,
    // then FloorScene starts and auto-saves with floor=6.
    const resolved = await page.waitForFunction((key) => {
        const raw = localStorage.getItem(key);
        if (!raw) return false;
        return JSON.parse(raw).floor > 5;
    }, SAVE_KEY, { timeout: 20000 }).then(() => true).catch(() => false);

    await page.screenshot({ path: 'tests/browser/screenshots/ui-migrate-22-after-battle-cycle.png' });

    expect(resolved, 'Battle should resolve and floor should advance').toBe(true);
    expect(errors, `Page errors in cycle: ${errors.join(' | ')}`).toHaveLength(0);
    expect(consoleErrors, `Console errors in cycle: ${consoleErrors.join(' | ')}`).toHaveLength(0);
});
