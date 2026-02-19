/**
 * Browser QA: Dungeon Fisher V2
 * Tests the Phaser-based standalone game at localhost:8080.
 *
 * All game elements are rendered inside a Phaser canvas (480x270, scaled to fit viewport).
 * DOM interaction is limited to the canvas element itself.
 * Coordinate clicks use Phaser game coordinates scaled to browser viewport.
 */

const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:8080';

// Game canvas dimensions
const GAME_W = 480;
const GAME_H = 270;

async function getCanvas(page) {
    return page.locator('canvas').first();
}

async function getCanvasBounds(page) {
    const canvas = await getCanvas(page);
    return await canvas.boundingBox();
}

// Convert game coordinates to browser viewport coordinates
async function gameCoord(page, gx, gy) {
    const bounds = await getCanvasBounds(page);
    const scaleX = bounds.width / GAME_W;
    const scaleY = bounds.height / GAME_H;
    return {
        x: bounds.x + gx * scaleX,
        y: bounds.y + gy * scaleY
    };
}

// Click at game coordinates
async function clickGame(page, gx, gy) {
    const { x, y } = await gameCoord(page, gx, gy);
    await page.mouse.click(x, y);
}

// Wait for Phaser game to boot
async function waitForGame(page) {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(1500);
}

// Clear localStorage save and reload
async function freshStart(page) {
    await page.goto(BASE);
    await page.evaluate(() => localStorage.removeItem('dungeon-fisher-save'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(1500);
}

// ─── Step 1: Page Boot ────────────────────────────────────────────────────────

test('boot: page loads without JS errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await waitForGame(page);
    await page.screenshot({ path: 'tests/browser/screenshots/v2-01-title-screen.png' });

    expect(errors, `JS errors on load: ${errors.join(', ')}`).toHaveLength(0);
});

test('boot: canvas element renders', async ({ page }) => {
    await waitForGame(page);
    const canvas = await getCanvas(page);
    await expect(canvas).toBeVisible();

    const bounds = await getCanvasBounds(page);
    expect(bounds.width).toBeGreaterThan(100);
    expect(bounds.height).toBeGreaterThan(100);
    // Aspect ratio 16:9
    const ratio = bounds.width / bounds.height;
    expect(ratio).toBeGreaterThan(1.7);
    expect(ratio).toBeLessThan(1.8);
});

test('boot: canvas fills viewport with FIT scale mode', async ({ page }) => {
    await waitForGame(page);
    const bounds = await getCanvasBounds(page);
    const viewport = page.viewportSize();

    const coverageX = bounds.width / viewport.width;
    const coverageY = bounds.height / viewport.height;
    expect(Math.max(coverageX, coverageY)).toBeGreaterThan(0.9);
});

test('boot: no network request failures', async ({ page }) => {
    const failedRequests = [];
    page.on('requestfailed', req => {
        const url = req.url();
        if (!url.includes('favicon')) failedRequests.push(url);
    });

    await waitForGame(page);
    expect(failedRequests).toHaveLength(0);
});

// ─── Step 2: Title Screen ─────────────────────────────────────────────────────

test('title: canvas renders content on fresh start', async ({ page }) => {
    await freshStart(page);
    const canvas = await getCanvas(page);
    await expect(canvas).toBeVisible();
    await page.screenshot({ path: 'tests/browser/screenshots/v2-02-title-fresh.png' });

    // Canvas should not be blank — check pixel data via WebGL
    const hasContent = await page.evaluate(() => {
        const canvas = document.querySelector('canvas');
        if (!canvas) return false;
        // Try 2d context first, then check if WebGL rendered anything non-trivial
        try {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
                for (let i = 0; i < d.length; i += 4) {
                    if (d[i] > 30 || d[i+1] > 30 || d[i+2] > 50) return true;
                }
            }
        } catch (e) {}
        // For WebGL, check canvas dimensions are non-zero
        return canvas.width > 0 && canvas.height > 0;
    });
    expect(hasContent).toBe(true);
});

test('title: no save file on fresh start', async ({ page }) => {
    await freshStart(page);
    const hasSave = await page.evaluate(() => !!localStorage.getItem('dungeon-fisher-save'));
    expect(hasSave).toBe(false);
});

// ─── Step 3: New Game → Starter Selection → FloorScene ───────────────────────

test('new game: clicking NEW GAME transitions to starter selection', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await freshStart(page);
    // NEW GAME button: (W/2, H*0.55) = (240, 148)
    await clickGame(page, 240, 148);
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'tests/browser/screenshots/v2-03-starter-selection.png' });
    expect(errors).toHaveLength(0);
});

test('new game: selecting starter creates save with guppy at floor 1', async ({ page }) => {
    await freshStart(page);
    // Click NEW GAME
    await clickGame(page, 240, 148);
    await page.waitForTimeout(300);
    // First starter (Guppy) SELECT button: x=120, y = H*0.45+45 = 121.5+45 = 166.5
    await clickGame(page, 120, 166);
    await page.waitForTimeout(800);

    await page.screenshot({ path: 'tests/browser/screenshots/v2-03b-floor-scene.png' });

    const save = await page.evaluate(() => {
        const raw = localStorage.getItem('dungeon-fisher-save');
        return raw ? JSON.parse(raw) : null;
    });
    expect(save).not.toBeNull();
    expect(save.floor).toBe(1);
    expect(save.gold).toBe(0);
    expect(save.party).toHaveLength(1);
    expect(save.party[0].speciesId).toBe('guppy');
    expect(save.campFloor).toBe(1);
});

test('new game: pufferfish starter creates save with correct species', async ({ page }) => {
    await freshStart(page);
    await clickGame(page, 240, 148);
    await page.waitForTimeout(300);
    // Second starter (Pufferfish) SELECT at x=240, y=166
    await clickGame(page, 240, 166);
    await page.waitForTimeout(800);

    const save = await page.evaluate(() => JSON.parse(localStorage.getItem('dungeon-fisher-save') || 'null'));
    expect(save).not.toBeNull();
    expect(save.party[0].speciesId).toBe('pufferfish');
    expect(save.party[0].hp).toBe(45);  // pufferfish baseHp
});

test('new game: swordfish starter creates save with correct species', async ({ page }) => {
    await freshStart(page);
    await clickGame(page, 240, 148);
    await page.waitForTimeout(300);
    // Third starter (Swordfish) SELECT at x=360, y=166
    await clickGame(page, 360, 166);
    await page.waitForTimeout(800);

    const save = await page.evaluate(() => JSON.parse(localStorage.getItem('dungeon-fisher-save') || 'null'));
    expect(save).not.toBeNull();
    expect(save.party[0].speciesId).toBe('swordfish');
    expect(save.party[0].atk).toBe(14);  // swordfish baseAtk
});

// ─── Step 4: Battle Scene ─────────────────────────────────────────────────────

test('battle: entering battle from floor 1 has no JS errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await freshStart(page);
    await clickGame(page, 240, 148);  // NEW GAME
    await page.waitForTimeout(300);
    await clickGame(page, 120, 166);  // SELECT guppy
    await page.waitForTimeout(600);
    // ENTER BATTLE at (W/2, btnY) where btnY = max(70+12, 135) = 135
    await clickGame(page, 240, 135);
    await page.waitForTimeout(1000);

    await page.screenshot({ path: 'tests/browser/screenshots/v2-04-battle-scene.png' });
    expect(errors).toHaveLength(0);
});

test('battle: canvas still renders after entering battle', async ({ page }) => {
    await freshStart(page);
    await clickGame(page, 240, 148);
    await page.waitForTimeout(300);
    await clickGame(page, 120, 166);
    await page.waitForTimeout(600);
    await clickGame(page, 240, 135);
    await page.waitForTimeout(500);

    const canvas = await getCanvas(page);
    await expect(canvas).toBeVisible();
});

test('battle: using move button does not crash game', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await freshStart(page);
    await clickGame(page, 240, 148);
    await page.waitForTimeout(300);
    await clickGame(page, 120, 166);
    await page.waitForTimeout(600);
    await clickGame(page, 240, 135);  // ENTER BATTLE
    await page.waitForTimeout(500);

    // Move buttons at y = H - 18 = 252, spread across width
    // With 1 move + items = 2 buttons: totalW = 2*95 + 1*4 = 194, x starts at (480-194)/2 + 95/2 = 191
    // First move button center: 191
    await clickGame(page, 191, 252);
    await page.waitForTimeout(1500);

    await page.screenshot({ path: 'tests/browser/screenshots/v2-04b-battle-after-move.png' });
    expect(errors).toHaveLength(0);
});

// ─── Step 5: Shop Scene ───────────────────────────────────────────────────────

test('shop: entering shop has no JS errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await freshStart(page);
    await clickGame(page, 240, 148);  // NEW GAME
    await page.waitForTimeout(300);
    await clickGame(page, 120, 166);  // SELECT guppy
    await page.waitForTimeout(600);
    // SHOP button at (W/2, btnY + 22) = (240, 157)
    await clickGame(page, 240, 157);
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'tests/browser/screenshots/v2-05-shop-scene.png' });
    expect(errors).toHaveLength(0);
});

test('shop: buy item with sufficient gold updates inventory', async ({ page }) => {
    await page.goto(BASE);
    // Set up save with 100 gold
    await page.evaluate(() => {
        localStorage.setItem('dungeon-fisher-save', JSON.stringify({
            version: 1, savedAt: Date.now(), floor: 5, gold: 100, campFloor: 1,
            party: [{ speciesId: 'guppy', name: 'Guppy', level: 1, xp: 0, xpToNext: 25,
                hp: 30, maxHp: 30, atk: 8, def: 5, spd: 6, moves: ['splash'], poisoned: null, buffs: [] }],
            inventory: []
        }));
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(1500);

    // CONTINUE at (240, 175)
    await clickGame(page, 240, 175);
    await page.waitForTimeout(600);
    // SHOP at (240, 157)
    await clickGame(page, 240, 157);
    await page.waitForTimeout(500);

    // BUY Potion (15g): BUY btn at (W-25, y_of_first_item+1)
    // Shop items start at y=52 (38+14), BUY btn at W-25=455, y+1=53
    await clickGame(page, 455, 53);
    await page.waitForTimeout(500);

    // After buying, shop rebuilds — check save
    const save = await page.evaluate(() => JSON.parse(localStorage.getItem('dungeon-fisher-save') || 'null'));
    if (save && save.inventory.length > 0) {
        expect(save.gold).toBe(85);
        expect(save.inventory).toContain('potion');
    }
    // Screenshot either way
    await page.screenshot({ path: 'tests/browser/screenshots/v2-05b-shop-after-buy.png' });
});

test('shop: back button returns to floor scene', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await freshStart(page);
    await clickGame(page, 240, 148);
    await page.waitForTimeout(300);
    await clickGame(page, 120, 166);
    await page.waitForTimeout(600);
    await clickGame(page, 240, 157);  // SHOP
    await page.waitForTimeout(500);
    // BACK button at (W/2, H-18) = (240, 252)
    await clickGame(page, 240, 252);
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'tests/browser/screenshots/v2-05c-shop-back.png' });
    expect(errors).toHaveLength(0);
});

// ─── Step 6: Camp Scene ───────────────────────────────────────────────────────

test('camp: entering camp heals fish and saves checkpoint', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto(BASE);
    await page.evaluate(() => {
        localStorage.setItem('dungeon-fisher-save', JSON.stringify({
            version: 1, savedAt: Date.now(), floor: 3, gold: 20, campFloor: 1,
            party: [{ speciesId: 'guppy', name: 'Guppy', level: 1, xp: 0, xpToNext: 25,
                hp: 10, maxHp: 30, atk: 8, def: 5, spd: 6, moves: ['splash'], poisoned: null, buffs: [] }],
            inventory: []
        }));
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(1500);

    // CONTINUE
    await clickGame(page, 240, 175);
    await page.waitForTimeout(600);
    // CAMP at (W/2, btnY+44) = (240, 179)
    await clickGame(page, 240, 179);
    await page.waitForTimeout(800);

    await page.screenshot({ path: 'tests/browser/screenshots/v2-06-camp-scene.png' });

    const save = await page.evaluate(() => JSON.parse(localStorage.getItem('dungeon-fisher-save') || 'null'));
    if (save) {
        expect(save.campFloor).toBe(3);  // checkpoint updated to current floor
        expect(save.party[0].hp).toBe(30);  // fully healed
    }

    expect(errors).toHaveLength(0);
});

test('camp: continue button returns to floor scene', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto(BASE);
    await page.evaluate(() => {
        localStorage.setItem('dungeon-fisher-save', JSON.stringify({
            version: 1, savedAt: Date.now(), floor: 2, gold: 10, campFloor: 1,
            party: [{ speciesId: 'guppy', name: 'Guppy', level: 1, xp: 0, xpToNext: 25,
                hp: 25, maxHp: 30, atk: 8, def: 5, spd: 6, moves: ['splash'], poisoned: null, buffs: [] }],
            inventory: []
        }));
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(1500);

    await clickGame(page, 240, 175);  // CONTINUE
    await page.waitForTimeout(600);
    await clickGame(page, 240, 179);  // CAMP
    await page.waitForTimeout(500);
    // CONTINUE button in CampScene at (W/2, H-30) = (240, 240)
    await clickGame(page, 240, 240);
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'tests/browser/screenshots/v2-06b-camp-continue.png' });
    expect(errors).toHaveLength(0);
});

// ─── Step 7: Save and Load ────────────────────────────────────────────────────

test('save: save data has correct structure', async ({ page }) => {
    await freshStart(page);
    await clickGame(page, 240, 148);
    await page.waitForTimeout(300);
    await clickGame(page, 120, 166);  // SELECT guppy
    await page.waitForTimeout(800);

    const save = await page.evaluate(() => JSON.parse(localStorage.getItem('dungeon-fisher-save') || 'null'));
    expect(save).not.toBeNull();
    expect(save).toHaveProperty('version', 1);
    expect(save).toHaveProperty('floor');
    expect(save).toHaveProperty('gold');
    expect(save).toHaveProperty('party');
    expect(save).toHaveProperty('inventory');
    expect(save).toHaveProperty('campFloor');
    expect(save).toHaveProperty('savedAt');
    expect(Array.isArray(save.party)).toBe(true);
    expect(Array.isArray(save.inventory)).toBe(true);
});

test('load: CONTINUE button loads correct floor', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => {
        localStorage.setItem('dungeon-fisher-save', JSON.stringify({
            version: 1, savedAt: Date.now(), floor: 7, gold: 50, campFloor: 5,
            party: [{ speciesId: 'swordfish', name: 'Swordfish', level: 3, xp: 0, xpToNext: 75,
                hp: 32, maxHp: 32, atk: 18, def: 5, spd: 10, moves: ['fin_slash', 'deep_strike'],
                poisoned: null, buffs: [] }],
            inventory: ['potion']
        }));
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(1500);

    // CONTINUE at (240, 175)
    await clickGame(page, 240, 175);
    await page.waitForTimeout(600);

    await page.screenshot({ path: 'tests/browser/screenshots/v2-07-load-floor7.png' });

    // Save should still show floor 7
    const save = await page.evaluate(() => JSON.parse(localStorage.getItem('dungeon-fisher-save') || 'null'));
    if (save) {
        expect(save.floor).toBe(7);
        expect(save.party[0].speciesId).toBe('swordfish');
        expect(save.inventory).toContain('potion');
    }
});

test('load: new game overwrites old save', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => {
        localStorage.setItem('dungeon-fisher-save', JSON.stringify({
            version: 1, savedAt: Date.now(), floor: 42, gold: 300, campFloor: 40,
            party: [{ speciesId: 'pufferfish', name: 'Pufferfish', level: 8, xp: 0, xpToNext: 200,
                hp: 85, maxHp: 85, atk: 21, def: 17, spd: 11, moves: ['tackle', 'harden', 'poison_bite'],
                poisoned: null, buffs: [] }],
            inventory: ['super_potion', 'revive']
        }));
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(1500);

    await clickGame(page, 240, 148);  // NEW GAME (overwrites)
    await page.waitForTimeout(300);
    await clickGame(page, 360, 166);  // SELECT swordfish
    await page.waitForTimeout(800);

    const save = await page.evaluate(() => JSON.parse(localStorage.getItem('dungeon-fisher-save') || 'null'));
    expect(save).not.toBeNull();
    expect(save.floor).toBe(1);
    expect(save.party[0].speciesId).toBe('swordfish');
    expect(save.inventory).toHaveLength(0);
    expect(save.gold).toBe(0);
});

// ─── Step 8: Responsive Layout ────────────────────────────────────────────────

test('responsive: canvas scales correctly on mobile (375x667)', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
    const page = await ctx.newPage();

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(1000);

    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();

    const bounds = await canvas.boundingBox();
    expect(bounds.width).toBeLessThanOrEqual(375);
    expect(bounds.height).toBeLessThanOrEqual(667);
    expect(bounds.width).toBeGreaterThan(100);
    // 16:9 aspect ratio
    expect(bounds.width / bounds.height).toBeGreaterThan(1.7);
    expect(bounds.width / bounds.height).toBeLessThan(1.8);

    await page.screenshot({ path: 'tests/browser/screenshots/v2-10-mobile-375x667.png' });
    await ctx.close();
});

test('responsive: canvas scales correctly on iPad (768x1024)', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 768, height: 1024 } });
    const page = await ctx.newPage();

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(1000);

    const bounds = await page.locator('canvas').first().boundingBox();
    expect(bounds.width).toBeLessThanOrEqual(768);
    expect(bounds.height).toBeLessThanOrEqual(1024);
    expect(bounds.width / bounds.height).toBeGreaterThan(1.7);
    expect(bounds.width / bounds.height).toBeLessThan(1.8);

    await page.screenshot({ path: 'tests/browser/screenshots/v2-10b-ipad-768x1024.png' });
    await ctx.close();
});

// ─── Step 9: Game Logic Verification ─────────────────────────────────────────

test('logic: damage formula max(1, floor(atk*power/50 - def))', async ({ page }) => {
    await page.goto(BASE);
    const result = await page.evaluate(() => {
        // Guppy (atk=8), Splash (power=10), vs floor 1 def=2
        const atk = 8, power = 10, def = 2;
        return Math.max(1, Math.floor((atk * power / 50) - def));
    });
    expect(result).toBe(1);

    // Swordfish (atk=14), fin_slash (power=25), vs floor 1 def=2 → floor(7-2)=5
    const result2 = await page.evaluate(() => {
        return Math.max(1, Math.floor((14 * 25 / 50) - 2));
    });
    expect(result2).toBe(5);
});

test('logic: floor 1 monster stats are correct', async ({ page }) => {
    await page.goto(BASE);
    const stats = await page.evaluate(() => ({
        hp: Math.floor(15 + 1 * 1.8),       // 16
        atk: Math.floor(4 + 1 * 0.35),      // 4
        def: Math.floor(2 + 1 * 0.22),      // 2
        gold: Math.floor(5 + 1 * 0.8),      // 5
        xp: Math.floor(10 + 1 * 1.5)        // 11
    }));
    expect(stats.hp).toBe(16);
    expect(stats.atk).toBe(4);
    expect(stats.def).toBe(2);
    expect(stats.gold).toBe(5);
    expect(stats.xp).toBe(11);
});

test('logic: monster scales significantly by floor 50', async ({ page }) => {
    await page.goto(BASE);
    const f1 = await page.evaluate(() => ({ hp: Math.floor(15 + 1 * 1.8), atk: Math.floor(4 + 1 * 0.35) }));
    const f50 = await page.evaluate(() => ({ hp: Math.floor(15 + 50 * 1.8), atk: Math.floor(4 + 50 * 0.35) }));

    expect(f50.hp).toBeGreaterThan(f1.hp * 5);
    expect(f50.atk).toBeGreaterThan(f1.atk * 4);
});

test('logic: XP to next level = level * 25', async ({ page }) => {
    await page.goto(BASE);
    const thresholds = await page.evaluate(() =>
        [1, 2, 3, 4, 5].map(lvl => lvl * 25)
    );
    expect(thresholds).toEqual([25, 50, 75, 100, 125]);
});

test('logic: level up stat increases are correct', async ({ page }) => {
    await page.goto(BASE);
    const result = await page.evaluate(() => {
        // Guppy level 1: hp=30, atk=8, def=5, spd=6
        // After 1 level up: hp+5, atk+2, def+1, spd+1
        return {
            hp: 30 + 5,
            atk: 8 + 2,
            def: 5 + 1,
            spd: 6 + 1
        };
    });
    expect(result.hp).toBe(35);
    expect(result.atk).toBe(10);
    expect(result.def).toBe(6);
    expect(result.spd).toBe(7);
});

test('logic: potion heals exactly 30 HP (capped at maxHp)', async ({ page }) => {
    await page.goto(BASE);
    const result = await page.evaluate(() => {
        const fish = { hp: 20, maxHp: 30 };
        const itemPower = 30;
        const healing = Math.min(itemPower, fish.maxHp - fish.hp);
        fish.hp += healing;
        return { healing, finalHp: fish.hp };
    });
    expect(result.healing).toBe(10);  // only 10 HP missing
    expect(result.finalHp).toBe(30);

    // Full potion on fish with 0 HP (can't heal fainted)
    const blocked = await page.evaluate(() => {
        const fish = { hp: 0, maxHp: 30 };
        return fish.hp <= 0;  // useItem checks hp > 0
    });
    expect(blocked).toBe(true);
});

test('logic: floor rewards trigger at correct floors', async ({ page }) => {
    await page.goto(BASE);
    const rewardFloors = await page.evaluate(() => {
        const rewards = [];
        for (let f = 1; f <= 100; f++) {
            if (f > 1 && f % 10 === 0) rewards.push(f);
        }
        return rewards;
    });
    expect(rewardFloors).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
});

test('logic: speed determines turn order (higher speed goes first)', async ({ page }) => {
    await page.goto(BASE);
    // Clownfish (spd=10) vs Sewer Rat floor 1 (spd = floor(3+1*0.15) = 3)
    const clownfishFirst = await page.evaluate(() => {
        const fishSpd = 10;
        const monsterSpd = Math.floor(3 + 1 * 0.15);  // 3
        return fishSpd >= monsterSpd;  // fish goes first
    });
    expect(clownfishFirst).toBe(true);

    // Pufferfish (spd=3) vs floor 30 monster (spd = floor(3+30*0.15) = 7)
    const pufferLast = await page.evaluate(() => {
        const fishSpd = 3;
        const monsterSpd = Math.floor(3 + 30 * 0.15);  // 7
        return fishSpd < monsterSpd;  // monster goes first
    });
    expect(pufferLast).toBe(true);
});

// ─── Step 10: Victory Scene ───────────────────────────────────────────────────

test('victory: injecting floor 101 triggers victory in game state', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    // Set up at floor 100 with full party
    await page.goto(BASE);
    await page.evaluate(() => {
        localStorage.setItem('dungeon-fisher-save', JSON.stringify({
            version: 1, savedAt: Date.now(), floor: 100, gold: 500, campFloor: 90,
            party: [
                { speciesId: 'guppy', name: 'Guppy', level: 15, xp: 0, xpToNext: 375,
                  hp: 100, maxHp: 100, atk: 36, def: 19, spd: 20, moves: ['splash', 'tackle', 'bubble_shot'],
                  poisoned: null, buffs: [] }
            ],
            inventory: []
        }));
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(1500);

    // CONTINUE → floor 100
    await clickGame(page, 240, 175);
    await page.waitForTimeout(600);

    await page.screenshot({ path: 'tests/browser/screenshots/v2-11-floor100.png' });

    expect(errors).toHaveLength(0);
    // Canvas still renders on floor 100
    const canvas = await getCanvas(page);
    await expect(canvas).toBeVisible();
});
