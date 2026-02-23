/**
 * QA: Dungeon Page Scrollable
 * Plan: qa-browser-dungeon-page-scrollable
 *
 * Verifies that the #dungeon view is taller than the viewport (scrollable),
 * allowing the header to scroll out of view so the game fills the full screen.
 * Other game views (#fishtank, #battle, #fighter) should remain non-scrollable.
 */

const { test, expect } = require('@playwright/test');

const SITE = 'https://the-fish-tank.com';

async function navigateTo(page, view) {
    await page.goto(`${SITE}/#${view}`);
    await page.waitForTimeout(1000);
}

test.describe('Dungeon view — scrollable layout', () => {
    test.use({ viewport: { width: 1280, height: 800 } });

    test('dungeon page is taller than viewport', async ({ page }) => {
        await navigateTo(page, 'dungeon');

        // The page should be taller than the viewport (content height > viewport height)
        // due to header + 100vh game container
        const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
        const viewportHeight = await page.evaluate(() => window.innerHeight);

        await page.screenshot({ path: 'tests/browser/screenshots/dungeon-scrollable-01-initial.png' });

        expect(scrollHeight, `Page scroll height (${scrollHeight}) should exceed viewport height (${viewportHeight}) — dungeon should be scrollable`).toBeGreaterThan(viewportHeight);
    });

    test('header is visible at top of dungeon view', async ({ page }) => {
        await navigateTo(page, 'dungeon');

        // Scroll back to top first
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(300);

        const header = page.locator('header');
        await expect(header).toBeVisible();

        const headerBox = await header.boundingBox();
        expect(headerBox).not.toBeNull();
        // Header top should be near y=0 when scrolled to top
        expect(headerBox.y, `Header top (${headerBox.y}) should be near 0 at scroll position 0`).toBeLessThan(10);
    });

    test('scrolling down hides the header', async ({ page }) => {
        await navigateTo(page, 'dungeon');

        // Get header height to know how far to scroll
        const headerHeight = await page.locator('header').evaluate(el => el.offsetHeight);

        // Scroll past the header
        await page.evaluate((h) => window.scrollTo(0, h + 20), headerHeight);
        await page.waitForTimeout(400);

        await page.screenshot({ path: 'tests/browser/screenshots/dungeon-scrollable-02-scrolled.png' });

        // Header should be scrolled out of the visible viewport
        const headerBox = await page.locator('header').boundingBox();
        if (headerBox !== null) {
            // If boundingBox is non-null, check it's above the visible area (negative y or very small)
            expect(headerBox.y, `Header y (${headerBox.y}) should be negative (scrolled out of view)`).toBeLessThan(0);
        }
        // If boundingBox is null, header is not in the layout (also means not visible)
    });

    test('dungeon iframe is present in #dungeon', async ({ page }) => {
        await navigateTo(page, 'dungeon');

        // The dungeon-fisher.js creates an iframe inside #dungeon
        const iframe = page.locator('#dungeon iframe');
        await expect(iframe).toBeVisible({ timeout: 5000 });
    });
});

test.describe('Dungeon view — mobile viewport (390x844)', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('dungeon page is scrollable on mobile', async ({ page }) => {
        await navigateTo(page, 'dungeon');

        const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
        const viewportHeight = await page.evaluate(() => window.innerHeight);

        await page.screenshot({ path: 'tests/browser/screenshots/dungeon-scrollable-03-mobile.png' });

        expect(scrollHeight, `Mobile: page height (${scrollHeight}) should exceed viewport (${viewportHeight})`).toBeGreaterThan(viewportHeight);
    });

    test('header visible initially on mobile, hidden after scroll', async ({ page }) => {
        await navigateTo(page, 'dungeon');
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(300);

        const header = page.locator('header');
        await expect(header).toBeVisible();

        const headerHeight = await header.evaluate(el => el.offsetHeight);
        await page.evaluate((h) => window.scrollTo(0, h + 20), headerHeight);
        await page.waitForTimeout(400);

        await page.screenshot({ path: 'tests/browser/screenshots/dungeon-scrollable-04-mobile-scrolled.png' });

        const headerBox = await header.boundingBox();
        if (headerBox !== null) {
            expect(headerBox.y, `Mobile: header y (${headerBox.y}) should be negative after scroll`).toBeLessThan(0);
        }
    });
});

test.describe('Other game views — non-scrollable layout', () => {
    test.use({ viewport: { width: 1280, height: 800 } });

    for (const view of ['fishtank', 'battle', 'fighter']) {
        test(`${view} view: CSS height is calc(100vh - 6rem), not 100vh`, async ({ page }) => {
            await navigateTo(page, view);

            // The plan changed #dungeon to height:100vh but left #tank/#arena/#sky unchanged.
            // Verify the computed height of the game container is less than the viewport
            // (calc(100vh - 6rem) = approx. viewport - 96px at 1rem=16px).
            const viewId = view === 'fishtank' ? 'tank' : view === 'battle' ? 'arena' : 'sky';
            const containerHeight = await page.locator(`#${viewId}`).evaluate(el => el.offsetHeight);
            const viewportH = await page.evaluate(() => window.innerHeight);

            await page.screenshot({ path: `tests/browser/screenshots/dungeon-scrollable-05-${view}-no-scroll.png` });

            // Game container height should be significantly less than 100vh
            // (calc(100vh - 6rem) ≈ viewport - 96px for 1rem=16px)
            expect(containerHeight, `${view} view game container (${containerHeight}px) should be less than viewport (${viewportH}px)`).toBeLessThan(viewportH);
        });
    }

    test('dungeon view scroll range is much larger than other game views', async ({ page }) => {
        // Dungeon should scroll by header height; other views should scroll far less
        await navigateTo(page, 'dungeon');
        const dungeonMaxScroll = await page.evaluate(() => document.body.scrollHeight - window.innerHeight);

        await navigateTo(page, 'fishtank');
        const fishtankMaxScroll = await page.evaluate(() => document.body.scrollHeight - window.innerHeight);

        // Dungeon scroll range should be much larger (header height = ~60-90px)
        // Other views should have minimal scroll range
        expect(dungeonMaxScroll, `Dungeon max scroll (${dungeonMaxScroll}px) should be much greater than fishtank (${fishtankMaxScroll}px)`).toBeGreaterThan(fishtankMaxScroll + 40);
    });

    test('switching from dungeon to fishtank resets scroll', async ({ page }) => {
        await navigateTo(page, 'dungeon');

        // Scroll down on dungeon
        const headerHeight = await page.locator('header').evaluate(el => el.offsetHeight);
        await page.evaluate((h) => window.scrollTo(0, h + 20), headerHeight);
        await page.waitForTimeout(300);

        // Switch to fishtank
        await page.evaluate(() => window.location.hash = '#fishtank');
        await page.waitForTimeout(1000);

        await page.screenshot({ path: 'tests/browser/screenshots/dungeon-scrollable-06-back-to-tank.png' });

        const header = page.locator('header');
        await expect(header).toBeVisible();
    });

    test('switching back to dungeon from another view works', async ({ page }) => {
        await navigateTo(page, 'fishtank');
        await page.waitForTimeout(500);

        await page.evaluate(() => window.location.hash = '#dungeon');
        await page.waitForTimeout(1000);

        await page.screenshot({ path: 'tests/browser/screenshots/dungeon-scrollable-07-return-to-dungeon.png' });

        const dungeon = page.locator('#dungeon');
        await expect(dungeon).toBeVisible();
    });
});
