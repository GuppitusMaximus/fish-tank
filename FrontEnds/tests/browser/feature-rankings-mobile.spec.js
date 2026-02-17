const { test, expect, devices } = require('@playwright/test');

test.use({
  ...devices['iPhone 15 Pro'],
  viewport: { width: 393, height: 852 }
});

test.describe('Feature Rankings Mobile Responsiveness', () => {

  test('Tab button is accessible on mobile', async ({ page }) => {
    await page.goto('https://the-fish-tank.com/#weather');
    await page.waitForSelector('.dashboard', { timeout: 10000 });

    // Feature Rankings tab button should be visible
    const rankingsBtn = page.locator('.subnav-btn[data-subtab="rankings"]');
    await expect(rankingsBtn).toBeVisible();

    // Should be clickable
    await rankingsBtn.click();
    await page.waitForTimeout(300);

    // Rankings subtab should be visible
    const rankingsSubtab = page.locator('#subtab-rankings');
    await expect(rankingsSubtab).toBeVisible();
  });

  test('Rankings list has no horizontal scrolling', async ({ page }) => {
    await page.goto('https://the-fish-tank.com/#weather/rankings');
    await page.waitForSelector('.dashboard', { timeout: 10000 });

    // Skip if empty state
    const emptyState = page.locator('.rankings-empty');
    const hasEmptyState = await emptyState.isVisible().catch(() => false);
    if (hasEmptyState) {
      test.skip();
      return;
    }

    // Check rankings container doesn't overflow
    const rankingsList = page.locator('#rankings-list');
    const scrollWidth = await rankingsList.evaluate(el => el.scrollWidth);
    const clientWidth = await rankingsList.evaluate(el => el.clientWidth);

    // scrollWidth should be close to clientWidth (no horizontal scroll)
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 10); // Allow 10px tolerance
  });

  test('Ranking bars are still visible and proportionally sized', async ({ page }) => {
    await page.goto('https://the-fish-tank.com/#weather/rankings');
    await page.waitForSelector('.dashboard', { timeout: 10000 });

    // Skip if empty state
    const emptyState = page.locator('.rankings-empty');
    const hasEmptyState = await emptyState.isVisible().catch(() => false);
    if (hasEmptyState) {
      test.skip();
      return;
    }

    // Check first ranking bar is visible
    const firstBar = page.locator('.ranking-bar').first();
    await expect(firstBar).toBeVisible();

    // Should have some width
    const width = await firstBar.evaluate(el => {
      const style = window.getComputedStyle(el);
      return parseFloat(style.width);
    });

    expect(width).toBeGreaterThan(0);
  });

  test('Prediction history average row visible on mobile', async ({ page }) => {
    await page.goto('https://the-fish-tank.com/#weather');
    await page.waitForSelector('.dashboard', { timeout: 10000 });

    // History table should exist
    const historyTable = page.locator('#history-table');
    await expect(historyTable).toBeVisible();

    // Average row should exist
    const avgRow = page.locator('.avg-row');
    await expect(avgRow).toBeVisible();
  });

  test('Screenshot: Mobile view of rankings', async ({ page }) => {
    await page.goto('https://the-fish-tank.com/#weather/rankings');
    await page.waitForSelector('.dashboard', { timeout: 10000 });
    await page.waitForTimeout(500);

    await page.screenshot({
      path: 'tests/browser/screenshots/feature-rankings-mobile.png',
      fullPage: true
    });
  });

  test('Screenshot: Mobile view of dashboard with average row', async ({ page }) => {
    await page.goto('https://the-fish-tank.com/#weather');
    await page.waitForSelector('.dashboard', { timeout: 10000 });

    // Scroll to history table
    const historyTable = page.locator('#history-table');
    await historyTable.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    await page.screenshot({
      path: 'tests/browser/screenshots/average-deltas-mobile.png',
      fullPage: false
    });
  });

  test('Model selector is usable on mobile', async ({ page }) => {
    await page.goto('https://the-fish-tank.com/#weather/rankings');
    await page.waitForSelector('.dashboard', { timeout: 10000 });

    // Skip if empty state
    const emptyState = page.locator('.rankings-empty');
    const hasEmptyState = await emptyState.isVisible().catch(() => false);
    if (hasEmptyState) {
      test.skip();
      return;
    }

    // Model selector should be visible and tappable
    const modelSelect = page.locator('#rankings-model-select');
    await expect(modelSelect).toBeVisible();

    // Check it's within viewport
    const boundingBox = await modelSelect.boundingBox();
    expect(boundingBox).not.toBeNull();
    if (boundingBox) {
      expect(boundingBox.x).toBeGreaterThanOrEqual(0);
      expect(boundingBox.x + boundingBox.width).toBeLessThanOrEqual(393); // Viewport width
    }
  });
});
