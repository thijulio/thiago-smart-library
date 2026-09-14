import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
export default defineConfig({
  resolve: { alias: { '@smart-library/domain': resolve('libs/domain/src') } },
  test: { include: ['libs/data-access/src/**/*.spec.ts'] },
});
