import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './src',
  preserveOutput: 'always',
  use: { baseURL: 'http://127.0.0.1:8888' },
  webServer: {
    command: 'pnpm dev:netlify',
    url: 'http://127.0.0.1:8888/api/health',
    reuseExistingServer: false,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'] } },
  ],
});
