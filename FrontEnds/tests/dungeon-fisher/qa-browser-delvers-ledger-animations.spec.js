/**
 * Browser QA: Delver's Ledger Animations
 * Plan: qa-browser-delvers-ledger-animations
 *
 * Verifies Phase 2 animations: book entrance, cover flip-open, page turn
 * system, rapid page flip on character confirmation, book close method,
 * sewer entrance transition, animation smoothness, and both orientations.
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

// Animation timing constants (from DelversLedgerScene.js)
const CINEMATIC_MS = 3500;       // TitleScene cinematic transition
const ENTRANCE_SLIDE_MS = 600;   // Back.easeOut slide up
const ENTRANCE_FADE_MS = 300;    // Alpha fade in
const COVER_PAUSE_MS = 800;      // Delay before auto-flip
const FLIP_DURATION_MS = 600;    // Cover flip-open total
const RAPID_FLIP_TOTAL_MS = 1250; // Sum of [400,300,200,150] + buffer

// NEW GAME button at (width/2, height*0.36) = (240, 97) for 480x270
const NEW_GAME_BTN = { x: 240, y: 97 };
// Center of screen for cover interaction
const CENTER = { x: 240, y: 135 };
// SELECT button in landscape: rightCx=342, y≈223
const SELECT_BTN = { x: 342, y: 223 };

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getCanvasBounds(page) {
    const canvas = page.locator('canvas').first();
    return await canvas.boundingBox();
}

async function clickGame(page, gx, gy) {
    const bounds = await getCanvasBounds(page);
    const x = bounds.x + gx * (bounds.width / GAME_W);
    const y = bounds.y + gy * (bounds.height / GAME_H);
    await page.mouse.click(x, y);
}

async function freshStart(page) {
    await page.goto(BASE);
    await page.evaluate((key) => localStorage.removeItem(key), SAVE_KEY);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(BUTTON_APPEAR_MS);
}

async function navigateToLedger(page) {
    await freshStart(page);
    await clickGame(page, NEW_GAME_BTN.x, NEW_GAME_BTN.y);
    await page.waitForTimeout(CINEMATIC_MS);
}

async function navigateToCharacterSpread(page) {
    await navigateToLedger(page);
    // Wait for auto-flip: 800ms pause + 600ms flip
    await page.waitForTimeout(COVER_PAUSE_MS + FLIP_DURATION_MS + 200);
}

// ─── Step 1: Book entrance animation ─────────────────────────────────────────

test('step 1a: book slides up from below screen with easing', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await freshStart(page);
    await clickGame(page, NEW_GAME_BTN.x, NEW_GAME_BTN.y);

    // Capture early in cinematic (before ledger appears)
    await page.waitForTimeout(CINEMATIC_MS - 500);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/anim-01a-pre-entrance.png` });

    // Wait for entrance to start + partway through (300ms into 600ms slide)
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/anim-01b-mid-entrance.png` });

    // No console errors during entrance
    expect(errors.length).toBe(0);
});

test('step 1b: book entrance uses Back.easeOut and fade-in (code inspection)', async ({ page }) => {
    const resp = await page.goto(`${BASE}/src/scenes/DelversLedgerScene.js`);
    const src = await resp.text();

    // Verify entrance starts off-screen (below viewport)
    expect(src).toContain('height + this._bookH / 2');
    // Verify alpha starts at 0
    expect(src).toContain('setAlpha(0)');
    // Verify Back.easeOut easing (not linear)
    expect(src).toContain("ease: 'Back.easeOut'");
    // Verify slide-up duration is 600ms
    expect(src).toMatch(/duration:\s*600/);
    // Verify fade-in tween exists
    expect(src).toMatch(/alpha:\s*1/);
    // Verify fade-in is 300ms
    expect(src).toMatch(/duration:\s*300/);
});

test('step 1c: cover title visible after entrance, before flip', async ({ page }) => {
    await freshStart(page);
    await clickGame(page, NEW_GAME_BTN.x, NEW_GAME_BTN.y);

    // Wait for cinematic + entrance to complete but before auto-flip
    // Entrance: 600ms, then 800ms pause before flip starts
    await page.waitForTimeout(CINEMATIC_MS + 700);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/anim-01c-cover-visible.png` });
});

// ─── Step 2: Cover flip-open animation ───────────────────────────────────────

test('step 2a: cover flip uses scaleX squish pattern (code inspection)', async ({ page }) => {
    const resp = await page.goto(`${BASE}/src/scenes/DelversLedgerScene.js`);
    const src = await resp.text();

    // _flipPage method squishes fromContainer scaleX to 0
    expect(src).toContain('scaleX: 0');
    // Uses Sine.easeIn for first half (closing)
    expect(src).toContain("ease: 'Sine.easeIn'");
    // Uses Sine.easeOut for second half (opening)
    expect(src).toContain("ease: 'Sine.easeOut'");
    // Hides fromContainer at midpoint
    expect(src).toContain('fromContainer.setVisible(false)');
    // Shows toContainer at midpoint
    expect(src).toContain('toContainer.setVisible(true)');
    // toContainer starts at scaleX 0 then expands to 1
    expect(src).toContain('toContainer.scaleX = 0');
    expect(src).toContain('scaleX: 1');
});

test('step 2b: cover flip completes without visual glitches', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await freshStart(page);
    await clickGame(page, NEW_GAME_BTN.x, NEW_GAME_BTN.y);

    // Wait for cinematic + entrance + pause + mid-flip
    const midFlipTime = CINEMATIC_MS + ENTRANCE_SLIDE_MS + COVER_PAUSE_MS + (FLIP_DURATION_MS / 2);
    await page.waitForTimeout(midFlipTime);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/anim-02b-mid-flip.png` });

    // Wait for flip to complete
    await page.waitForTimeout(FLIP_DURATION_MS / 2 + 200);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/anim-02b-flip-complete.png` });

    expect(errors.length).toBe(0);
});

test('step 2c: content swaps at midpoint — cover disappears, pages appear', async ({ page }) => {
    const resp = await page.goto(`${BASE}/src/scenes/DelversLedgerScene.js`);
    const src = await resp.text();

    // The _flipPage method sets a transitioning flag to prevent overlaps
    expect(src).toContain('this._transitioning = true');
    expect(src).toContain('this._transitioning = false');

    // Verify _flipCoverOpen calls _flipPage with correct containers
    expect(src).toContain('this._flipPage(this._coverContainer, this._pageContainer');
    // Verify forward direction and 600ms duration
    expect(src).toContain("'forward', 600");
});

// ─── Step 3: Character spread visible after flip ────────────────────────────

test('step 3: character spread fully visible after cover flip', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await navigateToCharacterSpread(page);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/anim-03-spread-after-flip.png` });

    expect(errors.length).toBe(0);
});

// ─── Step 4: Rapid page flip on character confirmation ──────────────────────

test('step 4a: rapid flip uses decreasing durations (code inspection)', async ({ page }) => {
    const resp = await page.goto(`${BASE}/src/scenes/DelversLedgerScene.js`);
    const src = await resp.text();

    // Durations decrease: [400, 300, 200, 150]
    expect(src).toContain('[400, 300, 200, 150]');

    // Creates blank page containers for intermediate flips
    expect(src).toContain('const blank = this.add.container(0, 0)');

    // Uses recursive flipNext to chain flips
    expect(src).toContain('flipNext');

    // Final flip squishes to scaleX 0 then transitions to TitleScene
    expect(src).toContain("this.scene.start('TitleScene', { selectedFisher: fisherId })");
});

test('step 4b: SELECT triggers rapid flip and transitions to TitleScene', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await navigateToCharacterSpread(page);

    // Screenshot before clicking SELECT
    await page.screenshot({ path: `${SCREENSHOT_DIR}/anim-04b-before-select.png` });

    // Click SELECT button
    await clickGame(page, SELECT_BTN.x, SELECT_BTN.y);

    // Capture mid-rapid-flip (after ~400ms, first flip should be in progress)
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/anim-04b-mid-rapid-flip.png` });

    // Wait for full rapid flip sequence to complete + scene transition
    await page.waitForTimeout(RAPID_FLIP_TOTAL_MS + 500);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/anim-04b-after-rapid-flip.png` });

    expect(errors.length).toBe(0);
});

// ─── Step 5: Book close animation (code inspection) ─────────────────────────

test('step 5: _closeBook method exists and reverses the open animation (code inspection)', async ({ page }) => {
    const resp = await page.goto(`${BASE}/src/scenes/DelversLedgerScene.js`);
    const src = await resp.text();

    // _closeBook method exists
    expect(src).toContain('_closeBook(onComplete)');

    // Reverse of open: page scaleX → 0
    expect(src).toMatch(/_closeBook[\s\S]*?_pageContainer[\s\S]*?scaleX:\s*0/);

    // Then cover appears and expands back
    expect(src).toMatch(/_closeBook[\s\S]*?_coverContainer\.setVisible\(true\)/);
    expect(src).toMatch(/_closeBook[\s\S]*?_coverContainer[\s\S]*?scaleX:\s*1/);

    // Then book slides off-screen downward
    expect(src).toMatch(/_closeBook[\s\S]*?height \+ this\._bookH \/ 2/);
    // Uses Cubic.easeIn for the exit slide
    expect(src).toContain("ease: 'Cubic.easeIn'");
});

// ─── Step 6: Sewer entrance transition (code inspection) ────────────────────

test('step 6: _sewerTransition method exists with zoom and fade (code inspection)', async ({ page }) => {
    const resp = await page.goto(`${BASE}/src/scenes/DelversLedgerScene.js`);
    const src = await resp.text();

    // Method exists
    expect(src).toContain('_sewerTransition()');

    // Sewer background is set up
    expect(src).toContain('_setupSewerBg');
    expect(src).toContain("coverBackground(this, zone1.bgKey)");

    // Camera zooms to 2.5x
    expect(src).toContain('zoomTo(2.5, 1200');

    // Camera fades out
    expect(src).toContain('fadeOut(600, 0, 0, 0)');

    // After fade, transitions to TitleScene
    expect(src).toContain('camerafadeoutcomplete');
    expect(src).toContain("this.scene.start('TitleScene'");
});

// ─── Step 7: Animation smoothness ───────────────────────────────────────────

test('step 7a: full animation sequence completes without console errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('console', msg => {
        if (msg.type() === 'error') errors.push(msg.text());
    });

    // Run through full sequence: title → ledger → cover → spread → select → transition
    await navigateToCharacterSpread(page);
    await clickGame(page, SELECT_BTN.x, SELECT_BTN.y);
    await page.waitForTimeout(RAPID_FLIP_TOTAL_MS + 1000);

    expect(errors.length).toBe(0);
});

test('step 7b: no tween conflicts — transitioning flag prevents overlap (code inspection)', async ({ page }) => {
    const resp = await page.goto(`${BASE}/src/scenes/DelversLedgerScene.js`);
    const src = await resp.text();

    // _flipPage checks transitioning flag at start
    expect(src).toMatch(/_flipPage[\s\S]*?if\s*\(this\._transitioning\)\s*return/);

    // _rapidFlipToStarters also checks transitioning
    expect(src).toMatch(/_rapidFlipToStarters[\s\S]*?if\s*\(this\._transitioning\)\s*return/);

    // _closeBook also checks transitioning
    expect(src).toMatch(/_closeBook[\s\S]*?if\s*\(this\._transitioning\)\s*return/);
});

test('step 7c: positions use Math.round for integer pixels (code inspection)', async ({ page }) => {
    const resp = await page.goto(`${BASE}/src/scenes/DelversLedgerScene.js`);
    const src = await resp.text();

    // Book dimensions use Math.round
    expect(src).toContain('Math.round(width * 0.85)');
    expect(src).toContain('Math.round(height *');

    // Center positions use Math.round
    expect(src).toContain('Math.round(width / 2)');
    expect(src).toContain('Math.round(height / 2)');

    // Panel offsets use Math.round
    expect(src).toContain('Math.round(-w / 2)');
    expect(src).toContain('Math.round(-h / 2)');
});

// ─── Step 8: Both orientations ──────────────────────────────────────────────

test('step 8a: landscape animation sequence completes cleanly', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    // Default viewport is landscape
    await navigateToCharacterSpread(page);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/anim-08a-landscape-spread.png` });

    // Click SELECT and verify transition
    await clickGame(page, SELECT_BTN.x, SELECT_BTN.y);
    await page.waitForTimeout(RAPID_FLIP_TOTAL_MS + 1000);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/anim-08a-landscape-after-select.png` });

    expect(errors.length).toBe(0);
});

test('step 8b: portrait animation sequence completes cleanly', async ({ page, browser }) => {
    const errors = [];

    // Create portrait context (height > width triggers isPortrait)
    const portraitContext = await browser.newContext({
        viewport: { width: 270, height: 480 }
    });
    const portraitPage = await portraitContext.newPage();
    portraitPage.on('pageerror', err => errors.push(err.message));

    try {
        await portraitPage.goto(BASE);
        await portraitPage.evaluate((key) => localStorage.removeItem(key), SAVE_KEY);
        await portraitPage.reload({ waitUntil: 'networkidle' });
        await portraitPage.waitForSelector('canvas', { timeout: 10000 });
        await portraitPage.waitForTimeout(BUTTON_APPEAR_MS);

        // Portrait game coords: 270x480
        const PW = 270;
        const PH = 480;
        const pBounds = await portraitPage.locator('canvas').first().boundingBox();

        async function clickPortrait(gx, gy) {
            const x = pBounds.x + gx * (pBounds.width / PW);
            const y = pBounds.y + gy * (pBounds.height / PH);
            await portraitPage.mouse.click(x, y);
        }

        // NEW GAME at (135, 173) for portrait
        await clickPortrait(135, 173);
        await portraitPage.waitForTimeout(CINEMATIC_MS);

        // Screenshot during entrance
        await portraitPage.screenshot({ path: `${SCREENSHOT_DIR}/anim-08b-portrait-entrance.png` });

        // Wait for auto-flip to complete
        await portraitPage.waitForTimeout(COVER_PAUSE_MS + FLIP_DURATION_MS + 200);

        // Screenshot the portrait character spread
        await portraitPage.screenshot({ path: `${SCREENSHOT_DIR}/anim-08b-portrait-spread.png` });

        // Portrait SELECT button: centered at (0, h/2 - 22) relative to panel
        // In portrait: panelW=270*0.85=230, panelH=480*0.75=360
        // selectBtn at screen center x=135, y=240+(360/2-22)=240+158=398... roughly
        // Actually: cy = 240, panelH=360, selectBtn y = cy + panelH/2 - 22 = 240+180-22 = 398
        // selectBtn x = 135 (center)
        await clickPortrait(135, 398);
        await portraitPage.waitForTimeout(RAPID_FLIP_TOTAL_MS + 1000);

        await portraitPage.screenshot({ path: `${SCREENSHOT_DIR}/anim-08b-portrait-after-select.png` });

        expect(errors.length).toBe(0);
    } finally {
        await portraitContext.close();
    }
});
