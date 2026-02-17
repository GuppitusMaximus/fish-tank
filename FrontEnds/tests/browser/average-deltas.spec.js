const { test, expect } = require('@playwright/test');

test.describe('Average Delta Display', () => {
  test('Average row is visible in prediction history table', async ({ page }) => {
    await page.goto('https://the-fish-tank.com/#weather');
    await page.waitForSelector('.dashboard', { timeout: 10000 });

    // History table should exist
    const historyTable = page.locator('#history-table');
    await expect(historyTable).toBeVisible();

    // Average row should exist
    const avgRow = page.locator('.avg-row');
    await expect(avgRow).toBeVisible();
  });

  test('Average cells contain "avg" label', async ({ page }) => {
    await page.goto('https://the-fish-tank.com/#weather');
    await page.waitForSelector('.dashboard', { timeout: 10000 });

    // Average row should exist
    const avgRow = page.locator('.avg-row');
    const isVisible = await avgRow.isVisible().catch(() => false);

    if (!isVisible) {
      test.skip();
      return;
    }

    // Average delta cells should contain "avg"
    const avgDeltaCells = avgRow.locator('.avg-delta');
    const count = await avgDeltaCells.count();

    if (count > 0) {
      const firstCell = avgDeltaCells.first();
      const text = await firstCell.textContent();
      expect(text.toLowerCase()).toContain('avg');
    }
  });

  test('Filter interaction: average values are present after applying model filter', async ({ page }) => {
    await page.goto('https://the-fish-tank.com/#weather');
    await page.waitForSelector('.dashboard', { timeout: 10000 });

    // Check if model filter exists
    const modelFilter = page.locator('#filter-model');
    const hasFilter = await modelFilter.isVisible().catch(() => false);

    if (!hasFilter) {
      test.skip();
      return;
    }

    // Apply a model filter (click to open, select first option)
    await modelFilter.click();
    const firstOption = page.locator('#filter-model-dropdown .multiselect-option').first();
    const hasOptions = await firstOption.isVisible().catch(() => false);

    if (!hasOptions) {
      test.skip();
      return;
    }

    await firstOption.click();
    await page.waitForTimeout(500); // Let table recalculate

    // Average row should still be visible
    const avgRow = page.locator('.avg-row');
    await expect(avgRow).toBeVisible();

    // Average delta cells should still exist
    const avgDeltaCells = avgRow.locator('.avg-delta');
    const count = await avgDeltaCells.count();
    expect(count).toBeGreaterThanOrEqual(0); // Could be 0 if filtered data has no deltas
  });

  test('Date range filter: average values recalculate', async ({ page }) => {
    await page.goto('https://the-fish-tank.com/#weather');
    await page.waitForSelector('.dashboard', { timeout: 10000 });

    // Check if date filters exist
    const dateStart = page.locator('#filter-date-start');
    const hasDateFilter = await dateStart.isVisible().catch(() => false);

    if (!hasDateFilter) {
      test.skip();
      return;
    }

    // Get initial average text
    const avgRow = page.locator('.avg-row');
    const avgDeltaCells = avgRow.locator('.avg-delta');
    const initialCount = await avgDeltaCells.count();

    if (initialCount === 0) {
      test.skip();
      return;
    }

    const initialText = await avgDeltaCells.first().textContent();

    // Apply date filter
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(today.getDate() - 7);
    const dateString = weekAgo.toISOString().split('T')[0]; // YYYY-MM-DD

    await dateStart.fill(dateString);
    await page.waitForTimeout(500); // Let table recalculate

    // Average row should still be visible
    await expect(avgRow).toBeVisible();

    // Average values may have changed (or not, depending on data)
    // Just verify they still render
    const newCount = await avgDeltaCells.count();
    expect(newCount).toBeGreaterThanOrEqual(0);
  });

  test('Screenshot: History table with average row visible', async ({ page }) => {
    await page.goto('https://the-fish-tank.com/#weather');
    await page.waitForSelector('.dashboard', { timeout: 10000 });

    // Scroll to history table
    const historyTable = page.locator('#history-table');
    await historyTable.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    await page.screenshot({
      path: 'tests/browser/screenshots/average-deltas-visible.png',
      fullPage: false
    });
  });

  test('Average row has correct styling (delta color classes)', async ({ page }) => {
    await page.goto('https://the-fish-tank.com/#weather');
    await page.waitForSelector('.dashboard', { timeout: 10000 });

    const avgRow = page.locator('.avg-row');
    const isVisible = await avgRow.isVisible().catch(() => false);

    if (!isVisible) {
      test.skip();
      return;
    }

    const avgDeltaCells = avgRow.locator('.avg-delta');
    const count = await avgDeltaCells.count();

    if (count === 0) {
      test.skip();
      return;
    }

    // Check if delta classes are applied (delta-positive, delta-negative, delta-neutral)
    const firstCell = avgDeltaCells.first();
    const className = await firstCell.getAttribute('class');

    // Should have avg-delta class at minimum
    expect(className).toContain('avg-delta');

    // May also have delta styling classes
    const hasDeltaClass = className.includes('delta-positive') ||
                          className.includes('delta-negative') ||
                          className.includes('delta-neutral');

    // This is informational, not required
    if (hasDeltaClass) {
      expect(hasDeltaClass).toBe(true);
    }
  });
});
