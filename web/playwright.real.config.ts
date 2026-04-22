import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /real-smoke\.spec\.ts/,
  timeout: 180_000,
  reporter: [['list']],
  use: {
    baseURL: 'http://43.160.242.46:3000',
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
