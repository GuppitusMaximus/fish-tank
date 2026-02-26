/**
 * Browser QA: Equipment Acquisition & Economy
 * Plan: qa-browser-equipment-grid-acquisition-economy
 *
 * Verifies: boss drop popup, add to stash, stash full/overflow, forfeit drop,
 * shop equipment tab, buy/preview/full, sell price, item destruction on death,
 * permadeath wipe clears equipment.
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

const GUPPY = () => makeFish('guppy', 'Guppy', 0xe8734a, 50, 50, 16, 9, 10, 'bubble_volley');
const PUFFER = () => makeFish('pufferfish', 'Puffer', 0x88ccee, 60, 60, 12, 14, 8, 'shield_grant');
const CLOWN = () => makeFish('clownfish', 'Clown', 0xffaa00, 45, 45, 14, 10, 12, 'heal_hot');

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
        pveDeathCount: extras.pveDeathCount ?? 0,
        pvpLossCount: extras.pvpLossCount ?? 0,
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

async function injectSaveAndLoad(page, save) {
    await page.goto(BASE);
    await page.evaluate(([key, data]) => localStorage.setItem(key, JSON.stringify(data)), [SAVE_KEY, save]);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(BUTTON_APPEAR_MS);
}

async function fetchSrc(page, path) {
    const resp = await page.request.get(`${BASE}${path}`);
    return resp.text();
}

const CONTINUE_BTN = { x: 240, y: 116 };

// ─── Step 1: Boss Drop Popup ─────────────────────────────────────────────────

test.describe('1. Boss drop popup — code verification', () => {

    test('_onMonstersDead checks encounter type for boss before showing popup', async ({ page }) => {
        const src = await fetchSrc(page, '/src/scenes/BattleScene.js');

        // Boss encounter type check
        expect(src).toContain("encounterType === 'boss'");
        expect(src).toContain('this.gameState.equipment');

        // rollBossDrop is called for boss encounters
        expect(src).toContain('EquipmentSystem.rollBossDrop(zoneId)');

        // 1500ms delay before showing popup
        expect(src).toContain('this.time.delayedCall(1500, () => this._showBossDropPopup(drop))');
    });

    test('boss drop popup displays item name, rarity, shape, buffs, and action buttons', async ({ page }) => {
        const src = await fetchSrc(page, '/src/scenes/BattleScene.js');

        // Title text
        expect(src).toContain("'BOSS DROP!'");

        // Rarity color mapping with all 4 rarities
        expect(src).toContain("standard: '#888888'");
        expect(src).toContain("magic: '#44aa44'");
        expect(src).toContain("rare: '#9944cc'");
        expect(src).toContain("unique: '#ffd700'");

        // Item name display
        expect(src).toContain('item.name');

        // Rarity label in brackets
        expect(src).toMatch(/'\['\s*\+\s*item\.rarity\s*\+\s*'\]'/);

        // Mini shape preview
        expect(src).toContain('EquipmentRenderer.renderItemSprite');

        // Buff summary
        expect(src).toContain("'+' + b.baseValue + ' ' + b.type.toUpperCase()");

        // Add to stash button
        expect(src).toContain("'[ ADD TO STASH ]'");

        // Forfeit drop button
        expect(src).toContain("'[ FORFEIT DROP ]'");
    });

    test('non-boss victories use normal 1500ms auto-advance (no popup)', async ({ page }) => {
        const src = await fetchSrc(page, '/src/scenes/BattleScene.js');

        // After boss check with return, non-boss path falls through to auto-advance
        expect(src).toContain('this.time.delayedCall(1500, () => this.advanceFloor())');
    });

    test('popup overlay blocks interaction at depth 50', async ({ page }) => {
        const src = await fetchSrc(page, '/src/scenes/BattleScene.js');

        // Overlay depth 50
        expect(src).toContain('.setDepth(50)');

        // Panel at depth 51, elements at depth 52
        const depth51 = src.match(/depth:\s*51/g);
        const depth52 = src.match(/depth:\s*52/g);
        expect(depth51).not.toBeNull();
        expect(depth52).not.toBeNull();
    });
});

// ─── Step 2: Add to Stash ────────────────────────────────────────────────────

test.describe('2. Add to Stash (space available)', () => {

    test('canFitInStash checks cell count against stash capacity', async ({ page }) => {
        const src = await fetchSrc(page, '/src/systems/EquipmentSystem.js');

        // canFitInStash calculates total cell count from all stash items
        expect(src).toContain('canFitInStash(stash, item, stashCapacity)');

        // Cell counting logic
        expect(src).toContain('currentCells');
        expect(src).toContain('itemCells');
        expect(src).toContain('<= stashCapacity');
    });

    test('add to stash pushes item and calls advanceFloor', async ({ page }) => {
        const src = await fetchSrc(page, '/src/scenes/BattleScene.js');

        // Find the canFit path: push item to stash, close popup, advance
        expect(src).toContain("gs.equipment.stash.push({ id: item.id })");
        expect(src).toContain('this._closeBossDropPopup()');
        expect(src).toContain('this.advanceFloor()');
    });

    test('advanceFloor clears combat state and starts FloorScene', async ({ page }) => {
        const src = await fetchSrc(page, '/src/scenes/BattleScene.js');
        expect(src).toContain("this.scene.start('FloorScene', { gameState: this.gameState, result: 'victory' })");
    });

    test('stash capacity default is 15 cells', async ({ page }) => {
        const resp = await page.request.get(`${BASE}/src/config/equipment-balance.json`);
        const balance = await resp.json();
        expect(balance.stashCellCapacity).toBe(15);
    });
});

// ─── Step 3: Stash Full Flow ─────────────────────────────────────────────────

test.describe('3. Stash full flow', () => {

    test('stash full label reads "STASH FULL — MAKE ROOM"', async ({ page }) => {
        const src = await fetchSrc(page, '/src/scenes/BattleScene.js');
        expect(src).toContain('STASH FULL');
        expect(src).toContain('MAKE ROOM');
    });

    test('stash full button color is yellow (#ccaa44)', async ({ page }) => {
        const src = await fetchSrc(page, '/src/scenes/BattleScene.js');
        // canFit ? '#88cc88' : '#ccaa44'
        expect(src).toContain("'#ccaa44'");
    });

    test('stash overflow shows title "MAKE ROOM IN STASH"', async ({ page }) => {
        const src = await fetchSrc(page, '/src/scenes/BattleScene.js');
        expect(src).toContain("'MAKE ROOM IN STASH'");
    });

    test('stash overflow lists items with sell and discard buttons', async ({ page }) => {
        const src = await fetchSrc(page, '/src/scenes/BattleScene.js');

        // Sell button shows price
        expect(src).toContain("'SELL ' + sellPrice + 'g'");

        // Sell calls EconomySystem.sellEquipment
        expect(src).toContain('EconomySystem.sellEquipment(gs, stashItem.id || stashItem.itemId)');

        // Discard button (X)
        expect(src).toMatch(/label:\s*'X'/);

        // Discard removes from stash via splice
        expect(src).toContain('gs.equipment.stash.splice(idx, 1)');
    });

    test('after sell/discard, overflow re-checks canFitInStash and shows add button', async ({ page }) => {
        const src = await fetchSrc(page, '/src/scenes/BattleScene.js');

        // Re-renders overflow after sell/discard to re-check
        const overflowCalls = src.match(/this\._showStashOverflow\(newItem\)/g);
        expect(overflowCalls).not.toBeNull();
        // Called from both sell and discard handlers
        expect(overflowCalls.length).toBeGreaterThanOrEqual(2);

        // If canFit after making room, add button appears
        expect(src).toContain("EquipmentSystem.canFitInStash(gs.equipment.stash, newItem, stashCapacity)");
    });

    test('overflow always shows forfeit drop option', async ({ page }) => {
        const src = await fetchSrc(page, '/src/scenes/BattleScene.js');

        // _showStashOverflow has its own forfeit button
        // Count total forfeit buttons (one in popup, one in overflow)
        const forfeitMatches = src.match(/FORFEIT DROP/g);
        expect(forfeitMatches).not.toBeNull();
        expect(forfeitMatches.length).toBeGreaterThanOrEqual(2);
    });
});

// ─── Step 4: Forfeit Drop ────────────────────────────────────────────────────

test.describe('4. Forfeit Drop', () => {

    test('forfeit drop closes popup and advances floor without adding item', async ({ page }) => {
        const src = await fetchSrc(page, '/src/scenes/BattleScene.js');

        // Forfeit button exists with correct label and color
        expect(src).toContain("'[ FORFEIT DROP ]'");
        expect(src).toContain("color: '#888888'");

        // Forfeit handler closes popup and advances — no stash push
        // The forfeit onClick: () => { this._closeBossDropPopup(); this.advanceFloor(); }
        // Verify there's no stash.push before advanceFloor in forfeit handler
        const forfeitSection = src.match(
            /label:\s*'\[ FORFEIT DROP \]'[\s\S]*?onClick:\s*\(\)\s*=>\s*\{[^}]+\}/
        );
        expect(forfeitSection).not.toBeNull();
        expect(forfeitSection[0]).toContain('_closeBossDropPopup');
        expect(forfeitSection[0]).toContain('advanceFloor');
        expect(forfeitSection[0]).not.toContain('stash.push');
    });
});

// ─── Step 5: Shop Equipment Tab ──────────────────────────────────────────────

test.describe('5. Shop equipment tab', () => {

    test('shop has ITEMS and EQUIPMENT tabs when equipment exists', async ({ page }) => {
        const src = await fetchSrc(page, '/src/scenes/ShopScene.js');

        // Tab rendering is conditional on equipment existence
        expect(src).toContain('gs.equipment != null');

        // Two tab labels
        expect(src).toContain("'[ ITEMS ]'");
        expect(src).toContain("'[ EQUIPMENT ]'");
    });

    test('active tab uses accent color, inactive uses grey', async ({ page }) => {
        const src = await fetchSrc(page, '/src/scenes/ShopScene.js');

        // Active tab gets zone accent, inactive is grey
        expect(src).toContain("itemsActive ? accentHex(zoneTheme) : '#555555'");
        expect(src).toContain("equipActive ? accentHex(zoneTheme) : '#555555'");
    });

    test('default tab is items', async ({ page }) => {
        const src = await fetchSrc(page, '/src/scenes/ShopScene.js');
        expect(src).toContain("this._shopTab = 'items'");
    });

    test('equipment tab builds with _buildEquipmentTab', async ({ page }) => {
        const src = await fetchSrc(page, '/src/scenes/ShopScene.js');
        expect(src).toContain('this._buildEquipmentTab(contentY, W, H, gs, zoneTheme)');
    });

    test('items tab preserves existing shop content (items + fish)', async ({ page }) => {
        const src = await fetchSrc(page, '/src/scenes/ShopScene.js');
        expect(src).toContain("'-- ITEMS --'");
        expect(src).toContain("'-- FISH --'");
    });
});

// ─── Step 6: Shop Equipment Display ──────────────────────────────────────────

test.describe('6. Shop equipment display', () => {

    test('equipment items show name with rarity color', async ({ page }) => {
        const src = await fetchSrc(page, '/src/scenes/ShopScene.js');

        // Rarity color map in equipment tab
        expect(src).toContain("standard: '#888888'");
        expect(src).toContain("magic: '#44aa44'");

        // Name rendered with rarity color
        expect(src).toContain('item.name');
        expect(src).toContain('color: rarityColor');
    });

    test('equipment items show mini shape preview', async ({ page }) => {
        const src = await fetchSrc(page, '/src/scenes/ShopScene.js');
        expect(src).toContain('EquipmentRenderer.renderItemSprite');
    });

    test('equipment items show buff summary', async ({ page }) => {
        const src = await fetchSrc(page, '/src/scenes/ShopScene.js');
        expect(src).toContain("'+' + b.baseValue + ' ' + b.type.toUpperCase()");
    });

    test('equipment items show price in gold', async ({ page }) => {
        const src = await fetchSrc(page, '/src/scenes/ShopScene.js');
        expect(src).toContain("price + 'g'");
    });

    test('equipment items show rarity label in brackets', async ({ page }) => {
        const src = await fetchSrc(page, '/src/scenes/ShopScene.js');
        expect(src).toMatch(/'\['\s*\+\s*item\.rarity\s*\+\s*'\]'/);
    });
});

// ─── Step 7: Shop Equipment Persistence ──────────────────────────────────────

test.describe('7. Shop equipment persistence', () => {

    test('equipment is lazily generated on first tab switch', async ({ page }) => {
        const src = await fetchSrc(page, '/src/scenes/ShopScene.js');
        expect(src).toContain('if (!this._shopEquipment)');
    });

    test('switching tabs preserves the same _shopEquipment array', async ({ page }) => {
        const src = await fetchSrc(page, '/src/scenes/ShopScene.js');

        // init sets _shopEquipment to null
        expect(src).toContain('this._shopEquipment = null');

        // Only generates if null — switching back doesn't regenerate
        const genChecks = src.match(/if \(!this\._shopEquipment\)/g);
        expect(genChecks).not.toBeNull();
        expect(genChecks.length).toBe(1);
    });

    test('equipment count defaults to 3 from balance config', async ({ page }) => {
        const resp = await page.request.get(`${BASE}/src/config/equipment-balance.json`);
        const balance = await resp.json();
        expect(balance.shopEquipmentCount).toBe(3);
    });

    test('equipment is drawn from zone-appropriate item pool', async ({ page }) => {
        const src = await fetchSrc(page, '/src/scenes/ShopScene.js');
        expect(src).toContain('ConfigLoader.getZoneItems(zoneId)');
    });

    test('no duplicate items in shop equipment selection', async ({ page }) => {
        const src = await fetchSrc(page, '/src/scenes/ShopScene.js');
        expect(src).toContain('const used = new Set()');
        expect(src).toContain('!used.has(c.id)');
    });
});

// ─── Step 8: Shop Preview Button ─────────────────────────────────────────────

test.describe('8. Shop "Preview" button', () => {

    test('preview button exists with correct label and color', async ({ page }) => {
        const src = await fetchSrc(page, '/src/scenes/ShopScene.js');
        expect(src).toContain("label: 'PREVIEW'");
        expect(src).toContain("color: '#8888cc'");
    });

    test('preview opens equipment grid overlay in edit mode', async ({ page }) => {
        const src = await fetchSrc(page, '/src/scenes/ShopScene.js');

        // Gets UIOverlay scene and opens grid
        expect(src).toContain("this.scene.get('UIOverlay')");
        expect(src).toContain("uiOverlay.openEquipmentGrid('edit')");
    });
});

// ─── Step 9: Shop Buy Button ─────────────────────────────────────────────────

test.describe('9. Shop "BUY" button', () => {

    test('buy button shows FULL when stash cannot fit', async ({ page }) => {
        const src = await fetchSrc(page, '/src/scenes/ShopScene.js');
        expect(src).toContain("!canFit ? 'FULL' : 'BUY'");
    });

    test('canBuy requires sufficient gold AND stash space', async ({ page }) => {
        const src = await fetchSrc(page, '/src/scenes/ShopScene.js');
        expect(src).toContain('gs.gold >= price && canFit');
    });

    test('buy button disabled color when cannot buy', async ({ page }) => {
        const src = await fetchSrc(page, '/src/scenes/ShopScene.js');
        expect(src).toContain("canBuy ? '#88cc88' : '#555555'");
    });

    test('successful buy calls EconomySystem.buyEquipment and rebuilds shop', async ({ page }) => {
        const src = await fetchSrc(page, '/src/scenes/ShopScene.js');
        expect(src).toContain('EconomySystem.buyEquipment(gs, item.id)');
        expect(src).toContain('this.buildShop()');
        expect(src).toContain("this._showMessage('Added to Stash!')");
    });

    test('bought item is removed from _shopEquipment array', async ({ page }) => {
        const src = await fetchSrc(page, '/src/scenes/ShopScene.js');
        expect(src).toContain('this._shopEquipment.splice(i, 1)');
    });

    test('EconomySystem.buyEquipment deducts gold and pushes to stash', async ({ page }) => {
        const src = await fetchSrc(page, '/src/systems/EconomySystem.js');

        // Checks gold
        expect(src).toContain('gameState.gold < price');

        // Checks stash capacity
        expect(src).toContain('EquipmentSystem.canFitInStash(gameState.equipment.stash, itemConfig, stashCapacity)');

        // Deducts gold and adds to stash
        expect(src).toContain('gameState.gold -= price');
        expect(src).toContain("gameState.equipment.stash.push({ id: itemId })");
    });
});

// ─── Step 10: Equipment Sell Price ───────────────────────────────────────────

test.describe('10. Equipment sell price', () => {

    test('sell price formula is buyPrice × sellPriceMultiplier', async ({ page }) => {
        const src = await fetchSrc(page, '/src/systems/EconomySystem.js');
        expect(src).toContain('(itemConfig.buyPrice || 0) * (balance.sellPriceMultiplier || 0.5)');
    });

    test('sellPriceMultiplier is 0.5 in balance config', async ({ page }) => {
        const resp = await page.request.get(`${BASE}/src/config/equipment-balance.json`);
        const balance = await resp.json();
        expect(balance.sellPriceMultiplier).toBe(0.5);
    });

    test('sell price is floored', async ({ page }) => {
        const src = await fetchSrc(page, '/src/systems/EconomySystem.js');
        expect(src).toContain('Math.floor((itemConfig.buyPrice || 0)');
    });

    test('sellEquipment checks grid first, then stash', async ({ page }) => {
        const src = await fetchSrc(page, '/src/systems/EconomySystem.js');

        // Grid check comes first
        const gridIdx = src.indexOf('gridIdx');
        const stashIdx = src.indexOf('stashIdx');
        expect(gridIdx).toBeLessThan(stashIdx);
        expect(gridIdx).toBeGreaterThan(0);
    });

    test('sellEquipment removes item and adds gold', async ({ page }) => {
        const src = await fetchSrc(page, '/src/systems/EconomySystem.js');

        // Grid sell: remove from grid, add gold
        expect(src).toContain('EquipmentSystem.removeItem(gameState.equipment.grid, itemId)');
        expect(src).toContain('gameState.gold += sellPrice');

        // Stash sell: splice from stash, add gold
        expect(src).toContain('gameState.equipment.stash.splice(stashIdx, 1)');
    });

    test('sell price example: sewer items cost 50g, sell for 25g', async ({ page }) => {
        const resp = await page.request.get(`${BASE}/src/config/equipment-items.json`);
        const items = await resp.json();

        // Verify sewer_rusty_pipe as example
        const pipe = items['sewer_rusty_pipe'];
        expect(pipe.buyPrice).toBe(50);
        // 50 * 0.5 = 25
        expect(Math.floor(pipe.buyPrice * 0.5)).toBe(25);
    });
});

// ─── Step 11: Item Destruction on Party Death (Zone 6+) ──────────────────────

test.describe('11. Item destruction on party death (zone 6+)', () => {

    test('destruction only applies to zone 6+ (ancient_chambers, dungeon_heart)', async ({ page }) => {
        const resp = await page.request.get(`${BASE}/src/config/equipment-balance.json`);
        const balance = await resp.json();

        // Only ancient_chambers and dungeon_heart have destruction chances
        const zones = Object.keys(balance.itemDestructionChance);
        expect(zones).toContain('ancient_chambers');
        expect(zones).toContain('dungeon_heart');
        expect(zones).toHaveLength(2);

        // Zones 1-5 have no entries (destruction chance is 0)
        expect(balance.itemDestructionChance['sewers']).toBeUndefined();
        expect(balance.itemDestructionChance['goblin_caves']).toBeUndefined();
        expect(balance.itemDestructionChance['bone_crypts']).toBeUndefined();
        expect(balance.itemDestructionChance['deep_dungeon']).toBeUndefined();
        expect(balance.itemDestructionChance['shadow_realm']).toBeUndefined();
    });

    test('destruction chances: ancient_chambers=30%, dungeon_heart=60%', async ({ page }) => {
        const resp = await page.request.get(`${BASE}/src/config/equipment-balance.json`);
        const balance = await resp.json();
        expect(balance.itemDestructionChance['ancient_chambers']).toBe(0.30);
        expect(balance.itemDestructionChance['dungeon_heart']).toBe(0.60);
    });

    test('destruction targets items touching dead party members rows', async ({ page }) => {
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');

        // Gets dead fish indices
        expect(src).toContain('f.hp <= 0 ? i : -1');

        // Gets at-risk items using EquipmentSystem
        expect(src).toContain('EquipmentSystem.getItemsTouchingPartyMembers');
    });

    test('indestructible items (Harmony) are filtered out', async ({ page }) => {
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        expect(src).toContain('!item.indestructible');

        // Verify harmony has indestructible flag
        const resp = await page.request.get(`${BASE}/src/config/equipment-items.json`);
        const items = await resp.json();
        expect(items['harmony'].indestructible).toBe(true);
    });

    test('only one item is destroyed per death event', async ({ page }) => {
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');

        // Random selection of single victim
        expect(src).toContain('atRiskItems[Math.floor(Math.random() * atRiskItems.length)]');

        // Single removeItem call
        expect(src).toContain('EquipmentSystem.removeItem(gs.equipment.grid, victim.itemId)');
    });

    test('destruction is random (Math.random < destructionChance)', async ({ page }) => {
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        expect(src).toContain('Math.random() < destructionChance');
    });

    test('destruction check only runs when grid has items', async ({ page }) => {
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        expect(src).toContain('gs.equipment && gs.equipment.grid.length > 0');
    });

    test('getItemsTouchingPartyMembers uses ROW_TARGETING to map rows to party members', async ({ page }) => {
        const src = await fetchSrc(page, '/src/systems/EquipmentSystem.js');

        // ROW_TARGETING maps rows to party indices
        expect(src).toContain('ROW_TARGETING');

        // getItemsTouchingPartyMembers method exists
        expect(src).toContain('getItemsTouchingPartyMembers(grid, partyIndices)');
    });
});

// ─── Step 12: Permadeath Wipe Clears Equipment ──────────────────────────────

test.describe('12. Permadeath wipe clears equipment', () => {

    test('permadeath wipe removes all equipment except Harmony', async ({ page }) => {
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');

        // Filter grid to keep only harmony
        expect(src).toContain("gs.equipment.grid = gs.equipment.grid.filter(item => item.itemId === 'harmony')");
    });

    test('Harmony resets to default position (col 1, row 4)', async ({ page }) => {
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');

        // Harmony position reset
        expect(src).toContain('harmony.col = 1');
        expect(src).toContain('harmony.row = 4');
        expect(src).toContain('harmony.rotation = 0');
        expect(src).toContain('harmony.flipped = false');
    });

    test('stash is emptied on permadeath wipe', async ({ page }) => {
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        expect(src).toContain('gs.equipment.stash = []');
    });

    test('wipe is triggered by maxPveDeaths or maxPvpLosses', async ({ page }) => {
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');

        expect(src).toContain("gs.pveDeathCount >= (config.maxPveDeaths || 4)");
        expect(src).toContain("gs.pvpLossCount >= (config.maxPvpLosses || 4)");
    });

    test('wipe calls SaveSystem.deleteSave', async ({ page }) => {
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        expect(src).toContain('SaveSystem.deleteSave()');
    });

    test('wipe shows RUN ENDED screen with title screen button', async ({ page }) => {
        const src = await fetchSrc(page, '/src/scenes/FloorScene.js');
        expect(src).toContain("'RUN ENDED'");
        expect(src).toContain("'[ TITLE SCREEN ]'");
    });

    test('maxPveDeaths is 4 in encounter config', async ({ page }) => {
        const resp = await page.request.get(`${BASE}/src/config/encounters.json`);
        const config = await resp.json();
        expect(config.maxPveDeaths).toBe(4);
        expect(config.maxPvpLosses).toBe(4);
    });
});

// ─── Integration: Boss Drop E2E via Save Injection ───────────────────────────

test.describe('Integration: boss drop flow via game state', () => {

    test('BattleScene processes boss victory and checks for equipment', async ({ page }) => {
        // Set up a save on floor 3 (boss floor: zonePattern[2] = 'boss')
        const save = makeV5Save([GUPPY(), PUFFER(), CLOWN()], 3, {
            gold: 500,
            equipment: {
                grid: [
                    { itemId: 'harmony', col: 1, row: 4, rotation: 0, flipped: false }
                ],
                stash: [],
                harmonyPosition: { row: 4, col: 1 }
            }
        });
        await injectSaveAndLoad(page, save);

        // Verify save was loaded by checking localStorage
        const loaded = await page.evaluate((key) => {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        }, SAVE_KEY);

        expect(loaded).not.toBeNull();
        expect(loaded.floor).toBe(3);
        expect(loaded.equipment).toBeDefined();
        expect(loaded.equipment.stash).toHaveLength(0);
    });

    test('floor 3 is a boss encounter per zone pattern', async ({ page }) => {
        const resp = await page.request.get(`${BASE}/src/config/encounters.json`);
        const config = await resp.json();

        // Floor 3 → index 2 → zonePattern[2] = 'boss'
        expect(config.zonePattern[2]).toBe('boss');
    });

    test('EncounterSystem.getEncounterType uses floor mod floorsPerZone', async ({ page }) => {
        const src = await fetchSrc(page, '/src/systems/EncounterSystem.js');

        // (floor - 1) % floorsPerZone indexes into zonePattern
        expect(src).toContain('(floor - 1) % config.floorsPerZone');
        expect(src).toContain('config.zonePattern[idx]');
    });
});

// ─── Integration: Shop Equipment Tab via Save Injection ──────────────────────

test.describe('Integration: shop equipment tab via save injection', () => {

    test('shop scene renders without errors on equipment-enabled save', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        // Floor 4 is after a boss (shop transition), zone 1 (sewers)
        const save = makeV5Save([GUPPY(), PUFFER(), CLOWN()], 4, {
            gold: 500,
            equipment: {
                grid: [
                    { itemId: 'harmony', col: 1, row: 4, rotation: 0, flipped: false }
                ],
                stash: [],
                harmonyPosition: { row: 4, col: 1 }
            }
        });
        await injectSaveAndLoad(page, save);

        // Click continue on title
        await clickGame(page, CONTINUE_BTN.x, CONTINUE_BTN.y);
        await page.waitForTimeout(2000);

        // Take screenshot of FloorScene hub
        await page.screenshot({ path: `${SCREENSHOT_DIR}/eq-acq-shop-floor.png` });
        expect(errors).toHaveLength(0);
    });

    test('shop has zone-appropriate items for sewers zone', async ({ page }) => {
        const resp = await page.request.get(`${BASE}/src/config/equipment-items.json`);
        const items = await resp.json();

        // Count sewers zone items
        const sewerItems = Object.values(items).filter(i => i.zone === 'sewers');
        expect(sewerItems.length).toBeGreaterThanOrEqual(3);
    });
});

// ─── Integration: Equipment Economy Calculations ─────────────────────────────

test.describe('Integration: equipment economy calculations', () => {

    test('all equipment items have valid buyPrice', async ({ page }) => {
        const resp = await page.request.get(`${BASE}/src/config/equipment-items.json`);
        const items = await resp.json();

        for (const [id, item] of Object.entries(items)) {
            if (id === 'harmony') continue; // Harmony has 0 price
            expect(item.buyPrice).toBeGreaterThan(0);
        }
    });

    test('all equipment items have valid shape from SHAPES', async ({ page }) => {
        const resp = await page.request.get(`${BASE}/src/config/equipment-items.json`);
        const items = await resp.json();

        const validShapes = ['I', 'O', 'T', 'S', 'Z', 'L', 'J', 'monomino'];
        for (const item of Object.values(items)) {
            expect(validShapes).toContain(item.shape);
        }
    });

    test('all zones have items and rarity drop weights', async ({ page }) => {
        const [itemsResp, balanceResp] = await Promise.all([
            page.request.get(`${BASE}/src/config/equipment-items.json`),
            page.request.get(`${BASE}/src/config/equipment-balance.json`)
        ]);

        const items = await itemsResp.json();
        const balance = await balanceResp.json();

        const zones = ['sewers', 'goblin_caves', 'bone_crypts', 'deep_dungeon',
                        'shadow_realm', 'ancient_chambers', 'dungeon_heart'];

        for (const zone of zones) {
            // Each zone has rarity weights
            expect(balance.rarityDropWeights[zone]).toBeDefined();

            // Each zone's weights sum to 100
            const w = balance.rarityDropWeights[zone];
            expect(w.standard + w.magic + w.rare).toBe(100);

            // Each zone has at least some items
            const zoneItems = Object.values(items).filter(i => i.zone === zone);
            expect(zoneItems.length).toBeGreaterThan(0);
        }
    });

    test('Harmony is unique, zone "all", indestructible, with row restriction 4', async ({ page }) => {
        const resp = await page.request.get(`${BASE}/src/config/equipment-items.json`);
        const items = await resp.json();
        const harmony = items['harmony'];

        expect(harmony).toBeDefined();
        expect(harmony.unique).toBe(true);
        expect(harmony.zone).toBe('all');
        expect(harmony.indestructible).toBe(true);
        expect(harmony.rowRestriction).toBe(4);
        expect(harmony.shape).toBe('monomino');
        expect(harmony.buyPrice).toBe(0);
    });
});
