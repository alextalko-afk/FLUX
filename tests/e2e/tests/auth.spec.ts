import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

test.describe('Authentication', () => {
  test('should register a new user', async ({ page }) => {
    const email = `test-${randomUUID().slice(0, 8)}@example.com`;
    const password = 'Test1234!';
    const firstName = 'Test';
    const username = `testuser${randomUUID().slice(0, 6)}`;

    await page.goto('/register');

    await page.fill('input[type="email"]', email);
    await page.fill('input[placeholder*="First name"], input[name="firstName"]', firstName);
    await page.fill('input[placeholder*="Username"], input[name="username"]', username);
    await page.fill('input[type="password"]', password);

    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/verify|\/login/);
  });

  test('should login with valid credentials', async ({ page }) => {
    await page.goto('/login');

    await page.fill('input[type="email"]', process.env.TEST_USER_EMAIL || 'test@example.com');
    await page.fill('input[type="password"]', process.env.TEST_USER_PASSWORD || 'Test1234!');

    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/chats/);
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/login');

    await page.fill('input[type="email"]', 'invalid@example.com');
    await page.fill('input[type="password"]', 'wrongpassword');

    await page.click('button[type="submit"]');

    await expect(page.locator('text=Invalid')).toBeVisible({ timeout: 5000 });
  });

  test('should logout successfully', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', process.env.TEST_USER_EMAIL || 'test@example.com');
    await page.fill('input[type="password"]', process.env.TEST_USER_PASSWORD || 'Test1234!');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/chats/);

    await page.click('button:has-text("Log out"), button:has-text("Logout")');

    await expect(page).toHaveURL(/\/login/);
  });
});
