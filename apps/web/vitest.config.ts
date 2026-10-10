import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { include: ['apps/web/server/**/*.spec.ts'], exclude: ['**/*.integration.spec.ts'] },
});
