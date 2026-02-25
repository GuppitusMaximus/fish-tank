/**
 * Browser QA: Restore Zone Scene Hub
 * Plan: qa-browser-restore-zone-scene-hub
 *
 * Verifies: zone hub display between battles, Delve Deeper card interaction,
 * post-battle zone return, defeat flow, floor rewards, save/load, zone transitions,
 * and version number.
 *
 * Runs against http://localhost:8080 (dungeon-fisher Vite dev/preview server).
 */

const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:8080';
const SAVE_KEY = 'fathom-fall-save';
const GAME_W = 480;
const GAME_H = 270;
const BUTTON_APPEAR_MS = 5500;
const SCREENSHOT_DIR = 'tests/dungeon-fisher/screenshots';

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

async function hoverGame(page, gx, gy) {
    const bounds = await getCanvasBounds(page);
    const x = bounds.x + gx * (bounds.width / GAME_W);
    const y = bounds.y + gy * (bounds.height / GAME_H);
    await page.mouse.move(x, y);
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
const PUFFER = makeFish('pufferfish', 'Pufferfish', 0xffcc00, 60, 60, 12, 14, 8, 'spine_burst');

function makeSave(party, floor = 1, extras = {}) {
    return {
        version: 4,
        gameVersion: '0.10.0',
        savedAt: Date.now(),
        floor,
        gold: extras.gold ?? 200,
        party,
        inventory: extras.inventory || [],
        campFloor: extras.campFloor || 1,
        fisherId: 'andy',
        pveDeathCount: extras.pveDeathCount || 0,
        pvpLossCount: extras.pvpLossCount || 0,
        roster: extras.roster || [],
        companion: extras.companion || null
    };
}

async function injectSaveAndLoad(page, save) {
    await page.goto(BASE);
    await page.evaluate(([key, data]) => localStorage.setItem(key, JSON.stringify(data)), [SAVE_KEY, save]);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(BUTTON_APPEAR_MS);
}

async function freshStart(page) {
    await page.goto(BASE);
    await page.evaluate((key) => localStorage.removeItem(key), SAVE_KEY);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(BUTTON_APPEAR_MS);
}

async function getSave(page) {
    return page.evaluate((key) => {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    }, SAVE_KEY);
}

async function fetchSrc(page, path) {
    return page.evaluate(async (url) => {
        const resp = await fetch(url);
        return resp.text();
    }, `${BASE}${path}`);
}

// Click CONTINUE on title screen to enter FloorScene zone hub
async function enterZoneHub(page, save) {
    await injectSaveAndLoad(page, save);
    // CONTINUE button at height*0.43 = y~116
    await clickGame(page, 240, 116);
    // Wait for title transition animation + scene load
    await page.waitForTimeout(5000);
}

// ─── 1. Zone Hub Display — Source Verification ──────────────────────────────

test.describe('1. zone hub display (source verification)', () => {

    test('_showZoneView renders zone name', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        expect(src).toContain("zone.name");
        // Zone name centered in top info panel at y=14
        expect(src).toContain("W / 2, 14, zone.name");
    });

    test('_showZoneView renders floor counter', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        expect(src).toContain("'Floor ' + gs.floor");
        // Floor counter in bottom panel
        expect(src).toContain("H - floorPanelH / 2 - 8, 'Floor ' + gs.floor");
    });

    test('_showZoneView renders italic flavor text', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        expect(src).toContain("zone.flavor");
        expect(src).toContain("fontStyle: 'italic'");
    });

    test('_showZoneView renders Delve Deeper card', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        expect(src).toContain("'card_delve'");
        // Cards positioned at H*0.35
        expect(src).toContain("H * 0.35");
    });

    test('_showZoneView renders compact party HP bars in info panel', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        // Party HP in top info panel
        expect(src).toContain("gs.party.forEach");
        expect(src).toContain("f.name");
        // HP bar rendering
        expect(src).toContain("(f.hp / f.maxHp) * barW");
    });

    test('_showZoneView uses zone background with effects', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        expect(src).toContain("UILayout.sceneBackground(this, bgKey, { effects: true })");
    });

    test('fresh entry (no result, no transitions) routes to _showZoneView', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        // The fall-through case in _onZoneReady calls _showZoneView
        expect(src).toContain("// Fresh entry — show zone hub");
        expect(src).toContain("this._showZoneView()");
    });
});

// ─── 2. Card Interaction — Source Verification ──────────────────────────────

test.describe('2. card interaction (source verification)', () => {

    test('Delve Deeper card has hover scale effect', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        // Hover scales card image to 1.05x original
        expect(src).toContain("origScaleX * 1.05");
        expect(src).toContain("origScaleY * 1.05");
        expect(src).toContain("'pointerover'");
        expect(src).toContain("'pointerout'");
    });

    test('card is interactive with hand cursor', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        expect(src).toContain("setInteractive({ useHandCursor: true })");
    });

    test('clicking card calls onClick callback', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        expect(src).toContain("hitArea.on('pointerdown', () => card.onClick())");
    });
});

// ─── 3. Post-Battle Zone Return ─────────────────────────────────────────────

test.describe('3. post-battle zone return', () => {

    test('victory with no transitions advances and shows zone view', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        // _advanceAndRoute increments floor and calls _showZoneView
        expect(src).toContain("gs.floor++");
        // After floor advance (not floor reward, not victory screen), shows zone view
        const advanceMethod = src.match(/_advanceAndRoute\(\)[\s\S]*?^\s{4}\}/m);
        expect(advanceMethod).not.toBeNull();
        expect(advanceMethod[0]).toContain("this._showZoneView()");
    });

    test('victory with transitions sets up queue and shows zone view', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        // Transitions stored in queue, then zone hub shown with cards
        expect(src).toContain("gs._transitionQueue = transitions");
        expect(src).toContain("gs._pendingAdvance = true");
        expect(src).toContain("this._showZoneView()");
    });

    test('returning from transition with pendingAdvance calls _advanceAndRoute', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        expect(src).toContain("if (gs._pendingAdvance)");
        expect(src).toContain("delete gs._pendingAdvance");
        expect(src).toContain("this._advanceAndRoute()");
    });
});

// ─── 4. Defeat Flow ─────────────────────────────────────────────────────────

test.describe('4. defeat flow', () => {

    test('PvE defeat shows post-battle results with CONTINUE', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        // Defeat path calls _showPostBattleResults with wasDefeat=true
        expect(src).toContain("this._showPostBattleResults(halfXp, 0, true)");
        // Results screen shows "Defeat..."
        expect(src).toContain("wasDefeat ? 'Defeat...' : 'Victory!'");
        // CONTINUE button exists
        expect(src).toContain("'[ CONTINUE ]'");
    });

    test('CONTINUE after defeat calls _advanceAndRoute (zone hub)', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        // In the CONTINUE onClick, wasDefeat branch calls _advanceAndRoute
        const continueBlock = src.match(/onClick: \(\) => \{[\s\S]*?if \(wasDefeat\)[\s\S]*?this\._advanceAndRoute/);
        expect(continueBlock).not.toBeNull();
    });

    test('roguelike wipe triggers at max PvE deaths', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        expect(src).toContain("gs.pveDeathCount >= (config.maxPveDeaths || 4)");
        expect(src).toContain("this._roguelikeWipe()");
    });
});

// ─── 5. Floor Reward Flow ───────────────────────────────────────────────────

test.describe('5. floor reward flow', () => {

    test('floor reward triggers every 10 floors', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        expect(src).toContain("gs.floor % 10 === 0");
        expect(src).toContain("this._showFloorReward()");
    });

    test('accept fish reward returns to zone view', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        // ACCEPT button calls _showZoneView
        const acceptBlock = src.match(/\[ ACCEPT \][\s\S]*?_showZoneView/);
        expect(acceptBlock).not.toBeNull();
    });

    test('decline fish reward returns to zone view', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        // DECLINE button calls _showZoneView
        const declineBlock = src.match(/\[ DECLINE \][\s\S]*?_showZoneView/);
        expect(declineBlock).not.toBeNull();
    });

    test('item reward TAKE returns to zone view', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        // TAKE button calls _showZoneView
        const takeBlock = src.match(/\[ TAKE \][\s\S]*?_showZoneView/);
        expect(takeBlock).not.toBeNull();
    });
});

// ─── 6. Save/Load ───────────────────────────────────────────────────────────

test.describe('6. save/load', () => {

    test('FloorScene saves on create', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        // First thing in create() is SaveSystem.save(gs)
        expect(src).toContain("SaveSystem.save(gs)");
    });

    test('loading save returns to zone hub at correct floor', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeSave([{ ...GUPPY }, { ...PUFFER }], 5);
        await enterZoneHub(page, save);

        // Verify save was re-saved with same floor
        const loaded = await getSave(page);
        expect(loaded).not.toBeNull();
        expect(loaded.floor).toBe(5);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/zh-06-save-load-floor5.png` });
        expect(errors).toHaveLength(0);
    });

    test('reload from zone hub preserves floor state', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeSave([{ ...GUPPY }], 7);
        await enterZoneHub(page, save);

        // Reload the page (simulates close/reopen)
        await page.reload({ waitUntil: 'networkidle' });
        await page.waitForSelector('canvas', { timeout: 10000 });
        await page.waitForTimeout(BUTTON_APPEAR_MS);

        // CONTINUE should be available
        await clickGame(page, 240, 116);
        await page.waitForTimeout(5000);

        const loaded = await getSave(page);
        expect(loaded).not.toBeNull();
        expect(loaded.floor).toBe(7);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/zh-06b-reload-floor7.png` });
        expect(errors).toHaveLength(0);
    });
});

// ─── 7. Zone Transition ─────────────────────────────────────────────────────

test.describe('7. zone transition', () => {

    test('floor 11 belongs to Goblin Caves zone', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/data/themes.js');
        // Goblin Caves floor range starts at 11
        expect(src).toContain("floorRange: [11, 20]");
        expect(src).toContain("name: 'Goblin Caves'");
    });

    test('loading save at floor 11 shows Goblin Caves zone hub', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeSave([{ ...GUPPY }, { ...PUFFER }], 11);
        await enterZoneHub(page, save);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/zh-07-goblin-caves-f11.png` });
        expect(errors).toHaveLength(0);
    });

    test('zone themes define unique backgrounds for each zone', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/data/themes.js');
        expect(src).toContain("bgKey: 'bg_sewers'");
        expect(src).toContain("bgKey: 'bg_goblin-caves'");
        expect(src).toContain("bgKey: 'bg_bone-crypts'");
    });

    test('zone themes have flavor text', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/data/themes.js');
        expect(src).toContain("flavor: 'Damp sewers echo around you...'");
        expect(src).toContain("flavor: 'Goblin laughter echoes in the dark...'");
    });
});

// ─── 8. Version ─────────────────────────────────────────────────────────────

test.describe('8. version', () => {

    test('game version is 0.10.0', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/version.js');
        expect(src).toContain("VERSION = '0.10.0'");
    });
});

// ─── Browser Integration Tests ──────────────────────────────────────────────

test.describe('browser integration', () => {

    test('zone hub at floor 1: no JS errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeSave([{ ...GUPPY }, { ...PUFFER }], 1);
        await enterZoneHub(page, save);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/zh-int-01-floor1-hub.png` });
        expect(errors).toHaveLength(0);
    });

    test('zone hub at floor 1 with damaged party: no JS errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const damaged = { ...GUPPY, hp: 20 };
        const dead = { ...PUFFER, hp: 0 };
        const save = makeSave([damaged, dead], 3);
        await enterZoneHub(page, save);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/zh-int-02-damaged-party.png` });
        expect(errors).toHaveLength(0);
    });

    test('clicking Delve Deeper card starts battle: no JS errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeSave([{ ...GUPPY }, { ...PUFFER }], 1);
        await enterZoneHub(page, save);

        // Click the Delve Deeper card center (single card at W/2, H*0.35 + cardH/2 ≈ 172)
        await clickGame(page, 240, 172);
        await page.waitForTimeout(3000);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/zh-int-03-battle-start.png` });
        expect(errors).toHaveLength(0);
    });

    test('hover over Delve Deeper card changes visual: no JS errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeSave([{ ...GUPPY }], 1);
        await enterZoneHub(page, save);

        // Hover the card center (single card at 240, 172)
        await hoverGame(page, 240, 172);
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${SCREENSHOT_DIR}/zh-int-04-card-hover.png` });

        // Move away
        await hoverGame(page, 10, 10);
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${SCREENSHOT_DIR}/zh-int-04b-card-unhover.png` });

        expect(errors).toHaveLength(0);
    });

    test('new game flow reaches zone hub: no JS errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        await freshStart(page);

        // NEW GAME at height*0.36 = y~97
        await clickGame(page, 240, 97);
        await page.waitForTimeout(4000);

        // Character select: SELECT button in landscape at (width*0.65, height*0.78) = (312, 211)
        await clickGame(page, 312, 211);
        await page.waitForTimeout(1000);

        // Starter selection: Pick 2 fish
        // Landscape: first fish at x=startX, y=height*0.38+55 for button
        // startX = 240 - (starters.length-1)*60; starters.length varies
        // Pick guppy at ~120, ~158 and pufferfish at ~240, ~158
        await clickGame(page, 120, 158);
        await page.waitForTimeout(300);
        await clickGame(page, 240, 158);
        await page.waitForTimeout(300);

        // BEGIN button
        await clickGame(page, 240, 246);
        await page.waitForTimeout(5000);

        // Should now be in zone hub (FloorScene with _showZoneView)
        await page.screenshot({ path: `${SCREENSHOT_DIR}/zh-int-05-new-game-hub.png` });

        // Verify save was created at floor 1
        const save = await getSave(page);
        expect(save).not.toBeNull();
        expect(save.floor).toBe(1);

        expect(errors).toHaveLength(0);
    });

    test('zone hub at deep dungeon (floor 35): no JS errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeSave([{ ...GUPPY }, { ...PUFFER }], 35);
        await enterZoneHub(page, save);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/zh-int-06-deep-dungeon-f35.png` });
        expect(errors).toHaveLength(0);
    });
});
