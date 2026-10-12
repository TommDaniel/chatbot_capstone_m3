import { defineConfig, devices } from '@playwright/test';

const browserChannel = process.env.E2E_BROWSER_CHANNEL ?? (process.platform==='win32'?'msedge':undefined);

export default defineConfig({
  testDir: './tests',
  testMatch: 'e2e.spec.ts',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    ['json', { outputFile: 'output/e2e-results.json' }],
  ],
  outputDir: 'test-results/e2e',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3001',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1440, height: 1000 },
    ...(browserChannel ? { channel: browserChannel } : {}),
  },
});
