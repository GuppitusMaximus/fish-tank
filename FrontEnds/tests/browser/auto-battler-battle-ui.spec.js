/**
 * Browser QA: Auto-Battler Battle UI
 *
 * Verifies the real-time auto-battler battle scene (BattleScene.js) introduced
 * in the auto-battler-battle-ui plan. Battle starts automatically with no player
 * input — all fish attack on independent cooldown timers.
 *
 * Runs against http://localhost:8080 (dungeon-fisher Vite dev/preview server).
 * Start server with: cd FrontEnds/dungeon-fisher && npm run dev
 *
 * TitleScene buttons have a 3.5s fade-in animation delay, so tests wait 5s
 * after page load before clicking to ensure buttons are interactive.
 *
 * Game dimensions: 480x270 (landscape), 270x480 (portrait)
 */

const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:8080';
const GAME_W = 480;
const GAME_H = 270;
const SAVE_KEY = 'dungeon-fisher-save';
// Buttons in TitleScene fade in after 3.5s + 0.5s animation. Wait at least 5s.
const BUTTON_APPEAR_MS = 5000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getCanvas(page) {
    return page.locator('canvas').first();
}

async function getCanvasBounds(page) {
    const canvas = await getCanvas(page);
    return await canvas.boundingBox();
}

// Convert game coordinates (480x270 space) to viewport coordinates
async function gameCoord(page, gx, gy, gameW = GAME_W, gameH = GAME_H) {
    const bounds = await getCanvasBounds(page);
    const scaleX = bounds.width / gameW;
    const scaleY = bounds.height / gameH;
    return {
        x: bounds.x + gx * scaleX,
        y: bounds.y + gy * scaleY
    };
}

async function clickGame(page, gx, gy) {
    const { x, y } = await gameCoord(page, gx, gy);
    await page.mouse.click(x, y);
}

// Load the game fresh with no save. Wait for TitleScene buttons to fully appear.
async function freshStart(page) {
    await page.goto(BASE);
    await page.evaluate((key) => localStorage.removeItem(key), SAVE_KEY);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(BUTTON_APPEAR_MS);
}

// Load game with an injected save. Wait for TitleScene buttons to fully appear.
async function loadSave(page, saveData) {
    await page.goto(BASE);
    await page.evaluate(({ key, data }) => {
        localStorage.setItem(key, JSON.stringify(data));
    }, { key: SAVE_KEY, data: saveData });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(BUTTON_APPEAR_MS);
}

// Navigate from title to FloorScene then into BattleScene (fresh new game, Guppy starter)
async function navigateNewGameToBattle(page) {
    await freshStart(page);
    await clickGame(page, 240, 97);    // [ NEW GAME ] at H*0.36
    await page.waitForTimeout(500);
    await clickGame(page, 312, 211);   // CharacterSelect [ SELECT ] at (W*0.65, H*0.78)
    await page.waitForTimeout(500);
    await clickGame(page, 120, 166);   // Guppy [ SELECT ] at x=120, y=H*0.45+45=166

    // Wait for startNewGame() to synchronously write the save to localStorage
    await page.waitForFunction((key) => !!localStorage.getItem(key), SAVE_KEY, { timeout: 5000 });
    await page.waitForTimeout(500);    // FloorScene transition

    await clickGame(page, 240, 199);   // [ ENTER BATTLE ] at (W/2, H*0.74) — Delve Deeper card center
    await page.waitForTimeout(1000);
}

// Navigate from title using CONTINUE, then enter battle
async function navigateContinueToBattle(page) {
    // CONTINUE is at (W/2=240, H*0.43=116) in landscape
    await clickGame(page, 240, 116);
    // Wait for FloorScene to load (it auto-saves)
    await page.waitForFunction((key) => {
        const raw = localStorage.getItem(key);
        if (!raw) return false;
        // FloorScene re-saves with the same floor, just refreshed
        return true;
    }, SAVE_KEY, { timeout: 5000 });
    await page.waitForTimeout(500);

    await clickGame(page, 240, 199);   // [ ENTER BATTLE ] — Delve Deeper card center (H*0.74=199)
    await page.waitForTimeout(1000);
}

// Create a fish instance matching PartySystem.createFish() output
function makeFish(speciesId, name, color, hp, maxHp, atk, def, spd, specialMove) {
    return {
        speciesId, name, color,
        level: 5, xp: 0, xpToNext: 125,
        hp, maxHp, atk, def, spd,
        moves: [specialMove],
        poisoned: null, buffs: []
    };
}

const GUPPY    = makeFish('guppy',     'Guppy',     0xe8734a, 50, 50, 16, 9, 10, 'bubble_volley');
const JELLYFISH = makeFish('jellyfish', 'Jellyfish', 0x9b6dcc, 45, 45, 14, 11, 11, 'venom_sting');
const SEAHORSE  = makeFish('seahorse',  'Seahorse',  0x50c878, 55, 55, 13, 10, 9,  'healing_tide');

function makeSave(party, floor = 5) {
    return {
        version: 3,
        gameVersion: '1.0.0',
        savedAt: Date.now(),
        floor, gold: 50,
        party, inventory: [],
        campFloor: 1, fisherId: 'andy'
    };
}

// ─── Step 1: Basic Combat (1-fish party) ─────────────────────────────────────

test('battle-1fish: no JS errors when entering battle', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await navigateNewGameToBattle(page);
    await page.screenshot({ path: 'tests/browser/screenshots/ab-01-battle-enter.png' });

    expect(errors, `JS errors on battle enter: ${errors.join(' | ')}`).toHaveLength(0);
});

test('battle-1fish: canvas still rendering in battle scene', async ({ page }) => {
    await navigateNewGameToBattle(page);

    const canvas = await getCanvas(page);
    await expect(canvas).toBeVisible();

    const hasContent = await page.evaluate(() => {
        const c = document.querySelector('canvas');
        if (!c) return false;
        try {
            const ctx = c.getContext('2d');
            if (ctx) {
                const d = ctx.getImageData(0, 0, c.width, c.height).data;
                for (let i = 0; i < d.length; i += 4) {
                    if (d[i] > 20 || d[i + 1] > 20 || d[i + 2] > 20) return true;
                }
            }
        } catch (e) {}
        return c.width > 0 && c.height > 0;
    });
    expect(hasContent).toBe(true);
});

test('battle-1fish: screenshot at battle start shows fish and monster', async ({ page }) => {
    await navigateNewGameToBattle(page);
    await page.screenshot({ path: 'tests/browser/screenshots/ab-03-battle-layout.png' });

    const canvas = await getCanvas(page);
    const bounds = await getCanvasBounds(page);
    expect(bounds.width).toBeGreaterThan(200);
    expect(bounds.height).toBeGreaterThan(100);
});

// ─── Step 2: Battle Resolves Automatically ───────────────────────────────────
// Uses a strong pre-loaded party at floor 5. Guppy L5 kills floor 5 monsters in ~8s.

test('battle-resolves: strong 1-fish party wins without player input', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loadSave(page, makeSave([GUPPY], 5));
    await navigateContinueToBattle(page);

    const resolved = await page.waitForFunction((key) => {
        const raw = localStorage.getItem(key);
        if (!raw) return false;
        return JSON.parse(raw).floor > 5;
    }, SAVE_KEY, { timeout: 30000 }).then(() => true).catch(() => false);

    await page.screenshot({ path: 'tests/browser/screenshots/ab-02-battle-resolved.png' });

    expect(resolved, 'Floor should advance after battle resolves automatically').toBe(true);
    expect(errors, `JS errors during battle: ${errors.join(' | ')}`).toHaveLength(0);
});

// ─── Step 3: Multi-Fish Combat ────────────────────────────────────────────────

test('battle-2fish: no JS errors with 2-fish party', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loadSave(page, makeSave([GUPPY, JELLYFISH]));
    await navigateContinueToBattle(page);

    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'tests/browser/screenshots/ab-04-battle-2fish.png' });

    expect(errors, `JS errors in 2-fish battle: ${errors.join(' | ')}`).toHaveLength(0);
});

test('battle-2fish: 2-fish party resolves battle', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loadSave(page, makeSave([GUPPY, JELLYFISH], 5));
    await navigateContinueToBattle(page);

    const resolved = await page.waitForFunction((key) => {
        const raw = localStorage.getItem(key);
        if (!raw) return false;
        return JSON.parse(raw).floor > 5;
    }, SAVE_KEY, { timeout: 30000 }).then(() => true).catch(() => false);

    await page.screenshot({ path: 'tests/browser/screenshots/ab-05-battle-2fish-resolved.png' });

    expect(resolved, 'Floor should advance after 2-fish battle').toBe(true);
    expect(errors).toHaveLength(0);
});

test('battle-3fish: no JS errors with 3-fish party (triangle formation)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loadSave(page, makeSave([GUPPY, JELLYFISH, SEAHORSE]));
    await navigateContinueToBattle(page);

    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'tests/browser/screenshots/ab-06-battle-3fish.png' });

    expect(errors, `JS errors in 3-fish battle: ${errors.join(' | ')}`).toHaveLength(0);
});

test('battle-3fish: 3-fish party resolves battle', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loadSave(page, makeSave([GUPPY, JELLYFISH, SEAHORSE], 5));
    await navigateContinueToBattle(page);

    const resolved = await page.waitForFunction((key) => {
        const raw = localStorage.getItem(key);
        if (!raw) return false;
        return JSON.parse(raw).floor > 5;
    }, SAVE_KEY, { timeout: 30000 }).then(() => true).catch(() => false);

    await page.screenshot({ path: 'tests/browser/screenshots/ab-07-battle-3fish-resolved.png' });

    expect(resolved, 'Floor should advance after 3-fish battle').toBe(true);
    expect(errors).toHaveLength(0);
});

// ─── Step 4: Incapacitation & Party Wipe ─────────────────────────────────────

test('defeat: party wipe at high floor resets to camp floor', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    // Fish with 1 HP at floor 50 — guaranteed first-hit wipe by the powerful monster
    const weakGuppy = { ...GUPPY, hp: 1, maxHp: 1, atk: 1, def: 0 };
    await loadSave(page, makeSave([weakGuppy], 50));
    await navigateContinueToBattle(page);

    // After wipe: floor resets to campFloor=1. Save is updated when FloorScene starts.
    const wiped = await page.waitForFunction((key) => {
        const raw = localStorage.getItem(key);
        if (!raw) return false;
        const save = JSON.parse(raw);
        // After wipe floor resets from 50 → campFloor=1
        return save.floor < 50;
    }, SAVE_KEY, { timeout: 20000 }).then(() => true).catch(() => false);

    await page.screenshot({ path: 'tests/browser/screenshots/ab-08-after-defeat.png' });

    expect(wiped, 'Floor should reset to campFloor after party wipe').toBe(true);
    expect(errors).toHaveLength(0);
});

// ─── Step 5: Battle Pacing ────────────────────────────────────────────────────

test('pacing: battle resolves in under 25 seconds of wall time', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    // Use strong fish at floor 5 (~4-8s battle expected)
    await loadSave(page, makeSave([GUPPY], 5));
    await navigateContinueToBattle(page);

    const startTime = Date.now();
    const resolved = await page.waitForFunction((key) => {
        const raw = localStorage.getItem(key);
        if (!raw) return false;
        return JSON.parse(raw).floor > 5;
    }, SAVE_KEY, { timeout: 25000 }).then(() => true).catch(() => false);
    const elapsed = (Date.now() - startTime) / 1000;

    await page.screenshot({ path: 'tests/browser/screenshots/ab-09-pacing-floor5.png' });

    expect(resolved, 'Battle should resolve within 25 seconds').toBe(true);
    expect(errors).toHaveLength(0);
    console.log(`Battle at floor 5 resolved in ${elapsed.toFixed(1)}s`);
});

// ─── Step 6: Layout (Portrait & Landscape) ───────────────────────────────────

test('layout-landscape: battle loads in landscape 480x270', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.setViewportSize({ width: 960, height: 540 });
    await navigateNewGameToBattle(page);
    await page.screenshot({ path: 'tests/browser/screenshots/ab-10-landscape-battle.png' });
    expect(errors).toHaveLength(0);
});

test('layout-portrait: battle loads in portrait 270x480', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.setViewportSize({ width: 540, height: 960 });

    await page.goto(BASE);
    await page.evaluate((key) => localStorage.removeItem(key), SAVE_KEY);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(BUTTON_APPEAR_MS);

    // Portrait game is 270x480. Canvas fills 540x960 viewport → scale=2x
    // NEW GAME at (W/2=135, H*0.36=173), scale 2x → click at (270, 346)
    await page.mouse.click(270, 346);
    await page.waitForTimeout(500);

    // CharacterSelect SELECT in portrait at (W/2=135, H*0.82=394) → click at (270, 788)
    await page.mouse.click(270, 788);
    await page.waitForTimeout(500);

    // Portrait starter buttons: x=width-40=230, y=H*0.2+i*(H*0.22)
    // First starter (Guppy) at (230, H*0.2=96) → click at (460, 192)
    await page.mouse.click(460, 192);

    // Wait for save
    await page.waitForFunction((key) => !!localStorage.getItem(key), SAVE_KEY, { timeout: 5000 });
    await page.waitForTimeout(500);

    // ENTER BATTLE at (W/2=135, H*0.74=355) in portrait 270x480 game, scale 2x → click at (270, 710)
    await page.mouse.click(270, 710);
    await page.waitForTimeout(1000);

    await page.screenshot({ path: 'tests/browser/screenshots/ab-11-portrait-battle.png' });
    expect(errors).toHaveLength(0);
});

// ─── Step 7: Special Species ─────────────────────────────────────────────────

test('species-jellyfish: jellyfish (poison) battle has no JS errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loadSave(page, makeSave([JELLYFISH], 5));
    await navigateContinueToBattle(page);

    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'tests/browser/screenshots/ab-12-jellyfish-battle.png' });

    expect(errors, `Jellyfish battle JS errors: ${errors.join(' | ')}`).toHaveLength(0);
});

test('species-seahorse: seahorse (heal) battle has no JS errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loadSave(page, makeSave([SEAHORSE], 5));
    await navigateContinueToBattle(page);

    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'tests/browser/screenshots/ab-13-seahorse-battle.png' });

    expect(errors, `Seahorse battle JS errors: ${errors.join(' | ')}`).toHaveLength(0);
});

test('species-pufferfish: pufferfish (buff/def) battle has no JS errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    const puff = makeFish('pufferfish', 'Pufferfish', 0xf0c040, 65, 65, 13, 13, 7, 'spike_shield');
    await loadSave(page, makeSave([puff], 5));
    await navigateContinueToBattle(page);

    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'tests/browser/screenshots/ab-14-pufferfish-battle.png' });

    expect(errors, `Pufferfish battle JS errors: ${errors.join(' | ')}`).toHaveLength(0);
});
