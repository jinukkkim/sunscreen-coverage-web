import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:5188', channel: 'chrome', headless: true, timezoneId: 'Asia/Seoul' },
  webServer: { command: 'node server/index.js --production', url: 'http://127.0.0.1:5188/api/health', env: { PORT: '5188', HOST: '127.0.0.1' }, reuseExistingServer: false },
});
