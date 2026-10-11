import { defineConfig } from 'vitest/config';
export default defineConfig({
  resolve: {
    alias: {
      '@smart-library/domain': new URL('../domain/src/index.ts', import.meta.url).pathname,
      '@smart-library/database': new URL('./src/index.ts', import.meta.url).pathname,
    },
  },
  test: {
    include: [
      'libs/database/src/**/*.spec.ts',
      'tools/database/import-cli.spec.ts',
      'tools/database/schema-reference/*.spec.ts',
    ],
    exclude: ['**/*.integration.spec.ts', '**/site.spec.ts'],
  },
});
