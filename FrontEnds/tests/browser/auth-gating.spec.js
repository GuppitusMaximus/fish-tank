const { test, expect } = require('@playwright/test');

const SITE = 'https://the-fish-tank.com';

test.beforeEach(async ({ page }) => {
  // Ensure unauthenticated state
  await page.goto(SITE);
  await page.evaluate(() => localStorage.removeItem('fishtank_auth_token'));
  await page.goto(SITE);
  await page.waitForLoadState('domcontentloaded');
});

test('weather nav link hidden without auth', async ({ page }) => {
  // The weather nav link has auth-gated auth-hidden classes when unauthenticated
  const weatherLink = page.locator('a[data-view="weather"]');
  // It should exist in DOM but be hidden
  await expect(weatherLink).toHaveClass(/auth-hidden/);
  const isVisible = await weatherLink.evaluate(el => {
    const style = window.getComputedStyle(el);
    return style.display !== 'none';
  });
  expect(isVisible).toBe(false);
});

test('sign-in link visible on home page', async ({ page }) => {
  const signinLink = page.locator('#signin-link');
  await expect(signinLink).toBeVisible();
});

test('home page shows weather data without authentication', async ({ page }) => {
  // The home page loads weather-public.json and shows current readings.
  // NOTE: This test will fail if weather-public.json is not deployed to the-fish-tank.com/data/.
  // See bug report: Planning/bugs/website-auth-frontend-weather-public-missing.md
  await page.waitForTimeout(3000);
  const homeWeather = page.locator('#home-weather');
  const content = await homeWeather.textContent();
  // If content is empty, weather-public.json is missing or the fetch failed
  expect(content.trim().length).toBeGreaterThan(0);
});

test('direct hash navigation to weather without auth does not show prediction data', async ({ page }) => {
  // Navigate directly to #weather without auth
  await page.goto(SITE + '#weather');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1500);

  // The weather view might be visible (no redirect enforced by JS), but
  // it should not be able to load authenticated data (Worker returns 401)
  // Verify that no prediction rows/cards are visible
  const predictionCards = page.locator('.pred-row, .prediction-card, .dash-cards .dash-card');
  const count = await predictionCards.count();
  // Either zero prediction cards, or the view shows an error/empty state
  // The key check: no data from authenticated endpoint is shown
  const weatherDiv = page.locator('#weather');
  const weatherText = await weatherDiv.textContent();

  // Should not contain temperature readings from authenticated predictions
  // (The public endpoint only provides home summary; #weather full data requires auth)
  // We verify the weather section doesn't have rows of prediction data loaded
  expect(count).toBe(0);
});

test('no raw GitHub data leak after unauthenticated hash navigation', async ({ page }) => {
  // Intercept any requests to raw.githubusercontent.com to confirm no fallback
  const rawRequests = [];
  page.on('request', req => {
    if (req.url().includes('raw.githubusercontent.com')) {
      rawRequests.push(req.url());
    }
  });

  await page.goto(SITE + '#weather');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);

  expect(rawRequests.length).toBe(0);
});

test('screenshot of unauthenticated home page', async ({ page }) => {
  await page.waitForTimeout(2000); // Let home weather summary load
  await page.screenshot({ path: 'tests/browser/screenshots/auth-gating-home-unauth.png' });
});
