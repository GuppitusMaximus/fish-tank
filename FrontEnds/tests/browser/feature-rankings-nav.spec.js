const { test, expect } = require('@playwright/test');

test.describe('Feature Rankings Navigation', () => {
  test('Dashboard tab is active by default, Feature Rankings button is visible', async ({ page }) => {
    await page.goto('https://the-fish-tank.com/#weather');
    await page.waitForSelector('.dashboard', { timeout: 10000 });

    // Dashboard tab should be active
    const dashboardBtn = page.locator('.subnav-btn[data-subtab="dashboard"]');
    await expect(dashboardBtn).toHaveClass(/active/);

    // Feature Rankings tab button should be visible
    const rankingsBtn = page.locator('.subnav-btn[data-subtab="rankings"]');
    await expect(rankingsBtn).toBeVisible();
  });

  test('Click Feature Rankings tab — shows rankings subtab and updates URL', async ({ page }) => {
    await page.goto('https://the-fish-tank.com/#weather');
    await page.waitForSelector('.dashboard', { timeout: 10000 });

    // Click Feature Rankings button
    const rankingsBtn = page.locator('.subnav-btn[data-subtab="rankings"]');
    await rankingsBtn.click();
    await page.waitForTimeout(300); // Let UI update

    // Rankings subtab should be visible
    const rankingsSubtab = page.locator('#subtab-rankings');
    await expect(rankingsSubtab).toBeVisible();

    // URL should update (using replaceState, not navigation)
    expect(page.url()).toContain('#weather/rankings');

    // Rankings button should be active
    await expect(rankingsBtn).toHaveClass(/active/);
  });

  test('Click back to Dashboard from Feature Rankings', async ({ page }) => {
    await page.goto('https://the-fish-tank.com/#weather/rankings');
    await page.waitForSelector('.dashboard', { timeout: 10000 });

    // Click Dashboard button
    const dashboardBtn = page.locator('.subnav-btn[data-subtab="dashboard"]');
    await dashboardBtn.click();
    await page.waitForTimeout(300); // Let UI update

    // Rankings subtab should be hidden
    const rankingsSubtab = page.locator('#subtab-rankings');
    await expect(rankingsSubtab).not.toBeVisible();

    // Dashboard subtab should be visible
    const dashboardSubtab = page.locator('#subtab-dashboard');
    await expect(dashboardSubtab).toBeVisible();

    // URL should update to #weather (using replaceState, not navigation)
    expect(page.url()).toMatch(/#weather$/);
  });

  test('Direct navigation to #weather/rankings loads with rankings tab active', async ({ page }) => {
    await page.goto('https://the-fish-tank.com/#weather/rankings');
    await page.waitForSelector('.dashboard', { timeout: 10000 });

    // Rankings button should be active
    const rankingsBtn = page.locator('.subnav-btn[data-subtab="rankings"]');
    await expect(rankingsBtn).toHaveClass(/active/);

    // Rankings subtab should be visible
    const rankingsSubtab = page.locator('#subtab-rankings');
    await expect(rankingsSubtab).toBeVisible();

    // Dashboard subtab should be hidden
    const dashboardSubtab = page.locator('#subtab-dashboard');
    await expect(dashboardSubtab).not.toBeVisible();
  });

  test('Screenshot: Rankings tab populated state', async ({ page }) => {
    await page.goto('https://the-fish-tank.com/#weather/rankings');
    await page.waitForSelector('.dashboard', { timeout: 10000 });
    await page.waitForTimeout(500); // Let content render

    await page.screenshot({
      path: 'tests/browser/screenshots/feature-rankings-nav-populated.png',
      fullPage: true
    });
  });

  test('Screenshot: Rankings tab empty state (if applicable)', async ({ page }) => {
    // This test captures the empty state message if no rankings data exists
    await page.goto('https://the-fish-tank.com/#weather/rankings');
    await page.waitForSelector('.dashboard', { timeout: 10000 });
    await page.waitForTimeout(500);

    const emptyState = page.locator('.rankings-empty');
    const hasEmptyState = await emptyState.isVisible().catch(() => false);

    if (hasEmptyState) {
      await page.screenshot({
        path: 'tests/browser/screenshots/feature-rankings-nav-empty.png',
        fullPage: true
      });
    }
  });
});
