/**
 * Browser QA: Dungeon Fisher Gold Shimmer
 * Plan: qa-dungeon-fisher-gold-shimmer
 *
 * Verifies that the title text alpha pulse was replaced with a gold shimmer
 * sweep using Phaser's per-corner tinting (tweens.addCounter + setTint).
 *
 * Code-inspected checks (verified by reading TitleScene.js):
 *   1. No alpha: { from: 0.85, to: 1.0 } tween on titleText
 *   2. tweens.addCounter updates titleText.setTint() with varying left/right
 *   3. baseGold = 0xf0c040, brightGold = 0xffeeaa (lighter)
 *   4. addCounter has repeat: -1
 *   5. Phase 1 glow (alpha→0.6, scale→0.7) and Phase 2 break-through (alpha→1, scale→1) intact
 *
 * Browser-tested checks:
 *   6. No console errors on title screen load (including after shimmer starts)
 *
 * Runs against local dev server at localhost:8080.
 */

const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:8080';

async function freshStart(page) {
    await page.goto(BASE);
    await page.evaluate(() => localStorage.removeItem('dungeon-fisher-save'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(1500);
}

// ─── Step 6: No console errors during shimmer ────────────────────────────────

test('gold shimmer: no JS errors during title screen load and shimmer start', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await freshStart(page);
    // Wait for Phase 1 (0-2s), Phase 2 (2-3.5s), and shimmer to start
    await page.waitForTimeout(4000);

    await page.screenshot({ path: 'tests/browser/screenshots/gold-shimmer-01-active.png' });
    expect(errors, `JS errors during gold shimmer: ${errors.join(', ')}`).toHaveLength(0);
});

test('gold shimmer: no JS errors after sustained shimmer (5s)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await freshStart(page);
    // Full entrance + first full shimmer cycle (3s duration, repeat -1)
    await page.waitForTimeout(5000);

    await page.screenshot({ path: 'tests/browser/screenshots/gold-shimmer-02-sustained.png' });
    expect(errors, `JS errors after sustained shimmer: ${errors.join(', ')}`).toHaveLength(0);
});
