/**
 * Browser QA: Full Zone Hub with Action Cards
 * Plan: qa-browser-zone-hub-full-cards
 *
 * Verifies: 3-card zone hub layout, conditional action cards, top info panel,
 * bottom floor counter, card hover/click, post-battle transitions, skip
 * transitions, save/load, and version number.
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
        gameVersion: '0.11.0',
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
        companion: extras.companion || null,
        // Transient transition state (not persisted by SaveSystem, but
        // survives in-memory through JSON parse → gameState flow)
        ...(extras._transitionQueue ? { _transitionQueue: extras._transitionQueue } : {}),
        ...(extras._pendingAdvance ? { _pendingAdvance: extras._pendingAdvance } : {})
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

async function enterZoneHub(page, save) {
    await injectSaveAndLoad(page, save);
    // CONTINUE button at height*0.43 = y~116
    await clickGame(page, 240, 116);
    // Wait for title transition animation + scene load
    await page.waitForTimeout(5000);
}

// ─── Card position helpers (based on FloorScene layout math) ─────────────

// Card Y center: H * 0.35 + cardH/2 where cardH = 110 * 1.4 = 154
// So card center Y = 94.5 + 77 = ~172
const CARD_CENTER_Y = 172;

// 1 card: center at (240, 172)
// 2 cards: card 1 at (181, 172), card 2 at (299, 172)
// 3 cards: card 1 at (122, 172), card 2 at (240, 172), card 3 at (358, 172)

// ─── 1. Zone Hub Layout (Fresh Start — Floor 1) ─────────────────────────────

test.describe('1. zone hub layout (floor 1)', () => {

    test('source: _showZoneView creates top info panel with sm atlas border', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        // Info panel uses sm atlas border
        expect(src).toContain("atlasKey = zone.atlasKey + '_sm'");
        // Translucent fill behind border
        expect(src).toContain('0x000000, 0.5)');
    });

    test('source: info panel shows party HP bars with fish names', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        expect(src).toContain('gs.party.forEach');
        expect(src).toContain('fish.name');
        expect(src).toContain('ratio * barW');
    });

    test('source: info panel shows gold count with character accent color', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        expect(src).toContain("'Gold: ' + gs.gold");
        expect(src).toContain("accentHex(character)");
    });

    test('source: only Delve Deeper card on floor 1 (no transition queue)', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        // Delve Deeper always pushed
        expect(src).toContain("key: 'card_delve'");
        expect(src).toContain("label: 'Delve Deeper'");
        // Shop requires _transitionQueue.includes('shop')
        expect(src).toContain("gs._transitionQueue && gs._transitionQueue.includes('shop')");
        // Camp requires _transitionQueue.includes('camp')
        expect(src).toContain("gs._transitionQueue && gs._transitionQueue.includes('camp')");
    });

    test('source: flavor text rendered from zone data', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        expect(src).toContain('getZoneByFloor(gs.floor).flavor');
        expect(src).toContain('TEXT_STYLES.FLAVOR');
    });

    test('source: floor counter panel at bottom with atlas border', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        expect(src).toContain("'Floor ' + gs.floor");
        expect(src).toContain("floorTheme.atlasKey = zone.atlasKey + '_sm'");
    });

    test('browser: zone hub at floor 1 renders without JS errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeSave([{ ...GUPPY }, { ...PUFFER }], 1);
        await enterZoneHub(page, save);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/zhfc-01-floor1-hub.png` });
        expect(errors).toHaveLength(0);
    });

    test('browser: fresh game reaches zone hub at floor 1', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        await freshStart(page);

        // NEW GAME
        await clickGame(page, 240, 97);
        await page.waitForTimeout(4000);

        // Character select: SELECT button
        await clickGame(page, 312, 211);
        await page.waitForTimeout(1000);

        // Starter selection: Pick 2 fish
        await clickGame(page, 120, 158);
        await page.waitForTimeout(300);
        await clickGame(page, 240, 158);
        await page.waitForTimeout(300);

        // BEGIN button
        await clickGame(page, 240, 246);
        await page.waitForTimeout(5000);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/zhfc-01b-fresh-start.png` });

        const save = await getSave(page);
        expect(save).not.toBeNull();
        expect(save.floor).toBe(1);
        expect(errors).toHaveLength(0);
    });
});

// ─── 2. Card Hover and Click ─────────────────────────────────────────────────

test.describe('2. card hover and click', () => {

    test('source: card has hover scale effect (1.05x)', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        expect(src).toContain('scaleX: 1.05, scaleY: 1.05');
        expect(src).toContain('baseImgScale * 1.05');
        expect(src).toContain("'pointerover'");
        expect(src).toContain("'pointerout'");
    });

    test('source: card hit area is interactive with hand cursor', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        expect(src).toContain('setInteractive({ useHandCursor: true })');
    });

    test('source: clicking card triggers transition callback', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        expect(src).toContain("hit.on('pointerdown'");
        expect(src).toContain("this._transitionTo('delve'");
    });

    test('browser: hover over Delve Deeper card — no JS errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeSave([{ ...GUPPY }], 1);
        await enterZoneHub(page, save);

        // Hover center of single card at (240, 172)
        await hoverGame(page, 240, CARD_CENTER_Y);
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${SCREENSHOT_DIR}/zhfc-02a-hover.png` });

        // Move away
        await hoverGame(page, 10, 10);
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${SCREENSHOT_DIR}/zhfc-02b-unhover.png` });

        expect(errors).toHaveLength(0);
    });

    test('browser: click Delve Deeper card starts battle — no JS errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeSave([{ ...GUPPY }, { ...PUFFER }], 1);
        await enterZoneHub(page, save);

        // Click Delve Deeper (single card center)
        await clickGame(page, 240, CARD_CENTER_Y);
        await page.waitForTimeout(3000);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/zhfc-02c-battle-start.png` });
        expect(errors).toHaveLength(0);
    });
});

// ─── 3. Post-Battle Transition Cards (Floor 2 — After Pack Pair) ─────────────

test.describe('3. post-battle transition cards (2 cards)', () => {

    test('source: camp transition after pack pair (idx%3===1)', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/systems/EncounterSystem.js');
        expect(src).toContain('idx % 3 === 1');
        expect(src).toContain("config.transitions.pack_pair");
    });

    test('source: encounter config maps pack_pair to camp', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/config/encounters.json');
        expect(src).toContain('"pack_pair": "camp"');
    });

    test('source: camp card built when camp in transition queue', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        expect(src).toContain("key: 'card_camp'");
        expect(src).toContain("label: 'Make Camp'");
    });

    test('source: camp onClick removes camp from queue and starts CampScene', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        expect(src).toContain("gs._transitionQueue.indexOf('camp')");
        expect(src).toContain("this.scene.start('CampScene'");
    });

    test('browser: zone hub with camp transition shows 2 cards — no JS errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeSave([{ ...GUPPY }, { ...PUFFER }], 2, {
            _transitionQueue: ['camp'],
            _pendingAdvance: true
        });
        await enterZoneHub(page, save);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/zhfc-03-two-cards.png` });
        expect(errors).toHaveLength(0);
    });
});

// ─── 4. Boss Transitions (Floor 3 — After Boss) ─────────────────────────────

test.describe('4. boss transitions (3 cards)', () => {

    test('source: boss transitions return shop + camp', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/config/encounters.json');
        expect(src).toContain('"boss": ["shop", "camp"]');
    });

    test('source: shop card uses zone-specific key and name', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        expect(src).toContain('getShopCardKey(gs.floor)');
        expect(src).toContain('getShopName(gs.floor)');
    });

    test('source: shop onClick removes shop from queue and starts ShopScene', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        expect(src).toContain("gs._transitionQueue.indexOf('shop')");
        expect(src).toContain("this.scene.start('ShopScene'");
    });

    test('browser: zone hub with shop+camp transitions shows 3 cards — no JS errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeSave([{ ...GUPPY }, { ...PUFFER }], 3, {
            _transitionQueue: ['shop', 'camp'],
            _pendingAdvance: true
        });
        await enterZoneHub(page, save);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/zhfc-04-three-cards.png` });
        expect(errors).toHaveLength(0);
    });

    test('browser: zone hub with only camp remaining shows 2 cards — no JS errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        // Simulate: shop was visited, only camp left
        const save = makeSave([{ ...GUPPY }, { ...PUFFER }], 3, {
            _transitionQueue: ['camp'],
            _pendingAdvance: true
        });
        await enterZoneHub(page, save);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/zhfc-04b-shop-visited.png` });
        expect(errors).toHaveLength(0);
    });

    test('browser: zone hub with only Delve Deeper (all transitions done) — no JS errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        // No transition queue — just Delve Deeper
        const save = makeSave([{ ...GUPPY }, { ...PUFFER }], 4);
        await enterZoneHub(page, save);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/zhfc-04c-transitions-done.png` });
        expect(errors).toHaveLength(0);
    });
});

// ─── 5. Skip Transitions via Delve Deeper ────────────────────────────────────

test.describe('5. skip transitions via Delve Deeper', () => {

    test('source: Delve Deeper clears transition queue when pendingAdvance is set', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        // Inside Delve Deeper click handler: delete queue, advance floor
        expect(src).toContain('delete gs._transitionQueue');
        expect(src).toContain('delete gs._pendingAdvance');
        expect(src).toContain('gs.floor++');
    });

    test('browser: clicking Delve Deeper skips camp/shop, starts encounter — no JS errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeSave([{ ...GUPPY }, { ...PUFFER }], 3, {
            _transitionQueue: ['shop', 'camp'],
            _pendingAdvance: true
        });
        await enterZoneHub(page, save);

        // Click Delve Deeper (first card at x=122 for 3-card layout)
        await clickGame(page, 122, CARD_CENTER_Y);
        await page.waitForTimeout(3000);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/zhfc-05-skip-transitions.png` });
        expect(errors).toHaveLength(0);
    });
});

// ─── 6. Info Panel Updates ───────────────────────────────────────────────────

test.describe('6. info panel updates', () => {

    test('source: gold displayed with character accent color', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        expect(src).toContain("'Gold: ' + gs.gold");
        expect(src).toContain("accentHex(character)");
    });

    test('source: HP bar color changes based on health ratio', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        // Green above 50%, yellow above 25%, red below 25%
        expect(src).toContain('ratio > 0.5 ? 0x33cc33');
        expect(src).toContain('ratio > 0.25 ? 0xcccc33 : 0xcc3333');
    });

    test('source: zone fetched by current floor', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        expect(src).toContain('getZoneByFloor(gs.floor)');
    });

    test('browser: damaged party shows colored HP bars — no JS errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const damaged = { ...GUPPY, hp: 12 }; // 24% → red
        const hurt = { ...PUFFER, hp: 35 };     // 58% → green
        const save = makeSave([damaged, hurt], 3, { gold: 350 });
        await enterZoneHub(page, save);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/zhfc-06-damaged-party.png` });
        expect(errors).toHaveLength(0);
    });

    test('browser: zone hub at floor 11 shows Goblin Caves zone — no JS errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeSave([{ ...GUPPY }, { ...PUFFER }], 11);
        await enterZoneHub(page, save);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/zhfc-06b-goblin-caves.png` });
        expect(errors).toHaveLength(0);
    });
});

// ─── 7. Floor Counter ────────────────────────────────────────────────────────

test.describe('7. floor counter', () => {

    test('source: floor counter in bottom panel with atlas border', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        expect(src).toContain("'Floor ' + gs.floor");
        // Uses sm atlas and zone accent color
        expect(src).toContain("floorTheme.atlasKey = zone.atlasKey + '_sm'");
        expect(src).toContain("color: accentHex(zone)");
    });

    test('browser: floor counter at various floors — no JS errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        // Floor 7 — mid-zone
        const save = makeSave([{ ...GUPPY }], 7);
        await enterZoneHub(page, save);

        const loaded = await getSave(page);
        expect(loaded).not.toBeNull();
        expect(loaded.floor).toBe(7);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/zhfc-07-floor7.png` });
        expect(errors).toHaveLength(0);
    });
});

// ─── 8. Save/Load ────────────────────────────────────────────────────────────

test.describe('8. save/load', () => {

    test('source: FloorScene saves on create', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        expect(src).toContain('SaveSystem.save(gs)');
    });

    test('browser: save preserves floor and gold after entering zone hub', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeSave([{ ...GUPPY }, { ...PUFFER }], 5, { gold: 175 });
        await enterZoneHub(page, save);

        const loaded = await getSave(page);
        expect(loaded).not.toBeNull();
        expect(loaded.floor).toBe(5);
        expect(loaded.gold).toBe(175);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/zhfc-08a-save-floor5.png` });
        expect(errors).toHaveLength(0);
    });

    test('browser: reload from zone hub preserves state', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeSave([{ ...GUPPY }], 8, { gold: 500 });
        await enterZoneHub(page, save);

        // Reload (simulates close/reopen)
        await page.reload({ waitUntil: 'networkidle' });
        await page.waitForSelector('canvas', { timeout: 10000 });
        await page.waitForTimeout(BUTTON_APPEAR_MS);

        // CONTINUE
        await clickGame(page, 240, 116);
        await page.waitForTimeout(5000);

        const loaded = await getSave(page);
        expect(loaded).not.toBeNull();
        expect(loaded.floor).toBe(8);
        expect(loaded.gold).toBe(500);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/zhfc-08b-reload.png` });
        expect(errors).toHaveLength(0);
    });
});

// ─── 9. Version ──────────────────────────────────────────────────────────────

test.describe('9. version', () => {

    test('game version is 0.11.0', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/version.js');
        expect(src).toContain("VERSION = '0.11.0'");
    });
});
