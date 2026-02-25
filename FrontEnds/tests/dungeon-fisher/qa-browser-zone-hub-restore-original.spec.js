/**
 * Browser QA: Restore Original Zone Hub Visuals
 * Plan: qa-browser-zone-hub-restore-original
 *
 * Verifies the zone hub matches the original pre-ConfigLoader design:
 * atlas borders, animations, shimmer, personality effects, scene transitions,
 * info panel, floor counter, action cards, flavor text, and save/load.
 *
 * Runs against http://localhost:8080 (dungeon-fisher Vite dev/preview server).
 */

const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:8080';
const SAVE_KEY = 'fathom-fall-save';
const GAME_W = 480;
const GAME_H = 270;
const BUTTON_APPEAR_MS = 5500;
const SCREENSHOT_DIR = 'tests/dungeon-fisher/screenshots/zh-restore';

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
    // Wait for title transition + scene load + card entrance animations
    await page.waitForTimeout(6000);
}

// Card Y positions (from FloorScene layout)
// delveY = floor(H * 0.74) - cardH/2 ~= 200 - 42 = ~158 center
// topY = delveY - cardH - 8 ~= 158 - 84 - 8 = ~66 center
const DELVE_CENTER_Y = 158;
const TOP_CARD_CENTER_Y = 108;

// ─── 1. Info Panel (Top) ─────────────────────────────────────────────────────

test.describe('1. info panel', () => {

    test('source: uses sm atlas border for info panel', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        expect(src).toContain("atlasKey = zone.atlasKey + '_sm'");
    });

    test('source: translucent dark fill behind info panel border', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        // Rectangle at top with 0x000000, 0.5 alpha
        expect(src).toContain('0x000000, 0.5)');
        expect(src).toContain('.setDepth(0).setScrollFactor(0)');
    });

    test('source: gold count and inventory displayed with character accent color', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        expect(src).toContain("'Gold: ' + gs.gold");
        expect(src).toContain('accentHex(character)');
    });

    test('source: party HP bars with fish name, level, and color-coded bar', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        expect(src).toContain('fish.name');
        expect(src).toContain("fish.level");
        expect(src).toContain('ratio > 0.5 ? 0x33cc33');
        expect(src).toContain('ratio > 0.25 ? 0xcccc33 : 0xcc3333');
    });

    test('source: fainted fish show FAINTED in red', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        expect(src).toContain("alive ? fish.hp + '/' + fish.maxHp : 'FAINTED'");
        expect(src).toContain("color: alive ? '#aaaaaa' : '#cc4444'");
    });

    test('browser: info panel renders without JS errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeSave([{ ...GUPPY }, { ...PUFFER }], 1);
        await enterZoneHub(page, save);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/01-info-panel.png` });
        expect(errors).toHaveLength(0);
    });

    test('browser: fainted fish renders correctly — no errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const fainted = { ...PUFFER, hp: 0 };
        const save = makeSave([{ ...GUPPY }, fainted], 3);
        await enterZoneHub(page, save);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/01b-fainted-fish.png` });
        expect(errors).toHaveLength(0);
    });
});

// ─── 2. Action Cards — Single Card (Floor 1) ────────────────────────────────

test.describe('2. single card (floor 1)', () => {

    test('source: delve card always present, shop/camp conditional on transitionQueue', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        // Delve always in cards array
        expect(src).toContain("type: 'delve', key: 'card_delve', label: 'Delve Deeper'");
        // Shop requires transition queue
        expect(src).toContain("gs._transitionQueue && gs._transitionQueue.includes('shop')");
        // Camp requires transition queue
        expect(src).toContain("gs._transitionQueue && gs._transitionQueue.includes('camp')");
    });

    test('source: card uses sm atlas border (thin border)', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        // Card theme uses sm atlas
        expect(src).toContain("cardTheme.atlasKey = zone.atlasKey + '_sm'");
    });

    test('source: card image with dark scrim behind it', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        expect(src).toContain('cardScrim');
        expect(src).toContain('0x000000, 0.5)');
    });

    test('source: card label with scrim for readability', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        expect(src).toContain('labelScrim');
    });

    test('source: gold shimmer on delve label (warm color sweep)', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        // Delve shimmer: base [230, 180, 110], gold tones
        expect(src).toContain("base: [230, 180, 110]");
        // Shimmer implemented via addCounter tween with Phaser.Display.Color.GetColor
        expect(src).toContain('Phaser.Display.Color.GetColor');
        expect(src).toContain('label.setTint(c1, c2, c1, c2)');
    });

    test('source: slide-in entrance from bottom for delve card', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        // Delve slides from bottom (slideY = H * 0.8)
        expect(src).toContain("'delve') { slideY = H * 0.8; }");
    });

    test('source: delve personality overlay — pulsing red', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        // Red overlay for delve
        expect(src).toContain("0x880000, 0)");
        // Pulsing alpha 0 → 0.4
        expect(src).toContain("alpha: { from: 0, to: 0.4 }");
    });

    test('browser: floor 1 shows only Delve Deeper card — no errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeSave([{ ...GUPPY }], 1);
        await enterZoneHub(page, save);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/02-single-card-f1.png` });
        expect(errors).toHaveLength(0);
    });
});

// ─── 3. Card Hover Effects ──────────────────────────────────────────────────

test.describe('3. card hover', () => {

    test('source: hover scales card 1.05x and tints', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        expect(src).toContain("scaleX: 1.05, scaleY: 1.05");
        expect(src).toContain("baseImgScale * 1.05");
        expect(src).toContain("label.setTint(0xffffff)");
        expect(src).toContain("img.setTint(0xdddddd)");
    });

    test('source: pointer out restores original scale and clears tint', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        expect(src).toContain("label.clearTint()");
        expect(src).toContain("img.clearTint()");
        expect(src).toContain("scaleX: 1, scaleY: 1");
        expect(src).toContain("scaleX: baseImgScale, scaleY: baseImgScale");
    });

    test('browser: hover and unhover card — no JS errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeSave([{ ...GUPPY }], 1);
        await enterZoneHub(page, save);

        // Hover center of delve card
        await hoverGame(page, 240, DELVE_CENTER_Y);
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${SCREENSHOT_DIR}/03a-hover.png` });

        // Move away
        await hoverGame(page, 10, 10);
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${SCREENSHOT_DIR}/03b-unhover.png` });

        expect(errors).toHaveLength(0);
    });
});

// ─── 4. Scene Transition — Delve ────────────────────────────────────────────

test.describe('4. delve transition', () => {

    test('source: delve transition — camera shake → white flash → fade to black', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        expect(src).toContain("this.cameras.main.shake(200, 0.01)");
        // White flash
        expect(src).toContain("0xffffff, 0)");
        expect(src).toContain("targets: flash, alpha: 1, duration: 100");
        // Then black fade
        expect(src).toContain("0x000000, 0)");
        expect(src).toContain("targets: black, alpha: 1, duration: 300");
    });

    test('source: input disabled during transition', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        expect(src).toContain("this.input.enabled = false");
    });

    test('browser: clicking Delve Deeper starts battle — no JS errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeSave([{ ...GUPPY }, { ...PUFFER }], 1);
        await enterZoneHub(page, save);

        // Click Delve Deeper (single card center)
        await clickGame(page, 240, DELVE_CENTER_Y);
        await page.waitForTimeout(3000);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/04-delve-transition.png` });
        expect(errors).toHaveLength(0);
    });
});

// ─── 5. Post-Battle — Camp Card (After Floor 2) ────────────────────────────

test.describe('5. camp card (2 cards)', () => {

    test('source: camp card — green shimmer', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        // Camp shimmer: green base
        expect(src).toContain("base: [140, 230, 120]");
    });

    test('source: camp card slides in from right', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        // Camp slides in from right (slideX = W * 0.5)
        expect(src).toContain("'camp') { slideX = W * 0.5; }");
    });

    test('source: camp personality — flickering orange overlay', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        // Brownish-orange overlay for camp
        expect(src).toContain("0x886622, 0)");
        // Random alpha 0.15-0.45
        expect(src).toContain("0.15 + Math.random() * 0.3");
    });

    test('browser: zone hub with camp transition shows 2 cards — no errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeSave([{ ...GUPPY }, { ...PUFFER }], 2, {
            _transitionQueue: ['camp'],
            _pendingAdvance: true
        });
        await enterZoneHub(page, save);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/05-two-cards-camp.png` });
        expect(errors).toHaveLength(0);
    });
});

// ─── 6. Scene Transition — Camp ─────────────────────────────────────────────

test.describe('6. camp transition', () => {

    test('source: camp transition — warm amber fade → black', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        // Amber/warm colored overlay
        expect(src).toContain("0x442200, 0)");
        // Followed by black
        expect(src).toContain("targets: warm, alpha: 1, duration: 400");
    });

    test('source: camp onClick removes camp from queue and starts CampScene', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        expect(src).toContain("gs._transitionQueue.indexOf('camp')");
        expect(src).toContain("this.scene.start('CampScene'");
    });
});

// ─── 7. Post-Boss — Three Cards (After Floor 3) ────────────────────────────

test.describe('7. three cards (post-boss)', () => {

    test('source: shop card uses zone-specific key and name', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        expect(src).toContain('getShopCardKey(gs.floor)');
        expect(src).toContain('getShopName(gs.floor)');
    });

    test('source: shop card — yellow shimmer', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        // Yellow/gold shimmer base
        expect(src).toContain("base: [230, 210, 80]");
    });

    test('source: shop card slides in from left', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        // Shop slides in from left (slideX = -W * 0.5)
        expect(src).toContain("'shop') { slideX = -W * 0.5; }");
    });

    test('source: shop personality — gold sparkle particles', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        expect(src).toContain("this.textures.exists('particle_dot')");
        expect(src).toContain("tint: [0xffd700, 0xffee88, 0xffffff]");
        expect(src).toContain("blendMode: 'ADD'");
    });

    test('source: cards arranged — shop (top-left), delve (bottom-center), camp (top-right)', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        expect(src).toContain("'shop':  { x: margin, y: topY }");
        expect(src).toContain("'delve': { x: Math.floor((W - cardW) / 2), y: delveY }");
        expect(src).toContain("'camp':  { x: W - cardW - margin, y: topY }");
    });

    test('browser: zone hub with shop+camp transitions shows 3 cards — no errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeSave([{ ...GUPPY }, { ...PUFFER }], 3, {
            _transitionQueue: ['shop', 'camp'],
            _pendingAdvance: true
        });
        await enterZoneHub(page, save);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/07-three-cards.png` });
        expect(errors).toHaveLength(0);
    });
});

// ─── 8. Scene Transition — Shop ─────────────────────────────────────────────

test.describe('8. shop transition', () => {

    test('source: shop transition — smooth fade to black', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        // Shop uses simple black fade with Sine.InOut
        expect(src).toContain("targets: black, alpha: 1, duration: 500, ease: 'Sine.InOut'");
    });

    test('source: shop onClick removes shop from queue and starts ShopScene', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        expect(src).toContain("gs._transitionQueue.indexOf('shop')");
        expect(src).toContain("this.scene.start('ShopScene'");
    });
});

// ─── 9. Skip Transitions via Delve ──────────────────────────────────────────

test.describe('9. skip transitions via Delve', () => {

    test('source: Delve clears transition queue when pendingAdvance is set', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        expect(src).toContain('delete gs._transitionQueue');
        expect(src).toContain('delete gs._pendingAdvance');
        expect(src).toContain('gs.floor++');
    });

    test('browser: clicking Delve with 3 cards skips camp/shop — no errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeSave([{ ...GUPPY }, { ...PUFFER }], 3, {
            _transitionQueue: ['shop', 'camp'],
            _pendingAdvance: true
        });
        await enterZoneHub(page, save);

        // Click Delve Deeper (bottom-center card)
        await clickGame(page, 240, DELVE_CENTER_Y);
        await page.waitForTimeout(3000);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/09-skip-transitions.png` });
        expect(errors).toHaveLength(0);
    });
});

// ─── 10. Flavor Text ────────────────────────────────────────────────────────

test.describe('10. flavor text', () => {

    test('source: flavor text with expanding scrim reveal (Back.easeOut)', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        // Zone flavor text
        expect(src).toContain('getZoneByFloor(gs.floor).flavor');
        // Expanding reveal
        expect(src).toContain("r.setScale(0, 1)");
        expect(src).toContain("scaleX: 1");
        expect(src).toContain("ease: 'Back.easeOut'");
    });

    test('source: breathing pulse on scrim alpha', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        expect(src).toContain("alpha: { from: 0.35, to: 0.55 }");
        expect(src).toContain("yoyo: true");
    });

    test('source: floating drift (gentle vertical bob)', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        expect(src).toContain("y: '-=2'");
        expect(src).toContain("duration: 2500");
    });

    test('source: zone shimmer color sweep on flavor text', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        expect(src).toContain("zone.shimmer");
        expect(src).toContain('flavorTxt.setTint(c1, c2, c1, c2)');
    });

    test('source: zone-colored glow border around flavor text', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        expect(src).toContain('zone.panel.accent');
        expect(src).toContain('glowBorder');
    });
});

// ─── 11. Floor Counter (Bottom) ─────────────────────────────────────────────

test.describe('11. floor counter', () => {

    test('source: floor counter with atlas border and dark scrim', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        expect(src).toContain("'Floor ' + gs.floor");
        // Uses sm atlas for floor panel
        expect(src).toContain("floorTheme.atlasKey = zone.atlasKey + '_sm'");
        // Dark scrim behind
        expect(src).toContain('0x000000, 0.6)');
    });

    test('source: floor counter uses zone accent color', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        expect(src).toContain("color: accentHex(zone)");
    });

    test('browser: floor counter at floor 7 — no errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeSave([{ ...GUPPY }], 7);
        await enterZoneHub(page, save);

        const loaded = await getSave(page);
        expect(loaded).not.toBeNull();
        expect(loaded.floor).toBe(7);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/11-floor-counter-f7.png` });
        expect(errors).toHaveLength(0);
    });
});

// ─── 12. Zone Transition ────────────────────────────────────────────────────

test.describe('12. zone transition', () => {

    test('browser: floor 11 shows Goblin Caves zone — no errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeSave([{ ...GUPPY }, { ...PUFFER }], 11);
        await enterZoneHub(page, save);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/12-goblin-caves-f11.png` });
        expect(errors).toHaveLength(0);
    });

    test('browser: floor 11 with shop+camp shows zone-specific cards — no errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeSave([{ ...GUPPY }, { ...PUFFER }], 11, {
            _transitionQueue: ['shop', 'camp'],
            _pendingAdvance: true
        });
        await enterZoneHub(page, save);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/12b-goblin-caves-3cards.png` });
        expect(errors).toHaveLength(0);
    });
});

// ─── 13. Save/Load ──────────────────────────────────────────────────────────

test.describe('13. save/load', () => {

    test('source: FloorScene saves on create', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        expect(src).toContain('SaveSystem.save(gs)');
    });

    test('browser: save preserves floor and gold', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeSave([{ ...GUPPY }, { ...PUFFER }], 5, { gold: 175 });
        await enterZoneHub(page, save);

        const loaded = await getSave(page);
        expect(loaded).not.toBeNull();
        expect(loaded.floor).toBe(5);
        expect(loaded.gold).toBe(175);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/13a-save-floor5.png` });
        expect(errors).toHaveLength(0);
    });

    test('browser: reload preserves state', async ({ page }) => {
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

        await page.screenshot({ path: `${SCREENSHOT_DIR}/13b-reload.png` });
        expect(errors).toHaveLength(0);
    });
});

// ─── 14. Version ────────────────────────────────────────────────────────────

test.describe('14. version', () => {

    test('game version is 0.11.0', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc(page, '/src/version.js');
        expect(src).toContain("VERSION = '0.11.0'");
    });
});
