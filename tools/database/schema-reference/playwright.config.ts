import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: 'site.spec.ts',
  workers: 1,
  outputDir: '../../../test-results/schema-reference',
  use: { baseURL: 'http://127.0.0.1:8891/thiago-smart-library/' },
  webServer: {
    command: 'pnpm exec tsx tools/database/schema-reference/serve.ts',
    cwd: '../../..',
    url: 'http://127.0.0.1:8891/thiago-smart-library/',
    reuseExistingServer: false,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'] } },
  ],
});
