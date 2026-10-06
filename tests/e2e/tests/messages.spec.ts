import { test, expect } from '@playwright/test';

test.describe('Messages', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', process.env.TEST_USER_EMAIL || 'test@example.com');
    await page.fill('input[type="password"]', process.env.TEST_USER_PASSWORD || 'Test1234!');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/chats/);
  });

  test('should show empty state in chat without messages', async ({ page }) => {
    const chatItem = page.locator('[data-testid="chat-item"]').first();
    if (await chatItem.isVisible()) {
      await chatItem.click();
      await expect(page.locator('text=No messages yet')).toBeVisible({ timeout: 5000 });
    }
  });

  test('should display message input in chat view', async ({ page }) => {
    const chatItem = page.locator('[data-testid="chat-item"]').first();
    if (await chatItem.isVisible()) {
      await chatItem.click();
      await expect(page.locator('textarea, input[placeholder*="message"]')).toBeVisible();
    }
  });
});
