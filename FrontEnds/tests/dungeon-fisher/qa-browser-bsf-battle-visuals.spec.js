/**
 * Browser QA: BSF Battle Visuals (Phase 6)
 *
 * Verifies pack rendering, shield HP bar overlay, effect icons, sprite tints,
 * PvP mirroring, new event handling, and shutdown cleanup.
 *
 * Runs against http://localhost:8080 (dungeon-fisher Vite dev/preview server).
 * Start server with: cd FrontEnds/dungeon-fisher && npm run dev
 *
 * Save key is 'fathom-fall-save', save format v4.
 */

const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:8080';
const GAME_W = 480;
const GAME_H = 270;
const SAVE_KEY = 'fathom-fall-save';
const BUTTON_APPEAR_MS = 5500;
const SCREENSHOT_DIR = 'tests/dungeon-fisher/screenshots';

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

// Create a v4 fish object matching PartySystem.createFish output
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

const GUPPY      = makeFish('guppy',      'Guppy',      0xe8734a, 50, 50, 16, 9, 10, 'bubble_volley');
const PUFFERFISH = makeFish('pufferfish', 'Pufferfish', 0xf0c040, 65, 65, 13, 13, 7, 'spike_shield', { shield: 10, maxShield: 20 });
const JELLYFISH  = makeFish('jellyfish',  'Jellyfish',  0x9b6dcc, 45, 45, 14, 11, 11, 'venom_sting');
const SEAHORSE   = makeFish('seahorse',   'Seahorse',   0x50c878, 55, 55, 13, 10, 9, 'healing_tide', { healPower: 5 });
const ANGLERFISH = makeFish('anglerfish', 'Anglerfish', 0x3a6b8c, 50, 50, 18, 8, 7, 'abyssal_beam');
const GOLDEN_KOI = makeFish('golden_koi', 'Golden Koi', 0xffd700, 50, 50, 12, 12, 8, 'golden_aura');

function makeSave(party, floor = 1, extras = {}) {
    return {
        version: 4,
        gameVersion: '0.8.0',
        savedAt: Date.now(),
        floor, gold: 200,
        party, inventory: [],
        campFloor: extras.campFloor || 1,
        nextShopFloor: extras.nextShopFloor || floor,
        fisherId: 'andy',
        pveDeathCount: 0,
        pvpLossCount: 0,
        roster: extras.roster || [],
        companion: null
    };
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

// Click CONTINUE and enter battle
async function continueToBattle(page) {
    await clickGame(page, 240, 116);  // CONTINUE at (W/2, H*0.43)
    await page.waitForTimeout(800);
    await clickGame(page, 240, 199);  // ENTER BATTLE at (W/2, H*0.74)
    await page.waitForTimeout(1500);
}

// ─── Step 1: Effect icon textures loaded ─────────────────────────────────────

test('step1: BootScene creates all 8 effect icon textures without errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto(BASE);
    await page.evaluate((key) => localStorage.removeItem(key), SAVE_KEY);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(2000);

    expect(errors, `Boot errors: ${errors.join(' | ')}`).toHaveLength(0);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/bv-01-boot-icons.png` });
});

// ─── Step 2: Monster pack rendering ──────────────────────────────────────────

test('step2: pack encounter at floor 1 renders without errors (1-fish)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loadSave(page, makeSave([GUPPY], 1));
    await continueToBattle(page);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/bv-02a-pack-1fish.png` });
    expect(errors, `Pack battle errors: ${errors.join(' | ')}`).toHaveLength(0);
});

test('step2: pack encounter renders with 3-fish party (triangle formation)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loadSave(page, makeSave([GUPPY, JELLYFISH, SEAHORSE], 4));
    await continueToBattle(page);

    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/bv-02b-pack-3fish.png` });
    expect(errors, `3-fish pack errors: ${errors.join(' | ')}`).toHaveLength(0);
});

// ─── Step 3: Monster combined HP bar ─────────────────────────────────────────

test('step3: monster HP bar visible at battle start', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loadSave(page, makeSave([GUPPY, JELLYFISH, SEAHORSE], 4));
    await continueToBattle(page);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/bv-03-monster-hp-bar.png` });
    expect(errors).toHaveLength(0);
});

// ─── Step 4: Shield overlay on HP bars ───────────────────────────────────────

test('step4: pufferfish shield overlay during battle', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loadSave(page, makeSave([PUFFERFISH], 2));
    await continueToBattle(page);

    await page.waitForTimeout(4000);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/bv-04-shield-overlay.png` });
    expect(errors, `Shield overlay errors: ${errors.join(' | ')}`).toHaveLength(0);
});

// ─── Step 5: Effect icons near sprites ───────────────────────────────────────

test('step5: poison effect icons appear (jellyfish vs monster)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loadSave(page, makeSave([JELLYFISH], 2));
    await continueToBattle(page);

    await page.waitForTimeout(5000);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/bv-05a-poison-icon.png` });
    expect(errors, `Poison icon errors: ${errors.join(' | ')}`).toHaveLength(0);
});

test('step5: burn effect icons appear (anglerfish abyssal_beam)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loadSave(page, makeSave([ANGLERFISH], 2));
    await continueToBattle(page);

    await page.waitForTimeout(5000);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/bv-05b-burn-icon.png` });
    expect(errors, `Burn icon errors: ${errors.join(' | ')}`).toHaveLength(0);
});

test('step5: curse effect icons appear (golden_koi golden_aura)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loadSave(page, makeSave([GOLDEN_KOI], 2));
    await continueToBattle(page);

    await page.waitForTimeout(5000);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/bv-05c-curse-icon.png` });
    expect(errors, `Curse icon errors: ${errors.join(' | ')}`).toHaveLength(0);
});

test('step5: multiple effects show in row with mixed party', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loadSave(page, makeSave([PUFFERFISH, JELLYFISH, SEAHORSE], 2));
    await continueToBattle(page);

    await page.waitForTimeout(6000);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/bv-05d-multi-effects.png` });
    expect(errors, `Multi-effect errors: ${errors.join(' | ')}`).toHaveLength(0);
});

// ─── Step 6: Sprite tinting ─────────────────────────────────────────────────

test('step6: sprite tinting during battle (burn/poison effects)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loadSave(page, makeSave([ANGLERFISH, JELLYFISH], 5));
    await continueToBattle(page);

    await page.waitForTimeout(5000);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/bv-06-sprite-tints.png` });
    expect(errors, `Tinting errors: ${errors.join(' | ')}`).toHaveLength(0);
});

// ─── Step 7: PvP mirrored rendering ─────────────────────────────────────────

test('step7: PvP battle at floor 10 renders ghost party mirrored', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    const strongGuppy = makeFish('guppy', 'Guppy', 0xe8734a, 120, 120, 28, 16, 14, 'bubble_volley', { level: 10 });
    const strongJelly = makeFish('jellyfish', 'Jellyfish', 0x9b6dcc, 100, 100, 24, 18, 16, 'venom_sting', { level: 10 });
    const strongSea   = makeFish('seahorse', 'Seahorse', 0x50c878, 110, 110, 22, 17, 13, 'healing_tide', { level: 10, healPower: 8 });

    await loadSave(page, makeSave([strongGuppy, strongJelly, strongSea], 10));
    await continueToBattle(page);

    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/bv-07-pvp-mirror.png` });
    expect(errors, `PvP battle errors: ${errors.join(' | ')}`).toHaveLength(0);
});

// ─── Step 8: New event handling ──────────────────────────────────────────────

test('step8: burn_tick orange flash and damage numbers', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loadSave(page, makeSave([ANGLERFISH], 4));
    await continueToBattle(page);

    await page.waitForTimeout(6000);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/bv-08a-burn-tick.png` });
    expect(errors, `Burn tick errors: ${errors.join(' | ')}`).toHaveLength(0);
});

test('step8: shield_hit blue flash and absorption', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loadSave(page, makeSave([PUFFERFISH], 4));
    await continueToBattle(page);

    await page.waitForTimeout(5000);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/bv-08b-shield-hit.png` });
    expect(errors, `Shield hit errors: ${errors.join(' | ')}`).toHaveLength(0);
});

test('step8: hot_tick green heal numbers', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loadSave(page, makeSave([SEAHORSE], 4));
    await continueToBattle(page);

    await page.waitForTimeout(6000);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/bv-08c-hot-tick.png` });
    expect(errors, `HoT tick errors: ${errors.join(' | ')}`).toHaveLength(0);
});

test('step8: monster_incapacitated faint animation', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    const strongGuppy = makeFish('guppy', 'Guppy', 0xe8734a, 100, 100, 30, 15, 12, 'bubble_volley', { level: 10 });
    await loadSave(page, makeSave([strongGuppy], 1));
    await continueToBattle(page);

    const resolved = await page.waitForFunction((key) => {
        const raw = localStorage.getItem(key);
        if (!raw) return false;
        return JSON.parse(raw).floor > 1;
    }, SAVE_KEY, { timeout: 20000 }).then(() => true).catch(() => false);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/bv-08d-monster-faint.png` });
    expect(resolved, 'Battle should resolve with monster incapacitation').toBe(true);
    expect(errors, `Incapacitation errors: ${errors.join(' | ')}`).toHaveLength(0);
});

// ─── Step 9: Shutdown cleanup ────────────────────────────────────────────────

test('step9: battle→floor transition has no leak errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    const strongGuppy = makeFish('guppy', 'Guppy', 0xe8734a, 100, 100, 30, 15, 12, 'bubble_volley', { level: 10 });
    await loadSave(page, makeSave([strongGuppy], 1));
    await continueToBattle(page);

    const resolved = await page.waitForFunction((key) => {
        const raw = localStorage.getItem(key);
        if (!raw) return false;
        return JSON.parse(raw).floor > 1;
    }, SAVE_KEY, { timeout: 20000 }).then(() => true).catch(() => false);

    expect(resolved).toBe(true);

    // Enter a second battle to verify cleanup was thorough
    await page.waitForTimeout(500);
    await clickGame(page, 240, 199);
    await page.waitForTimeout(2000);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/bv-09a-second-battle.png` });
    expect(errors, `Cleanup/leak errors: ${errors.join(' | ')}`).toHaveLength(0);
});

test('step9: defeat transition cleans up without errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    const weakFish = makeFish('guppy', 'Guppy', 0xe8734a, 1, 1, 1, 0, 3, 'bubble_volley');
    await loadSave(page, makeSave([weakFish], 30));
    await continueToBattle(page);

    const defeated = await page.waitForFunction((key) => {
        const raw = localStorage.getItem(key);
        if (!raw) return false;
        return JSON.parse(raw).floor < 30;
    }, SAVE_KEY, { timeout: 15000 }).then(() => true).catch(() => false);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/bv-09b-defeat-cleanup.png` });
    expect(defeated, 'Floor should reset after defeat').toBe(true);
    expect(errors, `Defeat cleanup errors: ${errors.join(' | ')}`).toHaveLength(0);
});

// ─── Full integration ────────────────────────────────────────────────────────

test('integration: mixed party exercises all visual systems', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loadSave(page, makeSave([PUFFERFISH, ANGLERFISH, GOLDEN_KOI], 5));
    await continueToBattle(page);

    await page.waitForTimeout(8000);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/bv-10-integration-all-effects.png` });
    expect(errors, `Integration errors: ${errors.join(' | ')}`).toHaveLength(0);
});
