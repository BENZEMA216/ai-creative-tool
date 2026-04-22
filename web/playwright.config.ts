import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'DATABASE_URL="postgresql://ai_creative:dev_only_password@localhost:5432/ai_creative" REDIS_URL=redis://localhost:6379 JWT_SECRET=test-secret-min-32-chars-1234567890ab ADMIN_JWT_SECRET=admin-test-secret-min-32-chars-12345 MOCK_SMS=true MOCK_PAY=true WHISPER_MODE=mock STORAGE=local pnpm dev > /tmp/ai-creative-web-e2e.log 2>&1',
    url: 'http://localhost:3000/api/auth/me',
    reuseExistingServer: !process.env.CI,
    timeout: 90_000,
  },
});
