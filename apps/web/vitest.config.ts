import { defineConfig } from 'vitest/config';
export default defineConfig({
  resolve: {
    alias: {
      '@smart-library/domain': new URL('../../libs/domain/src/index.ts', import.meta.url).pathname,
    },
  },
  test: { include: ['apps/web/server/**/*.spec.ts'], exclude: ['**/*.integration.spec.ts'] },
});
