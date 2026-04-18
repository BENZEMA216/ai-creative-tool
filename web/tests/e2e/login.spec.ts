import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const WEB_LOG = '/tmp/ai-creative-web-e2e.log';

/**
 * Read the most recent mock SMS code for this phone from web's stdout log.
 * Tries multiple times because the log may not be flushed yet.
 */
async function getMockCode(phone: string, attempts = 10): Promise<string> {
  const re = new RegExp(`\\[MOCK SMS\\] phone=${phone} code=(\\d{6})`);
  for (let i = 0; i < attempts; i++) {
    try {
      const buf = readFileSync(WEB_LOG, 'utf-8');
      // grab the LAST match (most recent)
      const matches = [...buf.matchAll(new RegExp(re.source, 'g'))];
      if (matches.length > 0) return matches[matches.length - 1][1];
    } catch {
      // log may not exist yet
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`mock code for ${phone} not found in ${WEB_LOG} after ${attempts} attempts`);
}

test('user can login with phone + code', async ({ page }) => {
  // Use a randomized phone to avoid rate-limit collisions across reruns
  const phone = `139${Math.floor(Math.random() * 100_000_000).toString().padStart(8, '0')}`;

  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'AI 智能创作' })).toBeVisible();

  await page.getByPlaceholder('请输入手机号').fill(phone);
  await page.getByRole('button', { name: '获取验证码' }).click();

  // Give web time to log the SMS
  await page.waitForTimeout(800);
  const code = await getMockCode(phone);

  await page.getByPlaceholder('请输入验证码').fill(code);
  await page.getByRole('button', { name: '登录 / 注册' }).click();

  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole('heading', { name: '工作台' })).toBeVisible();
  await expect(page.locator('header')).toContainText('AC');
});
