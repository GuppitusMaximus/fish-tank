/**
 * Browser QA: Delver's Ledger Book Shell
 * Plan: qa-browser-delvers-ledger-book-shell
 *
 * Verifies: DelversLedgerScene loads on New Game, book cover displays,
 * character spread with data-driven content, portrait/landscape layouts,
 * Select action flow, Continue bypass, UIOverlay button hiding, and
 * old CharacterSelectScene removal.
 *
 * Runs against http://localhost:8080 (dungeon-fisher Vite dev server).
 * Save key is 'fathom-fall-save', save format v5.
 */

const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:8080';
const SAVE_KEY = 'fathom-fall-save';
const GAME_W = 480;
const GAME_H = 270;
const BUTTON_APPEAR_MS = 5500;
const SCREENSHOT_DIR = 'tests/dungeon-fisher/screenshots';

// Cinematic transition is ~2100ms, plus buffer
const CINEMATIC_MS = 3500;
// Cover auto-opens after 3000ms, but we tap to skip
const COVER_SETTLE_MS = 1500;

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getCanvas(page) {
    return page.locator('canvas').first();
}

async function getCanvasBounds(page) {
    const canvas = await getCanvas(page);
    return await canvas.boundingBox();
}

async function gameCoord(page, gx, gy) {
    const bounds = await getCanvasBounds(page);
    return {
        x: bounds.x + gx * (bounds.width / GAME_W),
        y: bounds.y + gy * (bounds.height / GAME_H)
    };
}

async function clickGame(page, gx, gy) {
    const { x, y } = await gameCoord(page, gx, gy);
    await page.mouse.click(x, y);
}

function makeFish(speciesId, name, color, hp, maxHp, atk, def, spd, specialMove, opts = {}) {
    return {
        speciesId, name, color,
        level: opts.level || 5, xp: 0, xpToNext: 125,
        hp, maxHp, atk, def, spd,
        shield: opts.shield || 0,
        maxShield: opts.maxShield || 0,
        healPower: opts.healPower || 0,
        moves: [specialMove],
        poisoned: null, buffs: [], burn: null, curses: [], hots: [], poisons: []
    };
}

const GUPPY = makeFish('guppy', 'Guppy', 0xe8734a, 50, 50, 16, 9, 10, 'bubble_volley');
const PUFFER = makeFish('pufferfish', 'Puffer', 0x88ccee, 60, 60, 12, 14, 8, 'shield_grant');

function makeV5Save(party, floor = 3, extras = {}) {
    return {
        version: 5,
        gameVersion: '0.12.0',
        savedAt: Date.now(),
        floor,
        gold: extras.gold ?? 200,
        party,
        inventory: extras.inventory || [],
        campFloor: extras.campFloor || 1,
        fisherId: 'andy',
        pveDeathCount: 0,
        pvpLossCount: 0,
        roster: [],
        companion: null,
        equipment: extras.equipment || {
            grid: [
                { itemId: 'harmony', col: 1, row: 4, rotation: 0, flipped: false }
            ],
            stash: [],
            harmonyPosition: { row: 4, col: 1 }
        },
        equipmentDelta: null
    };
}

async function freshStart(page) {
    await page.goto(BASE);
    await page.evaluate((key) => localStorage.removeItem(key), SAVE_KEY);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(BUTTON_APPEAR_MS);
}

async function injectSaveAndLoad(page, save) {
    await page.goto(BASE);
    await page.evaluate(([key, data]) => localStorage.setItem(key, JSON.stringify(data)), [SAVE_KEY, save]);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(BUTTON_APPEAR_MS);
}

// NEW GAME button: centered at (width/2, height*0.36) = (240, 97)
const NEW_GAME_BTN = { x: 240, y: 97 };
// CONTINUE button: centered at (width/2, height*0.43) = (240, 116)
const CONTINUE_BTN = { x: 240, y: 116 };
// Center of screen (for tapping the book cover)
const CENTER = { x: 240, y: 135 };

// ─── Step 1: Scene loads on New Game ─────────────────────────────────────────

test('step 1: DelversLedgerScene loads after clicking New Game', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await freshStart(page);

    // Click NEW GAME
    await clickGame(page, NEW_GAME_BTN.x, NEW_GAME_BTN.y);

    // Wait for cinematic transition to complete
    await page.waitForTimeout(CINEMATIC_MS);

    // Screenshot the book cover (DelversLedgerScene should now be active)
    await page.screenshot({
        path: `${SCREENSHOT_DIR}/dl-01-cover.png`
    });

    // No console errors during transition
    expect(errors.length).toBe(0);
});

// ─── Step 2: Book cover displays ─────────────────────────────────────────────

test('step 2: book cover displays with title and prompt', async ({ page }) => {
    await freshStart(page);

    // Click NEW GAME
    await clickGame(page, NEW_GAME_BTN.x, NEW_GAME_BTN.y);
    await page.waitForTimeout(CINEMATIC_MS);

    // Cover should be visible — capture it before it auto-opens
    await page.screenshot({
        path: `${SCREENSHOT_DIR}/dl-02-cover-detail.png`
    });

    // The cover should show within the canvas (Phaser renders on canvas,
    // so we verify visually via screenshot). The cover contains:
    // - A dark leather panel (85% width, 75% height)
    // - "The Delver's\nLedger" in gold text
    // - "Tap to Open" pulsing prompt
    // Visual verification done by reviewing the screenshot.
});

// ─── Step 3: Character spread displays ───────────────────────────────────────

test('step 3: character spread shows Andy portrait, name, lore, mechanics', async ({ page }) => {
    await freshStart(page);

    // Click NEW GAME → wait for cinematic → arrive at cover
    await clickGame(page, NEW_GAME_BTN.x, NEW_GAME_BTN.y);
    await page.waitForTimeout(CINEMATIC_MS);

    // Tap to open the book
    await clickGame(page, CENTER.x, CENTER.y);
    await page.waitForTimeout(COVER_SETTLE_MS);

    // Screenshot the character spread (landscape layout)
    await page.screenshot({
        path: `${SCREENSHOT_DIR}/dl-03-spread-landscape.png`
    });

    // In landscape mode, the spread should show:
    // - Left page: Andy's portrait (fisher_andy texture, 80x80), name below
    // - Right page: Lore text, mechanics text, [ SELECT ] button
    // - Vertical divider line between pages
    // Visual verification done by reviewing the screenshot.
});

// ─── Step 4: Data-driven content (code inspection) ──────────────────────────

test('step 4: content is data-driven from andy.json (code inspection)', async ({ page }) => {
    // Verify DelversLedgerScene reads from ConfigLoader, not hardcoded text.
    // Fetch the scene source and check for ConfigLoader usage.
    const resp = await page.goto(`${BASE}/src/scenes/DelversLedgerScene.js`);
    const src = await resp.text();

    // Must use ConfigLoader.getCharacter() — not hardcoded strings
    expect(src).toContain('ConfigLoader.getCharacter(fisherId)');

    // Must reference fisher.lore and fisher.mechanics from the data object
    expect(src).toContain('fisher.lore');
    expect(src).toContain('fisher.mechanics');
    expect(src).toContain('fisher.name');
    expect(src).toContain('fisher.portrait');

    // Must NOT contain hardcoded lore text
    expect(src).not.toContain('A weathered fisherman who abandoned the surface');
    expect(src).not.toContain('Bernie fights alongside');
});

// ─── Step 5: Portrait vs landscape layout ────────────────────────────────────

test('step 5a: landscape layout has two-page spread', async ({ page }) => {
    // Default viewport is landscape-ish (Playwright default ≥ 480 wide)
    await freshStart(page);

    await clickGame(page, NEW_GAME_BTN.x, NEW_GAME_BTN.y);
    await page.waitForTimeout(CINEMATIC_MS);

    // Tap to open
    await clickGame(page, CENTER.x, CENTER.y);
    await page.waitForTimeout(COVER_SETTLE_MS);

    // Landscape screenshot (already captured in step 3, but explicit for step 5)
    await page.screenshot({
        path: `${SCREENSHOT_DIR}/dl-05a-landscape-spread.png`
    });
});

test('step 5b: portrait layout arranges content vertically', async ({ page, browser }) => {
    // Create a portrait-shaped context (height > width triggers isPortrait)
    const portraitContext = await browser.newContext({
        viewport: { width: 270, height: 480 }
    });
    const portraitPage = await portraitContext.newPage();

    try {
        await portraitPage.goto(BASE);
        await portraitPage.evaluate((key) => localStorage.removeItem(key), SAVE_KEY);
        await portraitPage.reload({ waitUntil: 'networkidle' });
        await portraitPage.waitForSelector('canvas', { timeout: 10000 });
        await portraitPage.waitForTimeout(BUTTON_APPEAR_MS);

        // In portrait mode, button positions are relative to 270x480 canvas
        // NEW GAME at (width/2, height*0.36) = (135, 173)
        const pBounds = await portraitPage.locator('canvas').first().boundingBox();
        const pGameW = 270;
        const pGameH = 480;
        const ngX = pBounds.x + 135 * (pBounds.width / pGameW);
        const ngY = pBounds.y + 173 * (pBounds.height / pGameH);
        await portraitPage.mouse.click(ngX, ngY);
        await portraitPage.waitForTimeout(CINEMATIC_MS);

        // Tap to open cover
        const cX = pBounds.x + 135 * (pBounds.width / pGameW);
        const cY = pBounds.y + 240 * (pBounds.height / pGameH);
        await portraitPage.mouse.click(cX, cY);
        await portraitPage.waitForTimeout(COVER_SETTLE_MS);

        // Screenshot the portrait spread
        await portraitPage.screenshot({
            path: `${SCREENSHOT_DIR}/dl-05b-portrait-spread.png`
        });
    } finally {
        await portraitContext.close();
    }
});

// ─── Step 6: Select action works ─────────────────────────────────────────────

test('step 6: SELECT button transitions to starter fish selection', async ({ page }) => {
    await freshStart(page);

    // Navigate to character spread
    await clickGame(page, NEW_GAME_BTN.x, NEW_GAME_BTN.y);
    await page.waitForTimeout(CINEMATIC_MS);
    await clickGame(page, CENTER.x, CENTER.y);
    await page.waitForTimeout(COVER_SETTLE_MS);

    // In landscape: SELECT button is at rightCx (panelX + panelW*0.75), near bottom
    // panelW = 480*0.85 = 408, panelX = (480-408)/2 = 36
    // rightCx = 36 + 408*0.75 = 342
    // panelH = 270*0.80 = 216, panelY = (270-216)/2 = 27
    // selectBtn.y = panelY + panelH - 20 = 27 + 216 - 20 = 223
    const SELECT_BTN = { x: 342, y: 223 };
    await clickGame(page, SELECT_BTN.x, SELECT_BTN.y);

    // Wait for TitleScene to load with starter selection
    await page.waitForTimeout(2000);

    // Screenshot should show starter fish selection (not the ledger)
    await page.screenshot({
        path: `${SCREENSHOT_DIR}/dl-06-starter-selection.png`
    });
});

// ─── Step 7: Continue bypass ─────────────────────────────────────────────────

test('step 7: Continue loads directly into gameplay, skipping Ledger', async ({ page }) => {
    const save = makeV5Save([{ ...GUPPY }, { ...PUFFER }], 3);
    await injectSaveAndLoad(page, save);

    // CONTINUE button should be visible (save exists)
    // Click CONTINUE at (240, 116)
    await clickGame(page, CONTINUE_BTN.x, CONTINUE_BTN.y);

    // Wait for floor scene to load (Continue → FloorScene directly)
    await page.waitForTimeout(CINEMATIC_MS + 2000);

    // Screenshot — should show FloorScene (dungeon floor), NOT the Ledger
    await page.screenshot({
        path: `${SCREENSHOT_DIR}/dl-07-continue-bypass.png`
    });
});

// ─── Step 8: UIOverlay buttons hidden (code inspection) ──────────────────────

test('step 8: MENU/BAG/EQUIP buttons hidden during DelversLedgerScene', async ({ page }) => {
    // Fetch UIOverlayScene source and verify DelversLedgerScene is in all hidden sets
    const resp = await page.goto(`${BASE}/src/scenes/UIOverlayScene.js`);
    const src = await resp.text();

    // All three button-hiding sets must include DelversLedgerScene
    const menuMatch = src.match(/menuHiddenScenes\s*=\s*new\s+Set\(\[([^\]]+)\]\)/);
    const bagMatch = src.match(/bagHiddenScenes\s*=\s*new\s+Set\(\[([^\]]+)\]\)/);
    const equipMatch = src.match(/equipHiddenScenes\s*=\s*new\s+Set\(\[([^\]]+)\]\)/);

    expect(menuMatch).not.toBeNull();
    expect(bagMatch).not.toBeNull();
    expect(equipMatch).not.toBeNull();

    expect(menuMatch[1]).toContain('DelversLedgerScene');
    expect(bagMatch[1]).toContain('DelversLedgerScene');
    expect(equipMatch[1]).toContain('DelversLedgerScene');
});

// ─── Step 9: Old scene removed (code inspection) ────────────────────────────

test('step 9: CharacterSelectScene is no longer registered', async ({ page }) => {
    // Verify main.js does not import or reference CharacterSelectScene
    const resp = await page.goto(`${BASE}/src/main.js`);
    const src = await resp.text();

    expect(src).not.toContain('CharacterSelectScene');

    // Also verify it's not imported anywhere else in the scene array
    expect(src).toContain('DelversLedgerScene');
});
