import { test, expect } from '@playwright/test';

test('anon user can visit dashboard without any login', async ({ page }) => {
  await page.goto('/');
  // Should auto-redirect through anon-bootstrap and land on /dashboard
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole('heading', { name: '工作台' })).toBeVisible();
  // Navbar shows AC user ID and points
  await expect(page.locator('header')).toContainText('AC');
  await expect(page.locator('header')).toContainText('100');  // 100 starter points
});

test('anon user has own session (cookie-based)', async ({ page, context }) => {
  await page.goto('/dashboard');
  const firstUserId = await page.locator('header').textContent();
  expect(firstUserId).toMatch(/AC\d{8}/);

  // Clear cookies → new anon user
  await context.clearCookies();
  await page.goto('/dashboard');
  const secondUserId = await page.locator('header').textContent();
  expect(secondUserId).toMatch(/AC\d{8}/);
});
