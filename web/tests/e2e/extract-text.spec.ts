import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const WEB_LOG = '/tmp/ai-creative-web-e2e.log';

async function getMockCode(phone: string, attempts = 10): Promise<string> {
  const re = new RegExp(`\\[MOCK SMS\\] phone=${phone} code=(\\d{6})`, 'g');
  for (let i = 0; i < attempts; i++) {
    try {
      const buf = readFileSync(WEB_LOG, 'utf-8');
      const matches = [...buf.matchAll(re)];
      if (matches.length > 0) return matches[matches.length - 1][1];
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`code for ${phone} not found`);
}

test('user logs in, gets points, extracts text via mocked API', async ({ page }) => {
  // Mock the extract-text API to return a fake successful response
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

  // 1. Login
  const phone = `139${Math.floor(Math.random() * 100_000_000).toString().padStart(8, '0')}`;
  await page.goto('/login');
  await page.getByPlaceholder('请输入手机号').fill(phone);
  await page.getByRole('button', { name: '获取验证码' }).click();
  await page.waitForTimeout(800);
  const code = await getMockCode(phone);
  await page.getByPlaceholder('请输入验证码').fill(code);
  await page.getByRole('button', { name: '登录 / 注册' }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  // 2. Grant points via dev endpoint
  // Use page.evaluate to call fetch from within the browser context (shares cookies)
  const grantResult = await page.evaluate(async () => {
    const resp = await fetch('/api/dev/grant-points?amount=100', { method: 'POST' });
    const body = await resp.json();
    return { status: resp.status, body };
  });
  expect(grantResult.status).toBe(200);
  await page.reload();

  // 3. Already on the 文案提取 tab by default; verify
  await expect(page.getByRole('button', { name: /文案提取/ })).toBeVisible();

  // 4. Input URL + click extract
  await page.getByPlaceholder(/https/).fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await page.getByRole('button', { name: /提取文案/ }).click();

  // 5. Verify result panel shows
  await expect(page.locator('text=Mocked Video')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('text=mock 转写文本')).toBeVisible();
  await expect(page.getByRole('button', { name: /复制文案/ })).toBeVisible();
});
