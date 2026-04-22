import { test, expect } from '@playwright/test';

test('user extracts text via mocked API', async ({ page }) => {
  // Mock the extract-text API
  await page.route('**/api/video/extract-text', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'success',
        data: {
          title: 'Mocked Video',
          platform: 'youtube',
          duration: 60,
          duration_text: '01:00',
          text: '这是一段 mock 转写文本，用于 E2E 测试验证 UI 渲染。',
          points_consumed: 10,
          points_remaining: 90,
        },
      }),
    });
  });

  // Visit → auto-anon → dashboard (已有 100 starter points)
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: '工作台' })).toBeVisible();

  // 文案提取 tab 默认激活
  await page.getByPlaceholder(/https/).fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await page.getByRole('button', { name: /提取文案/ }).click();

  // Verify result panel
  await expect(page.locator('text=Mocked Video')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('text=mock 转写文本')).toBeVisible();
  await expect(page.getByRole('button', { name: /复制文案/ })).toBeVisible();
});
