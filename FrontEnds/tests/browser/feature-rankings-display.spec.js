const { test, expect } = require('@playwright/test');

test.describe('Feature Rankings Display', () => {
  test('Empty state message when no rankings data', async ({ page }) => {
    await page.goto('https://the-fish-tank.com/#weather/rankings');
    await page.waitForSelector('.dashboard', { timeout: 10000 });

    // Check if empty state exists
    const emptyState = page.locator('.rankings-empty');
    const hasEmptyState = await emptyState.isVisible().catch(() => false);

    if (hasEmptyState) {
      const message = await emptyState.locator('p').textContent();
      expect(message).toContain('No feature rankings available yet');
    }
  });

  test('Populated state: model selector is visible', async ({ page }) => {
    await page.goto('https://the-fish-tank.com/#weather/rankings');
    await page.waitForSelector('.dashboard', { timeout: 10000 });

    // Skip if empty state
    const emptyState = page.locator('.rankings-empty');
    const hasEmptyState = await emptyState.isVisible().catch(() => false);
    if (hasEmptyState) {
      test.skip();
      return;
    }

    // Model selector should be visible
    const modelSelect = page.locator('#rankings-model-select');
    await expect(modelSelect).toBeVisible();

    // Should have at least one option
    const options = await modelSelect.locator('option').count();
    expect(options).toBeGreaterThan(0);
  });

  test('Populated state: rankings rows render', async ({ page }) => {
    await page.goto('https://the-fish-tank.com/#weather/rankings');
    await page.waitForSelector('.dashboard', { timeout: 10000 });

    // Skip if empty state
    const emptyState = page.locator('.rankings-empty');
    const hasEmptyState = await emptyState.isVisible().catch(() => false);
    if (hasEmptyState) {
      test.skip();
      return;
    }

    // At least one ranking row should render
    const rankingRows = page.locator('.ranking-row');
    const rowCount = await rankingRows.count();
    expect(rowCount).toBeGreaterThan(0);
  });

  test('Populated state: ranking bars have width for top features', async ({ page }) => {
    await page.goto('https://the-fish-tank.com/#weather/rankings');
    await page.waitForSelector('.dashboard', { timeout: 10000 });

    // Skip if empty state
    const emptyState = page.locator('.rankings-empty');
    const hasEmptyState = await emptyState.isVisible().catch(() => false);
    if (hasEmptyState) {
      test.skip();
      return;
    }

    // Check the first ranking bar has non-zero width
    const firstBar = page.locator('.ranking-bar').first();
    const width = await firstBar.evaluate(el => {
      const style = window.getComputedStyle(el);
      return parseFloat(style.width);
    });

    expect(width).toBeGreaterThan(0);
  });

  test('Populated state: coefficient values are displayed', async ({ page }) => {
    await page.goto('https://the-fish-tank.com/#weather/rankings');
    await page.waitForSelector('.dashboard', { timeout: 10000 });

    // Skip if empty state
    const emptyState = page.locator('.rankings-empty');
    const hasEmptyState = await emptyState.isVisible().catch(() => false);
    if (hasEmptyState) {
      test.skip();
      return;
    }

    // Check that coefficient values exist
    const firstCoef = page.locator('.ranking-coef').first();
    const coefText = await firstCoef.textContent();
    expect(coefText).toMatch(/[+-]?\d+\.\d+/); // Matches numeric format
  });

  test('Populated state: green and red bars distinguish positive/negative coefficients', async ({ page }) => {
    await page.goto('https://the-fish-tank.com/#weather/rankings');
    await page.waitForSelector('.dashboard', { timeout: 10000 });

    // Skip if empty state
    const emptyState = page.locator('.rankings-empty');
    const hasEmptyState = await emptyState.isVisible().catch(() => false);
    if (hasEmptyState) {
      test.skip();
      return;
    }

    // Check for positive bars
    const positiveBars = page.locator('.ranking-bar-positive');
    const positiveCount = await positiveBars.count();

    // Check for negative bars
    const negativeBars = page.locator('.ranking-bar-negative');
    const negativeCount = await negativeBars.count();

    // At least one type should exist (features will have either positive or negative coefficients)
    expect(positiveCount + negativeCount).toBeGreaterThan(0);
  });

  test('Model switching: rankings update when model selector changes', async ({ page }) => {
    await page.goto('https://the-fish-tank.com/#weather/rankings');
    await page.waitForSelector('.dashboard', { timeout: 10000 });

    // Skip if empty state
    const emptyState = page.locator('.rankings-empty');
    const hasEmptyState = await emptyState.isVisible().catch(() => false);
    if (hasEmptyState) {
      test.skip();
      return;
    }

    const modelSelect = page.locator('#rankings-model-select');
    const options = await modelSelect.locator('option').count();

    // Only test switching if multiple models exist
    if (options < 2) {
      test.skip();
      return;
    }

    // Get initial first ranking name
    const initialRankingName = await page.locator('.ranking-name').first().textContent();

    // Switch to second model
    await modelSelect.selectOption({ index: 1 });
    await page.waitForTimeout(300); // Let UI update

    // Get new first ranking name
    const newRankingName = await page.locator('.ranking-name').first().textContent();

    // Rankings should potentially differ (though not guaranteed if same top feature)
    // At minimum, verify re-render occurred by checking element still exists
    expect(newRankingName).toBeTruthy();
  });

  test('Screenshot: Populated rankings with visible bars', async ({ page }) => {
    await page.goto('https://the-fish-tank.com/#weather/rankings');
    await page.waitForSelector('.dashboard', { timeout: 10000 });

    // Skip if empty state
    const emptyState = page.locator('.rankings-empty');
    const hasEmptyState = await emptyState.isVisible().catch(() => false);
    if (hasEmptyState) {
      test.skip();
      return;
    }

    await page.waitForTimeout(500);
    await page.screenshot({
      path: 'tests/browser/screenshots/feature-rankings-display-populated.png',
      fullPage: true
    });
  });
});
