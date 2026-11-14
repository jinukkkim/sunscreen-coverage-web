import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  // Camera inference is CPU intensive; concurrent suites can trigger the real
  // 500ms stalled-video reset instead of exercising the intended motion flow.
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:5188', channel: 'chrome', headless: true, timezoneId: 'Asia/Seoul' },
  webServer: { command: 'node server/index.js --production', url: 'http://127.0.0.1:5188/api/health', env: { PORT: '5188', HOST: '127.0.0.1' }, reuseExistingServer: false },
});
