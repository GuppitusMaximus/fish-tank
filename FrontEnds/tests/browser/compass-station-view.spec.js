const { test, expect } = require('@playwright/test');

test.describe('Compass Station View', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for compass to load (it fetches data async)
    await page.waitForSelector('#home-compass svg', { timeout: 15000 });
  });

  test('compass rose is visible on home page', async ({ page }) => {
    const compass = page.locator('#home-compass');
    await expect(compass).toBeVisible();

    const svg = compass.locator('svg');
    await expect(svg).toBeVisible();

    await page.screenshot({ path: 'tests/browser/screenshots/compass-overview.png', fullPage: false });
  });

  test('cardinal direction labels are present', async ({ page }) => {
    const svg = page.locator('#home-compass svg');

    // Check N, S, E, W labels
    const labels = await svg.locator('.compass-cardinal').allTextContents();
    expect(labels).toContain('N');
    expect(labels).toContain('S');
    expect(labels).toContain('E');
    expect(labels).toContain('W');
  });

  test('station dots are rendered', async ({ page }) => {
    const dots = page.locator('#home-compass .compass-station');
    const count = await dots.count();

    // Should have at least 10 stations (typically ~26)
    expect(count).toBeGreaterThan(10);
  });

  test('temperature labels are shown', async ({ page }) => {
    const labels = page.locator('#home-compass .compass-temp-label');
    const count = await labels.count();

    // Should have labels for stations
    expect(count).toBeGreaterThan(10);

    // Labels should contain degree values (e.g., "2.1°")
    const firstLabel = await labels.first().textContent();
    expect(firstLabel).toMatch(/[\-]?\d+\.?\d*°/);
  });

  test('station dots have color coding', async ({ page }) => {
    const dots = page.locator('#home-compass .compass-station');
    const firstDot = dots.first();

    const fill = await firstDot.getAttribute('fill');
    // Should be one of the temperature colors
    expect(fill).toMatch(/#(4a9eff|4acfcf|ffaa4a|ff6b4a)/i);
  });

  test('hover tooltip appears on station dot', async ({ page }) => {
    const dot = page.locator('#home-compass .compass-station').first();
    await dot.hover();

    // Tooltip should appear
    const tooltip = page.locator('.compass-tooltip');
    await expect(tooltip).toBeVisible({ timeout: 2000 });

    // Tooltip should contain temperature info
    const text = await tooltip.textContent();
    expect(text).toContain('°');

    await page.screenshot({ path: 'tests/browser/screenshots/compass-tooltip.png' });
  });

  test('metadata shows station count', async ({ page }) => {
    const meta = page.locator('#home-compass .compass-meta');
    await expect(meta).toBeVisible();

    const text = await meta.textContent();
    // Should show something like "26 stations · Updated 04:00"
    expect(text).toMatch(/\d+ stations/i);
  });

  test('compass is responsive on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForSelector('#home-compass svg', { timeout: 15000 });

    const svg = page.locator('#home-compass svg');
    await expect(svg).toBeVisible();

    // SVG should be within mobile bounds
    const box = await svg.boundingBox();
    expect(box.width).toBeLessThanOrEqual(280);

    await page.screenshot({ path: 'tests/browser/screenshots/compass-mobile.png', fullPage: false });
  });

  test('concentric distance rings are present', async ({ page }) => {
    const rings = page.locator('#home-compass .compass-ring');
    const count = await rings.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

});
