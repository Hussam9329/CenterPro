import { defineConfig, devices } from '@playwright/test';

/** A separately built Neon-mode client with mocked HTTP transport. Real SQL and
 * authorization are exercised in server integration tests, not these fixtures. */
export default defineConfig({
  testDir: './tests/remote', fullyParallel: false, workers: 1, timeout: 45_000,
  expect: { timeout: 10_000 }, reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3100', trace: 'retain-on-failure', screenshot: 'only-on-failure', reducedMotion: 'reduce',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, args: ['--no-sandbox', '--no-zygote', '--in-process-gpu', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] } : undefined,
  },
  projects: [{ name: 'remote-chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run start -- --port 3100', url: 'http://127.0.0.1:3100', reuseExistingServer: false, timeout: 120_000,
    // Dynamic routes must use the same adapter as the statically built pages.
    // Browser transport is mocked; these are deliberately non-production values.
    env: { DATABASE_URL: 'postgresql://test:test@localhost:5432/centerpro_transport_only', SESSION_SECRET: 'transport-tests-only-not-a-production-secret' },
  },
});
