import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /real-smoke\.spec\.ts/,
  timeout: 180_000,
  reporter: [['list']],
  use: {
    // Override via env: SMOKE_BASE_URL=http://your-server:3000
    baseURL: process.env.SMOKE_BASE_URL ?? 'http://localhost:3000',
    headless: true,
    trace: 'retain-on-failure',
    // Required for SharedArrayBuffer to be available in headless Chromium
    // when COOP+COEP headers are set — needed by ffmpeg.wasm multi-thread build
    launchOptions: {
      args: ['--enable-features=SharedArrayBuffer'],
    },
  },
  // No webServer — targets live remote server directly
});
