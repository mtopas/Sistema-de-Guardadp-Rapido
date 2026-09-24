import { defineConfig, devices } from '@playwright/test';

/**
 * E2E test configuration for SGR.
 * Requires backend running on TEST_API_URL (default http://127.0.0.1:8765)
 * and frontend served at TEST_BASE_URL (default http://127.0.0.1:5173).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: process.env.TEST_BASE_URL || 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Firefox y WebKit son stretch; chromium es suficiente para MVP
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],

  webServer: undefined, // Backend levantado manualmente fuera de Playwright
  timeout: 90000, // 90s para tests con esperas largas
  expect: { timeout: 5000 },
});
