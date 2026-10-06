import { test, expect } from '@playwright/test';

test.describe('Chats', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', process.env.TEST_USER_EMAIL || 'test@example.com');
    await page.fill('input[type="password"]', process.env.TEST_USER_PASSWORD || 'Test1234!');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/chats/);
  });

  test('should display empty state when no chats', async ({ page }) => {
    await expect(page.locator('text=No chats yet')).toBeVisible({ timeout: 10000 });
  });

  test('should open settings page', async ({ page }) => {
    await page.click('a[href="/settings"], text=Settings');
    await expect(page).toHaveURL(/\/settings/);
    await expect(page.locator('text=Settings')).toBeVisible();
  });

  test('should navigate between settings sections', async ({ page }) => {
    await page.goto('/settings');
    await page.click('text=Appearance');
    await expect(page).toHaveURL(/\/settings\/appearance/);
  });
});
