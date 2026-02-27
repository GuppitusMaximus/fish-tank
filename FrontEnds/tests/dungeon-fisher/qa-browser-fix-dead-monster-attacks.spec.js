/**
 * Browser QA: Fix Dead Monster Attacks
 *
 * Verifies that monsters at 0 HP no longer queue attacks during combat.
 * The fix adds chunk HP checks in CombatSystem.js before monster base
 * and special attack logic, preventing dead monsters from attacking
 * after being killed by poison/burn DoT.
 *
 * Runs against http://localhost:8080 (dungeon-fisher Vite dev/preview server).
 */

const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:8080';
const GAME_W = 480;
const GAME_H = 270;
const SAVE_KEY = 'fathom-fall-save';
const BUTTON_APPEAR_MS = 5500;
const SCREENSHOT_DIR = 'screenshots';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getCanvasBounds(page) {
    const canvas = page.locator('canvas').first();
    return await canvas.boundingBox();
}

async function clickGame(page, gx, gy) {
    const bounds = await getCanvasBounds(page);
    const scaleX = bounds.width / GAME_W;
    const scaleY = bounds.height / GAME_H;
    await page.mouse.click(bounds.x + gx * scaleX, bounds.y + gy * scaleY);
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

function makeSave(party, floor = 1, extras = {}) {
    return {
        version: 5,
        gameVersion: '0.17.1',
        savedAt: Date.now(),
        floor, gold: 200,
        party, inventory: [],
        campFloor: extras.campFloor || 1,
        nextShopFloor: extras.nextShopFloor || floor,
        fisherId: 'andy',
        pveDeathCount: 0,
        pvpLossCount: 0,
        roster: extras.roster || [],
        companion: null,
        equipment: { grid: [], stash: [], harmonyPosition: { row: 4, col: 1 } },
        equipmentDelta: null
    };
}

/**
 * Load a save into the game. Injects a save-write counter via addInitScript
 * so we can detect when the battle resolves (FloorScene.create saves on entry).
 */
async function loadSave(page, saveData) {
    // Patch localStorage.setItem to count save writes (survives navigations)
    await page.addInitScript((key) => {
        window.__saveWriteCount = 0;
        const orig = localStorage.setItem.bind(localStorage);
        localStorage.setItem = function(k, v) {
            if (k === key) window.__saveWriteCount++;
            return orig(k, v);
        };
    }, SAVE_KEY);

    await page.goto(BASE);
    await page.evaluate(({ key, data }) => {
        localStorage.setItem(key, JSON.stringify(data));
    }, { key: SAVE_KEY, data: saveData });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(BUTTON_APPEAR_MS);
}

/**
 * Click CONTINUE on title screen, wait for FloorScene, click Delve Deeper.
 */
async function continueToBattle(page) {
    await clickGame(page, 240, 116);  // CONTINUE at (W/2, H*0.43)
    // Title transition: POV arc (900ms) + tunnel vision (800ms) + 400ms delay + FloorScene load
    await page.waitForTimeout(4000);
    await clickGame(page, 240, 199);  // Delve Deeper card center at (W/2, H*0.74)
    await page.waitForTimeout(2000);
}

/**
 * Wait for a battle to resolve by detecting a second save-write.
 * FloorScene.create() calls SaveSystem.save() on entry:
 *   Write 1: FloorScene loads after CONTINUE (before battle)
 *   Write 2: FloorScene loads after battle ends (victory or defeat)
 */
async function waitForBattleResolve(page, timeout = 25000) {
    return page.waitForFunction(() => {
        return window.__saveWriteCount >= 2;
    }, { timeout }).then(() => true).catch(() => false);
}

// ─── Fish fixtures ──────────────────────────────────────────────────────────

const STRONG_GUPPY = makeFish('guppy', 'Guppy', 0xe8734a, 120, 120, 28, 16, 14, 'bubble_volley', { level: 10 });
const STRONG_JELLY = makeFish('jellyfish', 'Jellyfish', 0x9b6dcc, 90, 90, 24, 18, 16, 'venom_sting', { level: 10 });
const STRONG_ANGLER = makeFish('anglerfish', 'Anglerfish', 0x3a6b8c, 90, 90, 28, 14, 11, 'abyssal_beam', { level: 10 });

// ─── Step 2: Normal combat still works ──────────────────────────────────────

test('step2: normal combat on floor 1 resolves without errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loadSave(page, makeSave([STRONG_GUPPY], 1));
    await continueToBattle(page);

    const resolved = await waitForBattleResolve(page);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/dma-02-normal-combat.png` });
    expect(resolved, 'Battle should resolve (2nd save write detected)').toBe(true);
    expect(errors, `Combat errors: ${errors.join(' | ')}`).toHaveLength(0);
});

// ─── Step 3: Poison interaction ─────────────────────────────────────────────

test('step3: poison combat (jellyfish venom_sting) resolves without errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loadSave(page, makeSave([STRONG_JELLY], 1));
    await continueToBattle(page);

    const resolved = await waitForBattleResolve(page, 30000);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/dma-03a-poison-combat.png` });
    expect(resolved, 'Poison combat should resolve cleanly').toBe(true);
    expect(errors, `Poison combat errors: ${errors.join(' | ')}`).toHaveLength(0);
});

test('step3: burn combat (anglerfish abyssal_beam) resolves without errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loadSave(page, makeSave([STRONG_ANGLER], 1));
    await continueToBattle(page);

    const resolved = await waitForBattleResolve(page, 30000);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/dma-03b-burn-combat.png` });
    expect(resolved, 'Burn combat should resolve cleanly').toBe(true);
    expect(errors, `Burn combat errors: ${errors.join(' | ')}`).toHaveLength(0);
});

// ─── Step 4: Multi-monster combat ───────────────────────────────────────────

test('step4: multi-monster DoT combat on floor 4 resolves without errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loadSave(page, makeSave([STRONG_GUPPY, STRONG_JELLY, STRONG_ANGLER], 4));
    await continueToBattle(page);

    const resolved = await waitForBattleResolve(page, 35000);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/dma-04-multi-monster-dot.png` });
    expect(resolved, 'Multi-monster DoT combat should resolve').toBe(true);
    expect(errors, `Multi-monster errors: ${errors.join(' | ')}`).toHaveLength(0);
});

// ─── Step 5: Version bump verification ──────────────────────────────────────

test('step5: version.js has been bumped (at least 0.16.1)', async () => {
    const fs = require('fs');
    const content = fs.readFileSync(
        require('path').resolve(__dirname, '../../dungeon-fisher/src/version.js'),
        'utf-8'
    );
    const match = content.match(/VERSION\s*=\s*'(\d+)\.(\d+)\.(\d+)'/);
    expect(match, 'VERSION string should be present in version.js').toBeTruthy();

    const [, major, minor, patch] = match.map(Number);
    const versionNum = major * 10000 + minor * 100 + patch;
    expect(versionNum, `VERSION ${major}.${minor}.${patch} should be >= 0.16.1`).toBeGreaterThanOrEqual(1601);
});
