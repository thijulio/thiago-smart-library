import { defineConfig } from 'vitest/config';
export default defineConfig({
  resolve: {
    alias: {
      '@smart-library/domain': new URL('../domain/src/index.ts', import.meta.url).pathname,
      '@smart-library/database/testing': new URL('../database/test/harness.ts', import.meta.url)
        .pathname,
      '@smart-library/database': new URL('../database/src/index.ts', import.meta.url).pathname,
    },
  },
  test: { include: ['libs/importer/src/**/*.spec.ts'], exclude: ['**/*.integration.spec.ts'] },
});
