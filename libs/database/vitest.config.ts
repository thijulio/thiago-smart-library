import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { include: ['libs/database/src/**/*.spec.ts'], exclude: ['**/*.integration.spec.ts'] },
});
