const { test, expect } = require('@playwright/test');

test('site loads and shows home view', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('#home.active', { timeout: 10000 });

  const title = await page.title();
  expect(title).toBeTruthy();

  const homeEl = page.locator('#home');
  await expect(homeEl).toHaveClass(/active/);
});

test('hash routing works — #weather loads weather view', async ({ page }) => {
  await page.goto('/#weather');
  await page.waitForSelector('#weather.active', { timeout: 10000 });

  const weatherEl = page.locator('#weather');
  await expect(weatherEl).toHaveClass(/active/);

  const homeEl = page.locator('#home');
  await expect(homeEl).not.toHaveClass(/active/);
});
