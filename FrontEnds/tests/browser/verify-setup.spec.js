const { test, expect } = require('@playwright/test');

test('can take screenshot of home page', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('#home.active', { timeout: 10000 });
  await page.screenshot({ path: 'tests/browser/screenshots/home.png', fullPage: true });
});

test('can take screenshot of weather page', async ({ page }) => {
  await page.goto('/#weather');
  await page.waitForSelector('#weather.active', { timeout: 10000 });
  await page.screenshot({ path: 'tests/browser/screenshots/weather.png', fullPage: true });
});
