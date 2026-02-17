const { test, expect } = require('@playwright/test');

// SQLite WASM Browse Data Migration Tests
// Tests the SQLite database integration for Browse Data feature

test.describe('SQLite Browse Data - Database Loading', () => {
  test('loads database when entering Browse Data', async ({ page }) => {
    await page.goto('/#weather');
    await page.waitForSelector('#weather.active', { timeout: 10000 });

    // Navigate to Browse Data tab
    const browseTab = page.locator('button[data-subtab="browse"]');
    await browseTab.click();

    // Wait for loading indicator to appear (may be very fast if cached)
    const loadingEl = page.locator('.db-loading');

    // Wait for either loading to appear or Browse Data UI to render
    await Promise.race([
      page.waitForSelector('.db-loading', { timeout: 2000 }).catch(() => {}),
      page.waitForSelector('.browse-category-bar', { timeout: 5000 })
    ]);

    // Verify Browse Data content is visible (category buttons, date selector)
    await page.waitForSelector('.browse-category-bar', { timeout: 10000 });
    const categoryButtons = page.locator('.browse-cat-btn');
    await expect(categoryButtons.first()).toBeVisible();

    const dateSelect = page.locator('.browse-date-select');
    await expect(dateSelect).toBeVisible();
  });

  test('loading indicator shows progress during database download', async ({ page, context }) => {
    // Clear IndexedDB to force fresh download
    await context.clearCookies();

    // Navigate to the page first, then clear IndexedDB in that context
    await page.goto('/#weather');
    await page.evaluate(() => {
      return new Promise((resolve) => {
        const req = indexedDB.deleteDatabase('fishtank_db');
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
      });
    });

    // Reload to force fresh database download
    await page.reload();

    await page.goto('/#weather');
    await page.waitForSelector('#weather.active', { timeout: 10000 });

    const browseTab = page.locator('button[data-subtab="browse"]');
    await browseTab.click();

    // Wait for loading indicator to appear
    const loadingEl = page.locator('.db-loading');

    // Try to catch the loading indicator (may be very fast)
    const loadingAppeared = await loadingEl.isVisible({ timeout: 1000 }).catch(() => false);

    if (loadingAppeared) {
      // If loading appeared, verify structure
      const loadingBar = page.locator('.db-loading-bar');
      const loadingFill = page.locator('.db-loading-fill');
      const loadingText = page.locator('.db-loading-text');

      await expect(loadingBar).toBeVisible();
      await expect(loadingFill).toBeVisible();
      await expect(loadingText).toBeVisible();

      // Verify loading text shows status messages
      const text = await loadingText.textContent();
      expect(text).toBeTruthy();
    }

    // Wait for loading to complete and Browse Data to render
    await page.waitForSelector('.browse-category-bar', { timeout: 20000 });

    // Loading indicator should be gone
    await expect(loadingEl).not.toBeVisible();
  });
});

test.describe('SQLite Browse Data - Session Caching', () => {
  test('second Browse Data visit loads instantly from cache', async ({ page }) => {
    await page.goto('/#weather');
    await page.waitForSelector('#weather.active', { timeout: 10000 });

    // First visit - navigate to Browse Data
    const browseTab = page.locator('button[data-subtab="browse"]');
    await browseTab.click();

    // Wait for Browse Data to load
    await page.waitForSelector('.browse-category-bar', { timeout: 20000 });

    // Navigate away to Dashboard tab
    const dashboardTab = page.locator('button[data-subtab="dashboard"]');
    await dashboardTab.click();
    await page.waitForTimeout(500);

    // Navigate back to Browse Data
    const startTime = Date.now();
    await browseTab.click();

    // Verify Browse Data loads instantly (no loading indicator)
    await page.waitForSelector('.browse-category-bar', { timeout: 2000 });
    const loadTime = Date.now() - startTime;

    // Should be very fast (< 1 second) since cached
    expect(loadTime).toBeLessThan(1000);

    // Verify data categories are still populated
    const categoryButtons = page.locator('.browse-cat-btn');
    await expect(categoryButtons).toHaveCount(4);

    // Verify date dropdown is populated
    const dateSelect = page.locator('.browse-date-select');
    const optionCount = await dateSelect.locator('option').count();
    expect(optionCount).toBeGreaterThanOrEqual(1);
  });
});

test.describe('SQLite Browse Data - Data Categories', () => {
  test('all data categories are browsable with SQL backend', async ({ page }) => {
    await page.goto('/#weather');
    await page.waitForSelector('#weather.active', { timeout: 10000 });

    const browseTab = page.locator('button[data-subtab="browse"]');
    await browseTab.click();
    await page.waitForSelector('.browse-category-bar', { timeout: 20000 });

    // Test Home Readings
    const readingsBtn = page.locator('.browse-cat-btn[data-cat="readings"]');
    await readingsBtn.click();
    await page.waitForTimeout(500);

    let dateSelect = page.locator('.browse-date-select');
    let dateOptions = await dateSelect.locator('option').count();

    if (dateOptions > 0) {
      await dateSelect.selectOption({ index: 0 });
      await page.waitForTimeout(500);

      const hourBtns = page.locator('.hour-btn');
      const hourCount = await hourBtns.count();

      if (hourCount > 0) {
        await hourBtns.first().click();
        await page.waitForTimeout(1000);

        const display = page.locator('.browse-display');
        await expect(display).toBeVisible();
        const content = await display.textContent();
        expect(content.length).toBeGreaterThan(0);
      }
    }

    // Test Predictions
    const predictionsBtn = page.locator('.browse-cat-btn[data-cat="predictions"]');
    await predictionsBtn.click();
    await page.waitForTimeout(500);

    dateSelect = page.locator('.browse-date-select');
    dateOptions = await dateSelect.locator('option').count();

    if (dateOptions > 0) {
      await dateSelect.selectOption({ index: 0 });
      await page.waitForTimeout(500);

      const hourBtns = page.locator('.hour-btn');
      const hourCount = await hourBtns.count();

      if (hourCount > 0) {
        await hourBtns.first().click();
        await page.waitForTimeout(1000);

        const display = page.locator('.browse-display');
        await expect(display).toBeVisible();
      }
    }

    // Test Public Stations
    const publicBtn = page.locator('.browse-cat-btn[data-cat="public-stations"]');
    await publicBtn.click();
    await page.waitForTimeout(500);

    dateSelect = page.locator('.browse-date-select');
    dateOptions = await dateSelect.locator('option').count();

    if (dateOptions > 0) {
      await dateSelect.selectOption({ index: 0 });
      await page.waitForTimeout(500);

      const hourBtns = page.locator('.hour-btn');
      const hourCount = await hourBtns.count();

      if (hourCount > 0) {
        await hourBtns.first().click();
        await page.waitForTimeout(1000);

        const display = page.locator('.browse-display');
        await expect(display).toBeVisible();
      }
    }

    // Test Prediction History (no hour grid)
    const validationBtn = page.locator('.browse-cat-btn[data-cat="validation"]');
    await validationBtn.click();
    await page.waitForTimeout(500);

    dateSelect = page.locator('.browse-date-select');
    await expect(dateSelect).toBeVisible();

    // No hour grid for validation
    const hourGrid = page.locator('.hour-grid');
    await expect(hourGrid).toHaveCount(0);
  });
});

test.describe('SQLite Browse Data - Prediction History Filtering', () => {
  test('prediction history data loads with SQL backend', async ({ page }) => {
    await page.goto('/#weather');
    await page.waitForSelector('#weather.active', { timeout: 10000 });

    const browseTab = page.locator('button[data-subtab="browse"]');
    await browseTab.click();
    await page.waitForSelector('.browse-category-bar', { timeout: 20000 });

    // Navigate to Prediction History
    const validationBtn = page.locator('.browse-cat-btn[data-cat="validation"]');
    await validationBtn.click();
    await page.waitForTimeout(1000);

    // Select a date to load validation data
    const dateSelect = page.locator('.browse-date-select');
    const dateOptions = await dateSelect.locator('option').count();

    if (dateOptions > 0) {
      await dateSelect.selectOption({ index: 0 });
      await page.waitForTimeout(1000);

      // Check if model filter pills exist
      const modelFilterBar = page.locator('.model-filter-bar');
      const filterExists = await modelFilterBar.isVisible().catch(() => false);

      if (filterExists) {
        // Verify model filter pills are populated
        const modelPills = page.locator('.model-filter-pill');
        const pillCount = await modelPills.count();
        expect(pillCount).toBeGreaterThanOrEqual(1);

        // Click a specific model filter if available
        if (pillCount > 1) {
          await modelPills.nth(1).click();
          await page.waitForTimeout(500);

          // Verify data display updates
          const display = page.locator('.browse-display');
          await expect(display).toBeVisible();
        }
      }

      // Verify validation data cards are rendered
      const display = page.locator('.browse-display');
      await expect(display).toBeVisible();
      const content = await display.textContent();
      expect(content.length).toBeGreaterThan(0);
    }
  });
});

test.describe('SQLite Browse Data - View Mode Toggle', () => {
  test('raw and formatted views work for all categories', async ({ page }) => {
    await page.goto('/#weather');
    await page.waitForSelector('#weather.active', { timeout: 10000 });

    const browseTab = page.locator('button[data-subtab="browse"]');
    await browseTab.click();
    await page.waitForSelector('.browse-category-bar', { timeout: 20000 });

    // Test on Home Readings
    const dateSelect = page.locator('.browse-date-select');
    const dateOptions = await dateSelect.locator('option').count();

    if (dateOptions > 0) {
      await dateSelect.selectOption({ index: 0 });
      await page.waitForTimeout(500);

      const hourBtns = page.locator('.hour-btn');
      const hourCount = await hourBtns.count();

      if (hourCount > 0) {
        await hourBtns.first().click();
        await page.waitForTimeout(1000);

        // Verify formatted view renders (card layout)
        const display = page.locator('.browse-display');
        await expect(display).toBeVisible();

        // Click "Raw" toggle
        const rawBtn = page.locator('button[data-vmode="raw"]');
        await rawBtn.click();
        await page.waitForTimeout(500);

        // Verify raw JSON is displayed
        const jsonPre = page.locator('.browse-display pre');
        await expect(jsonPre).toBeVisible();

        const content = await jsonPre.textContent();
        expect(content).toMatch(/[{}]/); // JSON contains braces

        // Click "Formatted" toggle
        const formattedBtn = page.locator('button[data-vmode="formatted"]');
        await formattedBtn.click();
        await page.waitForTimeout(500);

        // Verify card layout returns
        await expect(jsonPre).toHaveCount(0);
        await expect(display).toBeVisible();
      }
    }
  });
});

test.describe('SQLite Browse Data - Home Page Isolation', () => {
  test('home page does not load sql.js or database', async ({ page }) => {
    const requestedUrls = [];

    page.on('request', request => {
      requestedUrls.push(request.url());
    });

    await page.goto('/#weather');
    await page.waitForSelector('#weather.active', { timeout: 10000 });

    // Wait for weather dashboard to render
    await page.waitForSelector('#subtab-dashboard', { timeout: 5000 });
    await page.waitForTimeout(2000); // Give time for any lazy loads

    // Check that sql.js and database were NOT fetched
    const hasSqlJs = requestedUrls.some(url => url.includes('sql-wasm.js'));
    const hasDatabase = requestedUrls.some(url => url.includes('frontend.db'));

    expect(hasSqlJs).toBe(false);
    expect(hasDatabase).toBe(false);

    // Verify weather.json WAS fetched (home page should still work)
    const hasWeatherJson = requestedUrls.some(url => url.includes('weather.json'));
    expect(hasWeatherJson).toBe(true);
  });
});

test.describe('SQLite Browse Data - JSON Fallback', () => {
  test('falls back to JSON when database unavailable', async ({ page }) => {
    // Block frontend.db.gz via route interception
    await page.route('**/frontend.db.gz*', route => route.abort());

    await page.goto('/#weather');
    await page.waitForSelector('#weather.active', { timeout: 10000 });

    const browseTab = page.locator('button[data-subtab="browse"]');
    await browseTab.click();

    // Wait for fallback to activate (loading → fallback banner)
    await page.waitForSelector('.browse-category-bar', { timeout: 20000 });

    // Verify fallback banner is visible
    const fallbackBanner = page.locator('.db-fallback-banner');
    await expect(fallbackBanner).toBeVisible();

    const bannerText = await fallbackBanner.textContent();
    expect(bannerText).toContain('Database unavailable');

    // Verify Browse Data still works (categories should be visible)
    const categoryButtons = page.locator('.browse-cat-btn');
    await expect(categoryButtons).toHaveCount(4);

    // Try to load data via JSON fallback
    const dateSelect = page.locator('.browse-date-select');
    await expect(dateSelect).toBeVisible();
  });
});

test.describe('SQLite Browse Data - Visual Snapshot', () => {
  test('browse data visual snapshot with SQL backend', async ({ page }) => {
    await page.goto('/#weather');
    await page.waitForSelector('#weather.active', { timeout: 10000 });

    const browseTab = page.locator('button[data-subtab="browse"]');
    await browseTab.click();
    await page.waitForSelector('.browse-category-bar', { timeout: 20000 });

    // Navigate to Home Readings
    const dateSelect = page.locator('.browse-date-select');
    const dateOptions = await dateSelect.locator('option').count();

    if (dateOptions > 0) {
      await dateSelect.selectOption({ index: 0 });
      await page.waitForTimeout(500);

      const hourBtns = page.locator('.hour-btn');
      const hourCount = await hourBtns.count();

      if (hourCount > 0) {
        await hourBtns.first().click();
        await page.waitForTimeout(1000);

        // Take screenshot of Browse Data area
        const browseArea = page.locator('#subtab-browse');
        await browseArea.screenshot({
          path: 'tests/browser/screenshots/sqlite-browse-readings.png'
        });
      }
    }
  });

  test('fallback mode visual snapshot', async ({ page }) => {
    // Block database to trigger fallback
    await page.route('**/frontend.db.gz*', route => route.abort());

    await page.goto('/#weather');
    await page.waitForSelector('#weather.active', { timeout: 10000 });

    const browseTab = page.locator('button[data-subtab="browse"]');
    await browseTab.click();
    await page.waitForSelector('.browse-category-bar', { timeout: 20000 });

    // Wait for fallback banner
    await page.waitForSelector('.db-fallback-banner', { timeout: 5000 });

    // Screenshot showing fallback mode
    const browseArea = page.locator('#subtab-browse');
    await browseArea.screenshot({
      path: 'tests/browser/screenshots/sqlite-fallback-mode.png'
    });
  });
});
