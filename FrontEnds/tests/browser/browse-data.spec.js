const { test, expect } = require('@playwright/test');

// Browse Data UI comprehensive tests
// Tests the 4-category Browse Data interface with model discovery, human-readable timestamps, and data rendering

test.describe('Browse Data - Category Navigation', () => {
  test('shows 4 category buttons', async ({ page }) => {
    await page.goto('/#weather');
    await page.waitForSelector('#weather.active', { timeout: 10000 });

    // Click the Browse Data subtab
    const browseTab = page.locator('button[data-subtab="browse"]');
    await browseTab.click();
    await page.waitForTimeout(1000);
    await page.waitForSelector('#subtab-browse', { timeout: 5000 });

    // Verify all 4 categories are present
    const categories = page.locator('.browse-cat-btn');
    await expect(categories).toHaveCount(4);

    // Verify category labels
    await expect(categories.nth(0)).toHaveText('Home Readings');
    await expect(categories.nth(1)).toHaveText('Predictions');
    await expect(categories.nth(2)).toHaveText('Public Stations');
    await expect(categories.nth(3)).toHaveText('Prediction History');
  });

  test('default category is Home Readings', async ({ page }) => {
    await page.goto('/#weather');
    await page.waitForSelector('#weather.active', { timeout: 10000 });

    const browseTab = page.locator('button[data-subtab="browse"]');
    await browseTab.click();
    await page.waitForTimeout(1000);
    await page.waitForSelector('#subtab-browse', { timeout: 5000 });

    // Home Readings should be active by default
    const homeReadings = page.locator('.browse-cat-btn[data-cat="readings"]');
    await expect(homeReadings).toHaveClass(/active/);
  });

  test('clicking category activates it and deactivates others', async ({ page }) => {
    await page.goto('/#weather');
    await page.waitForSelector('#weather.active', { timeout: 10000 });

    const browseTab = page.locator('button[data-subtab="browse"]');
    await browseTab.click();
    await page.waitForTimeout(1000);
    await page.waitForSelector('#subtab-browse', { timeout: 5000 });

    // Click Predictions
    const predictions = page.locator('.browse-cat-btn[data-cat="predictions"]');
    await predictions.click();
    await page.waitForTimeout(500); // Allow UI to update

    // Predictions should be active, others inactive
    await expect(predictions).toHaveClass(/active/);
    const homeReadings = page.locator('.browse-cat-btn[data-cat="readings"]');
    await expect(homeReadings).not.toHaveClass(/active/);
  });

  test('category switching resets date and hour selections', async ({ page }) => {
    await page.goto('/#weather');
    await page.waitForSelector('#weather.active', { timeout: 10000 });

    const browseTab = page.locator('button[data-subtab="browse"]');
    await browseTab.click();
    await page.waitForTimeout(1000);
    await page.waitForSelector('#subtab-browse', { timeout: 5000 });

    // Select a date and hour in Home Readings
    const dateSelect = page.locator('.browse-date-select');
    await dateSelect.selectOption({ index: 1 });
    await page.waitForTimeout(500);

    const hourBtn = page.locator('.hour-btn').first();
    await hourBtn.click();
    await page.waitForTimeout(500);

    // Switch to Predictions
    const predictions = page.locator('.browse-cat-btn[data-cat="predictions"]');
    await predictions.click();
    await page.waitForTimeout(500);

    // Hour selection should be reset (no active hour button)
    const activeHourBtn = page.locator('.hour-btn.active');
    await expect(activeHourBtn).toHaveCount(0);
  });
});

test.describe('Browse Data - Date Navigation', () => {
  test('Home Readings shows date dropdown', async ({ page }) => {
    await page.goto('/#weather');
    await page.waitForSelector('#weather.active', { timeout: 10000 });

    const browseTab = page.locator('button[data-subtab="browse"]');
    await browseTab.click();
    await page.waitForTimeout(1000);
    await page.waitForSelector('#subtab-browse', { timeout: 5000 });

    const dateSelect = page.locator('.browse-date-select');
    await expect(dateSelect).toBeVisible();

    // Should have at least one date option
    const options = dateSelect.locator('option');
    const count = await options.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('Predictions shows date dropdown', async ({ page }) => {
    await page.goto('/#weather');
    await page.waitForSelector('#weather.active', { timeout: 10000 });

    const browseTab = page.locator('button[data-subtab="browse"]');
    await browseTab.click();
    await page.waitForTimeout(1000);
    await page.waitForSelector('#subtab-browse', { timeout: 5000 });

    const predictions = page.locator('.browse-cat-btn[data-cat="predictions"]');
    await predictions.click();
    await page.waitForTimeout(500);

    const dateSelect = page.locator('.browse-date-select');
    await expect(dateSelect).toBeVisible();
  });

  test('Public Stations shows date dropdown', async ({ page }) => {
    await page.goto('/#weather');
    await page.waitForSelector('#weather.active', { timeout: 10000 });

    const browseTab = page.locator('button[data-subtab="browse"]');
    await browseTab.click();
    await page.waitForTimeout(1000);
    await page.waitForSelector('#subtab-browse', { timeout: 5000 });

    const publicStations = page.locator('.browse-cat-btn[data-cat="public-stations"]');
    await publicStations.click();
    await page.waitForTimeout(500);

    const dateSelect = page.locator('.browse-date-select');
    await expect(dateSelect).toBeVisible();
  });

  test('Prediction History shows date dropdown but no hour grid', async ({ page }) => {
    await page.goto('/#weather');
    await page.waitForSelector('#weather.active', { timeout: 10000 });

    const browseTab = page.locator('button[data-subtab="browse"]');
    await browseTab.click();
    await page.waitForTimeout(1000);
    await page.waitForSelector('#subtab-browse', { timeout: 5000 });

    const validation = page.locator('.browse-cat-btn[data-cat="validation"]');
    await validation.click();
    await page.waitForTimeout(500);

    const dateSelect = page.locator('.browse-date-select');
    await expect(dateSelect).toBeVisible();

    // No hour grid for validation
    const hourGrid = page.locator('.hour-grid');
    await expect(hourGrid).toHaveCount(0);
  });
});

test.describe('Browse Data - Human-Readable Timestamps', () => {
  test('hour pills show AM/PM format (not 6-digit raw timestamps)', async ({ page }) => {
    await page.goto('/#weather');
    await page.waitForSelector('#weather.active', { timeout: 10000 });

    const browseTab = page.locator('button[data-subtab="browse"]');
    await browseTab.click();
    await page.waitForTimeout(1000);
    await page.waitForSelector('#subtab-browse', { timeout: 5000 });

    // Select a date to load hour pills
    const dateSelect = page.locator('.browse-date-select');
    await dateSelect.selectOption({ index: 1 });
    await page.waitForTimeout(500);

    // Check that hour pills exist
    const hourBtns = page.locator('.hour-btn');
    const count = await hourBtns.count();
    expect(count).toBeGreaterThan(0);

    // Verify that NO hour pill contains a raw 6-digit timestamp
    for (let i = 0; i < count; i++) {
      const text = await hourBtns.nth(i).textContent();
      // Should NOT match pattern like "172016" or "015847"
      expect(text).not.toMatch(/^\d{6}$/);
      // Should contain : or AM/PM
      expect(text).toMatch(/:|AM|PM/);
    }
  });

  test('hour pills are clickable and highlight when selected', async ({ page }) => {
    await page.goto('/#weather');
    await page.waitForSelector('#weather.active', { timeout: 10000 });

    const browseTab = page.locator('button[data-subtab="browse"]');
    await browseTab.click();
    await page.waitForTimeout(1000);
    await page.waitForSelector('#subtab-browse', { timeout: 5000 });

    const dateSelect = page.locator('.browse-date-select');
    await dateSelect.selectOption({ index: 1 });
    await page.waitForTimeout(500);

    const firstHourBtn = page.locator('.hour-btn').first();
    await firstHourBtn.click();
    await page.waitForTimeout(500);

    // Should have active class
    await expect(firstHourBtn).toHaveClass(/active/);
  });
});

test.describe('Browse Data - Predictions Model Filter', () => {
  test('model filter pills appear when Predictions category is selected', async ({ page }) => {
    await page.goto('/#weather');
    await page.waitForSelector('#weather.active', { timeout: 10000 });

    const browseTab = page.locator('button[data-subtab="browse"]');
    await browseTab.click();
    await page.waitForTimeout(1000);
    await page.waitForSelector('#subtab-browse', { timeout: 5000 });

    const predictions = page.locator('.browse-cat-btn[data-cat="predictions"]');
    await predictions.click();
    await page.waitForTimeout(500);

    // Model filter bar should be visible
    const modelFilter = page.locator('.model-filter-bar');
    await expect(modelFilter).toBeVisible();
  });

  test('"All Models" pill is active by default', async ({ page }) => {
    await page.goto('/#weather');
    await page.waitForSelector('#weather.active', { timeout: 10000 });

    const browseTab = page.locator('button[data-subtab="browse"]');
    await browseTab.click();
    await page.waitForTimeout(1000);
    await page.waitForSelector('#subtab-browse', { timeout: 5000 });

    const predictions = page.locator('.browse-cat-btn[data-cat="predictions"]');
    await predictions.click();
    await page.waitForTimeout(500);

    const allModels = page.locator('.model-filter-pill[data-model=""]');
    await expect(allModels).toHaveClass(/active/);
    await expect(allModels).toHaveText('All Models');
  });

  test('at least one model type pill is visible (auto-discovered)', async ({ page }) => {
    await page.goto('/#weather');
    await page.waitForSelector('#weather.active', { timeout: 10000 });

    const browseTab = page.locator('button[data-subtab="browse"]');
    await browseTab.click();
    await page.waitForTimeout(1000);
    await page.waitForSelector('#subtab-browse', { timeout: 5000 });

    const predictions = page.locator('.browse-cat-btn[data-cat="predictions"]');
    await predictions.click();
    await page.waitForTimeout(500);

    // Should have at least 2 pills: "All Models" + at least one discovered model
    const modelPills = page.locator('.model-filter-pill');
    const count = await modelPills.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('clicking a model pill activates it', async ({ page }) => {
    await page.goto('/#weather');
    await page.waitForSelector('#weather.active', { timeout: 10000 });

    const browseTab = page.locator('button[data-subtab="browse"]');
    await browseTab.click();
    await page.waitForTimeout(1000);
    await page.waitForSelector('#subtab-browse', { timeout: 5000 });

    const predictions = page.locator('.browse-cat-btn[data-cat="predictions"]');
    await predictions.click();
    await page.waitForTimeout(500);

    // Click a specific model pill (not "All Models")
    const modelPills = page.locator('.model-filter-pill[data-model]');
    const specificModel = modelPills.nth(1); // First non-"All Models" pill
    await specificModel.click();
    await page.waitForTimeout(500);

    // Should have active class
    await expect(specificModel).toHaveClass(/active/);

    // "All Models" should no longer be active
    const allModels = page.locator('.model-filter-pill[data-model=""]');
    await expect(allModels).not.toHaveClass(/active/);
  });
});

test.describe('Browse Data - Public Stations', () => {
  test('selecting date and hour renders station data cards', async ({ page }) => {
    await page.goto('/#weather');
    await page.waitForSelector('#weather.active', { timeout: 10000 });

    const browseTab = page.locator('button[data-subtab="browse"]');
    await browseTab.click();
    await page.waitForTimeout(1000);
    await page.waitForSelector('#subtab-browse', { timeout: 5000 });

    const publicStations = page.locator('.browse-cat-btn[data-cat="public-stations"]');
    await publicStations.click();
    await page.waitForTimeout(1000);

    // Check if date select has options (public station data may not always be available)
    const dateSelect = page.locator('.browse-date-select');
    const optionCount = await dateSelect.locator('option').count();

    if (optionCount === 0) {
      // No public station data available - skip test
      test.skip();
    }

    // Select the first available date (index 0)
    await dateSelect.selectOption({ index: 0 });
    await page.waitForTimeout(500);

    // Select an hour
    const hourBtn = page.locator('.hour-btn').first();
    await hourBtn.click();
    await page.waitForTimeout(2000); // Allow data to load

    // Data cards should render
    const dataCards = page.locator('.browse-display .data-card');
    const count = await dataCards.count();
    expect(count).toBeGreaterThan(0);
  });

  test('station cards show station ID and temperature fields', async ({ page }) => {
    await page.goto('/#weather');
    await page.waitForSelector('#weather.active', { timeout: 10000 });

    const browseTab = page.locator('button[data-subtab="browse"]');
    await browseTab.click();
    await page.waitForTimeout(1000);
    await page.waitForSelector('#subtab-browse', { timeout: 5000 });

    const publicStations = page.locator('.browse-cat-btn[data-cat="public-stations"]');
    await publicStations.click();
    await page.waitForTimeout(1000);

    // Check if date select has options
    const dateSelect = page.locator('.browse-date-select');
    const optionCount = await dateSelect.locator('option').count();

    if (optionCount === 0) {
      test.skip();
    }

    await dateSelect.selectOption({ index: 0 });
    await page.waitForTimeout(500);

    const hourBtn = page.locator('.hour-btn').first();
    await hourBtn.click();
    await page.waitForTimeout(2000);

    // Check first data card (skip the header card, get the first station card)
    const dataCards = page.locator('.browse-display .data-card');
    const stationCard = dataCards.nth(1); // First station (0 is header)
    await expect(stationCard).toBeVisible();

    // Should contain station ID in h4
    const cardHeader = stationCard.locator('h4');
    await expect(cardHeader).toBeVisible();

    // Should contain data fields
    const dataFields = stationCard.locator('.data-field');
    const rowCount = await dataFields.count();
    expect(rowCount).toBeGreaterThan(0);
  });
});

test.describe('Browse Data - Validation History', () => {
  test('selecting date renders validation entries without hour grid', async ({ page }) => {
    await page.goto('/#weather');
    await page.waitForSelector('#weather.active', { timeout: 10000 });

    const browseTab = page.locator('button[data-subtab="browse"]');
    await browseTab.click();
    await page.waitForTimeout(1000);
    await page.waitForSelector('#subtab-browse', { timeout: 5000 });

    const validation = page.locator('.browse-cat-btn[data-cat="validation"]');
    await validation.click();
    await page.waitForTimeout(500);

    // Select a date
    const dateSelect = page.locator('.browse-date-select');
    await dateSelect.selectOption({ index: 1 });
    await page.waitForTimeout(1000);

    // Should NOT have hour grid
    const hourGrid = page.locator('.hour-grid');
    await expect(hourGrid).toHaveCount(0);

    // Should render validation entries
    const browseDisplay = page.locator('.browse-display');
    await expect(browseDisplay).toBeVisible();

    // Should have some content (validation cards or errors)
    const content = await browseDisplay.textContent();
    expect(content.length).toBeGreaterThan(0);
  });
});

test.describe('Browse Data - View Mode Toggle', () => {
  test('switch to Raw JSON shows JSON-formatted data', async ({ page }) => {
    await page.goto('/#weather');
    await page.waitForSelector('#weather.active', { timeout: 10000 });

    const browseTab = page.locator('button[data-subtab="browse"]');
    await browseTab.click();
    await page.waitForTimeout(1000);
    await page.waitForSelector('#subtab-browse', { timeout: 5000 });

    // Select date and hour to load data
    const dateSelect = page.locator('.browse-date-select');
    await dateSelect.selectOption({ index: 1 });
    await page.waitForTimeout(500);

    const hourBtn = page.locator('.hour-btn').first();
    await hourBtn.click();
    await page.waitForTimeout(2000);

    // Click Raw JSON toggle
    const rawJsonBtn = page.locator('button[data-vmode="raw"]');
    await rawJsonBtn.click();
    await page.waitForTimeout(500);

    // Should show <pre> tag with JSON
    const jsonPre = page.locator('.browse-display pre');
    await expect(jsonPre).toBeVisible();

    const content = await jsonPre.textContent();
    // JSON should contain curly braces
    expect(content).toMatch(/[{}]/);
  });

  test('switch back to Formatted shows card view', async ({ page }) => {
    await page.goto('/#weather');
    await page.waitForSelector('#weather.active', { timeout: 10000 });

    const browseTab = page.locator('button[data-subtab="browse"]');
    await browseTab.click();
    await page.waitForTimeout(1000);
    await page.waitForSelector('#subtab-browse', { timeout: 5000 });

    const dateSelect = page.locator('.browse-date-select');
    await dateSelect.selectOption({ index: 1 });
    await page.waitForTimeout(500);

    const hourBtn = page.locator('.hour-btn').first();
    await hourBtn.click();
    await page.waitForTimeout(2000);

    // Switch to Raw JSON
    const rawJsonBtn = page.locator('button[data-vmode="raw"]');
    await rawJsonBtn.click();
    await page.waitForTimeout(500);

    // Switch back to Formatted
    const formattedBtn = page.locator('button[data-vmode="formatted"]');
    await formattedBtn.click();
    await page.waitForTimeout(500);

    // Should show card view (not <pre>)
    const jsonPre = page.locator('.browse-display pre');
    await expect(jsonPre).toHaveCount(0);

    // Should have data cards or data fields
    const browseDisplay = page.locator('.browse-display');
    await expect(browseDisplay).toBeVisible();
  });
});

test.describe('Browse Data - Visual Baseline Screenshots', () => {
  test('capture Home Readings view', async ({ page }) => {
    await page.goto('/#weather');
    await page.waitForSelector('#weather.active', { timeout: 10000 });

    const browseTab = page.locator('button[data-subtab="browse"]');
    await browseTab.click();
    await page.waitForTimeout(1000);
    await page.waitForSelector('#subtab-browse', { timeout: 5000 });

    // Select date and hour
    const dateSelect = page.locator('.browse-date-select');
    await dateSelect.selectOption({ index: 1 });
    await page.waitForTimeout(500);

    const hourBtn = page.locator('.hour-btn').first();
    await hourBtn.click();
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'tests/browser/screenshots/browse-readings.png', fullPage: true });
  });

  test('capture Predictions view', async ({ page }) => {
    await page.goto('/#weather');
    await page.waitForSelector('#weather.active', { timeout: 10000 });

    const browseTab = page.locator('button[data-subtab="browse"]');
    await browseTab.click();
    await page.waitForTimeout(1000);
    await page.waitForSelector('#subtab-browse', { timeout: 5000 });

    const predictions = page.locator('.browse-cat-btn[data-cat="predictions"]');
    await predictions.click();
    await page.waitForTimeout(500);

    const dateSelect = page.locator('.browse-date-select');
    await dateSelect.selectOption({ index: 1 });
    await page.waitForTimeout(500);

    const hourBtn = page.locator('.hour-btn').first();
    await hourBtn.click();
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'tests/browser/screenshots/browse-predictions.png', fullPage: true });
  });

  test('capture Public Stations view', async ({ page }) => {
    await page.goto('/#weather');
    await page.waitForSelector('#weather.active', { timeout: 10000 });

    const browseTab = page.locator('button[data-subtab="browse"]');
    await browseTab.click();
    await page.waitForTimeout(1000);
    await page.waitForSelector('#subtab-browse', { timeout: 5000 });

    const publicStations = page.locator('.browse-cat-btn[data-cat="public-stations"]');
    await publicStations.click();
    await page.waitForTimeout(1000);

    // Check if date select has options
    const dateSelect = page.locator('.browse-date-select');
    const optionCount = await dateSelect.locator('option').count();

    if (optionCount === 0) {
      // No data - capture empty state
      await page.screenshot({ path: 'tests/browser/screenshots/browse-public-stations.png', fullPage: true });
      return;
    }

    await dateSelect.selectOption({ index: 0 });
    await page.waitForTimeout(500);

    const hourBtn = page.locator('.hour-btn').first();
    await hourBtn.click();
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'tests/browser/screenshots/browse-public-stations.png', fullPage: true });
  });

  test('capture Validation History view', async ({ page }) => {
    await page.goto('/#weather');
    await page.waitForSelector('#weather.active', { timeout: 10000 });

    const browseTab = page.locator('button[data-subtab="browse"]');
    await browseTab.click();
    await page.waitForTimeout(1000);
    await page.waitForSelector('#subtab-browse', { timeout: 5000 });

    const validation = page.locator('.browse-cat-btn[data-cat="validation"]');
    await validation.click();
    await page.waitForTimeout(500);

    const dateSelect = page.locator('.browse-date-select');
    await dateSelect.selectOption({ index: 1 });
    await page.waitForTimeout(1000);

    await page.screenshot({ path: 'tests/browser/screenshots/browse-validation.png', fullPage: true });
  });
});
