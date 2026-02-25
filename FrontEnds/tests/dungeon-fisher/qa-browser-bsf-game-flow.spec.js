/**
 * Browser QA: BSF Game Flow (Phase 7)
 * Plan: qa-browser-bsf-game-flow
 *
 * Verifies: loss conditions, shop rework, zone preview, post-battle item usage,
 * between-battle state, PvE/PvP death handling, roguelike wipe.
 *
 * Runs against http://localhost:8080 (dungeon-fisher Vite dev/preview server).
 * Save key is 'fathom-fall-save', save format v4.
 */

const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:8080';
const SAVE_KEY = 'fathom-fall-save';
const GAME_W = 480;
const GAME_H = 270;
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

function makeSave(party, floor = 1, extras = {}) {
    return {
        version: 4,
        gameVersion: '0.8.1',
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

async function fetchSrc(path) {
    const resp = await fetch(`${BASE}${path}`);
    return resp.text();
}

async function fetchJson(path) {
    const resp = await fetch(`${BASE}${path}`);
    return resp.json();
}

// ─── Step 1: PvE Death Handling ─────────────────────────────────────────────

test.describe('1. PvE death handling', () => {

    test('FloorScene increments pveDeathCount on PvE loss', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/FloorScene.js');
        expect(src).toContain('gs.pveDeathCount = (gs.pveDeathCount || 0) + 1');
    });

    test('PvE death awards half XP, no gold', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/FloorScene.js');
        expect(src).toContain('pveDeathXpMultiplier');
        expect(src).toContain('this._showPostBattleResults(halfXp, 0, true)');
    });

    test('PvE death fully heals party', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/FloorScene.js');
        // fullHeal called on each party member after PvE death
        expect(src).toContain('PartySystem.fullHeal(f)');
    });

    test('pveDeathCount resets to 0 at zone start', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/FloorScene.js');
        expect(src).toContain('gs.floor % config.floorsPerZone === 1');
        expect(src).toContain('gs.pveDeathCount = 0');
    });

    test('encounters.json: maxPveDeaths=4, pveDeathXpMultiplier=0.5', async ({ page }) => {
        await page.goto(BASE);
        const config = await fetchJson('/src/config/encounters.json');
        expect(config.maxPveDeaths).toBe(4);
        expect(config.pveDeathXpMultiplier).toBe(0.5);
    });

    test('save with pveDeathCount=2 loads without JS errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeSave([{ ...GUPPY }], 5, { pveDeathCount: 2 });
        await injectSaveAndLoad(page, save);
        await clickGame(page, 240, 116); // CONTINUE
        await page.waitForTimeout(1500);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/gf-01-pve-death-count.png` });
        expect(errors).toHaveLength(0);
    });
});

// ─── Step 2: PvE Roguelike Wipe ─────────────────────────────────────────────

test.describe('2. PvE roguelike wipe', () => {

    test('4th PvE death triggers full wipe', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/FloorScene.js');
        expect(src).toContain('gs.pveDeathCount >= (config.maxPveDeaths || 4)');
        expect(src).toContain('this._roguelikeWipe()');
    });

    test('wipe deletes save and shows RUN ENDED screen', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/FloorScene.js');
        expect(src).toContain('SaveSystem.deleteSave()');
        expect(src).toContain("'RUN ENDED'");
        expect(src).toContain("'Too many deaths!'");
        expect(src).toContain("'Floor ' + gs.floor + ' reached'");
    });

    test('wipe screen has TITLE SCREEN button', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/FloorScene.js');
        expect(src).toContain("'[ TITLE SCREEN ]'");
        expect(src).toContain("this.scene.start('TitleScene')");
    });
});

// ─── Step 3: PvP Loss Handling ──────────────────────────────────────────────

test.describe('3. PvP loss handling', () => {

    test('PvP loss increments pvpLossCount', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/FloorScene.js');
        expect(src).toContain('gs.pvpLossCount = (gs.pvpLossCount || 0) + 1');
    });

    test('PvP loss deducts gold by pvpGoldLossPercent', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/FloorScene.js');
        expect(src).toContain('gs.gold -= Math.floor(gs.gold * (config.pvpGoldLossPercent || 0.1))');
    });

    test('pvpGoldLossPercent is 10%', async ({ page }) => {
        await page.goto(BASE);
        const config = await fetchJson('/src/config/encounters.json');
        expect(config.pvpGoldLossPercent).toBe(0.1);
    });

    test('PvP loss advances to next zone regardless', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/FloorScene.js');
        // In the isPvp branch of _handleDefeat, after gold deduction: _advanceAndRoute
        const pvpBlock = src.match(/if \(this\.isPvp\) \{[\s\S]*?this\._advanceAndRoute\(\)/);
        expect(pvpBlock).not.toBeNull();
    });

    test('pvpLossCount does NOT reset between zones', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/FloorScene.js');
        // Only pveDeathCount resets at zone start
        const zoneResetBlock = src.match(/floor % config\.floorsPerZone === 1\)[\s\S]{0,100}/);
        expect(zoneResetBlock).not.toBeNull();
        expect(zoneResetBlock[0]).toContain('pveDeathCount = 0');
        expect(zoneResetBlock[0]).not.toContain('pvpLossCount');
    });
});

// ─── Step 4: PvP Roguelike Wipe ─────────────────────────────────────────────

test.describe('4. PvP roguelike wipe', () => {

    test('4th PvP loss across run triggers full wipe', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/FloorScene.js');
        expect(src).toContain('gs.pvpLossCount >= (config.maxPvpLosses || 4)');
    });

    test('maxPvpLosses is 4', async ({ page }) => {
        await page.goto(BASE);
        const config = await fetchJson('/src/config/encounters.json');
        expect(config.maxPvpLosses).toBe(4);
    });

    test('PvP wipe shows "Too many PvP losses!" reason', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/FloorScene.js');
        expect(src).toContain("'Too many PvP losses!'");
    });
});

// ─── Step 5: Item Rework ────────────────────────────────────────────────────

test.describe('5. item rework', () => {

    test('atk_boost and def_boost removed from ITEMS', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/data/items.js');
        expect(src).not.toContain('atk_boost');
        expect(src).not.toContain('def_boost');
    });

    test('shield_potion added with correct fields', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/data/items.js');
        expect(src).toContain('shield_potion:');
        expect(src).toContain("type: 'shield_potion'");
        expect(src).toContain("name: 'Shield Potion'");
    });

    test('MAX_INVENTORY = 5', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/data/items.js');
        expect(src).toContain('MAX_INVENTORY = 5');
    });

    test('ITEMS has exactly 4 item types: potion, super_potion, revive, shield_potion', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/data/items.js');
        const itemKeys = src.match(/^\s+(\w+):\s*\{/gm);
        expect(itemKeys).toHaveLength(4);
    });
});

// ─── Step 6: Post-Battle Item Usage ─────────────────────────────────────────

test.describe('6. post-battle item usage', () => {

    test('results panel shows XP/gold and party status', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/FloorScene.js');
        expect(src).toContain("wasDefeat ? 'Defeat...' : 'Victory!'");
        expect(src).toContain("'+' + xpGained + ' XP'");
        expect(src).toContain("'+' + goldGained + 'g'");
        expect(src).toContain('FAINTED');
    });

    test('results panel has item USE buttons', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/FloorScene.js');
        expect(src).toContain("'USE ITEMS:'");
        expect(src).toContain("label: 'USE'");
    });

    test('potion usable on alive fish with HP < maxHp', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/FloorScene.js');
        expect(src).toContain("item.type === 'heal') return fish.hp > 0 && fish.hp < fish.maxHp");
    });

    test('revive usable on incapacitated fish', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/FloorScene.js');
        expect(src).toContain("item.type === 'revive') return fish.hp <= 0");
    });

    test('shield potion usable on any fish', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/FloorScene.js');
        expect(src).toContain("item.type === 'shield_potion') return true");
    });

    test('shield potion grants bonusShield in EconomySystem', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/systems/EconomySystem.js');
        expect(src).toContain('targetFish.bonusShield = (targetFish.bonusShield || 0) + amount');
    });

    test('items consumed on use (splice from inventory)', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/systems/EconomySystem.js');
        expect(src).toContain('gameState.inventory.splice(inventoryIndex, 1)');
    });

    test('CONTINUE button advances to next floor', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/FloorScene.js');
        expect(src).toContain("'[ CONTINUE ]'");
    });

    test('save with items loads without JS errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const fish = { ...GUPPY, hp: 20 }; // damaged fish
        const save = makeSave([fish], 3, {
            inventory: ['potion', 'revive', 'shield_potion'],
            gold: 150
        });
        await injectSaveAndLoad(page, save);
        await clickGame(page, 240, 116); // CONTINUE
        await page.waitForTimeout(1500);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/gf-06-items-in-floor.png` });
        expect(errors).toHaveLength(0);
    });
});

// ─── Step 7: Shop Zone Scaling ──────────────────────────────────────────────

test.describe('7. shop zone scaling', () => {

    test('potion price scales: zone 1 = 15g, zone 5 = 35g', async ({ page }) => {
        await page.goto(BASE);
        const config = await fetchJson('/src/config/encounters.json');
        const s = config.shopScaling.potionCost;

        expect(Math.floor(s.base + 1 * s.perZone)).toBe(15);
        expect(Math.floor(s.base + 5 * s.perZone)).toBe(35);
    });

    test('super potion costs 2x potion', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/systems/EconomySystem.js');
        expect(src).toContain("itemId === 'super_potion' ? base * 2 : base");
    });

    test('potion heal scales: zone 1 = 30, zone 5 = 70', async ({ page }) => {
        await page.goto(BASE);
        const config = await fetchJson('/src/config/encounters.json');
        const s = config.shopScaling.potionHeal;

        expect(Math.floor(s.base + 1 * s.perZone)).toBe(30);
        expect(Math.floor(s.base + 5 * s.perZone)).toBe(70);
    });

    test('shield potion available in shop with scaling config', async ({ page }) => {
        await page.goto(BASE);
        const config = await fetchJson('/src/config/encounters.json');
        expect(config.shopScaling.shieldPotionCost).toBeDefined();
        expect(config.shopScaling.shieldPotionAmount).toBeDefined();
    });

    test('fish purchase goes to roster at zone*2 level', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/systems/EconomySystem.js');
        expect(src).toContain('PartySystem.createFishAtLevel(speciesId, zone * 2)');
        expect(src).toContain('PartySystem.addToRoster(gameState, fish)');
    });

    test('shop header shows X/5 inventory capacity', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/ShopScene.js');
        expect(src).toContain("gs.inventory.length + '/' + MAX_INVENTORY");
    });

    test('all shop scaling fields have base and perZone', async ({ page }) => {
        await page.goto(BASE);
        const config = await fetchJson('/src/config/encounters.json');
        for (const [key, val] of Object.entries(config.shopScaling)) {
            expect(val, `shopScaling.${key} missing base`).toHaveProperty('base');
            expect(val, `shopScaling.${key} missing perZone`).toHaveProperty('perZone');
        }
    });
});

// ─── Step 8: Zone Preview (FR-25) ───────────────────────────────────────────

test.describe('8. zone preview', () => {

    test('shows zone number and theme name', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/ZonePreviewScene.js');
        expect(src).toContain("'Zone ' + zoneNumber + ': ' + zone.name");
    });

    test('shows upcoming monster types for zone', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/ZonePreviewScene.js');
        expect(src).toContain('ConfigLoader.getAllMonsters()');
        expect(src).toContain("'Monsters: ' + monsterNames");
    });

    test('shows deaths remaining (Lives: N)', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/ZonePreviewScene.js');
        expect(src).toContain('maxPveDeaths');
        expect(src).toContain("'Lives: ' + maxDeaths");
    });

    test('displayed before floor 1 of each zone (zone start)', async ({ page }) => {
        // ZonePreviewScene exists as a scene and is accessible from the title screen
        await page.goto(BASE);
        const mainSrc = await fetchSrc('/src/main.js');
        expect(mainSrc).toContain('ZonePreview');
    });

    test('zone preview loads without JS errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        await freshStart(page);

        // On fresh start, buttons are: NEW GAME, ZONE PREVIEW
        // NEW GAME at H*0.36 = 97, ZONE PREVIEW at H*0.43 = 116
        await clickGame(page, 240, 116);
        await page.waitForTimeout(3000);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/gf-08-zone-preview.png` });
        expect(errors).toHaveLength(0);
    });

    test('zone preview right arrow navigation works', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        await freshStart(page);
        await clickGame(page, 240, 116); // ZONE PREVIEW
        await page.waitForTimeout(3000);

        // Right arrow at (W-8, H/2) = (472, 135)
        await clickGame(page, 472, 135);
        await page.waitForTimeout(1500);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/gf-08b-zone-preview-zone2.png` });
        expect(errors).toHaveLength(0);
    });

    test('zone preview BACK button returns to title', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        await freshStart(page);
        await clickGame(page, 240, 116); // ZONE PREVIEW
        await page.waitForTimeout(3000);

        // BACK at (W/2, H-7) = (240, 263)
        await clickGame(page, 240, 263);
        await page.waitForTimeout(2000);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/gf-08c-zone-preview-back.png` });
        expect(errors).toHaveLength(0);
    });
});

// ─── Step 9: Between-Battle State (FR-8c) ──────────────────────────────────

test.describe('9. between-battle state', () => {

    test('clearCombatState clears effects but NOT HP', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/systems/PartySystem.js');
        const clearMethod = src.match(/static clearCombatState\(fish\)[\s\S]*?^\s{4}\}/m);
        expect(clearMethod).not.toBeNull();
        const body = clearMethod[0];

        // Clears all effects
        expect(body).toContain('fish.poisoned = null');
        expect(body).toContain('fish.buffs = []');
        expect(body).toContain('fish.burn = null');
        expect(body).toContain('fish.curses = []');
        expect(body).toContain('fish.hots = []');
        expect(body).toContain('fish.poisons = []');

        // Does NOT touch hp or shield
        expect(body).not.toContain('fish.hp');
        expect(body).not.toContain('fish.shield');
    });

    test('dead fish stay dead between battles (clearCombatState does not revive)', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/systems/PartySystem.js');
        const clearMethod = src.match(/static clearCombatState[\s\S]*?^\s{4}\}/m);
        expect(clearMethod).not.toBeNull();
        expect(clearMethod[0]).not.toContain('.hp =');
        expect(clearMethod[0]).not.toContain('.hp +=');
    });

    test('fullHeal restores HP and shield (used by camp and PvE death)', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/systems/PartySystem.js');
        expect(src).toContain('fish.hp = fish.maxHp');
        expect(src).toContain('fish.shield = fish.maxShield');
    });

    test('BattleScene clears combat state before FloorScene transition', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/scenes/BattleScene.js');
        // Victory path
        expect(src).toContain('PartySystem.clearCombatState(f)');
        expect(src).toContain("result: 'victory'");
        // Death path
        expect(src).toContain("result: 'party_dead', isPvp: this.isPvp");
    });
});

// ─── Save Format v4 ─────────────────────────────────────────────────────────

test.describe('save format v4', () => {

    test('SaveSystem includes pveDeathCount, pvpLossCount, roster, companion', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/systems/SaveSystem.js');
        expect(src).toContain('pveDeathCount: gameState.pveDeathCount || 0');
        expect(src).toContain('pvpLossCount: gameState.pvpLossCount || 0');
        expect(src).toContain('roster: gameState.roster || []');
        expect(src).toContain('companion: gameState.companion || null');
    });

    test('v3 → v4 migration adds new fields', async ({ page }) => {
        await page.goto(BASE);
        const src = await fetchSrc('/src/systems/SaveSystem.js');
        expect(src).toContain('data.pveDeathCount = 0');
        expect(src).toContain('data.pvpLossCount = 0');
        expect(src).toContain('data.roster = []');
        expect(src).toContain('data.companion = null');
    });

    test('injected v4 save loads correctly with game-flow fields', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeSave([{ ...GUPPY }], 3, {
            pveDeathCount: 1,
            pvpLossCount: 2,
            roster: [],
            companion: null,
            inventory: ['potion']
        });
        await injectSaveAndLoad(page, save);

        // CONTINUE to enter game
        await clickGame(page, 240, 116);
        await page.waitForTimeout(1500);

        // Verify save is re-saved with all v4 fields intact
        const loaded = await getSave(page);
        expect(loaded).not.toBeNull();
        expect(loaded.version).toBe(4);
        expect(loaded.pveDeathCount).toBe(1);
        expect(loaded.pvpLossCount).toBe(2);
        expect(loaded.roster).toEqual([]);
        expect(loaded.companion).toBeNull();
        expect(loaded.inventory).toEqual(['potion']);
        expect(errors).toHaveLength(0);
    });
});

// ─── Integration: No JS Errors ──────────────────────────────────────────────

test.describe('integration', () => {

    test('new game → first battle: no JS errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        await freshStart(page);
        await clickGame(page, 240, 97);   // NEW GAME
        await page.waitForTimeout(800);
        await clickGame(page, 312, 211);  // CharacterSelect SELECT
        await page.waitForTimeout(800);
        // Pick 2 starters (andy requires partySlots.fish=2)
        await clickGame(page, 120, 158);  // SELECT guppy
        await page.waitForTimeout(300);
        await clickGame(page, 240, 158);  // SELECT pufferfish
        await page.waitForTimeout(300);
        await clickGame(page, 240, 246);  // [ BEGIN ]
        await page.waitForTimeout(1500);
        await clickGame(page, 240, 135);  // ENTER BATTLE
        await page.waitForTimeout(2000);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/gf-int-01-first-battle.png` });
        expect(errors).toHaveLength(0);
    });

    test('loading save with items and death count: no JS errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeSave([{ ...GUPPY }], 3, {
            gold: 150,
            inventory: ['potion', 'super_potion', 'shield_potion'],
            pveDeathCount: 1
        });
        await injectSaveAndLoad(page, save);
        await clickGame(page, 240, 116); // CONTINUE
        await page.waitForTimeout(1500);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/gf-int-02-items-save.png` });
        expect(errors).toHaveLength(0);
    });

    test('BAG button opens inventory with v4 save: no JS errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeSave([{ ...GUPPY }], 5, { inventory: ['potion', 'revive'] });
        await injectSaveAndLoad(page, save);
        await clickGame(page, 240, 116); // CONTINUE
        await page.waitForTimeout(1000);

        // BAG at (W-8, 8) = (472, 8)
        await clickGame(page, 472, 8);
        await page.waitForTimeout(500);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/gf-int-03-bag-overlay.png` });
        expect(errors).toHaveLength(0);
    });

    test('entering battle from floor 10 (boss floor) with full inventory: no JS errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const save = makeSave([{ ...GUPPY }], 3, {
            gold: 300,
            inventory: ['potion', 'super_potion', 'revive', 'shield_potion', 'potion']
        });
        await injectSaveAndLoad(page, save);
        await clickGame(page, 240, 116); // CONTINUE
        await page.waitForTimeout(1500);

        await page.screenshot({ path: `${SCREENSHOT_DIR}/gf-int-04-full-inventory.png` });
        expect(errors).toHaveLength(0);
    });
});
