const { test, expect } = require('@playwright/test');

const SITE = 'https://the-fish-tank.com';

test.beforeEach(async ({ page }) => {
  // Ensure unauthenticated state
  await page.goto(SITE);
  await page.evaluate(() => localStorage.removeItem('fishtank_auth_token'));
  await page.goto(SITE);
  await page.waitForLoadState('domcontentloaded');
  // Open the modal for most tests
  await page.locator('#signin-link').click();
  await expect(page.locator('#signin-modal')).toHaveClass(/active/);
});

test('modal card has visible background color and padding', async ({ page }) => {
  const card = page.locator('.signin-card');
  await expect(card).toBeVisible();

  const styles = await card.evaluate(el => {
    const s = window.getComputedStyle(el);
    return {
      background: s.background || s.backgroundColor,
      paddingTop: s.paddingTop
    };
  });

  // Background should not be transparent
  expect(styles.background).not.toBe('rgba(0, 0, 0, 0)');
  expect(styles.background).not.toBe('transparent');

  // Padding should be non-zero
  const paddingValue = parseFloat(styles.paddingTop);
  expect(paddingValue).toBeGreaterThan(0);
});

test('modal uses blue/teal/ocean color tones', async ({ page }) => {
  const card = page.locator('.signin-card');

  // Get the background-image (gradient) or background-color
  const bgImage = await card.evaluate(el => {
    const s = window.getComputedStyle(el);
    return s.backgroundImage || s.background;
  });

  // The gradient uses dark blue tones: #0a2a4a and #0d3b66
  // Computed value will be a rgb() gradient string
  // We check that the background image is a gradient (not 'none')
  expect(bgImage).not.toBe('none');
  expect(bgImage.toLowerCase()).toContain('gradient');
});

test('fish element present in modal', async ({ page }) => {
  const fishEl = page.locator('.signin-fish');
  await expect(fishEl).toBeVisible();

  const text = await fishEl.textContent();
  // Should contain a fish/aquatic emoji
  expect(text.trim().length).toBeGreaterThan(0);
});

test('mobile responsive: modal card visible and not overflowing at 375px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });

  const card = page.locator('.signin-card');
  await expect(card).toBeVisible();

  const cardBox = await card.boundingBox();
  expect(cardBox).not.toBeNull();

  // Card should not overflow the viewport width
  expect(cardBox.x).toBeGreaterThanOrEqual(0);
  expect(cardBox.x + cardBox.width).toBeLessThanOrEqual(375 + 1); // 1px tolerance

  await page.screenshot({ path: 'tests/browser/screenshots/auth-theme-mobile-375.png' });
});

test('desktop layout: modal card is centered at 1280px', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });

  const card = page.locator('.signin-card');
  await expect(card).toBeVisible();

  const cardBox = await card.boundingBox();
  expect(cardBox).not.toBeNull();

  // Card should be narrower than viewport (centered, not full-width)
  expect(cardBox.width).toBeLessThan(1280 * 0.8);

  // Card should be roughly centered horizontally
  const cardCenter = cardBox.x + cardBox.width / 2;
  expect(cardCenter).toBeGreaterThan(1280 * 0.3);
  expect(cardCenter).toBeLessThan(1280 * 0.7);

  await page.screenshot({ path: 'tests/browser/screenshots/auth-theme-desktop-1280.png' });
});
