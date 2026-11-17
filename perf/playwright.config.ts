import { defineConfig, devices } from '@playwright/test';
// Performance measurements only (not part of the quality gate):
//   npm run build && npx playwright test --config perf/playwright.config.ts
export default defineConfig({ testDir: '.', testMatch: /.*\.perf\.spec\.ts/, workers: 1, timeout: 300_000, reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:3000', ...devices['Pixel 7'] },
  webServer: { command: 'npm run start', url: 'http://127.0.0.1:3000', reuseExistingServer: true, timeout: 120_000 } });
