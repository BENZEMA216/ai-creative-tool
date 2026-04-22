/**
 * Real smoke tests — hit a live server with actual yt-dlp + mock Whisper.
 *
 * Run with:
 *   SMOKE_BASE_URL=http://your-server:3000 \
 *     pnpm playwright test --config=playwright.real.config.ts --reporter=list
 *
 * (falls back to http://localhost:3000 if SMOKE_BASE_URL not set)
 *
 * yt-dlp processing may take 15-60s. yt-dlp may occasionally fail
 * on YouTube (bot detection); test failure is expected in that case.
 */
import { test, expect } from '@playwright/test';

// Serial so we don't hammer the 2C server with concurrent yt-dlp calls
test.describe.configure({ mode: 'serial' });

// Rick Astley — 3:32, stable widely-cached YouTube test target
const YT_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

// Mock Whisper returns this exact string (see web/src/lib/clients/whisper/mock.ts)
const MOCK_WHISPER_TEXT = 'mock 转写文本';

// ─── Test 1: Extract-text smoke ────────────────────────────────────────────────
// Dashboard → paste YT URL → click 提取文案 → server runs real yt-dlp to download
// audio → mock Whisper returns canned text → UI renders ResultPanel.
// Validates the full pipeline except the actual Whisper API call.
test('extract-text: real yt-dlp + mock whisper end-to-end', async ({ page }) => {
  test.setTimeout(180_000);

  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole('heading', { name: '工作台' })).toBeVisible();

  // 文案提取 tab is active by default — input placeholder says "https://www.douyin.com/..."
  await page.getByPlaceholder(/https/).fill(YT_URL);
  await page.getByRole('button', { name: /提取文案/ }).click();

  // Wait up to 120s for yt-dlp download + mock transcription + DB write
  // The ResultPanel renders the mock text verbatim
  await expect(
    page.locator(`text=${MOCK_WHISPER_TEXT}`)
  ).toBeVisible({ timeout: 120_000 });

  // Verify the metadata labels rendered in ResultPanel (grid with 视频标题 / 平台 / 时长)
  await expect(page.locator('text=视频标题').first()).toBeVisible();
  await expect(
    page.locator('text=youtube').or(page.locator('text=Youtube')).first()
  ).toBeVisible();

  // Copy button should be present
  await expect(page.getByRole('button', { name: /复制文案/ })).toBeVisible();
});

// ─── Test 2: Video-parse smoke ─────────────────────────────────────────────────
// Dashboard → 视频下载 tab → paste YT URL → click 解析视频 → server runs yt-dlp
// info extraction → UI renders VideoTrimmer with thumbnail, sliders, download button.
test('video-download: real yt-dlp parse returns thumbnail + trimmer UI', async ({ page }) => {
  test.setTimeout(180_000);

  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/dashboard/);

  // Switch to 视频下载 tab (button text includes the emoji + text)
  await page.getByRole('button', { name: /视频下载/ }).click();

  await page.getByPlaceholder(/https/).fill(YT_URL);
  await page.getByRole('button', { name: /解析视频/ }).click();

  // Wait for VideoTrimmer to mount — it shows the 片段选择 label
  await expect(page.locator('text=片段选择')).toBeVisible({ timeout: 120_000 });

  // Both range sliders (start + end) should be present
  const sliders = page.locator('input[type="range"]');
  await expect(sliders.first()).toBeVisible();
  await expect(sliders.nth(1)).toBeVisible();

  // Download button text is either "下载完整视频" or "下载片段 (...)"
  // Use exact pattern to avoid matching the "📥 视频下载" tab button
  await expect(page.getByRole('button', { name: /下载完整视频|下载片段/ })).toBeVisible();

  // Metadata labels in VideoTrimmer grid
  await expect(page.locator('text=视频标题').first()).toBeVisible();
  await expect(
    page.locator('text=youtube').or(page.locator('text=Youtube')).first()
  ).toBeVisible();
  await expect(page.locator('text=时长').first()).toBeVisible();
});

// ─── Test 3: SharedArrayBuffer / COOP+COEP headers ─────────────────────────────
// ffmpeg.wasm (multi-thread) requires SharedArrayBuffer, which Chrome only exposes
// when COOP: same-origin + COEP: credentialless headers are set.
// next.config.mjs sets these globally — verify they reach the browser.
test('ffmpeg.wasm: COOP+COEP headers set and SharedArrayBuffer available', async ({ page }) => {
  test.setTimeout(30_000);

  // Fetch /dashboard and inspect response headers
  const response = await page.goto('/dashboard');
  expect(response).not.toBeNull();

  const headers = response!.headers();

  // Next.js sets these in next.config.mjs headers() block
  expect(headers['cross-origin-opener-policy']).toBe('same-origin');
  expect(headers['cross-origin-embedder-policy']).toBe('credentialless');

  // Playwright's headless Chromium exposes SharedArrayBuffer when COOP/COEP are correct
  const hasSharedArrayBuffer = await page.evaluate(
    () => typeof SharedArrayBuffer !== 'undefined'
  );
  expect(hasSharedArrayBuffer).toBe(true);
});
