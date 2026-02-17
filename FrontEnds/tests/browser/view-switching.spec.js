const { test, expect } = require('@playwright/test');

// --- Home page tests ---

test.describe('Home page', () => {
  test('loading / shows home view with weather summary visible', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#home.active', { timeout: 10000 });

    const home = page.locator('#home');
    await expect(home).toHaveClass(/active/);

    const weatherSummary = page.locator('#home-weather');
    await expect(weatherSummary).toBeVisible();
  });

  test('home page does NOT have "View full predictions" CTA (removed)', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#home.active', { timeout: 10000 });

    // Wait for weather data to load — CTA was removed in remove-predictions-cta plan
    await page.waitForTimeout(3000);
    const cta = page.locator('.cta-link');
    await expect(cta).not.toBeVisible();
  });

  test('weather summary cards are rendered on home', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#home.active', { timeout: 10000 });

    // Wait for at least one dash-card to render inside home-weather
    const cards = page.locator('#home-weather .dash-card');
    await expect(cards.first()).toBeVisible({ timeout: 15000 });

    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});

// --- Weather view refresh tests (bug regressions) ---

test.describe('Weather view refresh', () => {
  test('loading /#weather shows ONLY the weather dashboard', async ({ page }) => {
    await page.goto('/#weather');
    await page.waitForSelector('#weather.active', { timeout: 10000 });

    const weather = page.locator('#weather');
    await expect(weather).toHaveClass(/active/);

    const home = page.locator('#home');
    await expect(home).not.toHaveClass(/active/);
  });

  test('home CTA is NOT visible on weather view', async ({ page }) => {
    await page.goto('/#weather');
    await page.waitForSelector('#weather.active', { timeout: 10000 });

    // The .home-cta should not be visible when weather view is active
    // It lives inside #home which should be hidden
    const homeCta = page.locator('.home-cta');
    await expect(homeCta).not.toBeVisible();
  });

  test('nav bar is visible on weather view', async ({ page }) => {
    await page.goto('/#weather');
    await page.waitForSelector('#weather.active', { timeout: 10000 });

    const nav = page.locator('nav');
    await expect(nav).toBeVisible();
  });

  test('weather view is scrollable', async ({ page }) => {
    await page.goto('/#weather');
    await page.waitForSelector('#weather.active', { timeout: 10000 });

    // The weather view itself should allow vertical scrolling
    // (body may have overflow:hidden for game views, but #weather.active has overflow-y:auto)
    const weatherOverflow = await page.evaluate(() => {
      var el = document.getElementById('weather');
      return window.getComputedStyle(el).overflowY;
    });
    expect(weatherOverflow).toBe('auto');
  });
});

// --- View switching tests ---

test.describe('View switching', () => {
  test('click weather nav → weather view is active, home is not', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#home.active', { timeout: 10000 });

    await page.click('nav a[data-view="weather"]');
    await page.waitForSelector('#weather.active', { timeout: 10000 });

    const weather = page.locator('#weather');
    await expect(weather).toHaveClass(/active/);

    const home = page.locator('#home');
    await expect(home).not.toHaveClass(/active/);
  });

  test('click home nav → home view is active with weather summary', async ({ page }) => {
    await page.goto('/#weather');
    await page.waitForSelector('#weather.active', { timeout: 10000 });

    await page.click('nav a[data-view="home"]');
    await page.waitForSelector('#home.active', { timeout: 10000 });

    const home = page.locator('#home');
    await expect(home).toHaveClass(/active/);

    const weatherSummary = page.locator('#home-weather');
    await expect(weatherSummary).toBeVisible();
  });

  test('navigate home → weather → home → weather summary still shows', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#home.active', { timeout: 10000 });

    // Wait for initial weather summary to load
    await page.waitForSelector('#home-weather .dash-card', { timeout: 15000 });

    // Go to weather
    await page.click('nav a[data-view="weather"]');
    await page.waitForSelector('#weather.active', { timeout: 10000 });

    // Go back to home
    await page.click('nav a[data-view="home"]');
    await page.waitForSelector('#home.active', { timeout: 10000 });

    // Weather summary should still be visible
    const cards = page.locator('#home-weather .dash-card');
    await expect(cards.first()).toBeVisible({ timeout: 15000 });
  });
});

// --- Hash persistence tests ---

test.describe('Hash persistence', () => {
  test('load /#weather → weather view is active', async ({ page }) => {
    await page.goto('/#weather');
    await page.waitForSelector('#weather.active', { timeout: 10000 });

    const weather = page.locator('#weather');
    await expect(weather).toHaveClass(/active/);
  });

  test('load /#fishtank → fishtank view is active', async ({ page }) => {
    await page.goto('/#fishtank');
    await page.waitForSelector('#tank.active', { timeout: 10000 });

    const tank = page.locator('#tank');
    await expect(tank).toHaveClass(/active/);
  });

  test('load /#weather then nav has weather link highlighted', async ({ page }) => {
    await page.goto('/#weather');
    await page.waitForSelector('#weather.active', { timeout: 10000 });

    const weatherNav = page.locator('nav a[data-view="weather"]');
    await expect(weatherNav).toHaveClass(/active/);
  });

  test('load /#weather/workflow → weather view with workflow sub-tab active', async ({ page }) => {
    await page.goto('/#weather/workflow');
    await page.waitForSelector('#weather.active', { timeout: 10000 });

    const weather = page.locator('#weather');
    await expect(weather).toHaveClass(/active/);

    // Wait for the weather dashboard to render (sub-tabs appear after data fetch)
    await page.waitForSelector('.subnav-btn', { timeout: 15000 });

    // The workflow subnav button should have the active class
    const workflowBtn = page.locator('.subnav-btn[data-subtab="workflow"]');
    await expect(workflowBtn).toHaveClass(/active/);

    // The workflow sub-tab should not be hidden (display:none)
    const workflowTab = page.locator('#subtab-workflow');
    const display = await workflowTab.evaluate(el => el.style.display);
    expect(display).not.toBe('none');
  });
});

// --- Screenshot verification ---

test.describe('Screenshot verification', () => {
  test('take home view screenshot', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#home.active', { timeout: 10000 });

    // Wait for weather content to load
    await page.waitForSelector('#home-weather .dash-card', { timeout: 15000 });

    await page.screenshot({
      path: 'tests/browser/screenshots/home-baseline.png',
      fullPage: true,
    });
  });

  test('take weather view screenshot', async ({ page }) => {
    await page.goto('/#weather');
    await page.waitForSelector('#weather.active', { timeout: 10000 });

    // Wait for weather dashboard content to load
    await page.waitForTimeout(3000);

    await page.screenshot({
      path: 'tests/browser/screenshots/weather-baseline.png',
      fullPage: true,
    });
  });
});
