const { test, expect } = require('@playwright/test');

const SITE = 'https://the-fish-tank.com';

test.beforeEach(async ({ page }) => {
  // Clear auth state so tests start unauthenticated
  await page.goto(SITE);
  await page.evaluate(() => localStorage.removeItem('fishtank_auth_token'));
  await page.goto(SITE);
  await page.waitForLoadState('domcontentloaded');
});

test('modal hidden by default', async ({ page }) => {
  const modal = page.locator('#signin-modal');
  await expect(modal).not.toHaveClass(/active/);
  // Verify it is not visually visible (display: none without active class)
  const isVisible = await modal.evaluate(el => {
    const style = window.getComputedStyle(el);
    return style.display !== 'none';
  });
  expect(isVisible).toBe(false);
});

test('modal opens on sign-in link click', async ({ page }) => {
  const signinLink = page.locator('#signin-link');
  await expect(signinLink).toBeVisible();
  await signinLink.click();

  const modal = page.locator('#signin-modal');
  await expect(modal).toHaveClass(/active/);
  // Should now be displayed as flex
  const isVisible = await modal.evaluate(el => {
    const style = window.getComputedStyle(el);
    return style.display === 'flex';
  });
  expect(isVisible).toBe(true);
});

test('modal has username input', async ({ page }) => {
  await page.locator('#signin-link').click();
  const usernameInput = page.locator('#signin-username');
  await expect(usernameInput).toBeVisible();
  const inputType = await usernameInput.getAttribute('type');
  expect(inputType).toBe('text');
});

test('modal has password input', async ({ page }) => {
  await page.locator('#signin-link').click();
  const passwordInput = page.locator('#signin-password');
  await expect(passwordInput).toBeVisible();
  const inputType = await passwordInput.getAttribute('type');
  expect(inputType).toBe('password');
});

test('modal has submit button', async ({ page }) => {
  await page.locator('#signin-link').click();
  const submitBtn = page.locator('#signin-form button[type="submit"]');
  await expect(submitBtn).toBeVisible();
});

test('modal closes on X button click', async ({ page }) => {
  await page.locator('#signin-link').click();
  await expect(page.locator('#signin-modal')).toHaveClass(/active/);

  await page.locator('#signin-close').click();
  const modal = page.locator('#signin-modal');
  await expect(modal).not.toHaveClass(/active/);
});

test('modal closes on overlay click', async ({ page }) => {
  await page.locator('#signin-link').click();
  const modal = page.locator('#signin-modal');
  await expect(modal).toHaveClass(/active/);

  // Click the modal overlay (the modal element itself, not the card inside it)
  await modal.click({ position: { x: 10, y: 10 } });
  await expect(modal).not.toHaveClass(/active/);
});

test('screenshot of open sign-in modal', async ({ page }) => {
  await page.locator('#signin-link').click();
  await expect(page.locator('#signin-modal')).toHaveClass(/active/);
  await page.screenshot({ path: 'tests/browser/screenshots/auth-modal-open.png' });
});
