import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/** Reusable: Login and navigate to player */
async function loginAndGoToPlayer(page: Page) {
  await page.goto('/');
  await page.locator('#access-key-input').fill('chaos123');
  await page.locator('#login-button').waitFor({ state: 'attached' });
  await page.locator('#login-button').click();
  await page.waitForURL('**/player', { timeout: 20000 });
  await expect(page.locator('text=QUEUE')).toBeVisible({ timeout: 20000 });
}

test.describe('ChaosRadio Core E2E', () => {
  test('首页显示登录界面', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/ChaosRadio/);
    await expect(page.locator('#access-key-input')).toBeVisible();
    await expect(page.locator('#login-button')).toBeVisible();
  });

  test('登录后进入播放器页面', async ({ page }) => {
    await loginAndGoToPlayer(page);
    await expect(page).toHaveURL(/\/player/);
  });

  test('播放器页面渲染核心元素', async ({ page }) => {
    await loginAndGoToPlayer(page);
    await expect(page.locator('text=QUEUE')).toBeVisible();
    await expect(page.locator('input[placeholder="Suggest a mood, theme, or genre..."]')).toBeVisible();
  });
});
