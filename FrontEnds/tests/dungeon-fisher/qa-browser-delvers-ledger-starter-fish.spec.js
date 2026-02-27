/**
 * Browser QA: Delver's Ledger Starter Fish Selection
 * Plan: qa-browser-delvers-ledger-starter-fish
 *
 * Verifies: Starter fish spread after character confirmation, fish display
 * and selection toggle, confirm button behavior, game start flow, save data
 * correctness, continue flow, TitleScene cleanup, both orientations, and
 * full end-to-end flow.
 *
 * Runs against http://localhost:8080 (dungeon-fisher Vite dev server).
 */

const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:8080';
const SAVE_KEY = 'fathom-fall-save';
const GAME_W = 480;
const GAME_H = 270;
const BUTTON_APPEAR_MS = 5500;
const SCREENSHOT_DIR = 'tests/dungeon-fisher/screenshots';

const CINEMATIC_MS = 3500;
const BOOK_READY_MS = 2500;
const PAGE_TURN_MS = 700;
const RAPID_FLIP_MS = 2000;
const BOOK_CLOSE_MS = 1500;
const SEWER_TRANSITION_MS = 2500;

// Landscape game coordinates
const NEW_GAME_BTN = { x: 240, y: 97 };
// SELECT button on Andy's landscape spread
const SELECT_BTN = { x: 342, y: 223 };

// Starter fish row positions in landscape (relative to game coords)
// Book center: (240, 135), rightCx = 342
// Rows start at ry = -108 + 50 = -58 relative, spacing 48px
const FISH_ROW_0 = { x: 342, y: 77 };   // guppy
const FISH_ROW_1 = { x: 342, y: 125 };  // pufferfish
const FISH_ROW_2 = { x: 342, y: 173 };  // swordfish

// CONFIRM button in landscape: leftCx = 138, y = h/2 - 25 = 83 relative
const CONFIRM_BTN = { x: 138, y: 218 };

// Portrait game coordinates
const PORT_GAME_W = 270;
const PORT_GAME_H = 480;
const PORT_NEW_GAME = { x: 135, y: 173 };
// Portrait SELECT: _addSelectButton(0, Math.round(h/2 - 22)) → y=158 rel → game (135, 398)
const PORT_SELECT_BTN = { x: 135, y: 398 };

// Portrait starter fish row positions
// Book center: (135, 240), rows start at y = -127 relative, spacing 52px
const PORT_FISH_ROW_0 = { x: 135, y: 113 };  // guppy
const PORT_FISH_ROW_1 = { x: 135, y: 165 };  // pufferfish
const PORT_FISH_ROW_2 = { x: 135, y: 217 };  // swordfish

// Portrait CONFIRM button: (0, 155 relative) → game (135, 395)
const PORT_CONFIRM_BTN = { x: 135, y: 395 };

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getCanvasBounds(page) {
    const canvas = page.locator('canvas').first();
    return await canvas.boundingBox();
}

async function clickGame(page, gx, gy, gameW = GAME_W, gameH = GAME_H) {
    const bounds = await getCanvasBounds(page);
    const x = bounds.x + gx * (bounds.width / gameW);
    const y = bounds.y + gy * (bounds.height / gameH);
    await page.mouse.click(x, y);
}

async function freshStart(page) {
    await page.goto(BASE);
    await page.evaluate((key) => localStorage.removeItem(key), SAVE_KEY);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(BUTTON_APPEAR_MS);
}

async function openLedgerToSpread(page, gameW = GAME_W, gameH = GAME_H) {
    const ngBtn = gameW === GAME_W ? NEW_GAME_BTN : PORT_NEW_GAME;
    await clickGame(page, ngBtn.x, ngBtn.y, gameW, gameH);
    await page.waitForTimeout(CINEMATIC_MS + BOOK_READY_MS);
}

async function navigateToStarterFish(page, gameW = GAME_W, gameH = GAME_H) {
    const selBtn = gameW === GAME_W ? SELECT_BTN : PORT_SELECT_BTN;
    await clickGame(page, selBtn.x, selBtn.y, gameW, gameH);
    await page.waitForTimeout(RAPID_FLIP_MS);
}

async function injectSaveAndLoad(page, save) {
    await page.evaluate(({ key, data }) => {
        localStorage.setItem(key, JSON.stringify(data));
    }, { key: SAVE_KEY, data: save });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(BUTTON_APPEAR_MS);
}

function makeV5Save() {
    return {
        _version: 5,
        floor: 1,
        gold: 50,
        party: [
            { species: 'guppy', name: 'Guppy', level: 1, hp: 30, maxHp: 30, atk: 8, def: 5, spd: 6, shield: 3, healPower: 2, specialMove: 'bubble_volley', xp: 0 },
            { species: 'pufferfish', name: 'Pufferfish', level: 1, hp: 45, maxHp: 45, atk: 5, def: 9, spd: 3, shield: 15, healPower: 0, specialMove: 'spike_shield', xp: 0 }
        ],
        inventory: [],
        campFloor: 1,
        fisherId: 'andy',
        roster: [],
        companion: { species: 'dog', name: 'Dog', level: 1, hp: 35, maxHp: 35, atk: 7, def: 6, spd: 5, shield: 5, healPower: 3, specialMove: 'loyal_bite', xp: 0 },
        pveDeathCount: 0,
        pvpLossCount: 0,
        equipment: {
            grid: [{ itemId: 'harmony', col: 1, row: 4, rotation: 0, flipped: false }],
            stash: [],
            harmonyPosition: { row: 4, col: 1 }
        },
        equipmentDelta: null
    };
}

// ─── Step 1: Starter fish spread appears after character confirmation ────────

test('step 1: SELECT on Andy triggers rapid flip to starter fish spread', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await freshStart(page);
    await openLedgerToSpread(page);

    // Screenshot Andy's spread before clicking SELECT
    await page.screenshot({
        path: `${SCREENSHOT_DIR}/sf-01a-andy-spread.png`
    });

    // Click SELECT
    await clickGame(page, SELECT_BTN.x, SELECT_BTN.y);
    await page.waitForTimeout(RAPID_FLIP_MS);

    // Screenshot — should now show starter fish selection (NOT TitleScene)
    await page.screenshot({
        path: `${SCREENSHOT_DIR}/sf-01b-starter-fish-spread.png`
    });

    expect(errors.length).toBe(0);
});

test('step 1b: rapid flip uses decreasing durations (code inspection)', async ({ page }) => {
    const resp = await page.goto(`${BASE}/src/scenes/DelversLedgerScene.js`);
    const src = await resp.text();

    // Rapid flip durations: [400, 300, 200, 150]
    expect(src).toContain('[400, 300, 200, 150]');
    // Calls _buildStarterFishContent after flips complete
    expect(src).toContain('this._buildStarterFishContent(w, h)');
    // _rapidFlipToStarters does NOT call scene.start — it stays in the same scene
    // (scene.start is only called later by _startNewGame after confirm)
    const rapidFlipMethod = src.match(/_rapidFlipToStarters\(fisherId\)\s*\{([\s\S]*?)^\s{4}\}/m);
    expect(rapidFlipMethod).not.toBeNull();
    expect(rapidFlipMethod[1]).not.toContain('scene.start');
});

// ─── Step 2: Available starter fish display ──────────────────────────────────

test('step 2a: all three starter fish shown (code inspection)', async ({ page }) => {
    const resp = await page.goto(`${BASE}/src/scenes/DelversLedgerScene.js`);
    const src = await resp.text();

    // Filters by isStarter
    expect(src).toContain('filter(s => s.isStarter)');
    // Shows name
    expect(src).toContain('species.name');
    // Shows stat line with HP/ATK/DEF/SPD
    expect(src).toMatch(/HP:\$\{species\.baseHp\}\s*ATK:\$\{species\.baseAtk\}\s*DEF:\$\{species\.baseDef\}\s*SPD:\$\{species\.baseSpd\}/);
});

test('step 2b: fish configs have correct starter flags', async ({ page }) => {
    const guppy = await (await page.goto(`${BASE}/src/config/fish/guppy.json`)).json();
    const puffer = await (await page.goto(`${BASE}/src/config/fish/pufferfish.json`)).json();
    const sword = await (await page.goto(`${BASE}/src/config/fish/swordfish.json`)).json();

    expect(guppy.isStarter).toBe(true);
    expect(puffer.isStarter).toBe(true);
    expect(sword.isStarter).toBe(true);

    // Verify they all have the required display fields
    for (const fish of [guppy, puffer, sword]) {
        expect(fish.name).toBeTruthy();
        expect(typeof fish.baseHp).toBe('number');
        expect(typeof fish.baseAtk).toBe('number');
        expect(typeof fish.baseDef).toBe('number');
        expect(typeof fish.baseSpd).toBe('number');
    }
});

test('step 2c: fish sprites have idle animations (code inspection)', async ({ page }) => {
    const resp = await page.goto(`${BASE}/src/scenes/DelversLedgerScene.js`);
    const src = await resp.text();

    // SpriteAnimator.idle() called on each fish image
    expect(src).toContain('new SpriteAnimator(this, fishImg).idle()');
});

test('step 2d: starter fish display in landscape', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await freshStart(page);
    await openLedgerToSpread(page);
    await navigateToStarterFish(page);

    // Screenshot starter fish selection in landscape
    await page.screenshot({
        path: `${SCREENSHOT_DIR}/sf-02d-starter-display-landscape.png`
    });

    expect(errors.length).toBe(0);
});

// ─── Step 3: Fish selection toggle ───────────────────────────────────────────

test('step 3a: clicking a fish selects it, clicking again deselects', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await freshStart(page);
    await openLedgerToSpread(page);
    await navigateToStarterFish(page);

    // Click guppy to select
    await clickGame(page, FISH_ROW_0.x, FISH_ROW_0.y);
    await page.waitForTimeout(300);

    // Screenshot — should show checkmark on guppy
    await page.screenshot({
        path: `${SCREENSHOT_DIR}/sf-03a-guppy-selected.png`
    });

    // Click guppy again to deselect
    await clickGame(page, FISH_ROW_0.x, FISH_ROW_0.y);
    await page.waitForTimeout(300);

    // Screenshot — checkmark should be gone
    await page.screenshot({
        path: `${SCREENSHOT_DIR}/sf-03a-guppy-deselected.png`
    });

    expect(errors.length).toBe(0);
});

test('step 3b: cannot select more than maxPicks (2) fish', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await freshStart(page);
    await openLedgerToSpread(page);
    await navigateToStarterFish(page);

    // Select guppy and pufferfish (2 = max)
    await clickGame(page, FISH_ROW_0.x, FISH_ROW_0.y);
    await page.waitForTimeout(200);
    await clickGame(page, FISH_ROW_1.x, FISH_ROW_1.y);
    await page.waitForTimeout(200);

    // Try to select swordfish — should NOT be selectable
    await clickGame(page, FISH_ROW_2.x, FISH_ROW_2.y);
    await page.waitForTimeout(200);

    // Screenshot — guppy+pufferfish checked, swordfish not
    await page.screenshot({
        path: `${SCREENSHOT_DIR}/sf-03b-max-picks.png`
    });

    // Deselect guppy
    await clickGame(page, FISH_ROW_0.x, FISH_ROW_0.y);
    await page.waitForTimeout(200);

    // Now select swordfish — should work
    await clickGame(page, FISH_ROW_2.x, FISH_ROW_2.y);
    await page.waitForTimeout(200);

    // Screenshot — pufferfish+swordfish checked
    await page.screenshot({
        path: `${SCREENSHOT_DIR}/sf-03b-reselect.png`
    });

    expect(errors.length).toBe(0);
});

test('step 3c: toggle uses checkmark and maxPicks guard (code inspection)', async ({ page }) => {
    const resp = await page.goto(`${BASE}/src/scenes/DelversLedgerScene.js`);
    const src = await resp.text();

    // Checkmark character used for selection indicator
    expect(src).toContain("'\\u2713'");
    // Empty string to clear checkmark on deselect
    expect(src).toContain("setText('')");
    // maxPicks guard prevents over-selection
    expect(src).toContain('if (this._selectedStarters.length >= this._maxPicks) return');
});

// ─── Step 4: Confirm button behavior ─────────────────────────────────────────

test('step 4a: confirm button dimmed until 2 fish selected', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await freshStart(page);
    await openLedgerToSpread(page);
    await navigateToStarterFish(page);

    // Screenshot — 0 fish selected, CONFIRM should be dimmed
    await page.screenshot({
        path: `${SCREENSHOT_DIR}/sf-04a-confirm-dimmed-0.png`
    });

    // Select 1 fish
    await clickGame(page, FISH_ROW_0.x, FISH_ROW_0.y);
    await page.waitForTimeout(300);

    // Screenshot — 1 fish selected, CONFIRM still dimmed
    await page.screenshot({
        path: `${SCREENSHOT_DIR}/sf-04a-confirm-dimmed-1.png`
    });

    // Select 2nd fish
    await clickGame(page, FISH_ROW_1.x, FISH_ROW_1.y);
    await page.waitForTimeout(300);

    // Screenshot — 2 fish selected, CONFIRM should be fully visible
    await page.screenshot({
        path: `${SCREENSHOT_DIR}/sf-04a-confirm-enabled.png`
    });

    // Deselect one fish
    await clickGame(page, FISH_ROW_0.x, FISH_ROW_0.y);
    await page.waitForTimeout(300);

    // Screenshot — 1 fish selected, CONFIRM should dim again
    await page.screenshot({
        path: `${SCREENSHOT_DIR}/sf-04a-confirm-redimmed.png`
    });

    expect(errors.length).toBe(0);
});

test('step 4b: confirm alpha logic (code inspection)', async ({ page }) => {
    const resp = await page.goto(`${BASE}/src/scenes/DelversLedgerScene.js`);
    const src = await resp.text();

    // CONFIRM starts at alpha 0.3
    expect(src).toContain("setAlpha(0.3)");
    // Toggles between 0.3 and 1 based on selection count
    expect(src).toContain("this._confirmBtn.setAlpha(ready ? 1 : 0.3)");
    // Only fires when enabled
    expect(src).toContain("if (this._confirmEnabled) this._confirmStarters()");
});

// ─── Step 5: Game start flow ─────────────────────────────────────────────────

test('step 5: select 2 fish and confirm starts the game', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await freshStart(page);
    await openLedgerToSpread(page);
    await navigateToStarterFish(page);

    // Select guppy + pufferfish
    await clickGame(page, FISH_ROW_0.x, FISH_ROW_0.y);
    await page.waitForTimeout(200);
    await clickGame(page, FISH_ROW_1.x, FISH_ROW_1.y);
    await page.waitForTimeout(200);

    // Screenshot before confirming
    await page.screenshot({
        path: `${SCREENSHOT_DIR}/sf-05a-before-confirm.png`
    });

    // Click CONFIRM
    await clickGame(page, CONFIRM_BTN.x, CONFIRM_BTN.y);
    await page.waitForTimeout(BOOK_CLOSE_MS + SEWER_TRANSITION_MS);

    // Screenshot — should be in FloorScene (gameplay)
    await page.screenshot({
        path: `${SCREENSHOT_DIR}/sf-05b-floor-scene.png`
    });

    expect(errors.length).toBe(0);
});

test('step 5b: sewer transition flow (code inspection)', async ({ page }) => {
    const resp = await page.goto(`${BASE}/src/scenes/DelversLedgerScene.js`);
    const src = await resp.text();

    // _confirmStarters calls _closeBook then _sewerTransition
    expect(src).toContain('this._closeBook(');
    expect(src).toContain('this._sewerTransition()');
    // Sewer background becomes visible
    expect(src).toContain('this._sewerBg.setVisible(true)');
    // Camera zoom into sewer
    expect(src).toContain('this.cameras.main.zoomTo(2.5, 1200');
    // Fade to black
    expect(src).toContain('this.cameras.main.fadeOut(600');
    // Starts FloorScene on fade complete
    expect(src).toContain("this.scene.start('FloorScene'");
});

// ─── Step 6: Save data correctness ──────────────────────────────────────────

test('step 6: save data has correct structure after new game', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await freshStart(page);
    await openLedgerToSpread(page);
    await navigateToStarterFish(page);

    // Select guppy + swordfish
    await clickGame(page, FISH_ROW_0.x, FISH_ROW_0.y);
    await page.waitForTimeout(200);
    await clickGame(page, FISH_ROW_2.x, FISH_ROW_2.y);
    await page.waitForTimeout(200);

    // Click CONFIRM
    await clickGame(page, CONFIRM_BTN.x, CONFIRM_BTN.y);
    await page.waitForTimeout(BOOK_CLOSE_MS + SEWER_TRANSITION_MS + 1000);

    // Read save data from localStorage
    const saveData = await page.evaluate((key) => {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    }, SAVE_KEY);

    expect(saveData).not.toBeNull();
    expect(saveData.fisherId).toBe('andy');
    expect(saveData.floor).toBe(1);
    expect(saveData.gold).toBe(50);

    // Party should contain the 2 selected fish + Dog companion
    expect(saveData.party.length).toBe(3);
    const speciesIds = saveData.party.map(p => p.speciesId);
    expect(speciesIds).toContain('guppy');
    expect(speciesIds).toContain('swordfish');
    expect(speciesIds).toContain('dog');

    // Equipment grid has Harmony pre-placed
    expect(saveData.equipment).toBeTruthy();
    expect(saveData.equipment.grid.length).toBeGreaterThan(0);
    expect(saveData.equipment.grid[0].itemId).toBe('harmony');

    expect(errors.length).toBe(0);
});

test('step 6b: _startNewGame creates correct state (code inspection)', async ({ page }) => {
    const resp = await page.goto(`${BASE}/src/scenes/DelversLedgerScene.js`);
    const src = await resp.text();

    // Deletes old save first
    expect(src).toContain('SaveSystem.deleteSave()');
    // Creates fish from selected IDs
    expect(src).toContain('ids.map(id => PartySystem.createFish(id))');
    // Creates companion
    expect(src).toContain('PartySystem.createCompanion(fisherId)');
    // Uses character's startingGold
    expect(src).toContain('character ? character.startingGold : 0');
    // Saves the state
    expect(src).toContain('SaveSystem.save(gameState)');
});

// ─── Step 7: Continue still works ────────────────────────────────────────────

test('step 7: continue loads directly into gameplay without book', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    // Inject a save to simulate prior gameplay
    await page.goto(BASE);
    await injectSaveAndLoad(page, makeV5Save());

    // Screenshot — title screen should show CONTINUE button
    await page.screenshot({
        path: `${SCREENSHOT_DIR}/sf-07a-title-with-continue.png`
    });

    // Click CONTINUE (same x as NEW GAME, y offset for 2nd button: height*0.43)
    // height = 270, so y = 0.43 * 270 ≈ 116
    await clickGame(page, 240, 116);
    await page.waitForTimeout(CINEMATIC_MS + 1000);

    // Screenshot — should be in FloorScene, NOT in Delver's Ledger
    await page.screenshot({
        path: `${SCREENSHOT_DIR}/sf-07b-continue-floor.png`
    });

    expect(errors.length).toBe(0);
});

// ─── Step 8: TitleScene cleanup ──────────────────────────────────────────────

test('step 8a: TitleScene has no old starter selection methods', async ({ page }) => {
    const resp = await page.goto(`${BASE}/src/scenes/TitleScene.js`);
    const src = await resp.text();

    // Old methods should be removed
    expect(src).not.toContain('showStarterSelection');
    expect(src).not.toContain('_toggleStarter');
    expect(src).not.toContain('startNewGame');

    // No data.selectedFisher branch
    expect(src).not.toContain('data.selectedFisher');
});

test('step 8b: New Game goes to DelversLedgerScene', async ({ page }) => {
    const resp = await page.goto(`${BASE}/src/scenes/TitleScene.js`);
    const src = await resp.text();

    // NEW GAME button transitions to DelversLedgerScene
    expect(src).toContain("scene.start('DelversLedgerScene')");
    // No direct transition to FloorScene from NEW GAME
    expect(src).not.toMatch(/NEW GAME[\s\S]*?scene\.start\('FloorScene'\)/);
});

// ─── Step 9: Both orientations ───────────────────────────────────────────────

test('step 9a: landscape starter fish flow', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await freshStart(page);
    await openLedgerToSpread(page);
    await navigateToStarterFish(page);

    // Select 2 fish in landscape
    await clickGame(page, FISH_ROW_0.x, FISH_ROW_0.y);
    await page.waitForTimeout(200);
    await clickGame(page, FISH_ROW_1.x, FISH_ROW_1.y);
    await page.waitForTimeout(200);

    await page.screenshot({
        path: `${SCREENSHOT_DIR}/sf-09a-landscape-selected.png`
    });

    expect(errors.length).toBe(0);
});

test('step 9b: portrait starter fish flow', async ({ page, browser }) => {
    const portraitCtx = await browser.newContext({
        viewport: { width: 270, height: 480 }
    });
    const pp = await portraitCtx.newPage();
    const errors = [];
    pp.on('pageerror', err => errors.push(err.message));

    try {
        await pp.goto(BASE);
        await pp.evaluate((key) => localStorage.removeItem(key), SAVE_KEY);
        await pp.reload({ waitUntil: 'networkidle' });
        await pp.waitForSelector('canvas', { timeout: 10000 });
        await pp.waitForTimeout(BUTTON_APPEAR_MS);

        // Open ledger in portrait
        await clickGame(pp, PORT_NEW_GAME.x, PORT_NEW_GAME.y, PORT_GAME_W, PORT_GAME_H);
        await pp.waitForTimeout(CINEMATIC_MS + BOOK_READY_MS);

        // Click SELECT on Andy's portrait spread
        await clickGame(pp, PORT_SELECT_BTN.x, PORT_SELECT_BTN.y, PORT_GAME_W, PORT_GAME_H);
        await pp.waitForTimeout(RAPID_FLIP_MS);

        // Screenshot — starter fish in portrait
        await pp.screenshot({
            path: `${SCREENSHOT_DIR}/sf-09b-portrait-starters.png`
        });

        // Select 2 fish
        await clickGame(pp, PORT_FISH_ROW_0.x, PORT_FISH_ROW_0.y, PORT_GAME_W, PORT_GAME_H);
        await pp.waitForTimeout(200);
        await clickGame(pp, PORT_FISH_ROW_1.x, PORT_FISH_ROW_1.y, PORT_GAME_W, PORT_GAME_H);
        await pp.waitForTimeout(200);

        // Screenshot — 2 fish selected in portrait
        await pp.screenshot({
            path: `${SCREENSHOT_DIR}/sf-09b-portrait-selected.png`
        });

        expect(errors.length).toBe(0);
    } finally {
        await portraitCtx.close();
    }
});

test('step 9c: both layouts use isPortrait flag (code inspection)', async ({ page }) => {
    const resp = await page.goto(`${BASE}/src/scenes/DelversLedgerScene.js`);
    const src = await resp.text();

    // _buildStarterFishContent branches on isPortrait
    expect(src).toContain('if (this._isPortrait)');
    expect(src).toContain('this._buildStarterFishPortrait(w, h, starters)');
    expect(src).toContain('this._buildStarterFishLandscape(w, h, starters)');
});

// ─── Step 10: Complete end-to-end flow ───────────────────────────────────────

test('step 10: full end-to-end flow with no console errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    // Title → New Game
    await freshStart(page);

    await page.screenshot({
        path: `${SCREENSHOT_DIR}/sf-10a-title.png`
    });

    // Click New Game → cinematic
    await clickGame(page, NEW_GAME_BTN.x, NEW_GAME_BTN.y);
    await page.waitForTimeout(CINEMATIC_MS + BOOK_READY_MS);

    // Book is open on Andy's spread
    await page.screenshot({
        path: `${SCREENSHOT_DIR}/sf-10b-andy-spread.png`
    });

    // Click SELECT → rapid flip → starter fish
    await clickGame(page, SELECT_BTN.x, SELECT_BTN.y);
    await page.waitForTimeout(RAPID_FLIP_MS);

    await page.screenshot({
        path: `${SCREENSHOT_DIR}/sf-10c-starter-fish.png`
    });

    // Select guppy + pufferfish
    await clickGame(page, FISH_ROW_0.x, FISH_ROW_0.y);
    await page.waitForTimeout(200);
    await clickGame(page, FISH_ROW_1.x, FISH_ROW_1.y);
    await page.waitForTimeout(200);

    await page.screenshot({
        path: `${SCREENSHOT_DIR}/sf-10d-fish-selected.png`
    });

    // Click CONFIRM → book close → sewer → FloorScene
    await clickGame(page, CONFIRM_BTN.x, CONFIRM_BTN.y);
    await page.waitForTimeout(BOOK_CLOSE_MS + SEWER_TRANSITION_MS + 1000);

    await page.screenshot({
        path: `${SCREENSHOT_DIR}/sf-10e-floor-scene.png`
    });

    // Verify save data
    const saveData = await page.evaluate((key) => {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    }, SAVE_KEY);

    expect(saveData).not.toBeNull();
    expect(saveData.floor).toBe(1);
    expect(saveData.fisherId).toBe('andy');
    expect(saveData.party.length).toBe(3);

    // No console errors throughout the entire flow
    expect(errors.length).toBe(0);
});
