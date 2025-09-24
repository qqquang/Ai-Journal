import { defineConfig, devices } from '@playwright/test';

const port = process.env.PLAYWRIGHT_PORT ?? '3100';
const host = process.env.PLAYWRIGHT_HOST ?? '127.0.0.1';
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://${host}:${port}`;
const testEnvFlag = process.env.NEXT_PUBLIC_SUPABASE_TEST_STUB ?? '1';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['html', { outputFolder: 'playwright-report' }], ['list']] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry'
  },
  webServer: {
    command: `NEXT_PUBLIC_SUPABASE_TEST_STUB=${testEnvFlag} PORT=${port} npm run dev`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      NEXT_PUBLIC_SUPABASE_TEST_STUB: testEnvFlag,
      PLAYWRIGHT_PORT: port,
      PLAYWRIGHT_HOST: host,
    }
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] }
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] }
    }
  ]
});
