import { defineConfig } from 'vitest/config';
export default defineConfig({
  resolve: {
    alias: {
      '@smart-library/domain': new URL('../domain/src/index.ts', import.meta.url).pathname,
      '@smart-library/database/testing': new URL('./test/harness.ts', import.meta.url).pathname,
      '@smart-library/database': new URL('./src/index.ts', import.meta.url).pathname,
    },
  },
  test: {
    include: [
      'libs/database/test/**/*.integration.spec.ts',
      'libs/importer/test/**/*.integration.spec.ts',
    ],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
