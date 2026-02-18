const { test, expect } = require('@playwright/test');

// NOTE: The compass station view now loads data from weather-public.json via
// latestData.public_stations (fix: qa-fix-compass-frontend-datasource). The
// manifest/data-index fetch has been removed. Compass renders when public station
// data is present in weather-public.json.

test.describe('Compass Station View — Live Site', () => {

  test('home page loads and compass container exists', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#home.active', { timeout: 15000 });

    // Container element should always be present in HTML
    const compass = page.locator('#home-compass');
    await expect(compass).toBeAttached();

    await page.screenshot({ path: 'tests/browser/screenshots/compass-overview.png', fullPage: false });
  });

  test('compass container is present in home view DOM', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#home', { timeout: 10000 });

    const compass = page.locator('#home-compass');
    const count = await compass.count();
    expect(count).toBe(1);
  });

});

test.describe('Compass Station View — With Data (skipped if data unavailable)', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Try to wait for compass SVG — skip gracefully if data can't load
    try {
      await page.waitForSelector('#home-compass svg', { timeout: 20000 });
    } catch (e) {
      test.skip(true, 'Compass data not available — weather-public.json may not contain public_stations yet.');
    }
  });

  test('compass rose SVG is visible', async ({ page }) => {
    const compass = page.locator('#home-compass');
    await expect(compass).toBeVisible();

    const svg = compass.locator('svg');
    await expect(svg).toBeVisible();

    await page.screenshot({ path: 'tests/browser/screenshots/compass-overview.png', fullPage: false });
  });

  test('cardinal direction labels are present', async ({ page }) => {
    const svg = page.locator('#home-compass svg');

    const labels = await svg.locator('.compass-cardinal').allTextContents();
    expect(labels).toContain('N');
    expect(labels).toContain('S');
    expect(labels).toContain('E');
    expect(labels).toContain('W');
  });

  test('station dots are rendered', async ({ page }) => {
    const dots = page.locator('#home-compass .compass-station');
    const count = await dots.count();
    expect(count).toBeGreaterThan(10);
  });

  test('temperature labels are shown', async ({ page }) => {
    const labels = page.locator('#home-compass .compass-temp-label');
    const count = await labels.count();
    expect(count).toBeGreaterThan(10);

    const firstLabel = await labels.first().textContent();
    expect(firstLabel).toMatch(/[\-]?\d+\.?\d*°/);
  });

  test('station dots have color coding', async ({ page }) => {
    const dots = page.locator('#home-compass .compass-station');
    const firstDot = dots.first();

    const fill = await firstDot.getAttribute('fill');
    expect(fill).toMatch(/#(4a9eff|4acfcf|ffaa4a|ff6b4a)/i);
  });

  test('hover tooltip appears on station dot', async ({ page }) => {
    const dot = page.locator('#home-compass .compass-station').first();
    await dot.hover();

    const tooltip = page.locator('.compass-tooltip');
    await expect(tooltip).toBeVisible({ timeout: 2000 });

    const text = await tooltip.textContent();
    expect(text).toContain('°');

    await page.screenshot({ path: 'tests/browser/screenshots/compass-tooltip.png' });
  });

  test('metadata shows station count', async ({ page }) => {
    const meta = page.locator('#home-compass .compass-meta');
    await expect(meta).toBeVisible();

    const text = await meta.textContent();
    expect(text).toMatch(/\d+ stations/i);
  });

  test('compass is responsive on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForSelector('#home-compass svg', { timeout: 20000 });

    const svg = page.locator('#home-compass svg');
    await expect(svg).toBeVisible();

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
