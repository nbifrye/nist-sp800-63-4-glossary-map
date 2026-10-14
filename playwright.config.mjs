import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', testMatch: '**/*.spec.ts', fullyParallel: true, timeout: 45000,
  expect: { timeout: 15000 },
  use: { baseURL: 'http://127.0.0.1:8765', trace: 'retain-on-failure' },
  webServer: { command: 'npm run preview', url: 'http://127.0.0.1:8765', reuseExistingServer: false },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'] } },
  ],
});
